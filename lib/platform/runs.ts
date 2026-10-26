import type { components } from '@/lib/generated/platform-contracts/automations';
import { platformOperation } from './client';
import { FileNotSavedError, PlatformBusyError, PlatformError, SignedLinkUnusableError } from './problem';
import { invalidateShared, shared } from './snapshot';

/**
 * Run reads, including the aggregates Round 6.6 published.
 *
 * Before it, a runs list could be paged but never counted, so the design's stat
 * tiles ("128 runs today · 124 · 4") had no source at any shape. `run-stats` is
 * that source.
 */

export type RunStats = components['schemas']['RunStats'];
export type RunStatusCounts = components['schemas']['RunStatusCounts'];
export type RunSubscriptionCounts = components['schemas']['RunSubscriptionCounts'];
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
  const sinceValue = since?.toISOString();
  const query = sinceValue ? `?since=${encodeURIComponent(sinceValue)}` : '';
  return shared(workspaceId, sinceValue ? `run-stats:${sinceValue}` : 'run-stats', 'volatile', () =>
    platformOperation(`/v1/workspaces/${workspaceId}/run-stats${query}`, ({ automations }, signal) =>
      automations.GET('/v1/workspaces/{workspaceId}/run-stats', {
        params: { path: { workspaceId }, query: sinceValue ? { since: sinceValue } : {} },
        signal,
      }),
    ),
  );
}

/**
 * The run counts as the platform holds them now, never an answer the snapshot
 * kept: a flow page's DASHBOARD is live (Build 21, spec A6; the owner's build
 * 20 item 10: "Dashboard items should be updated too"; the session's S30) —
 * read on every return to the page and every 5 s while a run of the flow is
 * pending or running. The answer becomes the snapshot's, so Flows and Home
 * then read what this one saw.
 */
export function readRunStatsNow(workspaceId: string): Promise<RunStats> {
  invalidateShared(workspaceId, ['run-stats']);
  return readRunStats(workspaceId);
}

/** Runs for a workspace, newest first, optionally one subscription's. */
export function readRuns(workspaceId: string, subscriptionId?: string): Promise<{ runs: Run[] }> {
  const query = subscriptionId ? `?subscriptionId=${encodeURIComponent(subscriptionId)}` : '';
  return shared(workspaceId, subscriptionId ? `runs:${subscriptionId}` : 'runs', 'volatile', () =>
    platformOperation(`/v1/workspaces/${workspaceId}/runs${query}`, ({ automations }, signal) =>
      automations.GET('/v1/workspaces/{workspaceId}/runs', {
        params: {
          path: { workspaceId },
          query: subscriptionId ? { subscriptionId } : {},
        },
        signal,
      }),
    ),
  );
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

/** Activity's time range (the owner's build 13 decision 4): every run, or Today, Week or Month. */
export type RunRange = 'all' | 'today' | 'week' | 'month';

/**
 * Where a time range begins, or `null` for all time.
 *
 * Today is the tiles' today — `localMidnight()`, so a Home tile's number is the
 * rows it opens. Week and Month are the last 7 and the last 30 days, back from
 * this moment on the local calendar: the same clock time that many days ago,
 * whatever a daylight-saving change between them did. The runs list takes no
 * window (`listRuns` has `subscriptionId` only), so Activity selects from the
 * runs it read with this.
 */
export function rangeStart(range: RunRange, now: Date = new Date()): Date | null {
  if (range === 'all') return null;
  if (range === 'today') return localMidnight(now);
  const days = range === 'week' ? 7 : 30;
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - days,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  );
}

export type Approval = components['schemas']['Approval'];
export type Subscription = components['schemas']['Subscription'];
/** The plan's flow ceiling beside the workspace's count (decision 7a3); absent when the platform could not say. */
export type FlowAllowance = components['schemas']['FlowAllowance'];

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
  return shared(workspaceId, `approvals:${status}`, 'volatile', () =>
    platformOperation(
      `/v1/workspaces/${workspaceId}/approvals?status=${encodeURIComponent(status)}`,
      ({ automations }, signal) =>
        automations.GET('/v1/workspaces/{workspaceId}/approvals', {
          params: { path: { workspaceId }, query: { status } },
          signal,
        }),
    ),
  );
}

/**
 * Every approval, whatever its status. A held run's row needs this to say how
 * it was decided: a run stays `held` after its approval, because the approval
 * starts a NEW run (FR-15, FR-17), so the status alone reads as "still waiting"
 * weeks after someone decided (24.7.3 attempt 2, feedback #5 and #7).
 */
