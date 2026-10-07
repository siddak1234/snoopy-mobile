import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import LoginScreen from '@/app/(auth)/login';
import { routePlatform, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/session-store', () => ({ readSession: jest.fn(), readFaceIdChoice: jest.fn() }));
const { readSession, readFaceIdChoice } = jest.requireMock('@/lib/platform/session-store');
const LocalAuthentication = jest.requireMock('expo-local-authentication');

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

beforeEach(() => {
  readSession.mockReset();
  readSession.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 });
  readFaceIdChoice.mockReset().mockResolvedValue('unset');
  LocalAuthentication.hasHardwareAsync.mockReset().mockResolvedValue(true);
  LocalAuthentication.isEnrolledAsync.mockReset().mockResolvedValue(true);
  platformOperation.mockReset();
  routePlatform(platformOperation);
});

describe('Log in', () => {
  it('is one screen with the website\'s words: Sign in, the providers, and Remember me (feedback #1)', async () => {
    const { getByText, findByText, queryByText } = await renderWithProviders(<LoginScreen />);
    expect(getByText('Sign in')).toBeTruthy();
    // The subtitle went with the cover page, which already says what this is (24.11.6).
    expect(queryByText('Continue to Autom8x.')).toBeNull();
    expect(await findByText('Sign in with Apple')).toBeTruthy();
    expect(getByText('Sign in with Google')).toBeTruthy();
    expect(getByText('Sign in with Microsoft')).toBeTruthy();
    expect(getByText('Remember me')).toBeTruthy();
    expect(screen.getByRole('switch').props.accessibilityState?.checked ?? true).toBe(true);
    // No second name for the same action, and no divider above an empty column.
    expect(queryByText('Sign up')).toBeNull();
    expect(queryByText(/New here/)).toBeNull();
    expect(queryByText('Log in')).toBeNull();
  });

  it('asks the Face ID question once, after a remembered sign-in on a device that has it (feedback, 2026-10-02)', async () => {
    const signIn = jest.fn(async () => ({ status: 'signed-in' as const }));
    const { findByText } = await renderWithProviders(<LoginScreen />, { ...signedInSession, signIn });
    await fireEvent.press(await findByText('Sign in with Google'));
    expect(signIn).toHaveBeenCalledWith('google', { remember: true });
    await screen.findByText('Sign in');
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/faceid-offer');
    expect(mockRouter.replace.mock.calls.map((call: unknown[]) => call[0])).not.toContain('/(tabs)/(home)');
  });

  it('goes straight in when the question was already answered, or when there is no biometrics', async () => {
    readFaceIdChoice.mockResolvedValue('off');
    const signIn = jest.fn(async () => ({ status: 'signed-in' as const }));
    const { findByText } = await renderWithProviders(<LoginScreen />, { ...signedInSession, signIn });
    await fireEvent.press(await findByText('Sign in with Google'));
    await screen.findByText('Sign in');
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)', { withAnchor: true });
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/(auth)/faceid-offer');
  });

  it('with Remember me off, signs in for this run only and never asks about Face ID', async () => {
    const signIn = jest.fn(async () => ({ status: 'signed-in' as const }));
    const { findByText } = await renderWithProviders(<LoginScreen />, { ...signedInSession, signIn });
    await findByText('Sign in with Google');
    await fireEvent(screen.getByRole('switch'), 'press');
    await fireEvent.press(screen.getByText('Sign in with Google'));
    expect(signIn).toHaveBeenCalledWith('google', { remember: false });
    await screen.findByText('Sign in');
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)', { withAnchor: true });
  });

  it('offers no Face ID unlock when this device holds no session (feedback #10, #12)', async () => {
    // Biometrics unlock a stored session and never mint one: after a sign-out or
    // a fresh install there is nothing to unlock, so the button would only lead
    // to "Sign in with your identity provider first."
    readSession.mockResolvedValue(null);
    const { queryByText, findByText } = await renderWithProviders(<LoginScreen />);
    expect(await findByText('Sign in with Google')).toBeTruthy();
    expect(queryByText('Unlock with Face ID')).toBeNull();
  });

  it('offers no password path at all, and routes the one real navigation action', async () => {
    // Owner direction 2026-09-08 (platform §12.1 #90): the Edge refuses password
    // login and the website shows providers only, so the app draws no email,
    // password, remember-me, "forgot" or Log In control — a form that only ever
    // refused taught people the product had a capability it does not.
    const { getByText, queryByText, queryByLabelText } = await renderWithProviders(<LoginScreen />);
    expect(queryByLabelText('Email')).toBeNull();
    expect(queryByLabelText('Password')).toBeNull();
    expect(queryByText('Stay logged in')).toBeNull();
    expect(queryByText('Forgot?')).toBeNull();
    expect(queryByText('Log In')).toBeNull();
    expect(mockRouter.replace.mock.calls.map((call: unknown[]) => call[0])).not.toContain('/(tabs)/(home)');
    // The unlock is offered because this device holds a session to unlock.
    await fireEvent.press(await screen.findByText('Unlock with Face ID'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/faceid');
  });
});

