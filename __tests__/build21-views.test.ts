import type { Approval, Run } from '@/lib/platform/automations';
import {
  HELD_APPROVAL_REREADS,
  groupState,
  hasApprovalForm,
  heldDecision,
  jobApproval,
  rereadForApproval,
  trackerLook,
  runLabel,
  stepStates,
  toRunStats,
  toTracker,
  type TrackerState,
} from '@/lib/view/runs';
import { invoiceProcessingEntry, invoiceProcessingV3Entry } from '@/test/platform';

/**
 * Build 21's view rules, each a table (spec A7, A8, A9; the session's S14):
 * the tracker's state for every step and group, from shared fixtures — run
 * 793eef82 as it ran, a v3 run of three receipts, a held run, a
 * continuation, a failed run. ~~Home's quick runs~~ until Build 22 (the
 * owner's build 21 item 1: "Remove run a flow section"); ~~the document card
 * (`lib/view/documents.ts`)~~ until Round 21 — the platform composes a run's
 * documents as blocks (backend ADR-0048), its tests holding the card's
 * strings, and the app draws them (`__tests__/blocks-parity.test.tsx`).
 */

type Step = { stepId: string; outcome: 'ok' | 'held' | 'failed'; summary: string; occurredAt: string; heldReason?: string };
const at = (minute: number) => new Date(Date.UTC(2026, 9, 15, 1, minute)).toISOString();
const steps = (...reported: [string, Step['outcome'], number?][]): Step[] =>
  reported.map(([stepId, outcome, minute], n) => ({ stepId, outcome, summary: `${stepId} said this`, occurredAt: at(minute ?? n) }));
const clock = (iso: string) => iso.slice(11, 16);

const V3 = invoiceProcessingV3Entry();
const groupsOf = (rows: ReturnType<typeof toTracker>) => rows.map((row) => [row.title, row.state, row.sub]);

