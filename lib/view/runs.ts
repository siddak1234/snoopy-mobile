import type { Icon } from 'phosphor-react-native';
import { CheckCircle, CircleDashed, HandPalm, XCircle } from 'phosphor-react-native';

import type { CatalogEntry } from '@/lib/platform/catalog';
import type { InboxNotification } from '@/lib/platform/notifications';
import type { Approval, Run } from '@/lib/platform/runs';
import { EMPTY, relativeTime } from './format';
import { statusLabel, statusTone, type StatusPillLabel, type StatusTone } from './status';

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
  // A continuation is part of the run it continues, as the website says beside
  // its name ("after approval"); a held run says how it was decided, because its
  // status never changes after the decision (FR-15).
  const prefix = run.origin === 'approval-continuation' ? 'After approval · ' : '';
  if (run.status === 'held' && approvals) return heldDecisionLine(run, approvals);
  if (run.status === 'succeeded' && run.resultSummary) return prefix + run.resultSummary;
  if (run.status === 'failed' && run.failureReason) return prefix + run.failureReason;
  return prefix + statusLabel(run.status);
}

/** How a held run was decided, from the approvals read beside it. */
export type HeldDecision = 'pending' | 'approved' | 'rejected' | 'closed' | 'unknown';

export function heldDecision(run: Run, approvals: readonly Approval[]): HeldDecision | null {
  if (run.status !== 'held') return null;
  const approval = approvals.find((a) => a.runId === run.id);
  if (!approval) return 'unknown';
  if (approval.status === 'pending') return 'pending';
  if (approval.status === 'approved') return 'approved';
  if (approval.status === 'rejected') return 'rejected';
  return 'closed';
}

const HELD_DECISION_LINE: Record<HeldDecision, string> = {
  pending: 'Waiting for approval',
  approved: 'Approved — continued in a new run',
  rejected: 'Rejected',
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
  // days still has activity (24.7.3 attempt 1, DESIGN-GAPS).
  const earlier = runs.filter((r) => !today.includes(r) && !yesterday.includes(r));
  return { today, yesterday, earlier };
}

/**
 * The run label the design quotes, e.g. "Run #4821".
 *
 * §12.1 #69 refuses a human run number and names `requestId` as the substitute.
 * It is a poor one and the caveat belongs in the code rather than only in a
 * register: `requestId` defaults to a `randomUUID()` — 36 characters, no shorter
 * than `Run.id` — and when a caller supplies `x-request-id` it is
 * client-controlled and not unique per run. So this renders a short prefix for
 * recognisability and never claims it identifies the run. Filed in
 * DESIGN-CONTRACT.md; a genuinely quotable label is a backend decision.
 */
export function runLabel(run: Run): string {
  const source = run.requestId || run.id;
  return source ? `Run ${source.slice(0, 8)}` : EMPTY;
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
export type ApprovalItem = { id: string; workflow: string; title: string; why: string; time: string };

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
  target: 'run' | 'activity' | 'settings';
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
        target: 'activity' as const,
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

/** A run-detail timeline row, in the shape `RunTimelineItem` had. */
export type TimelineRowView = {
  id: string;
  icon: Icon;
  tone: 'ok' | 'warn' | 'err' | 'pending';
  title: string;
  sub: string;
  time?: string;
};

/**
 * The run timeline: reported steps, titled from the manifest.
 *
 * `RunStep` carries a `stepId` and a one-line `summary`, and the spec is explicit
 * that `stepId` is "always a step the pinned manifest declares". So the human
 * title comes from that manifest's `pipeline` — the join is the intended one, not
 * a workaround — and `summary` is the second line.
 *
 * Steps the manifest declares but the run never reported are drawn as pending,
 * which is how the design shows a held run's remaining work ("Post to QuickBooks
 * · Waiting on your approval"). Without that, a held run would look complete.
 */
export function toTimeline(
  steps: {
    stepId: string;
    outcome: 'ok' | 'held' | 'failed';
    summary: string;
    heldReason?: string;
    occurredAt: string;
  }[],
  declared: { id: string; title: string; description: string }[] | undefined,
  clock: (iso: string) => string,
): TimelineRowView[] {
  const reported = new Map(steps.map((s) => [s.stepId, s]));
  const titles = new Map((declared ?? []).map((d) => [d.id, d]));

  const rows: TimelineRowView[] = steps.map((step) => ({
    id: `reported:${step.stepId}`,
    icon: OUTCOME_ICON[step.outcome],
    tone: step.outcome === 'ok' ? 'ok' : step.outcome === 'held' ? 'warn' : 'err',
    title: titles.get(step.stepId)?.title ?? step.stepId,
    sub: step.heldReason ?? step.summary,
    time: clock(step.occurredAt),
  }));

  const remaining = (declared ?? [])
    .filter((d) => !reported.has(d.id))
    .map<TimelineRowView>((d) => ({
      id: `pending:${d.id}`,
      icon: CircleDashed,
      tone: 'pending',
      title: d.title,
      sub: d.description,
    }));

  return [...rows, ...remaining];
}

const OUTCOME_ICON: Record<'ok' | 'held' | 'failed', Icon> = {
  ok: CheckCircle,
  held: HandPalm,
  failed: XCircle,
};

/**
 * The run-detail stat tiles.
 *
 * Two of the three are derivable and the third is not. **Confidence is refused**
 * — §12.1 #73a places it in that run's output, which no published shape carries —
 * so it renders the design's own em dash, which the design already draws for runs
 * that have no confidence to report. `Steps done` is reported-versus-declared,
 * which is why the manifest pipeline is needed here too.
 */
export function toRunStats(
  reportedSteps: number,
  declaredSteps: number,
  durationText: string,
): { value: string; label: string }[] {
  return [
    { value: durationText, label: 'Duration' },
    { value: declaredSteps > 0 ? `${reportedSteps} / ${declaredSteps}` : EMPTY, label: 'Steps done' },
    { value: EMPTY, label: 'Confidence' },
  ];
}
