/**
 * Background script: owns all crypto, network and storage access.
 * The popup only sends typed requests (lib/messages.ts) and renders results.
 * Running login here means closing the popup can't interrupt a password
 * derivation halfway.
 */
import * as account from '@/lib/account';
import { serializeError } from '@/lib/errors';
import type { Message, Requests, RequestType } from '@/lib/messages';
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
};

const isRequest = (m: unknown): m is Message =>
  typeof m === 'object' && m !== null && typeof (m as Message).type === 'string' && (m as Message).type in handlers;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    // Only Duckling's own pages (the popup) may talk to us. There are no
    // content scripts, but check anyway in case one is added later.
    const ownPage = sender.id === browser.runtime.id && sender.url?.startsWith(browser.runtime.getURL('/'));
    if (!ownPage || !isRequest(message)) return undefined;

    const handler = handlers[message.type] as (p: unknown) => Promise<unknown>;
    return handler(message.payload).then(
      (data) => ({ ok: true, data }),
      (e: unknown) => {
        // Development builds only: error type for debugging (never payloads).
        if (import.meta.env.DEV) console.warn('[duckling]', message.type, e instanceof Error ? e.name : typeof e);
        return { ok: false, error: serializeError(e) };
      },
    );
  });
});
