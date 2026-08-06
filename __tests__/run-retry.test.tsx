/**
 * Failed-run retry (design `rty`). Isolated fake-timer file per the
 * one-scenario-per-file rule — see timed-screens.test.tsx.
 */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';

import RunDetailScreen from '@/app/(tabs)/(home)/run';
import { renderWithProviders, setMockParams } from '@/test/render';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('Run retry', () => {
  it('goes failed → retrying → retried after 1600ms', async () => {
    setMockParams({ variant: 'failed' });
    const { getByText, queryByText } = await renderWithProviders(<RunDetailScreen />);

    expect(getByText('Run #52')).toBeTruthy();
    expect(getByText('Failed')).toBeTruthy();

    await fireEvent.press(getByText('Retry run'));
    expect(getByText('Retrying…')).toBeTruthy();
    // Still the failed run while in flight.
    expect(getByText('Sheets connection failed')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1600);
    });

    expect(getByText('Success')).toBeTruthy();
    expect(getByText('Weekly KPI report · retried just now')).toBeTruthy();
    expect(getByText('Sheets reconnected & fetched')).toBeTruthy();
    expect(getByText('Posted to Slack')).toBeTruthy();
    expect(getByText('26s')).toBeTruthy();
    // The retried run has no primary action and no extracted fields.
    expect(queryByText('Retry run')).toBeNull();
    expect(queryByText('EXTRACTED FIELDS')).toBeNull();
  });
});
