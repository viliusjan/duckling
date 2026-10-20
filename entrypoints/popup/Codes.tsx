import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { RemoteError, send, type AppState, type CodesResult } from '@/lib/messages';
import { generateOTPs, type Code } from '@/lib/otp/code';
import type { Settings } from '@/lib/storage';
import { allTags, clockDrift, searchCodes, sortCodes } from '@/lib/ui/list';
import { matchesSite, siteFromUrl, type Site } from '@/lib/ui/site-match';
import { CodeCard } from './CodeCard';
import { Glyph } from './Glyph';
import { useIconIndex } from './ServiceIcon';

interface Props {
  state: Extract<AppState, { status: 'unlocked' }>;
  settings: Settings;
  dark: boolean;
  onState: (s: AppState) => void;
  onSettings: () => void;
}

const timeAgo = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

/** Ticks once per second, aligned to the clock, so codes flip exactly on time. */
function useSecondTick(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, 1000 - (Date.now() % 1000) + 5);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** The site in the current tab (needs activeTab, granted when you open the popup). */
function useCurrentSite(): Site | undefined {
  const [site, setSite] = useState<Site>();
  useEffect(() => {
    // Development builds only (removed from release builds): ?site=example.com
    // fakes the current tab, for screenshots and UI testing.
    if (import.meta.env.DEV) {
      const fake = new URLSearchParams(location.search).get('site');
      if (fake) return setSite(siteFromUrl(`https://${fake}`));
    }
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setSite(siteFromUrl(tab?.url)))
      .catch(() => undefined);
  }, []);
  return site;
}

