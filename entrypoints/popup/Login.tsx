import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_API_ORIGIN } from '@/lib/ente/api';
import { send, type AppState } from '@/lib/messages';
import { Brand, Disclaimer, SecretInput, Working } from './Fields';
import { useAction } from './useAction';

interface Props<S extends AppState['status']> {
  state: Extract<AppState, { status: S }>;
  onState: (s: AppState) => void;
}

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function LoginEmail({ state, onState }: Props<'logged-out'>) {
  const [email, setEmail] = useState(state.email ?? '');
  const [server, setServer] = useState(state.apiOrigin);
  const [showServer, setShowServer] = useState(state.apiOrigin !== DEFAULT_API_ORIGIN);
  const [fieldError, setFieldError] = useState<string>();
  const { busy, error, run } = useAction();

  const submit = (e: Event) => {
    e.preventDefault();
    if (!looksLikeEmail(email)) return setFieldError('Enter the email address of your Ente account.');
    setFieldError(undefined);
    void run(async () => onState(await send('startLogin', { email: email.trim(), apiOrigin: server })));
  };

  return (
    <>
      <Brand subtitle="Your Ente Auth codes, one click away." />
      <form onSubmit={submit} noValidate>
        {state.notice && <p class="banner warn">{state.notice.message}</p>}
        <label class="field">
          <span>Email</span>
          <input
            type="email"
            autoFocus
            autocomplete="username"
            placeholder="you@example.com"
            aria-invalid={fieldError ? 'true' : undefined}
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
          {fieldError && <span class="field-error">{fieldError}</span>}
        </label>
        {showServer ? (
          <label class="field">
            <span>Server</span>
            <input type="url" value={server} onInput={(e) => setServer(e.currentTarget.value)} />
            <span class="hint">For self-hosted Ente. Default: {DEFAULT_API_ORIGIN}</span>
          </label>
        ) : null}
        {error && <p class="banner error">{error}</p>}
        <button type="submit" class="primary" disabled={busy}>
          {busy ? <span class="spinner" /> : 'Continue'}
        </button>
        <p class="reassure">Use your Ente Auth account. Your password never leaves this device.</p>
        {!showServer && (
          <button type="button" class="link small" style={{ alignSelf: 'center' }} onClick={() => setShowServer(true)}>
            Using a self-hosted Ente server?
          </button>
        )}
      </form>
      <Disclaimer />
    </>
  );
}

export function LoginSecondStep({ state, onState }: Props<'email-otp' | 'totp'>) {
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [resent, setResent] = useState(false);
  const { busy, error, run } = useAction();
  const isEmail = state.status === 'email-otp';

  const submit = (e: Event) => {
    e.preventDefault();
    const clean = code.replace(/\D/g, '');
    if (clean.length < 6) return setFieldError('Enter the 6-digit code.');
    setFieldError(undefined);
    void run(async () => onState(await send(isEmail ? 'submitEmailCode' : 'submitTotp', { code: clean })));
  };

  return (
    <>
      <Brand subtitle={isEmail ? 'Check your email' : 'Two-factor authentication'} />
      <form onSubmit={submit} noValidate>
        <p class="center muted">
          {isEmail ? (
            <>
              We sent a code to <strong>{state.email}</strong>.
            </>
          ) : (
            <>Enter the code for your Ente account from your authenticator app.</>
          )}
        </p>
        <label class="field">
          <span class="sr-only">{isEmail ? 'Email code' : 'Two-factor code'}</span>
          <input
            class="code-input"
            type="text"
            inputMode="numeric"
            autocomplete="one-time-code"
            autoFocus
            maxLength={8}
            placeholder="••••••"
            aria-invalid={fieldError ? 'true' : undefined}
            value={code}
            onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))}
          />
          {fieldError && <span class="field-error">{fieldError}</span>}
        </label>
        {error && <p class="banner error">{error}</p>}
        <button type="submit" class="primary" disabled={busy}>
          {busy ? <span class="spinner" /> : 'Verify'}
        </button>
        <div class="row">
          <BackButton onState={onState} />
          {isEmail && (
            <button
              type="button"
              class="link small"
              disabled={busy || resent}
              onClick={() =>
                void run(async () => {
                  await send('resendEmailCode', {});
                  setResent(true);
                })
              }
            >
              {resent ? 'Code sent' : 'Resend code'}
            </button>
          )}
        </div>
      </form>
    </>
  );
}

export function LoginPassword({ state, onState }: Props<'password'>) {
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const { busy, error, run } = useAction();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error]);

  const submit = (e: Event) => {
    e.preventDefault();
    if (!password) return setFieldError('Enter your Ente password.');
    setFieldError(undefined);
    void run(async () => {
      try {
        onState(await send('submitPassword', { password }));
      } finally {
        setPassword('');
      }
    });
  };

  return (
    <>
      <Brand subtitle={state.email} />
      <form onSubmit={submit} noValidate>
        <SecretInput
          label="Password"
          value={password}
          onInput={setPassword}
          autocomplete="current-password"
          autoFocus
          error={fieldError}
          inputRef={inputRef}
        />
        {error && <p class="banner error">{error}</p>}
        <button type="submit" class="primary" disabled={busy}>
          {busy ? <span class="spinner" /> : 'Log in'}
        </button>
        {busy && <Working text="Decrypting your keys. This takes a few seconds by design." />}
        <BackButton onState={onState} />
      </form>
    </>
  );
}

function BackButton({ onState }: { onState: (s: AppState) => void }) {
  return (
    <button type="button" class="link small" onClick={() => void send('cancelLogin', {}).then(onState)}>
      ← Use a different account
    </button>
  );
}
