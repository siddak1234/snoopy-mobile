/**
 * Injects the values that differ between a simulator, a preview build, and
 * production, and derives the native-link configuration from one of them.
 *
 * `app.json` stays the static base; reading the environment happens here, at
 * config time, so no application source imports `process.env` — screens and
 * hooks resolve these through `lib/platform/*` and `expo-constants` instead.
 *
 * Unset is a legitimate state for all three: the client renders an honest
 * "unavailable" and refuses to sign in, rather than inventing a default that
 * would silently point a build at a developer's laptop or at a domain nobody
 * controls.
 *
 *   EXPO_PUBLIC_BACKEND_API_ORIGIN=http://localhost:8080   # iOS simulator
 *   EXPO_PUBLIC_BACKEND_API_ORIGIN=http://10.0.2.2:8080    # Android emulator
 *   EXPO_PUBLIC_NATIVE_REDIRECT_URI=https://app.example.com/auth/native/callback
 *   EXPO_PUBLIC_NATIVE_AUTH_BASE_URL=https://www.example.com/api/platform
 */

/**
 * The two release values ADR-0017 fixes for the deployment.
 *
 * The redirect URI is the master plan's own string: "must equal
 * `https://app.autom8x.ai/auth/native/callback` byte-for-byte", and the Edge's
 * `NATIVE_APP_REDIRECT_URIS` compares by exact string. Until Round 7.5M the
 * config validated only the SHAPE of the value, so a well-formed URI for the
 * wrong host passed config, derived app-link claims for that wrong host, and
 * shipped. The value lives in EAS dashboard state that nothing versions, which
 * is exactly why the equality is pinned here, where the other release guards
 * already throw.
 *
 * The auth base URL is where the SYSTEM BROWSER opens the ADR-0017 start leg.
 * ADR-0017 §1 assumes "the start request and the provider's callback both land
 * on this origin": the Edge keeps the OAuth transaction in a `__Host-` cookie,
 * which is host-only by definition, and the deployed callback
 * (`AUTH_CALLBACK_URL`) sits on the public web origin behind the website's
 * `/api/platform` rewrite because the web session cookie lives there (manifest
 * §12.1 #79). A start leg opened on `api.autom8x.ai` therefore sets a cookie the
 * callback on `www.autom8x.ai` never receives, and every native login ends at
 * the website with `exchange_failed`. Measured 2026-09-03, recorded in
 * `ROUND-7.5-OBSERVATIONS.md`. The bearer API calls stay on the API origin;
 * only the browser-carried start leg goes through the public web origin.
 */
const RELEASE_NATIVE_REDIRECT_URI = 'https://app.autom8x.ai/auth/native/callback';
const RELEASE_NATIVE_AUTH_BASE_URL = 'https://www.autom8x.ai/api/platform';

/**
 * The login callback's host, claimed as a universal / app link.
 *
 * ADR-0017 requires an app-claimed HTTPS redirect and rejects custom schemes,
 * because any app on a device can register one and the OS does not arbitrate.
 * Claiming the domain is what makes the redirect ours, and it is declared in two
 * platform-specific places — so both are derived from the single redirect URI
 * rather than restated. A second copy of a host is a second thing to get wrong,
 * and the Edge compares `NATIVE_APP_REDIRECT_URIS` by exact string.
 *
 * The `snoopymobile` scheme in `app.json` stays for ordinary deep links; it is
 * simply not what login returns through.
 */
