import { useEffect, useMemo, useState } from 'preact/hooks';
import { RemoteError, send, type AppState, type CodesResult } from '@/lib/messages';
import { generateOTPs, msRemaining, type Code } from '@/lib/otp/code';

interface Props {
  state: Extract<AppState, { status: 'unlocked' }>;
  onState: (s: AppState) => void;
  onSettings: () => void;
}

/** "123456" -> "123 456", "12345678" -> "1234 5678"; Steam (5 letters) as is. */
const formatOTP = (otp: string) => {
  if (otp.length === 6) return `${otp.slice(0, 3)} ${otp.slice(3)}`;
  if (otp.length === 8) return `${otp.slice(0, 4)} ${otp.slice(4)}`;
  return otp;
};

const timeAgo = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
};

export function Codes({ state, onState, onSettings }: Props) {
  const [result, setResult] = useState<CodesResult>();
  const [error, setError] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(Date.now());

  const handleError = async (e: unknown) => {
    // Locked or session expired: the background changed state; follow it.
    if (e instanceof RemoteError && ['locked', 'session-expired'].includes(e.error.code)) {
      onState(await send('getState', {}));
    } else {
      setError(e instanceof RemoteError ? e.message : 'Could not load your codes.');
    }
  };

  const refresh = () => {
    setSyncing(true);
    send('sync', {})
      .then(setResult, handleError)
      .finally(() => setSyncing(false));
  };

  useEffect(() => {
    // Show cached codes instantly, then sync in the background.
    send('getCodes', {}).then(setResult, handleError).finally(refresh);
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!result) return [];
    if (!q) return result.codes;
    return result.codes.filter((c) =>
      [c.issuer, c.account, c.codeDisplay?.note].some((f) => f?.toLowerCase().includes(q)),
    );
  }, [result, query]);

  const copyFirst = (e: Event) => {
    e.preventDefault();
    if (visible[0] && result) void copy(generateOTPs(visible[0], result.timeOffset)[0]);
  };

  return (
    <main class="codes">
      <form class="toolbar" onSubmit={copyFirst}>
        <input
          type="search"
          placeholder="Search"
          aria-label="Search codes"
          autoFocus
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <button type="button" class="icon" title="Sync now" aria-label="Sync now" disabled={syncing} onClick={refresh}>
          <span class={syncing ? 'spin' : ''}>⟳</span>
        </button>
        <button type="button" class="icon" title="Settings" aria-label="Settings" onClick={onSettings}>
          ⚙
        </button>
      </form>

      {error && <p class="banner error">{error}</p>}
      {result?.syncError && <p class="banner warn">Showing saved codes. {result.syncError.message}</p>}
      {!!result?.unreadable && (
        <p class="banner warn">
          {result.unreadable} {result.unreadable === 1 ? 'entry' : 'entries'} couldn't be read.
        </p>
      )}

      {!result && !error && <p class="muted center">Loading codes…</p>}
      {result && result.codes.length === 0 && (
        <p class="muted center">No codes yet. Add them in the Ente Auth app, then sync.</p>
      )}
      {result && result.codes.length > 0 && visible.length === 0 && <p class="muted center">No matches.</p>}

      <ul class="list">
        {result && visible.map((code) => <CodeRow key={code.id} code={code} offset={result.timeOffset} now={now} />)}
      </ul>

      <footer>
        <span class="muted small" title={state.email}>
          {result?.lastSync ? `Synced ${timeAgo(result.lastSync)}` : syncing ? 'Syncing…' : ''}
        </span>
        <button type="button" class="link small" onClick={() => void send('lock', {}).then(onState)}>
          🔒 Lock now
        </button>
      </footer>
    </main>
  );
}

/** Copy, then let the background schedule the 30 s clipboard clear (it outlives the popup). */
const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    await send('copied', {});
  } catch {
    // Copy failed or background busy; nothing else to do.
  }
};

function CodeRow({ code, offset, now }: { code: Code; offset: number; now: number }) {
  const [copied, setCopied] = useState(false);
  let otp: string, next: string;
  try {
    [otp, next] = generateOTPs(code, offset, now);
  } catch {
    return (
      <li class="code-row invalid">
        <div class="label">
          <span class="issuer">{code.issuer || 'Unknown'}</span>
          <span class="muted small">Invalid secret</span>
        </div>
      </li>
    );
  }
  const remaining = msRemaining(code, offset, now);
  const fraction = remaining / (code.period * 1000);

  const onClick = async () => {
    await copy(otp);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <li>
      <button type="button" class="code-row" onClick={onClick} title="Click to copy">
        <div class="label">
          <span class="issuer">{code.issuer || 'Unknown'}</span>
          {code.account && code.account !== code.issuer && <span class="muted small account">{code.account}</span>}
        </div>
        <div class="otp">
          <span class={`value${copied ? ' copied' : ''}`}>{copied ? 'Copied' : formatOTP(otp)}</span>
          {code.type !== 'hotp' && <span class="muted small next">next {formatOTP(next)}</span>}
        </div>
        {code.type !== 'hotp' && <Ring fraction={fraction} urgent={remaining < 5000} />}
      </button>
    </li>
  );
}

function Ring({ fraction, urgent }: { fraction: number; urgent: boolean }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg class={`ring${urgent ? ' urgent' : ''}`} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r={r} class="track" />
      <circle cx="10" cy="10" r={r} class="fill" stroke-dasharray={c} stroke-dashoffset={c * (1 - fraction)} />
    </svg>
  );
}
