import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import LoginScreen from '@/app/(auth)/login';
import ResetPasswordScreen from '@/app/(auth)/reset';
import { mockRouter, renderWithProviders } from '@/test/render';

describe('Password reset (design sReset)', () => {
  it('is reachable from the login Forgot? link', async () => {
    const { getByText } = await renderWithProviders(<LoginScreen />);
    await fireEvent.press(getByText('Forgot?'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/reset');
  });

  it('sends the link and shows the confirmation', async () => {
    const { getByText, queryByText } = await renderWithProviders(<ResetPasswordScreen />);
    expect(getByText("Enter your email and we'll send a reset link.")).toBeTruthy();

    await fireEvent.press(getByText('Send reset link'));

    expect(getByText('Link sent')).toBeTruthy();
    expect(
      getByText(
        'Check alex@acme.co — the link expires in 30 minutes. Nothing arriving? Check spam or resend.',
      ),
    ).toBeTruthy();
    expect(queryByText("Enter your email and we'll send a reset link.")).toBeNull();

    await fireEvent.press(getByText('Back to log in'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});
