# Duckling privacy policy

_Last updated: 20 October 2026_

Duckling is an unofficial Firefox extension that shows the two-factor (2FA)
codes from your own [Ente Auth](https://ente.com/auth) account. It is not made
by, affiliated with, or endorsed by Ente.

**In short:** Duckling talks only to Ente's servers (or your self-hosted Ente
server), and only to log you in and fetch your end-to-end encrypted codes. The
developer of Duckling receives nothing. There are no analytics, no tracking and
no ads.

## What is sent, and to whom

Duckling sends data to exactly one place: the Ente server you log in to
(`https://api.ente.com` by default, or the self-hosted server address you
enter). All traffic uses HTTPS (plain HTTP is only allowed for `localhost`,
for people running Ente on their own computer).

| Data | Why | Sent to |
| --- | --- | --- |
| Your email address | To start logging in and to receive an email code if your account needs one | Ente |
| A login proof derived from your password ([SRP](https://en.wikipedia.org/wiki/Secure_Remote_Password_protocol)) | To prove you know your password **without sending it** | Ente |
| Email codes and two-factor codes you type in | To complete login, if your Ente account requires them | Ente |
| Your Ente session token | To download your encrypted 2FA entries and to log out | Ente |

Your **password is never sent anywhere**. Your 2FA secrets are end-to-end
encrypted by Ente: Duckling downloads them encrypted and decrypts them only on
your device.

Firefox shows this at install as "authentication information" and "personally
identifying information" (your email). Both go only to your own Ente account,
never to the Duckling developer or anyone else.

What happens to data on Ente's servers is covered by
[Ente's privacy policy](https://ente.com/privacy/).

## What stays on your device

Stored in Firefox's extension storage on your computer:

- Your email address, server address and Duckling settings.
- Your Ente session token.
- **Encrypted** data only: your Ente key attributes, your encrypted
  authenticator key, and your encrypted 2FA entries.
- If you use the "Most used" / "Recently used" sort: how often you copied each
  code, **encrypted** with your authenticator key.

Kept only in memory:

- The decrypted key that unlocks your codes (erased when Duckling locks).
- If you set a PIN, a PIN-protected copy of that key (erased when Firefox
  closes, or after 5 wrong PINs).

Never stored anywhere: your password, your Ente master key, your private key,
and your decrypted codes (they exist only briefly in memory while the popup is
open).

## Permissions and what they see

- **activeTab:** when you open Duckling, it reads the address of the current tab
  to show that site's codes first. This happens on your device. The address is
  not stored or sent anywhere, and Duckling cannot read page contents.
- **idle:** tells Duckling whether your computer is active, idle or locked, so it
  can lock itself. Nothing is stored or sent.
- **clipboardWrite:** copies codes and clears the clipboard 30 seconds later.
  Duckling cannot read your clipboard.
- **storage, alarms:** local storage and timers, as described above.

## Deleting your data

Log out (Settings → Log out) to delete your account data from the extension.
Removing the extension deletes everything it stored. Your Ente account itself
is managed in the official Ente apps.

## Changes and contact

Changes to this policy are published with new versions in the
[source repository](https://github.com/viliusjan/duckling). Questions or
concerns: [open an issue](https://github.com/viliusjan/duckling/issues).
