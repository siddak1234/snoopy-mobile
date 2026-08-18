import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';

import FaceIdScreen from '@/app/(auth)/faceid';
import { signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/session-store', () => ({ readSession: jest.fn() }));

const LocalAuthentication = jest.requireMock('expo-local-authentication');
const { readSession } = jest.requireMock('@/lib/platform/session-store');

beforeEach(() => {
  readSession.mockReset();
  LocalAuthentication.hasHardwareAsync.mockReset();
  LocalAuthentication.isEnrolledAsync.mockReset();
  LocalAuthentication.authenticateAsync.mockReset();
  readSession.mockResolvedValue({
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 60_000,
  });
  LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
  LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
  LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });
});

describe('Face ID unlock', () => {
  it('enters the app only after a real biometric success on a signed-in session', async () => {
    await renderWithProviders(<FaceIdScreen />, signedInSession);
    expect(screen.getByText('Face ID')).toBeTruthy();
    expect(screen.getByText('Unlocking your workspace…')).toBeTruthy();

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)'));
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Unlock your workspace',
      disableDeviceFallback: true,
    });
  });

  it('does not use biometrics or enter the app without an authenticated session', async () => {
    readSession.mockResolvedValue(null);
    await renderWithProviders(<FaceIdScreen />);

    expect(await screen.findByText('Sign in with your identity provider first.')).toBeTruthy();
    expect(screen.getByText('Use identity provider')).toBeTruthy();
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/(tabs)/(home)');
  });
});
