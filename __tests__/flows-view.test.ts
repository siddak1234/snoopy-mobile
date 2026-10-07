import type { CatalogEntry } from '@/lib/platform/catalog';
import type { RunSubscriptionCounts, Subscription } from '@/lib/platform/runs';
import { addedAgainAs, scopeLabels, toFlows, toSolutions } from '@/lib/view/catalog';
import {
  approvalTitle,
  heldDecisionLine,
  inboxRows,
  metaFor,
  needsReview,
  runLabel,
  splitByDay,
  subscriptionIndex,
} from '@/lib/view/runs';

/**
 * The joins the round's refusals forced, and the rules that are easy to get
 * wrong. Each case here is a sentence from a spec or a §12.1 row, not a guess.
 */

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry =>
  ({
    templateId: 'acme.invoice',
    version: 1,
    name: 'Invoice triage',
    description: 'AP inbox to ledger',
    category: 'Finance',
    icon: 'receipt',
    monthlyPriceUsd: 39,
    subscribed: true,
    available: true,
    requiredConnections: [],
    setup: [],
    pipeline: [
      { id: 'extract', kicker: 'AI STEP', title: 'Extract invoice fields', description: 'x' },
    ],
    ...over,
  });

const sub = (over: Partial<Subscription> = {}): Subscription =>
  ({
    id: 's1',
    workspaceId: 'w',
    templateId: 'acme.invoice',
    templateVersion: 1,
    status: 'live',
    config: {},
    unmetConnections: [],
    projectId: null,
    createdByUserId: null,
    createdAt: '2026-08-17T00:00:00Z',
    updatedAt: '2026-08-17T00:00:00Z',
    ...over,
  });

const counts = (over: Partial<RunSubscriptionCounts> = {}): RunSubscriptionCounts =>
  ({
    subscriptionId: 's1',
    total: 1284,
    pending: 0,
    running: 0,
    held: 0,
    succeeded: 1272,
    failed: 12,
    cancelled: 0,
    ...over,
  });

describe('toFlows', () => {
  it('draws the summary line from run-stats, grouped as the design writes it', () => {
    const [flow] = toFlows([sub()], [entry()], [counts()]);
    expect(flow.runs).toBe('1,284 runs · 1,272 ok · 12 failed');
    expect(flow.runCount).toBe('1,284');
  });

  it('treats a subscription ABSENT from run-stats as zero runs, not as missing', () => {
    // run-stats returns only subscriptions with >= 1 run in the window, so an
    // absent entry means "none in this window" — it does not mean the
    // subscription does not exist.
    const [flow] = toFlows([sub()], [entry()], []);
    expect(flow.runs).toBe('0 runs · 0 ok · 0 failed');
    expect(flow.name).toBe('Invoice triage');
  });

  it('writes a Draft’s counters as the design’s em dash, never as zeroes', () => {
    const [flow] = toFlows([sub({ status: 'draft' })], [entry()], []);
    expect(flow.runs).toBe('Not yet published');
    expect(flow.runCount).toBe('—');
    expect(flow.okCount).toBe('—');
  });

  it('carries the declared pipeline through, so detail can draw steps', () => {
    const [flow] = toFlows([sub()], [entry()], [counts()]);
    expect(flow.steps).toHaveLength(1);
    expect(flow.steps[0].title).toBe('Extract invoice fields');
  });

  it('falls back to the templateId when the catalog has no entry', () => {
    const [flow] = toFlows([sub()], [], []);
    expect(flow.name).toBe('acme.invoice');
    expect(flow.steps).toEqual([]);
  });

  it('prefers the subscription’s own name over the catalog’s', () => {
    const [flow] = toFlows([sub({ name: 'AP triage — EU' })], [entry()], [counts()]);
    expect(flow.name).toBe('AP triage — EU');
  });

  it('leaves an archived subscription out: it is not a workflow any more', () => {
    const flows = toFlows([sub(), sub({ id: 's2', status: 'archived' })], [entry()], [counts()]);
    expect(flows.map((flow) => flow.key)).toEqual(['s1']);
  });

  it('labels a flow by its team\'s kind — a team named before 24.12 too', () => {
    const legacy = { id: 'p1', name: 'AP inbox', type: 'Finance', status: 'active' };
    const labels = scopeLabels([legacy]);
    const [scoped, whole] = toFlows(
      [sub({ projectId: 'p1' }), sub({ id: 's2', projectId: null })],
      [entry()],
      [counts()],
      undefined,
      labels,
    );
    expect(scoped.scope).toBe('Team: Finance');
    expect(whole.scope).toBe('Whole workspace');
  });

  it('labels every flow — Whole workspace where the workspace has no team at all (build 11, D4)', () => {
    const [whole] = toFlows([sub({ projectId: null })], [entry()], [counts()], undefined, scopeLabels([]));
    expect(whole.scope).toBe('Whole workspace');
  });
});

