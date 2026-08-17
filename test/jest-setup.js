// Reanimated official test setup (noops animations, provides frame stubs).
require('react-native-reanimated').setUpTests();

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
}));

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
    digestStringAsync: async (_algorithm, data, options) =>
      nodeCrypto
        .createHash('sha256')
        .update(data, 'utf8')
        .digest(options?.encoding === 'base64' ? 'base64' : 'hex'),
  };
});
