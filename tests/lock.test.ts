/** Milestone 3: fast unlock, auto-lock, PIN, clipboard clearing, new-codes bug. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import sodium from 'libsodium-wrappers-sumo';
import { fakeBrowser } from '@webext-core/fake-browser';
import { FakeEnte } from './fake-ente.ts';

await sodium.ready;
(globalThis as { browser?: unknown }).browser = fakeBrowser;

// Record clipboard writes (Node has no clipboard).
const clipboardWrites: string[] = [];
Object.defineProperty(globalThis.navigator, 'clipboard', {
  value: { writeText: async (t: string) => void clipboardWrites.push(t) },
  configurable: true,
});

const account = await import('../lib/account.ts');
const lockMod = await import('../lib/lock.ts');
const pin = await import('../lib/pin.ts');
const settings = await import('../lib/settings.ts');
const { syncAndGetCodes, getCodes } = await import('../lib/sync.ts');
const { AppError } = await import('../lib/errors.ts');

const ORIGIN = 'https://api.ente.test';
const URI = 'otpauth://totp/GitHub:tadas?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';
let server: FakeEnte;

beforeEach(() => {
  fakeBrowser.reset();
  (fakeBrowser.runtime as { id: string }).id = 'duckling-test';
  clipboardWrites.length = 0;
});

const rejectsWith = (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof AppError && e.code === code);
const status = async () => (await account.getState()).status;
const restartBrowser = () => fakeBrowser.storage.session.clear();

const login = async (opts: ConstructorParameters<typeof FakeEnte>[0] = { uris: [URI] }) => {
  server = new FakeEnte({ opsLimit: 3, memLimit: 128 * 1024 * 1024, ...opts });
  globalThis.fetch = server.fetch as typeof fetch;
  await account.startLogin(server.email, ORIGIN);
  assert.equal((await account.submitPassword(server.password)).status, 'unlocked');
};

test('login stores fast-unlock attributes; unlock uses them', async () => {
  await login();
  const { unlockKeyAttributes, keyAttributes } = await fakeBrowser.storage.local.get(['unlockKeyAttributes', 'keyAttributes']);
  assert.equal(unlockKeyAttributes.memLimit, 67_108_864, 'Ente interactive params');
  assert.equal(unlockKeyAttributes.opsLimit, 2);
  assert.notEqual(unlockKeyAttributes.encryptedKey, keyAttributes.encryptedKey);

  await restartBrowser();
  // Make the full-strength attributes unusable: unlock must not need them.
  await fakeBrowser.storage.local.set({ keyAttributes: { ...keyAttributes, encryptedKey: 'AAAA' } });
  await rejectsWith(account.submitPassword('wrong'), 'wrong-password');
  assert.equal((await account.submitPassword(server.password)).status, 'unlocked');
});

test('SRP + 2FA login also gets fast unlock (interactive KEK stashed during 2FA)', async () => {
  server = new FakeEnte({ totp: true });
  globalThis.fetch = server.fetch as typeof fetch;
  await account.startLogin(server.email, ORIGIN);
  await account.submitPassword(server.password);
  const { pending } = await fakeBrowser.storage.session.get('pending');
  assert.ok(pending.unlockKek, 'stashed in memory while waiting for 2FA');
  await account.submitTotp('123456');
  assert.ok((await fakeBrowser.storage.local.get('unlockKeyAttributes')).unlockKeyAttributes);
});

test('installs from before fast unlock get it on next password unlock', async () => {
  await login();
  await fakeBrowser.storage.local.remove('unlockKeyAttributes');
  await lockMod.lock();
  await account.submitPassword(server.password);
  assert.ok((await fakeBrowser.storage.local.get('unlockKeyAttributes')).unlockKeyAttributes);
});

test('auto-lock after idle time, via alarm and via the request-time check', async () => {
  await login();
  const alarm = await fakeBrowser.alarms.get(lockMod.AUTOLOCK_ALARM);
  assert.ok(alarm && Math.abs(alarm.scheduledTime - (Date.now() + 15 * 60_000)) < 5000, 'default 15 min');

  await lockMod.enforceAutoLock(Date.now() + 14 * 60_000);
  assert.equal(await status(), 'unlocked');
  await lockMod.enforceAutoLock(Date.now() + 15 * 60_000 + 1);
  assert.equal(await status(), 'locked');
  await rejectsWith(getCodes(), 'locked');
  assert.equal(await fakeBrowser.alarms.get(lockMod.AUTOLOCK_ALARM), undefined);
});

test('"only when Firefox closes" never auto-locks', async () => {
  await login();
  await settings.updateSettings({ autoLockMinutes: 0 });
  assert.equal(await fakeBrowser.alarms.get(lockMod.AUTOLOCK_ALARM), undefined);
  await lockMod.enforceAutoLock(Date.now() + 365 * 24 * 3600_000);
  assert.equal(await status(), 'unlocked');
  await rejectsWith(settings.updateSettings({ autoLockMinutes: 7 }), 'unknown');
});

test('locks when the computer locks (setting on by default)', async () => {
  await login();
  await lockMod.onIdleStateChanged('idle');
  assert.equal(await status(), 'unlocked');
  await settings.updateSettings({ lockOnSystemLock: false });
  await lockMod.onIdleStateChanged('locked');
  assert.equal(await status(), 'unlocked');
  await settings.updateSettings({ lockOnSystemLock: true });
  await lockMod.onIdleStateChanged('locked');
  assert.equal(await status(), 'locked');
});

test('PIN: unlock, wrong attempts, lock-out, restart requires password', async () => {
  await login();
  await rejectsWith(pin.setPin('12'), 'pin-too-short');
  await pin.setPin('2468');
  const local = JSON.stringify(await fakeBrowser.storage.local.get(null));
  assert.ok(!local.includes('pinWrapped'), 'PIN-wrapped key never on disk');

  await lockMod.lock();
  let state = await account.getState();
  assert.ok(state.status === 'locked' && state.pin);
  await rejectsWith(pin.unlockWithPin('0000'), 'wrong-pin');
  await pin.unlockWithPin('2468');
  assert.equal(await status(), 'unlocked');

  await lockMod.lock();
  for (let i = 0; i < 4; i++) await rejectsWith(pin.unlockWithPin('1111'), 'wrong-pin');
  await rejectsWith(pin.unlockWithPin('1111'), 'pin-locked-out');
  state = await account.getState();
  assert.ok(state.status === 'locked' && !state.pin, 'password required now');
  await rejectsWith(pin.unlockWithPin('2468'), 'pin-unavailable');

  // Password unlock re-arms the PIN for this browser session.
  await account.submitPassword(server.password);
  await lockMod.lock();
  state = await account.getState();
  assert.ok(state.status === 'locked' && state.pin);

  // After a Firefox restart the PIN can't be used until the password is entered.
  await restartBrowser();
  state = await account.getState();
  assert.ok(state.status === 'locked' && !state.pin);
  await account.submitPassword(server.password);
  await lockMod.lock();
  await pin.unlockWithPin('2468');
  assert.equal((await syncAndGetCodes()).codes.length, 1);
});

test('PIN needs codes to exist; removing it works', async () => {
  server = new FakeEnte({});
  server.hasAuthKey = false; // fresh account: no authenticator key yet
  globalThis.fetch = server.fetch as typeof fetch;
  await account.startLogin(server.email, ORIGIN);
  await account.submitPassword(server.password);
  await rejectsWith(pin.setPin('2468'), 'no-codes-yet');
  assert.equal((await settings.getSettingsView()).canSetPin, false);

  await login();
  await pin.setPin('2468');
  assert.equal((await settings.getSettingsView()).pinEnabled, true);
  await pin.removePin();
  assert.equal((await settings.getSettingsView()).pinEnabled, false);
  await lockMod.lock();
  const state = await account.getState();
  assert.ok(state.status === 'locked' && !state.pin);
});

test('codes added after login: sync locks and asks for the password, then shows them', async () => {
  server = new FakeEnte({});
  server.hasAuthKey = false;
  globalThis.fetch = server.fetch as typeof fetch;
  await account.startLogin(server.email, ORIGIN);
  await account.submitPassword(server.password);
  assert.deepEqual((await syncAndGetCodes()).codes, []);

  // User adds 3 codes in the Ente app: key gets created, entities appear.
  server.hasAuthKey = true;
  ['GitHub', 'Steam', 'Acme'].forEach((n, i) => server.addEntity(`otpauth://totp/${n}?secret=JBSWY3DPEHPK3PX${i}&issuer=${n}`, 2000 + i));

  await rejectsWith(syncAndGetCodes(), 'locked');
  const state = await account.getState();
  assert.ok(state.status === 'locked' && state.notice?.message.includes('New codes'));
  await account.submitPassword(server.password);
  const res = await syncAndGetCodes();
  assert.equal(res.unreadable, 0);
  assert.deepEqual(res.codes.map((c) => c.issuer), ['Acme', 'GitHub', 'Steam']);
});

test('clipboard cleared 30 s after copy, or on lock; setting can turn it off', async () => {
  await login();
  await lockMod.scheduleClipboardClear();
  const alarm = await fakeBrowser.alarms.get(lockMod.CLIPBOARD_ALARM);
  assert.ok(alarm && Math.abs(alarm.scheduledTime - (Date.now() + 30_000)) < 2000);
  await lockMod.onAlarm({ name: lockMod.CLIPBOARD_ALARM });
  assert.deepEqual(clipboardWrites, ['']);

  await lockMod.scheduleClipboardClear();
  await lockMod.lock();
  assert.deepEqual(clipboardWrites, ['', ''], 'pending clear runs immediately on lock');

  await account.submitPassword(server.password);
  await settings.updateSettings({ clearClipboard: false });
  await lockMod.scheduleClipboardClear();
  assert.equal(await fakeBrowser.alarms.get(lockMod.CLIPBOARD_ALARM), undefined);
});

test('logout clears PIN and lock state but keeps settings', async () => {
  await login();
  await settings.updateSettings({ autoLockMinutes: 60 });
  await pin.setPin('2468');
  await account.logout();
  const keys = Object.keys(await fakeBrowser.storage.local.get(null)).sort();
  assert.deepEqual(keys, ['apiOrigin', 'email', 'settings']);
  assert.deepEqual(await fakeBrowser.storage.session.get(null), {});
});
