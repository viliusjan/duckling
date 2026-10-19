import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_API_ORIGIN } from '@/lib/ente/api';
import { send, type AppState, type SettingsView } from '@/lib/messages';
import type { Settings as SettingsData } from '@/lib/storage';
import { useAction } from './useAction';

interface Props {
  onBack: () => void;
  onState: (s: AppState) => void;
}

const AUTOLOCK_LABELS: [number, string][] = [
  [1, '1 minute'],
  [5, '5 minutes'],
  [15, '15 minutes'],
  [30, '30 minutes'],
  [60, '1 hour'],
  [240, '4 hours'],
  [0, 'Only when Firefox closes'],
];

export function Settings({ onBack, onState }: Props) {
  const [view, setView] = useState<SettingsView>();
  const { error, run } = useAction();

  useEffect(() => {
    void run(async () => setView(await send('getSettings', {})));
  }, []);

  const update = (change: Partial<SettingsData>) => void run(async () => setView(await send('updateSettings', change)));

  return (
    <main class="auth settings">
      <header class="settings-header">
        <button type="button" class="icon" aria-label="Back" title="Back" onClick={onBack}>
          ←
        </button>
        <h1>Settings</h1>
      </header>
      {error && <p class="banner error">{error}</p>}
      {view && (
        <>
          <section>
            <h2>Security</h2>
            <label>
              Lock after inactivity
              <select
                value={view.settings.autoLockMinutes}
                onChange={(e) => update({ autoLockMinutes: Number(e.currentTarget.value) })}
              >
                {AUTOLOCK_LABELS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Toggle
              label="Lock when my computer locks"
              checked={view.settings.lockOnSystemLock}
              onChange={(v) => update({ lockOnSystemLock: v })}
            />
            <Toggle
              label="Clear clipboard 30 s after copying"
              hint="Clears whatever is on the clipboard at that moment."
              checked={view.settings.clearClipboard}
              onChange={(v) => update({ clearClipboard: v })}
            />
          </section>
          <PinSection view={view} onView={setView} />
          <section>
            <h2>Account</h2>
            <p class="small">
              {view.email}
              {view.apiOrigin !== DEFAULT_API_ORIGIN && <span class="muted"> · {view.apiOrigin}</span>}
            </p>
            <button type="button" class="link" onClick={() => void send('logout', {}).then(onState)}>
              Log out
            </button>
          </section>
          <p class="muted small center">Duckling is unofficial and not affiliated with Ente.</p>
        </>
      )}
    </main>
  );
}

function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.currentTarget.checked)} />
      <span>
        {props.label}
        {props.hint && <span class="muted small block">{props.hint}</span>}
      </span>
    </label>
  );
}

function PinSection({ view, onView }: { view: SettingsView; onView: (v: SettingsView) => void }) {
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, setError, run } = useAction();

  const save = (e: Event) => {
    e.preventDefault();
    if (pin !== confirm) return setError("The PINs don't match.");
    void run(async () => {
      onView(await send('setPin', { pin }));
      setEditing(false);
      setPin('');
      setConfirm('');
    });
  };

  return (
    <section>
      <h2>PIN unlock</h2>
      <p class="muted small">
        Unlock with a short PIN instead of your password. After Firefox restarts, or after 5 wrong PINs, your password
        is needed again.
      </p>
      {view.pinEnabled && !editing && (
        <div class="row">
          <span class="small">PIN is on</span>
          <button type="button" class="link small" onClick={() => void run(async () => onView(await send('removePin', {})))}>
            Turn off
          </button>
        </div>
      )}
      {!view.pinEnabled && !editing && (
        <button
          type="button"
          class="link"
          disabled={!view.canSetPin}
          title={view.canSetPin ? undefined : 'Add a code in Ente Auth first'}
          onClick={() => setEditing(true)}
        >
          Set a PIN
        </button>
      )}
      {editing && (
        <form onSubmit={save}>
          <input
            class="code-input"
            type="password"
            inputMode="numeric"
            autocomplete="new-password"
            placeholder="New PIN"
            aria-label="New PIN"
            minLength={4}
            required
            autoFocus
            value={pin}
            onInput={(e) => setPin(e.currentTarget.value)}
          />
          <input
            class="code-input"
            type="password"
            inputMode="numeric"
            autocomplete="new-password"
            placeholder="Repeat PIN"
            aria-label="Repeat PIN"
            required
            value={confirm}
            onInput={(e) => setConfirm(e.currentTarget.value)}
          />
          <div class="row">
            <button type="button" class="link small" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" class="primary small-btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save PIN'}
            </button>
          </div>
        </form>
      )}
      {error && <p class="banner error">{error}</p>}
    </section>
  );
}
