# AMO listing: copy these into the submission form

## Name (max 50 characters)

```
Duckling – unofficial Ente Auth
```

## Add-on URL (slug)

```
duckling-ente-auth
```

## Summary (max 250 characters)

```
Your Ente Auth 2FA codes in Firefox. Codes for the site you're on come first; copy with one click or Enter. Auto-lock, PIN unlock, end-to-end encrypted. Unofficial, not affiliated with Ente.
```

## Description

```
Duckling shows the two-factor (2FA) codes from your Ente Auth account right in Firefox, so you don't have to reach for your phone.

Duckling is an unofficial, open-source extension. It is not made by, affiliated with, or endorsed by Ente. You need an existing Ente Auth account (ente.com/auth); Duckling only reads your codes and never changes your account.

WHY DUCKLING
• One click: codes for the website you're on are shown first. Click to copy.
• Keyboard first: press Ctrl+Shift+2, type a few letters, press Enter, paste. Duckling closes itself after copying.
• Feels like Ente Auth: the same service icons, tags, pinned codes, countdown and next code as the official app. Light and dark theme, compact list.
• Works with everything Ente Auth supports: TOTP, HOTP, Steam Guard, 8-digit codes and any time period.
• Self-hosted Ente servers supported.

SECURITY
• Your password never leaves your device. Login uses SRP, like the official apps, including email verification and authenticator-app two-factor login.
• Your codes stay end-to-end encrypted. They are decrypted only on your device, and nothing decrypted is ever saved to disk.
• Auto-lock after inactivity (default 15 minutes), when your computer locks, and when Firefox closes. Unlock with your password or an optional PIN.
• The clipboard is cleared 30 seconds after you copy a code.
• Matching codes to sites uses the real domain, so lookalike phishing sites don't get your code.
• No analytics, no tracking, no ads. Duckling only talks to Ente's servers (or yours).

ABOUT THE DATA PROMPT
At install, Firefox says Duckling handles "authentication information" and "personally identifying information". That's your email address and login proof, sent only to your own Ente account to log you in. The Duckling developer receives nothing.

OPEN SOURCE
Licensed under AGPL-3.0. Source code, build instructions and issue tracker: https://github.com/viliusjan/duckling
Protocol and crypto logic are ported from Ente's open-source apps. Thank you to the Ente team.

Not yet supported: passkey two-factor login on your Ente account (add an authenticator-app second factor in Ente to log in), and adding or editing codes (use the Ente Auth app).
```

## Categories

- Privacy & Security

## Tags

```
2fa, authenticator, totp, otp, security, ente, two-factor
```

## Support

- Support website: `https://github.com/viliusjan/duckling/issues`
- Homepage: `https://github.com/viliusjan/duckling`
- Support email: optional, leave empty unless you want a public contact address.

## License

GNU Affero General Public License v3.0 (AGPL-3.0)

## Privacy policy

Paste the contents of `privacy-policy.txt` (plain-text copy of `PRIVACY.md`; AMO does not render Markdown tables).

## Screenshots (1280×800, upload in this order)

| File | Caption |
| --- | --- |
| `screenshots/1-this-site.png` | Codes for the site you're on come first. |
| `screenshots/2-keyboard.png` | Ctrl+Shift+2, type, Enter, paste. |
| `screenshots/3-like-ente.png` | Same icons, tags and pins as Ente Auth. Compact list shown. |
| `screenshots/4-lock.png` | Auto-lock with optional PIN unlock. |
| `screenshots/5-private.png` | Security settings. |

All screenshots use a test account with made-up entries.

## Version 1.0.0 release notes

```
First release.
• Log in with your Ente account (SRP, email code, authenticator-app 2FA).
• Codes for the current site first, search, tags, keyboard shortcuts.
• Auto-lock, PIN unlock, clipboard clearing.
• TOTP, HOTP, Steam and 8-digit codes. Self-hosted servers.
```

## Notes to reviewer

```
Source code: the attached source archive is `git archive` of the tagged commit. Build steps are in BUILDING.md (Node 22, npm 10: `npm ci && npm run build`, output in .output/firefox-mv3/). Minification is off, and the build is reproducible (byte-identical).

Testing without an Ente account: run `npm run fake-server` from the sources. In Duckling click "Using a self-hosted Ente server?", enter http://localhost:8787, email test@example.com, password hunter2-but-longer, 2FA code 123456. (The key derivation intentionally takes a few seconds.)

Notes:
- 'wasm-unsafe-eval' in the CSP is for libsodium's bundled WebAssembly (Argon2id). No JS eval, no remote code.
- The web-ext lint innerHTML warning is inside Preact's renderer (dangerouslySetInnerHTML support), which Duckling doesn't use.
- Data collection permissions declare authenticationInfo and personallyIdentifyingInfo because the user's email and SRP login proof are sent to Ente's API (the user's own account). Nothing goes to the developer.
- The only network destination is the Ente API (lib/ente/api.ts). activeTab is used only to read the current tab URL locally, to sort matching codes first.
```
