import React from 'react';
import { screen } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/(home)/index';
import type { SessionContextValue } from '@/hooks/use-session';
import { localMidnight, readRunStats } from '@/lib/platform/runs';
import { toStatTiles } from '@/lib/view/catalog';
import { routePlatform } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * `run-stats`, and Home's three tiles.
 *
 * Round 6.6 published this; before it, a runs list could be paged but never
 * counted, so the tiles had no source at any shape. §12.1 #73b names the
 * substitute exactly: `run-stats?since=<local midnight>`, reading `total`,
 * `succeeded`, `failed`.
 */

const WORKSPACE = '33333333-3333-4333-8333-333333333333';

const signedIn = {
  status: 'signed-in',
  session: {
    user: { userId: 'u1', email: 'd@e.com', activeWorkspaceId: WORKSPACE },
    workspaces: [{ id: WORKSPACE, name: 'Acme', role: 'owner' }],
  },
  refresh: () => {},
  reload: async () => ({ status: 'signed-in' as const }),
  signIn: async () => ({ status: 'unconfigured' as const, message: '' }),
  signOut: async () => ({ revoked: true }),
} as unknown as SessionContextValue;

const COUNTS = {
  total: 1284,
  pending: 3,
  running: 2,
  held: 5,
  succeeded: 1272,
  failed: 12,
  cancelled: 1,
};

beforeEach(() => platformOperation.mockReset());

describe('readRunStats — the query the spec is strict about', () => {
  it('omits `since` entirely when there is no window, because ?since= is a 400', () => {
    routePlatform(platformOperation, {
      '/run-stats': { workspace: COUNTS, subscriptions: [] },
    });
    readRunStats(WORKSPACE);
    expect(platformOperation).toHaveBeenCalledWith(
      `/v1/workspaces/${WORKSPACE}/run-stats`,
      expect.any(Function),
    );
  });

  it('sends an ISO instant when windowed', () => {
    platformOperation.mockResolvedValue({ workspace: COUNTS, subscriptions: [] });
    const since = new Date(Date.UTC(2026, 7, 17, 4, 0, 0));
    readRunStats(WORKSPACE, since);
    expect(platformOperation).toHaveBeenCalledWith(
      `/v1/workspaces/${WORKSPACE}/run-stats?since=${encodeURIComponent(since.toISOString())}`,
      expect.any(Function),
    );
  });
});

describe('localMidnight', () => {
  it('is midnight in the device’s own zone, not UTC', () => {
    const midnight = localMidnight(new Date(2026, 7, 17, 15, 42, 9));
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
    expect(midnight.getDate()).toBe(17);
  });
});

describe('toStatTiles', () => {
  it('draws total, succeeded and failed — the three §12.1 #73b names', () => {
    expect(toStatTiles(COUNTS)).toEqual([
      { value: '1,284', label: 'Runs today', tone: 'text' },
      { value: '1,272', label: 'Successes', tone: 'ok' },
      { value: '12', label: 'Failures', tone: 'err' },
    ]);
  });

  it('shows none of the other four statuses — a fourth tile would be a design change', () => {
    const labels = toStatTiles(COUNTS).map((t) => t.label);
    expect(labels).toHaveLength(3);
    for (const absent of ['Pending', 'Running', 'Held', 'Cancelled']) {
      expect(labels).not.toContain(absent);
    }
  });

  it('groups thousands the way the design draws them', () => {
    expect(toStatTiles({ ...COUNTS, total: 1284 })[0].value).toBe('1,284');
  });
});

describe('Home stats row', () => {
  it('renders the platform’s counts, not the prototype’s', async () => {
    routePlatform(platformOperation, {
      '/run-stats': { workspace: COUNTS, subscriptions: [] },
    });
    await renderWithProviders(<HomeScreen />, signedIn);

    expect(await screen.findByText('1,284')).toBeTruthy();
    expect(screen.getByText('1,272')).toBeTruthy();
    // The fixture's tiles were 128 / 124 / 4.
    expect(screen.queryByText('128')).toBeNull();
  });

  it('shows the designed error state when the build has no backend', async () => {
    // Owner decision 2026-08-17: an unconfigured build no longer invents tiles.
    // Home owns its own error state (sHomeErr), so that is what it shows.
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText("Can't reach Autom8x")).toBeTruthy();
    expect(platformOperation).not.toHaveBeenCalled();
  });

  it('uses its OWN error state on failure, not the shared one', async () => {
    platformOperation.mockRejectedValue(new Error('boom'));
    await renderWithProviders(<HomeScreen />, signedIn);
    // Home keeps sHomeErr rather than the shared ScreenError — the design gives
    // it bespoke states and the frozen-UI rule says to use them.
    expect(await screen.findByText("Can't reach Autom8x")).toBeTruthy();
    expect(screen.queryByTestId('screen-error')).toBeNull();
  });
});