describe('addedAgainAs — an archived flow\'s live twin (build 11, D3; in any team since the owner\'s build 12 item 9)', () => {
  const archived = sub({ id: 'old', status: 'archived', projectId: null });

  it('is the non-archived subscription with the same template in the same scope, whatever its status', () => {
    for (const status of ['live', 'paused', 'draft'] as const) {
      expect(addedAgainAs(archived, [archived, sub({ id: 'again', status, projectId: null })])?.id).toBe('again');
    }
    // The whole workspace matches the whole workspace, written either way.
    expect(addedAgainAs(archived, [sub({ id: 'again' })])?.id).toBe('again');
  });

  it("is none for another template or an archived row — another team's copy IS the twin (the owner's build 12 item 9: one flow per workspace; until build 13 null matched null only)", () => {
    expect(addedAgainAs(archived, [sub({ id: 'other', templateId: 'acme.other' })])).toBeUndefined();
    expect(addedAgainAs(archived, [archived, sub({ id: 'gone', status: 'archived' })])).toBeUndefined();
    expect(addedAgainAs(archived, [sub({ id: 'team', projectId: 'p1' })])?.id).toBe('team');
    expect(addedAgainAs(sub({ projectId: 'p1' }), [sub({ id: 'whole', projectId: null })])?.id).toBe('whole');
    expect(addedAgainAs(sub({ projectId: 'p1' }), [sub({ id: 'other-team', projectId: 'p2' })])?.id).toBe('other-team');
    expect(addedAgainAs(sub({ projectId: 'p1' }), [sub({ id: 'same-team', projectId: 'p1' })])?.id).toBe('same-team');
  });
});

describe('toSolutions — Added is a subscription the workspace still has', () => {
  const catalog = { automations: [entry()], categories: ['All'] };

  it('is Added with a live, paused or draft subscription', () => {
    for (const status of ['live', 'paused', 'draft'] as const) {
      expect(toSolutions(catalog, [sub({ status })])[0]!.subscribed).toBe(true);
    }
  });

  it('is not Added with only an archived one, whatever the catalog flag says', () => {
    // The catalog's `subscribed` is still true here: it counts the archived row.
    expect(toSolutions(catalog, [sub({ status: 'archived' })])[0]!.subscribed).toBe(false);
    expect(toSolutions(catalog, [])[0]!.subscribed).toBe(false);
  });
});

describe('metaFor — §12.1 #67’s substitute for run output', () => {
  const run = (over: Record<string, unknown>) =>
    ({ status: 'succeeded', createdAt: '2026-08-17T10:00:00Z', ...over }) as never;

  it('renders resultSummary on success and failureReason on failure', () => {
    expect(metaFor(run({ resultSummary: 'Posted bill #10412' }))).toBe('Posted bill #10412');
    expect(metaFor(run({ status: 'failed', failureReason: 'Sheets auth expired' }))).toBe(
      'Sheets auth expired',
    );
  });

  it('never crosses them over — each belongs to one terminal status', () => {
    expect(metaFor(run({ status: 'failed', resultSummary: 'ignored' }))).toBe('Failed');
    expect(metaFor(run({ status: 'succeeded', failureReason: 'ignored' }))).toBe('Success');
  });

  it('falls back to the status word when the automation supplied nothing', () => {
    expect(metaFor(run({ status: 'succeeded' }))).toBe('Success');
    expect(metaFor(run({ status: 'running' }))).toBe('Running');
  });
});

describe('approvalTitle — the three-hop join, and every hop that can miss', () => {
  const catalog = new Map([['acme.invoice', entry()]]);
  const subs = subscriptionIndex([{ id: 's1', templateId: 'acme.invoice' }]);
  const approval = { subscriptionId: 's1', stepId: 'extract' };

  it('joins subscription → template → catalog → pipeline step', () => {
    expect(approvalTitle(approval, subs, catalog)).toBe('Invoice triage · Extract invoice fields');
  });

  it('degrades to the automation name when the step is no longer declared', () => {
    expect(approvalTitle({ ...approval, stepId: 'gone' }, subs, catalog)).toBe('Invoice triage');
  });

  it('degrades to the templateId when the catalog entry is withdrawn', () => {
    expect(approvalTitle(approval, subs, new Map())).toBe('acme.invoice');
  });

  it('degrades to the empty mark when the subscription is gone, never blank', () => {
    expect(approvalTitle(approval, new Map(), catalog)).toBe('—');
  });
});

describe('runLabel — §12.1 #69’s substitute, with its caveat', () => {
  it('shortens requestId rather than claiming it is a run number', () => {
    const label = runLabel({ requestId: 'b3f1c2d4-0000-4000-8000-000000000000' } as never);
    expect(label).toBe('Run b3f1c2d4');
    expect(label).not.toContain('#');
  });

  it('falls back to the run id when no requestId was recorded', () => {
    expect(runLabel({ id: 'aaaabbbb-cccc-4ddd-8eee-ffff00001111' } as never)).toBe('Run aaaabbbb');
  });
});

