# Duckling – unofficial Ente Auth for Firefox

> Your 2FA codes, one click away.

**Unofficial. Not affiliated with or endorsed by Ente.** Duckling is a community
Firefox extension for people who already use [Ente Auth](https://ente.io/auth).

Status: early development (milestone 1 — skeleton).

## Build from source

Requirements: Node.js 22+, npm 10+.

```sh
npm ci
npm run build   # output: .output/firefox-mv3/
npm run zip     # AMO upload zip: .output/*.zip
```

Development with live reload (opens a temporary Firefox profile):

```sh
npm run dev
```

## Permissions

Duckling currently requests **no permissions**. Each permission added later will be
listed here with the reason it's needed.

## Credits & license

Duckling ports protocol and crypto logic from [ente-io/ente](https://github.com/ente-io/ente)
(AGPL-3.0). Thank you to the Ente team.

Licensed under [AGPL-3.0](LICENSE).
