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

/**
 * Round 24 P8: a sign-in offers notifications where iOS can still ask. These
 * tests are about where a screen goes, so by default iOS has already answered
 * (no: nothing to offer, nothing registers), and a test about the offer says
 * otherwise (`__tests__/real-router/notifications-offer.test.tsx`).
 */
beforeEach(() => {
  const Notifications = jest.requireMock('expo-notifications') as { getPermissionsAsync: jest.Mock };
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false, expires: 'never' });
});
