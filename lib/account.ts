/**
 * Login, unlock and logout. Runs only in the background script.
 *
 * Mirrors the official flow in ente-io/ente web/packages/accounts:
 *   components/LoginContents.tsx  email -> SRP attributes -> password or email code
 *   pages/verify.tsx              email code -> (2FA) -> password
 *   pages/credentials.tsx         password -> SRP -> (2FA) -> decrypt keys
 *   pages/two-factor/verify.tsx   TOTP -> key attributes + encrypted token
 * and the key decryption in rust/crates/accounts/src/auth/api.rs
 * (`decrypt_keys_only`, `decrypt_secrets`).
 */
import { DEFAULT_API_ORIGIN, EnteApi, normalizeApiOrigin, type KeyAttributes, type VerificationResponse } from './ente/api.ts';
import {
  ARGON_INTERACTIVE,
  bytesEqual,
  decryptBox,
  encryptBox,
  deriveKEK,
  deriveSRPLoginKey,
  fromB64,
  initCrypto,
  openSealedBox,
  publicKeyFromSecretKey,
  randomSaltB64,
  toB64,
  toB64URLSafe,
  wipe,
} from './ente/crypto.ts';
import { SrpClient } from './ente/srp.ts';
import { appError, type SerializedError } from './errors.ts';
import { touch } from './lock.ts';
import type { AppState } from './messages.ts';
import { pinAvailable, restorePinWrap } from './pin.ts';
import {
  ACCOUNT_KEYS,
  getLocal,
  getSession,
  removeLocal,
  removeSession,
  setLocal,
  setSession,
  type PendingLogin,
} from './storage.ts';

type UnlockKek = NonNullable<PendingLogin['unlockKek']>;

// Login notices (like "session expired") live in memory only.
let notice: SerializedError | undefined;

export const getState = async (): Promise<AppState> => {
  const { apiOrigin = DEFAULT_API_ORIGIN, email, token } = await getLocal('apiOrigin', 'email', 'token');
  const { pending, authKeyB64 } = await getSession('pending', 'authKeyB64');
  if (pending) return { status: pending.step, email: pending.email, apiOrigin: pending.apiOrigin };
  if (token && email) {
    // authKeyB64 is '' (but present) when unlocked with no codes yet.
    if (authKeyB64 !== undefined) return { status: 'unlocked', email, apiOrigin };
    const { lockNotice } = await getSession('lockNotice');
    return { status: 'locked', email, apiOrigin, pin: await pinAvailable(), notice: lockNotice };
  }
  return { status: 'logged-out', email, apiOrigin, notice };
};

const requirePending = async (step: PendingLogin['step']): Promise<PendingLogin> => {
  const { pending } = await getSession('pending');
  if (!pending || pending.step !== step) throw appError('login-expired');
  return pending;
};

const savePending = (pending: PendingLogin) => setSession({ pending });

// --- Step 1: email --------------------------------------------------------------

export const startLogin = async (emailInput: string, apiOriginInput: string): Promise<AppState> => {
  const email = emailInput.trim();
  const apiOrigin = normalizeApiOrigin(apiOriginInput || DEFAULT_API_ORIGIN);
  notice = undefined;
  const api = new EnteApi(apiOrigin);

  const srpAttributes = await api.getSRPAttributes(email);
  await setLocal({ email, apiOrigin });

  // LoginContents.tsx: no SRP, or email MFA on -> verify the email first.
  if (!srpAttributes || srpAttributes.isEmailMFAEnabled) {
    await api.sendOTT(email);
    await savePending({ email, apiOrigin, step: 'email-otp', srpAttributes });
  } else {
    await savePending({ email, apiOrigin, step: 'password', srpAttributes });
  }
  return getState();
};

export const resendEmailCode = async (): Promise<AppState> => {
  const pending = await requirePending('email-otp');
  await new EnteApi(pending.apiOrigin).sendOTT(pending.email);
  return getState();
};

export const cancelLogin = async (): Promise<AppState> => {
  await removeSession('pending');
  return getState();
};