export function readAllApprovals(workspaceId: string): Promise<{ approvals: Approval[] }> {
  return shared(workspaceId, 'approvals', 'volatile', () =>
    platformOperation(`/v1/workspaces/${workspaceId}/approvals`, ({ automations }, signal) =>
      automations.GET('/v1/workspaces/{workspaceId}/approvals', {
        params: { path: { workspaceId } },
        signal,
      }),
    ),
  );
}

/**
 * Every approval as the platform holds it now, never an answer the snapshot
 * kept: a run's page whose run is held with no approval form in its blocks
 * yet reads them so, every 2 s and at most ten times, with the run, until the
 * form comes (round 25, the review's R5c 1; backend ADR-0048;
 * `rereadForApproval`). The read that saw the run turn
 * held took its approvals from the 15 s snapshot, from before the approval
 * was asked. The answer becomes the snapshot's, so Approvals and Activity then
 * read what this one saw.
 */
export function readAllApprovalsNow(workspaceId: string): Promise<{ approvals: Approval[] }> {
  invalidateShared(workspaceId, ['approvals']);
  return readAllApprovals(workspaceId);
}

/** The workspace's subscriptions — the middle hop of the approval-title join. */
export function readSubscriptions(
  workspaceId: string,
): Promise<{ subscriptions: Subscription[]; flowAllowance?: FlowAllowance }> {
  return shared(workspaceId, 'subscriptions', 'volatile', () =>
    platformOperation(`/v1/workspaces/${workspaceId}/subscriptions`, ({ automations }, signal) =>
      automations.GET('/v1/workspaces/{workspaceId}/subscriptions', {
        params: { path: { workspaceId } },
        signal,
      }),
    ),
  );
}

/**
 * The workspace's subscriptions as the platform holds them now, never an answer
 * the snapshot kept: for a check that must not act on a list up to 15 s old —
 * Activate's, that the workspace does not hold the flow already (the owner's
 * build 12 item 9; the website's `subscribeToAutomation` reads the list at the
 * moment of the add). The answer becomes the snapshot's, so every screen then
 * reads what this one saw; the archived list goes with it, as it does with
 * every re-read of the list.
 */
export function readSubscriptionsNow(
  workspaceId: string,
): Promise<{ subscriptions: Subscription[]; flowAllowance?: FlowAllowance }> {
  invalidateShared(workspaceId, ['subscriptions']);
  return readSubscriptions(workspaceId);
}

/**
 * The removed (archived) flows (BUILD-PLAN 24.11.8, backend §12.1 #203), asked
 * for by name: the default list never holds them. A platform from before the
 * SEVENTEENTH promotion ignores the filter and answers the live list, so only
 * the rows that ARE archived are kept — a live flow is never shown as removed.
 * Kept under the subscriptions key, so whatever re-reads the list (adding,
 * removing, pausing a flow) re-reads this too.
 */
export function readRemovedSubscriptions(workspaceId: string): Promise<{ subscriptions: Subscription[] }> {
  return shared(workspaceId, 'subscriptions:archived', 'volatile', async () => {
    const answer = await platformOperation(
      `/v1/workspaces/${workspaceId}/subscriptions?status=archived`,
      ({ automations }, signal) =>
        automations.GET('/v1/workspaces/{workspaceId}/subscriptions', {
          params: { path: { workspaceId }, query: { status: 'archived' } },
          signal,
        }),
    );
    return { subscriptions: answer.subscriptions.filter((subscription) => subscription.status === 'archived') };
  });
}

/**
 * The removed flows where a screen only notes them (a count, a row's word):
 * not reachable is none, rather than the screen failing on its secondary part.
 */
export function readRemovedSubscriptionsOrNone(workspaceId: string): Promise<{ subscriptions: Subscription[] }> {
  return readRemovedSubscriptions(workspaceId).catch(() => ({ subscriptions: [] }));
}

export type RunDetail = components['schemas']['RunDetail'];

/**
 * One run, with its timeline, as its page body (backend ADR-0048: `shape=blocks`).
 *
 * The response is `{run, steps, events}` plus `blocks` — the "View {file}" rows,
 * the result line and the approval to decide, then what the run read, in its
 * flow's `pages.run` order — and `packageAvailable`; with the parameter it drops
 * `details`, `documents` and `sections`. `steps` is the human timeline Run
 * details renders; `events` is the platform's own record of state transitions
 * and is not what the design draws. Raw `output` is published at no shape
 * (§12.1 #67). A build before this one never sends the parameter and keeps the
 * legacy answer.
 */
export function readRun(workspaceId: string, runId: string): Promise<RunDetail> {
  return platformOperation(`/v1/workspaces/${workspaceId}/runs/${runId}`, ({ automations }, signal) =>
    automations.GET('/v1/workspaces/{workspaceId}/runs/{runId}', {
      params: { path: { workspaceId, runId }, query: { shape: 'blocks' } },
      signal,
    }),
  );
}

