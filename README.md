# Duckling – unofficial Ente Auth for Firefox

> Your 2FA codes, one click away.

**Unofficial. Not affiliated with or endorsed by Ente.** Duckling is a community
Firefox extension for people who already use [Ente Auth](https://ente.io/auth).

Status: in development (milestone 2: login and sync).

## What it does

- Log in with your Ente email and password, including email verification and
  authenticator-app (TOTP) two-factor login on your Ente account.
- Shows your codes with a live countdown. Click a code to copy it.
- Supports TOTP, HOTP, Steam, 8-digit codes and any period, the same way the
  official app parses them.
- Works with self-hosted Ente servers.
- Not yet: passkey two-factor login (use a TOTP second factor for now).

## Security model

| Where | What | When it's cleared |
| --- | --- | --- |
| Disk (`storage.local`) | Session token, server URL, email, and **encrypted** data only: Ente's key attributes, the encrypted authenticator key, the encrypted 2FA entries | On logout |
| Memory (`storage.session`) | The decrypted authenticator key | When Firefox closes (or you log out) |
| Nowhere | Your password, master key, private key, decrypted codes | Wiped right after use |

- Your password never leaves the device. Login uses SRP, the same
  zero-knowledge protocol as the official apps.
- Only the *authenticator* key is kept unlocked. Your master key, which could
  also decrypt other Ente data, is wiped as soon as login finishes.
- After a browser restart Duckling is locked until you enter your password.
- Network requests go only to the Ente API (or your self-hosted server).
  No analytics, no remote code.
- Strict content security policy: only the extension's own scripts run.
  `wasm-unsafe-eval` is allowed so libsodium can compile its WebAssembly
  (needed for Argon2id). It does not allow JavaScript `eval`.

Every cryptographic step cites the matching file in
[ente-io/ente](https://github.com/ente-io/ente) in a code comment. The SRP
client is tested against a known-answer vector from Ente's own server code.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save your encrypted codes and session, and keep the unlocked key in memory-only session storage. |

No host permissions. Duckling can't read or change any website. Ente's API
allows requests from extensions directly.

## Build from source

Requirements: Node.js 22+, npm 10+.

```sh
npm ci
npm run build   # output: .output/firefox-mv3/
npm run zip     # AMO upload zip: .output/*.zip
```

## Development

```sh
npm run dev          # live reload in a temporary Firefox profile
npm test             # unit + end-to-end flow tests (no network)
npm run compile      # type-check
npm run lint:ext     # web-ext lint (after a build)
npm run fake-server  # local fake Ente API for UI work, see below
```

The fake server lets you try every screen without a real account. Start it,
then log in through Duckling with:

- Server: `http://localhost:8787` (click "Using a self-hosted server?")
- Email: `test@example.com`
- Password: `hunter2-but-longer`
- Two-factor code: `123456`

It uses the same 1 GiB Argon2id settings as real Ente accounts, so the password
step takes a few seconds, just like the real thing.

## Credits & license

Duckling ports protocol and crypto logic from [ente-io/ente](https://github.com/ente-io/ente)
(AGPL-3.0). Thank you to the Ente team.

Licensed under [AGPL-3.0](LICENSE).
