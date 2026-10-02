import { createRun, decideApproval, updateSubscription } from '@/lib/platform/automations';
import { readCatalog } from '@/lib/platform/catalog';
import { readAllApprovals, readRunStats, readRuns, readSubscriptions } from '@/lib/platform/runs';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key-1'),
}));

const { platformOperation } = jest.requireMock('@/lib/platform/client');
const WS = '00000000-0000-4000-8000-000000000001';

/**
 * An action drops what it changed from the shared snapshot, and only that
 * (BUILD-PLAN 24.9.1): the next read of a changed resource is a real request;
 * an unchanged one is still answered from the snapshot.
 */
describe('what an action invalidates', () => {
  const calls = (): string[] => platformOperation.mock.calls.map(([path]: [string]) => path);

  beforeEach(() => {
    platformOperation.mockReset();
    platformOperation.mockImplementation(async (path: string) => {
      if (path.includes('/subscriptions/')) return { subscription: { id: 'sub-1' } };
      if (path.includes('/subscriptions')) return { subscriptions: [] };
      if (path.includes('/automations')) return { automations: [], categories: ['All'] };
      if (path.includes('/run-stats')) return { workspace: {}, subscriptions: [] };
      if (path.includes('/runs')) return { runs: [], run: { id: 'run-1' } };
      if (path.includes('/approvals/')) return { approval: { id: 'ap-1' } };
      if (path.includes('/approvals')) return { approvals: [] };
      return {};
    });
  });

  it('a subscription change drops the subscriptions and the catalog, not the runs', async () => {
    await Promise.all([readSubscriptions(WS), readCatalog(WS), readRuns(WS)]);
    expect(calls()).toHaveLength(3);
    await updateSubscription(WS, 'sub-1', { status: 'paused' }, 'key-1');
    await Promise.all([readSubscriptions(WS), readCatalog(WS), readRuns(WS)]);
    const after = calls();
    expect(after.filter((p) => p.endsWith('/subscriptions'))).toHaveLength(2);
    expect(after.filter((p) => p.endsWith('/automations'))).toHaveLength(2);
    expect(after.filter((p) => p.endsWith('/runs'))).toHaveLength(1);
  });

  it('a run started or a decision made drops the runs, their counts and (for a decision) the approvals', async () => {
    await Promise.all([readRuns(WS), readRunStats(WS), readAllApprovals(WS), readSubscriptions(WS)]);
    await createRun(WS, 'sub-1', 'key-1');
    await Promise.all([readRuns(WS), readRunStats(WS), readAllApprovals(WS), readSubscriptions(WS)]);
    let paths = calls();
    expect(paths.filter((p) => p.endsWith('/runs'))).toHaveLength(2 + 1); // two reads and the POST
    expect(paths.filter((p) => p.endsWith('/run-stats'))).toHaveLength(2);
    expect(paths.filter((p) => p.endsWith('/approvals'))).toHaveLength(1);
    expect(paths.filter((p) => p.endsWith('/subscriptions'))).toHaveLength(1);
    await decideApproval(WS, 'ap-1', 'approved', 'key-1');
    await Promise.all([readAllApprovals(WS), readRuns(WS)]);
    paths = calls();
    expect(paths.filter((p) => p.endsWith('/approvals'))).toHaveLength(2);
    expect(paths.filter((p) => p.endsWith('/runs'))).toHaveLength(3 + 1);
  });
});
