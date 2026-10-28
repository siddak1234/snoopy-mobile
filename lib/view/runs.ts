import type { Icon } from 'phosphor-react-native';
import {
  CheckCircle,
  CircleDashed,
  CircleNotch,
  HandPalm,
  MinusCircle,
  WarningCircle,
  XCircle,
} from 'phosphor-react-native';

import {
  EMAIL_OWED,
  NONE_LABEL,
  RUN_ID_LABEL,
  RUN_WORKING,
  STEP_DONE,
  STEP_FAILED,
  STEP_SKIPPED,
  STEP_STOPPED,
  STEP_DENIED,
  STEP_WAITING,
  emailSentLine,
  reviewTally,
  stepHeld,
} from '@/lib/content/screen-states';
import {
  offeredDecisions,
  reviewAnswers,
  type AnsweredDecision,
  type PendingApproval,
} from '@/lib/platform/pending-contract';

import type { CatalogEntry } from '@/lib/platform/catalog';
import type { InboxNotification } from '@/lib/platform/notifications';
import type { Approval, Run, RunDetail } from '@/lib/platform/runs';
import { EMPTY, dateTime, expiresIn, relativeTime, relativeTimeAgo } from './format';
import { chosenProvider, stepTitle, type StepField, type StepHeading } from './pipeline';
import { decides, type WorkspaceRole } from './roles';
import { runOriginLabel, statusLabel, statusTone, type StatusPillLabel, type StatusTone } from './status';

/**
 * Runs, mapped to the rows the design draws.
 *
 * Two things the platform deliberately does not send, and what is rendered
 * instead — both are recorded refusals, not gaps to fill locally:
 *
 * - **A display name.** `Run` carries `templateId` and no name; the runs list
 *   says so itself and calls the catalog join intended client work. `nameFor`
 *   is that join.
 * - **A structured result.** §12.1 #67 refuses run output. A succeeded run may
 *   carry `resultSummary` (≤200) and a failed one `failureReason` (≤500) — note
 *   the two bounds differ, which the register misstates as both 200. Neither is
 *   guaranteed, so the row falls back to the automation's own name rather than
 *   rendering an empty second line.
 */

export type RunRowView = {
  runId: string;
  name: string;
  meta: string;
  time: string;
  /**
   * When the run was made, in full, and the run itself: `{when} · Run {id}`,
   * the full id (Build 21, spec A8; the owner's D4: "run number is the run ID",
   * and AM2: "runs should have the full ID"), which Activity draws under the row's own line (Gate 24's
   * parity pass, G17). ~~`· v{templateVersion}`~~ until Build 21.
   */
  stamp: string;
  tone: StatusTone;
  status: StatusPillLabel;
};

/** Catalog entries by templateId — the join every run row needs. */
export function catalogIndex(entries: CatalogEntry[]): Map<string, CatalogEntry> {
  return new Map(entries.map((e) => [e.templateId, e]));
}

/** The automation's name for a run, or its templateId when the catalog lacks it. */
export function nameFor(run: Run, catalog: Map<string, CatalogEntry>): string {
  return catalog.get(run.templateId)?.name ?? run.templateId;
}

/**
 * The second line of a run row.
 *
 * Only one of the two fields is ever present, and only on its own terminal
 * status: `resultSummary` on `succeeded`, `failureReason` on `failed`. Both are
 * optional even then — an automation that supplied no summary has none — so this
 * degrades to the run's status word rather than leaving the line blank.
 */
export function metaFor(run: Run, approvals?: readonly Approval[]): string {
  // A held job says how it was decided. One row per job since round 24 (P9;
  // the owner's build 23 F12: "Why do i have 2 run ids for one job"): the
  // platform lists a job by its first run's id at its newest status, so no row
  // is a continuation (~~"After approval · …"~~ until round 24).
  if (run.status === 'held' && approvals) return heldDecisionLine(run, approvals);
  if (run.status === 'succeeded' && run.resultSummary) return run.resultSummary;
  if (run.status === 'failed' && run.failureReason) return run.failureReason;
  return statusLabel(run.status);
}

/** How a held run was decided, from the approvals read beside it. */
export type HeldDecision = 'pending' | 'approved' | 'rejected' | 'closed' | 'unknown';

/**
 * The job's approval: the newest the platform lists for this run's id (round 24
 * P6, P9 — a job is its first run, so an approval asked again after another
 * hold names the same id; the newest decides what the page shows), or none.
 */
