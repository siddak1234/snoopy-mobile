import { contractStep, fillForDisplay, todayUtc } from '@/lib/view/health-agreement';
import { batchRows, batchStepsFor, toTracker } from '@/lib/view/runs';

/**
 * Builds 37 and 39, wave 2 — the shared tables. The website's
 * `snoopy/test/fb39-wave2.test.mjs` holds the SAME rows (plan decisions 1, 2, 8):
 * item 9's "Contract and accept" state (`contractStep`) and its display fill
 * (`fillForDisplay`), and item 10's batch run steps by name (`batchRows`).
 */

const CURRENT = { version: 1, sha256: 'a'.repeat(64) };
const ACCEPTANCE = {
  id: '00000000-0000-4000-8000-0000000000d1',
  kind: 'health-data' as const,
  version: 1,
  signerName: 'Dana Reyes',
  signerTitle: 'Practice manager',
  acceptedAt: '2026-11-04T12:00:00Z',
};
const TEXT = { version: 1, text: 'The agreement.', sha256: 'a'.repeat(64) };
const read = (current: typeof CURRENT | null, acceptance: typeof ACCEPTANCE | null) => ({
  kind: 'health-data' as const,
  current,
  acceptance,
});

describe('contractStep: every state, in its precedence', () => {
  it.each([
    ['not a health flow (owner)', { role: 'owner', healthData: undefined, read: undefined, text: undefined, readFailed: false }, 'hidden'],
    ['not a health flow, even with a failed read', { role: 'owner', healthData: false, read: undefined, text: undefined, readFailed: true }, 'hidden'],
    ['a member (never read)', { role: 'member', healthData: true, read: undefined, text: undefined, readFailed: false }, 'ask-owner'],
    ['an admin, not accepted', { role: 'admin', healthData: true, read: read(CURRENT, null), text: undefined, readFailed: false }, 'ask-owner'],
    ['an admin, accepted', { role: 'admin', healthData: true, read: read(CURRENT, ACCEPTANCE), text: undefined, readFailed: false }, 'accepted'],
    ['an admin, nothing published', { role: 'admin', healthData: true, read: read(null, null), text: undefined, readFailed: false }, 'finalizing'],
    ['an admin, the read failed', { role: 'admin', healthData: true, read: undefined, text: undefined, readFailed: true }, 'unavailable'],
    ['the owner, nothing published', { role: 'owner', healthData: true, read: read(null, null), text: undefined, readFailed: false }, 'finalizing'],
    ['the owner, the text 503', { role: 'owner', healthData: true, read: read(CURRENT, null), text: 'unpublished', readFailed: false }, 'finalizing'],
    ['the owner, accepted', { role: 'owner', healthData: true, read: read(CURRENT, ACCEPTANCE), text: undefined, readFailed: false }, 'accepted'],
    ['the owner, not accepted, the text read', { role: 'owner', healthData: true, read: read(CURRENT, null), text: TEXT, readFailed: false }, 'sign'],
    ['the owner, the read failed', { role: 'owner', healthData: true, read: undefined, text: undefined, readFailed: true }, 'unavailable'],
    ['the owner, the text failed (not 503)', { role: 'owner', healthData: true, read: read(CURRENT, null), text: undefined, readFailed: true }, 'unavailable'],
    ['precedence: a failed read over an acceptance', { role: 'owner', healthData: true, read: read(CURRENT, ACCEPTANCE), text: undefined, readFailed: true }, 'unavailable'],
    ['precedence: finalizing over an acceptance', { role: 'owner', healthData: true, read: read(null, ACCEPTANCE), text: undefined, readFailed: false }, 'finalizing'],
    ['precedence: accepted over sign', { role: 'owner', healthData: true, read: read(CURRENT, ACCEPTANCE), text: TEXT, readFailed: false }, 'accepted'],
  ] as const)('%s → %s', (_case, input, state) => {
    expect(contractStep(input)).toBe(state);
  });
});

describe('fillForDisplay: the two placeholders, for display only', () => {
  it.each([
    ['both', 'Between {Covered Entity} and Autom8x, from {Effective date}.', 'Between Acme Clinic and Autom8x, from 2026-11-06.'],
    ['repeated', '{Covered Entity} agrees. {Covered Entity} signs on {Effective date}; {Effective date}.', 'Acme Clinic agrees. Acme Clinic signs on 2026-11-06; 2026-11-06.'],
    ['none', 'No placeholders here.', 'No placeholders here.'],
  ])('%s', (_case, text, filled) => {
    expect(fillForDisplay(text, 'Acme Clinic', '2026-11-06')).toBe(filled);
  });

  it("today is the UTC day, as the platform's signed copy writes it", () => {
    expect(todayUtc(new Date('2026-11-06T23:30:00-05:00'))).toBe('2026-11-07');
  });
});

