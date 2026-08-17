import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import SettingsScreen from '@/app/(tabs)/settings';
import type { SessionContextValue } from '@/hooks/use-session';
import { SIGN_OUT_FAILED } from '@/lib/content/screen-states';
import { mockRouter, renderWithProviders } from '@/test/render';

/**
 * Sign-out honours the one answer the platform added so a client could tell.
 *
 * ADR-0017 §4: `POST /v1/auth/logout` answers **502** rather than 204 when
 * revocation fails, because a device still holds its tokens and a 204 would tell
 * it to delete a keychain entry for a session that is still live upstream. So
 * the screen must not navigate away on a failure — doing so would claim a
 * sign-out that did not happen, and strand a session nobody can reach.
 *
 * Before this was wired, the button called `router.replace('/(auth)/welcome')`
 * and never called `signOut()` at all, so the contract's whole point was unused.
 */

function sessionWith(signOut: SessionContextValue['signOut']): SessionContextValue {
  return {
    status: 'unconfigured',
    refresh: () => {},
    signIn: async () => ({ status: 'unconfigured', message: 'no backend in tests' }),
    signOut,
  };
}

describe('Settings sign-out', () => {
  it('leaves for Welcome only when the session was actually revoked', async () => {
    const signOut = jest.fn(async () => ({ revoked: true }));
    await renderWithProviders(<SettingsScreen />, sessionWith(signOut));

    await fireEvent.press(screen.getByText('Sign out'));

    expect(signOut).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/welcome');
    expect(screen.queryByTestId('action-failure')).toBeNull();
  });

  it('stays put and says so when revocation failed (502)', async () => {
    const signOut = jest.fn(async () => ({ revoked: false }));
    await renderWithProviders(<SettingsScreen />, sessionWith(signOut));

    await fireEvent.press(screen.getByText('Sign out'));

    // The person is still signed in on this device, and the screen says both
    // halves of that: what did not happen, and that nothing was cleared.
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('action-failure')).toBeTruthy();
    expect(screen.getByText(SIGN_OUT_FAILED)).toBeTruthy();
  });

  it('offers the action again, and clears the callout once it succeeds', async () => {
    const signOut = jest
      .fn<Promise<{ revoked: boolean }>, []>()
      .mockResolvedValueOnce({ revoked: false })
      .mockResolvedValueOnce({ revoked: true });
    await renderWithProviders(<SettingsScreen />, sessionWith(signOut));

    await fireEvent.press(screen.getByText('Sign out'));
    expect(screen.getByTestId('action-failure')).toBeTruthy();

    await fireEvent.press(screen.getByText('Retry sign out'));
    expect(signOut).toHaveBeenCalledTimes(2);
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/welcome');
  });
});
