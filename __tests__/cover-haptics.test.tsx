/**
 * The cover's tick (build 11, D7), in its own file: `splash-tap.test.tsx` holds
 * the one fake-timer scenario a file may hold, and these run on real timers —
 * the signed-in splash's 2400 ms advance is cleared when the screen unmounts.
 */
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';

import SplashScreen from '@/app/index';
import { signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

const Haptics = jest.requireMock('expo-haptics');

describe('The cover and its tick (build 11, D7)', () => {
  it('gives no tick to a tap that does nothing — the signed-out cover — and one to Get started', async () => {
    const { getByText } = await renderWithProviders(<SplashScreen />);
    await fireEvent.press(getByText('AUTOMATION × AI'));
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await fireEvent.press(getByText('Get started'));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('ticks on a signed-in tap, which skips the splash', async () => {
    const { getByText } = await renderWithProviders(<SplashScreen />, signedInSession);
    await fireEvent.press(getByText('AUTOMATION × AI'));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)'));
  });
});
