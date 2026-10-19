/**
 * End-to-end login/sync flows against the fake Ente server, using the same
 * modules the background script runs.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import sodium from 'libsodium-wrappers-sumo';
import { fakeBrowser } from '@webext-core/fake-browser';
import { FakeEnte, OTT, TOTP_CODE } from './fake-ente.ts';

await sodium.ready;
(fakeBrowser.runtime as { id: string }).id = 'duckling-test';
(globalThis as { browser?: unknown }).browser = fakeBrowser;

const account = await import('../lib/account.ts');
const { getCodes, syncAndGetCodes } = await import('../lib/sync.ts');
const { AppError } = await import('../lib/errors.ts');

const ORIGIN = 'https://api.ente.test';
const URIS = [
  'otpauth://totp/GitHub:tadas?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
  'otpauth://steam/Steam:gaben?secret=JBSWY3DPEHPK3PXQ&issuer=Steam',
  'otpauth://totp/Acme:me?secret=JBSWY3DPEHPK3PXR&issuer=Acme&digits=8&period=60&codeDisplay=%7B%22pinned%22%3Atrue%7D',
  'otpauth://totp/Old:gone?secret=JBSWY3DPEHPK3PXS&issuer=Old&codeDisplay=%7B%22trashed%22%3Atrue%7D',
];

let server: FakeEnte;
const use = (s: FakeEnte) => {
  server = s;
  globalThis.fetch = s.fetch as typeof fetch;
};

beforeEach(() => {
  fakeBrowser.reset();
  (fakeBrowser.runtime as { id: string }).id = 'duckling-test';
});

const rejectsWith = async (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof AppError && e.code === code);

const dumpLocal = async () => JSON.stringify(await fakeBrowser.storage.local.get(null));

const loginSRP = async () => {
  assert.equal((await account.startLogin(server.email, ORIGIN)).status, 'password');
  return account.submitPassword(server.password);
};

test('SRP login, sync, and decrypted codes', async () => {
  use(new FakeEnte({ uris: URIS }));
  const state = await loginSRP();
  assert.equal(state.status, 'unlocked');

  const res = await syncAndGetCodes();
  assert.equal(res.syncError, undefined);
  assert.deepEqual(res.codes.map((c) => c.issuer), ['Acme', 'GitHub', 'Steam'], 'pinned first, trashed hidden');
  assert.equal(res.codes[2]!.type, 'steam');
  assert.ok(Math.abs(res.timeOffset - 5000) < 1000, 'clock offset from server timestamp');

  // Security rule: nothing decrypted on disk.
  const local = await dumpLocal();
  for (const secret of ['JBSWY3DP', 'otpauth', sodium.to_base64(server.authKey, sodium.base64_variants.ORIGINAL)]) {
    assert.ok(!local.includes(secret), `storage.local must not contain ${secret}`);
  }
  assert.ok(local.includes(server.tokenB64URL), 'token is stored (allowed)');
  // The password never leaves the device.
  assert.ok(!server.calls.join().includes(server.password));
});

test('wrong password via SRP', async () => {
  use(new FakeEnte());
  await account.startLogin(server.email, ORIGIN);
  await rejectsWith(account.submitPassword('nope'), 'wrong-password');
  assert.equal((await account.getState()).status, 'password', 'can retry');
  assert.equal((await account.submitPassword(server.password)).status, 'unlocked');
});

test('email MFA + TOTP: code, 2FA, then password', async () => {
  use(new FakeEnte({ emailMFA: true, totp: true, uris: URIS.slice(0, 1) }));
  assert.equal((await account.startLogin(server.email, ORIGIN)).status, 'email-otp');
  await rejectsWith(account.submitEmailCode('000000'), 'wrong-code');
  assert.equal((await account.submitEmailCode(` ${OTT} `)).status, 'totp');
  await rejectsWith(account.submitTotp('000000'), 'wrong-code');
  assert.equal((await account.submitTotp(TOTP_CODE)).status, 'password');
  await rejectsWith(account.submitPassword('wrong'), 'wrong-password');
  assert.equal((await account.submitPassword(server.password)).status, 'unlocked');
  assert.equal((await syncAndGetCodes()).codes.length, 1);
});

test('SRP + TOTP finishes right after the 2FA code', async () => {
  use(new FakeEnte({ totp: true }));
  await account.startLogin(server.email, ORIGIN);
  assert.equal((await account.submitPassword(server.password)).status, 'totp');
  assert.equal((await account.submitTotp(TOTP_CODE)).status, 'unlocked');
  // The stashed KEK is gone once login completes.
  assert.deepEqual(Object.keys(await fakeBrowser.storage.session.get(null)), ['authKeyB64']);
});

test('passkey-only accounts get a clear error', async () => {
  use(new FakeEnte({ passkeyOnly: true }));
  await account.startLogin(server.email, ORIGIN);
  await rejectsWith(account.submitPassword(server.password), 'passkey-only');
  assert.equal((await account.getState()).status, 'logged-out');
});

test('unknown email and invalid server URL', async () => {
  use(new FakeEnte());
  await rejectsWith(account.startLogin('nobody@example.com', ORIGIN), 'no-account');
  await rejectsWith(account.startLogin(server.email, 'http://evil.example'), 'invalid-server-url');
  await rejectsWith(account.startLogin(server.email, 'not a url'), 'invalid-server-url');
});

test('browser restart = locked; unlock works offline', async () => {
  use(new FakeEnte({ uris: URIS }));
  await loginSRP();
  await syncAndGetCodes();
  await fakeBrowser.storage.session.clear(); // what Firefox does on close

  assert.equal((await account.getState()).status, 'locked');
  await rejectsWith(getCodes(), 'locked');

  server.opts.offline = true;
  await rejectsWith(account.submitPassword('wrong'), 'wrong-password');
  assert.equal((await account.submitPassword(server.password)).status, 'unlocked');
  const res = await syncAndGetCodes();
  assert.equal(res.codes.length, 3, 'cached codes still shown');
  assert.equal(res.syncError?.code, 'offline');
});

test('server down and no internet show errors, never empty', async () => {
  use(new FakeEnte());
  server.opts.serverDown = true;
  await rejectsWith(account.startLogin(server.email, ORIGIN), 'server');
  server.opts.serverDown = false;
  server.opts.offline = true;
  await rejectsWith(account.startLogin(server.email, ORIGIN), 'offline');
});

test('expired token logs out with a notice', async () => {
  use(new FakeEnte({ uris: URIS }));
  await loginSRP();
  server.tokenRevoked = true;
  await rejectsWith(syncAndGetCodes(), 'session-expired');
  const state = await account.getState();
  assert.equal(state.status, 'logged-out');
  assert.equal(state.status === 'logged-out' && state.notice?.code, 'session-expired');
  assert.equal(state.email, server.email, 'email kept for convenience');
});

test('incremental sync applies additions and deletions', async () => {
  use(new FakeEnte({ uris: URIS.slice(0, 2) }));
  await loginSRP();
  assert.equal((await syncAndGetCodes()).codes.length, 2);
  server.addEntity('otpauth://totp/New:x?secret=JBSWY3DPEHPK3PXT&issuer=New', 5000);
  server.entities[0] = { ...server.entities[0]!, isDeleted: true, encryptedData: '', header: '', updatedAt: 6000 };
  const callsBefore = server.calls.length;
  const res = await syncAndGetCodes();
  assert.deepEqual(res.codes.map((c) => c.issuer).sort(), ['New', 'Steam']);
  assert.ok(server.calls.slice(callsBefore).every((c) => c.includes('/authenticator/entity/diff')));
});

test('logout revokes token and clears account data', async () => {
  use(new FakeEnte({ uris: URIS }));
  await loginSRP();
  await syncAndGetCodes();
  assert.equal((await account.logout()).status, 'logged-out');
  assert.ok(server.tokenRevoked);
  assert.deepEqual(Object.keys(await fakeBrowser.storage.local.get(null)).sort(), ['apiOrigin', 'email']);
  assert.deepEqual(await fakeBrowser.storage.session.get(null), {});
});