describe('splitByDay', () => {
  const now = new Date(2026, 7, 17, 14, 0, 0);
  const at = (d: Date) => ({ createdAt: d.toISOString() }) as never;

  it('groups by the device’s local day, not by UTC', () => {
    const today = at(new Date(2026, 7, 17, 1, 0, 0));
    const yesterday = at(new Date(2026, 7, 16, 23, 30, 0));
    const older = at(new Date(2026, 7, 10, 9, 0, 0));
    const split = splitByDay([today, yesterday, older], now);
    expect(split.today).toHaveLength(1);
    expect(split.yesterday).toHaveLength(1);
  });
});

describe('inboxRows — the platform\'s inbox in words (decision 3A, reversing §12.1 #71)', () => {
  const catalog = new Map([['acme.invoice', entry()]]);
  const now = Date.parse('2026-08-17T12:00:00Z');
  const held = {
    id: 'approval:a1',
    kind: 'approval-requested' as const,
    runId: 'r0',
    approvalId: 'a1',
    subscriptionId: 's1',
    templateId: 'acme.invoice',
    stepId: 'extract',
    reason: 'Amount differs from PO',
    occurredAt: '2026-08-17T11:48:00Z',
    read: false,
  };
  const failed = {
    id: 'run:r1',
    kind: 'run-failed' as const,
    runId: 'r1',
    subscriptionId: 's1',
    templateId: 'acme.invoice',
    failureReason: 'Sheets auth expired',
    occurredAt: '2026-08-17T11:00:00Z',
    read: true,
  };

  it('names a held run by its automation and the step that held, then why, and opens Activity', () => {
    const [row] = inboxRows([held], catalog, now);
    expect(row).toEqual({
      id: 'approval:a1',
      tone: 'warn',
      unread: true,
      title: 'Run held for review',
      desc: 'Invoice triage · Extract invoice fields · Amount differs from PO',
      time: '12m',
      target: 'activity',
      runId: 'r0',
    });
  });

  it('names a failed run by its automation, then why, and opens the run', () => {
    const [row] = inboxRows([failed], catalog, now);
    expect(row).toEqual({
      id: 'run:r1',
      tone: 'err',
      unread: false,
      title: 'Run failed',
      desc: 'Invoice triage · Sheets auth expired',
      time: '1h',
      target: 'run',
      runId: 'r1',
    });
  });

  it('keeps the platform\'s order and its read state, inventing neither', () => {
    const rows = inboxRows([failed, held], catalog, now);
    expect(rows.map((r) => r.id)).toEqual(['run:r1', 'approval:a1']);
    expect(rows.map((r) => r.unread)).toEqual([false, true]);
  });

  it('degrades, never blanks: a failure without a reason says Failed; a step or automation the catalog lacks falls back', () => {
    const { failureReason: _unsaid, ...silent } = failed;
    expect(inboxRows([silent], catalog, now)[0]!.desc).toBe('Invoice triage · Failed');
    expect(inboxRows([{ ...held, stepId: 'gone' }], catalog, now)[0]!.desc).toBe(
      'Invoice triage · Amount differs from PO',
    );
    expect(inboxRows([{ ...held, templateId: 'acme.gone' }], catalog, now)[0]!.desc).toBe(
      'acme.gone · Amount differs from PO',
    );
  });
});

describe('a held run says how it was decided (24.7.3 attempt 2, feedback #5 and #7)', () => {
  const held = { id: 'r1', status: 'held', origin: 'manual' } as never;
  const approval = (status: string) => ({ runId: 'r1', status }) as never;

  it('is pending, approved, rejected, or closed by its approval, and "held" without one', () => {
    expect(heldDecisionLine(held, [approval('pending')])).toBe('Waiting for approval');
    expect(heldDecisionLine(held, [approval('approved')])).toBe('Approved — continued in a new run');
    expect(heldDecisionLine(held, [approval('rejected')])).toBe('Rejected');
    expect(heldDecisionLine(held, [approval('cancelled')])).toBe('No longer awaiting approval');
    expect(heldDecisionLine(held, [])).toBe('Held for review');
  });

  it('needs review only while nobody has decided', () => {
    expect(needsReview(held, [approval('pending')])).toBe(true);
    expect(needsReview(held, [])).toBe(true);
    expect(needsReview(held, [approval('approved')])).toBe(false);
    expect(needsReview(held, [approval('rejected')])).toBe(false);
    expect(needsReview({ id: 'r2', status: 'succeeded' } as never, [])).toBe(false);
  });

  it('prefixes a continuation the way the website labels it, and lets a held row carry its decision', () => {
    const continuation = { id: 'r3', status: 'succeeded', origin: 'approval-continuation', resultSummary: 'Posted' } as never;
    expect(metaFor(continuation)).toBe('After approval · Posted');
    expect(metaFor(held, [approval('approved')])).toBe('Approved — continued in a new run');
    // Without the approvals beside it, a held run still reads as the status word.
    expect(metaFor(held)).toBe('Held');
  });
});
