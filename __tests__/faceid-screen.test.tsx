import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import FaceIdScreen from '@/app/(auth)/faceid';
import type { SessionContextValue } from '@/hooks/use-session';
import { SIGN_OUT_FAILED } from '@/lib/content/screen-states';
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

/**
 * "Use identity provider" signs this phone out, then shows the cover (the
 * owner's build 12 item 7: "I clicked use identity provider when face id failed
 * and it kept bringing up face id. It should allow the user to log back in using
 * their account right"). At d77dd3a the button only replaced to `/`, which for a
 * person still signed in is the splash — and the splash replaced itself with this
 * lock 2400 ms later, so Face ID came back. Option A: the fallback is Settings ›
 * Sign out — `signOut()`, then the cover only on `revoked: true`.
 */
describe('Use identity provider signs this phone out (the owner\'s build 12 item 7)', () => {
  type SignOut = SessionContextValue['signOut'];

  function signedInWith(signOut: SignOut): SessionContextValue {
    return { ...signedInSession, signOut } as SessionContextValue;
  }

  it('a failed Face ID, then Use identity provider, signs this phone out and only then leaves for the cover', async () => {
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
    let answer: (result: { revoked: boolean }) => void = () => {};
    const signOut = jest.fn<ReturnType<SignOut>, []>(
      () => new Promise((resolve) => {
        answer = resolve;
      }),
    );
    await renderWithProviders(<FaceIdScreen />, signedInWith(signOut));

    expect(await screen.findByText('Face ID did not unlock this workspace.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Use identity provider'));

    // The sign-out is under way, and nothing has moved yet.
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      answer({ revoked: true });
    });

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/(auth)/faceid');
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/(tabs)/(home)');
    // Face ID was asked once, on the way in — never again by the fallback.
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('a sign-out that could not be revoked keeps the lock and says so; the button tries again', async () => {
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
    const signOut = jest
      .fn<ReturnType<SignOut>, []>()
      .mockResolvedValueOnce({ revoked: false })
      .mockResolvedValueOnce({ revoked: true });
    await renderWithProviders(<FaceIdScreen />, signedInWith(signOut));

    expect(await screen.findByText('Face ID did not unlock this workspace.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Use identity provider'));

    // Still signed in on this phone (ADR-0017 §4, a 502): the lock stays and says so.
    await waitFor(() => expect(screen.getByText(SIGN_OUT_FAILED)).toBeTruthy());
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Use identity provider'));

    expect(signOut).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it('when Face ID is not available, the fallback signs out too', async () => {
    LocalAuthentication.isEnrolledAsync.mockResolvedValue(false);
    const signOut = jest.fn<ReturnType<SignOut>, []>(async () => ({ revoked: true }));
    await renderWithProviders(<FaceIdScreen />, signedInWith(signOut));

    expect(await screen.findByText('Face ID is not available on this device.')).toBeTruthy();
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Use identity provider'));

    expect(signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it('with no signed-in session to unlock, the fallback goes to the cover without signing out', async () => {
    const signOut = jest.fn<ReturnType<SignOut>, []>(async () => ({ revoked: true }));
    // The platform could not be reached at launch, with a session still stored.
    const unavailable = {
      status: 'unavailable',
      message: 'The platform could not be reached.',
      refresh: () => {},
      reload: async () => ({ status: 'signed-in' as const }),
      signIn: async () => ({ status: 'unconfigured', message: '' }),
      signOut,
    } as unknown as SessionContextValue;
    await renderWithProviders(<FaceIdScreen />, unavailable);

    expect(await screen.findByText('Sign in with your identity provider first.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Use identity provider'));

    expect(signOut).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });
});

describe('biometric wording (24.4.4)', () => {
  // Imported here so the file's own mocks above stay as they were.
  const { biometricWordingFor } = jest.requireActual('@/hooks/use-biometric-wording');
  const FINGERPRINT = 1;
  const FACIAL_RECOGNITION = 2;

  it('names the sensor this device has: Face ID, Touch ID, or Android’s own word', () => {
    expect(biometricWordingFor('ios', [FACIAL_RECOGNITION]).title).toBe('Face ID');
    expect(biometricWordingFor('ios', [FINGERPRINT]).title).toBe('Touch ID');
    expect(biometricWordingFor('ios', [FINGERPRINT, FACIAL_RECOGNITION]).title).toBe('Face ID');
    // Unanswered, an iPhone reads as the design does.
    expect(biometricWordingFor('ios', undefined).title).toBe('Face ID');
    // Android is never told about Apple's hardware.
    const android = biometricWordingFor('android', [FACIAL_RECOGNITION]);
    expect(android.title).toBe('Biometric unlock');
    expect(JSON.stringify(android)).not.toMatch(/Face ID|Touch ID/);
  });

  it('says where the setting is — Settings, since the Face ID row is on the index again (build 11, D1)', () => {
    for (const wording of [
      biometricWordingFor('ios', [FACIAL_RECOGNITION]),
      biometricWordingFor('ios', [FINGERPRINT]),
      biometricWordingFor('android', [FINGERPRINT]),
    ]) {
      expect(wording.offerBody).toMatch(/You can change this later in Settings\.$/);
      expect(wording.offerBody).not.toMatch(/›/u);
    }
  });
});
