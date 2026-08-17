/**
 * Injects the two values that differ between a simulator, a preview build, and
 * production, and derives the native-link configuration from one of them.
 *
 * `app.json` stays the static base; reading the environment happens here, at
 * config time, so no application source imports `process.env` — screens and
 * hooks resolve these through `lib/platform/*` and `expo-constants` instead.
 *
 * Unset is a legitimate state for both: the client renders an honest
 * "unavailable" and refuses to sign in, rather than inventing a default that
 * would silently point a build at a developer's laptop or at a domain nobody
 * controls.
 *
 *   EXPO_PUBLIC_BACKEND_API_ORIGIN=http://localhost:8080   # iOS simulator
 *   EXPO_PUBLIC_BACKEND_API_ORIGIN=http://10.0.2.2:8080    # Android emulator
 *   EXPO_PUBLIC_NATIVE_REDIRECT_URI=https://app.example.com/auth/native/callback
 */

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

export default ({ config }) => {
  const backendApiOrigin = process.env.EXPO_PUBLIC_BACKEND_API_ORIGIN ?? null;
  const nativeRedirectUri = process.env.EXPO_PUBLIC_NATIVE_REDIRECT_URI ?? null;
  const links = nativeLinkConfig(nativeRedirectUri);

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
    },
  };
};