// --- Step 2a: email code ----------------------------------------------------------

export const submitEmailCode = async (code: string): Promise<AppState> => {
  const pending = await requirePending('email-otp');
  const res = await new EnteApi(pending.apiOrigin).verifyEmail(pending.email, code.trim());
  return afterVerification(pending, res, undefined);
};

// --- Step 2b: password ------------------------------------------------------------

export const submitPassword = async (password: string): Promise<AppState> => {
  await initCrypto();
  const { pending } = await getSession('pending');
  if (!pending) return unlock(password);
  if (pending.step !== 'password') throw appError('login-expired');

  // While we have the password, also derive a fast "interactive" KEK for later
  // unlocks (Ente does the same on first login, credentials.tsx).
  const unlockKek = deriveUnlockKek(password);

  // After an email code or 2FA we already have key attributes: derive the KEK
  // from them (credentials.tsx -> VerifyMasterPasswordForm).
  if (pending.keyAttributes) {
    const ka = pending.keyAttributes;
    const kek = deriveKEK(password, ka.kekSalt, ka.opsLimit, ka.memLimit);
    try {
      return await finishLogin(pending, kek, {
        id: pending.userID ?? 0,
        keyAttributes: ka,
        encryptedToken: pending.encryptedToken,
        token: pending.token,
      }, unlockKek);
    } finally {
      wipe(kek);
    }
  }

  // Otherwise SRP: prove we know the password without sending it.
  // Source: web/packages/accounts/services/srp.ts `verifySRP`.
  const srp = pending.srpAttributes;
  if (!srp) throw appError('login-expired');
  const kek = deriveKEK(password, srp.kekSalt, srp.opsLimit, srp.memLimit);
  try {
    const api = new EnteApi(pending.apiOrigin);
    const loginKey = deriveSRPLoginKey(kek);
    const client = new SrpClient(srp.srpUserID, fromB64(srp.srpSalt), loginKey);
    wipe(loginKey);
    const { sessionID, srpB } = await api.createSRPSession(srp.srpUserID, toB64(client.publicA()));
    const m1 = client.computeM1(fromB64(srpB));
    const res = await api.verifySRPSession(sessionID, srp.srpUserID, toB64(m1));
    try {
      client.verifyM2(fromB64(res.srpM2));
    } catch {
      // The server could not prove it knows our verifier: don't trust it.
      throw appError('unexpected-response');
    }
    return await afterVerification(pending, res, kek, unlockKek);
  } finally {
    wipe(kek);
  }
};

// --- Step 3: optional TOTP second factor --------------------------------------------

export const submitTotp = async (code: string): Promise<AppState> => {
  await initCrypto();
  const pending = await requirePending('totp');
  if (!pending.twoFactorSessionID) throw appError('login-expired');
  const res = await new EnteApi(pending.apiOrigin).verifyTwoFactor(code.trim(), pending.twoFactorSessionID);

  if (pending.kekB64) {
    // SRP path: we already have the KEK, so finish now.
    const kek = fromB64(pending.kekB64);
    try {
      return await finishLogin(pending, kek, res, pending.unlockKek);
    } finally {
      wipe(kek);
    }
  }
  // Email-code path: still need the password.
  await savePending({
    email: pending.email,
    apiOrigin: pending.apiOrigin,
    step: 'password',
    userID: res.id,
    keyAttributes: res.keyAttributes,
    encryptedToken: res.encryptedToken,
  });
  return getState();
};

/**
 * Decide the next step after email-code or SRP verification.
 * Source: web/packages/accounts/components/utils/second-factor-choice.ts.
 */
