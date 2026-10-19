/**
 * Which icon to show for a code. Port of getIcon / _getAdaptiveColor /
 * _fallbackAvatar in mobile/apps/auth/lib/ui/utils/icon_utils.dart (ente-io/ente),
 * so codes get the same icons as in the official app.
 */
import type { Code } from '../otp/code.ts';

/** key -> [path under /icons/, hex or 0 for "keep the SVG's colours"]. Built by scripts/build-icons.ts. */
export type IconIndex = Record<string, [string, string | 0]>;

export type IconChoice =
  | { kind: 'mono'; path: string; color: string } // single-colour SVG, tinted
  | { kind: 'image'; path: string } // multi-colour SVG, as is
  | { kind: 'letter'; letter: string; color: string }
  | { kind: 'none' };

const providerKey = (s: string) => s.replaceAll(' ', '').toLowerCase();

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Ente's avatar palette (colors.dart `avatarDark`). */
const AVATAR_COLORS = [
  '118,84,154', '223,120,97', '148,180,159', '135,162,251', '198,137,198', '147,125,194', '50,82,136',
  '133,180,224', '193,163,163', '225,160,89', '66,97,101', '107,119,178', '149,127,239', '221,157,226',
  '130,171,139', '155,187,232', '143,190,190', '138,195,161', '168,176,242', '176,198,149', '233,154,173',
  '209,132,132', '120,181,167',
].map((rgb) => `rgb(${rgb})`);

/** Stable string hash (Ente uses Dart's hashCode, which JS can't reproduce). */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Relative luminance, as Flutter's Color.computeLuminance. */
const luminance = (r: number, g: number, b: number) => {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/**
 * Brand colour, unless it's a neutral grey that would vanish on the background
 * (near-white in light mode, near-black in dark mode): then the text colour.
 */
export const adaptiveColor = (hex: string, dark: boolean): string => {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const grey = Math.abs(r - g) <= 3 && Math.abs(g - b) <= 3 && Math.abs(b - r) <= 3;
  const l = luminance(r, g, b);
  if (grey && ((!dark && l > 0.7) || (dark && l < 0.05))) return 'currentColor';
  return `#${hex}`;
};

export const iconFor = (code: Code, index: IconIndex, dark: boolean): IconChoice => {
  const d = code.codeDisplay;
  // A custom icon picked in the app overrides the issuer (code_widget.dart `_getIcon`).
  const provider = safeDecode(d?.iconSrc && d.iconID ? d.iconID : code.issuer).trim();
  const title = providerKey(provider);
  const candidates = [title, ...['(', '.'].filter((c) => title.includes(c)).map((c) => title.split(c)[0]!)];
  for (const t of candidates) {
    const hit = index[t];
    if (hit) {
      const [path, hex] = hit;
      return hex ? { kind: 'mono', path, color: adaptiveColor(hex, dark) } : { kind: 'image', path };
    }
  }
  if (!title) return { kind: 'none' };
  return { kind: 'letter', letter: title[0]!.toUpperCase(), color: AVATAR_COLORS[hash(title) % AVATAR_COLORS.length]! };
};