describe('the tracker: every step from the start, and where the run is (spec A7; S14)', () => {
  it.each<[string, Parameters<typeof stepStates>[2], Step[], TrackerState[]]>([
    ['nothing reported, pending', { status: 'pending' }, [], ['working', 'waiting', 'waiting', 'waiting']],
    ['running, received done', { status: 'running' }, steps(['receive', 'ok']), ['done', 'working', 'waiting', 'waiting']],
    // A three-receipt run with None: QuickBooks' lookups never ran — skipped, not waiting.
    [
      'succeeded on None: lookups skipped',
      { status: 'succeeded' },
      steps(['receive', 'ok'], ['extract', 'ok'], ['check-documents', 'ok'], ['decide', 'ok'], ['save-documents', 'ok']),
      ['done', 'done', 'done', 'done'],
    ],
    [
      'held at ask-approval',
      { status: 'held' },
      steps(['receive', 'ok'], ['extract', 'ok'], ['check-documents', 'ok'], ['decide', 'ok'], ['ask-approval', 'held']),
      ['done', 'done', 'done', 'held'],
    ],
    [
      'failed while reading',
      { status: 'failed', failureReason: "The document can't be read. Try a clearer photo." },
      steps(['receive', 'ok'], ['extract', 'failed']),
      ['done', 'failed', 'stopped', 'stopped'],
    ],
    ['cancelled before it read', { status: 'cancelled' }, steps(['receive', 'ok']), ['done', 'stopped', 'stopped', 'stopped']],
    [
      // A job is its runs' steps together (round 24 P9): approved, its held step is done once it runs on.
      'an approved job: the held step done, then the steps after it',
      { status: 'succeeded' },
      steps(['receive', 'ok'], ['extract', 'ok'], ['check-documents', 'ok'], ['decide', 'ok'], ['ask-approval', 'held'], ['confirm-company', 'ok'], ['create-approved-records', 'ok']),
      ['done', 'done', 'done', 'done'],
    ],
    [
      'an approved job still running: the held step done, the next working',
      { status: 'running' },
      steps(['receive', 'ok'], ['extract', 'ok'], ['check-documents', 'ok'], ['decide', 'ok'], ['ask-approval', 'held']),
      ['done', 'done', 'done', 'working'],
    ],
    [
      // ~~A continuation's groups before its first step, done~~ until round 24: no such run is drawn.
      'a continuation alone is drawn as what it reported, nothing assumed done before it',
      { status: 'succeeded', origin: 'approval-continuation' },
      steps(['confirm-company', 'ok'], ['create-approved-records', 'ok']),
      ['skipped', 'skipped', 'skipped', 'done'],
    ],
  ])('%s', (_case, run, reported, groups) => {
    const rows = toTracker(reported, V3.pipeline, V3.groups, run, clock);
    expect(rows.map((row) => row.state)).toEqual(groups);
    expect(rows.map((row) => row.title)).toEqual(['1 · Received', '2 · Read', '3 · Checked', '4 · Done']);
  });

  it('says each state in words — never a step\'s own summary, never a step id', () => {
    const rows = toTracker(
      [...steps(['receive', 'ok', 32], ['extract', 'ok', 33]), { stepId: 'ask-approval', outcome: 'held', summary: 'held said', occurredAt: at(34), heldReason: "Document 2: the total can't be read." }],
      V3.pipeline,
      V3.groups,
      { status: 'held' },
      clock,
    );
    expect(groupsOf(rows)).toEqual([
      ['1 · Received', 'done', 'Done · 01:32'],
      ['2 · Read', 'done', 'Done · 01:33'],
      ['3 · Checked', 'skipped', 'Skipped'],
      ['4 · Done', 'held', "Waiting for approval: Document 2: the total can't be read."],
    ]);
    for (const row of rows) expect(row.sub).not.toMatch(/said|receive|extract|ask-approval/u);
  });

  it("run 793eef82 as it ran (v2): never '34 accounts read', the failure on its step, the rest stopped", () => {
    const v2 = invoiceProcessingEntry();
    const step = (id: string, group: string) => ({ id, kicker: 'ACTION' as const, group, title: id, description: id });
    const pipeline = [
      step('receive', 'received'),
      step('read-company', 'received'),
      step('read-preferences', 'received'),
      step('find-accounts', 'received'),
      step('extract', 'read'),
      step('check-document', 'checked'),
      step('save-details', 'done'),
      step('notify', 'emailed'),
    ];
    const reported = steps(['receive', 'ok'], ['read-company', 'ok'], ['read-preferences', 'ok'], ['find-accounts', 'ok'], ['extract', 'ok'], ['check-document', 'failed']);
    reported[3]!.summary = '34 accounts read';
    const rows = toTracker(reported, pipeline, v2.groups, { status: 'failed', failureReason: 'Add one document per file.' }, clock);
    expect(rows.map((row) => [row.state, row.sub])).toEqual([
      ['done', 'Done · 01:03'],
      ['done', 'Done · 01:04'],
      ['failed', 'Add one document per file.'],
      ['stopped', 'Stopped'],
      ['stopped', 'Stopped'],
    ]);
    expect(rows.some((row) => row.sub.includes('34 accounts read'))).toBe(false);
  });

  it('Steps done counts the groups done or skipped over every group — at the start 0 of them, never "1 / 1" while running', () => {
    const start = toTracker([], V3.pipeline, V3.groups, { status: 'pending' }, clock);
    expect(toRunStats(start, '—')[1]).toEqual({ value: '0 / 4', label: 'Steps done' });
    const running = toTracker(steps(['receive', 'ok']), V3.pipeline, V3.groups, { status: 'running' }, clock);
    expect(toRunStats(running, '2s')[1]).toEqual({ value: '1 / 4', label: 'Steps done' });
    const done = toTracker(steps(['receive', 'ok'], ['save-documents', 'ok']), V3.pipeline, V3.groups, { status: 'succeeded' }, clock);
    expect(toRunStats(done, '9s')[1]).toEqual({ value: '4 / 4', label: 'Steps done' });
  });

  it('each step on its own: one the run passed over is Skipped — never Waiting — and after a hold the rest wait', () => {
    const none = stepStates(
      V3.pipeline,
      steps(['receive', 'ok'], ['extract', 'ok'], ['check-documents', 'ok'], ['decide', 'ok'], ['save-documents', 'ok']),
      { status: 'succeeded' },
    );
    const byId = (states: ReturnType<typeof stepStates>) => Object.fromEntries(V3.pipeline.map((step, i) => [step.id, states[i]!.state]));
    expect(byId(none)).toMatchObject({
      receive: 'done',
      'verify-read': 'skipped',
      'read-company': 'skipped',
      'find-accounts': 'skipped',
      'find-related': 'skipped',
      decide: 'done',
      'create-records': 'skipped',
      'save-documents': 'done',
      'ask-approval': 'skipped',
      'save-approved': 'skipped',
    });
    const held = stepStates(V3.pipeline, steps(['receive', 'ok'], ['decide', 'ok'], ['ask-approval', 'held']), { status: 'held' });
    expect(byId(held)).toMatchObject({ extract: 'skipped', 'ask-approval': 'held', 'confirm-company': 'waiting', 'save-approved': 'waiting' });
  });

  it('a group is working over held over failed over all-waiting over any-done', () => {
    expect(groupState(['held', 'failed'])).toBe('held');
    expect(groupState(['failed', 'working'])).toBe('working');
    expect(groupState(['done', 'working', 'waiting'])).toBe('working');
    expect(groupState(['done', 'held'])).toBe('held');
    expect(groupState(['done', 'failed', 'stopped'])).toBe('failed');
    expect(groupState(['waiting', 'waiting'])).toBe('waiting');
    expect(groupState(['skipped', 'done', 'skipped'])).toBe('done');
    expect(groupState(['skipped', 'skipped'])).toBe('skipped');
    expect(groupState(['stopped', 'skipped'])).toBe('stopped');
  });

  it('a run of another version is drawn by what it reported, titled from the catalog where it names the step, else "Step n"', () => {
    const rows = toTracker(steps(['receive', 'ok'], ['find-payer', 'ok']), undefined, undefined, { status: 'running' }, clock, V3.pipeline);
    expect(rows.map((row) => [row.title, row.sub])).toEqual([
      ['1 · Document received', 'Done · 01:00'],
      ['2 · Step 2', 'Done · 01:01'],
      ['3 · Step 3', 'Working…'],
    ]);
  });
});

