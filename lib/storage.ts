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
  twoFactorSessionID?: string;
  userID?: number;
  keyAttributes?: KeyAttributes;
  encryptedToken?: string;
  token?: string;
}

/** Everything allowed in memory-only storage. */
export interface SessionData {
  authKeyB64: string; // decrypted authenticator key
  pending: PendingLogin;
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
];
