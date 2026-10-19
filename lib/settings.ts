import { DEFAULT_API_ORIGIN } from './ente/api.ts';
import { appError } from './errors.ts';
import { AUTOLOCK_CHOICES, getSettings, isUnlocked, touch } from './lock.ts';
import type { SettingsView } from './messages.ts';
import { pinAvailable } from './pin.ts';
import { getLocal, getSession, setLocal, type Settings } from './storage.ts';

export const getSettingsView = async (): Promise<SettingsView> => {
  const { email = '', apiOrigin = DEFAULT_API_ORIGIN, pin } = await getLocal('email', 'apiOrigin', 'pin');
  const { authKeyB64 } = await getSession('authKeyB64');
  return {
    settings: await getSettings(),
    pinEnabled: !!pin && (await pinAvailable()),
    canSetPin: !!authKeyB64,
    email,
    apiOrigin,
  };
};

/** Validates and saves a settings change, then reschedules auto-lock. */
export const updateSettings = async (change: Partial<Settings>): Promise<SettingsView> => {
  if (!(await isUnlocked())) throw appError('locked');
  const next = { ...(await getSettings()) };
  if (change.autoLockMinutes !== undefined) {
    if (!(AUTOLOCK_CHOICES as readonly number[]).includes(change.autoLockMinutes)) throw appError('unknown');
    next.autoLockMinutes = change.autoLockMinutes;
  }
  if (typeof change.lockOnSystemLock === 'boolean') next.lockOnSystemLock = change.lockOnSystemLock;
  if (typeof change.clearClipboard === 'boolean') next.clearClipboard = change.clearClipboard;
  await setLocal({ settings: next });
  await touch();
  return getSettingsView();
};
