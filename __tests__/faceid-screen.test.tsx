/**
 * Face ID auto-unlock. Isolated in its own file so its fake-timer run cannot
 * interact with any other suite's scheduler state.
 */
import React from 'react';
import { act } from '@testing-library/react-native';

import FaceIdScreen from '@/app/(auth)/faceid';
import { mockRouter, renderWithProviders } from '@/test/render';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

describe('Face ID unlock', () => {
  it('shows the unlocking state and auto-enters the app once', async () => {
    const { getByText } = await renderWithProviders(<FaceIdScreen />);
    expect(getByText('Face ID')).toBeTruthy();
    expect(getByText('Unlocking your workspace…')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(2100);
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });
});
