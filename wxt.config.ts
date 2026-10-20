import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';

/**
 * The bundler leaves the absolute project path in a few comments (e.g. WXT's
 * virtual background entry). Replace it with "." so builds are byte-identical
 * on any machine (AMO reproducibility) and don't reveal the builder's folders.
 */
const stripProjectPath = (): Plugin => {
  const root = process.cwd();
  return {
    name: 'duckling:strip-project-path',
    renderChunk: (code) => (code.includes(root) ? { code: code.split(root).join('.'), map: null } : null),
  };
};

export default defineConfig({
  srcDir: '.',
  manifestVersion: 3,
  zip: {
    // The source bundle for AMO reviewers is made with `git archive` instead
    // (npm run zip:sources): exactly the committed files, nothing local.
    zipSources: false,
  },
  vite: () => ({
    plugins: [preact(), stripProjectPath()],
    build: {
      // Readable output makes AMO source review easier and builds reproducible.
      minify: false,
      // Firefox supports modulepreload natively; skip Vite's fetch()-based polyfill.
      modulePreload: { polyfill: false },
    },
  }),
  manifest: {
    name: 'Duckling – unofficial Ente Auth',
    short_name: 'Duckling',
    description: 'Your Ente Auth 2FA codes in Firefox, one click away. Unofficial, not affiliated with Ente.',
    homepage_url: 'https://github.com/viliusjan/duckling',
    // Each permission is justified in README.md. No host permissions: Ente's API
    // allows cross-origin requests, so we don't need access to any website.
    permissions: ['storage', 'alarms', 'idle', 'clipboardWrite', 'activeTab'],
    commands: {
      // "2" for 2FA. Firefox maps Ctrl to Cmd on macOS. Changeable in about:addons.
      _execute_action: { suggested_key: { default: 'Ctrl+Shift+2' }, description: 'Open Duckling' },
    },
    action: {
      default_title: 'Duckling',
      default_icon: { 16: 'toolbar/on-light-16.png', 32: 'toolbar/on-light-32.png' },
      // Firefox picks the variant that contrasts with the toolbar theme:
      // "light" is the icon for dark toolbars, "dark" the one for light toolbars.
      theme_icons: [
        { light: 'toolbar/on-dark-16.png', dark: 'toolbar/on-light-16.png', size: 16 },
        { light: 'toolbar/on-dark-32.png', dark: 'toolbar/on-light-32.png', size: 32 },
      ],
    },
    content_security_policy: {
      // 'wasm-unsafe-eval' lets libsodium compile its WebAssembly (needed for
      // Argon2id). It does not allow JavaScript eval.
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'; form-action 'none';",
    },
    browser_specific_settings: {
      gecko_android: { strict_min_version: '142.0' },
      // 140 = oldest supported ESR and the first with data_collection_permissions.
      gecko: {
        id: 'duckling@viliusjan.github.io',
        strict_min_version: '140.0',
        // Declared honestly: your email and login proofs (SRP proof, email and
        // 2FA codes, session token) are sent to Ente's servers, which Mozilla
        // counts as transmission even though it's your own account. Nothing
        // is ever sent to the Duckling developer or anyone else.
        data_collection_permissions: { required: ['authenticationInfo', 'personallyIdentifyingInfo'] },
      },
    },
  },
});
