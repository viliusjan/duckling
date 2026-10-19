import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Secret } from 'otpauth';
import { codeFromURIString, generateOTPs, msRemaining } from '../lib/otp/code.ts';

const b32 = (ascii: string) => new Secret({ buffer: new TextEncoder().encode(ascii).buffer }).base32;

// RFC 6238 Appendix B test vectors (8 digits).
const RFC_SECRETS = {
  sha1: '12345678901234567890',
  sha256: '12345678901234567890123456789012',
  sha512: '1234567890123456789012345678901234567890123456789012345678901234',
} as const;
const RFC_VECTORS: [number, string, string, string][] = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

test('TOTP matches RFC 6238 vectors (8 digits, SHA-1/256/512)', () => {
  for (const [t, ...expected] of RFC_VECTORS) {
    (['sha1', 'sha256', 'sha512'] as const).forEach((alg, i) => {
      const code = codeFromURIString('x', `otpauth://totp/RFC:test?secret=${b32(RFC_SECRETS[alg])}&digits=8&algorithm=${alg.toUpperCase()}`);
      assert.equal(generateOTPs(code, 0, t * 1000)[0], expected[i], `${alg} @ ${t}`);
    });
  }
});

// Independent reference using node:crypto (different HMAC code path).
const refHOTP = (key: Buffer, counter: number, digits: number, alg = 'sha1') => {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const d = createHmac(alg, key).update(msg).digest();
  const o = d[d.length - 1]! & 15;
  return ((d.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0');
};
const refSteam = (key: Buffer, counter: number) => {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const d = createHmac('sha1', key).update(msg).digest();
  let v = d.readUInt32BE(d[d.length - 1]! & 15) & 0x7fffffff;
  let s = '';
  for (let i = 0; i < 5; i++) { s += '23456789BCDFGHJKMNPQRTVWXY'[v % 26]; v = Math.floor(v / 26); }
  return s;
};

test('Steam codes match an independent implementation', () => {
  const key = Buffer.from('steam-shared-secret-20b');
  const code = codeFromURIString('s', `otpauth://steam/Steam:gaben?secret=${b32(key.toString())}&issuer=Steam`);
  assert.equal(code.type, 'steam');
  assert.equal(code.length, 5);
  for (const t of [0, 59, 1700000000, 1792441270]) {
    const [otp, next] = generateOTPs(code, 0, t * 1000);
    assert.match(otp, /^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
    assert.equal(otp, refSteam(key, Math.floor(t / 30)), `steam @ ${t}`);
    assert.equal(next, refSteam(key, Math.floor(t / 30) + 1));
  }
});

test('non-30s period and 8 digits', () => {
  const key = Buffer.from('period-sixty-secret!');
  const code = codeFromURIString('p', `otpauth://totp/Acme:me@x.com?secret=${b32(key.toString())}&period=60&digits=8&issuer=Acme`);
  assert.equal(code.period, 60);
  assert.equal(code.length, 8);
  const t = 1792441270;
  assert.equal(generateOTPs(code, 0, t * 1000)[0], refHOTP(key, Math.floor(t / 60), 8));
  assert.equal(msRemaining(code, 0, 120_000 + 15_000), 45_000);
});

test('timeOffset shifts the clock', () => {
  const key = Buffer.from('offset-secret-123456');
  const code = codeFromURIString('o', `otpauth://totp/A?secret=${b32(key.toString())}`);
  assert.equal(generateOTPs(code, 30_000, 0)[0], refHOTP(key, 1, 6));
});

test('HOTP uses counter', () => {
  const code = codeFromURIString('h', `otpauth://hotp/RFC?secret=${b32(RFC_SECRETS.sha1)}&counter=1`);
  // RFC 4226 Appendix D: counter 1 -> 287082, counter 2 -> 359152
  assert.deepEqual(generateOTPs(code), ['287082', '359152']);
});

test('URI parsing mirrors Ente quirks', () => {
  const c = codeFromURIString('1', 'otpauth://totp/GitHub:tadas?secret=jbsw y3dp&issuer=GitHub&codeDisplay=%7B%22pinned%22%3Atrue%7D');
  assert.equal(c.issuer, 'GitHub');
  assert.equal(c.account, 'tadas');
  assert.equal(c.secret, 'JBSWY3DP');
  assert.equal(c.codeDisplay?.pinned, true);

  // Issuer from path; "-" separator fallback.
  assert.equal(codeFromURIString('2', 'otpauth://totp/Discord-me?secret=JBSWY3DP').issuer, 'Discord');
  // Old-app bug: period appended to issuer.
  assert.equal(codeFromURIString('3', 'otpauth://totp/x?secret=JBSWY3DP&issuer=Acme%26period%3D30').issuer, 'Acme');
  // Raw "#" in account name.
  assert.equal(codeFromURIString('4', 'otpauth://totp/Acme:a#b?secret=JBSWY3DP&issuer=Acme').account, 'a#b');
  // algorithm.sha256 spelling.
  assert.equal(codeFromURIString('5', 'otpauth://totp/A?secret=JBSWY3DP&algorithm=algorithm.sha256').algorithm, 'sha256');
  assert.throws(() => codeFromURIString('6', 'otpauth://totp/A?issuer=nosecret'));
  assert.throws(() => codeFromURIString('7', 'otpauth://weird/A?secret=JBSWY3DP'));
});
