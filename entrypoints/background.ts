/**
 * Background script: owns all crypto, network and storage access.
 * The popup only sends typed requests (lib/messages.ts) and renders results.
 * Running login here means closing the popup can't interrupt a password
 * derivation halfway.
 */
import * as account from '@/lib/account';
import { serializeError } from '@/lib/errors';
import { enforceAutoLock, lock, onAlarm, onIdleStateChanged, scheduleClipboardClear, touch } from '@/lib/lock';
import type { Message, Requests, RequestType } from '@/lib/messages';
import { removePin, setPin, unlockWithPin } from '@/lib/pin';
import { getSettingsView, updateSettings } from '@/lib/settings';
import { getCodes, syncAndGetCodes } from '@/lib/sync';

type Handlers = { [T in RequestType]: (payload: Requests[T]['req']) => Promise<Requests[T]['res']> };

const handlers: Handlers = {
  getState: () => account.getState(),
  startLogin: ({ email, apiOrigin }) => account.startLogin(email, apiOrigin),
  resendEmailCode: () => account.resendEmailCode(),
  submitEmailCode: ({ code }) => account.submitEmailCode(code),
  submitTotp: ({ code }) => account.submitTotp(code),
  submitPassword: ({ password }) => account.submitPassword(password),
  cancelLogin: () => account.cancelLogin(),
  getCodes: () => getCodes(),
  sync: () => syncAndGetCodes(),
  logout: () => account.logout(),
  lock: async () => {
    await lock();
    return account.getState();
  },
  unlockWithPin: async ({ pin }) => {
    await unlockWithPin(pin);
    return account.getState();
  },
  copied: async () => {
    await scheduleClipboardClear();
    return null;
  },
  getSettings: () => getSettingsView(),
  updateSettings: (change) => updateSettings(change),
  setPin: async ({ pin }) => {
    await setPin(pin);
    return getSettingsView();
  },
  removePin: async () => {
    await removePin();
    return getSettingsView();
  },
};

const isRequest = (m: unknown): m is Message =>
  typeof m === 'object' && m !== null && typeof (m as Message).type === 'string' && (m as Message).type in handlers;

const handle = async (message: Message): Promise<unknown> => {
  // Lock first if the idle time passed while the background was asleep.
  await enforceAutoLock();
  const handler = handlers[message.type] as (p: unknown) => Promise<unknown>;
  const result = await handler(message.payload);
  // Any use of the popup counts as activity.
  await touch();
  return result;
};

export default defineBackground(() => {
  // Listeners must be registered synchronously so Firefox can wake us for them.
  browser.alarms.onAlarm.addListener((alarm) => void onAlarm(alarm));
  browser.idle.onStateChanged.addListener((state) => void onIdleStateChanged(state));

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    // Only Duckling's own pages (the popup) may talk to us. There are no
    // content scripts, but check anyway in case one is added later.
    const ownPage = sender.id === browser.runtime.id && sender.url?.startsWith(browser.runtime.getURL('/'));
    if (!ownPage || !isRequest(message)) return undefined;

    return handle(message).then(
      (data) => ({ ok: true, data }),
      (e: unknown) => {
        // Development builds only: error type for debugging (never payloads).
        if (import.meta.env.DEV) console.warn('[duckling]', message.type, e instanceof Error ? e.name : typeof e);
        return { ok: false, error: serializeError(e) };
      },
    );
  });
});
