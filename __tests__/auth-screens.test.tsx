import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import LoginScreen from '@/app/(auth)/login';
import OnboardingScreen from '@/app/(auth)/onboarding';
import SignupScreen from '@/app/(auth)/signup';
import WelcomeScreen from '@/app/(auth)/welcome';
import { routePlatform, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/session-store', () => ({ readSession: jest.fn() }));
const { readSession } = jest.requireMock('@/lib/platform/session-store');

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

beforeEach(() => {
  readSession.mockReset();
  readSession.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 });
  platformOperation.mockReset();
  routePlatform(platformOperation);
});

describe('Welcome', () => {
  it('shows the design headline and kicker', async () => {
    const { getByText } = await renderWithProviders(<WelcomeScreen />);
    expect(getByText('Every repetitive task, done by an agent.')).toBeTruthy();
    expect(getByText('AUTOMATION × AI')).toBeTruthy();
    expect(getByText('For businesses, solopreneurs and enterprises.')).toBeTruthy();
  });

  it('routes Get started → signup and Log in → login', async () => {
    const { getByText } = await renderWithProviders(<WelcomeScreen />);
    await fireEvent.press(getByText('Get started'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/signup');
    await fireEvent.press(getByText('Log in'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/login');
  });
});

describe('Log in', () => {
  it('shows the design copy', async () => {
    const { getByText, findByText } = await renderWithProviders(<LoginScreen />);
    expect(getByText('Welcome back to your workspace.')).toBeTruthy();
    expect(await findByText('Continue with Apple')).toBeTruthy();
    expect(getByText('Continue with Google')).toBeTruthy();
    expect(getByText('Continue with Microsoft')).toBeTruthy();
  });

  it('offers no Face ID unlock when this device holds no session (feedback #10, #12)', async () => {
    // Biometrics unlock a stored session and never mint one: after a sign-out or
    // a fresh install there is nothing to unlock, so the button would only lead
    // to "Sign in with your identity provider first."
    readSession.mockResolvedValue(null);
    const { queryByText, findByText } = await renderWithProviders(<LoginScreen />);
    expect(await findByText('Continue with Google')).toBeTruthy();
    expect(queryByText('Unlock with Face ID')).toBeNull();
  });

  it('offers no password path at all, and routes the two real navigation actions', async () => {
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
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/(tabs)/(home)');
    // The unlock is offered because this device holds a session to unlock.
    await fireEvent.press(await screen.findByText('Unlock with Face ID'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/faceid');
    await fireEvent.press(getByText('Sign up'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/signup');
  });
});

describe('Sign up', () => {
  it('offers no manual account creation, and routes Log in', async () => {
    // Same direction as the login screen: accounts are the identity provider's.
    const { getByText, queryByText, queryByPlaceholderText } =
      await renderWithProviders(<SignupScreen />);
    expect(queryByText('Create account')).toBeNull();
    expect(queryByPlaceholderText('8+ characters')).toBeNull();
    expect(queryByPlaceholderText('you@company.com')).toBeNull();
    expect(queryByPlaceholderText('Alex Kim')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalledWith('/(auth)/onboarding');
    await fireEvent.press(getByText('Log in'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('enters onboarding only after an identity-provider session succeeds', async () => {
    const signIn = jest.fn(async () => ({ status: 'signed-in' as const }));
    const { findByText } = await renderWithProviders(
      <SignupScreen />,
      { ...signedInSession, signIn },
    );
    await fireEvent.press(await findByText('Sign up with Apple'));
    expect(signIn).toHaveBeenCalledWith('apple');
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/onboarding');
  });

  it('the provider column is the sign-up', async () => {
    const { findByText, getByText } = await renderWithProviders(<SignupScreen />);
    expect(await findByText('Sign up with Apple')).toBeTruthy();
    expect(getByText('Sign up with Google')).toBeTruthy();
    expect(getByText('Sign up with Microsoft')).toBeTruthy();
    expect(
      getByText('Your account is the Apple, Google, or Microsoft account you sign in with.'),
    ).toBeTruthy();
  });
});

describe('Onboarding tour', () => {
  it('walks the three phases then returns unsigned users to login', async () => {
    const { getByText, queryByText } = await renderWithProviders(<OnboardingScreen />);
    expect(getByText('THE MANUAL GRIND')).toBeTruthy();
    await fireEvent.press(getByText('Next'));
    expect(getByText('AUTOMATION × AI')).toBeTruthy();
    await fireEvent.press(getByText('Next'));
    expect(getByText('YOUR TEAM, UNBURDENED')).toBeTruthy();
    expect(queryByText('Next')).toBeNull();
    await fireEvent.press(getByText('Get started'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('Skip cannot bypass authentication', async () => {
    const { getByText } = await renderWithProviders(<OnboardingScreen />);
    await fireEvent.press(getByText('Skip'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('enters the app after onboarding when a session is signed in', async () => {
    const { getByText } = await renderWithProviders(<OnboardingScreen />, signedInSession);
    await fireEvent.press(getByText('Skip'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)');
  });
});
