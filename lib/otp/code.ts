/**
 * Parse otpauth:// URIs and generate codes.
 * Port of web/apps/auth/src/services/code.ts (ente-io/ente), kept
 * behaviour-identical so codes match the official app, including its
 * workarounds for URIs written by old Ente Auth versions.
 */
import { HOTP, TOTP } from 'otpauth';
import { steamOTP } from './steam.ts';

export type Algorithm = 'sha1' | 'sha256' | 'sha512';

export interface CodeDisplay {
  trashed?: boolean;
  pinned?: boolean;
  note?: string;
}

export interface Code {
  id: string;
  type: 'totp' | 'hotp' | 'steam';
  account?: string;
  issuer: string;
  length: number;
  period: number;
  algorithm: Algorithm;
  counter?: number;
  secret: string;
  codeDisplay: CodeDisplay | undefined;
}

export const codeFromURIString = (id: string, uriString: string): Code => {
  try {
    return parseURI(id, uriString);
  } catch (e) {
    // Legacy account names can contain a raw "#", which the URL parser treats
    // as a fragment. Retry with it escaped (same as Ente).
    if (uriString.includes('#')) return parseURI(id, uriString.replaceAll('#', '%23'));
    throw e;
  }
};

const parseURI = (id: string, uriString: string): Code => {
  const url = new URL(uriString);
  const [type, path] = parsePathname(url);
  return {
    id,
    type,
    account: parseAccount(path),
    issuer: parseIssuer(url, path),
    length: parseLength(url, type),
    period: parsePeriod(url),
    algorithm: parseAlgorithm(url),
    counter: parseCounter(url),
    secret: parseSecret(url),
    codeDisplay: parseCodeDisplay(url),
  };
};

const parsePathname = (url: URL): [Code['type'], string] => {
  // Safari puts "totp" in the host; Firefox/Chrome put "//totp/..." in the path.
  switch (url.host.toLowerCase()) {
    case 'totp':
      return ['totp', url.pathname];
    case 'hotp':
      return ['hotp', url.pathname];
    case 'steam':
      return ['steam', url.pathname];
  }
  const p = url.pathname.toLowerCase();
  if (p.startsWith('//totp')) return ['totp', url.pathname.slice(6)];
  if (p.startsWith('//hotp')) return ['hotp', url.pathname.slice(6)];
  if (p.startsWith('//steam')) return ['steam', url.pathname.slice(7)];
  throw new Error('Unsupported code type');
};

const parseAccount = (path: string): string | undefined => {
  let p = decodeURIComponent(path);
  if (p.startsWith('/')) p = p.slice(1);
  if (p.includes(':')) p = p.split(':').slice(1).join(':');
  return p;
};

const parseIssuer = (url: URL, path: string): string => {
  let issuer = url.searchParams.get('issuer');
  if (issuer) {
    // Old Ente Auth versions could append the period param to the issuer.
    const periodSuffixIndex = issuer.search(/&?period=\d+$/);
    if (periodSuffixIndex > 0 && !/\s/.test(issuer.charAt(periodSuffixIndex - 1))) {
      issuer = issuer.substring(0, periodSuffixIndex);
    }
    if (issuer.endsWith('period')) issuer = issuer.substring(0, issuer.length - 6);
    return issuer;
  }
  let p = decodeURIComponent(path);
  if (p.startsWith('/')) p = p.slice(1);
  if (p.includes(':')) p = p.split(':')[0]!;
  else if (p.includes('-')) p = p.split('-')[0]!;
  return p;
};

// "digits" in the URI, but Steam codes are letters, so Ente calls it length.
const parseLength = (url: URL, type: Code['type']): number =>
  parseInt(url.searchParams.get('digits') ?? '', 10) || (type === 'steam' ? 5 : 6);

const parsePeriod = (url: URL): number => parseInt(url.searchParams.get('period') ?? '', 10) || 30;

const parseAlgorithm = (url: URL): Algorithm => {
  switch (url.searchParams.get('algorithm')?.toLowerCase()) {
    case 'sha256':
    case 'algorithm.sha256':
      return 'sha256';
    case 'sha512':
    case 'algorithm.sha512':
      return 'sha512';
    default:
      return 'sha1';
  }
};

const parseCounter = (url: URL): number | undefined => {
  const c = url.searchParams.get('counter');
  return c ? parseInt(c, 10) : undefined;
};

const parseSecret = (url: URL): string => {
  const secret = url.searchParams.get('secret');
  if (!secret) throw new Error('Missing secret');
  return secret.replaceAll(' ', '').toUpperCase();
};

const parseCodeDisplay = (url: URL): CodeDisplay | undefined => {
  const s = url.searchParams.get('codeDisplay');
  if (!s) return undefined;
  try {
    const v: unknown = JSON.parse(s);
    if (typeof v !== 'object' || v === null) return undefined;
    const o = v as Record<string, unknown>;
    return {
      trashed: o.trashed === true ? true : undefined,
      pinned: o.pinned === true ? true : undefined,
      note: typeof o.note === 'string' ? o.note : undefined,
    };
  } catch {
    return undefined;
  }
};

/**
 * Current and next code. `timeOffset` corrects for local clock drift using the
 * server's clock (milliseconds), as in Ente's `generateOTPs`.
 */
export const generateOTPs = (code: Code, timeOffset = 0, now = Date.now()): [otp: string, next: string] => {
  const timestamp = now + timeOffset;
  const algorithm = code.algorithm.toUpperCase();
  switch (code.type) {
    case 'totp': {
      const totp = new TOTP({ secret: code.secret, algorithm, period: code.period, digits: code.length });
      return [
        totp.generate({ timestamp }),
        totp.generate({ timestamp: timestamp + code.period * 1000 }),
      ];
    }
    case 'hotp': {
      const counter = code.counter ?? 0;
      const hotp = new HOTP({ secret: code.secret, counter, algorithm, digits: code.length });
      return [hotp.generate({ counter }), hotp.generate({ counter: counter + 1 })];
    }
    case 'steam':
      return [
        steamOTP(code.secret, timestamp),
        steamOTP(code.secret, timestamp + code.period * 1000),
      ];
  }
};

/** Milliseconds left in the current period (TOTP/Steam). */
export const msRemaining = (code: Code, timeOffset = 0, now = Date.now()): number => {
  const periodMs = code.period * 1000;
  return periodMs - ((now + timeOffset) % periodMs);
};
