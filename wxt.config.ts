import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: '.',
  manifestVersion: 3,
  vite: () => ({
    plugins: [preact()],
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
    description: 'Your 2FA codes, one click away. Unofficial, not affiliated with Ente.',
    // Each permission is justified in README.md. No host permissions: Ente's API
    // allows cross-origin requests, so we don't need access to any website.
    permissions: ['storage', 'alarms', 'idle', 'clipboardWrite', 'activeTab'],
    commands: {
      // "2" for 2FA. Firefox maps Ctrl to Cmd on macOS. Changeable in about:addons.
      _execute_action: { suggested_key: { default: 'Ctrl+Shift+2' }, description: 'Open Duckling' },
    },
    action: {
      default_title: 'Duckling',
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
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
