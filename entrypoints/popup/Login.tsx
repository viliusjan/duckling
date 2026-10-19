import { useState } from 'preact/hooks';
import { DEFAULT_API_ORIGIN } from '@/lib/ente/api';
import { send, type AppState } from '@/lib/messages';
import { useAction } from './useAction';

interface Props<S extends AppState['status']> {
  state: Extract<AppState, { status: S }>;
  onState: (s: AppState) => void;
}

export function LoginEmail({ state, onState }: Props<'logged-out'>) {
  const [email, setEmail] = useState(state.email ?? '');
  const [server, setServer] = useState(state.apiOrigin);
  const [showServer, setShowServer] = useState(state.apiOrigin !== DEFAULT_API_ORIGIN);
  const { busy, error, run } = useAction();

  const submit = (e: Event) => {
    e.preventDefault();
    void run(async () => onState(await send('startLogin', { email, apiOrigin: server })));
  };

  return (
    <form onSubmit={submit}>
      {state.notice && <p class="banner warn">{state.notice.message}</p>}
      <label>
        Ente account email
        <input
          type="email"
          required
          autoFocus
          autocomplete="username"
          value={email}
          onInput={(e) => setEmail(e.currentTarget.value)}
        />
      </label>
      {showServer ? (
        <label>
          Server
          <input type="url" required value={server} onInput={(e) => setServer(e.currentTarget.value)} />
          <span class="muted small">For self-hosted Ente. Default: {DEFAULT_API_ORIGIN}</span>
        </label>
      ) : (
        <button type="button" class="link small" onClick={() => setShowServer(true)}>
          Using a self-hosted server?
        </button>
      )}
      {error && <p class="banner error">{error}</p>}
      <button type="submit" class="primary" disabled={busy}>
        {busy ? 'Checking…' : 'Continue'}
      </button>
      <p class="muted small center">Use your existing Ente Auth account. Your password never leaves this device.</p>
    </form>
  );
}

export function LoginSecondStep({ state, onState }: Props<'email-otp' | 'totp'>) {
  const [code, setCode] = useState('');
  const [resent, setResent] = useState(false);
  const { busy, error, run } = useAction();
  const isEmail = state.status === 'email-otp';

  const submit = (e: Event) => {
    e.preventDefault();
    void run(async () =>
      onState(await send(isEmail ? 'submitEmailCode' : 'submitTotp', { code: code.replace(/\s/g, '') })),
    );
  };

  return (
    <form onSubmit={submit}>
      <p>
        {isEmail ? (
          <>We emailed a verification code to <strong>{state.email}</strong>.</>
        ) : (
          <>Enter the two-factor code for your Ente account from your authenticator app.</>
        )}
      </p>
      <label>
        {isEmail ? 'Email code' : 'Two-factor code'}
        <input
          class="code-input"
          inputMode="numeric"
          autocomplete="one-time-code"
          required
          autoFocus
          maxLength={8}
          value={code}
          onInput={(e) => setCode(e.currentTarget.value)}
        />
      </label>
      {error && <p class="banner error">{error}</p>}
      <button type="submit" class="primary" disabled={busy}>
        {busy ? 'Verifying…' : 'Verify'}
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
  );
}

export function LoginPassword({ state, onState }: Props<'password' | 'locked'>) {
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();
  const locked = state.status === 'locked';

  const submit = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      try {
        onState(await send('submitPassword', { password }));
      } finally {
        setPassword('');
      }
    });
  };

  return (
    <form onSubmit={submit}>
      <p>
        {locked ? 'Duckling is locked. Enter the' : 'Enter the'} Ente password for <strong>{state.email}</strong>.
      </p>
      <label>
        Password
        <input
          type="password"
          required
          autoFocus
          autocomplete="current-password"
          value={password}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
      </label>
      {error && <p class="banner error">{error}</p>}
      <button type="submit" class="primary" disabled={busy}>
        {busy ? 'Decrypting…' : locked ? 'Unlock' : 'Log in'}
      </button>
      {busy && <p class="muted small center">Deriving your key. This takes a few seconds by design.</p>}
      <div class="row">
        {locked ? (
          <button type="button" class="link small" onClick={() => void send('logout', {}).then(onState)}>
            Log out
          </button>
        ) : (
          <BackButton onState={onState} />
        )}
      </div>
    </form>
  );
}

function BackButton({ onState }: { onState: (s: AppState) => void }) {
  return (
    <button type="button" class="link small" onClick={() => void send('cancelLogin', {}).then(onState)}>
      ← Use a different account
    </button>
  );
}
