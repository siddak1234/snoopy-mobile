import { titleRowLevel } from '@/components/title-row';
import { addProblem, isFlowEmail, recipientsLine } from '@/lib/view/flow-email';
import { flowStepPlan, stepTitle } from '@/lib/view/pipeline';
import { toRunStats, toTracker } from '@/lib/view/runs';
import { invoiceProcessingEntry, invoiceProcessingV3Entry, invoiceProcessingV4Entry, recipientsPayload } from '@/test/platform';

/**
 * Build 22's view rules (Round 17, 2026-10-17; spec §4), each a table: the flow
 * page's five steps from a v4 manifest by their kinds (the owner's build 21
 * items 5–7; backend ADR-0041), a title by connection (the session's D3,
 * approved by the owner), who gets the email and the Add checks (P5; the
 * session's S22, S30), the run page's setting and email steps (S23, S24, S25),
 * and when the title row is too narrow (S26).
 */

const V4 = invoiceProcessingV4Entry();
const clock = (iso: string) => iso.slice(11, 16);
const at = (minute: number) => new Date(Date.UTC(2026, 9, 17, 14, minute)).toISOString();
type Step = { stepId: string; outcome: 'ok' | 'held' | 'failed'; summary: string; occurredAt: string; heldReason?: string };
const reported = (...ids: [string, Step['outcome']?][]): Step[] =>
  ids.map(([stepId, outcome], minute) => ({ stepId, outcome: outcome ?? 'ok', summary: `${stepId} said this`, occurredAt: at(minute) }));
const flow = (vendor: string) => ({
  setup: V4.setup!,
  config: { vendor, holdAboveAmount: 750 },
  providerName: (id: string) => (id === 'quickbooks' ? 'QuickBooks Online' : id),
});
const rows = (tracker: ReturnType<typeof toTracker>) => tracker.map((row) => [row.title, row.state, row.sub]);

describe('the flow page\'s steps (P1; spec §4\'s generic rules)', () => {
  it('v4 with QuickBooks: five rows, titles only, each its kind — the input in Upload, the vendor in Connect integration, nothing in 3 and 4', () => {
    expect(flowStepPlan(V4.pipeline, V4.groups, V4.setup!, { vendor: 'quickbooks' }).map((row) => [row.label, row.kind, row.input, row.fields])).toEqual([
      ['1 · Upload invoice', 'steps', true, []],
      ['2 · Connect integration', 'setting', false, ['vendor']],
      ['3 · AI processing', 'steps', false, []],
      ['4 · QuickBooks updated', 'steps', false, []],
      ['5 · Email sent', 'email', false, []],
    ]);
  });

  it('v4 with None — and with nothing saved, the field\'s default — step 4 is Details saved', () => {
    for (const config of [{ vendor: 'none' }, {}]) {
      expect(flowStepPlan(V4.pipeline, V4.groups, V4.setup!, config)[3]!.label).toBe('4 · Details saved');
    }
  });

  it('a platform step this build does not know is its title only; a setup field with no step is drawn nowhere', () => {
    const groups = [...V4.groups!.slice(0, 4), { id: 'fax', title: 'Faxed', description: 'Sent by fax.', platform: 'fax' }];
    const plan = flowStepPlan(V4.pipeline, groups, V4.setup!, {});
    expect(plan[4]).toEqual({ id: 'fax', label: '5 · Faxed', kind: 'platform', input: false, fields: [] });
    // The Approval limit names no step: no row holds it.
    expect(plan.flatMap((row) => row.fields)).toEqual(['vendor']);
  });

  it('v3 (every group has steps) holds no setting row; v2 has no field in any row; without groups, each step its row and the first the input', () => {
    const v3 = invoiceProcessingV3Entry();
    expect(flowStepPlan(v3.pipeline, v3.groups, v3.setup!, {}).map((row) => [row.label, row.kind])).toEqual([
      ['1 · Received', 'steps'],
      ['2 · Read', 'steps'],
      ['3 · Checked', 'steps'],
      ['4 · Done', 'steps'],
    ]);
    const v2 = invoiceProcessingEntry();
    expect(flowStepPlan(v2.pipeline, v2.groups, v2.setup!, {}).flatMap((row) => row.fields)).toEqual([]);
    expect(flowStepPlan(v2.pipeline.slice(0, 2), undefined, [], {})).toEqual([
      { id: 'receive', label: '1 · Document received', kind: 'steps', input: true, fields: [] },
      { id: 'read-company', label: '2 · QuickBooks checked', kind: 'steps', input: false, fields: [] },
    ]);
    expect(flowStepPlan(undefined, [], [], {})).toEqual([]);
  });

  it('a title by connection: the provider chosen, else the step\'s own title — and its own title when the settings are unknown', () => {
    const record = V4.groups![3]!;
    expect(stepTitle(record, V4.setup!, { vendor: 'quickbooks' })).toBe('QuickBooks updated');
    expect(stepTitle(record, V4.setup!, { vendor: 'xero' })).toBe('Details saved');
    expect(stepTitle(record, V4.setup!, { vendor: 'none' })).toBe('Details saved');
    expect(stepTitle(record, V4.setup!, undefined)).toBe('Details saved');
    expect(stepTitle(V4.groups![0]!, V4.setup!, { vendor: 'quickbooks' })).toBe('Upload invoice');
  });
});

