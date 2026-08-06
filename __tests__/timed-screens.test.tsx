/**
 * Splash auto-advance. One fake-timer scenario per file — a second render
 * after a fake-timer run inherits a poisoned React scheduler and mounts
 * blank (see splash-tap.test.tsx and faceid-screen.test.tsx).
 */
import React from 'react';
import { act } from '@testing-library/react-native';

import SplashScreen from '@/app/index';
import { mockRouter, renderWithProviders } from '@/test/render';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('Splash', () => {
  it('auto-advances to Welcome after 2400ms', async () => {
    const { getByText } = await renderWithProviders(<SplashScreen />);
    expect(getByText('AUTOMATION × AI')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(2400);
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/welcome');
  });
});
