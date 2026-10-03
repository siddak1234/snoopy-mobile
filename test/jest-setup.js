// Reanimated official test setup (noops animations, provides frame stubs).
require('react-native-reanimated').setUpTests();

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: true })),
  // The enum's real values (expo-local-authentication's own types), and an
  // iPhone with Face ID by default — the design's wording.
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  supportedAuthenticationTypesAsync: jest.fn(async () => [2]),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
}));

// Device push (build 11, D8): what `hooks/use-push-registration.tsx` calls, and
// nothing else. By default an iPhone that has not been asked yet: nothing is
// granted, so nothing registers until a test says so.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({
    status: 'undetermined',
    granted: false,
    canAskAgain: true,
    expires: 'never',
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  })),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: 'ExponentPushToken[test-device]' })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));

// `isDevice` is a constant in the library; an ES module here so a test can
// replace it (`jest.replaceProperty`) and the code reads the replacement.
jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});

// `expo-crypto` is a native module with no implementation under jest, so it
// answers empty. Backing it with Node's crypto rather than a canned string
// means the PKCE tests exercise the real SHA-256 and real randomness — the
// algorithm is the thing worth testing, and a stub would assert nothing.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
    getRandomBytesAsync: async (byteCount) =>
      Uint8Array.from(nodeCrypto.randomBytes(byteCount)),
    randomUUID: () => nodeCrypto.randomUUID(),
    digestStringAsync: async (_algorithm, data, options) =>
      nodeCrypto
        .createHash('sha256')
        .update(data, 'utf8')
        .digest(options?.encoding === 'base64' ? 'base64' : 'hex'),
  };
});
