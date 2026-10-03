/**
 * The real-router project's fakes (package.json `jest.projects`, "real-router").
 *
 * Its tests run the app's own tree — app/_layout.tsx, the real SessionProvider,
 * the real layouts and screens — under the REAL expo-router, which the unit
 * project replaces with `test/mocks/expo-router.tsx`. That mock records an href
 * and runs no navigator, so no unit test can tell what an address resolves to:
 * how build 12's Sign out reached the owner's phone with every unit test green
 * (the owner's build 12 item 6). Only three things are faked here, each at its
 * boundary, and nothing else:
 *
 * - the platform transport (`platformOperation`), answered per test through
 *   `test/real-router.tsx`;
 * - the keychain (`expo-secure-store`), a map the tests read and fill;
 * - the provider's browser leg and code exchange (`signInWithProvider`), which
 *   leaves a fresh session in the keychain, as a completed sign-in does.
 */
jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));

jest.mock('expo-secure-store', () => {
  const kept = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    kept,
    getItemAsync: jest.fn(async (key: string) => kept.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      kept.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      kept.delete(key);
    }),
  };
});

jest.mock('@/lib/platform/native-auth', () => {
  const actual = jest.requireActual('@/lib/platform/native-auth');
  return {
    ...actual,
    signInWithProvider: jest.fn(async () => {
      const { kept } = jest.requireMock('expo-secure-store') as { kept: Map<string, string> };
      kept.set('autom8x.access-token', 'access-signed-in');
      kept.set('autom8x.refresh-token', 'refresh-signed-in');
      kept.set('autom8x.access-expires-at', String(Date.now() + 3_600_000));
      return { status: 'signed-in' };
    }),
  };
});