const afterVerification = async (
  pending: PendingLogin,
  res: VerificationResponse,
  kek: Uint8Array | undefined,
  unlockKek?: UnlockKek,
): Promise<AppState> => {
  // An unset V1 id is an empty string, hence || (second-factor-choice.ts).
  const twoFactorSessionID = res.twoFactorSessionID || res.twoFactorSessionIDV2;
  if (twoFactorSessionID) {
    // If the account has both TOTP and a passkey, Ente lets the user pick;
    // we pick TOTP because passkeys aren't supported here yet.
    await savePending({
      email: pending.email,
      apiOrigin: pending.apiOrigin,
      step: 'totp',
      twoFactorSessionID,
      kekB64: kek ? toB64(kek) : undefined,
      unlockKek,
    });
    return getState();
  }
  if (res.passkeySessionID) {
    await removeSession('pending');
    throw appError('passkey-only');
  }
  if (!res.keyAttributes) {
    await removeSession('pending');
    throw appError('account-not-set-up');
  }
  if (kek) {
    return finishLogin(pending, kek, {
      id: res.id,
      keyAttributes: res.keyAttributes,
      encryptedToken: res.encryptedToken,
      token: res.token,
    }, unlockKek);
  }
  await savePending({
    email: pending.email,
    apiOrigin: pending.apiOrigin,
    step: 'password',
    userID: res.id,
    keyAttributes: res.keyAttributes,
    encryptedToken: res.encryptedToken,
    token: res.token,
  });
  return getState();
};

// --- Final step: decrypt keys -------------------------------------------------------

interface Credentials {
  id: number;
  keyAttributes: KeyAttributes;
  encryptedToken?: string;
  token?: string;
}

/** Decrypt the master key; a failure here means the password was wrong. */
const decryptMasterKey = (ka: { encryptedKey: string; keyDecryptionNonce: string }, kek: Uint8Array): Uint8Array => {
  try {
    return decryptBox(ka.encryptedKey, ka.keyDecryptionNonce, kek);
  } catch {
    throw appError('wrong-password');
  }
};

/**
 * Source: rust/crates/accounts/src/auth/api.rs `decrypt_secrets`:
 * KEK -> master key -> X25519 secret key (checked against the public key)
 * -> sealed-box token; then remote.ts `decryptAuthenticatorKey`.
 * Only the authenticator key is kept (in memory). The master key could also
 * decrypt the user's other Ente data, so it is wiped straight away.
 */
const finishLogin = async (
  pending: PendingLogin,
  kek: Uint8Array,
  creds: Credentials,
  unlockKek?: UnlockKek,
): Promise<AppState> => {
  const ka = creds.keyAttributes;
  const masterKey = decryptMasterKey(ka, kek);
  let secretKey: Uint8Array | undefined;
  let tokenBytes: Uint8Array | undefined;
  let authKey: Uint8Array | undefined;
  try {
    const publicKey = fromB64(ka.publicKey);
    try {
      secretKey = decryptBox(ka.encryptedSecretKey, ka.secretKeyDecryptionNonce, masterKey);
    } catch {
      throw appError('unexpected-response');
    }
    if (!bytesEqual(publicKeyFromSecretKey(secretKey), publicKey)) throw appError('unexpected-response');

    let token: string;
    if (creds.encryptedToken) {
      tokenBytes = openSealedBox(creds.encryptedToken, publicKey, secretKey);
      token = toB64URLSafe(tokenBytes);
    } else if (creds.token) {
      token = creds.token;
    } else {
      throw appError('unexpected-response');
    }

    const authKeyEnc = (await new EnteApi(pending.apiOrigin, token).getAuthenticatorKey()) ?? null;
    if (authKeyEnc) authKey = decryptBox(authKeyEnc.encryptedKey, authKeyEnc.header, masterKey);

    await removeLocal(...ACCOUNT_KEYS);
    await setLocal({
      apiOrigin: pending.apiOrigin,
      email: pending.email,
      userID: creds.id,
      token,
      keyAttributes: ka,
      authKeyEnc,
      entities: {},
      sinceTime: 0,
    });
    if (unlockKek) await saveUnlockKeyAttributes(masterKey, unlockKek);
    await removeSession('pending', 'pinWrapped', 'pinAttempts', 'lockNotice');
    await setSession({ authKeyB64: authKey ? toB64(authKey) : '' });
    await touch();
    notice = undefined;
    return getState();
  } finally {
    wipe(masterKey, secretKey, tokenBytes, authKey);
  }
};

