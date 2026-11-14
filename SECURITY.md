Security Policy: Duckling (unofficial Ente Auth for Firefox)
Version
Date
Applies to
Status
1.0
14 November 2026
Duckling 1.x
Draft
Read this first. This is a draft policy written from the project's public README, PRIVACY.md, manifest configuration and package.json. It describes the design the project documents. Statements marked (maintainer to confirm) were not checked against the source code and must be verified before this policy is published. Items in [square brackets] are placeholders.
Contents
• 1. Purpose and scope
• 2. Supported versions
• 3. Reporting a vulnerability
• 4. Security model
• 5. Security commitments and design
• 6. Known limitations and accepted risks
• 7. Threat model summary
• 8. Supply chain and build integrity
• 9. Secure development practices
• 10. Release and signing process
• 11. Incident response
• 12. Guidance for users
• 13. How anyone can verify the project
• 14. Pre-release security checklist
• 15. Report template
• 16. Policy maintenance
• 17. Acknowledgements
1. Purpose and scope
Duckling shows two-factor (2FA) codes from a user's Ente Auth account inside Firefox. It is an independent, open-source project. It is not made, reviewed or endorsed by Ente.
Because Duckling handles credentials that protect many other accounts, a flaw in it can have an outsized impact. This policy explains:
• how to report a vulnerability and what you can expect from the maintainers;
• the security model the project commits to, and the risks it knowingly accepts;
• how releases are built, signed and verified;
• what users can do to reduce their own risk.
In scope
• The extension code in the entrypoints, lib, public and scripts folders of the repository.
• The build configuration (wxt.config.ts, package.json, lockfile) and release process.
• The packaged extension published on addons.mozilla.org (AMO) and any source archive or build the project distributes.
• The project's documentation where it makes security claims (README, PRIVACY.md, the AMO listing).
Out of scope
• Vulnerabilities in Ente's servers, apps or protocols. Report these to Ente through their own channels.
• Vulnerabilities in Firefox, Zen or other browsers.
• Attacks that need an already-compromised device (malware, a malicious browser, a root-level attacker), except where Duckling makes the impact worse than it must be.
• Social engineering of the maintainers or users, spam, and denial of service against third-party infrastructure.
• Findings from automated scanners with no demonstrated impact.
• Unsupported versions (see section 2).
2. Supported versions
Version
Supported
Notes
Latest 1.x release
Yes
Receives security fixes
Previous minor release
Best effort for 30 days after the next release
Upgrade is the expected fix
Anything older
No

