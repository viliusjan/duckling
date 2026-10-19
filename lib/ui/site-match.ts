/**
 * Which codes belong to the site in the current tab. Deliberately strict:
 * matching on the real domain is also a phishing guard, since a lookalike
 * domain (githuh.com) won't surface your GitHub code.
 */
import type { Code } from '../otp/code.ts';

/** Common two-part public suffixes, so "bbc.co.uk" -> "bbc". */
const TWO_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'ne.jp', 'or.jp',
  'com.br', 'com.mx', 'com.ar', 'com.tr', 'com.cn', 'com.hk', 'com.tw', 'com.sg', 'co.in', 'co.kr', 'co.za',
  'com.pl', 'com.ua', 'co.il', 'co.id',
]);

/** Services whose usual issuer name differs from their domains. Keys are normalized issuers. */
const ALIASES: Record<string, string[]> = {
  microsoft: ['microsoft.com', 'live.com', 'microsoftonline.com', 'office.com', 'outlook.com', 'azure.com', 'xbox.com', 'skype.com', 'bing.com'],
  microsoft365: ['microsoft.com', 'microsoftonline.com', 'office.com'],
  azure: ['azure.com', 'microsoftonline.com'],
  google: ['google.com', 'youtube.com', 'gmail.com'],
  aws: ['aws.amazon.com', 'amazonaws.com'],
  amazonwebservices: ['aws.amazon.com', 'amazonaws.com'],
  x: ['x.com', 'twitter.com'],
  twitter: ['x.com', 'twitter.com'],
  facebook: ['facebook.com', 'meta.com'],
  meta: ['meta.com', 'facebook.com'],
  apple: ['apple.com', 'icloud.com'],
  appleid: ['apple.com', 'icloud.com'],
  steam: ['steampowered.com', 'steamcommunity.com'],
  battlenet: ['battle.net', 'blizzard.com'],
  blizzard: ['battle.net', 'blizzard.com'],
  playstation: ['playstation.com', 'sonyentertainmentnetwork.com'],
  sony: ['playstation.com', 'sonyentertainmentnetwork.com', 'sony.com'],
  proton: ['proton.me', 'protonmail.com'],
  protonmail: ['proton.me', 'protonmail.com'],
  tuta: ['tuta.com', 'tutanota.com'],
  tutanota: ['tuta.com', 'tutanota.com'],
  ente: ['ente.io', 'ente.com'],
  bitwarden: ['bitwarden.com', 'bitwarden.eu'],
  atlassian: ['atlassian.com', 'atlassian.net', 'bitbucket.org'],
  npm: ['npmjs.com'],
  ovh: ['ovh.com', 'ovhcloud.com'],
  linode: ['linode.com', 'akamai.com'],
  epicgames: ['epicgames.com', 'unrealengine.com'],
  ea: ['ea.com', 'origin.com'],
  ubisoft: ['ubisoft.com', 'ubi.com'],
  wordpress: ['wordpress.com', 'wordpress.org'],
  yahoo: ['yahoo.com', 'aol.com'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface Site {
  host: string; // without "www."
  label: string; // registrable label: "accounts.google.com" -> "google"
}

/** Only real web pages; not about:, file:, moz-extension:, IP addresses or localhost. */
export const siteFromUrl = (url: string | undefined): Site | undefined => {
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return undefined;
  const parts = host.split('.');
  const suffixLen = TWO_PART_SUFFIXES.has(parts.slice(-2).join('.')) ? 2 : 1;
  const label = parts[parts.length - suffixLen - 1];
  return label ? { host, label } : undefined;
};

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith('.' + domain);

/** Issuer name (or a domain written as the issuer) belongs to this site. */
const nameMatches = (name: string, site: Site): boolean => {
  if (!name) return false;
  const n = norm(name);
  if (!n) return false;
  if (ALIASES[n]?.some((d) => hostMatches(site.host, d))) return true;
  if (n === site.label || n === norm(site.host)) return true;
  // Issuer written as a domain, e.g. "github.com" or "login.example.org".
  const asSite = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(name.trim()) ? siteFromUrl(`https://${name.trim()}`) : undefined;
  if (asSite && (hostMatches(site.host, asSite.host) || asSite.label === site.label)) return true;
  // Any word of the issuer, e.g. "KTU - viljan9" on ktu.edu, "Google Cloud" on google.com.
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w.length >= 2 && w === site.label);
};

export const matchesSite = (code: Code, site: Site): boolean =>
  nameMatches(code.issuer, site) || nameMatches(code.codeDisplay?.iconID ?? '', site);
