/** Splash tap-to-skip, isolated per the one-fake-timer-scenario-per-file rule. */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';

import SplashScreen from '@/app/index';
import { mockRouter, renderWithProviders } from '@/test/render';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('Splash tap', () => {
  it('advances immediately on tap, and never navigates twice', async () => {
    const { getByText } = await renderWithProviders(<SplashScreen />);
    // fireEvent walks up from the kicker to the screen's root Pressable.
    await fireEvent.press(getByText('AUTOMATION × AI'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/welcome');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });
});
