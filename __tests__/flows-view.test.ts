import type { CatalogEntry } from '@/lib/platform/catalog';
import type { RunSubscriptionCounts, Subscription } from '@/lib/platform/runs';
import { toFlows } from '@/lib/view/catalog';
import {
  approvalTitle,
  composeNotifications,
  metaFor,
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
    setup: [],
    pipeline: [
      { id: 'extract', kicker: 'AI STEP', title: 'Extract invoice fields', description: 'x' },
    ],
    ...over,
  }) as CatalogEntry;

const sub = (over: Partial<Subscription> = {}): Subscription =>
  ({
    id: 's1',
    workspaceId: 'w',
    templateId: 'acme.invoice',
    templateVersion: 1,
    status: 'live',
    config: {},
    unmetConnections: [],
    createdAt: '2026-08-17T00:00:00Z',
    updatedAt: '2026-08-17T00:00:00Z',
    ...over,
  }) as Subscription;

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
  }) as RunSubscriptionCounts;

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

describe('composeNotifications — §12.1 #71', () => {
  const catalog = new Map([['acme.invoice', entry()]]);
  const subs = subscriptionIndex([{ id: 's1', templateId: 'acme.invoice' }]);
  const now = Date.parse('2026-08-17T12:00:00Z');

  it('draws from held approvals and failed runs, and nothing else', () => {
    const rows = composeNotifications(
      [
        {
          id: 'a1',
          subscriptionId: 's1',
          stepId: 'extract',
          reason: 'Amount differs from PO',
          createdAt: '2026-08-17T11:48:00Z',
        },
      ],
      [
        {
          id: 'r1',
          templateId: 'acme.invoice',
          status: 'failed',
          failureReason: 'Sheets auth expired',
          createdAt: '2026-08-17T11:00:00Z',
        } as never,
      ],
      subs,
      catalog,
      now,
    );
    expect(rows.map((r) => r.title)).toEqual(['Run held for review', 'Run failed']);
    expect(rows[0].desc).toContain('Amount differs from PO');
  });

  it('reports every row unread, because read state is an unbuilt subsystem', () => {
    const rows = composeNotifications(
      [{ id: 'a1', subscriptionId: 's1', stepId: 'extract', reason: 'r', createdAt: '2026-08-17T11:00:00Z' }],
      [],
      subs,
      catalog,
      now,
    );
    expect(rows.every((r) => r.unread)).toBe(true);
  });

  it('orders newest first across both sources', () => {
    const rows = composeNotifications(
      [{ id: 'a1', subscriptionId: 's1', stepId: 'extract', reason: 'r', createdAt: '2026-08-16T12:00:00Z' }],
      [
        {
          id: 'r1',
          templateId: 'acme.invoice',
          status: 'failed',
          createdAt: '2026-08-17T11:55:00Z',
        } as never,
      ],
      subs,
      catalog,
      now,
    );
    expect(rows[0].title).toBe('Run failed');
  });
});
