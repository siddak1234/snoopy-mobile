import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import FaceIdOfferScreen from '@/app/(auth)/faceid-offer';
import { signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/session-store', () => ({ writeFaceIdEnabled: jest.fn() }));

const LocalAuthentication = jest.requireMock('expo-local-authentication');
const { writeFaceIdEnabled } = jest.requireMock('@/lib/platform/session-store');

/**
 * The one-time Face ID question after a remembered sign-in (owner, 2026-10-02):
 * the system's permission alert must come with the person's own "Use Face ID",
 * never at the next launch. Either answer lands in the app — the session is
 * already signed in, and biometrics never mint one (ADR-0017).
 */
beforeEach(() => {
  writeFaceIdEnabled.mockReset().mockResolvedValue(undefined);
  LocalAuthentication.hasHardwareAsync.mockReset().mockResolvedValue(true);
  LocalAuthentication.isEnrolledAsync.mockReset().mockResolvedValue(true);
  LocalAuthentication.authenticateAsync.mockReset().mockResolvedValue({ success: true });
});

describe('the Face ID offer', () => {
  it('"Use Face ID" runs the check now, records the choice, and opens the app', async () => {
    await renderWithProviders(<FaceIdOfferScreen />, signedInSession);
    expect(screen.getByText('Open with Face ID next time?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Use Face ID'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)'));
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1);
    expect(writeFaceIdEnabled).toHaveBeenCalledWith(true);
  });

  it('"Not now" records an explicit no and opens the app without a prompt', async () => {
    await renderWithProviders(<FaceIdOfferScreen />, signedInSession);
    await fireEvent.press(screen.getByText('Not now'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)'));
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
    expect(writeFaceIdEnabled).toHaveBeenCalledWith(false);
  });

  it('a check the person does not pass leaves the choice unrecorded and says so', async () => {
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: false });
    await renderWithProviders(<FaceIdOfferScreen />, signedInSession);
    await fireEvent.press(screen.getByText('Use Face ID'));
    expect(await screen.findByText('Face ID unlock was not enabled.')).toBeTruthy();
    expect(writeFaceIdEnabled).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
