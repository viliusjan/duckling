/**
 * Fetch encrypted 2FA entries from Ente and decrypt them for the popup.
 * Source: web/apps/auth/src/services/remote.ts (ente-io/ente)
 * `getAuthCodesAndTimeOffset` / `authenticatorEntityDiff`.
 *
 * Difference from Ente's web app: we keep the *encrypted* entities on disk and
 * sync incrementally from the last `sinceTime`, so codes show instantly (even
 * offline) and each sync only downloads changes.
 */
import { clearAccount } from './account.ts';
import { DEFAULT_API_ORIGIN, EnteApi } from './ente/api.ts';
import { decryptMetadataJSON, fromB64, initCrypto, wipe } from './ente/crypto.ts';
import { AppError, appError, serializeError } from './errors.ts';
import type { CodesResult } from './messages.ts';
import { codeFromURIString, type Code } from './otp/code.ts';
import { getLocal, getSession, setLocal, type EncryptedEntity } from './storage.ts';

const DIFF_BATCH_SIZE = 2500; // same as remote.ts

let inflight: Promise<void> | undefined;

/** One sync at a time; concurrent callers share it. */
export const sync = (): Promise<void> => (inflight ??= doSync().finally(() => (inflight = undefined)));

const doSync = async (): Promise<void> => {
  const { token, apiOrigin = DEFAULT_API_ORIGIN, sinceTime = 0, entities = {} } = await getLocal(
    'token',
    'apiOrigin',
    'sinceTime',
    'entities',
  );
  if (!token) throw appError('session-expired');
  const api = new EnteApi(apiOrigin, token);

  const updated: Record<string, EncryptedEntity> = { ...entities };
  let since = sinceTime;
  let timeOffset: number | undefined;

  // Page through the diff until the server returns an empty batch (remote.ts).
  for (;;) {
    const { diff, timestamp } = await api.getEntityDiff(since, DIFF_BATCH_SIZE);
    // Server time is in epoch microseconds; offsets are in milliseconds.
    if (timestamp) timeOffset = Math.floor(timestamp / 1e3) - Date.now();
    if (diff.length === 0) break;
    for (const change of diff) {
      since = Math.max(since, change.updatedAt);
      if (change.isDeleted) delete updated[change.id];
      else if (change.encryptedData && change.header) {
        updated[change.id] = { encryptedData: change.encryptedData, header: change.header };
      }
    }
  }

  await setLocal({
    entities: updated,
    sinceTime: since,
    lastSync: Date.now(),
    ...(timeOffset !== undefined && { timeOffset }),
  });
};

/** Decrypt cached entities into codes. Needs the in-memory authenticator key. */
export const getCodes = async (): Promise<CodesResult> => {
  const { authKeyB64 } = await getSession('authKeyB64');
  if (authKeyB64 === undefined) throw appError('locked');
  const { entities = {}, timeOffset = 0, lastSync } = await getLocal('entities', 'timeOffset', 'lastSync');
  if (authKeyB64 === '') return { codes: [], timeOffset, lastSync, unreadable: Object.keys(entities).length };

  await initCrypto();
  const key = fromB64(authKeyB64);
  const codes: Code[] = [];
  let unreadable = 0;
  try {
    for (const [id, e] of Object.entries(entities)) {
      try {
        const uri = decryptMetadataJSON(e.encryptedData, e.header, key);
        if (typeof uri !== 'string') throw new Error('not a URI');
        codes.push(codeFromURIString(id, uri));
      } catch {
        unreadable++;
      }
    }
  } finally {
    wipe(key);
  }

  return { codes: sortCodes(codes.filter((c) => !c.codeDisplay?.trashed)), timeOffset, lastSync, unreadable };
};

/** Pinned first, then by issuer; codes without an issuer last (remote.ts). */
const sortCodes = (codes: Code[]): Code[] =>
  codes.sort((a, b) => {
    if (a.codeDisplay?.pinned && !b.codeDisplay?.pinned) return -1;
    if (!a.codeDisplay?.pinned && b.codeDisplay?.pinned) return 1;
    if (a.issuer && b.issuer) return a.issuer.localeCompare(b.issuer);
    if (a.issuer) return -1;
    if (b.issuer) return 1;
    return 0;
  });

/**
 * Sync, then return codes. If the sync fails (offline, server down), cached
 * codes are still returned along with the error. An expired session logs out.
 */
export const syncAndGetCodes = async (): Promise<CodesResult> => {
  let syncError: CodesResult['syncError'];
  try {
    await sync();
  } catch (e) {
    if (e instanceof AppError && e.code === 'session-expired') {
      await clearAccount(serializeError(e));
      throw e;
    }
    syncError = serializeError(e);
  }
  return { ...(await getCodes()), syncError };
};
