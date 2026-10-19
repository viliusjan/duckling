/**
 * In-memory fake of the Ente API ("museum") for flow tests.
 * Keys are generated like web/packages/accounts/services/user.ts
 * `generateKeysAndAttributes`; SRP is the server half of the same protocol
 * (RFC 5054 / go-srp), using Ente's M1/M2 definitions from srp.rs.
 */
import sodium from 'libsodium-wrappers-sumo';
import { sha256 } from '@noble/hashes/sha2.js';
import { N, N_BYTES, g, modPow, computeK, computeX, bigIntToBytes, bytesToBigInt, padToN } from '../lib/ente/srp.ts';

const b64 = (b: Uint8Array) => sodium.to_base64(b, sodium.base64_variants.ORIGINAL);
const unb64 = (s: string) => sodium.from_base64(s, sodium.base64_variants.ORIGINAL);
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

export interface FakeOptions {
  email?: string;
  password?: string;
  emailMFA?: boolean;
  totp?: boolean;
  passkeyOnly?: boolean;
  uris?: string[];
  /** Simulate network failures. */
  offline?: boolean;
  serverDown?: boolean;
  /** Argon2id params; defaults are small so tests run fast. */
  opsLimit?: number;
  memLimit?: number;
}

export const OTT = '111111';
export const TOTP_CODE = '123456';

export class FakeEnte {
  readonly email: string;
  readonly password: string;
  opts: FakeOptions;
  readonly ops: number;
  readonly mem: number;
  keyAttributes!: Record<string, string | number>;
  publicKey!: Uint8Array;
  token = sodium.randombytes_buf(32);
  srpUserID = '6b1c3e2a-0000-4000-8000-000000000001';
  srpSalt = sodium.randombytes_buf(16);
  verifier!: bigint;
  authKey = sodium.crypto_secretbox_keygen();
  authKeyEnc!: { encryptedKey: string; header: string };
  entities: { id: string; encryptedData: string; header: string; updatedAt: number; isDeleted: boolean }[] = [];
  srpSessions = new Map<string, { A: Uint8Array; b: bigint; B: Uint8Array }>();
  calls: string[] = [];
  tokenRevoked = false;
  /** Ente only creates the authenticator key when the first code is added. */
  hasAuthKey = true;

  constructor(opts: FakeOptions = {}) {
    this.opts = opts;
    this.email = opts.email ?? 'test@example.com';
    this.password = opts.password ?? 'hunter2-but-longer';
    this.ops = opts.opsLimit ?? 2;
    this.mem = opts.memLimit ?? 64 * 1024 * 1024;

    const masterKey = sodium.crypto_secretbox_keygen();
    const kekSalt = sodium.randombytes_buf(16);
    const kek = sodium.crypto_pwhash(32, this.password, kekSalt, this.ops, this.mem, sodium.crypto_pwhash_ALG_ARGON2ID13);
    const kp = sodium.crypto_box_keypair();
    this.publicKey = kp.publicKey;
    const n1 = sodium.randombytes_buf(24), n2 = sodium.randombytes_buf(24), n3 = sodium.randombytes_buf(24);
    this.keyAttributes = {
      kekSalt: b64(kekSalt),
      encryptedKey: b64(sodium.crypto_secretbox_easy(masterKey, n1, kek)),
      keyDecryptionNonce: b64(n1),
      publicKey: b64(kp.publicKey),
      encryptedSecretKey: b64(sodium.crypto_secretbox_easy(kp.privateKey, n2, masterKey)),
      secretKeyDecryptionNonce: b64(n2),
      memLimit: this.mem,
      opsLimit: this.ops,
    };
    this.authKeyEnc = { encryptedKey: b64(sodium.crypto_secretbox_easy(this.authKey, n3, masterKey)), header: b64(n3) };

    const loginKey = sodium.crypto_kdf_derive_from_key(32, 1, 'loginctx', kek).slice(0, 16);
    this.verifier = modPow(g, computeX(new TextEncoder().encode(this.srpUserID), loginKey, this.srpSalt), N);

    (opts.uris ?? []).forEach((u, i) => this.addEntity(u, 1000 + i));
  }

