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