export function jobApproval(run: Pick<Run, 'id'>, approvals: readonly Approval[]): Approval | undefined {
  let newest: Approval | undefined;
  for (const approval of approvals) {
    if (approval.runId !== run.id) continue;
    if (!newest || Date.parse(approval.createdAt) > Date.parse(newest.createdAt)) newest = approval;
  }
  return newest;
}

/**
 * A saved review's words (Round 21's platform round, F2): "{a} accepted ·
 * {d} denied", from the answers just saved on this page, else the job's
 * approval's kept answers; null when nothing was reviewed.
 */
export function answersTally(answers: readonly AnsweredDecision[]): string | null {
  if (answers.length === 0) return null;
  const accepted = answers.filter((answer) => answer.decision === 'accepted').length;
  return reviewTally(accepted, answers.length - accepted);
}

export function jobReviewTally(
  run: Pick<Run, 'id'>,
  approvals: readonly Approval[],
  saved: readonly AnsweredDecision[] | null = null,
): string | null {
  if (saved && saved.length > 0) return answersTally(saved);
  return answersTally(reviewAnswers(jobApproval(run, approvals) as PendingApproval | undefined));
}

export function heldDecision(run: Run, approvals: readonly Approval[]): HeldDecision | null {
  if (run.status !== 'held') return null;
  const approval = jobApproval(run, approvals);
  if (!approval) return 'unknown';
  if (approval.status === 'pending') return 'pending';
  if (approval.status === 'approved') return 'approved';
  if (approval.status === 'rejected') return 'rejected';
  return 'closed';
}

const HELD_DECISION_LINE: Record<HeldDecision, string> = {
  pending: 'Waiting for approval',
  // The job goes on under the same id (round 24 P9; ~~"Approved — continued in a new run"~~).
  approved: 'Approved',
  // S6: the owner says deny (round 24 P6); ~~Rejected~~.
  rejected: STEP_DENIED,
  closed: 'No longer awaiting approval',
  unknown: 'Held for review',
};

export function heldDecisionLine(run: Run, approvals: readonly Approval[]): string {
  return HELD_DECISION_LINE[heldDecision(run, approvals) ?? 'unknown'];
}

/** Whether a run still needs someone's decision: held, and nobody has decided. */
export function needsReview(run: Run, approvals: readonly Approval[]): boolean {
  const decision = heldDecision(run, approvals);
  return decision === 'pending' || decision === 'unknown';
}

export function toRunRow(
  run: Run,
  catalog: Map<string, CatalogEntry>,
  now: number = Date.now(),
  approvals?: readonly Approval[],
): RunRowView {
  return {
    runId: run.id,
    name: nameFor(run, catalog),
    meta: metaFor(run, approvals),
    time: relativeTime(run.createdAt, now),
    stamp: `${dateTime(run.createdAt)} · ${runLabel(run)}`,
    tone: statusTone(run.status),
    status: statusLabel(run.status) as StatusPillLabel,
  };
}

export function toRunRows(
  runs: Run[],
  catalog: Map<string, CatalogEntry>,
  now: number = Date.now(),
  approvals?: readonly Approval[],
): RunRowView[] {
  return runs.map((run) => toRunRow(run, catalog, now, approvals));
}

/** The glyph the activity list draws beside a run, by outcome. */
export function runIcon(status: string | null | undefined): Icon {
  switch (statusTone(status)) {
    case 'ok':
      return CheckCircle;
    case 'err':
      return XCircle;
    case 'warn':
      return HandPalm;
    default:
      return CircleDashed;
  }
}

/**
 * Activity groups runs by day, and the design labels only the first two.
 *
 * "Today" and "Yesterday" are local days — the same reason `localMidnight`
 * exists — so this compares local date components rather than UTC instants.
 * Anything older falls outside the two sections the design draws, which is why
 * the runs list's newest-first order is enough and no paging is needed here.
 */
export function isSameLocalDay(iso: string | null | undefined, day: Date): boolean {
  if (!iso) return false;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  return (
    at.getFullYear() === day.getFullYear() &&
    at.getMonth() === day.getMonth() &&
    at.getDate() === day.getDate()
  );
}

export function splitByDay(
  runs: Run[],
  now: Date = new Date(),
): { today: Run[]; yesterday: Run[]; earlier: Run[] } {
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const today = runs.filter((r) => isSameLocalDay(r.createdAt, now));
  const yesterday = runs.filter((r) => isSameLocalDay(r.createdAt, yesterdayDate));
  // Everything older, in the platform's order. The website's Activity is
  // "every run in this workspace"; the design's two day sections are a grouping
  // of it, not a window onto it — a workspace whose runs are all older than two
  // days still has activity (24.7.3 attempt 1, DESIGN-GAPS.archive.md).
  const earlier = runs.filter((r) => !today.includes(r) && !yesterday.includes(r));
  return { today, yesterday, earlier };
}

