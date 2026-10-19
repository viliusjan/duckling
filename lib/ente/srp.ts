/**
 * SRP-6a client matching Ente's server (github.com/ente/go-srp).
 *
 * Source: rust/crates/accounts/src/auth/srp.rs `SrpSession`, which wraps the
 * RustCrypto `srp` crate 0.7.0-rc.3 (`ClientG4096<Sha256>`, `process_reply`).
 * Parameters, all confirmed against that code:
 *   group  RFC 5054 4096-bit, g = 5, hash SHA-256, all values padded to 512 bytes
 *   k  = H(N | PAD(g))
 *   x  = H(salt | H(I | ":" | P))   I = srpUserID (UTF-8), P = 16-byte login key
 *   u  = H(PAD(A) | PAD(B))
 *   S  = (B - k*g^x) ^ (a + u*x) mod N
 *   M1 = H(PAD(A) | PAD(B) | PAD(S))     (Ente-specific, not the crate's M1)
 *   K  = H(PAD(S))
 *   M2 = H(PAD(A) | M1 | K)
 *
 * Verified by tests/srp.test.ts against the known-answer vector from the Go
 * server in srp.rs `test_known_vector_leading_zero_a_matches_go_server_m1`.
 */
import { sha256 } from '@noble/hashes/sha2.js';

const N_HEX =
  'ffffffffffffffffc90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b139b22514a08798e3404ddef9519b3cd3a431b302b0a6df25f14374fe1356d6d51c245e485b576625e7ec6f44c42e9a637ed6b0bff5cb6f406b7edee386bfb5a899fa5ae9f24117c4b1fe649286651ece45b3dc2007cb8a163bf0598da48361c55d39a69163fa8fd24cf5f83655d23dca3ad961c62f356208552bb9ed529077096966d670c354e4abc9804f1746c08ca18217c32905e462e36ce3be39e772c180e86039b2783a2ec07a28fb5c55df06f4c52c9de2bcbf6955817183995497cea956ae515d2261898fa051015728e5a8aaac42dad33170d04507a33a85521abdf1cba64ecfb850458dbef0a8aea71575d060c7db3970f85a6e1e4c7abf5ae8cdb0933d71e8c94e04a25619dcee3d2261ad2ee6bf12ffa06d98a0864d87602733ec86a64521f2b18177b200cbbe117577a615d6c770988c0bad946e208e24fa074e5ab3143db5bfce0fd108e4b82d120a92108011a723c12a787e6d788719a10bdba5b2699c327186af4e23c1a946834b6150bda2583e9ca2ad44ce8dbbbc2db04de8ef92e8efc141fbecaa6287c59474e6bc05d99b2964fa090c3a2233ba186515be7ed1f612970cee2d7afb81bdd762170481cd0069127d5b05aa993b4ea988d8fddc186ffb7dc90a6c08f4df435c934063199ffffffffffffffff';

export const N = BigInt('0x' + N_HEX);
export const g = 5n;
export const N_BYTES = 512;

// --- BigInt <-> bytes helpers -------------------------------------------------

export const bytesToBigInt = (b: Uint8Array): bigint => {
  let hex = '0x0';
  for (const byte of b) hex += byte.toString(16).padStart(2, '0');
  return BigInt(hex);
};

/** Big-endian bytes with leading zeros trimmed (like `to_be_bytes_trimmed`). */
export const bigIntToBytes = (n: bigint): Uint8Array => {
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Left-pad with zeros to the group size. Source: srp.rs `pad_to_n`. */
export const padToN = (b: Uint8Array): Uint8Array => {
  if (b.length >= N_BYTES) return b;
  const out = new Uint8Array(N_BYTES);
  out.set(b, N_BYTES - b.length);
  return out;
};

export const modPow = (base: bigint, exp: bigint, mod: bigint): bigint => {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

const H = (...parts: Uint8Array[]): Uint8Array => sha256(concat(...parts));

/** k = H(N | PAD(g)). Source: srp crate utils.rs `compute_k`. */
export const computeK = (): bigint => bytesToBigInt(H(bigIntToBytes(N), padToN(bigIntToBytes(g))));

/** x = H(salt | H(I | ":" | P)). Source: srp crate client.rs `compute_x`. */
export const computeX = (identity: Uint8Array, password: Uint8Array, salt: Uint8Array): bigint =>
  bytesToBigInt(H(salt, H(identity, new TextEncoder().encode(':'), password)));

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
};

export class SrpClient {
  private readonly identity: Uint8Array;
  private readonly salt: Uint8Array;
  private loginKey: Uint8Array;
  private a: bigint;
  private readonly aPublic: Uint8Array;
  private m1?: Uint8Array;
  private sessionKey?: Uint8Array;

  /**
   * @param aPrivate only for tests; normally 64 random bytes, as in srp.rs.
   */
  constructor(srpUserID: string, srpSalt: Uint8Array, loginKey: Uint8Array, aPrivate?: Uint8Array) {
    if (loginKey.length !== 16) throw new Error('SRP login key must be 16 bytes');
    this.identity = new TextEncoder().encode(srpUserID);
    this.salt = srpSalt;
    this.loginKey = loginKey.slice();
    const aBytes = aPrivate ?? crypto.getRandomValues(new Uint8Array(64));
    this.a = bytesToBigInt(aBytes);
    this.aPublic = bigIntToBytes(modPow(g, this.a, N));
  }

  /** A, padded to 512 bytes ("Ente's SRP wire format pads A"). */
  publicA(): Uint8Array {
    return padToN(this.aPublic);
  }

  computeM1(serverB: Uint8Array): Uint8Array {
    if (serverB.length > N_BYTES) throw new Error('Server SRP value is too large');
    const B = bytesToBigInt(serverB);
    // Safeguard against a malicious B (srp crate client.rs `validate_b_pub`).
    if (B % N === 0n) throw new Error('Illegal SRP parameter B');

    const aPadded = padToN(this.aPublic);
    const bPadded = padToN(serverB);
    const u = bytesToBigInt(H(aPadded, bPadded));
    const k = computeK();
    const x = computeX(this.identity, this.loginKey, this.salt);

    const base = (((B - k * modPow(g, x, N)) % N) + N) % N;
    const S = modPow(base, this.a + u * x, N);
    const sPadded = padToN(bigIntToBytes(S));

    this.m1 = H(aPadded, bPadded, sPadded);
    this.sessionKey = H(sPadded);

    // Mirror srp.rs: forget the password-equivalent material once used.
    this.loginKey.fill(0);
    this.a = 0n;
    return this.m1;
  }

  /** Throws unless the server proved it knows the verifier. */
  verifyM2(serverM2: Uint8Array): void {
    if (!this.m1 || !this.sessionKey) throw new Error('Client proof not computed');
    const expected = H(padToN(this.aPublic), this.m1, this.sessionKey);
    if (!constantTimeEqual(expected, serverM2)) throw new Error('Server proof verification failed');
  }
}