/** Interactive-strength KEK with a fresh salt (argon.rs `derive_interactive_key`). */
const deriveUnlockKek = (password: string): UnlockKek => {
  const salt = randomSaltB64();
  const key = deriveKEK(password, salt, ARGON_INTERACTIVE.opsLimit, ARGON_INTERACTIVE.memLimit);
  const keyB64 = toB64(key);
  wipe(key);
  return { keyB64, salt, ...ARGON_INTERACTIVE };
};

/**
 * Store the master key encrypted with the interactive KEK.
 * Source: web/packages/accounts/services/key-attributes.ts
 * `generateInteractiveKeyAttributes`. Like Ente's web app, this trades some
 * offline brute-force resistance of the local copy for a fast unlock.
 */
const saveUnlockKeyAttributes = async (masterKey: Uint8Array, k: UnlockKek): Promise<void> => {
  const unlockKey = fromB64(k.keyB64);
  const box = encryptBox(masterKey, unlockKey);
  wipe(unlockKey);
  await setLocal({
    unlockKeyAttributes: {
      kekSalt: k.salt,
      opsLimit: k.opsLimit,
      memLimit: k.memLimit,
      encryptedKey: box.encryptedData,
      keyDecryptionNonce: box.nonce,
    },
  });
};

/**
 * Unlock with the password after auto-lock or a browser restart. Uses the fast
 * unlock key attributes when present (falls back to Ente's full-strength ones).
 * Works offline.
 */
const unlock = async (password: string): Promise<AppState> => {
  const { keyAttributes, unlockKeyAttributes, authKeyEnc, token, apiOrigin = DEFAULT_API_ORIGIN } = await getLocal(
    'keyAttributes',
    'unlockKeyAttributes',
    'authKeyEnc',
    'token',
    'apiOrigin',
  );
  const ka = unlockKeyAttributes ?? keyAttributes;
  if (!ka || !token) return getState();

  const kek = deriveKEK(password, ka.kekSalt, ka.opsLimit, ka.memLimit);
  const masterKey = (() => {
    try {
      return decryptMasterKey(ka, kek);
    } finally {
      wipe(kek);
    }
  })();
  let authKey: Uint8Array | undefined;
  try {
    // Logged in before fast unlock existed: create it now, while we have the password.
    if (!unlockKeyAttributes) await saveUnlockKeyAttributes(masterKey, deriveUnlockKek(password));
    let keyEnc = authKeyEnc ?? null;
    if (!keyEnc) {
      // No codes at login time; the user may have added some since.
      keyEnc = (await new EnteApi(apiOrigin, token).getAuthenticatorKey().catch(() => undefined)) ?? null;
      if (keyEnc) await setLocal({ authKeyEnc: keyEnc });
    }
    if (keyEnc) {
      authKey = decryptBox(keyEnc.encryptedKey, keyEnc.header, masterKey);
      await setSession({ authKeyB64: toB64(authKey) });
      await restorePinWrap(authKey);
    } else {
      // Nothing to decrypt yet; mark as unlocked with an empty key slot.
      await setSession({ authKeyB64: '' });
    }
    await removeSession('lockNotice');
    await touch();
    return getState();
  } finally {
    wipe(masterKey, authKey);
  }
};

// --- Logout ---------------------------------------------------------------------------

/** Clear the account but keep settings. `reason` is shown on the login screen. */
export const clearAccount = async (reason?: SerializedError): Promise<void> => {
  await removeLocal(...ACCOUNT_KEYS);
  await removeSession('authKeyB64', 'pending', 'pinWrapped', 'pinAttempts', 'lastActivity', 'lockNotice');
  notice = reason;
};

export const logout = async (): Promise<AppState> => {
  const { token, apiOrigin = DEFAULT_API_ORIGIN } = await getLocal('token', 'apiOrigin');
  // Best effort: invalidate the token on the server too.
  if (token) await new EnteApi(apiOrigin, token).logout().catch(() => undefined);
  await clearAccount();
  return getState();
};