/**
 * A run's verdict as its page shows it (Round 21, backend ADR-0048 amendment
 * 1, point 13; the owner's Q5 and build 30 note F1): the positive verdict in
 * the success tone, the negative in the error tone, each named by its flow's
 * own words (`Subscription.items.verdictWords`, plan Open 5: "Advance",
 * "Decline"). No verdict, or no words to name it: null — the score is plain
 * and there is no chip, so the colour is never the only sign (WCAG 1.4.1).
 */
export function runVerdict(
  run: Pick<Run, 'verdict'>,
  verdictWords: { positive: string; negative: string } | undefined,
): { tone: 'success' | 'error'; word: string } | null {
  if (!verdictWords) return null;
  if (run.verdict === 'positive') return { tone: 'success', word: verdictWords.positive };
  if (run.verdict === 'negative') return { tone: 'error', word: verdictWords.negative };
  return null;
}

/**
 * A run's name: "Run" and its FULL id — the run page's title, Activity's and
 * Home's rows, an approval's link (Build 21, spec A8). The owner's D4 of
 * 2026-10-15: "run number is the run ID. each id is unique, no duplicates
 * amongst flows … like a case number or uuid", and his AM2 (~22:15Z): "runs
 * should have the full ID" — ~~the first eight characters~~ of the spec's S15.
 * The platform's §12.1 #69 as amended names a run by `id`. ~~the request id's
 * first eight~~ until Build 21 — which titled run 793eef82 "Run 1e3231c6" while
 * its email linked /runs/793eef82. The request id traces a request and is
 * never shown.
 */
export function runLabel(run: Pick<Run, 'id'>): string {
  return run.id ? `Run ${run.id}` : EMPTY;
}

/**
 * An approval's headline — §12.1 #70's three-hop join, spelled out.
 *
 * The register implies a one-liner; it is not. `Approval` carries no
 * `templateId`, so the automation and the step it paused at are reached like
 * this:
 *
 *   approval.subscriptionId → subscriptions → templateId
 *                           → that catalog entry → pipeline
 *                           → find(step => step.id === approval.stepId).title
 *
 * Each hop can miss — a subscription removed, a catalog entry withdrawn, a
 * manifest version whose pipeline no longer declares that step — and a missing
 * hop must degrade rather than blank the row, because `reason` (the "why" line)
 * is always present and is the part a person actually decides on.
 */
export function approvalTitle(
  approval: { subscriptionId: string; stepId: string },
  subscriptions: Map<string, { templateId: string }>,
  catalog: Map<string, CatalogEntry>,
): string {
  const templateId = subscriptions.get(approval.subscriptionId)?.templateId;
  if (!templateId) return EMPTY;
  const entry = catalog.get(templateId);
  if (!entry) return templateId;
  const step = entry.pipeline?.find((s) => s.id === approval.stepId);
  // The automation's name alone is better than nothing when the step is gone;
  // it still tells the approver what asked.
  return step ? `${entry.name} · ${step.title}` : entry.name;
}

/** Subscriptions by id — the middle hop, indexed. */
export function subscriptionIndex(
  subscriptions: { id: string; templateId: string }[],
): Map<string, { templateId: string }> {
  return new Map(subscriptions.map((s) => [s.id, { templateId: s.templateId }]));
}

/** The workflow kicker the approvals card shows above the title, e.g. INVOICE TRIAGE. */
export function approvalWorkflowLabel(
  approval: { subscriptionId: string },
  subscriptions: Map<string, { templateId: string }>,
  catalog: Map<string, CatalogEntry>,
): string {
  const templateId = subscriptions.get(approval.subscriptionId)?.templateId;
  const name = templateId ? catalog.get(templateId)?.name : undefined;
  return (name ?? templateId ?? EMPTY).toUpperCase();
}

/**
 * The notifications inbox, composed — because no notifications route exists.
 *
 * §12.1 #71 refuses one and names the composition: held runs awaiting a decision
 * (the approvals list) plus failed runs (the runs list, filtered). That is what
 * the product actually notifies on, and the design says so in its own empty
 * state — "We only notify you for held runs and failures."
 *
 * **What this cannot do, stated rather than hidden:** it has no memory of what
 * was already seen. `unread` is therefore not a fact the platform knows — read
 * state is an unbuilt subsystem, so every composed row reports itself unread and
 * the bell's dot reflects "there is something", not "there is something new".
 * Inventing local read state would make the app disagree with itself across
 * devices, which is worse than the honest limitation.
 */
