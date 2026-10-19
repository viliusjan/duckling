/**
 * Typed request/response protocol between the popup and the background script.
 * Only Duckling's own extension pages can send these (checked in background.ts).
 */
import { browser } from 'wxt/browser';
import type { SerializedError } from './errors.ts';
import type { Code } from './otp/code.ts';

type SignedInStatus = 'password' | 'email-otp' | 'totp' | 'locked' | 'unlocked';

export type AppState =
  | { status: 'logged-out'; email?: string; apiOrigin: string; notice?: SerializedError }
  | { [S in SignedInStatus]: { status: S; email: string; apiOrigin: string } }[SignedInStatus];

export interface CodesResult {
  codes: Code[];
  timeOffset: number;
  lastSync: number | undefined;
  /** Entries that could not be decrypted or parsed (shown as a warning). */
  unreadable: number;
  /** Set when a sync was attempted and failed; cached codes are still returned. */
  syncError?: SerializedError;
}

export interface Requests {
  getState: { req: Record<string, never>; res: AppState };
  startLogin: { req: { email: string; apiOrigin: string }; res: AppState };
  resendEmailCode: { req: Record<string, never>; res: AppState };
  submitEmailCode: { req: { code: string }; res: AppState };
  submitTotp: { req: { code: string }; res: AppState };
  submitPassword: { req: { password: string }; res: AppState };
  cancelLogin: { req: Record<string, never>; res: AppState };
  getCodes: { req: Record<string, never>; res: CodesResult };
  sync: { req: Record<string, never>; res: CodesResult };
  logout: { req: Record<string, never>; res: AppState };
}

export type RequestType = keyof Requests;

export interface Message<T extends RequestType = RequestType> {
  type: T;
  payload: Requests[T]['req'];
}

export type Reply<T extends RequestType> = { ok: true; data: Requests[T]['res'] } | { ok: false; error: SerializedError };

export class RemoteError extends Error {
  readonly error: SerializedError;
  constructor(error: SerializedError) {
    super(error.message);
    this.error = error;
  }
}

/** Popup side: send a request and unwrap the reply (throws RemoteError). */
export const send = async <T extends RequestType>(type: T, payload: Requests[T]['req']): Promise<Requests[T]['res']> => {
  const reply = (await browser.runtime.sendMessage({ type, payload } satisfies Message<T>)) as Reply<T> | undefined;
  if (!reply) throw new RemoteError({ code: 'unknown', message: 'Duckling background is not responding.' });
  if (!reply.ok) throw new RemoteError(reply.error);
  return reply.data;
};
