/**
 * Round E step 2 (Expo SDK 56): Hermes v1 is off (app.json, expo-build-properties'
 * `useHermesV1: false`; DESIGN-GAPS "Round E step 2"), so the bundle is compiled by the
 * legacy hermes-compiler 0.15.0 (package.json `overrides`), which cannot read private
 * class members. babel-preset-expo 56 picks its Hermes v1 syntax set for every Hermes
 * build (`hermes-stable`, its build/index.js:54-56, 81-91); `hermes-v0` is its set for
 * the legacy engine (build/configs/hermes-v0.js), and the one Jest already runs (no
 * engine: `default`, build/index.js:92-97). SDK 57 removes this file with useHermesV1.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { native: { unstable_transformProfile: 'hermes-v0' } }]],
  };
};