/** An approvals-inbox card, after the three-hop join. */
export type ApprovalItem = {
  id: string;
  /** The held run, which "View the run" opens (the website's link beside the decision). */
  runId: string;
  /** That run by its full id, "Run {id}", beside its link (Build 21, spec A8; the owner's AM2). */
  run: string;
  workflow: string;
  title: string;
  why: string;
  time: string;
  /** How long it has left, as the website says it: "in 3h", "shortly". */
  expires: string;
  /** Its status, as the website's pill beside it says it; Pending, the one status this list holds. */
  status: StatusPillLabel | null;
  /** Whether this person's role is one the approval names: Approve and Deny only then. */
  canDecide: boolean;
  /** The roles it names, said to someone whose role it does not. */
  deciders: readonly WorkspaceRole[];
  /**
   * How many changes it offers for review (F2): the card then says "Review {n}
   * changes" and opens the run, in place of Approve and Deny; 0 for a plain one.
   */
  changes: number;
  /** Its saved review, "{a} accepted · {d} denied", or null. */
  tally: string | null;
};

/**
 * An approval's status, as its pill says it. Approvals asks for pending ones
 * only (`status=pending`), so Pending is the one word drawn; a status the list
 * never holds draws no pill rather than a word the pill has no treatment for.
 */
const APPROVAL_PILL: Record<Approval['status'], StatusPillLabel | null> = {
  pending: 'Pending',
  approved: null,
  rejected: null,
  expired: null,
};

/**
 * One approval as its card draws it — the website's row (`snoopy/app/account/
 * approvals/page.tsx`) in the design's card (Gate 24's parity pass, G19, G20):
 * its expiry, its status, the run it holds, and whether this person may decide
 * it, by their role in the approval's workspace (`decides`).
 */
export function toApprovalItem(
  approval: Approval,
  subscriptions: Map<string, { templateId: string }>,
  catalog: Map<string, CatalogEntry>,
  role: WorkspaceRole | null | undefined,
  now: number = Date.now(),
): ApprovalItem {
  return {
    id: approval.id,
    runId: approval.runId,
    run: runLabel({ id: approval.runId }),
    workflow: approvalWorkflowLabel(approval, subscriptions, catalog),
    title: approvalTitle(approval, subscriptions, catalog),
    why: approval.reason,
    time: relativeTimeAgo(approval.createdAt, now),
    expires: expiresIn(approval.expiresAt, now),
    status: APPROVAL_PILL[approval.status] ?? null,
    canDecide: decides(role, approval.eligibleRoles),
    deciders: approval.eligibleRoles,
    changes: offeredDecisions(approval as PendingApproval).length,
    tally: answersTally(reviewAnswers(approval as PendingApproval)),
  };
}

export type NotificationItem = {
  id: string;
  icon: Icon;
  /** Present when the row came from a run, so it can open that run. */
  runId?: string;
  tone: 'ok' | 'warn' | 'err' | 'accent';
  unread: boolean;
  title: string;
  desc: string;
  time: string;
  /**
   * What opening the row opens: a failed run's page, or Approvals for a held
   * run — where the website decides it (`/account/approvals`), and where a push
   * for one opens too (Gate 24's parity pass; Activity until then).
   */
  target: 'run' | 'approvals' | 'settings';
};

/**
 * The inbox's rows, from the platform's inbox (the owner's build 13 decision 3A):
 * which items exist, their order (newest first) and whether this person has read
 * each are the platform's; the words are drawn here from the catalog, as every
 * other run row's are. An approval names its automation and the step that held,
 * then why; a failed run names its automation, then why when it said.
 */
export function inboxRows(
  items: readonly InboxNotification[],
  catalog: Map<string, CatalogEntry>,
  now: number = Date.now(),
): Omit<NotificationItem, 'icon'>[] {
  return items.map((item) => {
    const entry = catalog.get(item.templateId);
    const name = entry?.name ?? item.templateId;
    const time = relativeTime(item.occurredAt, now);
    if (item.kind === 'approval-requested') {
      const step = item.stepId ? entry?.pipeline?.find((s) => s.id === item.stepId) : undefined;
      const what = step ? `${name} · ${step.title}` : name;
      return {
        id: item.id,
        tone: 'warn' as const,
        unread: !item.read,
        title: 'Run held for review',
        desc: item.reason ? `${what} · ${item.reason}` : what,
        time,
        target: 'approvals' as const,
        runId: item.runId,
      };
    }
    return {
      id: item.id,
      tone: 'err' as const,
      unread: !item.read,
      title: 'Run failed',
      desc: `${name} · ${item.failureReason ?? statusLabel('failed')}`,
      time,
      target: 'run' as const,
      runId: item.runId,
    };
  });
}

