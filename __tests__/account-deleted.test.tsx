jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { nativeAuthBaseUrl: 'https://www.example.test/api/platform' } } },
}));

import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

import AccountDeletedScreen from '@/app/(auth)/account-deleted';
import { mockRouter, renderWithProviders } from '@/test/render';

let openURL: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => openURL.mockRestore());

describe('Account deleted (24.6.2, backend 25.7.4)', () => {
  it("says what deletion removed in the website's words, and promises nothing more", async () => {
    await renderWithProviders(<AccountDeletedScreen />);
    expect(
      screen.getByText(
        /Your account, your personal workspace and every organization you alone owned have been deleted\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/says what deletion does not remove\./)).toBeTruthy();
    expect(screen.getByText('You can come back anytime with a new account.')).toBeTruthy();
    // Backups, the file records and the sign-in record outlive a deletion (the Privacy
    // Policy's limits), so "permanently removed" would be untrue.
    expect(screen.queryByText(/permanently removed/)).toBeNull();
    expect(screen.queryByText(/first sign-in creates/)).toBeNull();
  });

  it("opens the website's Privacy Policy, which says what deletion leaves", async () => {
    await renderWithProviders(<AccountDeletedScreen />);
    await fireEvent.press(screen.getByTestId('account-deleted-privacy'));
    expect(openURL).toHaveBeenCalledWith('https://www.example.test/privacy');
  });

  it('continues to the app', async () => {
    await renderWithProviders(<AccountDeletedScreen />);
    await fireEvent.press(screen.getByText('Continue to Autom8x'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
