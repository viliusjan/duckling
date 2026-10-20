# Building Duckling from source

These steps reproduce the exact extension package submitted to
addons.mozilla.org (AMO). They are written for AMO reviewers but work for anyone.

## Requirements

- Linux, macOS or Windows
- **Node.js 22** (22.12 or newer; tested with 22.23.1) and **npm 10** (tested with 10.9.8)
- Internet access for `npm ci` (packages come only from the npm registry)

No other tools are needed. ImageMagick is used only to redraw the PNG icons
after editing their SVGs (`scripts/render-icons.sh`); the PNGs are committed.

## Steps

```sh
npm ci            # exact dependency versions from package-lock.json
npm run build     # builds into .output/firefox-mv3/
```

`npm run build` runs two steps:

1. `npm run icons`: `scripts/build-icons.ts` generates `public/icons/`
   (service icons + `index.json`) from `assets/ente-icons/` (committed) and the
   `simple-icons` npm package. The output is deterministic.
2. `wxt build -b firefox`: bundles the TypeScript/Preact sources with Vite.
   **Minification is turned off**, so the built JavaScript is readable and can
   be compared directly with the sources.

To produce the same zip that was uploaded: `npm run zip`, which writes
`.output/duckling-<version>-firefox.zip`.

## Checking the build matches

The build is reproducible: building twice gives byte-identical files. To compare
against the uploaded package:

```sh
cd .output/firefox-mv3 && find . -type f | sort | xargs sha256sum | sha256sum
```

and the same command inside the unzipped package from AMO.

## Notes for reviewers

- **Third-party code** is unmodified npm packages: `libsodium-wrappers-sumo`
  (crypto, same primitives as Ente's apps), `otpauth` and `@noble/hashes`
  (TOTP/HOTP), `preact` (UI). Fonts: `@fontsource/inter`. Icons:
  `simple-icons` plus Ente Auth's own icon set (`assets/ente-icons/`, AGPL-3.0,
  source commit in `SOURCE.md`).
- **`'wasm-unsafe-eval'` in the CSP** lets libsodium compile its bundled
  WebAssembly, which is needed for Argon2id key derivation. No JavaScript
  `eval`/`new Function` is used, and no code is loaded remotely.
- **`web-ext lint` warning `UNSAFE_VAR_ASSIGNMENT` (innerHTML)** comes from
  Preact's DOM diffing, which supports `dangerouslySetInnerHTML`. Duckling never
  uses that feature.
- **Network:** the only `fetch` that leaves the extension is the Ente API client
  in `lib/ente/api.ts`, to `https://api.ente.com` or the user's self-hosted
  server. The popup's `fetch('/icons/index.json')` reads a file bundled in the
  extension.
- **Storage:** all reads and writes go through `lib/storage.ts`, which lists
  what may be kept on disk (only encrypted data, the session token and
  settings) versus memory-only `storage.session` (the decrypted key).
- Each cryptographic step cites the matching file in
  [ente-io/ente](https://github.com/ente-io/ente) in a code comment.
- `npm test` runs the unit and end-to-end tests (a fake Ente server, no network).

## Test account

Reviewers can log in without an Ente account using the bundled fake server:

```sh
npm run fake-server
```

Then in Duckling choose "Using a self-hosted Ente server?", enter
`http://localhost:8787`, email `test@example.com`, password
`hunter2-but-longer`, two-factor code `123456`.
