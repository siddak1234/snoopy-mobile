import type { Approval, Run, RunStats, RunStatusCounts, Subscription } from '@/lib/platform/runs';

/**
 * What a team scope selects (BUILD-PLAN 24.9.2; teams since 24.11.7 — a team is a
 * project in the platform's contract).
 *
 * A subscription carries its `projectId` (backend 18.6.2): `null` is
 * workspace-wide. A chosen team shows the flows added to it — only those, so a
 * team reads as its own list; "All teams" shows every flow with its scope
 * label. Runs and approvals have no team of their own and follow
 * their subscription; a run whose subscription is unknown (archived and gone
 * from the list, or beyond the page) is kept, because hiding it would make a
 * run disappear rather than mis-file it.
 */
export function inScope(subscription: { projectId: string | null }, projectId: string | null): boolean {
  return projectId === null || subscription.projectId === projectId;
}

export function scopeSubscriptions<T extends { projectId: string | null }>(
  subscriptions: readonly T[],
  projectId: string | null,
): T[] {
  return subscriptions.filter((subscription) => inScope(subscription, projectId));
}

/** The subscription ids a project scope selects, from the full list. */
export function scopedIds(subscriptions: readonly Subscription[], projectId: string | null): Set<string> | null {
  if (projectId === null) return null;
  return new Set(scopeSubscriptions(subscriptions, projectId).map((subscription) => subscription.id));
}

export function scopeRuns<T extends Pick<Run, 'subscriptionId'>>(
  runs: readonly T[],
  subscriptions: readonly Subscription[],
  projectId: string | null,
): T[] {
  const ids = scopedIds(subscriptions, projectId);
  if (ids === null) return [...runs];
  const known = new Set(subscriptions.map((subscription) => subscription.id));
  return runs.filter((run) => ids.has(run.subscriptionId) || !known.has(run.subscriptionId));
}

export function scopeApprovals<T extends Pick<Approval, 'subscriptionId'>>(
  approvals: readonly T[],
  subscriptions: readonly Subscription[],
  projectId: string | null,
): T[] {
  return scopeRuns(approvals, subscriptions, projectId);
}

const EMPTY_COUNTS: RunStatusCounts = {
  total: 0,
  pending: 0,
  running: 0,
  held: 0,
  succeeded: 0,
  failed: 0,
  cancelled: 0,
};

/**
 * The counts Home's tiles draw for the scope: the workspace's own when every
 * project is shown, else the sum of the chosen project's subscriptions — the
 * endpoint answers per subscription, and a subscription absent from it has no
 * runs in the window.
 */
export function scopeStats(stats: RunStats, subscriptions: readonly Subscription[], projectId: string | null): RunStatusCounts {
  const ids = scopedIds(subscriptions, projectId);
  if (ids === null) return stats.workspace;
  return stats.subscriptions
    .filter((counts) => ids.has(counts.subscriptionId))
    .reduce<RunStatusCounts>(
      (sum, counts) => ({
        total: sum.total + counts.total,
        pending: sum.pending + counts.pending,
        running: sum.running + counts.running,
        held: sum.held + counts.held,
        succeeded: sum.succeeded + counts.succeeded,
        failed: sum.failed + counts.failed,
        cancelled: sum.cancelled + counts.cancelled,
      }),
      EMPTY_COUNTS,
    );
}
