import { useEffect, useRef, useState } from 'preact/hooks';
import { RemoteError, send, type AppState } from '@/lib/messages';
import { Brand, SecretInput, Working } from './Fields';
import { useAction } from './useAction';

interface Props {
  state: Extract<AppState, { status: 'locked' }>;
  onState: (s: AppState) => void;
}

export function Unlock({ state, onState }: Props) {
  const [usePin, setUsePin] = useState(state.pin);
  const [secret, setSecret] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const { busy, error, setError, run } = useAction();
  const inputRef = useRef<HTMLInputElement>(null);
  // After a wrong password/PIN, put the cursor back so you can retype at once.
  useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error]);

  const submit = (e: Event) => {
    e.preventDefault();
    if (usePin && secret.length < 4) return setFieldError('Your PIN has at least 4 digits.');
    if (!usePin && !secret) return setFieldError('Enter your Ente password.');
    setFieldError(undefined);
    void run(async () => {
      try {
        onState(await send(usePin ? 'unlockWithPin' : 'submitPassword', usePin ? { pin: secret } : { password: secret }));
      } catch (err) {
        // After too many wrong PINs (or a restart) only the password works.
        if (err instanceof RemoteError && ['pin-locked-out', 'pin-unavailable'].includes(err.error.code)) setUsePin(false);
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
    setFieldError(undefined);
  };

  return (
    <>
      <Brand subtitle={state.email} />
      <form onSubmit={submit} noValidate>
        {state.notice && <p class="banner warn">{state.notice.message}</p>}
        <SecretInput
          key={usePin ? 'pin' : 'password'}
          label={usePin ? 'PIN' : 'Password'}
          numeric={usePin}
          value={secret}
          onInput={setSecret}
          autocomplete={usePin ? 'off' : 'current-password'}
          autoFocus
          error={fieldError}
          inputRef={inputRef}
        />
        {error && <p class="banner error">{error}</p>}
        <button type="submit" class="primary" disabled={busy}>
          {busy ? <span class="spinner" /> : 'Unlock'}
        </button>
        {busy && !usePin && <Working text="Unlocking…" />}
        <div class="row">
          {state.pin ? (
            <button type="button" class="link small" onClick={switchMode}>
              {usePin ? 'Use password instead' : 'Use PIN instead'}
            </button>
          ) : (
            <span />
          )}
          <button type="button" class="link small" onClick={() => void send('logout', {}).then(onState)}>
            Log out
          </button>
        </div>
      </form>
    </>
  );
}
