/**
 * Builds the service icon set into public/icons/ (generated, not committed):
 *   public/icons/c/<file>.svg   Ente Auth custom icons (assets/ente-icons, AGPL-3.0)
 *   public/icons/s/<slug>.svg   Simple Icons (npm "simple-icons", CC0-1.0)
 *   public/icons/index.json     lookup key -> [path, hex | 0]
 *
 * Lookup keys follow the official app exactly:
 * mobile/apps/auth/lib/ui/utils/icon_utils.dart (ente-io/ente) `_loadJson`:
 * key = title with spaces removed, lowercased; custom icons also register
 * each altName; custom icons win over Simple Icons for the same key.
 *
 * Run: npm run icons (also runs before build and dev). Output is deterministic.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as simpleIcons from 'simple-icons';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'public/icons');
const CUSTOM = join(ROOT, 'assets/ente-icons');

const key = (title: string) => title.replaceAll(' ', '').toLowerCase();

/** SVGs are shown as images (scripts never run), but strip active content anyway. */
const sanitize = (svg: string) =>
  svg
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'c'), { recursive: true });
mkdirSync(join(OUT, 's'), { recursive: true });

/** [path relative to /icons/, hex or 0 (= keep the SVG's own colours)] */
const index: Record<string, [string, string | 0]> = {};

// Simple Icons first, so custom icons overwrite them (custom wins in Ente).
for (const icon of Object.values(simpleIcons) as { title: string; slug: string; hex: string; path: string }[]) {
  if (!icon?.slug || !icon.path) continue;
  writeFileSync(
    join(OUT, 's', `${icon.slug}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${icon.path}"/></svg>`,
  );
  index[key(icon.title)] = [`s/${icon.slug}.svg`, icon.hex];
}

const customFiles = new Set(readdirSync(join(CUSTOM, 'icons')));
for (const file of customFiles) {
  writeFileSync(join(OUT, 'c', file), sanitize(readFileSync(join(CUSTOM, 'icons', file), 'utf8')));
}

const data = JSON.parse(readFileSync(join(CUSTOM, 'custom-icons.json'), 'utf8')) as {
  icons: { title: string; slug?: string; hex?: string; altNames?: string[] }[];
};
let missing = 0;
for (const icon of data.icons) {
  const titleKey = key(icon.title);
  // icon_utils.dart: file is "<slug ?? titleKey>.svg"; altNames use the same file.
  const file = `${icon.slug ?? titleKey}.svg`;
  if (!customFiles.has(file)) {
    missing++;
    continue;
  }
  const entry: [string, string | 0] = [`c/${file}`, icon.hex ?? 0];
  index[titleKey] = entry;
  for (const alt of icon.altNames ?? []) index[key(alt)] = entry;
}

const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => (a < b ? -1 : 1)));
writeFileSync(join(OUT, 'index.json'), JSON.stringify(sorted));
console.log(
  `icons: ${Object.keys(sorted).length} names, ${customFiles.size} custom + simple-icons` +
    (missing ? ` (${missing} custom entries without a file skipped)` : ''),
);
