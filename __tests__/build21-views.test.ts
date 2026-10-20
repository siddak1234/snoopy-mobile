import type { RunDocument } from '@/lib/platform/runs';
import {
  documentDate,
  documentMoney,
  documentTime,
  documentsFileName,
  formatFor,
  formatLabel,
  toDocumentCard,
  toDocumentCards,
} from '@/lib/view/documents';
import { groupState, runLabel, stepStates, toRunStats, toTracker, type TrackerState } from '@/lib/view/runs';
import { invoiceProcessingEntry, invoiceProcessingV3Entry } from '@/test/platform';

/**
 * Build 21's view rules, each a table (spec A7, A8, A9; the session's S14):
 * the tracker's state for every step and group, from shared fixtures — run
 * 793eef82 as it ran, a v3 run of three receipts, a held run, a
 * continuation, a failed run — and the document card. ~~Home's quick runs~~
 * until Build 22 (the owner's build 21 item 1: "Remove run a flow section").
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

describe('a run is named by its full id (spec A8; the owner\'s D4, AM2)', () => {
  it('runLabel and the JSON file name carry the whole id', () => {
    const id = '793eef82-102d-81be-a2d3-9e8d4e2b2c36';
    expect(runLabel({ id })).toBe(`Run ${id}`);
    expect(documentsFileName(id)).toBe(`run-${id}.json`);
  });
});

/** A receipt as v3 writes it (spec §1.1, AM7). */
function doc(overrides: Partial<RunDocument> = {}): RunDocument {
  return {
    index: 1,
    status: 'recorded',
    statusText: 'Recorded in QuickBooks: expense',
    type: 'receipt',
    vendor: { name: "Lowe's", address: '2150 W Shaw Ave', city: 'Fresno, CA 93711', storeNumber: '1234' },
    number: '48291',
    numberLabel: null,
    references: [],
    date: '2026-10-14',
    time: '14:32',
    currency: 'USD',
    lineItems: [{ description: '2X4-8 STUD', quantity: '4', unitPrice: '3.98', amount: '15.92' }],
    lineItemsComplete: true,
    subtotal: '15.92',
    tax: '1.27',
    tip: null,
    discount: null,
    total: '17.19',
    payment: { method: 'card', cardLast4: '4417' },
    recordedIn: { providerId: 'quickbooks', recordType: 'expense', recordId: '1452' },
    details: [{ label: 'Category', value: 'Materials' }],
    ...overrides,
  };
}