function nativeLinkConfig(redirectUri) {
  if (!redirectUri) return { ios: {}, android: {} };

  let url;
  try {
    url = new URL(redirectUri);
  } catch {
    throw new Error('EXPO_PUBLIC_NATIVE_REDIRECT_URI must be an absolute URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_NATIVE_REDIRECT_URI must be HTTPS — ADR-0017 rejects custom schemes');
  }
  if (url.username || url.password || url.search || url.hash || url.port) {
    throw new Error('EXPO_PUBLIC_NATIVE_REDIRECT_URI must be a plain HTTPS app-link URL');
  }

  return {
    ios: { associatedDomains: [`applinks:${url.host}`] },
    android: {
      intentFilters: [
        {
          action: 'VIEW',
          // Without autoVerify the OS shows a disambiguation sheet instead of
          // opening the app, which reads to a person as a broken sign-in.
          autoVerify: true,
          data: [{ scheme: 'https', host: url.host, pathPrefix: url.pathname }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
  };
}

function validateBackendOrigin(value, releaseBuild) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_BACKEND_API_ORIGIN must be an absolute URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('EXPO_PUBLIC_BACKEND_API_ORIGIN must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('EXPO_PUBLIC_BACKEND_API_ORIGIN must contain only an origin');
  }
  if (releaseBuild && url.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_BACKEND_API_ORIGIN must use HTTPS for preview and production');
  }
  return url.origin;
}

/**
 * The base the system browser opens for `/v1/auth/native/{provider}/start`.
 *
 * A base URL rather than an origin, because the public website exposes the Edge
 * under a path prefix. Unset means the browser opens the start leg on the API
 * origin itself, which is right for a single-origin local Compose stack and
 * wrong for every deployment whose callback sits behind the web origin.
 */
function validateNativeAuthBaseUrl(value, releaseBuild) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_NATIVE_AUTH_BASE_URL must be an absolute URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('EXPO_PUBLIC_NATIVE_AUTH_BASE_URL must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('EXPO_PUBLIC_NATIVE_AUTH_BASE_URL must be a plain base URL');
  }
  if (releaseBuild && url.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_NATIVE_AUTH_BASE_URL must use HTTPS for preview and production');
  }
  // One canonical spelling, so the exact-match rule below cannot be dodged by a
  // trailing slash and the start path is never joined onto `//`.
  return url.href.replace(/\/$/, '');
}

export default ({ config }) => {
  const releaseBuild = ['preview', 'production'].includes(process.env.EAS_BUILD_PROFILE ?? '');
  const backendApiOrigin = validateBackendOrigin(
    process.env.EXPO_PUBLIC_BACKEND_API_ORIGIN ?? null,
    releaseBuild,
  );
  const nativeRedirectUri = process.env.EXPO_PUBLIC_NATIVE_REDIRECT_URI ?? null;
  const nativeAuthBaseUrl = validateNativeAuthBaseUrl(
    process.env.EXPO_PUBLIC_NATIVE_AUTH_BASE_URL ?? null,
    releaseBuild,
  );
  if (releaseBuild && (!backendApiOrigin || !nativeRedirectUri || !nativeAuthBaseUrl)) {
    throw new Error(
      'Preview and production builds require EXPO_PUBLIC_BACKEND_API_ORIGIN, EXPO_PUBLIC_NATIVE_REDIRECT_URI and EXPO_PUBLIC_NATIVE_AUTH_BASE_URL',
    );
  }
  const links = nativeLinkConfig(nativeRedirectUri);

  // Shape first, so a malformed value is diagnosed as malformed; equality second,
  // so a well-formed value for the wrong deployment cannot ship as a release.
  if (releaseBuild && nativeRedirectUri !== RELEASE_NATIVE_REDIRECT_URI) {
    throw new Error(
      `EXPO_PUBLIC_NATIVE_REDIRECT_URI must equal ${RELEASE_NATIVE_REDIRECT_URI} byte-for-byte for preview and production (ADR-0017)`,
    );
  }
  if (releaseBuild && nativeAuthBaseUrl !== RELEASE_NATIVE_AUTH_BASE_URL) {
    throw new Error(
      `EXPO_PUBLIC_NATIVE_AUTH_BASE_URL must equal ${RELEASE_NATIVE_AUTH_BASE_URL} for preview and production — the origin the deployed AUTH_CALLBACK_URL shares`,
    );
  }

  return {
    ...config,
    ios: { ...config.ios, ...links.ios },
    android: { ...config.android, ...links.android },
    extra: {
      ...config.extra,
      backendApiOrigin,
      // Must match an entry in the Edge's NATIVE_APP_REDIRECT_URIS exactly; the
      // comparison there is by string, not by origin.
      nativeRedirectUri,
      // Where the system browser opens the start leg; null falls back to the
      // API origin, which only a single-origin deployment can afford.
      nativeAuthBaseUrl,
    },
  };
};