/**
 * A step's, or a step group's, place in the run (Build 21, spec A7; the session's
 * S14). `unknown` is a platform step this build does not know (backend
 * ADR-0041: "a client draws a value it does not know as a step with no state").
 */
export type TrackerState = 'waiting' | 'working' | 'done' | 'held' | 'failed' | 'skipped' | 'stopped' | 'unknown';

/** One row of a run's STEPS: "2 · Read", its state's icon (24) and its state in words. */
export type TrackerRow = {
  id: string;
  title: string;
  state: TrackerState;
  icon: Icon;
  tone: 'ok' | 'warn' | 'err' | 'accent' | 'muted';
  sub: string;
};

/** How long a run's page waits, while the run has not ended, before it reads the run again. */
export const RUN_REREAD_MS = 2_000;

/**
 * How many times a held run's page reads it again for its approval: 10, each
 * `RUN_REREAD_MS` after the last one settled, about 20 s. Then it stops, so a
 * job whose approval is never listed is not read for ever. The website's
 * `HELD_APPROVAL_REREADS`.
 */
export const HELD_APPROVAL_REREADS = 10;

/**
 * Whether a held run's page reads it again for its decision (round 25, the
 * review's R5c 1; backend ADR-0048): the run is held, its blocks hold no
 * approval form (`questions{approval}`) yet, and fewer than
 * `HELD_APPROVAL_REREADS` such reads were made. That is a run that turned held
 * while its page was open, or one read before its approval was asked. The form
 * appearing, or the run leaving held, ends it; so does the tenth read. Each
 * such read takes the approvals past the snapshot (`readAllApprovalsNow`), for
 * Run details' held step. The website's `rereadForApprovalForm`
 * (`snoopy/lib/run-progress.ts`), rule for rule.
 */
export function rereadForApproval(
  run: Pick<Run, 'status'>,
  blocks: readonly unknown[] | undefined,
  reads: number,
): boolean {
  return run.status === 'held' && reads < HELD_APPROVAL_REREADS && !hasApprovalForm(blocks);
}

/** Whether a page body holds the approval form (`questions{approval}`). */
export function hasApprovalForm(blocks: readonly unknown[] | undefined): boolean {
  return (blocks ?? []).some(
    (block) =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'questions' &&
      (block as { form?: { kind?: unknown } }).form?.kind === 'approval',
  );
}

/**
 * Runs live in Activity (round 24 P5; the owner's build 23 F4, F5: "Shouldnt it
 * be in activity"): the one run page is `/(tabs)/activity/run`. A push from
 * another tab says where it came from (`returnTo`), and Back — the circle or the
 * swipe — pops the run off Activity's stack and returns to that tab, its stack as
 * it was (Home › Notifications stays open). Each origin and its tab's route.
 */
export const RUN_ORIGIN_TAB = { home: '(home)', flows: 'flows', settings: 'settings' } as const;
export type RunOrigin = keyof typeof RUN_ORIGIN_TAB;

/** The run page's `returnTo` param as an origin, or null (none, or not one). */
export function runOrigin(param: unknown): RunOrigin | null {
  return typeof param === 'string' && Object.hasOwn(RUN_ORIGIN_TAB, param) ? (param as RunOrigin) : null;
}

/**
 * How long a flow page waits, while a run of the flow is pending or running,
 * before it reads its DASHBOARD again (Build 21, spec A6; the session's S30).
 */
export const FLOW_STATS_REREAD_MS = 5_000;

type ReportedStep = {
  stepId: string;
  outcome: 'ok' | 'held' | 'failed';
  summary: string;
  heldReason?: string;
  occurredAt: string;
};

type RunState = Pick<Run, 'status'> & Partial<Pick<Run, 'origin' | 'failureReason'>>;

/**
 * Each declared step's state, from what the run reported (spec A7; the
 * session's S14). Per step, in the pipeline's order:
 *
 * - reported `ok`, or `failed` without failing the run → done; `held` → held;
 *   `failed`, the run failed, and it is the step reported last → failed;
 * - not reported, before the furthest step reported → skipped (it was not
 *   needed: None's QuickBooks lookups, a second read nobody needed);
 * - not reported, after it: the first is working while the run goes on, the
 *   rest waiting; waiting while the run is held; skipped once it succeeded;
 *   stopped once it failed or was cancelled.
 *
 * A held step is held while the job is; once it runs on (approved), it is done
 * — the job's steps are its runs' together, in time order (round 24 P9,
 * backend ADR-0044; ~~a continuation's steps before its first, done~~).
 */
