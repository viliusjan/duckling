/**
 * libsodium wrappers for the exact primitives Ente uses.
 *
 * Ente's web apps now run this logic as Rust compiled to WASM. Each function
 * below cites the Rust source it mirrors (ente-io/ente @ main, Oct 2026) and,
 * where one exists, the older TypeScript/libsodium version it replaced.
 *
 * Keys are passed around as Uint8Array so callers can wipe them with `wipe()`.
 */
import sodium from 'libsodium-wrappers-sumo';

export const initCrypto = async (): Promise<void> => {
  await sodium.ready;
};

// --- Encoding ---------------------------------------------------------------

/** Standard base64 with padding, as used for every Ente API field. */
export const fromB64 = (s: string): Uint8Array =>
  sodium.from_base64(s, sodium.base64_variants.ORIGINAL);

export const toB64 = (b: Uint8Array): string =>
  sodium.to_base64(b, sodium.base64_variants.ORIGINAL);

/**
 * URL-safe base64 *with* padding. This is how the decrypted auth token is
 * encoded before being sent as X-Auth-Token.
 * Source: web/packages/accounts/services/crypto/index.ts `toB64URLSafe`
 * (standard base64 with "+" -> "-" and "/" -> "_", padding kept).
 */
export const toB64URLSafe = (b: Uint8Array): string =>
  sodium.to_base64(b, sodium.base64_variants.URLSAFE);

/** Overwrite a key buffer with zeros once it is no longer needed. */
export const wipe = (...buffers: (Uint8Array | undefined)[]): void => {
  for (const b of buffers) if (b) sodium.memzero(b);
};

// --- Key derivation ---------------------------------------------------------

/**
 * Argon2id key-encryption-key (KEK) from the user's password.
 * Source: rust/crates/accounts/src/auth/api.rs `derive_kek`, which calls
 * rust/crates/core/src/crypto/argon.rs `derive_key` ("Produces the same key as
 * libsodium's crypto_pwhash with crypto_pwhash_ALG_ARGON2ID13"), 32-byte key.
 */
export const deriveKEK = (
  password: string,
  saltB64: string,
  opsLimit: number,
  memLimit: number,
): Uint8Array =>
  sodium.crypto_pwhash(
    32,
    password,
    fromB64(saltB64),
    opsLimit,
    memLimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );

/**
 * SRP login key: a BLAKE2b subkey of the KEK (id 1, context "loginctx",
 * 32 bytes), truncated to its first 16 bytes.
 * Source: rust/crates/core/src/crypto/kdf.rs `derive_login_key` /
 * `derive_subkey`. Its BLAKE2b parameters (key = KEK, salt = LE64(id),
 * personal = context) are exactly libsodium's crypto_kdf_derive_from_key.
 */
export const deriveSRPLoginKey = (kek: Uint8Array): Uint8Array => {
  const subkey = sodium.crypto_kdf_derive_from_key(32, 1, 'loginctx', kek);
  const loginKey = subkey.slice(0, 16);
  wipe(subkey);
  return loginKey;
};

/**
 * Argon2id "interactive" parameters: 64 MiB, 2 passes.
 * Source: rust/crates/core/src/crypto/argon.rs `Params::INTERACTIVE`.
 */
export const ARGON_INTERACTIVE = { opsLimit: 2, memLimit: 67_108_864 } as const;

/** 16 random bytes, base64 (crypto_pwhash_SALTBYTES, as argon.rs `Salt`). */
export const randomSaltB64 = (): string => toB64(sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES));

// --- Encryption ---------------------------------------------------------------

/**
 * XSalsa20-Poly1305 secretbox with a random 24-byte nonce.
 * Source: rust/crates/core/src/crypto/secretbox.rs `encrypt`
 * (web: `cryptoEncryptBox` / `encryptBox`).
 */
export const encryptBox = (data: Uint8Array, key: Uint8Array): { encryptedData: string; nonce: string } => {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  return { encryptedData: toB64(sodium.crypto_secretbox_easy(data, nonce, key)), nonce: toB64(nonce) };
};

// --- Decryption ---------------------------------------------------------------

/**
 * XSalsa20-Poly1305 secretbox. Used for the master key, the X25519 secret key
 * and the authenticator key. Throws if the key is wrong.
 * Source: rust/crates/core/src/crypto/secretbox.rs `decrypt`
 * (exposed to web as `cryptoDecryptBox`, web/packages/wasm/auth/index.ts).
 */
export const decryptBox = (
  encryptedDataB64: string,
  nonceB64: string,
  key: Uint8Array,
): Uint8Array =>
  sodium.crypto_secretbox_open_easy(fromB64(encryptedDataB64), fromB64(nonceB64), key);

/** X25519 public key for a secret key, to check key attributes are consistent. */
export const publicKeyFromSecretKey = (secretKey: Uint8Array): Uint8Array =>
  sodium.crypto_scalarmult_base(secretKey);

/**
 * Anonymous sealed box (X25519 + XSalsa20-Poly1305). Used for the auth token.
 * Source: rust/crates/core/src/crypto/sealed.rs `open`, called from
 * rust/crates/accounts/src/auth/api.rs `decrypt_secrets`.
 */
export const openSealedBox = (
  encryptedB64: string,
  publicKey: Uint8Array,
  secretKey: Uint8Array,
): Uint8Array => sodium.crypto_box_seal_open(fromB64(encryptedB64), publicKey, secretKey);

/**
 * "Legacy blob": one XChaCha20-Poly1305 secretstream chunk, without requiring
 * the FINAL tag. Used for every authenticator entity.
 * Source: rust/crates/core/src/crypto/blob.rs `decrypt_legacy`
 * (exposed to web as `cryptoDecryptBlobLegacy`, used by `decryptMetadataJSON`
 * in web/packages/wasm/auth/index.ts).
 */
export const decryptBlobLegacy = (
  encryptedDataB64: string,
  headerB64: string,
  key: Uint8Array,
): Uint8Array => {
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(fromB64(headerB64), key);
  const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, fromB64(encryptedDataB64), null);
  // libsodium.js returns false (or throws) when authentication fails.
  if (!result) throw new Error('decryption failed');
  return result.message;
};

/**
 * Decrypt a legacy blob and parse it as JSON.
 * Source: web/packages/wasm/auth/index.ts `decryptMetadataJSON`.
 */
export const decryptMetadataJSON = (
  encryptedDataB64: string,
  headerB64: string,
  key: Uint8Array,
): unknown => JSON.parse(new TextDecoder().decode(decryptBlobLegacy(encryptedDataB64, headerB64, key)));

export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && sodium.memcmp(a, b);