describe('who gets the email (P5; S22, S30)', () => {
  it('step 5 says the first address — owners, then admins, then the extra ones — and how many more', () => {
    expect(recipientsLine(recipientsPayload())).toEqual({ first: 'owner@example.com', more: 'and 2 more' });
    expect(recipientsLine(recipientsPayload({ people: [{ email: 'owner@example.com', role: 'owner' }], extra: [] }))).toEqual({
      first: 'owner@example.com',
      more: null,
    });
    // Nobody listed: the one who always gets it.
    expect(recipientsLine(recipientsPayload({ people: [], extra: [] }))).toEqual({ first: 'The person who starts the run', more: null });
    expect(recipientsLine(recipientsPayload({ people: [], extra: ['ap@example.com'] }))).toEqual({ first: 'ap@example.com', more: null });
  });

  it.each([
    ['bookkeeper@example.com', null],
    ['  bookkeeper@example.com  ', null],
    ['Owner@Example.com', 'duplicate'],
    ['AP@EXAMPLE.COM', 'duplicate'],
    ['', 'invalid'],
    ['bookkeeper', 'invalid'],
    ['a b@example.com', 'invalid'],
    ['bookkeeper@example', 'invalid'],
    ['two@@example.com', 'invalid'],
    ['<x>@example.com', 'invalid'],
    [`${'a'.repeat(65)}@example.com`, 'invalid'],
  ])('Add %j → %s', (address, problem) => {
    expect(addProblem(address, recipientsPayload())).toBe(problem);
  });

  it('an address is 3 to 254 characters', () => {
    expect(isFlowEmail('a@b.co')).toBe(true);
    expect(isFlowEmail(`a@${`${'b'.repeat(60)}.`.repeat(5)}com`)).toBe(false);
  });
});

