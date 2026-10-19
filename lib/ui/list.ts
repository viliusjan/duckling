/** Sorting, searching and formatting for the code list (pure, unit-tested). */
import type { Code } from '../otp/code.ts';
import type { SortBy } from '../storage.ts';
import type { UsageMap } from '../usage.ts';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Sort like the official app (home_page.dart `_applySorting`): pinned codes
 * first for every order except "manual", which uses the app's own order.
 */
export const sortCodes = (codes: Code[], sortBy: SortBy, usage: UsageMap): Code[] => {
  const byIssuer = (a: Code, b: Code) =>
    collator.compare(a.issuer, b.issuer) || collator.compare(a.account ?? '', b.account ?? '');
  const compare: Record<SortBy, (a: Code, b: Code) => number> = {
    issuer: byIssuer,
    account: (a, b) => collator.compare(a.account ?? '', b.account ?? '') || byIssuer(a, b),
    manual: (a, b) => (a.codeDisplay?.position ?? 0) - (b.codeDisplay?.position ?? 0) || byIssuer(a, b),
    mostUsed: (a, b) => (usage[b.id]?.count ?? 0) - (usage[a.id]?.count ?? 0) || byIssuer(a, b),
    recent: (a, b) => (usage[b.id]?.last ?? 0) - (usage[a.id]?.last ?? 0) || byIssuer(a, b),
  };
  const sorted = [...codes].sort(compare[sortBy]);
  if (sortBy === 'manual') return sorted;
  return [...sorted.filter((c) => c.codeDisplay?.pinned), ...sorted.filter((c) => !c.codeDisplay?.pinned)];
};

/** Every word typed must appear in the issuer, account, note or a tag ("git tad"). */
export const searchCodes = (codes: Code[], query: string): Code[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return codes;
  return codes.filter((c) => {
    const hay = [c.issuer, c.account, c.codeDisplay?.note, ...(c.codeDisplay?.tags ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
};

export const allTags = (codes: Code[]): string[] =>
  [...new Set(codes.flatMap((c) => c.codeDisplay?.tags ?? []))].sort((a, b) => collator.compare(a, b));

/** Group digits like the app (code_widget.dart `_getFormattedCode`). */
export const formatOTP = (otp: string): string => {
  switch (otp.length) {
    case 6:
      return `${otp.slice(0, 3)} ${otp.slice(3)}`;
    case 7:
      return `${otp.slice(0, 3)} ${otp.slice(3, 4)} ${otp.slice(4)}`;
    case 8:
      return `${otp.slice(0, 3)} ${otp.slice(3, 5)} ${otp.slice(5)}`;
    case 9:
      return `${otp.slice(0, 3)} ${otp.slice(3, 6)} ${otp.slice(6)}`;
    default:
      return otp;
  }
};

export const maskOTP = (formatted: string): string => formatted.replace(/\S/g, '•');

/** Human clock-offset text, or undefined if the clock is fine (< 15 s off). */
export const clockDrift = (timeOffsetMs: number): string | undefined => {
  const s = Math.round(Math.abs(timeOffsetMs) / 1000);
  if (s < 15) return undefined;
  const amount = s < 120 ? `${s} seconds` : `${Math.round(s / 60)} minutes`;
  return `Your computer's clock is ${amount} ${timeOffsetMs > 0 ? 'behind' : 'ahead'}. Duckling corrects for it using Ente's server time.`;
};