export function Codes({ state, settings, dark, onState, onSettings }: Props) {
  const [result, setResult] = useState<CodesResult>();
  const [error, setError] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string>();
  const [active, setActive] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const [copied, setCopied] = useState<{ id: string; which: 'current' | 'next' }>();
  const [toast, setToast] = useState<string>();
  const now = useSecondTick();
  const site = useCurrentSite();
  const iconIndex = useIconIndex();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleError = async (e: unknown) => {
    // Locked or session expired: the background changed state; follow it.
    if (e instanceof RemoteError && ['locked', 'session-expired'].includes(e.error.code)) {
      onState(await send('getState', {}));
    } else {
      setError(e instanceof RemoteError ? e.message : 'Could not load your codes.');
    }
  };

  const sync = () => {
    setSyncing(true);
    send('sync', {})
      .then(setResult, handleError)
      .finally(() => setSyncing(false));
  };

  useEffect(() => {
    // Saved codes show instantly; the sync runs in the background.
    send('getCodes', {}).then(setResult, handleError).finally(sync);
    // Popups sometimes ignore autofocus on open; focus explicitly.
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  const tags = useMemo(() => (result ? allTags(result.codes) : []), [result]);

  const { siteCodes, otherCodes, ordered } = useMemo(() => {
    if (!result) return { siteCodes: [] as Code[], otherCodes: [] as Code[], ordered: [] as Code[] };
    const sorted = sortCodes(result.codes, settings.sortBy, result.usage);
    const tagged = tag ? sorted.filter((c) => c.codeDisplay?.tags?.includes(tag)) : sorted;
    const found = searchCodes(tagged, query);
    const forSite = site ? found.filter((c) => matchesSite(c, site)) : [];
    const rest = found.filter((c) => !forSite.includes(c));
    return { siteCodes: forSite, otherCodes: rest, ordered: [...forSite, ...rest] };
  }, [result, settings.sortBy, tag, query, site]);

  // Keep the selection valid and visible.
  useEffect(() => setActive(0), [query, tag, site]);
  useEffect(() => {
    listRef.current?.querySelector('.card.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const copy = async (code: Code, which: 'current' | 'next') => {
    if (!result) return;
    const otp = generateOTPs(code, result.timeOffset)[which === 'next' ? 1 : 0];
    try {
      await navigator.clipboard.writeText(otp);
    } catch {
      setToast("Couldn't copy. Try clicking the code again.");
      return;
    }
    setCopied({ id: code.id, which });
    setTimeout(() => setCopied((c) => (c?.id === code.id ? undefined : c)), 1200);
    void send('copied', { id: code.id }).catch(() => undefined);
    if (settings.closeOnCopy) {
      // Let the "Copied" confirmation register, then get out of the way.
      setTimeout(() => window.close(), 450);
    } else {
      setToast(settings.clearClipboard ? 'Copied · clipboard clears in 30 s' : 'Copied');
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const max = ordered.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setNavigated(true);
      setActive((i) => Math.min(max, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setNavigated(true);
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const code = ordered[active];
      if (code) void copy(code, e.shiftKey ? 'next' : 'current');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) setQuery('');
      else window.close();
    }
  };

  const drift = result ? clockDrift(result.timeOffset) : undefined;
  const cardProps = (code: Code, i: number) => ({
    code,
    domId: `code-${i}`,
    offset: result?.timeOffset ?? 0,
    now,
    active: i === active,
    reveal: i === active && navigated,
    copied: copied?.id === code.id ? copied.which : undefined,
    masked: settings.hideCodes,
    compact: settings.compact,
    showNext: settings.showNextCode,
    dark,
    index: iconIndex,
    onCopy: copy,
    onHover: () => setActive(i),
  });

  return (
    <main class={`codes${settings.compact ? ' compact' : ''}`}>
      <div class="topbar">
        <div class="search">
          <Glyph name="search" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search codes"
            aria-label="Search codes"
            aria-controls="code-list"
            aria-activedescendant={ordered.length ? `code-${active}` : undefined}
            autoComplete="off"
            spellcheck={false}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
          {query && (
            <button type="button" class="icon-btn clear" aria-label="Clear search" onClick={() => setQuery('')}>
              <Glyph name="x" />
            </button>
          )}
        </div>
        <button type="button" class="icon-btn" title="Sync now" aria-label="Sync now" disabled={syncing} onClick={sync}>
          <Glyph name="refresh" class={syncing ? 'spin' : ''} />
        </button>
        <button type="button" class="icon-btn" title="Settings" aria-label="Settings" onClick={onSettings}>
          <Glyph name="settings" />
        </button>
      </div>

      {tags.length > 0 && (
        <div class="tags" role="group" aria-label="Filter by tag">
          <button type="button" class="chip" aria-pressed={!tag} onClick={() => setTag(undefined)}>
            All
          </button>
          {tags.map((t) => (
            <button key={t} type="button" class="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? undefined : t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {(error || result?.syncError || !!result?.unreadable || drift) && (
        <div class="notices">
          {error && <p class="banner error">{error}</p>}
          {result?.syncError && <p class="banner warn">Showing saved codes. {result.syncError.message}</p>}
          {!!result?.unreadable && (
            <p class="banner warn">
              {result.unreadable} {result.unreadable === 1 ? 'entry' : 'entries'} couldn't be read.
            </p>
          )}
          {drift && <p class="banner warn">{drift}</p>}
        </div>
      )}

      <div class="scroll" ref={listRef} id="code-list" role="listbox" aria-label="Your codes">
        {!result && !error && (
          <div class="empty">
            <span class="spinner" />
          </div>
        )}
        {result && result.codes.length === 0 && (
          <div class="empty">
            <strong>No codes yet</strong>
            <span>Add codes in the Ente Auth app. They'll show up here after a sync.</span>
          </div>
        )}
        {result && result.codes.length > 0 && ordered.length === 0 && (
          <div class="empty">
            <strong>No matches</strong>
            <span>
              Nothing matches “{query}”{tag ? ` in ${tag}` : ''}.
            </span>
          </div>
        )}
        {siteCodes.length > 0 && (
          <>
            <div class="section">
              <Glyph name="globe" />
              This site · {site?.host}
            </div>
            <div class="list">
              {siteCodes.map((c, i) => (
                <CodeCard key={c.id} {...cardProps(c, i)} />
              ))}
            </div>
            {otherCodes.length > 0 && <div class="section">All codes</div>}
          </>
        )}
        {otherCodes.length > 0 && (
          <div class="list">
            {otherCodes.map((c, i) => (
              <CodeCard key={c.id} {...cardProps(c, i + siteCodes.length)} />
            ))}
          </div>
        )}
      </div>

      <div class="bottombar">
        <span class="small muted" title={state.email}>
          {syncing ? 'Syncing…' : result?.lastSync ? `Synced ${timeAgo(result.lastSync)}` : ''}
        </span>
        <button type="button" class="lock" onClick={() => void send('lock', {}).then(onState)}>
          <Glyph name="lock" />
          Lock
        </button>
      </div>
      <div class="sr-only" role="status" aria-live="polite">
        {copied ? 'Copied' : ''}
      </div>
      {toast && <div class="toast">{toast}</div>}
    </main>
  );
}
