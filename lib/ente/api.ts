/**
 * Minimal Ente ("museum") API client: only the endpoints Duckling needs.
 *
 * Endpoints and payloads come from (ente-io/ente):
 *   web/packages/accounts/services/srp.ts    /users/srp/*
 *   web/packages/accounts/services/user.ts   /users/ott, /users/verify-email,
 *                                            /users/two-factor/verify, /users/logout
 *   web/apps/auth/src/services/remote.ts     /authenticator/key, /authenticator/entity/diff
 * Headers: web/packages/base/http.ts; default origin: web/packages/base/origins.ts.
 */
import { appError } from '../errors.ts';

export const DEFAULT_API_ORIGIN = 'https://api.ente.com';

/** X-Client-Package of Ente's Auth web app (web/packages/base/app.ts). */
const CLIENT_PACKAGE = 'io.ente.auth.web';
const TIMEOUT_MS = 20_000;

/** Validates a user-entered self-hosted server URL; returns its origin. */
export const normalizeApiOrigin = (input: string): string => {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw appError('invalid-server-url');
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  // Plain http only for local development servers; never send secrets in clear text.
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw appError('invalid-server-url');
  }
  return (url.origin + url.pathname).replace(/\/+$/, '');
};

// --- Response types -------------------------------------------------------------

export interface SRPAttributes {
  srpUserID: string;
  srpSalt: string;
  memLimit: number;
  opsLimit: number;
  kekSalt: string;
  isEmailMFAEnabled: boolean;
}

export interface KeyAttributes {
  kekSalt: string;
  encryptedKey: string;
  keyDecryptionNonce: string;
  publicKey: string;
  encryptedSecretKey: string;
  secretKeyDecryptionNonce: string;
  memLimit: number;
  opsLimit: number;
}

/** web/packages/accounts/services/user.ts `EmailOrSRPVerificationResponse`. */
export interface VerificationResponse {
  id: number;
  keyAttributes?: KeyAttributes;
  encryptedToken?: string;
  token?: string;
  twoFactorSessionID?: string;
  twoFactorSessionIDV2?: string;
  passkeySessionID?: string;
}

/** web/packages/accounts/services/user.ts `TwoFactorAuthorizationResponse`. */
export interface TwoFactorAuthorization {
  id: number;
  keyAttributes: KeyAttributes;
  encryptedToken: string;
}

export interface AuthenticatorKey {
  encryptedKey: string;
  /** Remote calls this the header, but it is the secretbox nonce (remote.ts). */
  header: string;
}

export interface EntityChange {
  id: string;
  encryptedData: string | null;
  header: string | null;
  isDeleted: boolean;
  updatedAt: number;
}

// --- Tiny validators (instead of zod, to keep the bundle small) -----------------

type Obj = Record<string, unknown>;
const bad = (): never => {
  throw appError('unexpected-response');
};
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : bad());
const str = (v: unknown): string => (typeof v === 'string' ? v : bad());
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : bad());
const bool = (v: unknown): boolean => (typeof v === 'boolean' ? v : bad());
/** Optional string; Ente sends null, "" or omits unset fields. */
const optStr = (v: unknown): string | undefined => (v === undefined || v === null || v === '' ? undefined : str(v));

const parseKeyAttributes = (v: unknown): KeyAttributes => {
  const o = obj(v);
  return {
    kekSalt: str(o.kekSalt),
    encryptedKey: str(o.encryptedKey),
    keyDecryptionNonce: str(o.keyDecryptionNonce),
    publicKey: str(o.publicKey),
    encryptedSecretKey: str(o.encryptedSecretKey),
    secretKeyDecryptionNonce: str(o.secretKeyDecryptionNonce),
    memLimit: num(o.memLimit),
    opsLimit: num(o.opsLimit),
  };
};

const parseVerification = (v: unknown): VerificationResponse => {
  const o = obj(v);
  return {
    id: num(o.id),
    keyAttributes: o.keyAttributes == null ? undefined : parseKeyAttributes(o.keyAttributes),
    encryptedToken: optStr(o.encryptedToken),
    token: optStr(o.token),
    twoFactorSessionID: optStr(o.twoFactorSessionID),
    twoFactorSessionIDV2: optStr(o.twoFactorSessionIDV2),
    passkeySessionID: optStr(o.passkeySessionID),
  };
};

const parseTwoFactorAuthorization = (v: unknown): TwoFactorAuthorization => {
  const o = obj(v);
  return { id: num(o.id), keyAttributes: parseKeyAttributes(o.keyAttributes), encryptedToken: str(o.encryptedToken) };
};

// --- HTTP -------------------------------------------------------------------------

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number>;
  body?: unknown;
  /** Map specific statuses to errors before the generic handling. */
  onStatus?: Partial<Record<number, () => never | undefined>>;
}

export class EnteApi {
  readonly origin: string;
  private readonly token?: string;
  constructor(origin: string, token?: string) {
    this.origin = origin;
    this.token = token;
  }

  withToken(token: string): EnteApi {
    return new EnteApi(this.origin, token);
  }

  private async request(path: string, opts: RequestOptions = {}): Promise<unknown> {
    const url = new URL(this.origin + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));