export function stepStates(
  pipeline: readonly { id: string }[],
  steps: readonly ReportedStep[],
  run: RunState,
): { state: TrackerState; step?: ReportedStep }[] {
  const order = new Map(pipeline.map((step, index) => [step.id, index]));
  const ordered = steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => Date.parse(a.step.occurredAt) - Date.parse(b.step.occurredAt) || a.index - b.index)
    .map(({ step }) => step);
  const latest = new Map<string, ReportedStep>();
  for (const step of ordered) latest.set(step.stepId, step);
  const reported = [...latest.keys()].flatMap((id) => (order.has(id) ? [order.get(id)!] : []));
  const furthest = reported.length > 0 ? Math.max(...reported) : -1;
  const lastId = ordered[ordered.length - 1]?.stepId;
  const going = run.status === 'pending' || run.status === 'running';
  return pipeline.map((declared, index) => {
    const step = latest.get(declared.id);
    if (step) {
      if (step.outcome === 'held') return { state: run.status === 'held' ? 'held' : 'done', step };
      if (step.outcome === 'failed' && run.status === 'failed' && declared.id === lastId) return { state: 'failed', step };
      return { state: 'done', step };
    }
    if (index < furthest) return { state: 'skipped' };
    if (going) return { state: index === furthest + 1 ? 'working' : 'waiting' };
    if (run.status === 'held') return { state: 'waiting' };
    if (run.status === 'succeeded') return { state: 'skipped' };
    return { state: 'stopped' };
  });
}

/** A group's state from its steps' (S14): working > held > failed > waiting (all) > done (any) > stopped > waiting > skipped. */
export function groupState(states: readonly TrackerState[]): TrackerState {
  if (states.includes('working')) return 'working';
  if (states.includes('held')) return 'held';
  if (states.includes('failed')) return 'failed';
  if (states.length > 0 && states.every((state) => state === 'waiting')) return 'waiting';
  if (states.includes('done')) return 'done';
  if (states.includes('stopped')) return 'stopped';
  if (states.includes('waiting')) return 'waiting';
  return 'skipped';
}

const TRACKER_LOOK: Record<TrackerState, { icon: Icon; tone: TrackerRow['tone'] }> = {
  waiting: { icon: CircleDashed, tone: 'muted' },
  working: { icon: CircleNotch, tone: 'accent' },
  done: { icon: CheckCircle, tone: 'ok' },
  held: { icon: HandPalm, tone: 'warn' },
  failed: { icon: WarningCircle, tone: 'err' },
  skipped: { icon: MinusCircle, tone: 'muted' },
  stopped: { icon: MinusCircle, tone: 'muted' },
  unknown: { icon: CircleDashed, tone: 'muted' },
};

/**
 * A step state's icon and tone — a timeline block's too (backend ADR-0048
 * decision 10): a state this build does not know has the "unknown" look.
 */
export function trackerLook(state: unknown): { state: TrackerState; icon: Icon; tone: TrackerRow['tone'] } {
  const known = typeof state === 'string' && Object.hasOwn(TRACKER_LOOK, state) ? (state as TrackerState) : 'unknown';
  return { state: known, ...TRACKER_LOOK[known] };
}

/**
 * What a row says of its state — never a step's own summary and never a step
 * id (B6; the owner's build 20 item 10: "It shoukd show all the steps and a live
 * tracker of which ones are done", and item 11's "What is the checked issue?"
 * over "34 accounts read" under Received).
 */
function trackerSub(
  state: TrackerState,
  steps: readonly ReportedStep[],
  run: RunState,
  clock: (iso: string) => string,
  decision?: HeldDecision | null,
): string {
  if (state === 'working') return RUN_WORKING;
  if (state === 'waiting') return STEP_WAITING;
  if (state === 'skipped') return STEP_SKIPPED;
  if (state === 'stopped') return STEP_STOPPED;
  if (state === 'failed') return run.failureReason ?? STEP_FAILED;
  // A held step says why it waits until its approval is denied, then "Denied"
  // (round 24 P6) — the website's words (`snoopy/lib/run-progress.ts`); once the job
  // runs on, the step is done. ~~"Approved", "No longer awaiting approval"~~ on
  // the step until the round's review.
  if (state === 'held') return decision === 'rejected' ? STEP_DENIED : stepHeld(steps.find((step) => step.outcome === 'held')?.heldReason);
  const last = steps.reduce<ReportedStep | undefined>(
    (latest, step) => (!latest || Date.parse(step.occurredAt) >= Date.parse(latest.occurredAt) ? step : latest),
    undefined,
  );
  return last ? `${STEP_DONE} · ${clock(last.occurredAt)}` : STEP_DONE;
}

