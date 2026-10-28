import { screen } from 'expo-router/testing-library';

import { ERROR_BODY, FALLBACK_ERROR_TITLE } from '@/lib/content/screen-states';
import { answerPlatform, kept, launch, press } from '@/test/real-router';

/**
 * The app's last boundary (round 21, design D2.6): a screen that throws reaches
 * the root layout's `ErrorBoundary`, which Expo Router puts around the whole
 * stack, and draws the failed-load state with Retry — not a closed app. Until
 * round 21 the app had no boundary at its root (`app/_layout.tsx`). Run under
 * the real router, since only it reads a route file's `ErrorBoundary` export.
 */

jest.setTimeout(60_000);

/** The cover's mark, made to throw on a flag: a screen breaking with nothing in its own code made to fail. */
const mockBreak = { mark: false };
jest.mock('@/components/nocturne/brand-mark', () => {
  const actual = jest.requireActual('@/components/nocturne/brand-mark');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    BrandMark: (props: Record<string, unknown>) => {
      if (mockBreak.mark) throw new Error('a mark this build cannot draw');
      return ReactActual.createElement(actual.BrandMark, props);
    },
  };
});

let logged: jest.SpyInstance;
beforeEach(() => {
  logged = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  logged.mockRestore();
  mockBreak.mark = false;
});

describe("the root layout's ErrorBoundary", () => {
  it('a cover that throws draws "Couldn\'t load this" with Retry, logs one line as `unknown`, and Retry draws the cover again', async () => {
    kept.clear();
    answerPlatform();
    mockBreak.mark = true;
    await launch();

    expect(screen.getByTestId('screen-error')).toBeTruthy();
    expect(screen.getByText(FALLBACK_ERROR_TITLE)).toBeTruthy();
    expect(screen.getByText(ERROR_BODY)).toBeTruthy();
    expect(screen.queryByText('Get started')).toBeNull();
    const lines = logged.mock.calls.filter(([message]) => message === 'block not drawn');
    expect(lines).toEqual([['block not drawn', { type: 'unknown', error: expect.any(Error) }]]);
    expect((lines[0]![1] as { error: Error }).error.message).toBe('a mark this build cannot draw');

    mockBreak.mark = false;
    await press('Retry');
    expect(screen.queryByTestId('screen-error')).toBeNull();
    expect(screen.getByText('Get started')).toBeTruthy();
  });
});