    const headers: Record<string, string> = { 'X-Client-Package': CLIENT_PACKAGE };
    if (this.token) headers['X-Auth-Token'] = this.token;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw appError('offline');
    }

    if (!res.ok) {
      const body: unknown = await res.json().catch(() => undefined);
      const handler = opts.onStatus?.[res.status];
      if (handler) {
        handler();
        return undefined; // handler chose "no error, no data" (e.g. 404 -> undefined)
      }
      if (res.status === 401 && this.token) throw appError('session-expired');
      if (res.status === 429) throw appError('rate-limited');
      if (res.status >= 500) throw appError('server');
      throw new HttpError(res.status, body);
    }
    return res.status === 204 ? undefined : res.json().catch(() => bad());
  }

  // --- Login ---------------------------------------------------------------------

  /** undefined if the user has no SRP set up (or doesn't exist). */
  async getSRPAttributes(email: string): Promise<SRPAttributes | undefined> {
    const res = await this.request('/users/srp/attributes', {
      query: { email },
      onStatus: { 404: () => undefined },
    });
    if (res === undefined) return undefined;
    const a = obj(obj(res).attributes);
    return {
      srpUserID: str(a.srpUserID),
      srpSalt: str(a.srpSalt),
      memLimit: num(a.memLimit),
      opsLimit: num(a.opsLimit),
      kekSalt: str(a.kekSalt),
      isEmailMFAEnabled: bool(a.isEmailMFAEnabled),
    };
  }

  /** Email a one-time code. 404 with code USER_NOT_REGISTERED -> no-account (LoginContents.tsx). */
  async sendOTT(email: string): Promise<void> {
    try {
      await this.request('/users/ott', { method: 'POST', body: { email, purpose: 'login' } });
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) throw appError('no-account');
      throw e;
    }
  }

  /** 401 -> wrong code, 410 -> expired (web/packages/accounts/pages/verify.tsx). */
  async verifyEmail(email: string, ott: string): Promise<VerificationResponse> {
    const res = await this.request('/users/verify-email', {
      method: 'POST',
      body: { email, ott },
      onStatus: { 401: () => bad401('wrong-code'), 410: () => bad401('code-expired') },
    });
    return parseVerification(res);
  }

  async createSRPSession(srpUserID: string, srpA: string): Promise<{ sessionID: string; srpB: string }> {
    const o = obj(await this.request('/users/srp/create-session', { method: 'POST', body: { srpUserID, srpA } }));
    return { sessionID: str(o.sessionID), srpB: str(o.srpB) };
  }

  /** 401 means the password was wrong (srp.ts `verifySRPSession`). */
  async verifySRPSession(
    sessionID: string,
    srpUserID: string,
    srpM1: string,
  ): Promise<VerificationResponse & { srpM2: string }> {
    const res = await this.request('/users/srp/verify-session', {
      method: 'POST',
      body: { sessionID, srpUserID, srpM1 },
      onStatus: { 401: () => bad401('wrong-password') },
    });
    return { ...parseVerification(res), srpM2: str(obj(res).srpM2) };
  }

  /** 404 means the 2FA session expired (two-factor/verify.tsx logs out). */
  async verifyTwoFactor(code: string, sessionID: string): Promise<TwoFactorAuthorization> {
    try {
      const res = await this.request('/users/two-factor/verify', {
        method: 'POST',
        body: { code, sessionID },
        onStatus: { 404: () => bad401('login-expired') },
      });
      return parseTwoFactorAuthorization(res);
    } catch (e) {
      // A wrong TOTP is rejected with a 4xx; report it as a wrong code.
      if (e instanceof HttpError && e.status >= 400 && e.status < 500) throw appError('wrong-code');
      throw e;
    }
  }

  async logout(): Promise<void> {
    await this.request('/users/logout', { method: 'POST', onStatus: { 401: () => undefined } });
  }

  // --- Authenticator ---------------------------------------------------------------

  async getAuthenticatorKey(): Promise<AuthenticatorKey | undefined> {
    const res = await this.request('/authenticator/key', { onStatus: { 404: () => undefined } });
    if (res === undefined) return undefined;
    const o = obj(res);
    return { encryptedKey: str(o.encryptedKey), header: str(o.header) };
  }

  /** `timestamp` is the server clock in epoch microseconds. */
  async getEntityDiff(sinceTime: number, limit: number): Promise<{ diff: EntityChange[]; timestamp?: number }> {
    const o = obj(await this.request('/authenticator/entity/diff', { query: { sinceTime, limit } }));
    if (!Array.isArray(o.diff)) bad();
    const diff = (o.diff as unknown[]).map((d): EntityChange => {
      const c = obj(d);
      return {
        id: str(c.id),
        encryptedData: c.encryptedData == null ? null : str(c.encryptedData),
        header: c.header == null ? null : str(c.header),
        isDeleted: bool(c.isDeleted),
        updatedAt: num(c.updatedAt),
      };
    });
    return { diff, timestamp: o.timestamp == null ? undefined : num(o.timestamp) };
  }
}

const bad401 = (code: 'wrong-code' | 'code-expired' | 'wrong-password' | 'login-expired'): never => {
  throw appError(code);
};

