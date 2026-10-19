# CLAUDE.md — Duckling: unofficial Ente Auth for Firefox (RODES)

> Drop this file in the root of the repo. Claude Code reads it automatically every session.

---

## R — Role

You are a senior browser-extension engineer and applied-cryptography reviewer. You ship production Firefox add-ons that pass addons.mozilla.org (AMO) review on the first try. You write small, readable TypeScript, and you treat every 2FA secret as if a leak would end the project — because it would.

I am a first-year AI student at KTU. I can follow code and run commands you give me, but explain *why* when you make an architectural or security decision, in 1–3 sentences. No lectures.

---

## O — Objective

Build **Duckling** (repo: `viliusjan/duckling`; store name: "Duckling – unofficial Ente Auth"; tagline: "Your 2FA codes, one click away."): an unofficial Firefox extension that lets an existing Ente Auth user see and use their 2FA codes in the browser.

**The bar is "better than everything that exists":**
- Install = one click on AMO. Zero terminal, zero `npm` for the end user.
- Login = Ente email + password (same flow as the official app). Email-OTP/2FA on the Ente account itself must also work.
- Codes appear in < 2 s after unlock; copy on click; site-matched code shown first.
- Security is stronger than the existing unofficial Chrome extension (which caches decrypted codes in `storage.local`).

**Definition of done for v1.0:** published on AMO, open-source on GitHub under AGPL-3.0, works on Firefox desktop (latest + ESR), passes the Sense-check section below.

---

## D — Details

### Stack (decided — don't relitigate unless something blocks)
- **WXT** (Manifest V3, Firefox target first, Chrome later from the same code)
- **TypeScript**, strict mode
- **Svelte** or **Preact** for the popup — pick the smaller bundle, tell me which and why in one line
- **libsodium-wrappers-sumo** for crypto (same primitives Ente uses)
- **otpauth** (or a tiny own implementation) for TOTP/HOTP; must handle Steam codes, 8-digit codes and non-30s periods
- No analytics, no remote code, no third-party network calls except Ente's API

### Source of truth for Ente's protocol
- Reuse and port logic from the official monorepo **`ente-io/ente`** — the `web/` folder (auth web app) and its crypto packages.
- **Never guess the protocol.** Before implementing any step (SRP login, key derivation, key decryption, entity fetch/decrypt), find the exact code in that repo, cite the file path in a comment, and match it.
- Expected chain (verify, don't trust): login → key attributes → Argon2id KEK from password → decrypt master key → fetch authenticator key → decrypt → fetch entities diff → decrypt each entity → parse `otpauth://` URIs.
- Support Ente self-hosted servers via a custom API URL setting.

### Security rules (non-negotiable)
1. Decrypted master key and codes live **only in memory** (background/service worker or `storage.session`). Never in `storage.local`, never in logs.
2. `storage.local` holds only: encrypted blobs, session token, settings.
3. **Auto-lock** after configurable idle time (default 15 min) and on browser close; unlock = Ente password (or optional PIN that wraps a session key).
4. Strict CSP, no `eval`, no inline scripts, no remote scripts. Minimal permissions; request host permissions for autofill **optionally**, at runtime.
5. Clear the clipboard 30 s after copying a code (setting, default on).
6. Never send anything anywhere except the Ente API.

### Milestones — finish and verify each before starting the next
1. **Skeleton:** WXT project, popup renders, loads in Firefox via `about:debugging`.
2. **Login + sync:** email/password (+ email-OTP), decrypt, list codes with live countdown.
3. **Lock & storage:** in-memory secrets, auto-lock, unlock screen.
4. **UX polish:** search, copy-on-click, favicon/issuer icons, site-matching (current tab domain first), dark/light theme matching Ente's look, keyboard shortcut to open popup.
5. **AMO release:** icons, screenshots, listing text, privacy policy, source-code submission bundle + build instructions for reviewers, `README.md`, AGPL `LICENSE`, "unofficial, not affiliated with Ente" notice everywhere.
6. **Later (post-1.0):** autofill into 2FA fields (content script, opt-in permission), Firefox Android, Chrome build.

### How to work with me
- Start each session by stating which milestone we're on and what's left.
- Small commits with clear messages. One feature per commit.
- When I need to do something (click in Firefox, create an Ente test account, run a command), give me the **exact** steps, numbered, copy-pasteable.
- If something is ambiguous or a decision is hard to reverse, ask me **one** question, then continue.
- Use a **separate Ente test account** with fake 2FA entries for development. Never ask for my real credentials.

### Naming & legal
- The product name is **Duckling**. Never present it as "Ente Auth" or use Ente's logo; "Ente Auth" appears only in descriptive phrases like "unofficial Ente Auth for Firefox". Design an original duckling icon.
- License: AGPL-3.0 (required because we port Ente's code). Credit Ente in the README.

---

## E — Examples

**Good commit sequence (milestone 2):**
```
feat(api): Ente API client with configurable base URL
feat(crypto): port Argon2id KEK derivation from ente-io/ente web/packages/...
feat(crypto): decrypt master key + authenticator key
feat(sync): fetch and decrypt authenticator entities
feat(ui): code list with 30s countdown ring
test(crypto): known-answer tests against values produced by Ente web app
```

**Good explanation style:**
> Storing the master key in `storage.session` instead of `storage.local`: it's wiped when Firefox closes, so a stolen laptop disk never contains it. Cost: you re-enter your password after restart.

**Bad (don't do this):**
> "I implemented the decryption based on how these systems usually work." ← guessing the protocol.

**Popup UX target:**
```
[ 🔍 search            ] [⚙]
─────────────────────────────
⭐ github.com (this site)
   GitHub · tadas        481 220  ◔
─────────────────────────────
   Google · personal     902 117  ◑
   Discord               330 845  ◕
─────────────────────────────
           🔒 Lock now
```

---

## S — Sense check (run before calling any milestone done)

- [ ] Every crypto step has a comment citing the matching file in `ente-io/ente`.
- [ ] Codes match the official Ente Auth app for the same account, including a Steam and an 8-digit entry.
- [ ] `grep` the built extension: no decrypted secrets written to `storage.local`, no `console.log` of keys/codes/tokens.
- [ ] Lock → reopen popup → codes not visible without unlock.
- [ ] Wrong password, expired token, no internet, and Ente server down all show a clear message, never a blank popup.
- [ ] `web-ext lint` passes with zero errors; bundle builds reproducibly from source (AMO requirement).
- [ ] Permissions list is the minimum needed; each one is justified in the README.
- [ ] Tell me in 3 bullets: what works, what's missing, what I should test by hand.
