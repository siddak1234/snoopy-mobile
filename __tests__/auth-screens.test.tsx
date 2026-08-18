import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import LoginScreen from '@/app/(auth)/login';
import OnboardingScreen from '@/app/(auth)/onboarding';
import SignupScreen from '@/app/(auth)/signup';
import WelcomeScreen from '@/app/(auth)/welcome';
import { routePlatform, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

beforeEach(() => {
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
    expect(getByText('Stay logged in')).toBeTruthy();
    expect(await findByText('Continue with Apple')).toBeTruthy();
    expect(getByText('Continue with Google')).toBeTruthy();
    expect(getByText('Continue with Microsoft')).toBeTruthy();
  });

  it('refuses password login and routes the two real navigation actions', async () => {
    const { getByText } = await renderWithProviders(<LoginScreen />);
    await fireEvent.press(getByText('Log In'));
    expect(getByText('Password login is not available. Continue with an identity provider below.')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/(tabs)/(home)');
    await fireEvent.press(getByText('Unlock with Face ID'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/faceid');
    await fireEvent.press(getByText('Sign up'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/signup');
  });
});

describe('Sign up', () => {
  it('refuses manual account creation and routes Log in', async () => {
    const { getByText } = await renderWithProviders(<SignupScreen />);
    await fireEvent.press(getByText('Create account'));
    expect(getByText('Accounts are created through Apple, Google, or Microsoft.')).toBeTruthy();
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

  it('shows the design placeholders', async () => {
    const { getByPlaceholderText } = await renderWithProviders(<SignupScreen />);
    expect(getByPlaceholderText('Alex Kim')).toBeTruthy();
    expect(getByPlaceholderText('you@company.com')).toBeTruthy();
    expect(getByPlaceholderText('8+ characters')).toBeTruthy();
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
