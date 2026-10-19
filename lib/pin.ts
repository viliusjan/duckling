/**
 * Optional PIN unlock (Duckling-specific; Ente's apps have no equivalent).
 *
 * A PIN is short, so it must never protect anything on disk: a stolen disk
 * could be brute-forced offline. Instead:
 *   - memory (storage.session): authenticator key encrypted with the PIN key
 *   - disk (storage.local):     PIN key encrypted with the authenticator key
 * The disk copy is useless without the authenticator key, which itself needs
 * the password. So after Firefox restarts, the password is always required;
 * within a session, the PIN re-opens Duckling after auto-lock.
 * 5 wrong PINs delete the in-memory copy, forcing the password.
 */
import { ARGON_INTERACTIVE, decryptBox, deriveKEK, encryptBox, fromB64, initCrypto, randomSaltB64, toB64, wipe } from './ente/crypto.ts';
import { appError } from './errors.ts';
import { touch } from './lock.ts';
import { getLocal, getSession, removeLocal, removeSession, setLocal, setSession } from './storage.ts';

export const MAX_PIN_ATTEMPTS = 5;

export const setPin = async (pin: string): Promise<void> => {
  if (pin.length < 4) throw appError('pin-too-short');
  await initCrypto();
  const { authKeyB64 } = await getSession('authKeyB64');
  if (authKeyB64 === undefined) throw appError('locked');
  if (authKeyB64 === '') throw appError('no-codes-yet');

  const salt = randomSaltB64();
  const pinKey = deriveKEK(pin, salt, ARGON_INTERACTIVE.opsLimit, ARGON_INTERACTIVE.memLimit);
  const authKey = fromB64(authKeyB64);
  try {
    await setLocal({ pin: { salt, ...ARGON_INTERACTIVE, pinKeyEnc: encryptBox(pinKey, authKey) } });
    await setSession({ pinWrapped: encryptBox(authKey, pinKey), pinAttempts: 0 });
  } finally {
    wipe(pinKey, authKey);
  }
};

export const removePin = async (): Promise<void> => {
  await removeLocal('pin');
  await removeSession('pinWrapped', 'pinAttempts');
};

/** True if the locked screen can offer PIN entry right now. */
export const pinAvailable = async (): Promise<boolean> => {
  const [{ pin }, { pinWrapped }] = await Promise.all([getLocal('pin'), getSession('pinWrapped')]);
  return !!pin && !!pinWrapped;
};

export const unlockWithPin = async (pin: string): Promise<void> => {
  await initCrypto();
  const { pin: setup } = await getLocal('pin');
  const { pinWrapped, pinAttempts = 0 } = await getSession('pinWrapped', 'pinAttempts');
  if (!setup || !pinWrapped) throw appError('pin-unavailable');

  const pinKey = deriveKEK(pin, setup.salt, setup.opsLimit, setup.memLimit);
  let authKey: Uint8Array;
  try {
    authKey = decryptBox(pinWrapped.encryptedData, pinWrapped.nonce, pinKey);
  } catch {
    const attempts = pinAttempts + 1;
    if (attempts >= MAX_PIN_ATTEMPTS) {
      await removeSession('pinWrapped', 'pinAttempts');
      throw appError('pin-locked-out');
    }
    await setSession({ pinAttempts: attempts });
    const left = MAX_PIN_ATTEMPTS - attempts;
    throw appError('wrong-pin', `Incorrect PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
  } finally {
    wipe(pinKey);
  }
  await setSession({ authKeyB64: toB64(authKey), pinAttempts: 0 });
  await removeSession('lockNotice');
  wipe(authKey);
  await touch();
};

/** After a password unlock: recreate the in-memory PIN copy, if a PIN is set. */
export const restorePinWrap = async (authKey: Uint8Array): Promise<void> => {
  const { pin: setup } = await getLocal('pin');
  if (!setup || authKey.length === 0) return;
  let pinKey: Uint8Array | undefined;
  try {
    pinKey = decryptBox(setup.pinKeyEnc.encryptedData, setup.pinKeyEnc.nonce, authKey);
    await setSession({ pinWrapped: encryptBox(authKey, pinKey), pinAttempts: 0 });
  } catch {
    // The authenticator key changed since the PIN was set; the PIN is stale.
    await removePin();
  } finally {
    wipe(pinKey);
  }
};
