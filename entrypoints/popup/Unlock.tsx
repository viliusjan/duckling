import { useState } from 'preact/hooks';
import { RemoteError, send, type AppState } from '@/lib/messages';
import { useAction } from './useAction';

interface Props {
  state: Extract<AppState, { status: 'locked' }>;
  onState: (s: AppState) => void;
}

export function Unlock({ state, onState }: Props) {
  const [usePin, setUsePin] = useState(state.pin);
  const [secret, setSecret] = useState('');
  const { busy, error, setError, run } = useAction();

  const submit = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      try {
        onState(await send(usePin ? 'unlockWithPin' : 'submitPassword', usePin ? { pin: secret } : { password: secret }));
      } catch (err) {
        // After too many wrong PINs (or a restart) only the password works.
        if (err instanceof RemoteError && ['pin-locked-out', 'pin-unavailable'].includes(err.error.code)) {
          setUsePin(false);
        }
        throw err;
      } finally {
        setSecret('');
      }
    });
  };

  const switchMode = () => {
    setUsePin(!usePin);
    setSecret('');
    setError(undefined);
  };

  return (
    <form onSubmit={submit}>
      {state.notice && <p class="banner warn">{state.notice.message}</p>}
      <p>
        Duckling is locked. Enter your {usePin ? 'PIN' : <>Ente password for <strong>{state.email}</strong></>}.
      </p>
      <label>
        {usePin ? 'PIN' : 'Password'}
        <input
          key={usePin ? 'pin' : 'password'}
          class={usePin ? 'code-input' : ''}
          type="password"
          inputMode={usePin ? 'numeric' : undefined}
          autocomplete={usePin ? 'off' : 'current-password'}
          required
          autoFocus
          value={secret}
          onInput={(e) => setSecret(e.currentTarget.value)}
        />
      </label>
      {error && <p class="banner error">{error}</p>}
      <button type="submit" class="primary" disabled={busy}>
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
      <div class="row">
        {state.pin && (
          <button type="button" class="link small" onClick={switchMode}>
            {usePin ? 'Use password instead' : 'Use PIN instead'}
          </button>
        )}
        <button type="button" class="link small" onClick={() => void send('logout', {}).then(onState)}>
          Log out
        </button>
      </div>
    </form>
  );
}
