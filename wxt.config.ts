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
    },
  }),
  manifest: {
    name: 'Duckling – unofficial Ente Auth',
    short_name: 'Duckling',
    description: 'Your 2FA codes, one click away. Unofficial, not affiliated with Ente.',
    // No permissions yet; each one gets added (and justified) when a feature needs it.
    permissions: [],
    action: {
      default_title: 'Duckling',
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';",
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
