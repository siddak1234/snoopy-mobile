import * as SecureStore from 'expo-secure-store';
import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import { nocturneDark, nocturneLight } from '@/constants/theme';
import { readAppearance } from '@/lib/platform/appearance-store';
import { answerPlatform, flush, kept, launch, press, signedInOnThisPhone } from '@/test/real-router';

/**
 * Settings › Appearance is kept on the device (Gate 24 parity, G2), as the
 * website keeps its theme in the browser and applies it before first paint.
 * Until Gate 24 every cold launch returned to Dark. Run under the real router
 * because the stored choice is read by the app's own root layout, before its
 * first frame.
 */

jest.setTimeout(60_000);

/** The cover's ground, the first thing a launch draws. */
const coverGround = () => StyleSheet.flatten(screen.getByTestId('cover').props.style).backgroundColor;

/** The appearance segments on Settings, by label, and whether each is the one chosen. */
const chosen = () =>
  within(screen.getByTestId('settings-appearance'))
    .getAllByRole('button')
    .map((option) => [within(option).getByText(/./u).props.children, option.props.accessibilityState?.selected]);

describe('the appearance a person chose is the next launch’s (Gate 24 parity, G2)', () => {
  it('Light chosen on Settings is kept this-device-only, and the next launch opens in Light from its first frame — Settings saying so — and stays Light after a sign-out', async () => {
    signedInOnThisPhone();
    answerPlatform();
    await launch();
    await press('Settings');
    expect(chosen()).toEqual([
      ['Auto', false],
      ['Dark', true],
      ['Light', false],
    ]);

    await fireEvent.press(within(screen.getByTestId('settings-appearance')).getByText('Light'));
    await flush(100);
    expect(kept.get('autom8x.appearance')).toBe('light');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('autom8x.appearance', 'light', {
      keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    });
    await screen.unmount();

    // A cold launch whose Keychain answers the appearance after the fonts have
    // loaded: nothing is drawn until it has, and the first frame is the cover,
    // already Light — never a Dark one switched.
    const getItem = SecureStore.getItemAsync as jest.Mock;
    const keychain = getItem.getMockImplementation()!;
    getItem.mockImplementation((key: string, ...rest: unknown[]) =>
      key === 'autom8x.appearance'
        ? new Promise((resolve) => setTimeout(() => resolve(keychain(key, ...rest)), 300))
        : keychain(key, ...rest),
    );
    try {
      const view = renderRouter('./app', { initialUrl: '/' });
      await (view as unknown as Promise<unknown>);
      await flush(0);
      expect(screen.queryByTestId('cover')).toBeNull();
      await flush(400);
      expect(coverGround()).toBe(nocturneLight.bg);
    } finally {
      getItem.mockImplementation(keychain);
    }
    await flush(2500);
    await press('Settings');
    expect(chosen()).toEqual([
      ['Auto', false],
      ['Dark', false],
      ['Light', true],
    ]);

    // The device's, not the session's: a sign-out keeps it, as the website's theme outlives one.
    await press('Sign out');
    await fireEvent.press(within(screen.getByTestId('sign-out-dialog')).getByText('Sign out'));
    await flush(1000);
    expect(screen.getByText('Get started')).toBeTruthy();
    expect(coverGround()).toBe(nocturneLight.bg);
    expect([...kept.keys()]).toEqual(['autom8x.appearance']);
  });

  it.each([
    ['none kept', undefined],
    ['one the app does not know', 'sepia'],
  ])('with %s, a launch opens in Dark, the design’s default', async (_case, stored) => {
    kept.clear();
    if (stored) kept.set('autom8x.appearance', stored);
    await expect(readAppearance()).resolves.toBe('dark');
    answerPlatform();
    await launch();
    expect(screen.getByText('Get started')).toBeTruthy();
    expect(coverGround()).toBe(nocturneDark.bg);
  });
});
