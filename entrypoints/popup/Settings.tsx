import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { browser } from 'wxt/browser';
import { DEFAULT_API_ORIGIN } from '@/lib/ente/api';
import { send, type AppState, type SettingsView } from '@/lib/messages';
import type { Settings as SettingsData, SortBy, Theme } from '@/lib/storage';
import { SecretInput } from './Fields';
import { Glyph } from './Glyph';
import { useAction } from './useAction';

interface Props {
  view: SettingsView;
  onView: (v: SettingsView) => void;
  onBack: () => void;
  onState: (s: AppState) => void;
}

const AUTOLOCK: [number, string][] = [
  [1, '1 minute'],
  [5, '5 minutes'],
  [15, '15 minutes'],
  [30, '30 minutes'],
  [60, '1 hour'],
  [240, '4 hours'],
  [0, 'When Firefox closes'],
];

const SORTS: [SortBy, string][] = [
  ['issuer', 'Name'],
  ['account', 'Account'],
  ['manual', 'As in Ente Auth'],
  ['mostUsed', 'Most used'],
  ['recent', 'Recently used'],
];

const THEMES: [Theme, string][] = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export function Settings({ view, onView, onBack, onState }: Props) {
  const { error, run } = useAction();
  const s = view.settings;
  const update = (change: Partial<SettingsData>) => void run(async () => onView(await send('updateSettings', change)));

  return (
    <main class="settings">
      <header class="settings-header">
        <button type="button" class="icon-btn" aria-label="Back to codes" title="Back" onClick={onBack} autoFocus>
          <Glyph name="back" />
        </button>
        <h1>Settings</h1>
      </header>
      {error && <p class="banner error">{error}</p>}

      <section>
        <h2>Appearance</h2>
        <div class="group">
          <Row label="Theme">
            <div class="segmented" role="group" aria-label="Theme">
              {THEMES.map(([v, label]) => (
                <button key={v} type="button" aria-pressed={s.theme === v} onClick={() => update({ theme: v })}>
                  {label}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Sort codes by">
            <select value={s.sortBy} onChange={(e) => update({ sortBy: e.currentTarget.value as SortBy })}>
              {SORTS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
          <Switch label="Compact list" checked={s.compact} onChange={(v) => update({ compact: v })} />
          <Switch label="Show next code" checked={s.showNextCode} onChange={(v) => update({ showNextCode: v })} />
          <Switch
            label="Hide codes"
            hint="Shows •••••• until you hover a code. Handy when sharing your screen."
            checked={s.hideCodes}
            onChange={(v) => update({ hideCodes: v })}
          />
        </div>
      </section>

      <section>
        <h2>Copying</h2>
        <div class="group">
          <Switch
            label="Close Duckling after copying"
            hint="So you can paste right away."
            checked={s.closeOnCopy}
            onChange={(v) => update({ closeOnCopy: v })}
          />
          <Switch
            label="Clear clipboard after 30 s"
            hint="Clears whatever is on the clipboard at that moment."
            checked={s.clearClipboard}
            onChange={(v) => update({ clearClipboard: v })}
          />
        </div>
      </section>

      <section>
        <h2>Security</h2>
        <div class="group">
          <Row label="Lock after inactivity">
            <select value={s.autoLockMinutes} onChange={(e) => update({ autoLockMinutes: Number(e.currentTarget.value) })}>
              {AUTOLOCK.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
          <Switch label="Lock when my computer locks" checked={s.lockOnSystemLock} onChange={(v) => update({ lockOnSystemLock: v })} />
        </div>
        <PinSection view={view} onView={onView} />
      </section>

      <Shortcut />

      <section>
        <h2>Account</h2>
        <div class="group">
          <Row label={view.email} hint={view.apiOrigin !== DEFAULT_API_ORIGIN ? view.apiOrigin : 'Ente'}>
            <button type="button" class="link" onClick={() => void send('logout', {}).then(onState)}>
              Log out
            </button>
          </Row>
        </div>
      </section>

      <p class="small faint center">
        Duckling {browser.runtime.getManifest().version} · unofficial, not affiliated with Ente
      </p>
    </main>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <div class="setting">
      <div class="setting-label">
        <span>{label}</span>
        {hint && <span class="small muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Switch(p: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="setting">
      <div class="setting-label">
        <span>{p.label}</span>
        {p.hint && <span class="small muted">{p.hint}</span>}
      </div>
      <input type="checkbox" role="switch" class="switch" checked={p.checked} onChange={(e) => p.onChange(e.currentTarget.checked)} />
    </label>
  );
}

/** Shows the current "open Duckling" shortcut; it can be changed in Firefox's add-on settings. */
function Shortcut() {
  const [shortcut, setShortcut] = useState<string>();
  useEffect(() => {
    browser.commands
      .getAll()
      .then((all) => setShortcut(all.find((c) => c.name === '_execute_action')?.shortcut || ''))
      .catch(() => setShortcut(''));
  }, []);
  const commands = browser.commands as typeof browser.commands & { openShortcutSettings?: () => Promise<void> };
  return (
    <section>
      <h2>Keyboard</h2>
      <div class="group">
        <Row label="Open Duckling" hint="Then type to search, ↑↓ to choose, Enter to copy.">
          {shortcut ? <kbd>{shortcut}</kbd> : <span class="small muted">Not set</span>}
        </Row>
        {commands.openShortcutSettings && (
          <Row label="Change shortcut">
            <button type="button" class="link" onClick={() => void commands.openShortcutSettings?.()}>
              Open
            </button>
          </Row>
        )}
      </div>
    </section>
  );
}

function PinSection({ view, onView }: { view: SettingsView; onView: (v: SettingsView) => void }) {
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<{ pin?: string; confirm?: string }>({});
  const { busy, error, run } = useAction();

  const save = (e: Event) => {
    e.preventDefault();
    if (pin.length < 4) return setFieldError({ pin: 'Use at least 4 digits.' });
    if (pin !== confirm) return setFieldError({ confirm: "The PINs don't match." });
    setFieldError({});
    void run(async () => {
      onView(await send('setPin', { pin }));
      setEditing(false);
      setPin('');
      setConfirm('');
    });
  };

  if (editing) {
    return (
      <form class="pin-form" onSubmit={save} noValidate>
        <SecretInput label="New PIN" numeric value={pin} onInput={setPin} autocomplete="new-password" autoFocus error={fieldError.pin} />
        <SecretInput label="Repeat PIN" numeric value={confirm} onInput={setConfirm} autocomplete="new-password" error={fieldError.confirm} />
        <p class="hint">
          At least 4 digits. After Firefox restarts, or after 5 wrong tries, your password is needed again.
        </p>
        {error && <p class="banner error">{error}</p>}
        <div class="row">
          <button type="button" class="link" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="submit" class="primary" style={{ height: 36, padding: '0 16px' }} disabled={busy}>
            {busy ? <span class="spinner" /> : 'Save PIN'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div class="group" style={{ marginTop: 2 }}>
      <Row
        label="Unlock with PIN"
        hint={view.canSetPin || view.pinEnabled ? 'Faster than typing your password.' : 'Add a code in Ente Auth first.'}
      >
        {view.pinEnabled ? (
          <button type="button" class="link" onClick={() => void run(async () => onView(await send('removePin', {})))}>
            Turn off
          </button>
        ) : (
          <button type="button" class="link" disabled={!view.canSetPin} onClick={() => setEditing(true)}>
            Set PIN
          </button>
        )}
      </Row>
      {error && <p class="banner error">{error}</p>}
    </div>
  );
}