/**
 * What a run's page knows of its flow, beside the run (Build 22; the session's
 * S23): the flow's setup fields and its settings NOW — a run's own choice is not
 * recorded (backend §12.1 #290) — and a provider's name. Absent when the flow
 * could not be read.
 */
export type TrackerFlow = {
  setup: readonly StepField[];
  config: Readonly<Record<string, unknown>>;
  providerName: (providerId: string) => string;
};

/**
 * A setting step (Build 22; backend ADR-0041): done from the start, as a run
 * starts with the flow's settings, and its line the integration the flow has
 * chosen — "QuickBooks Online", or "None" (the session's S23). A setting step
 * with no connection field, or a flow that could not be read, says "Done".
 */
function settingRow(id: string, title: string, groupId: string, flow: TrackerFlow | undefined): TrackerRow {
  const names = flow
    ? flow.setup
        .filter((field) => field.group === groupId && field.control === 'connection')
        .map((field) => {
          const chosen = chosenProvider(field.key, field, flow.config);
          return chosen === 'none' ? NONE_LABEL : flow.providerName(chosen);
        })
    : [];
  return { id, title, state: 'done', ...TRACKER_LOOK.done, sub: names.length > 0 ? names.join(', ') : STEP_DONE };
}

/**
 * The platform's email step, "Run completed" (round 23, A7; Build 22's S24;
 * backend ADR-0041), from the run's status and its `email`, whatever the
 * group's title: Waiting while the run goes on or is held (an approval's email
 * never checks it off); Failed for a failed run; Stopped for a cancelled one;
 * done once the run succeeded — "Email sent · {time}", "Sending email…" while
 * the email is owed (and with no `email` from the platform), "Done" when it
 * was not sent. The website's rule (`snoopy lib/run-progress.ts`), word for
 * word. ~~Held → "Sending…"; not sent → Skipped, "Not sent"~~ until round 23.
 */
function emailRow(
  id: string,
  title: string,
  run: RunState,
  email: RunDetail['email'],
  clock: (iso: string) => string,
): TrackerRow {
  const at = (state: TrackerState, sub: string): TrackerRow => ({ id, title, state, ...TRACKER_LOOK[state], sub });
  if (run.status === 'cancelled') return at('stopped', STEP_STOPPED);
  if (run.status === 'failed') return at('failed', STEP_FAILED);
  if (run.status !== 'succeeded') return at('waiting', STEP_WAITING);
  if (email?.status === 'sent') return at('done', email.sentAt ? emailSentLine(clock(email.sentAt)) : STEP_DONE);
  if (email?.status === 'not_sent') return at('done', STEP_DONE);
  return at('done', EMAIL_OWED);
}

/**
 * A run's STEPS (Build 21, spec A7): every row from the start, each with where
 * the run is — "1 · Upload invoice  Done · 2:32 PM", "3 · AI processing
 * Working…", "4 · QuickBooks updated  Waiting". One row per declared group, in
 * the groups' order (backend ADR-0037), or one per declared step for a version
 * without groups. Since Build 22 (backend ADR-0041) a group no pipeline step
 * names is a setting step (`settingRow`) or the platform's email
 * (`emailRow`), and a title follows the flow's connection choice
 * (`stepTitle`). The caller passes the catalog's — the newest version's —
 * pipeline and groups for any run (the session's S25): a run whose every
 * reported step they still declare is drawn by them (a v3 run by v4's five
 * steps). A run that reported a step they no longer declare is drawn as the
 * steps it reported — each titled from the catalog where it still names it,
 * else "Step {n}" — and "Working…" while it goes on (~~each reported step's own
 * summary under its group~~ until Build 21; ~~only a run of the catalog's own
 * version drawn by its groups~~ until Build 22).
 */
