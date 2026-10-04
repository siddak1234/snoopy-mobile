import { fireEvent, screen } from 'expo-router/testing-library';

import type { Run } from '@/lib/platform/automations';
import { flowCatalogPayload, runsPayload } from '@/test/platform';
import { answerPlatform, flush, launch, press, pressTab, signedInOnThisPhone } from '@/test/real-router';

/**
 * A tile opens Activity with its selection — every time it is pressed (build 13).
 *
 * Activity applied a tile's selection only when the route's params changed, and
 * a tile pressed again sends the same params to the same screen: clear "Today ✕",
 * go back, press the same tile, and Activity stayed as it was left. Found in
 * build 13's first part, which made Home's tiles open today (the owner's build 12
 * item 1). Only the real router keeps a screen and its params between visits, so
 * this is held here.
 */

jest.setTimeout(60_000);

/** Runs today, yesterday and ten days ago, succeeded and failed: the rows a selection picks from. */
function todayAndOlder() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const older = new Date(now);
  older.setDate(now.getDate() - 10);
  const base = runsPayload().runs[0]!;
  const run = (id: string, status: Run['status'], at: Date): Run => ({
    ...base,
    id,
    rootRunId: id,
    status,
    resultSummary: status === 'succeeded' ? `Summary ${id}` : undefined,
    failureReason: status === 'failed' ? `Reason ${id}` : undefined,
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
  });
  return [
    run('today-ok', 'succeeded', now),
    run('today-failed', 'failed', now),
    run('yesterday-ok', 'succeeded', yesterday),
    run('yesterday-failed', 'failed', yesterday),
    run('older-failed', 'failed', older),
  ];
}

const rows = () => screen.queryAllByTestId(/^activity-row-/u).map((row) => row.props.testID);

async function pressTile(testID: string) {
  await fireEvent.press(screen.getByTestId(testID));
  await flush(100);
  await flush(1000);
}

it('the same Home tile pressed again, after its selection was cleared on Activity, opens Activity with it again', async () => {
  signedInOnThisPhone();
  answerPlatform({}, { '/runs': { runs: todayAndOlder() } });
  const view = await launch();

  await pressTile('stat-Failed');
  expect(view.getPathname()).toBe('/activity');
  expect(screen.getByText('Today ✕')).toBeTruthy();
  expect(rows()).toEqual(['activity-row-today-failed']);

  // Widened on Activity: every day, every outcome.
  await press('Today ✕');
  await press('All');
  expect(screen.queryByText('Today ✕')).toBeNull();
  expect(rows()).toHaveLength(5);

  await pressTab('Home');
  await pressTile('stat-Failed');
  expect(view.getPathname()).toBe('/activity');
  expect(screen.getByText('Today ✕')).toBeTruthy();
  expect(rows()).toEqual(['activity-row-today-failed']);
});

it("the same flow page tile pressed again, after its flow was cleared on Activity, opens Activity with it again", async () => {
  signedInOnThisPhone();
  answerPlatform(
    {},
    {
      '/automations': flowCatalogPayload(),
      '/runs': { runs: todayAndOlder().map((run) => ({ ...run, subscriptionId: 'invoice' })) },
    },
  );
  const view = await launch();
  await pressTab('Flows');
  await press('Invoice triage');

  await pressTile('flow-stat-Failed');
  expect(view.getPathname()).toBe('/activity');
  expect(screen.getByText('Invoice triage ✕')).toBeTruthy();
  expect(rows()).toEqual(['activity-row-today-failed', 'activity-row-yesterday-failed', 'activity-row-older-failed']);

  await press('Invoice triage ✕');
  await press('All');
  expect(screen.queryByText('Invoice triage ✕')).toBeNull();
  expect(rows()).toHaveLength(5);

  await pressTab('Flows');
  await pressTile('flow-stat-Failed');
  expect(view.getPathname()).toBe('/activity');
  expect(screen.getByText('Invoice triage ✕')).toBeTruthy();
  expect(rows()).toEqual(['activity-row-today-failed', 'activity-row-yesterday-failed', 'activity-row-older-failed']);
});

it('the tab bar changes nothing: after a tile visit and a clear, Activity opens from its tab as it was left', async () => {
  signedInOnThisPhone();
  answerPlatform({}, { '/runs': { runs: todayAndOlder() } });
  const view = await launch();

  await pressTile('stat-Failed');
  expect(screen.getByText('Today ✕')).toBeTruthy();
  await press('Today ✕');
  await press('Success');
  expect(rows()).toEqual(['activity-row-today-ok', 'activity-row-yesterday-ok']);

  await pressTab('Home');
  await pressTab('Activity');
  expect(view.getPathname()).toBe('/activity');
  expect(screen.queryByText('Today ✕')).toBeNull();
  expect(rows()).toEqual(['activity-row-today-ok', 'activity-row-yesterday-ok']);
});
