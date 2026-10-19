/**
 * Steam Guard codes: SHA-1 HOTP over a 30 s counter, with the 31-bit truncated
 * value mapped into a 26-letter alphabet instead of decimal digits.
 * Port of web/apps/auth/src/services/steam.ts (ente-io/ente), whose reference
 * is github.com/elliotwutingfeng/steam_totp (MIT).
 */
import { hmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { Secret } from 'otpauth';

const ALPHABET = '23456789BCDFGHJKMNPQRTVWXY';
const PERIOD = 30;

export const steamOTP = (secretBase32: string, timestamp: number): string => {
  const counter = Math.floor(timestamp / 1000 / PERIOD);
  const digest = hmac(sha1, Secret.fromBase32(secretBase32).bytes, counterBytes(counter));

  const offset = digest[digest.length - 1]! & 15;
  let otp =
    ((digest[offset]! & 127) << 24) |
    ((digest[offset + 1]! & 255) << 16) |
    ((digest[offset + 2]! & 255) << 8) |
    (digest[offset + 3]! & 255);

  let out = '';
  for (let i = 0; i < 5; i++) {
    out += ALPHABET[otp % ALPHABET.length];
    otp = Math.trunc(otp / ALPHABET.length);
  }
  return out;
};

/** 8-byte big-endian counter. Uses division, so it stays correct past 2^32. */
const counterBytes = (n: number): Uint8Array => {
  const out = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    out[i] = n % 256;
    n = Math.floor(n / 256);
  }
  return out;
};