describe("step 4's words, the website's (round 24 P6; the review's first and sixth findings)", () => {
  const JOB = '793eef82-102d-81be-a2d3-9e8d4e2b2c36';
  const held = { id: JOB, status: 'held' } as Run;
  const approval = (status: Approval['status'], createdAt = at(30)): Approval => ({
    id: `ap-${status}`,
    runId: JOB,
    workspaceId: '5e4d1b90-2c77-4f16-8a03-9d61e4b7c520',
    subscriptionId: 'invoice',
    stepId: 'ask-approval',
    status,
    reason: 'Document 1: needs a look.',
    eligibleRoles: ['owner'],
    createdAt,
    expiresAt: at(59),
  });
  const reported: Step[] = [
    ...steps(['receive', 'ok', 32], ['extract', 'ok', 33]),
    { stepId: 'ask-approval', outcome: 'held', summary: 'held said', occurredAt: at(34), heldReason: 'Document 1: needs a look.' },
  ];
  const stepFour = (decision: ReturnType<typeof heldDecision>) =>
    toTracker(reported, V3.pipeline, V3.groups, { status: 'held' }, clock, V3.pipeline, { decision })[3]!;

  it.each<[Approval['status'], string]>([
    ['pending', 'Waiting for approval: Document 1: needs a look.'],
    // Decided while the job still reads held: it waits on, as the website says — never "Approved".
    ['approved', 'Waiting for approval: Document 1: needs a look.'],
    // Ran out: never "No longer awaiting approval" on the step.
    ['expired', 'Waiting for approval: Document 1: needs a look.'],
    ['rejected', 'Denied'],
  ])('a held job whose approval is %s: step 4 says "%s"', (status, words) => {
    const row = stepFour(heldDecision(held, [approval(status)]));
    expect([row.title, row.state, row.sub]).toEqual(['4 · Done', 'held', words]);
  });

  it('the fallback rows (a run of another version) say "Denied" too, and why it waits until then', () => {
    const fallback = (decision: ReturnType<typeof heldDecision>) =>
      toTracker(reported, undefined, undefined, { status: 'held' }, clock, V3.pipeline, { decision }).at(-1)!;
    expect(fallback('rejected')).toMatchObject({ state: 'held', sub: 'Denied' });
    expect(fallback('closed')).toMatchObject({ state: 'held', sub: 'Waiting for approval: Document 1: needs a look.' });
  });

  it('of two approvals asked at the same moment, the first listed decides: pending, so step 4 waits with its buttons', () => {
    const same = at(30);
    const approvals = [approval('pending', same), approval('rejected', same)];
    expect(jobApproval(held, approvals)?.status).toBe('pending');
    expect(heldDecision(held, approvals)).toBe('pending');
    expect(stepFour(heldDecision(held, approvals)).sub).toBe('Waiting for approval: Document 1: needs a look.');
    // A later one still wins.
    expect(heldDecision(held, [approval('pending', same), approval('rejected', at(31))])).toBe('rejected');
  });

  it("a held run whose blocks hold no approval form yet is read again, at most 10 times; one whose form came, or that is not held, never (round 25, the review's R5c 1; backend ADR-0048; the website's rereadForApprovalForm)", () => {
    expect(HELD_APPROVAL_REREADS).toBe(10);
    const form = { type: 'questions', form: { kind: 'approval', approvalId: 'ap-1', eligibleRoles: ['owner'] } };
    // No form yet — it turned held while the page was open, or its approval was not asked yet — read again, up to the bound.
    for (const blocks of [undefined, [], [{ type: 'text', text: 'Waiting for approval.' }], [{ type: 'questions', form: { kind: 'run' } }]]) {
      for (let reads = 0; reads < 10; reads += 1) expect(rereadForApproval(held, blocks, reads)).toBe(true);
      expect(rereadForApproval(held, blocks, 10)).toBe(false);
      expect(rereadForApproval(held, blocks, 11)).toBe(false);
    }
    // The form came: no more reads for it.
    expect(rereadForApproval(held, [{ type: 'text', text: 'Waiting for approval.' }, form], 0)).toBe(false);
    expect(hasApprovalForm([form])).toBe(true);
    expect(hasApprovalForm([null, 7, { type: 'questions' }])).toBe(false);
    // Not held: never.
    for (const status of ['pending', 'running', 'succeeded', 'failed', 'cancelled'] as const) {
      expect(rereadForApproval({ ...held, status }, [], 0)).toBe(false);
    }
  });

  it("a step state's look; one this build does not know has the \"unknown\" look (a timeline block's, backend ADR-0048 decision 10)", () => {
    expect(trackerLook('done')).toMatchObject({ state: 'done', tone: 'ok' });
    expect(trackerLook('held')).toMatchObject({ state: 'held', tone: 'warn' });
    expect(trackerLook('teleported')).toEqual(trackerLook('unknown'));
    expect(trackerLook(undefined)).toMatchObject({ state: 'unknown', tone: 'muted' });
  });
});

describe('a run is named by its full id (spec A8; the owner\'s D4, AM2)', () => {
  it('runLabel carries the whole id (~~and the JSON file name~~: no Download JSON since round 24, P12)', () => {
    const id = '793eef82-102d-81be-a2d3-9e8d4e2b2c36';
    expect(runLabel({ id })).toBe(`Run ${id}`);
  });
});
