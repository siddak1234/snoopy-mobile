import { fireEvent, screen, within } from '@testing-library/react-native';
import React from 'react';

import ActivityScreen from '@/app/(tabs)/activity/index';
import type { Run } from '@/lib/platform/automations';
import { localMidnight, rangeStart } from '@/lib/platform/runs';
import { routePlatform, runsPayload, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

/**
 * The owner's build 13 decision 4 (2026-10-06, on TestFlight build 13): Activity
 * gets a time range — Today, Week, Month — on a button beside its title, over
 * every run as it opens; Today is the Home tiles' today, Week the last 7 days,
 * Month the last 30; a Home tile still arrives with Today; the outcome chips
 * select with it. Until build 14 a Today ✕ chip could only clear Today.
 *
 * The clock is fixed — only `Date`; every timer is the real one — so each
 * boundary is exact: a run at the boundary is in, one a millisecond before it
 * is out.
 */

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

const Haptics = jest.requireMock('expo-haptics');

/** Tuesday 6 October 2026, 3 pm, in the device's own zone. */
const NOW = new Date(2026, 9, 6, 15, 0, 0, 0);

beforeEach(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  platformOperation.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

/** A run of the invoice flow, made at `at`. */
function run(id: string, status: Run['status'], at: Date, subscriptionId = 'invoice'): Run {
  const base = runsPayload().runs[0]!;
  return {
    ...base,
    id,
    rootRunId: id,
    subscriptionId,
    status,
    resultSummary: status === 'succeeded' ? `Summary ${id}` : undefined,
    failureReason: status === 'failed' ? `Reason ${id}` : undefined,
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
  };
}

/** Each range's boundary, and a run on each side of it, newest first as the platform lists them. */
function aroundEachBoundary(): Run[] {
  return [
    run('today-ok', 'succeeded', new Date(2026, 9, 6, 9, 0, 0, 0)),
    // Local midnight: Today's first moment.
    run('today-failed', 'failed', new Date(2026, 9, 6, 0, 0, 0, 0)),
    run('yesterday-failed', 'failed', new Date(2026, 9, 5, 23, 59, 59, 999)),
    // Seven days back to the minute: Week's first moment.
    run('week-ok', 'succeeded', new Date(2026, 8, 29, 15, 0, 0, 0)),
    run('month-failed', 'failed', new Date(2026, 8, 29, 14, 59, 59, 999)),
    // Thirty days back: Month's first moment.
    run('month-ok', 'succeeded', new Date(2026, 8, 6, 15, 0, 0, 0)),
    run('older-failed', 'failed', new Date(2026, 8, 6, 14, 59, 59, 999)),
  ];
}

const rows = () => screen.queryAllByTestId(/^activity-row-/u).map((row) => String(row.props.testID).replace('activity-row-', ''));

/** Open the time range's card and choose one. */
async function choose(range: 'all' | 'today' | 'week' | 'month') {
  await fireEvent.press(screen.getByTestId('activity-range'));
  await fireEvent.press(within(screen.getByTestId('activity-range-dialog')).getByTestId(`activity-range-${range}`));
}

describe('where each range begins (rangeStart)', () => {
  it('Today is the tiles\' today — local midnight, localMidnight itself — Week 7 days back and Month 30, to the millisecond; All time has no beginning', () => {
    expect(rangeStart('all', NOW)).toBeNull();
    expect(rangeStart('today', NOW)).toEqual(localMidnight(NOW));
    expect(rangeStart('today', NOW)).toEqual(new Date(2026, 9, 6, 0, 0, 0, 0));
    expect(rangeStart('week', NOW)).toEqual(new Date(2026, 8, 29, 15, 0, 0, 0));
    expect(rangeStart('month', NOW)).toEqual(new Date(2026, 8, 6, 15, 0, 0, 0));
    // Back on the calendar, not by a count of hours: the same clock time, across months.
    const late = new Date(2026, 2, 3, 23, 30, 15, 250);
    expect(rangeStart('week', late)).toEqual(new Date(2026, 1, 24, 23, 30, 15, 250));
    expect(rangeStart('month', late)).toEqual(new Date(2026, 1, 1, 23, 30, 15, 250));
  });
});

describe("Activity's time range (the owner's build 13 decision 4)", () => {
  beforeEach(() => {
    routePlatform(platformOperation, { '/runs': { runs: aroundEachBoundary() } });
  });

  it('opens on All time — every run, under its day — and says so on the button beside the title', async () => {
    await renderWithProviders(<ActivityScreen />, signedInSession);
    const button = await screen.findByLabelText('Time range: All time');
    expect(within(button).getByText('All time')).toBeTruthy();
    expect(button.props.accessibilityRole).toBe('button');
    // On the title's row, after the title.
    expect(
      within(button.parent!).getAllByText(/./u).map((node) => node.props.children),
    ).toEqual(['Activity', 'All time']);
    expect(rows()).toEqual(['today-ok', 'today-failed', 'yesterday-failed', 'week-ok', 'month-failed', 'month-ok', 'older-failed']);
    for (const day of ['TODAY', 'YESTERDAY', 'EARLIER']) expect(screen.getByText(day)).toBeTruthy();
  });

  it("the button ticks and opens its card — All time, Today, Week and Month, each saying what it spans, the one chosen ticked — and Done closes it, changing nothing", async () => {
    await renderWithProviders(<ActivityScreen />, signedInSession);
    await screen.findByLabelText('Time range: All time');

    await fireEvent.press(screen.getByTestId('activity-range'));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    const card = screen.getByTestId('activity-range-dialog');
    expect(within(card).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'Time range',
      'All time',
      'Every run',
      'Today',
      'Since midnight',
      'Week',
      'The last 7 days',
      'Month',
      'The last 30 days',
      'Done',
    ]);
    expect(within(within(card).getByTestId('activity-range-all')).getByTestId('activity-range-chosen')).toBeTruthy();
    expect(within(card).getAllByTestId('activity-range-chosen')).toHaveLength(1);
    const reads = platformOperation.mock.calls.length;

    await fireEvent.press(within(card).getByText('Done'));
    expect(screen.queryByTestId('activity-range-dialog')).toBeNull();
    expect(screen.getByLabelText('Time range: All time')).toBeTruthy();
    expect(rows()).toHaveLength(7);
    expect(platformOperation.mock.calls.length).toBe(reads);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('Today, Week and Month list the runs since local midnight, of the last 7 days and of the last 30 — each boundary in, a millisecond before it out — and All time every run again', async () => {
    await renderWithProviders(<ActivityScreen />, signedInSession);
    await screen.findByLabelText('Time range: All time');

    await choose('today');
    expect(screen.queryByTestId('activity-range-dialog')).toBeNull();
    expect(screen.getByLabelText('Time range: Today')).toBeTruthy();
    expect(rows()).toEqual(['today-ok', 'today-failed']);
    expect(screen.queryByText('YESTERDAY')).toBeNull();

    await choose('week');
    expect(screen.getByLabelText('Time range: Week')).toBeTruthy();
    expect(rows()).toEqual(['today-ok', 'today-failed', 'yesterday-failed', 'week-ok']);

    await choose('month');
    expect(screen.getByLabelText('Time range: Month')).toBeTruthy();
    expect(rows()).toEqual(['today-ok', 'today-failed', 'yesterday-failed', 'week-ok', 'month-failed', 'month-ok']);
    // The card ticks the range chosen.
    await fireEvent.press(screen.getByTestId('activity-range'));
    expect(
      within(screen.getByTestId('activity-range-month')).getByTestId('activity-range-chosen'),
    ).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('activity-range-dialog')).getByTestId('activity-range-all'));

    expect(screen.getByLabelText('Time range: All time')).toBeTruthy();
    expect(rows()).toHaveLength(7);
  });

  it('the range and the outcome select together, each kept as the other changes', async () => {
    await renderWithProviders(<ActivityScreen />, signedInSession);
    await screen.findByLabelText('Time range: All time');

    await choose('week');
    await fireEvent.press(screen.getByText('Failed'));
    expect(rows()).toEqual(['today-failed', 'yesterday-failed']);

    await choose('month');
    expect(rows()).toEqual(['today-failed', 'yesterday-failed', 'month-failed']);

    await fireEvent.press(screen.getByText('Success'));
    expect(screen.getByLabelText('Time range: Month')).toBeTruthy();
    expect(rows()).toEqual(['today-ok', 'week-ok', 'month-ok']);

    await choose('today');
    expect(rows()).toEqual(['today-ok']);

    await choose('all');
    await fireEvent.press(screen.getByText('Failed'));
    expect(rows()).toEqual(['today-failed', 'yesterday-failed', 'month-failed', 'older-failed']);
  });

  it('says the range when it holds no run: No runs today. / in the last 7 days. / in the last 30 days. — not the first-run empty', async () => {
    routePlatform(platformOperation, { '/runs': { runs: [run('older-failed', 'failed', new Date(2026, 8, 6, 14, 59, 59, 999))] } });
    await renderWithProviders(<ActivityScreen />, signedInSession);
    await screen.findByLabelText('Time range: All time');
    expect(rows()).toEqual(['older-failed']);

    for (const [range, line] of [
      ['today', 'No runs today.'],
      ['week', 'No runs in the last 7 days.'],
      ['month', 'No runs in the last 30 days.'],
    ] as const) {
      await choose(range);
      expect([range, screen.queryByText(line) !== null, rows()]).toEqual([range, true, []]);
    }
    await fireEvent.press(screen.getByText('Failed'));
    expect(screen.getByText('No failed runs in the last 30 days.')).toBeTruthy();
    await choose('week');
    expect(screen.getByText('No failed runs in the last 7 days.')).toBeTruthy();
    expect(screen.queryByText('No activity yet')).toBeNull();

    await choose('all');
    expect(rows()).toEqual(['older-failed']);
  });

  it('arriving from a Home tile (period=today) selects Today with its outcome, and the card chooses another — and Today again', async () => {
    setMockParams({ filter: 'Failed', period: 'today' });
    await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(await screen.findByLabelText('Time range: Today')).toBeTruthy();
    expect(rows()).toEqual(['today-failed']);

    await choose('week');
    expect(rows()).toEqual(['today-failed', 'yesterday-failed']);
    await choose('today');
    expect(screen.getByLabelText('Time range: Today')).toBeTruthy();
    expect(rows()).toEqual(['today-failed']);
  });

  it('the tab bar changes nothing: drawn again with no params, the range chosen here stays; a flow page\'s tile brings All time with its flow', async () => {
    const view = await renderWithProviders(<ActivityScreen />, signedInSession);
    await view.findByLabelText('Time range: All time');
    await choose('month');

    // The tab bar arrives with nothing: the screen draws again, the range as it was.
    setMockParams({});
    await fireEvent.press(view.getByText('Failed'));
    expect(view.getByLabelText('Time range: Month')).toBeTruthy();
    expect(rows()).toEqual(['today-failed', 'yesterday-failed', 'month-failed']);

    // A flow page's tile counts all time: it brings All time, as it brought no day before.
    setMockParams({ flow: 'invoice', flowName: 'Invoice triage', filter: 'All' });
    await fireEvent.press(view.getByText('Success'));
    expect(await view.findByText('Invoice triage ✕')).toBeTruthy();
    expect(view.getByLabelText('Time range: All time')).toBeTruthy();
    expect(rows()).toHaveLength(7);
  });
});
