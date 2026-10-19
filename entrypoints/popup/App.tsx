import { useEffect, useState } from 'preact/hooks';
import { RemoteError, send, type AppState } from '@/lib/messages';
import { Codes } from './Codes';
import { LoginEmail, LoginPassword, LoginSecondStep } from './Login';

export function App() {
  const [state, setState] = useState<AppState>();
  const [fatal, setFatal] = useState<string>();

  useEffect(() => {
    send('getState', {}).then(setState, (e: unknown) =>
      setFatal(e instanceof RemoteError ? e.message : 'Duckling could not start. Try reopening it.'),
    );
  }, []);

  if (fatal) return <Shell><p class="banner error">{fatal}</p></Shell>;
  if (!state) return <Shell><p class="muted center">Loading…</p></Shell>;

  switch (state.status) {
    case 'logged-out':
      return <Shell><LoginEmail state={state} onState={setState} /></Shell>;
    case 'email-otp':
    case 'totp':
      return <Shell><LoginSecondStep state={state} onState={setState} /></Shell>;
    case 'password':
    case 'locked':
      return <Shell><LoginPassword state={state} onState={setState} /></Shell>;
    case 'unlocked':
      return <Codes state={state} onState={setState} />;
  }
}

function Shell({ children }: { children: preact.ComponentChildren }) {
  return (
    <main class="auth">
      <header class="brand">
        <img src="/icon/48.png" alt="" width={32} height={32} />
        <div>
          <h1>Duckling</h1>
          <p class="muted small">Unofficial Ente Auth · not affiliated with Ente</p>
        </div>
      </header>
      {children}
    </main>
  );
}
