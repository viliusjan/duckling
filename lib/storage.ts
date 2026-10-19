/**
 * The only place Duckling touches extension storage.
 *
 * DISK (storage.local) may hold ONLY: settings, the session token, and data
 * that is still encrypted (key attributes, authenticator key, entities).
 * MEMORY (storage.session) is cleared when Firefox closes and holds the
 * decrypted authenticator key plus short-lived login state.
 * See CLAUDE.md "Security rules".
 */
import { browser } from 'wxt/browser';
import type { AuthenticatorKey, KeyAttributes, SRPAttributes } from './ente/api.ts';

export interface EncryptedEntity {
  encryptedData: string;
  header: string;
}

export interface SecretBox {
  encryptedData: string;
  nonce: string;
}

export interface Settings {
  /** Lock after this many minutes without using Duckling. 0 = only when Firefox closes. */
  autoLockMinutes: number;
  /** Lock when the computer's screen locks. */
  lockOnSystemLock: boolean;
  /** Clear the clipboard 30 s after copying a code. */
  clearClipboard: boolean;
}

export const DEFAULT_SETTINGS: Settings = { autoLockMinutes: 15, lockOnSystemLock: true, clearClipboard: true };

/**
 * Master key re-encrypted with a faster ("interactive") Argon2id KEK, for quick
 * unlocks. Same idea and fields as Ente's interactive key attributes:
 * web/packages/accounts/services/key-attributes.ts `generateInteractiveKeyAttributes`.
 */
export interface UnlockKeyAttributes {
  kekSalt: string;
  opsLimit: number;
  memLimit: number;
  encryptedKey: string;
  keyDecryptionNonce: string;
}

/** Optional PIN. The PIN key is stored encrypted with the authenticator key,
 *  so it can only be recovered after a password unlock. */
export interface PinSetup {
  salt: string;
  opsLimit: number;
  memLimit: number;
  pinKeyEnc: SecretBox;
}

/** Everything allowed on disk. Nothing in here is decrypted secret material. */
export interface LocalData {
  apiOrigin: string; // setting: Ente or self-hosted server
  email: string; // last account email, to prefill login
  userID: number;
  token: string; // Ente session token (same as Ente's own apps store)
  keyAttributes: KeyAttributes; // encrypted master key + Argon2 params
  authKeyEnc: AuthenticatorKey | null; // authenticator key, encrypted with master key
  entities: Record<string, EncryptedEntity>; // encrypted 2FA entries
  sinceTime: number; // sync cursor (server microseconds)
  timeOffset: number; // server clock - local clock (ms)
  lastSync: number; // epoch ms
  settings: Settings;
  unlockKeyAttributes: UnlockKeyAttributes; // encrypted master key (faster Argon2id)
  pin: PinSetup; // encrypted PIN key (only if the user enabled a PIN)
}

/** Login progress between popup steps (survives the background being suspended). */
export interface PendingLogin {
  email: string;
  apiOrigin: string;
  /** Next thing we need from the user. */
  step: 'password' | 'email-otp' | 'totp';
  srpAttributes?: SRPAttributes;
  /** KEK, base64. Kept while waiting for a 2FA code, like Ente's
   *  `stashKeyEncryptionKeyInSessionStore` (web/packages/accounts). */
  kekB64?: string;
  /** Interactive KEK derived while we still had the password (see UnlockKeyAttributes). */
  unlockKek?: { keyB64: string; salt: string; opsLimit: number; memLimit: number };
  twoFactorSessionID?: string;
  userID?: number;
  keyAttributes?: KeyAttributes;
  encryptedToken?: string;
  token?: string;
}

/** Everything allowed in memory-only storage. */
export interface SessionData {
  authKeyB64: string; // decrypted authenticator key ('' if the account has no codes yet)
  pending: PendingLogin;
  /** Authenticator key encrypted with the PIN key. Memory only, so after a
   *  browser restart the password is always required. */
  pinWrapped: SecretBox;
  pinAttempts: number;
  lastActivity: number; // epoch ms, for auto-lock
  /** Why we locked, if the user should know (e.g. new codes need the password). */
  lockNotice: { code: 'new-codes'; message: string };
}

const local = browser.storage.local;
const session = browser.storage.session;

export const getLocal = async <K extends keyof LocalData>(...keys: K[]): Promise<Partial<Pick<LocalData, K>>> =>
  (await local.get(keys)) as Partial<Pick<LocalData, K>>;

export const setLocal = (data: Partial<LocalData>): Promise<void> => local.set(data);

export const removeLocal = (...keys: (keyof LocalData)[]): Promise<void> => local.remove(keys);

export const getSession = async <K extends keyof SessionData>(
  ...keys: K[]
): Promise<Partial<Pick<SessionData, K>>> => (await session.get(keys)) as Partial<Pick<SessionData, K>>;

export const setSession = (data: Partial<SessionData>): Promise<void> => session.set(data);

export const removeSession = (...keys: (keyof SessionData)[]): Promise<void> => session.remove(keys);

/** Account data removed on logout. Settings (apiOrigin, email) are kept. */
export const ACCOUNT_KEYS: (keyof LocalData)[] = [
  'userID',
  'token',
  'keyAttributes',
  'authKeyEnc',
  'entities',
  'sinceTime',
  'timeOffset',
  'lastSync',
  'unlockKeyAttributes',
  'pin',
];
