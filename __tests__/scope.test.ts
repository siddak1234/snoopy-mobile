import type { RunStats, Subscription } from '@/lib/platform/runs';
import { inScope, scopeApprovals, scopeRuns, scopeStats, scopeSubscriptions } from '@/lib/view/scope';

/**
 * What a project scope selects (BUILD-PLAN 24.9.2): flows by their own
 * project, runs and approvals by their flow's, counts summed per flow.
 */
const subscription = (id: string, projectId: string | null): Subscription =>
  ({
    id,
    workspaceId: 'ws-1',
    templateId: 'tpl.0',
    templateVersion: 1,
    status: 'live',
    config: {},
    unmetConnections: [],
    projectId,
    createdByUserId: 'user-1',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  });

const subscriptions = [subscription('sub-ws', null), subscription('sub-a', 'project-a'), subscription('sub-b', 'project-b')];

describe('a project scope', () => {
  it('shows every flow for all projects, and only a project\'s own for that project', () => {
    expect(scopeSubscriptions(subscriptions, null).map((s) => s.id)).toEqual(['sub-ws', 'sub-a', 'sub-b']);
    expect(scopeSubscriptions(subscriptions, 'project-a').map((s) => s.id)).toEqual(['sub-a']);
    expect(inScope({ projectId: null }, 'project-a')).toBe(false);
    expect(inScope({ projectId: 'project-a' }, 'project-a')).toBe(true);
  });

  it('selects runs and approvals by their flow, and keeps one whose flow is unknown', () => {
    const runs = [
      { id: 'r1', subscriptionId: 'sub-a' },
      { id: 'r2', subscriptionId: 'sub-b' },
      { id: 'r3', subscriptionId: 'sub-gone' },
    ];
    expect(scopeRuns(runs, subscriptions, null).map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(scopeRuns(runs, subscriptions, 'project-a').map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(scopeApprovals([{ id: 'ap', subscriptionId: 'sub-b' }], subscriptions, 'project-a')).toEqual([]);
  });

  it('sums the chosen project\'s counts, and uses the workspace\'s for all projects', () => {
    const stats: RunStats = {
      workspace: { total: 9, pending: 0, running: 0, held: 1, succeeded: 7, failed: 1, cancelled: 0 },
      subscriptions: [
        { subscriptionId: 'sub-a', total: 3, pending: 0, running: 0, held: 1, succeeded: 2, failed: 0, cancelled: 0 },
        { subscriptionId: 'sub-b', total: 6, pending: 0, running: 0, held: 0, succeeded: 5, failed: 1, cancelled: 0 },
      ],
    };
    expect(scopeStats(stats, subscriptions, null)).toEqual(stats.workspace);
    expect(scopeStats(stats, subscriptions, 'project-a')).toEqual({
      total: 3,
      pending: 0,
      running: 0,
      held: 1,
      succeeded: 2,
      failed: 0,
      cancelled: 0,
    });
    // A project whose flows have not run in the window counts zero, not the workspace.
    expect(scopeStats(stats, subscriptions, 'project-none').total).toBe(0);
  });
});
