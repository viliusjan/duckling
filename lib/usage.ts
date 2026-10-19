/**
 * Local "how often / how recently did I copy this code" stats, for the
 * "Most used" and "Recently used" sort orders (the official app keeps the same
 * idea as tapCount / lastUsedAt in code_display.dart). Duckling never writes
 * to your Ente account, so these stay on this device, encrypted with the
 * authenticator key: which accounts you use is private too.
 */
import { decryptBox, encryptBox, fromB64, initCrypto, wipe } from './ente/crypto.ts';
import { getLocal, getSession, setLocal } from './storage.ts';

export interface Usage {
  count: number;
  last: number; // epoch ms
}
export type UsageMap = Record<string, Usage>;

const withAuthKey = async <T>(fn: (key: Uint8Array) => Promise<T> | T): Promise<T | undefined> => {
  const { authKeyB64 } = await getSession('authKeyB64');
  if (!authKeyB64) return undefined;
  await initCrypto();
  const key = fromB64(authKeyB64);
  try {
    return await fn(key);
  } finally {
    wipe(key);
  }
};

const read = async (key: Uint8Array): Promise<UsageMap> => {
  const { usageEnc } = await getLocal('usageEnc');
  if (!usageEnc) return {};
  try {
    return JSON.parse(new TextDecoder().decode(decryptBox(usageEnc.encryptedData, usageEnc.nonce, key))) as UsageMap;
  } catch {
    return {}; // e.g. encrypted with an older key; start fresh
  }
};

export const getUsage = async (): Promise<UsageMap> => (await withAuthKey(read)) ?? {};

export const recordUse = async (codeID: string, now = Date.now()): Promise<void> => {
  await withAuthKey(async (key) => {
    const usage = await read(key);
    const prev = usage[codeID];
    usage[codeID] = { count: (prev?.count ?? 0) + 1, last: now };
    await setLocal({ usageEnc: encryptBox(new TextEncoder().encode(JSON.stringify(usage)), key) });
  });
};
