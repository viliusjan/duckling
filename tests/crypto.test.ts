import { test } from 'node:test';
import assert from 'node:assert/strict';
import sodium from 'libsodium-wrappers-sumo';
import { blake2b } from '@noble/hashes/blake2.js';
import {
  initCrypto, deriveKEK, deriveSRPLoginKey, decryptBox, openSealedBox, decryptMetadataJSON,
  publicKeyFromSecretKey, toB64, fromB64, toB64URLSafe, bytesEqual,
} from '../lib/ente/crypto.ts';

await initCrypto();

test('SRP login key = Ente kdf.rs derive_subkey(kek, 32, 1, "loginctx")[..16]', () => {
  const kek = new Uint8Array(32).fill(0x42);
  // Independent re-implementation of rust/crates/core/src/crypto/kdf.rs:
  // BLAKE2b(key = kek, salt = LE64(1) || 0^8, personal = "loginctx" || 0^8, len 32)
  const salt = new Uint8Array(16); salt[0] = 1;
  const personal = new Uint8Array(16); personal.set(new TextEncoder().encode('loginctx'));
  const expected = blake2b(new Uint8Array(0), { key: kek, salt, personalization: personal, dkLen: 32 }).slice(0, 16);
  assert.deepEqual(deriveSRPLoginKey(kek), expected);
});

test('URL-safe token encoding matches Ente toB64URLSafe (padding kept)', () => {
  for (const len of [30, 31, 32, 33]) {
    const b = sodium.randombytes_buf(len);
    assert.equal(toB64URLSafe(b), toB64(b).replace(/\+/g, '-').replace(/\//g, '_'));
  }
});

test('secretbox: NaCl tests/secretbox.c vector (as in Ente secretbox.rs)', () => {
  const key = fromB64('GydVZHPphdRizVEZeppGx2AJVJ6sZHTyBsTuCET2g4k=');
  const nonce = 'aWlu6VW2K3PNYr2odfxz1oIZ4ANregs3';
  const plaintext = sodium.randombytes_buf(64);
  const ct = sodium.crypto_secretbox_easy(plaintext, fromB64(nonce), key);
  assert.deepEqual(decryptBox(toB64(ct), nonce, key), plaintext);
  assert.throws(() => decryptBox(toB64(ct), nonce, new Uint8Array(32)));
});

// Simulates what Ente does at signup (web/packages/accounts/services/user.ts
// generateKeysAndAttributes) and what the server does (sealed token, entity
// key, entities), then runs our decryption chain over it.
test('full Ente key chain round-trip', () => {
  const password = 'correct horse battery staple';
  const kekSalt = toB64(sodium.randombytes_buf(16));
  const ops = 2, mem = 64 * 1024 * 1024; // interactive params keep the test fast

  const masterKey = sodium.crypto_secretbox_keygen();
  const kekAtSignup = sodium.crypto_pwhash(32, password, fromB64(kekSalt), ops, mem, sodium.crypto_pwhash_ALG_ARGON2ID13);
  const n1 = sodium.randombytes_buf(24);
  const encryptedKey = toB64(sodium.crypto_secretbox_easy(masterKey, n1, kekAtSignup));
  const kp = sodium.crypto_box_keypair();
  const n2 = sodium.randombytes_buf(24);
  const encryptedSecretKey = toB64(sodium.crypto_secretbox_easy(kp.privateKey, n2, masterKey));
  const tokenBytes = sodium.randombytes_buf(32);
  const encryptedToken = toB64(sodium.crypto_box_seal(tokenBytes, kp.publicKey));

  const authKey = sodium.crypto_secretbox_keygen();
  const n3 = sodium.randombytes_buf(24);
  const authKeyEnc = { encryptedKey: toB64(sodium.crypto_secretbox_easy(authKey, n3, masterKey)), header: toB64(n3) };

  const uri = 'otpauth://totp/GitHub:tadas?secret=JBSWY3DP&issuer=GitHub';
  const push = sodium.crypto_secretstream_xchacha20poly1305_init_push(authKey);
  const entity = {
    encryptedData: toB64(sodium.crypto_secretstream_xchacha20poly1305_push(push.state, JSON.stringify(uri), null, sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL)),
    header: toB64(push.header),
  };

  // --- our side ---
  const kek = deriveKEK(password, kekSalt, ops, mem);
  const mk = decryptBox(encryptedKey, toB64(n1), kek);
  assert.deepEqual(mk, masterKey);
  const sk = decryptBox(encryptedSecretKey, toB64(n2), mk);
  assert.ok(bytesEqual(publicKeyFromSecretKey(sk), kp.publicKey));
  assert.deepEqual(openSealedBox(encryptedToken, kp.publicKey, sk), tokenBytes);
  const ak = decryptBox(authKeyEnc.encryptedKey, authKeyEnc.header, mk);
  assert.equal(decryptMetadataJSON(entity.encryptedData, entity.header, ak), uri);

  // Wrong password must fail at the master-key step.
  const badKek = deriveKEK('wrong', kekSalt, ops, mem);
  assert.throws(() => decryptBox(encryptedKey, toB64(n1), badKek));
  // Tampered entity must fail.
  const tampered = fromB64(entity.encryptedData); tampered[3]! ^= 1;
  assert.throws(() => decryptMetadataJSON(toB64(tampered), entity.header, ak));
});
