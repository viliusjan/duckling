/**
 * Auto-lock and clipboard clearing. Runs in the background script.
 *
 * Locking = deleting the decrypted authenticator key from memory. Timers use
 * browser.alarms because Firefox may suspend the background script while idle,
 * which would cancel a plain setTimeout. As a safety net, every request also
 * checks the idle time before doing anything (`enforceAutoLock`).
 */
import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, getLocal, getSession, removeSession, setSession, type SessionData, type Settings } from './storage.ts';

export const AUTOLOCK_ALARM = 'duckling-autolock';
export const CLIPBOARD_ALARM = 'duckling-clear-clipboard';
export const CLIPBOARD_CLEAR_MS = 30_000;

/** Choices offered in settings (minutes; 0 = only when Firefox closes). */
export const AUTOLOCK_CHOICES = [1, 5, 15, 30, 60, 240, 0] as const;

export const getSettings = async (): Promise<Settings> => ({
  ...DEFAULT_SETTINGS,
  ...(await getLocal('settings')).settings,
});

export const isUnlocked = async (): Promise<boolean> => (await getSession('authKeyB64')).authKeyB64 !== undefined;

/** Lock now: forget the decrypted key. The PIN-wrapped copy (if any) stays. */
export const lock = async (notice?: SessionData['lockNotice']): Promise<void> => {
  await removeSession('authKeyB64', 'lastActivity');
  if (notice) await setSession({ lockNotice: notice });
  await browser.alarms.clear(AUTOLOCK_ALARM);
  // Don't leave a copied code behind on a locked browser.
  if (await browser.alarms.clear(CLIPBOARD_ALARM)) await clearClipboard();
  // Tell an open popup to hide its codes. Fails harmlessly if none is open.
  await browser.runtime.sendMessage({ event: 'locked' }).catch(() => undefined);
};

/** Record activity and push the auto-lock deadline back. */
export const touch = async (): Promise<void> => {
  if (!(await isUnlocked())) return;
  const now = Date.now();
  await setSession({ lastActivity: now });
  const { autoLockMinutes } = await getSettings();
  if (autoLockMinutes > 0) await browser.alarms.create(AUTOLOCK_ALARM, { when: now + autoLockMinutes * 60_000 });
  else await browser.alarms.clear(AUTOLOCK_ALARM);
};

/** Lock if the idle time has passed (also covers a missed alarm). */
export const enforceAutoLock = async (now = Date.now()): Promise<void> => {
  if (!(await isUnlocked())) return;
  const { autoLockMinutes } = await getSettings();
  const { lastActivity } = await getSession('lastActivity');
  if (autoLockMinutes > 0 && lastActivity !== undefined && now - lastActivity >= autoLockMinutes * 60_000) {
    await lock();
  }
};

export const onAlarm = async (alarm: { name: string }): Promise<void> => {
  if (alarm.name === AUTOLOCK_ALARM) await enforceAutoLock();
  if (alarm.name === CLIPBOARD_ALARM) await clearClipboard();
};

/** idle.onStateChanged: "locked" means the OS screen was locked. */
export const onIdleStateChanged = async (state: string): Promise<void> => {
  if (state === 'locked' && (await getSettings()).lockOnSystemLock) await lock();
};

/** Called after the popup copies a code. */
export const scheduleClipboardClear = async (): Promise<void> => {
  if (!(await getSettings()).clearClipboard) return;
  await browser.alarms.create(CLIPBOARD_ALARM, { when: Date.now() + CLIPBOARD_CLEAR_MS });
};

/**
 * Overwrite the clipboard. We can't check whether it still holds our code
 * (that would need permission to *read* your clipboard), so this clears
 * whatever is there 30 s after the last copy. It can be turned off in settings.
 */
const clearClipboard = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText('');
  } catch {
    // Nothing useful to do; the setting is best effort.
  }
};