Unreleased main branch
Reports welcome
Not a supported build
Builds from forks or repackaged copies
No
Verify the source of any build you did not get from AMO
Minimum supported browser: Firefox 140 or newer (including ESR), and Firefox for Android 142 or newer. Zen Browser and other Firefox-based browsers are supported only to the extent they track these Firefox versions.
3. Reporting a vulnerability
Please do not open a public issue, pull request or social media post for a suspected vulnerability.
Use one of these private channels:
1.  GitHub private vulnerability reporting: the Security tab of the repository, then 'Report a vulnerability' (preferred). Maintainer to enable.
2.  Email: [security contact address]. Encrypt with the maintainer's PGP key [key fingerprint] if the report contains sensitive detail.
3.1 What to include
• A clear description of the problem and which component is affected.
• The Duckling version, browser and operating system.
• Step-by-step reproduction, or a proof of concept. Use a throwaway Ente account or the project's local fake server, never a real account you do not own.
• The impact you believe it has (for example 'an attacker with local disk access can recover the unlocked key').
• Whether you plan to publish, and your preferred timeline.
3.2 What you can expect from us
Stage
Target
Acknowledge your report
Within 3 days
First assessment (valid, invalid, need more detail)
Within 7 days
Fix target, Critical
7 days
Fix target, High
14 days
Fix target, Medium
30 days
Fix target, Low
Next regular release
Public advisory after a fix ships
Within 7 days of release
These are targets for a volunteer project, not guarantees. If we need longer we will tell you why and agree a new date with you.
3.3 Coordinated disclosure
We ask for 90 days from your report before public disclosure, or until a fix is released, whichever comes first. If a vulnerability is being actively exploited we may disclose sooner and will say so. We will credit you in the advisory and release notes unless you prefer to stay anonymous.
There is no bug bounty. We can offer public credit and our thanks.
3.4 Safe harbour
We will not pursue or support legal action against researchers who:
• act in good faith and follow this policy;
• test only against their own accounts, the local fake server, or accounts whose owners have agreed;
• avoid accessing, changing or keeping other people's data, and stop once they have shown the issue;
• give us reasonable time to fix before disclosing.
This does not cover Ente's services or anyone else's. Their rules apply there.
3.5 Severity classification
Severity
Definition
Examples
Critical
Remote compromise of user secrets with no meaningful user action
Code that sends the unlocked key, session token or decrypted codes to a third party; remote code loading; a malicious update path
High
Compromise of secrets needing realistic but limited conditions
Unlocked key or codes written to disk; lock bypass without the password or PIN; SRP or key-derivation flaws that weaken the password; a website able to read codes
Medium
Meaningful weakening of a protection
Auto-lock not firing; clipboard not cleared; PIN lockout bypass; a permission broader than needed
Low
Limited impact or hard to exploit
Information leaks of non-secret metadata; hardening gaps; misleading UI
Informational
No direct security impact
Documentation errors, best-practice suggestions
4. Security model
4.1 Assets we protect
1.  The user's Ente password and the keys derived from it.
2.  The unlocked authenticator key that decrypts the 2FA entries.
3.  The user's decrypted 2FA secrets and current codes.
4.  The user's Ente session token.
5.  The user's email address and Ente key attributes.
6.  The integrity of the extension itself (what code runs in the user's browser).
4.2 Trust boundaries
Component
Trusted?
Notes
Duckling's own extension code
Yes, once verified
The only code that handles secrets
The user's Ente server (official or self-hosted)
Partly
Stores only end-to-end encrypted data; can see the email, IP address and request timing
Websites the user visits
No
Duckling has no host permissions and injects no scripts into pages
Other browser extensions
No
Browser isolation is relied on; see section 6
The operating system and the user's local account
Assumed honest
Out of our control if compromised
Mozilla (AMO signing and distribution)
Yes, for distribution integrity
A compromise there is outside our control
Third-party dependencies
Partly
Pinned, reviewed and minimised (section 8)
4.3 Adversaries considered
• A malicious website: tries to read codes, trick the user into revealing a code, or exploit extension pages.
• A phishing site: a look-alike domain tries to receive a code. Matching uses the real domain, so look-alikes are not shown the right code.
• A network attacker: tries to read or alter traffic to the Ente server. All traffic must use HTTPS, with plain HTTP allowed only for localhost.
• A person with brief physical access to an unlocked or recently used browser.
• A person with a copy of the browser profile on disk (stolen laptop, backup, or shared computer).
• A malicious or compromised dependency in the build chain.
• A malicious update, whether from a compromised maintainer account or release process.
• A curious or malicious server operator (for self-hosted or third-party Ente servers).
4.4 Adversaries not defended against
• Malware running as the user, keyloggers, screen capture, or a compromised browser binary.
• A user who runs a modified build and is not told.
• Coercion of the user, or someone watching the screen while codes are displayed.
• A weak Ente password (see the fast-unlock note in section 5).
5. Security commitments and design
The following reflects what the README, PRIVACY.md and manifest state. Each item is a commitment; a deviation is treated as a vulnerability. (Maintainer to confirm each against the source before publishing.)
5.1 Authentication
• Login uses SRP, the same protocol as Ente's own apps. The password is never sent to any server.
• Email verification and authenticator-app two-factor login are supported. Passkey login is not yet supported.
• Cryptographic steps are ported from the open-source Ente repository, and each step should cite the file it came from.
• Login logic is tested against test vectors from Ente's own server.
5.2 What is stored, and where
Where
What
Cleared
Disk (storage.local)
Session token, settings, email, and encrypted data only (Ente key attributes, encrypted authenticator key, encrypted 2FA entries; optionally encrypted usage counts)
On logout or uninstall
Memory only (storage.session)
The decrypted authenticator key; with a PIN set, a PIN-encrypted copy
On lock, or when the browser closes
Never stored
Password, Ente master key, private key, decrypted codes
Wiped after use
Rules that follow from this table
• No secret may be written to storage.local in plaintext, in any form, ever. This includes logs, error messages and debugging output.
• Any new data written to disk must be listed in this table and in PRIVACY.md in the same change.
• The unlocked key must stay in memory-only storage. If a browser lacks it, Duckling must refuse to start rather than fall back to disk.
5.3 Locking
• Auto-lock after inactivity (default 15 minutes), when the computer locks, and when the browser closes.
• Unlock with the password or an optional PIN.
• A PIN protects nothing on disk. After a browser restart, or after 5 wrong attempts, the password is required.
5.4 Clipboard
• Duckling cannot read the clipboard. Thirty seconds after a copy it overwrites the clipboard. The user may turn this off.
• Clipboard managers and system clipboard history may keep earlier values. This is a known limit (section 6).
5.5 Permissions (least privilege)
Permission
Why it is needed
What it does not allow
storage
Keep encrypted data and settings; memory-only unlocked key
Access to other extensions' data
activeTab
Read the current tab's address when the popup is opened
Reading page contents
alarms
Auto-lock and clipboard timers

idle
Learn that the computer is active, idle or locked
Any other system information
clipboardWrite
Clear the clipboard after the popup closes
Reading the clipboard
Rules
• No host permissions and no content scripts. Adding either requires a security review, a documented reason, and a minor-version bump with a prominent release note.
• Any new permission is a security-relevant change (section 9).
5.6 Content security policy
Extension pages may run only their own scripts. wasm-unsafe-eval is allowed solely so the encryption library can compile WebAssembly (needed for Argon2id). The policy also sets object-src 'none', base-uri 'none' and form-action 'none'.
• No remote code, no JavaScript eval, no dynamically loaded scripts, no inline scripts.
• The policy may only be loosened through the review process in section 9.
5.7 Network behaviour
• Duckling contacts only the user's configured Ente server (default https://api.ente.com, to be confirmed against Ente's documented endpoint) and no one else.
• No analytics, telemetry, crash reporting, advertising or error-reporting services.
• HTTPS is mandatory except for localhost (used by the fake test server).
• Any new network destination is a security-relevant change and must be listed in PRIVACY.md.
6. Known limitations and accepted risks
These are documented so that users and researchers do not need to report them as new findings.
1.  Session token on disk. The Ente session token is stored in storage.local so you stay logged in. Anyone who copies your browser profile could use it against your Ente account until you log out or revoke the session in Ente.
2.  Fast-unlock copy. To unlock in under a second, Duckling keeps a second copy of the encrypted master key, protected by a lighter password derivation (64 MiB). Against someone who has your profile files, a weak Ente password is the main protection.
3.  Encrypted data on disk. Encrypted 2FA entries and key attributes remain on disk. Their safety depends on your password strength and Ente's algorithms.
4.  Clipboard exposure. A copied code is readable by any program that can read the clipboard for up to 30 seconds. Clipboard history tools may keep it longer.
5.  Other extensions. Duckling relies on the browser to isolate extensions. An extension with broad permissions, or a compromised browser, is outside our protection.
6.  Unsigned or modified builds. Only builds signed by Mozilla are trusted. A temporary add-on you loaded yourself carries your own responsibility for its provenance.
7.  Passkey-protected Ente accounts. Login is not supported, so users must add an authenticator-app second factor in Ente.
8.  Server visibility. The Ente server operator can see your email address, IP address and when you sync.
9.  Read-only. Duckling cannot add or edit codes. This reduces risk and is a deliberate scope limit.
7. Threat model summary
#
Threat
Mitigation
Residual risk
T1
Website reads codes or the key
No host permissions or content scripts; strict CSP
Low
T2
Phishing site receives a valid code
Match codes to the real domain
Low (the user can still copy manually)
T3
Network eavesdropping or tampering
HTTPS only; end-to-end encrypted payloads
Low
T4
Stolen browser profile
Only encrypted data and a session token on disk; unlocked key in memory
Medium (token, weak password)
T5
Shoulder-surf or brief unattended access
Auto-lock, PIN, closing after copy
Medium
T6
Malicious dependency
Exact version pins, lockfile, npm ci, review of updates
Medium
T7
Malicious update
Maintainer account hardening, signed releases, reproducible builds
Medium
T8
Clipboard snooping
30 second wipe
Medium
T9
Bug in ported crypto
Citations to Ente source, test vectors, review
Medium
T10
Hostile or buggy server response
Input validation; failures end the operation
Low
8. Supply chain and build integrity
8.1 Dependencies
Runtime dependencies are kept to a minimum. Currently they are libsodium-wrappers-sumo (cryptography), @noble/hashes (hashing), otpauth (code generation) and preact (interface).
• Versions are pinned exactly (no ^ or ~ ranges) and the lockfile is committed.
• Installs and CI use npm ci, never npm install.
• A new runtime dependency needs a written reason, a check of its maintainers, size, install scripts and recent history, and approval from a second reviewer if one is available.
• Dependencies are reviewed at least quarterly, and immediately when a security advisory affects one.
• Prefer versions at least two weeks old, to avoid the window in which a malicious release is still undetected.
• Install scripts: the project runs wxt prepare after install. Any other lifecycle script in a dependency is investigated before use. Consider npm ci --ignore-scripts for audits.
8.2 Reproducible builds
• Builds are intended to be byte-for-byte reproducible, with the output readable (not minified) to aid review. (Maintainer to confirm; independent verification welcome.)
• The release process produces the AMO zip and a source archive made with git archive from the exact tagged commit.
• Build environment: Node 22.12 or newer within the 22.x line, as set in .nvmrc and engines.
8.3 Maintainer account and access hygiene
• Hardware-key or app-based two-factor authentication on the GitHub, AMO and email accounts.
• AMO API keys are kept out of the repository and out of shared logs, rotated at least yearly and after any suspected exposure.
• Signed commits and signed tags are recommended for releases.
• Branch protection on main: no force pushes; changes through pull requests where practical.
• Second maintainer or trusted reviewer is encouraged. A single maintainer is a single point of failure and should plan for succession.
8.4 CI/CD
• Third-party GitHub Actions pinned to full commit hashes.
• Workflows run with read-only tokens by default, and secrets are not exposed to pull requests from forks.
9. Secure development practices
9.1 Review requirements
The following changes are security-relevant and need explicit review, with a note in the pull request saying why they are safe:
• anything touching cryptography, key derivation, SRP, session handling, locking or the PIN;
• anything that stores new data, or changes what is stored where;
• new or broader permissions, host access, content scripts, web-accessible resources;
• changes to the content security policy;
• any new network destination or request;
• new or updated runtime dependencies;
• changes to the build, release or signing process.
9.2 Code quality gates
Before a release, npm run release must pass: unit and end-to-end tests (including tests against Ente's test vectors and the local fake server), the TypeScript compile check, web-ext lint on the built extension, and creation of the source archive.
9.3 Coding rules
• Never log secrets, keys, tokens, codes or full URLs of visited sites.
• Wipe key material from memory when no longer needed, as far as the language allows.
• Use the browser's secure random source only; no hand-rolled cryptography.
• Treat every server response and every tab URL as untrusted input.
• No eval, new Function, innerHTML with untrusted data, or dynamic script loading.
• Do not copy cryptographic code from unreviewed sources.
9.4 AI-assisted development
The repository includes an AI assistant configuration file. Code produced with AI assistance is held to the same standard as any other code. For cryptography, authentication and storage code, a human must read and understand every line, and compare it with the upstream Ente implementation it claims to port.
10. Release and signing process
1.  All security-relevant changes are reviewed (section 9.1).
2.  npm run release passes on a clean checkout.
3.  The version is bumped and the changelog states any security-relevant change.
4.  A signed tag is created, and the source archive is built from that tag.
5.  The zip is submitted to AMO for signing and review. The add-on ID stays constant across versions.
6.  After approval, the release notes list the SHA-256 hash of the submitted zip and the source archive.
7.  The README install section is updated if the distribution channel changes.
Users should install only from the official AMO listing or from a build they made themselves from the tagged source. No other distribution channel is endorsed.
11. Incident response
11.1 Roles
The lead maintainer coordinates the response. If there is a second maintainer, they review the fix and the advisory.
11.2 Steps
1.  Triage: confirm, classify severity (section 3.5) and record a private timeline.
2.  Contain: if a released version is actively harmful, pull or disable the AMO version and consider a minimal emergency release.
3.  Fix: develop the fix privately, review it under section 9.1 and test it.
4.  Release: ship through the normal signing process, or an expedited one for Critical issues.
5.  Advise: publish a GitHub security advisory with affected versions, impact, fix version, workarounds and credit. Update the AMO listing notes.
6.  Review: within 14 days, record the root cause and what process change would have prevented it.
11.3 If the maintainer's release credentials are compromised
• Revoke and rotate AMO API keys and sessions; change the passwords on the GitHub, AMO and email accounts.
• Ask Mozilla to block any malicious versions.
• Audit every version published since the likely compromise date against its source tag.
• Tell users clearly and quickly, using the README, the AMO listing and a GitHub advisory.
11.4 What users should do after a serious advisory
Depending on the advisory, users may be asked to update, log out of Duckling, change their Ente password, end other sessions in Ente, and, in the worst case, re-issue the 2FA secrets of the most sensitive accounts. The advisory will say which steps apply.
11.5 Data breach position
The project operates no servers and receives no user data, so there is no central store of user data to breach. Incidents are limited to what the extension code could expose on a user's own device or send to Ente.
12. Guidance for users
Install safely
• Install only from the official AMO listing for Duckling. Check the developer name and that the add-on ID is duckling@viliusjan.github.io.
• Treat any other download, zip, or 'signed' file offered elsewhere as untrusted.
• Read the permission prompt. If an update later asks for more permissions, stop and read the release notes.
Protect your account
• Use a long, unique Ente password. It is the main protection for offline attacks.
• Turn on a PIN and a short auto-lock time on shared or portable computers.
• Keep your browser up to date, and lock your computer when you leave it.
• On a shared or borrowed device, log out of Duckling when done.
• If you lose a device, end its sessions in Ente and change your password.
Be careful with the clipboard
• Disable or restrict clipboard history tools while you use 2FA codes.
• Paste codes right away, and do not leave a code visible on screen.
Self-hosted servers
• Use HTTPS with a valid certificate. The operator of a server can see your email address and activity, so trust only servers you control.
Try it first
• Test a new extension with a spare Ente account and dummy codes before trusting it with your real vault.
13. How anyone can verify the project
Check the build
git clone https://github.com/viliusjan/duckling
cd duckling
git checkout <release tag>
npm ci
npm run build
Compare the contents of .output/firefox-mv3 with the files inside the AMO-signed .xpi (an .xpi is a zip file). Apart from Mozilla's signature files, they should match.
Check what the extension talks to
grep -rn "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon\|new Image(" entrypoints lib
Every destination should be the user's configured Ente server.
Check for dangerous patterns
grep -rnE "eval\(|new Function|innerHTML|document\.write|importScripts" entrypoints lib
Check permissions
In the built manifest.json, confirm there are no host permissions, no content scripts, and only the five permissions listed in section 5.5. In the browser, open the add-on's permissions tab and compare.
14. Pre-release security checklist (for maintainers)
[ ] Clean checkout, npm ci, npm run release passes
[ ] No new permissions, host access or content scripts (or each is reviewed and documented)
[ ] CSP unchanged (or reviewed)
[ ] No new network destinations; PRIVACY.md and README are in sync with the code
[ ] The storage table in section 5.2 still matches reality
[ ] Dependency changes reviewed; lockfile diff read
[ ] No secrets, tokens or personal data in logs, tests or fixtures
[ ] Changelog and advisory notes written
[ ] Tag signed; source archive and zip hashes recorded
[ ] Account security (two-factor authentication, API key age) checked
15. Report template
Title:
Affected version(s):
Browser and OS:
Severity you suggest:
Summary:
Steps to reproduce:
Expected vs actual behaviour:
Impact:
Suggested fix (optional):
Disclosure preferences and credit name:
16. Policy maintenance
• Reviewed at least every 6 months and after any security incident.
• Changes are made through pull requests and recorded here.
• Contact for policy questions: [security contact address].
Date
Version
Change
2026-11-14
1.0 draft
First draft prepared from public project documentation
17. Acknowledgements
Duckling's protocol and cryptography are ported from the open-source Ente project. This policy is shared in the same spirit of open, checkable security. Thank you to every researcher who reports responsibly.
