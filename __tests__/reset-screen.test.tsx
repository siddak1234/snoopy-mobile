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
    const { getByText, getByLabelText, queryByText } =
      await renderWithProviders(<ResetPasswordScreen />);
    expect(getByText("Enter your email and we'll send a reset link.")).toBeTruthy();

    // The field starts empty — the prototype's pinned demo address is gone, so
    // the address under test has to be entered like a person would.
    await fireEvent.changeText(getByLabelText('Email'), 'dana@northwind.example');
    await fireEvent.press(getByText('Send reset link'));

    expect(getByText('Link sent')).toBeTruthy();
    expect(
      getByText(
        'Check dana@northwind.example — the link expires in 30 minutes. Nothing arriving? Check spam or resend.',
      ),
    ).toBeTruthy();
    expect(queryByText("Enter your email and we'll send a reset link.")).toBeNull();

    await fireEvent.press(getByText('Back to log in'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});
