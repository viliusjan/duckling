import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { browser } from 'wxt/browser';
import { RemoteError, send, type AppState, type SettingsView } from '@/lib/messages';
import { DEFAULT_SETTINGS } from '@/lib/storage';
import { Codes } from './Codes';
import { LoginEmail, LoginPassword, LoginSecondStep } from './Login';
import { Settings } from './Settings';
import { themeHint, useTheme } from './theme';
import { Unlock } from './Unlock';

export function App() {
  const [state, setState] = useState<AppState>();
  const [view, setView] = useState<SettingsView>();
  const [showSettings, setShowSettings] = useState(false);
  const [fatal, setFatal] = useState<string>();
  const settings = view?.settings ?? { ...DEFAULT_SETTINGS, theme: themeHint() };
  const dark = useTheme(settings.theme);

  useEffect(() => {
    const load = () =>
      Promise.all([send('getState', {}), send('getSettings', {})]).then(
        ([s, v]) => {
          setState(s);
          setView(v);
        },
        (e: unknown) => setFatal(e instanceof RemoteError ? e.message : 'Duckling could not start. Try reopening it.'),
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
    // PIN availability etc. can change with state.
    void send('getSettings', {}).then(setView, () => undefined);
  };

  if (fatal) return <Shell><p class="banner error">{fatal}</p></Shell>;
  if (!state) return <Shell><div class="empty"><span class="spinner" /></div></Shell>;

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
      return showSettings && view ? (
        <Settings view={view} onView={setView} onBack={() => setShowSettings(false)} onState={onState} />
      ) : (
        <Codes state={state} settings={settings} dark={dark} onState={onState} onSettings={() => setShowSettings(true)} />
      );
  }
}

function Shell({ children }: { children: ComponentChildren }) {
  return <main class="auth">{children}</main>;
}
