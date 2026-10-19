import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { RemoteError, send, type AppState } from '@/lib/messages';
import { Codes } from './Codes';
import { LoginEmail, LoginPassword, LoginSecondStep } from './Login';
import { Settings } from './Settings';
import { Unlock } from './Unlock';

export function App() {
  const [state, setState] = useState<AppState>();
  const [showSettings, setShowSettings] = useState(false);
  const [fatal, setFatal] = useState<string>();

  useEffect(() => {
    const load = () =>
      send('getState', {}).then(setState, (e: unknown) =>
        setFatal(e instanceof RemoteError ? e.message : 'Duckling could not start. Try reopening it.'),
      );
    void load();
    // If Duckling auto-locks while the popup is open, hide the codes at once.
    const onMessage = (m: unknown) => {
      if (typeof m === 'object' && m !== null && (m as { event?: string }).event === 'locked') {
        setShowSettings(false);
        void load();
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  const onState = (s: AppState) => {
    if (s.status !== 'unlocked') setShowSettings(false);
    setState(s);
  };

  if (fatal) return <Shell><p class="banner error">{fatal}</p></Shell>;
  if (!state) return <Shell><p class="muted center">Loading…</p></Shell>;

  switch (state.status) {
    case 'logged-out':
      return <Shell><LoginEmail state={state} onState={onState} /></Shell>;
    case 'email-otp':
    case 'totp':
      return <Shell><LoginSecondStep state={state} onState={onState} /></Shell>;
    case 'password':
      return <Shell><LoginPassword state={state} onState={onState} /></Shell>;
    case 'locked':
      return <Shell><Unlock state={state} onState={onState} /></Shell>;
    case 'unlocked':
      return showSettings ? (
        <Settings onBack={() => setShowSettings(false)} onState={onState} />
      ) : (
        <Codes state={state} onState={onState} onSettings={() => setShowSettings(true)} />
      );
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