export type RunDocument = components['schemas']['RunDocument'];
export type RunPackageFile = components['schemas']['RunPackageFile'];
export type RunPackageFormat = RunPackageFile['format'];

/**
 * The A8X run package as a file (round 24 P12; the owner's build 23 F16; backend
 * ADR-0045): the PDF (cover, summary, one page per invoice, then the original
 * pages) or the Excel workbook, built by the platform for the job and answered
 * as a short-lived signed link — never bytes, never through the Edge. Times
 * print in `timeZone`. ~~`readRunDocuments`, the JSON file "Download JSON"
 * shared~~ until round 24 (the endpoint stays; the app no longer reads it).
 */
export function createRunPackageFile(
  workspaceId: string,
  runId: string,
  format: RunPackageFormat,
  idempotencyKey: string,
  timeZone?: string,
): Promise<RunPackageFile> {
  return platformOperation(`/v1/workspaces/${workspaceId}/runs/${runId}/package`, ({ automations }, signal) =>
    automations.POST('/v1/workspaces/{workspaceId}/runs/{runId}/package', {
      params: { path: { workspaceId, runId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: timeZone ? { format, timeZone } : { format },
      signal,
    }),
  );
}

/**
 * The largest package file the app takes: the platform's own bound, 25 MiB
 * (26,214,400 bytes) — the file store's ceiling, past which
 * `createRunPackageFile` answers 422 `package_too_large` — so no file the
 * platform built is refused; the website's `RUN_PACKAGE_MAXIMUM_BYTES`.
 */
export const RUN_PACKAGE_MAXIMUM_BYTES = 25 * 1024 * 1024;

/**
 * A package file answered in another format than the one asked for, or past
 * `RUN_PACKAGE_MAXIMUM_BYTES`: refused before anything is downloaded, as the
 * website's package route refuses it.
 */
export class RunPackageFileRefusedError extends Error {
  constructor() {
    super('The package file is not the one asked for.');
    this.name = 'RunPackageFileRefusedError';
  }
}

/** The longest `retry-after` a package request waits out before asking once more. */
const PACKAGE_LONGEST_WAIT_SECONDS = 10;

/**
 * How long to wait before asking once more for a package the platform is too
 * busy to build (503 `package_busy`): its `retry-after` (2 s when it names
 * none), or `null` — not waited out, said at once — when that is over 10 s.
 * The website's `packageRetryWaitMs` (`snoopy/lib/run-documents.ts`), rule
 * for rule. ~~Only a 503 naming its wait, capped at 15 s~~ until the round's
 * review.
 */
export function packageRetryWaitMs(retryAfterSeconds: number | undefined): number | null {
  if (retryAfterSeconds === undefined) return 2_000;
  return retryAfterSeconds <= PACKAGE_LONGEST_WAIT_SECONDS ? retryAfterSeconds * 1_000 : null;
}

/**
 * `createRunPackageFile` as both screens ask it: a 503 is asked once more,
 * with the same key, after `packageRetryWaitMs` (a `PlatformBusyError` names
 * its wait; a plain 503 names none); busy again, a wait over 10 s, or any other
 * refusal is thrown to the screen. The file answered must be the format asked
 * for and within `RUN_PACKAGE_MAXIMUM_BYTES`, else `RunPackageFileRefusedError`.
 * `sleep` is for tests.
 */
export async function requestRunPackageFile(
  workspaceId: string,
  runId: string,
  format: RunPackageFormat,
  idempotencyKey: string,
  timeZone: string | undefined,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<RunPackageFile> {
  const ask = () => createRunPackageFile(workspaceId, runId, format, idempotencyKey, timeZone);
  let file: RunPackageFile;
  try {
    file = await ask();
  } catch (error) {
    const wait =
      error instanceof PlatformError && error.status === 503
        ? packageRetryWaitMs(error instanceof PlatformBusyError ? error.retryAfterSeconds : undefined)
        : null;
    if (wait === null) throw error;
    await sleep(wait);
    file = await ask();
  }
  if (file.format !== format || file.sizeBytes > RUN_PACKAGE_MAXIMUM_BYTES) throw new RunPackageFileRefusedError();
  return file;
}

/**
 * Whether the package page says "Could not open the package. Try again." —
 * still busy (any 503), the file refused, a link the app will not follow, or a
 * file not saved: the website's package route says those words for each
 * (`snoopy/app/account/runs/[runId]/package/file/route.ts`).
 */
export function packageNotOpened(error: unknown): boolean {
  return (
    error instanceof RunPackageFileRefusedError ||
    error instanceof SignedLinkUnusableError ||
    error instanceof FileNotSavedError ||
    (error instanceof PlatformError && error.status === 503)
  );
}
