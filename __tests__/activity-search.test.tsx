import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import ActivityScreen from '@/app/(tabs)/activity/index';
import { BLOCK_WORDS } from '@/lib/generated/platform-contracts/block-rules';
import type { Run } from '@/lib/platform/automations';
import { localMidnight } from '@/lib/platform/runs';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { approvalsPayload, routePlatform, runsAsSelected, runsPayload, signedInSession } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Activity's search, outcome, range, sort and pages go to the platform
 * (Round 21; backend ADR-0048 amendment 1, point 4; `listRuns`' `q`, `status`,
 * `needsReview`, `since`, `sort` and `page`): the platform selects, so a page
 * is never emptied by a filter on the phone. "Needs review" is
 * `needsReview=true`, never `status=held`, so a held run someone already
 * decided is not listed. Over 25 that match (`total`), the sort and the
 * pager; an answer without `total` — a platform before Round 21 — is one page.
 *
 * Which jobs match `q`, a status or `needsReview` is the platform's (its route
 * tests): these hold what the screen sends, and that it draws the page it is
 * answered as given, filtering nothing itself (Round 21's review; the stub
 * `runsAsSelected` pages, and selects only by status and since).
 */

const base = runsPayload().runs[0]!;
function run(id: string, status: Run['status'], at: Date, title?: string): Run {
  return { ...base, id, rootRunId: id, status, title, resultSummary: `Summary ${id}`, createdAt: at.toISOString(), updatedAt: at.toISOString() };
}

const now = new Date();
const RUNS = [
  run('ok-1', 'succeeded', now, 'Harbor Paper invoice'),
  run('fail-1', 'failed', now),
  run('held-open', 'held', now),
  run('held-decided', 'held', now),
];

/** The runs list's asks, each as its parameters. */
const asked = () =>
  platformOperation.mock.calls
    .map(([path]: [string]) => path)
    .filter((path: string) => /\/runs\?/u.test(path))
    .map((path: string) => Object.fromEntries(new URLSearchParams(path.split('?')[1])));
const last = () => asked()[asked().length - 1];
const rows = () => screen.queryAllByTestId(/^activity-row-/u).map((row) => String(row.props.testID).replace('activity-row-', ''));

beforeEach(() => {
  platformOperation.mockReset();
  resetSnapshot();
});

async function open(runs: readonly Run[] = RUNS, answer?: (path: string) => { runs: Run[]; total?: number }) {
  routePlatform(platformOperation, { '/runs': answer ?? runsAsSelected(runs), '/approvals': approvalsPayload() });
  await renderWithProviders(<ActivityScreen />, signedInSession);
  await screen.findByTestId('activity-search');
}

async function outcome(choice: 'All' | 'Success' | 'Needs review' | 'Failed') {
  await fireEvent.press(screen.getByTestId('activity-outcome'));
  await fireEvent.press(screen.getByTestId(`activity-outcome-option-${choice}`));
}

describe('Activity asks the platform', () => {
  it('opens on the newest page: sort and page sent, and nothing else; the search box says "Search runs"', async () => {
    await open();
    expect(last()).toEqual({ sort: 'newest', page: '1' });
    expect(screen.getByTestId('activity-search').props.placeholder).toBe(BLOCK_WORDS.searchRuns);
  });

  it('the search goes as q once typing rests, and a miss says "Nothing matches "…"."', async () => {
    // A miss: none match, so one empty page and a total of 0 (listRuns' "the jobs that match").
    await open(RUNS, (path) => (path.includes('q=zzz') ? { runs: [], total: 0 } : runsAsSelected(RUNS)(path)));
    await fireEvent.changeText(screen.getByTestId('activity-search'), '  harbor ');
    await waitFor(() => expect(last()).toEqual({ q: 'harbor', sort: 'newest', page: '1' }));
    await fireEvent.changeText(screen.getByTestId('activity-search'), 'zzz');
    await waitFor(() => expect(screen.getByTestId('activity-no-match').props.children).toBe('Nothing matches "zzz".'));
  });

  it('Success sends status=succeeded, Failed status=failed', async () => {
    await open();
    await outcome('Success');
    await waitFor(() => expect(last()).toEqual({ status: 'succeeded', sort: 'newest', page: '1' }));
    await outcome('Failed');
    await waitFor(() => expect(last()).toEqual({ status: 'failed', sort: 'newest', page: '1' }));
  });

  it('Needs review sends needsReview=true, never status=held — which lists a held run long after its approval — and draws the page as answered', async () => {
    // Whatever the platform answers is drawn: the phone filters no outcome itself (~~FILTER_STATUS~~).
    await open(RUNS, () => ({ runs: [...RUNS], total: RUNS.length }));
    await outcome('Needs review');
    await waitFor(() => expect(last()).toEqual({ needsReview: 'true', sort: 'newest', page: '1' }));
    expect(asked().some((query: Record<string, string>) => 'status' in query)).toBe(false);
    expect(rows()).toEqual(RUNS.map((one) => one.id));
  });

  it('a time range goes as since: Today from local midnight', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('activity-range'));
    await fireEvent.press(within(screen.getByTestId('activity-range-menu')).getByTestId('activity-range-today'));
    await waitFor(() => expect(last()).toEqual({ since: localMidnight().toISOString(), sort: 'newest', page: '1' }));
  });
});

describe('Activity over 25: the sort and the pager', () => {
  const thirty = Array.from({ length: 30 }, (_, at) => run(`r-${String(at + 1).padStart(2, '0')}`, 'succeeded', new Date(now.getTime() - at * 60_000)));

  it('total 30 shows the sort and "Page 1 of 2"; Next asks page 2; Oldest first asks sort=oldest from page 1', async () => {
    await open(thirty);
    expect(await screen.findByTestId('activity-pager')).toBeTruthy();
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText(`${BLOCK_WORDS.sort}: ${BLOCK_WORDS.newestFirst}`)).toBeTruthy();
    expect(rows()).toHaveLength(25);
    await fireEvent.press(screen.getByTestId('activity-pager-next'));
    await waitFor(() => expect(last()).toEqual({ sort: 'newest', page: '2' }));
    expect(await screen.findByText('Page 2 of 2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('activity-sort'));
    await fireEvent.press(await screen.findByTestId('activity-sort-option-oldest'));
    await waitFor(() => expect(last()).toEqual({ sort: 'oldest', page: '1' }));
  });

  it('an answer without total is one page: no sort, no pager, every row it holds', async () => {
    await open(thirty, () => ({ runs: thirty }));
    expect(rows()).toHaveLength(30);
    expect(screen.queryByTestId('activity-pager')).toBeNull();
    expect(screen.queryByTestId('activity-sort')).toBeNull();
  });

  it('25 or fewer: no sort and no pager', async () => {
    await open(thirty.slice(0, 25));
    expect(rows()).toHaveLength(25);
    expect(screen.queryByTestId('activity-pager')).toBeNull();
    expect(screen.queryByTestId('activity-sort')).toBeNull();
  });
});
