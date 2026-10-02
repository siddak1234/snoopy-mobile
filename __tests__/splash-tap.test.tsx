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

describe('The cover (24.11.6)', () => {
  it('waits when signed out: a tap does nothing, Get started is the one way on, and it navigates once', async () => {
    const { getByText } = await renderWithProviders(<SplashScreen />);
    // fireEvent walks up from the kicker to the screen's root Pressable, which
    // used to skip the splash. Signed out there is nothing to skip to.
    await fireEvent.press(getByText('AUTOMATION × AI'));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await fireEvent.press(getByText('Get started'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
    await fireEvent.press(getByText('Get started'));
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });
});
