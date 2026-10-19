/**
 * Errors that can cross the popup <-> background boundary.
 * Every failure the user can see maps to one of these codes, so the popup can
 * always show a clear message instead of a blank screen.
 */
export type ErrorCode =
  | 'offline' // fetch failed / timed out
  | 'server' // 5xx
  | 'rate-limited' // 429
  | 'session-expired' // 401 on an authenticated call
  | 'wrong-password'
  | 'wrong-code' // email OTP or 2FA code rejected
  | 'code-expired'
  | 'login-expired' // 2FA session expired; start again
  | 'passkey-only' // account only has passkey 2FA (not supported yet)
  | 'account-not-set-up'
  | 'no-account' // email not registered
  | 'invalid-server-url'
  | 'unexpected-response'
  | 'locked'
  | 'wrong-pin'
  | 'pin-locked-out' // too many wrong PINs; password required
  | 'pin-unavailable' // no PIN set, or Firefox restarted since
  | 'pin-too-short'
  | 'no-codes-yet' // PIN needs the authenticator key, which only exists once you have codes
  | 'unknown';

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export const messages: Record<ErrorCode, string> = {
  offline: "Can't reach the Ente server. Check your internet connection.",
  server: 'The Ente server is having problems. Try again in a few minutes.',
  'rate-limited': 'Too many attempts. Wait a minute and try again.',
  'session-expired': 'Your session expired. Please log in again.',
  'wrong-password': 'Incorrect password.',
  'wrong-code': 'Incorrect code. Check it and try again.',
  'code-expired': 'This code has expired. Request a new one.',
  'login-expired': 'The login took too long. Please start again.',
  'passkey-only':
    "Your Ente account uses a passkey for two-factor login, which Duckling doesn't support yet. Add an authenticator-app (TOTP) second factor in Ente to log in here.",
  'account-not-set-up': 'Finish setting up your account in the official Ente app first.',
  'no-account': 'No Ente account uses this email.',
  'invalid-server-url': 'That server URL is not valid. It should look like https://api.example.com',
  'unexpected-response': 'The server sent a response Duckling did not understand.',
  locked: 'Duckling is locked.',
  'wrong-pin': 'Incorrect PIN.',
  'pin-locked-out': 'Too many incorrect PINs. Enter your Ente password instead.',
  'pin-unavailable': 'Enter your Ente password. The PIN works again after that.',
  'pin-too-short': 'Use at least 4 digits for your PIN.',
  'no-codes-yet': 'Add a code in Ente Auth first, then set a PIN.',
  unknown: 'Something went wrong. Please try again.',
};

export const appError = (code: ErrorCode, message = messages[code]) => new AppError(code, message);

/** Plain object form for sending over runtime messaging. */
export interface SerializedError {
  code: ErrorCode;
  message: string;
}

export const serializeError = (e: unknown): SerializedError =>
  e instanceof AppError ? { code: e.code, message: e.message } : { code: 'unknown', message: messages.unknown };
