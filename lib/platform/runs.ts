import type { components } from '@/lib/generated/platform-contracts/automations';
import { platformJson } from './client';

/**
 * Run reads, including the aggregates Round 6.6 published.
 *
 * Before it, a runs list could be paged but never counted, so the design's stat
 * tiles ("128 runs today · 124 · 4") had no source at any shape. `run-stats` is
 * that source.
 */

export type RunStats = components['schemas']['RunStats'];
export type RunStatusCounts = components['schemas']['RunStatusCounts'];
export type Run = components['schemas']['Run'];

/**
 * Run counts for a workspace, optionally windowed.
 *
 * Three things about this endpoint are easy to get wrong, so they are stated here
 * rather than discovered later:
 *
 * - **The body is unwrapped.** It is `RunStats` itself — `{since?, workspace,
 *   subscriptions}` — not `{runStats: …}` like the list reads.
 * - **`since` is optional, and omitting it means all time.** A malformed value is
 *   a 400 rather than a silent widening, and so is an empty `?since=`, which is
 *   why this builds the query only when there is a value to put in it.
 * - **Absent is not zero.** `subscriptions` carries only those with at least one
 *   run in the window, so a subscription missing from the array has no runs in
 *   that window — it does not fail to exist.
 */
export function readRunStats(workspaceId: string, since?: Date): Promise<RunStats> {
  const query = since ? `?since=${encodeURIComponent(since.toISOString())}` : '';
  return platformJson<RunStats>(`/v1/workspaces/${workspaceId}/run-stats${query}`);
}

/** Runs for a workspace, newest first, optionally one subscription's. */
export function readRuns(workspaceId: string, subscriptionId?: string): Promise<{ runs: Run[] }> {
  const query = subscriptionId ? `?subscriptionId=${encodeURIComponent(subscriptionId)}` : '';
  return platformJson<{ runs: Run[] }>(`/v1/workspaces/${workspaceId}/runs${query}`);
}

/**
 * Midnight this morning in the device's own zone.
 *
 * The design's tiles say "Runs today", and today is a local idea — a person in
 * Auckland and one in Los Angeles do not share a midnight. Computed here rather
 * than at the call site so both Home and any later caller agree, and so the one
 * place that converts a local boundary to the UTC instant the API wants is named.
 */
export function localMidnight(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

export type Approval = components['schemas']['Approval'];
export type Subscription = components['schemas']['Subscription'];

/**
 * Approvals awaiting a decision.
 *
 * `status` is passed EXPLICITLY and that is load-bearing. The parameter is
 * `required: false`, and omitting it returns approvals of **every** status —
 * approved, rejected and expired included — despite the operation summary
 * reading "awaiting a decision". A caller that wants the inbox must say so.
 */
export function readApprovals(
  workspaceId: string,
  status: Approval['status'] = 'pending',
): Promise<{ approvals: Approval[] }> {
  return platformJson<{ approvals: Approval[] }>(
    `/v1/workspaces/${workspaceId}/approvals?status=${encodeURIComponent(status)}`,
  );
}

/** The workspace's subscriptions — the middle hop of the approval-title join. */
export function readSubscriptions(workspaceId: string): Promise<{ subscriptions: Subscription[] }> {
  return platformJson<{ subscriptions: Subscription[] }>(
    `/v1/workspaces/${workspaceId}/subscriptions`,
  );
}
