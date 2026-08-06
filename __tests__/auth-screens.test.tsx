import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import LoginScreen from '@/app/(auth)/login';
import OnboardingScreen from '@/app/(auth)/onboarding';
import SignupScreen from '@/app/(auth)/signup';
import WelcomeScreen from '@/app/(auth)/welcome';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

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
    const { getByText } = await renderWithProviders(<LoginScreen />);
    expect(getByText('Welcome back to your workspace.')).toBeTruthy();
    expect(getByText('Stay logged in')).toBeTruthy();
    expect(getByText('Continue with Apple')).toBeTruthy();
    expect(getByText('Continue with Google')).toBeTruthy();
    expect(getByText('Continue with Microsoft')).toBeTruthy();
  });

  it('routes Log In → tabs, Face ID → faceid, Sign up → signup', async () => {
    const { getByText } = await renderWithProviders(<LoginScreen />);
    await fireEvent.press(getByText('Log In'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)');
    await fireEvent.press(getByText('Unlock with Face ID'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/faceid');
    await fireEvent.press(getByText('Sign up'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/signup');
  });
});

describe('Sign up', () => {
  it('routes Create account → onboarding and Log in → login', async () => {
    const { getByText } = await renderWithProviders(<SignupScreen />);
    await fireEvent.press(getByText('Create account'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/onboarding');
    await fireEvent.press(getByText('Log in'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('shows the design placeholders', async () => {
    const { getByPlaceholderText } = await renderWithProviders(<SignupScreen />);
    expect(getByPlaceholderText('Alex Kim')).toBeTruthy();
    expect(getByPlaceholderText('you@company.com')).toBeTruthy();
    expect(getByPlaceholderText('8+ characters')).toBeTruthy();
  });
});

describe('Onboarding tour', () => {
  it('walks the three phases then enters the app', async () => {
    const { getByText, queryByText } = await renderWithProviders(<OnboardingScreen />);
    expect(getByText('THE MANUAL GRIND')).toBeTruthy();
    await fireEvent.press(getByText('Next'));
    expect(getByText('AUTOMATION × AI')).toBeTruthy();
    await fireEvent.press(getByText('Next'));
    expect(getByText('YOUR TEAM, UNBURDENED')).toBeTruthy();
    expect(queryByText('Next')).toBeNull();
    await fireEvent.press(getByText('Get started'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)');
  });

  it('Skip enters the app immediately', async () => {
    const { getByText } = await renderWithProviders(<OnboardingScreen />);
    await fireEvent.press(getByText('Skip'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)');
  });
});

describe('Log in error state (design loginErr)', () => {
  it('shows the designed error callout', async () => {
    setMockParams({ state: 'error' });
    const { getByText } = await renderWithProviders(<LoginScreen />);
    expect(getByText("That password didn't match. Try again, or reset it below.")).toBeTruthy();
  });

  it('hides the callout by default', async () => {
    const { queryByText } = await renderWithProviders(<LoginScreen />);
    expect(queryByText("That password didn't match. Try again, or reset it below.")).toBeNull();
  });
});