describe("the run page's steps (S23, S24, S25)", () => {
  it('a v4 run running: 1 Done, 2 the integration, 3 Working…, 4 and 5 Waiting — Steps done 2 / 5', () => {
    const tracker = toTracker(reported(['receive'], ['extract']), V4.pipeline, V4.groups, { status: 'running' }, clock, V4.pipeline, {
      flow: flow('quickbooks'),
      email: { status: 'waiting', sentAt: null },
    });
    expect(rows(tracker)).toEqual([
      ['1 · Upload invoice', 'done', 'Done · 14:00'],
      ['2 · Connect integration', 'done', 'QuickBooks Online'],
      ['3 · AI processing', 'working', 'Working…'],
      ['4 · QuickBooks updated', 'waiting', 'Waiting'],
      ['5 · Email sent', 'waiting', 'Waiting'],
    ]);
    expect(toRunStats(tracker, '4s')[1]).toEqual({ value: '2 / 5', label: 'Steps done' });
  });

  it('None: step 2 says None and step 4 is Details saved; a flow not read says Done and its own title', () => {
    const none = toTracker(reported(['receive']), V4.pipeline, V4.groups, { status: 'running' }, clock, V4.pipeline, { flow: flow('none') });
    expect(rows(none).slice(1, 4).map(([title, , sub]) => [title, sub])).toEqual([
      ['2 · Connect integration', 'None'],
      ['3 · AI processing', 'Working…'],
      ['4 · Details saved', 'Waiting'],
    ]);
    const unread = toTracker(reported(['receive']), V4.pipeline, V4.groups, { status: 'running' }, clock, V4.pipeline);
    expect(rows(unread)[1]).toEqual(['2 · Connect integration', 'done', 'Done']);
  });

  // Round 23, A7: step 5 is "Run completed" — done only once the run succeeded,
  // its line the email's; Waiting while the run goes on or is held; Failed with it.
  it.each([
    ['succeeded', { status: 'waiting', sentAt: null }, ['done', 'Sending email…'], '5 / 5'],
    ['succeeded', undefined, ['done', 'Sending email…'], '5 / 5'],
    ['succeeded', { status: 'sent', sentAt: at(34) }, ['done', 'Email sent · 14:34'], '5 / 5'],
    ['succeeded', { status: 'sent', sentAt: null }, ['done', 'Done'], '5 / 5'],
    ['succeeded', { status: 'not_sent', sentAt: null }, ['done', 'Done'], '5 / 5'],
    ['failed', { status: 'sent', sentAt: at(34) }, ['failed', 'Failed'], '2 / 5'],
    ['cancelled', { status: 'not_sent', sentAt: null }, ['stopped', 'Stopped'], null],
    ['pending', { status: 'waiting', sentAt: null }, ['waiting', 'Waiting'], null],
    ['running', { status: 'sent', sentAt: at(34) }, ['waiting', 'Waiting'], null],
  ] as const)('a run %s, its email %j: step 5 %j', (status, email, [state, sub], done) => {
    const all = V4.pipeline.map((step) => [step.id] as [string]);
    const steps = status === 'succeeded' ? reported(...all) : reported(['receive']);
    const tracker = toTracker(steps, V4.pipeline, V4.groups, { status }, clock, V4.pipeline, { flow: flow('quickbooks'), email });
    expect(tracker[4]).toMatchObject({ title: '5 · Email sent', state, sub });
    if (done) expect(toRunStats(tracker, '1m')[1]!.value).toBe(done);
  });

  it('held: step 4 waits for approval and why; step 5 waits too, whatever its email says (an approval email never checks it off)', () => {
    const steps = reported(['receive'], ['extract'], ['decide'], ['ask-approval', 'held']);
    steps[3]!.heldReason = 'Over $500';
    const tracker = toTracker(steps, V4.pipeline, V4.groups, { status: 'held' }, clock, V4.pipeline, {
      flow: flow('quickbooks'),
      email: { status: 'sent', sentAt: at(9) },
    });
    expect(rows(tracker).slice(3)).toEqual([
      ['4 · QuickBooks updated', 'held', 'Waiting for approval: Over $500'],
      ['5 · Email sent', 'waiting', 'Waiting'],
    ]);
    expect(toRunStats(tracker, '1m')[1]!.value).not.toBe('5 / 5');
  });

  it('step 5 follows the run whatever its group is titled ("Run completed" in v5)', () => {
    const groups = V4.groups!.map((group) => (group.platform === 'email' ? { ...group, title: 'Run completed' } : group));
    const all = V4.pipeline.map((step) => [step.id] as [string]);
    const tracker = toTracker(reported(...all), V4.pipeline, groups, { status: 'succeeded' }, clock, V4.pipeline, {
      flow: flow('quickbooks'),
      email: { status: 'sent', sentAt: at(34) },
    });
    expect(rows(tracker)[4]).toEqual(['5 · Run completed', 'done', 'Email sent · 14:34']);
  });

  it("a v3 run (v3's step ids, all still declared) is drawn by v4's five steps; a v2 run by what it reported", () => {
    const v3Run = toTracker(reported(['receive'], ['extract'], ['check-documents']), V4.pipeline, V4.groups, { status: 'running' }, clock, V4.pipeline, {
      flow: flow('none'),
    });
    expect(v3Run.map((row) => row.title)).toEqual([
      '1 · Upload invoice',
      '2 · Connect integration',
      '3 · AI processing',
      '4 · Details saved',
      '5 · Email sent',
    ]);
    const v2Run = toTracker(reported(['receive'], ['check-document']), V4.pipeline, V4.groups, { status: 'succeeded' }, clock, V4.pipeline);
    expect(v2Run.map((row) => row.title)).toEqual(['1 · Document received', '2 · Step 2']);
  });

  it('a platform step this build does not know: its title, no state, no line — and not counted', () => {
    const groups = [...V4.groups!.slice(0, 4), { id: 'fax', title: 'Faxed', description: 'Sent by fax.', platform: 'fax' }];
    const tracker = toTracker(reported(['receive']), V4.pipeline, groups, { status: 'running' }, clock, V4.pipeline, { flow: flow('none') });
    expect(tracker[4]).toMatchObject({ title: '5 · Faxed', state: 'unknown', sub: '' });
    expect(toRunStats(tracker, '1s')[1]!.value).toBe('2 / 4');
  });
});

describe('the title row draws its controls as wide as it has room for (S26; the Build 22 review\'s M11)', () => {
  // Measured with Inter's own widths at the app's sizes: "Flows" 79, "Activity" 102 (display, 29);
  // Archived + New 196 as pills, 124 with Archived a circle, 84 with both circles; All time 118, its circle 38.
  it.each([
    // Flows on the owner's 420-pt phone (380 inside the margins): every word.
    [380, 79, [196], 2, 0],
    // A 375-pt phone (335): Archived goes to its icon; New keeps its word.
    [335, 79, [196], 2, 1],
    [335, 79, [196, 124], 2, 1],
    // A 320-pt phone (280): New goes to its icon too — 79 + 8 + 84 + 8 + 84 = 263.
    [280, 79, [196, 124], 2, 2],
    [280, 79, [196, 124, 84], 2, 2],
    // The boundaries: room is the row less the title, 8, the circles (84) and 8.
    [375, 79, [196], 2, 0],
    [374, 79, [196], 2, 1],
    [303, 79, [196, 124], 2, 1],
    [302, 79, [196, 124], 2, 2],
    // Wider again: the words again, from the widths kept.
    [380, 79, [196, 124, 84], 2, 0],
    // Activity: All time at 335; its calendar alone at 280 (102 + 8 + 84 + 8 + 38 = 240).
    [335, 102, [118], 1, 0],
    [280, 102, [118], 1, 1],
    [280, 102, [118, 38], 1, 1],
    // Not laid out yet: the full form.
    [null, 79, [196], 2, 0],
    [335, null, [196], 2, 0],
    [335, 79, [], 2, 0],
  ] as const)('row %s, title %s, controls %j, levels %s → level %s', (row, title, widths, levels, level) => {
    expect(titleRowLevel(row, title, widths, levels)).toBe(level);
  });
});
