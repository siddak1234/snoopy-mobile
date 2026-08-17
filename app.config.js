/**
 * Injects the one backend location the app is allowed to know.
 *
 * `app.json` stays the static base; this wrapper adds the only value that
 * differs between a simulator, a preview build, and production. Reading the
 * environment happens here, at config time, so no application source imports
 * `process.env` — screens and hooks resolve the origin through
 * `lib/platform/origin.ts` and `expo-constants` instead.
 *
 * Unset is a legitimate state: the client renders an honest "unavailable" rather
 * than inventing a default that would silently point a build at a developer's
 * laptop. Local development sets it in `.env`:
 *
 *   EXPO_PUBLIC_BACKEND_API_ORIGIN=http://localhost:8080   # iOS simulator
 *   EXPO_PUBLIC_BACKEND_API_ORIGIN=http://10.0.2.2:8080    # Android emulator
 */
export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    backendApiOrigin: process.env.EXPO_PUBLIC_BACKEND_API_ORIGIN ?? null,
    // Where the login callback returns. ADR-0017 requires an app-claimed HTTPS
    // URL and rejects custom schemes, and the Edge compares it against
    // NATIVE_APP_REDIRECT_URIS by exact string — so this value and that
    // allowlist entry must match character for character, and a deployment that
    // sets one without the other gets a 400 rather than a login.
    nativeRedirectUri: process.env.EXPO_PUBLIC_NATIVE_REDIRECT_URI ?? null,
  },
});
