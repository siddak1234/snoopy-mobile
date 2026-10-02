/**
 * Splash auto-advance. One fake-timer scenario per file — a second render
 * after a fake-timer run inherits a poisoned React scheduler and mounts
 * blank (see splash-tap.test.tsx and faceid-screen.test.tsx).
 */
import React from 'react';
import { act } from '@testing-library/react-native';

import SplashScreen from '@/app/index';
import { signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/session-store', () => ({ readFaceIdEnabled: jest.fn(async () => false) }));

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('Splash', () => {
  it('signed in, auto-advances to the workspace after 2400ms; signed out it is the cover, and stays (24.11.6)', async () => {
    const { getByText, queryByText } = await renderWithProviders(<SplashScreen />, signedInSession);
    expect(getByText('AUTOMATION × AI')).toBeTruthy();
    expect(queryByText('Get started')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(2400);
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(home)');
  });
});
