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

  it('truthfully hands password recovery back to the identity provider', async () => {
    const { getByText, getByLabelText, queryByText } =
      await renderWithProviders(<ResetPasswordScreen />);
    expect(getByText('Autom8x sign-in is managed by your identity provider.')).toBeTruthy();

    // The field starts empty — the prototype's pinned demo address is gone, so
    // the address under test has to be entered like a person would.
    await fireEvent.changeText(getByLabelText('Email'), 'dana@northwind.example');
    await fireEvent.press(getByText('View reset options'));

    expect(getByText('Reset with your provider')).toBeTruthy();
    expect(
      getByText(
        'Autom8x does not issue a password or reset link. Reset access with the Apple, Google, or Microsoft account you use to sign in.',
      ),
    ).toBeTruthy();
    expect(queryByText('Autom8x sign-in is managed by your identity provider.')).toBeNull();

    await fireEvent.press(getByText('Back to log in'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});