  addEntity(uri: string, updatedAt: number, id = `e${this.entities.length + 1}`) {
    const push = sodium.crypto_secretstream_xchacha20poly1305_init_push(this.authKey);
    const ct = sodium.crypto_secretstream_xchacha20poly1305_push(push.state, JSON.stringify(uri), null, sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL);
    this.entities.push({ id, encryptedData: b64(ct), header: b64(push.header), updatedAt, isDeleted: false });
  }

  get tokenB64URL() {
    return sodium.to_base64(this.token, sodium.base64_variants.URLSAFE);
  }

  private authResponse() {
    return { id: 42, keyAttributes: this.keyAttributes, encryptedToken: b64(sodium.crypto_box_seal(this.token, this.publicKey)) };
  }

  private secondFactorOr(ok: Record<string, unknown>) {
    if (this.opts.passkeyOnly) return { id: 42, passkeySessionID: 'pk-1', accountsUrl: 'https://accounts.example' };
    if (this.opts.totp) return { id: 42, twoFactorSessionID: '', twoFactorSessionIDV2: '2fa-session' };
    return ok;
  }

  /** Drop-in for globalThis.fetch. */
  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (this.opts.offline) throw new TypeError('NetworkError when attempting to fetch resource.');
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    this.calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (this.opts.serverDown) return json(502, {});
    if (headers.get('X-Client-Package') !== 'io.ente.auth.web') return json(400, {});
    const authed = () => headers.get('X-Auth-Token') === this.tokenB64URL && !this.tokenRevoked;

    switch (url.pathname) {
      case '/users/srp/attributes':
        if (url.searchParams.get('email') !== this.email) return json(404, {});
        return json(200, { attributes: { srpUserID: this.srpUserID, srpSalt: b64(this.srpSalt), memLimit: this.mem, opsLimit: this.ops, kekSalt: this.keyAttributes.kekSalt, isEmailMFAEnabled: !!this.opts.emailMFA } });
      case '/users/ott':
        return body.email === this.email ? json(200, {}) : json(404, { code: 'USER_NOT_REGISTERED' });
      case '/users/verify-email':
        if (body.ott !== OTT) return json(401, {});
        return json(200, this.secondFactorOr(this.authResponse()));
      case '/users/srp/create-session': {
        const b = bytesToBigInt(sodium.randombytes_buf(64));
        const B = bigIntToBytes((computeK() * this.verifier + modPow(g, b, N)) % N);
        this.srpSessions.set('s1', { A: unb64(body.srpA), b, B });
        return json(200, { sessionID: 's1', srpB: b64(B) });
      }
      case '/users/srp/verify-session': {
        const s = this.srpSessions.get(body.sessionID)!;
        const A = bytesToBigInt(s.A);
        const u = bytesToBigInt(sha256(cat(padToN(s.A), padToN(s.B))));
        const S = padToN(bigIntToBytes(modPow((A * modPow(this.verifier, u, N)) % N, s.b, N)));
        const m1 = sha256(cat(padToN(s.A), padToN(s.B), S));
        if (b64(m1) !== body.srpM1) return json(401, {});
        const m2 = sha256(cat(padToN(s.A), m1, sha256(S)));
        return json(200, { ...this.secondFactorOr(this.authResponse()), srpM2: b64(m2) });
      }
      case '/users/two-factor/verify':
        if (body.sessionID !== '2fa-session') return json(404, {});
        return body.code === TOTP_CODE ? json(200, this.authResponse()) : json(401, {});
      case '/authenticator/key':
        if (!authed()) return json(401, {});
        return this.hasAuthKey ? json(200, this.authKeyEnc) : json(404, {});
      case '/authenticator/entity/diff': {
        if (!authed()) return json(401, {});
        const since = Number(url.searchParams.get('sinceTime'));
        const limit = Number(url.searchParams.get('limit'));
        const diff = this.entities.filter((e) => e.updatedAt > since).sort((a, b) => a.updatedAt - b.updatedAt).slice(0, limit);
        return json(200, { diff, timestamp: (Date.now() + 5000) * 1000 });
      }
      case '/users/logout':
        this.tokenRevoked = true;
        return json(200, {});
    }
    return json(404, {});
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export { N_BYTES };