// ICD-10 Code Check v4, as the catalog publishes it (backend ADR-0048 amendment 6).
const BATCH = [
  { id: 'chunk', title: 'Pages counted', description: 'd', group: 'upload' },
  { id: 'categorize', title: 'Pages sorted', description: 'd', group: 'upload' },
  { id: 'organize', title: 'Visits found', description: 'd', group: 'upload' },
  { id: 'queue', title: 'Visits queued', description: 'd', group: 'upload' },
];
const GROUPS = [
  { id: 'upload', title: 'Add visit notes' },
  { id: 'read', title: 'AI reading' },
  { id: 'check', title: 'Code check' },
  { id: 'approve', title: 'Your review' },
  { id: 'email', title: 'Run completed', platform: 'email' as const },
];
const VISIT = [
  { id: 'receive-visit', title: 'Visit received', group: 'upload' },
  { id: 'read-visit', title: 'Visit read', group: 'read' },
  { id: 'check-codes', title: 'Codes checked', group: 'check' },
  { id: 'save-visit', title: 'Saved', group: 'approve' },
];
const ENTRY = { pipeline: VISIT, groups: GROUPS, batch: { pipeline: BATCH } };
const clock = (iso: string) => iso.slice(11, 16);
const ok = (stepId: string, minute: number) => ({
  stepId,
  outcome: 'ok' as const,
  summary: 's',
  occurredAt: `2026-11-06T10:0${minute}:00Z`,
});
const view = (rows: { title: string; state: string; sub: string }[]) => rows.map(({ title, state, sub }) => [title, state, sub]);

describe('batchRows: a batch run by its batch steps, by name', () => {
  it('running after chunk: 1 done, 2 working, 3–4 waiting', () => {
    expect(view(batchRows([ok('chunk', 1)], BATCH, GROUPS, { status: 'running' }, clock))).toEqual([
      ['1 · Pages counted', 'done', 'Done · 10:01'],
      ['2 · Pages sorted', 'working', 'Working…'],
      ['3 · Visits found', 'waiting', 'Waiting'],
      ['4 · Visits queued', 'waiting', 'Waiting'],
    ]);
  });

  it('succeeded, the email sent: four done, then "5 · Run completed"', () => {
    const steps = [ok('chunk', 1), ok('categorize', 2), ok('organize', 3), ok('queue', 4)];
    const email = { status: 'sent' as const, sentAt: '2026-11-06T10:05:00Z' };
    expect(view(batchRows(steps, BATCH, GROUPS, { status: 'succeeded' }, clock, { email }))).toEqual([
      ['1 · Pages counted', 'done', 'Done · 10:01'],
      ['2 · Pages sorted', 'done', 'Done · 10:02'],
      ['3 · Visits found', 'done', 'Done · 10:03'],
      ['4 · Visits queued', 'done', 'Done · 10:04'],
      ['5 · Run completed', 'done', 'Email sent · 10:05'],
    ]);
  });

  it('succeeded, no email from the platform: the four rows only', () => {
    const steps = [ok('chunk', 1), ok('categorize', 2), ok('organize', 3), ok('queue', 4)];
    expect(batchRows(steps, BATCH, GROUPS, { status: 'succeeded' }, clock).map((row) => row.title)).toEqual([
      '1 · Pages counted',
      '2 · Pages sorted',
      '3 · Visits found',
      '4 · Visits queued',
    ]);
  });

  it('failed at organize: its reason there, the rest stopped', () => {
    const steps = [ok('chunk', 1), ok('categorize', 2), { ...ok('organize', 3), outcome: 'failed' as const }];
    expect(view(batchRows(steps, BATCH, GROUPS, { status: 'failed', failureReason: 'No visits found.' }, clock))).toEqual([
      ['1 · Pages counted', 'done', 'Done · 10:01'],
      ['2 · Pages sorted', 'done', 'Done · 10:02'],
      ['3 · Visits found', 'failed', 'No visits found.'],
      ['4 · Visits queued', 'stopped', 'Stopped'],
    ]);
  });

  it('a step the batch does not declare: the steps reported, titled from it, and no email row', () => {
    const steps = [ok('chunk', 1), ok('split-pages', 2)];
    const email = { status: 'sent' as const, sentAt: '2026-11-06T10:05:00Z' };
    expect(view(batchRows(steps, BATCH, GROUPS, { status: 'succeeded' }, clock, { email }))).toEqual([
      ['1 · Pages counted', 'done', 'Done · 10:01'],
      ['2 · Step 2', 'done', 'Done · 10:02'],
    ]);
  });
});

describe('batchStepsFor: which runs are drawn by their batch steps', () => {
  it.each([
    ['a batch parent of a flow with batch', { batch: true }, ENTRY, BATCH],
    ['a batch child (a visit), or any run without `batch`', {}, ENTRY, undefined],
    ['a batch parent of a flow without batch', { batch: true }, { ...ENTRY, batch: undefined }, undefined],
  ] as const)('%s', (_case, run, entry, steps) => {
    expect(batchStepsFor(run, entry)).toBe(steps);
  });

  it("a child and a flow without batch keep today's group rows", () => {
    const rows = toTracker([ok('receive-visit', 1)], VISIT, GROUPS, { status: 'running' }, clock);
    expect(rows.map((row) => row.title)).toEqual([
      '1 · Add visit notes',
      '2 · AI reading',
      '3 · Code check',
      '4 · Your review',
      '5 · Run completed',
    ]);
  });
});
