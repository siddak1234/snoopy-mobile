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
