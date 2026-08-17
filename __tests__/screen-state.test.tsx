import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import { ActionFailure, ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import {
  ERROR_BODY,
  FALLBACK_ERROR_TITLE,
  OFFLINE_TITLE,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { renderWithProviders } from '@/test/render';
import { stabilizeAnimated } from '@/test/stabilize';

/**
 * The shared data states, and the copy they are contractually required to say.
 *
 * Snapshotted in both palettes for the same reason the Nocturne set is: these
 * are drawn from tokens, and light overrides only part of the ramp. They go
 * through `stabilizeAnimated` because the loading state is eleven pulsing
 * skeletons — the exact thing that made the visual gate flaky.
 */

const CASES = [
  { name: 'ScreenLoading', element: <ScreenLoading /> },
  { name: 'ScreenLoading/tiles', element: <ScreenLoading tiles /> },
  { name: 'ScreenError', element: <ScreenError title="Couldn't load this run" /> },
  { name: 'ScreenOffline', element: <ScreenOffline /> },
  {
    name: 'ActionFailure',
    element: (
      <ActionFailure
        message="Email triage wasn't removed — it's still active and your plan total is unchanged."
        retryLabel="Retry removal"
      />
    ),
  },
] as const;

describe.each(['dark', 'light'] as const)('screen states — %s palette', (mode) => {
  it.each(CASES.map((c) => [c.name, c.element] as const))('%s renders unchanged', async (_n, el) => {
    const { toJSON } = await renderWithProviders(el, undefined, mode);
    expect(stabilizeAnimated(toJSON())).toMatchSnapshot();
  });
});

describe('errorTitleFor — the design names the thing, not the mechanism', () => {
  it('gives every fetching screen its own title', () => {
    expect(errorTitleFor('run')).toBe("Couldn't load this run");
    expect(errorTitleFor('detail')).toBe("Couldn't load this workflow");
    expect(errorTitleFor('flows')).toBe("Couldn't load your workflows");
    expect(errorTitleFor('approvals')).toBe("Couldn't load approvals");
    expect(errorTitleFor('configure')).toBe("Couldn't load this template");
  });

  it('falls back rather than rendering an empty headline', () => {
    expect(errorTitleFor(undefined)).toBe(FALLBACK_ERROR_TITLE);
    expect(errorTitleFor('not-a-screen')).toBe(FALLBACK_ERROR_TITLE);
  });
});

describe('the failure states', () => {
  it('offers Retry and Go back on a failed load, and calls them', async () => {
    const onRetry = jest.fn();
    const onBack = jest.fn();
    const { getByText } = await renderWithProviders(
      <ScreenError title="Couldn't load activity" onRetry={onRetry} onBack={onBack} />,
    );
    expect(getByText("Couldn't load activity")).toBeTruthy();
    expect(getByText(ERROR_BODY)).toBeTruthy();
    await fireEvent.press(getByText('Retry'));
    await fireEvent.press(getByText('Go back'));
    expect(onRetry).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
  });

  it('offers only Retry when offline — nothing is wrong with the platform', async () => {
    const { getByText, queryByText } = await renderWithProviders(<ScreenOffline />);
    expect(getByText(OFFLINE_TITLE)).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
    expect(queryByText('Go back')).toBeNull();
  });

  it('states what did NOT happen and keeps its retry, per the ratified grammar', async () => {
    const onRetry = jest.fn();
    const { getByText, getByTestId } = await renderWithProviders(
      <ActionFailure
        message="Your decision didn't sync — the run is still held, nothing was posted."
        retryLabel="Retry decision"
        onRetry={onRetry}
      />,
    );
    expect(getByTestId('action-failure').props.accessibilityRole).toBe('alert');
    expect(getByText(/didn't sync/)).toBeTruthy();
    await fireEvent.press(getByText('Retry decision'));
    expect(onRetry).toHaveBeenCalled();
  });
});
