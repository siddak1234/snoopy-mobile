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
    // Expo SDK 56's eslint-config-expo spreads eslint-plugin-react-hooks 7's recommended
    // rules (its flat/utils/react.js:27), which add the React Compiler's checks as errors;
    // 25 places written before them fail these four. They warn until that code is changed
    // on its own (DESIGN-GAPS "Round E step 2").
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
