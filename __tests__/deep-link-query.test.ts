import { getStateFromPath } from 'expo-router/react-navigation';

/**
 * A link's query, read through query-string and `decode-uri-component` (backend
 * manifest §12.1 #195). Both ship in the bundle: expo-router's
 * `getPathFromState` requires query-string, which requires the decoder as it
 * loads. The one caller of the decoder is `queryString.parse`, in the
 * react-navigation code expo-router 56 carries, its `getStateFromPath` below
 * (`build/react-navigation/core/getStateFromPath.js:499`); the app's links never
 * reach it, since expo-router's linking uses its own parser
 * (`build/getLinkingConfig.js:90-91`), which reads a query with `URL`.
 *
 * The decoder's advisory (GHSA-vcc3-ghjq-m6fr) is fixed only in 0.5.0, an ES
 * module, and query-string 7 — pinned by expo-router 56 — calls
 * `require('decode-uri-component')` as a function. Forced in, Node's and
 * Metro's `require` hand back `{ default }`, which throws when called, and this
 * suite does not load. This holds the reading until the dependency can move.
 */
it('reads a percent-encoded query, keeping a malformed % as written', () => {
  expect(getStateFromPath('/flows/detail?flow=a%20b&note=100%')).toMatchObject({
    routes: [
      {
        name: 'flows',
        state: { routes: [{ name: 'detail', params: { flow: 'a b', note: '100%' } }] },
      },
    ],
  });
});