export function toTracker(
  steps: readonly ReportedStep[],
  declared: readonly { id: string; title: string; group?: string }[] | undefined,
  groups: readonly StepHeading[] | undefined,
  run: RunState,
  clock: (iso: string) => string,
  /** The catalog's steps, to title a run of another version by (`declared` absent). */
  titles: readonly { id: string; title: string }[] | undefined = declared,
  /** The flow as read now, and the run's email (Build 22); how its approval was decided (round 24 P6). */
  context: { flow?: TrackerFlow; email?: RunDetail['email']; decision?: HeldDecision | null } = {},
): TrackerRow[] {
  const known = new Set((declared ?? []).map((step) => step.id));
  const covered = declared && declared.length > 0 && steps.every((step) => known.has(step.stepId));
  if (!covered) return reportedRows(steps, titles, run, clock, context.decision);
  const pipeline = declared!;
  const states = stepStates(pipeline, steps, run);
  const row = (id: string, title: string, members: number[]): TrackerRow => {
    const state = groupState(members.map((index) => states[index]!.state));
    const reported = members.flatMap((index) => (states[index]!.step ? [states[index]!.step!] : []));
    return { id, title, state, ...TRACKER_LOOK[state], sub: trackerSub(state, reported, run, clock, context.decision) };
  };
  if (groups && groups.length > 0) {
    const named = new Set(pipeline.flatMap((step) => (step.group ? [step.group] : [])));
    return groups.map((group, position) => {
      const id = `group:${group.id}`;
      const title = `${position + 1} · ${stepTitle(group, context.flow?.setup ?? [], context.flow?.config)}`;
      if (group.platform === 'email') return emailRow(id, title, run, context.email, clock);
      if (group.platform !== undefined) return { id, title, state: 'unknown', ...TRACKER_LOOK.unknown, sub: '' };
      if (!named.has(group.id)) return settingRow(id, title, group.id, context.flow);
      return row(
        id,
        title,
        pipeline.flatMap((step, index) => (step.group === group.id ? [index] : [])),
      );
    });
  }
  return pipeline.map((step, index) => row(`step:${step.id}`, `${index + 1} · ${step.title}`, [index]));
}

/** The fallback: the steps a run of another version reported, in order, by state. */
function reportedRows(
  steps: readonly ReportedStep[],
  declared: readonly { id: string; title: string }[] | undefined,
  run: RunState,
  clock: (iso: string) => string,
  decision?: HeldDecision | null,
): TrackerRow[] {
  const titles = new Map((declared ?? []).map((step) => [step.id, step.title]));
  const ordered = [...steps].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const rows = ordered.map((step, index): TrackerRow => {
    const failedRun = step.outcome === 'failed' && run.status === 'failed' && index === ordered.length - 1;
    const state: TrackerState = step.outcome === 'held' && run.status === 'held' ? 'held' : failedRun ? 'failed' : 'done';
    return {
      id: `reported:${index}:${step.stepId}`,
      title: `${index + 1} · ${titles.get(step.stepId) ?? `Step ${index + 1}`}`,
      state,
      ...TRACKER_LOOK[state],
      sub: trackerSub(state, [step], run, clock, decision),
    };
  });
  if (run.status === 'pending' || run.status === 'running') {
    rows.push({
      id: 'working',
      title: `${rows.length + 1} · Step ${rows.length + 1}`,
      state: 'working',
      ...TRACKER_LOOK.working,
      sub: RUN_WORKING,
    });
  }
  return rows;
}

/**
 * The run page's tiles: Duration, and Steps done — the rows done or skipped
 * over every row (spec A7; the session's S14), so a run at its start reads "0 /
 * 5" and never "1 / 1" (the owner's build 20 item 10). ~~Rows done over rows
 * shown~~ until Build 21.
 */
export function toRunStats(
  rows: readonly TrackerRow[],
  durationText: string,
): { value: string; label: string }[] {
  // A step with no state (a platform step this build does not know) is not counted.
  const counted = rows.filter((row) => row.id !== 'working' && row.state !== 'unknown');
  const done = counted.filter((row) => row.state === 'done' || row.state === 'skipped').length;
  return [
    { value: durationText, label: 'Duration' },
    { value: counted.length > 0 ? `${done} / ${counted.length}` : EMPTY, label: 'Steps done' },
  ];
}

/**
 * The run's facts, as the website's run page lists them under its title
 * (Gate 24's parity pass, G18): when it started and ended — the design's em
 * dash for either it has not reached — how it started, its Trigger, in the
 * website's words (`runOriginLabel`), and since Build 21 its Run ID, the full
 * id (spec A7; the owner's D4 and AM2).
 */
export function toRunFacts(
  run: Pick<Run, 'id' | 'startedAt' | 'endedAt' | 'origin'>,
): { label: 'Started' | 'Ended' | 'Trigger' | 'Run ID'; value: string }[] {
  return [
    { label: 'Started', value: dateTime(run.startedAt) },
    { label: 'Ended', value: dateTime(run.endedAt) },
    { label: 'Trigger', value: runOriginLabel(run.origin) },
    { label: RUN_ID_LABEL, value: run.id },
  ];
}
