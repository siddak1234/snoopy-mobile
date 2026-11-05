// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // .claude/ and scripts/kit/ hold the common kit, byte-identical in all four
    // repositories (the backend's engineering standard, section 0): never
    // reformatted here. kit.test.mjs runs under node:test (__tests__/kit.test.js).
    ignores: ['dist/*', '.claude/**', 'scripts/kit/**'],
  },
  {
    // eslint-config-expo (since SDK 56; 57.0.2's flat/utils/react.js:27) spreads
    // eslint-plugin-react-hooks 7's recommended rules, which add the React Compiler's checks
    // as errors. The files below were written before them and break these four; by the
    // owner's decision they warn in those files alone, so every other file, new code too,
    // still fails on them. A file leaves the list when its code is changed on its own; the
    // places are the debt list in `DESIGN-GAPS.md` "Round E step 2", its "Lint" entries.
    files: [
      'app/(auth)/faceid.tsx',
      'app/(tabs)/activity/index.tsx',
      'app/(tabs)/activity/package.tsx',
      'app/(tabs)/flows/detail.tsx',
      'app/(tabs)/settings/billing.tsx',
      'app/index.tsx',
      'components/automations/webhook-address-dialog.tsx',
      'components/blocks/image.tsx',
      'components/connection-row.tsx',
      'components/dropdown.tsx',
      'components/files/file-view.tsx',
      'components/items/flow-items.tsx',
      'components/organization/org-domain-only.tsx',
      'components/settings/workspace-switcher.tsx',
      'components/setup-field.tsx',
    ],
    rules: {
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
  {
    files: ['__tests__/**', 'test/**'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
]);