describe("a document's card (spec A7; the owner's ~04:05Z and AM7)", () => {
  it('money is the decimal string as printed, never rounded or a float', () => {
    expect(
      [
        ['17.19', 'USD'],
        ['3.5', null],
        ['3.459', 'USD'],
        ['-4.00', 'USD'],
        ['1234567.5', 'USD'],
        ['1234.5', 'CAD'],
        ['0', 'EUR'],
        ['17.19.1', 'USD'],
        [null, 'USD'],
      ].map(([value, currency]) => documentMoney(value, currency)),
    ).toEqual(['$17.19', '$3.50', '$3.459', '−$4.00', '$1,234,567.50', '1,234.5 CAD', '0 EUR', null, null]);
  });

  it('the date and time as printed, with no zone: never a day off', () => {
    expect([documentDate('2026-10-14'), documentDate('2026-13-01'), documentDate(null)]).toEqual(['Oct 14, 2026', null, null]);
    expect([documentTime('14:32'), documentTime('00:05'), documentTime('12:00'), documentTime('25:00')]).toEqual([
      '2:32 PM',
      '12:05 AM',
      '12:00 PM',
      null,
    ]);
  });

  it('its numbers: its own under the label printed beside it, else "No.", then every other identifier by its label', () => {
    expect(toDocumentCard(doc(), 1).ids).toEqual([{ label: 'No.', value: '48291' }]);
    expect(
      toDocumentCard(
        doc({ numberLabel: 'Invoice #', references: [{ label: 'PO number', value: 'PO-55' }, { label: 'Register', value: '07' }] }),
        1,
      ).ids,
    ).toEqual([
      { label: 'Invoice #', value: '48291' },
      { label: 'PO number', value: 'PO-55' },
      { label: 'Register', value: '07' },
    ]);
    expect(toDocumentCard(doc({ number: null, numberLabel: null }), 1).ids).toEqual([]);
  });

  it('every line: its description, its amount, and "{quantity} × {unit price}" only when both were printed', () => {
    const card = toDocumentCard(
      doc({
        lineItems: [
          { description: '2X4-8 STUD', quantity: '4', unitPrice: '3.98', amount: '15.92' },
          { description: 'Bag', quantity: null, unitPrice: '0.10', amount: '0.10' },
          { description: null, quantity: '1', unitPrice: null, amount: null },
        ],
        lineItemsComplete: false,
      }),
      2,
    );
    expect(card.lines).toEqual([
      { description: '2X4-8 STUD', amount: '$15.92', each: '4 × $3.98' },
      { description: 'Bag', amount: '$0.10', each: null },
      { description: '—', amount: null, each: null },
    ]);
    expect(card.moreLines).toBe(true);
    expect(card.heading).toBe('Invoice 1 of 2');
  });

  it('the rows: totals, the discount as taken off, how it was paid, the result, then the automation\'s own lines', () => {
    const card = toDocumentCard(doc({ tip: '2.00', discount: '0.50', payment: { method: 'card', cardLast4: '4417' } }), 1);
    expect(card.rows).toEqual([
      { label: 'Subtotal', value: '$15.92' },
      { label: 'Tax', value: '$1.27' },
      { label: 'Tip', value: '$2.00' },
      { label: 'Discount', value: '−$0.50' },
      { label: 'Total', value: '$17.19', strong: true },
      { label: 'Paid', value: 'Card ending 4417' },
      { label: 'Result', value: 'Recorded in QuickBooks: expense' },
      { label: 'Category', value: 'Materials' },
    ]);
    expect(toDocumentCard(doc({ payment: { method: 'not_shown', cardLast4: null } }), 1).rows.some((row) => row.label === 'Paid')).toBe(false);
    expect(toDocumentCard(doc({ payment: { method: 'bank_transfer', cardLast4: null } }), 1).rows).toContainEqual({ label: 'Paid', value: 'Bank transfer' });
  });

  it.each([
    ['recorded', null, 'Recorded', 'ok'],
    ['saved', null, 'Saved', 'ok'],
    ['compared', null, 'Compared', 'ok'],
    ['not_recorded', null, 'Not recorded', 'warn'],
    ['unconfirmed', null, 'Not confirmed', 'warn'],
    ['waiting', null, 'Waiting', 'warn'],
    ['waiting', 'rejected', 'Not approved', 'muted'],
    ['waiting', 'expired', 'Not approved', 'muted'],
  ] as const)('a %s document (approval %s) reads %s', (status, approval, chip, tone) => {
    expect(toDocumentCard(doc({ status }), 1, approval)).toMatchObject({ chip, tone });
  });

  it('every type in words, the seller beside it, its place by the parts printed', () => {
    const types = ['bill', 'invoice', 'receipt', 'credit_note', 'statement', 'bank_statement', 'quote', 'purchase_order', 'other'] as const;
    expect(types.map((type) => toDocumentCard(doc({ type, vendor: { name: null, address: null, city: null, storeNumber: null } }), 1).title)).toEqual([
      'Bill',
      'Invoice',
      'Receipt',
      'Credit note',
      'Statement',
      'Bank statement',
      'Quote',
      'Purchase order',
      'Document',
    ]);
    expect(toDocumentCard(doc(), 1).location).toBe('2150 W Shaw Ave, Fresno, CA 93711 · Store 1234');
    expect(toDocumentCard(doc({ vendor: { name: 'X', address: null, city: 'Oakland, CA', storeNumber: null } }), 1).location).toBe('Oakland, CA');
  });

  it('cards come in the file\'s order, each "Invoice i of n" (round 24 P10; ~~Document i of n~~)', () => {
    const cards = toDocumentCards([doc({ index: 3 }), doc({ index: 1 }), doc({ index: 2 })]);
    expect(cards.map((card) => card.heading)).toEqual(['Invoice 1 of 3', 'Invoice 2 of 3', 'Invoice 3 of 3']);
    expect(toDocumentCards(undefined)).toEqual([]);
  });

  it('closed, a card says {vendor} · {total} (S9); without a seller its type, without a total the name alone', () => {
    expect(toDocumentCard(doc(), 1).summary).toBe("Lowe's · $17.19");
    expect(toDocumentCard(doc({ type: 'bill', vendor: { name: null, address: null, city: null, storeNumber: null } }), 1).summary).toBe('Bill · $17.19');
    expect(toDocumentCard(doc({ total: null }), 1).summary).toBe("Lowe's");
  });

  it('opens with Document type and Format: the file its source names, else the job\'s only file, else no Format row', () => {
    const pdf = { id: '11111111-1111-4111-8111-111111111111', filename: 'scan.pdf', contentType: 'application/pdf', format: 'PDF', sizeBytes: 1000, pages: 2 };
    const png = { id: '22222222-2222-4222-8222-222222222222', filename: 'photo.png', contentType: 'image/png', format: 'PNG', sizeBytes: 900, pages: 1 };
    expect(toDocumentCard(doc({ source: { file: png.id } }), 1, null, [pdf, png]).kind).toEqual([
      { label: 'Document type', value: 'Receipt' },
      { label: 'Format', value: 'PNG' },
    ]);
    expect(toDocumentCard(doc(), 1, null, [pdf]).kind).toEqual([
      { label: 'Document type', value: 'Receipt' },
      { label: 'Format', value: 'PDF' },
    ]);
    // Two files and no source: which is not known, so no Format row; none listed, none either.
    expect(toDocumentCard(doc(), 1, null, [pdf, png]).kind).toEqual([{ label: 'Document type', value: 'Receipt' }]);
    expect(toDocumentCard(doc(), 1).kind).toEqual([{ label: 'Document type', value: 'Receipt' }]);
    // A file listed without its format: read from its content type.
    expect(formatFor(doc(), [{ ...pdf, format: '' }])).toBe('PDF');
  });

  it.each([
    ['application/pdf', 'PDF'],
    ['image/jpeg', 'JPEG'],
    ['image/jpg', 'JPEG'],
    ['image/png', 'PNG'],
    ['image/heic', 'HEIC'],
    ['image/heif', 'HEIC'],
    ['image/tiff; charset=binary', 'TIFF'],
  ])('formatLabel(%s) is %s', (contentType, label) => {
    expect(formatLabel(contentType)).toBe(label);
  });
});
