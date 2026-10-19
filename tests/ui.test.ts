import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeFromURIString, type Code } from '../lib/otp/code.ts';
import { iconFor, adaptiveColor, type IconIndex } from '../lib/ui/icons.ts';
import { siteFromUrl, matchesSite } from '../lib/ui/site-match.ts';
import { sortCodes, searchCodes, formatOTP, allTags, clockDrift, maskOTP } from '../lib/ui/list.ts';

const code = (issuer: string, account = '', display?: object, id = issuer + account): Code =>
  codeFromURIString(
    id,
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=JBSWY3DP&issuer=${encodeURIComponent(issuer)}` +
      (display ? `&codeDisplay=${encodeURIComponent(JSON.stringify(display))}` : ''),
  );

test('icons resolve like the official app', () => {
  const index = JSON.parse(readFileSync(new URL('../public/icons/index.json', import.meta.url), 'utf8')) as IconIndex;
  assert.deepEqual(iconFor(code('GitHub'), index, true), { kind: 'mono', path: 'c/github.svg', color: 'currentColor' });
  assert.equal(iconFor(code('Discord'), index, false).kind, 'mono');
  assert.deepEqual(iconFor(code('Google'), index, true), { kind: 'image', path: 'c/google.svg' });
  // "(" and "." splitting: "Steam (alt)" and "github.com" both find the base icon.
  assert.equal((iconFor(code('Steam (alt)'), index, true) as { path: string }).path, 's/steam.svg');
  assert.equal((iconFor(code('github.com'), index, true) as { path: string }).path, 'c/github.svg');
  // altNames: "Tutanota" -> Tuta icon.
  assert.equal((iconFor(code('Tutanota'), index, true) as { path: string }).path, 'c/tuta.svg');
  // Icon picked in the app wins over the issuer.
  assert.equal((iconFor(code('My work thing', '', { iconSrc: 'customIcon', iconID: 'GitLab' }), index, true) as { path: string }).path.includes('gitlab'), true);
  const letter = iconFor(code('KTU - viljan9'), index, true);
  assert.equal(letter.kind, 'letter');
  assert.equal(letter.kind === 'letter' && letter.letter, 'K');
  assert.deepEqual(iconFor(code(''), index, true), { kind: 'none' });
});

test('adaptive icon colour keeps near-black/white icons visible', () => {
  assert.equal(adaptiveColor('000000', true), 'currentColor');
  assert.equal(adaptiveColor('000000', false), '#000000');
  assert.equal(adaptiveColor('FFFFFF', false), 'currentColor');
  assert.equal(adaptiveColor('5865F2', true), '#5865F2');
});

test('site detection from tab URL', () => {
  assert.deepEqual(siteFromUrl('https://accounts.google.com/signin'), { host: 'accounts.google.com', label: 'google' });
  assert.deepEqual(siteFromUrl('https://www.bbc.co.uk/'), { host: 'bbc.co.uk', label: 'bbc' });
  for (const u of ['about:addons', 'moz-extension://x/popup.html', 'file:///tmp/a', 'http://localhost:8787', 'http://192.168.1.1/', undefined]) {
    assert.equal(siteFromUrl(u), undefined, String(u));
  }
});

test('site matching: names, words, aliases, domains; lookalikes rejected', () => {
  const at = (url: string, c: Code) => matchesSite(c, siteFromUrl(url)!);
  assert.ok(at('https://github.com/login', code('GitHub', 'tadas')));
  assert.ok(at('https://moodle.ktu.edu/', code('KTU - viljan9')));
  assert.ok(at('https://login.microsoftonline.com/', code('Microsoft')));
  assert.ok(at('https://x.com/i/flow/login', code('X')));
  assert.ok(at('https://store.steampowered.com/', code('Steam')));
  assert.ok(at('https://app.tuta.com/', code('Tutanota')));
  assert.ok(at('https://signin.aws.amazon.com/', code('Amazon Web Services')));
  assert.ok(at('https://dash.cloudflare.com/', code('cloudflare.com')));
  assert.ok(at('https://www.epicgames.com/id/login', code('Epic Games')));
  assert.ok(at('https://gitlab.example.org/', code('Work', '', { iconSrc: 'customIcon', iconID: 'example' })));
  // Lookalikes and unrelated sites
  assert.ok(!at('https://githuh.com/', code('GitHub')));
  assert.ok(!at('https://github.com.evil.io/', code('GitHub')));
  assert.ok(!at('https://gitlab.com/', code('GitHub')));
  assert.ok(!at('https://x.com/', code('Xero')));
  assert.ok(!at('https://example.com/', code('A')));
});

test('sorting: pinned first (except manual), usage-based orders', () => {
  const a = code('Alpha', 'z', { position: 2 }, 'a');
  const b = code('beta', 'y', { pinned: true, position: 3 }, 'b');
  const c = code('Charlie', 'x', { position: 1 }, 'c');
  const ids = (cs: Code[]) => cs.map((x) => x.id).join('');
  assert.equal(ids(sortCodes([c, a, b], 'issuer', {})), 'bac');
  assert.equal(ids(sortCodes([c, a, b], 'account', {})), 'bca');
  assert.equal(ids(sortCodes([a, b, c], 'manual', {})), 'cab');
  const usage = { a: { count: 1, last: 300 }, c: { count: 9, last: 100 } };
  assert.equal(ids(sortCodes([a, b, c], 'mostUsed', usage)), 'bca');
  assert.equal(ids(sortCodes([a, b, c], 'recent', usage)), 'bac');
});

test('search matches every word across issuer, account, note, tags', () => {
  const cs = [code('GitHub', 'tadas'), code('GitLab', 'work', { tags: ['Work'], note: 'company' }), code('Google', 'personal')];
  assert.deepEqual(searchCodes(cs, 'git tad').map((c) => c.issuer), ['GitHub']);
  assert.deepEqual(searchCodes(cs, 'work').map((c) => c.issuer), ['GitLab']);
  assert.deepEqual(searchCodes(cs, 'COMPANY').map((c) => c.issuer), ['GitLab']);
  assert.equal(searchCodes(cs, '  ').length, 3);
  assert.deepEqual(allTags([...cs, code('Z', '', { tags: ['Personal', 'Work'] })]), ['Personal', 'Work']);
});

test('code formatting and masking match the app', () => {
  assert.equal(formatOTP('123456'), '123 456');
  assert.equal(formatOTP('1234567'), '123 4 567');
  assert.equal(formatOTP('12345678'), '123 45 678');
  assert.equal(formatOTP('WFF8C'), 'WFF8C');
  assert.equal(maskOTP('123 456'), '••• •••');
});

test('clock drift warning', () => {
  assert.equal(clockDrift(5000), undefined);
  assert.match(clockDrift(40_000)!, /40 seconds behind/);
  assert.match(clockDrift(-600_000)!, /10 minutes ahead/);
});
