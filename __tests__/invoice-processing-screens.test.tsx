import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import RunDetailScreen from '@/app/(tabs)/(home)/run';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import SetupScreen from '@/app/(tabs)/flows/setup';
import type { Subscription } from '@/lib/platform/automations';
import { readProjects, type Project } from '@/lib/platform/projects';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { flowStepRows } from '@/lib/view/pipeline';
import { toProgress, toRunStats } from '@/lib/view/runs';
import { toFlows } from '@/lib/view/catalog';
import { resetPushForTests } from '@/hooks/use-push-registration';
import { fakePlatform, type Answer } from '@/test/fake-platform';
import {
  QUICKBOOKS_PROVIDER,
  TEST_WORKSPACE,
  invoiceProcessingEntry,
  planSubscriptionsPayload,
  providersWithQuickBooks,
  routePlatform,
  runDetailPayload,
  signedInSession,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));
// The run form's file field reads the document picker and the file system; nothing here picks a file.
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: {} } }));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Invoice Processing's shared screens (the owner's build 19 items 1, 5–9;
 * spec §3.D, §3.E): the flow page's CONNECT and STEPS, and a run's PROGRESS
 * and DETAILS — drawn from the platform's contract (backend ADR-0037), so any
 * flow that declares groups, an optional connection or details is drawn alike.
 */

beforeEach(() => {
  platformOperation.mockReset();
  resetSnapshot();
  resetPushForTests();
});

/** Invoice Processing, added to Accounting, its vendor choice as `config` holds it. */
function added(config: Record<string, unknown>, unmet: string[] = []): Subscription {
  return {
    ...planSubscriptionsPayload().subscriptions[0]!,
    id: 'ip-1',
    templateId: 'invoice-processing',
    templateVersion: 2,
    status: 'live',
    config,
    unmetConnections: unmet,
    setup: invoiceProcessingEntry().setup,
    runInput: [{ key: 'invoiceFile', title: 'Document', description: 'A PDF or photo of a bill or receipt.', control: 'artifact', required: false }],
    projectId: 'project-1',
  };
}

/** Invoice Processing v1 as a workspace still holds it: QuickBooks required, its own settings, no vendor choice. */
function heldV1(unmet: string[]): Subscription {
  return {
    ...added({ holdAboveAmount: 500, expenseAccount: 'Office' }, unmet),
    templateVersion: 1,
    setup: [
      { section: 'rules', key: 'holdAboveAmount', title: 'Hold above', description: 'Larger ones wait.', control: 'money', defaultValue: 500, required: false },
      { section: 'rules', key: 'expenseAccount', title: 'Default category', description: 'Where costs go.', control: 'text', required: true },
    ],
  };
}

function openFlow(subscription: Subscription) {
  routePlatform(platformOperation, {
    '/automations': { automations: [invoiceProcessingEntry()], categories: ['All', 'Accounting'] },
    '/subscriptions': { subscriptions: [subscription] },
    '/projects': { projects: [{ id: 'project-1', workspaceId: TEST_WORKSPACE, name: 'Accounting', type: 'Accounting', status: 'active', viewerRole: 'owner', createdAt: '2026-10-14T00:00:00Z' }] },
    '/connections/providers': providersWithQuickBooks(),
  });
  setMockParams({ flow: subscription.id });
  return renderWithProviders(<WorkflowDetailScreen />, signedInSession);
}

describe("the flow page (spec §3.D)", () => {
  it('says its team on a line of its own, then what it does; its start controls in one line, the file field with no "(optional)"', async () => {
    await openFlow(added({ vendor: 'none' }));
    expect(await screen.findByText('Invoice Processing')).toBeTruthy();
    expect(screen.getByTestId('flow-team').props.children).toBe('Team: Accounting');
    expect(screen.getByText('Reads bills and receipts, then saves the details or records them in QuickBooks.')).toBeTruthy();
    const start = screen.getByTestId('start-run');
    expect(within(start).getByText('Fill this in, then start the run.')).toBeTruthy();
    expect(within(start).getByText('Document')).toBeTruthy();
    expect(within(start).getByText('A PDF or photo of a bill or receipt.')).toBeTruthy();
    expect(within(start).queryByText(/\(optional\)/u)).toBeNull();
    expect(within(start).getByTestId(/^phosphor-react-native-paperclip-/u).props.width).toBe(24);
  });

  it('CONNECT: None, and Connect vendor › opens its vendor page for this flow', async () => {
    await openFlow(added({ vendor: 'none' }));
    const vendor = await screen.findByTestId('flow-vendor');
    expect(within(vendor).getByText('None')).toBeTruthy();
    expect(within(vendor).getByTestId(/^phosphor-react-native-prohibit-/u).props.width).toBe(24);
    expect(screen.getByText('CONNECT')).toBeTruthy();
    expect(screen.queryByText('CONNECTIONS')).toBeNull();
    await fireEvent.press(within(vendor).getByText('Connect vendor ›'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/vendor',
      params: { template: 'invoice-processing', flow: 'ip-1' },
    });
  });

  it('CONNECT: QuickBooks chosen and connected is its logo, from the provider\'s own icon — never a blank, never a "QB" tile', async () => {
    await openFlow(added({ vendor: 'quickbooks' }));
    const vendor = await screen.findByTestId('flow-vendor');
    expect(within(vendor).getByLabelText('QuickBooks')).toBeTruthy();
    expect(within(vendor).queryByText('Not connected')).toBeNull();
    expect(screen.queryByText(/first, or choose None/u)).toBeNull();
  });

  it('CONNECT: QuickBooks chosen but not connected says so, and the line under it opens the vendor page', async () => {
    await openFlow(added({ vendor: 'quickbooks' }, ['quickbooks']));
    const vendor = await screen.findByTestId('flow-vendor');
    expect(within(vendor).getByText('Not connected')).toBeTruthy();
    await fireEvent.press(screen.getByText('Connect QuickBooks Online first, or choose None.'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/vendor',
      params: { template: 'invoice-processing', flow: 'ip-1' },
    });
    // The chosen vendor is the vendor row's, never a second "owed" row.
    expect(screen.queryByTestId('flow-owed')).toBeNull();
  });

  it('STEPS: one numbered row per group, its description under it — five, not twenty-four, no kickers, no step cards', async () => {
    await openFlow(added({ vendor: 'none' }));
    const steps = await screen.findByTestId('flow-steps');
    expect(within(steps).getByText('STEPS')).toBeTruthy();
    const rows = ['1 · Received', '2 · Read', '3 · Checked', '4 · Done', '5 · Emailed'];
    for (const row of rows) expect(within(steps).getByText(row)).toBeTruthy();
    expect(within(steps).getByText('AI reads the details.')).toBeTruthy();
    expect(within(steps).getAllByText(/^\d+ · /u)).toHaveLength(5);
    for (const gone of ['TRIGGER', 'AI STEP', 'ACTION', 'Document received', 'Vendor looked up', 'PIPELINE']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('Turn on, not Go live or Publish, for a paused flow', async () => {
    await openFlow({ ...added({ vendor: 'none' }), status: 'paused' });
    expect(await screen.findByText('Turn on')).toBeTruthy();
    expect(screen.queryByText('Go live')).toBeNull();
    expect(screen.queryByText('Resume')).toBeNull();
  });

  it("CONNECT keeps the logo's clear space — 12 pt — to the line under it", async () => {
    await openFlow(added({ vendor: 'quickbooks' }, ['quickbooks']));
    const vendor = await screen.findByTestId('flow-vendor');
    expect(StyleSheet.flatten(within(vendor).getByText('Not connected').parent!.props.style)).toMatchObject({ gap: 12 });
  });
});

describe('a flow on an older version (Invoice Processing v1, held until the owner retires it; the review of the Invoice Processing screens)', () => {
  it('still needs QuickBooks — its version has no vendor choice — and says so, where Turn on would otherwise be greyed out with no reason', async () => {
    await openFlow({ ...heldV1(['quickbooks']), status: 'paused' });
    const connect = await screen.findByTestId('flow-connect');
    expect(within(connect).queryByTestId('flow-vendor')).toBeNull();
    expect(within(connect).getByLabelText('QuickBooks')).toBeTruthy();
    expect(within(connect).getByText('Not connected')).toBeTruthy();
    expect(screen.getByTestId('flow-owed').props.children).toBe('Connect QuickBooks Online first.');
  });

  it("STEPS: its steps by title, as an ungrouped manifest draws them — never another version's groups", async () => {
    await openFlow(heldV1([]));
    const steps = await screen.findByTestId('flow-steps');
    expect(within(steps).getByText('1 · Document received')).toBeTruthy();
    expect(within(steps).queryByText('1 · Received')).toBeNull();
  });
});

describe("Turn on, the first add of a category's flow (U2; the review of the Invoice Processing screens)", () => {
  const ACCOUNTING: Project = {
    id: 'project-1',
    workspaceId: TEST_WORKSPACE,
    name: 'Accounting',
    type: 'Accounting',
    status: 'active',
    viewerRole: 'member',
    createdAt: '2026-10-14T20:00:00Z',
  };

  it('reads the teams again once the add made the team: the flow page says "Team: Accounting", never "a team", and the teams list holds it', async () => {
    const fake = fakePlatform(platformOperation);
    // Before the add the workspace has no Accounting team: the platform makes it,
    // and puts this person on it, with the add (backend ADR-0036).
    let teams: Project[] = [];
    let held: Subscription[] = [];
    const draft: Subscription = { ...added({ vendor: 'none' }), status: 'draft' };
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingEntry()], categories: ['All', 'Accounting'] });
    fake.always('GET /v1/connections/providers', providersWithQuickBooks());
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/run-stats', {
      workspace: { total: 0, pending: 0, running: 0, held: 0, succeeded: 0, failed: 0, cancelled: 0 },
      subscriptions: [],
    });
    fake.always('GET /v1/workspaces/{workspaceId}/projects', () => ({ projects: teams }));
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', () => ({ subscriptions: held }));
    fake.always('POST /v1/workspaces/{workspaceId}/subscriptions', () => {
      teams = [ACCOUNTING];
      held = [draft];
      return { subscription: draft };
    });
    fake.always('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', () => {
      held = [{ ...draft, status: 'live' }];
      return { subscription: held[0]! };
    });

    setMockParams({ template: 'invoice-processing' });
    const setup = await renderWithProviders(<SetupScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Turn on'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'ip-1' } }),
    );
    await setup.unmount();

    setMockParams({ flow: 'ip-1' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect((await screen.findByTestId('flow-team')).props.children).toBe('Team: Accounting');
    // Home's teams, the team picker and the Flows cards read the same list.
    await expect(readProjects(TEST_WORKSPACE)).resolves.toEqual([ACCOUNTING]);
    expect(fake.to('GET /v1/workspaces/{workspaceId}/projects')).toHaveLength(2);
  });
});

describe('Set up for a flow the workspace holds on an older version (the review of the Invoice Processing screens)', () => {
  it("draws and sends that version's own settings — no vendor key, which it would refuse — and the QuickBooks it needs", async () => {
    const fake = fakePlatform(platformOperation);
    const v1 = { ...heldV1([]), status: 'paused' as const };
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingEntry()], categories: ['All', 'Accounting'] });
    fake.always('GET /v1/connections/providers', providersWithQuickBooks());
    fake.always('GET /v1/workspaces/{workspaceId}/connections', {
      connections: [
        {
          id: 'c-qb',
          providerId: 'quickbooks',
          workspaceId: TEST_WORKSPACE,
          externalAccount: { id: 'realm-1', displayName: 'Acme Books' },
          status: 'connected',
          requiredScopes: [],
          grantedScopes: [],
          usedByCount: 1,
        },
      ],
    });
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', { subscriptions: [v1] });
    fake.always('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', { subscription: { ...v1, status: 'live' } });
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByText('Default category')).toBeTruthy();
    expect(screen.queryByTestId('setup-vendor')).toBeNull();
    expect(screen.getByText('Connected ✓')).toBeTruthy();
    expect(screen.queryByText('Approval limit')).toBeNull();
    await fireEvent.press(screen.getByText('Turn on'));
    await waitFor(() => expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')).toHaveLength(1));
    const { config } = fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')[0]!.body as { config: Record<string, unknown> };
    expect(config).toEqual({ holdAboveAmount: 500, expenseAccount: 'Office' });
    expect(Object.keys(config)).not.toContain('vendor');
    expect(fake.to('POST /v1/workspaces/{workspaceId}/subscriptions')).toEqual([]);
  });

  it("CONNECT keeps the logo's clear space — 12 pt — to the line under it", async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingEntry()], categories: ['All', 'Accounting'] });
    fake.always('GET /v1/connections/providers', providersWithQuickBooks());
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', { subscriptions: [] });
    setMockParams({ template: 'invoice-processing', vendor: 'quickbooks' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    const vendor = await screen.findByTestId('setup-vendor');
    expect(StyleSheet.flatten(within(vendor).getByText('Not connected').parent!.props.style)).toMatchObject({ gap: 12 });
  });
});

describe('the flow-page rows view (spec §3.D)', () => {
  it('numbers groups when declared, and steps when not', () => {
    const entry = invoiceProcessingEntry();
    expect(flowStepRows(entry.pipeline, entry.groups).map((row) => row.label)).toEqual([
      '1 · Received',
      '2 · Read',
      '3 · Checked',
      '4 · Done',
      '5 · Emailed',
    ]);
    expect(flowStepRows(entry.pipeline.slice(0, 2), undefined)).toEqual([
      { id: 'receive', label: '1 · Document received', sub: 'A PDF or photo arrives.' },
      { id: 'read-company', label: '2 · QuickBooks checked', sub: 'Checks QuickBooks is connected.' },
    ]);
    expect(flowStepRows(undefined, [])).toEqual([]);
  });

  it("draws an owed account by its provider's own icon name, never looked up by its id (the blank of build 19)", () => {
    const [flow] = toFlows(
      [added({ vendor: 'quickbooks' }, ['quickbooks'])],
      [invoiceProcessingEntry()],
      [],
      new Map([[QUICKBOOKS_PROVIDER.providerId, QUICKBOOKS_PROVIDER]]),
    );
    expect(flow!.connections).toEqual([
      expect.objectContaining({ id: 'quickbooks', iconName: 'QuickBooksLogo', name: 'QuickBooks Online', status: 'Not connected' }),
    ]);
    expect(flow!.connections[0]).not.toHaveProperty('sub');
  });
});

/* ───────────────────────────── a run's page ───────────────────────────── */

type RunDetail = Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'>;
type Reported = [stepId: string, outcome: 'ok' | 'held' | 'failed', summary: string, minute: number, heldReason?: string];

function ipRun(status: RunDetail['run']['status'], reported: Reported[], extra: Partial<RunDetail> = {}, run: Partial<RunDetail['run']> = {}): RunDetail {
  const base = runDetailPayload('run-1');
  const ended = status === 'succeeded' || status === 'failed' || status === 'cancelled';
  return {
    ...base,
    run: {
      ...base.run,
      templateId: 'invoice-processing',
      templateVersion: 2,
      status,
      ...(ended ? {} : { endedAt: undefined }),
      ...run,
    },
    steps: reported.map(([stepId, outcome, summary, minute, heldReason], n) => ({
      id: `s${n}`,
      runId: 'run-1',
      workspaceId: TEST_WORKSPACE,
      stepId,
      outcome,
      summary,
      ...(heldReason ? { heldReason } : {}),
      occurredAt: new Date(Date.UTC(2026, 9, 14, 20, minute)).toISOString(),
    })),
    ...extra,
  };
}

function openRun(detail: RunDetail) {
  routePlatform(platformOperation, { '/automations': { automations: [invoiceProcessingEntry()], categories: ['All', 'Accounting'] } });
  const routed = platformOperation.getMockImplementation()!;
  platformOperation.mockImplementation((path: string, ...rest: unknown[]) =>
    /\/runs\/run-1$/u.test(path) ? Promise.resolve(detail) : routed(path, ...rest),
  );
  setMockParams({ runId: 'run-1' });
  return renderWithProviders(<RunDetailScreen />, signedInSession);
}

const NONE_PATH: Reported[] = [
  ['receive', 'ok', 'PDF, 2 pages', 0],
  ['extract', 'ok', 'Read: receipt from Blue Bottle, $14.50', 1],
  ['check-document', 'ok', 'Checks passed', 2],
  ['save-details', 'ok', 'Saved: Blue Bottle, $14.50', 3],
];

describe("a run's page (spec §3.E)", () => {
  it('PROGRESS: one row per group it reached, in the groups\' order — the latest summary in each — with its result on a line of its own', async () => {
    await openRun(ipRun('succeeded', NONE_PATH, {}, { resultSummary: 'Saved: Blue Bottle, $14.50.' }));
    const progress = await screen.findByTestId('run-progress');
    expect(within(progress).getByText('PROGRESS')).toBeTruthy();
    expect(screen.queryByText('TIMELINE')).toBeNull();
    expect(within(progress).getAllByText(/^(Received|Read|Checked|Done|Emailed)$/u).map((node) => node.props.children)).toEqual([
      'Received',
      'Read',
      'Checked',
      'Done',
    ]);
    expect(within(progress).getByText('PDF, 2 pages')).toBeTruthy();
    expect(within(progress).getByText('Saved: Blue Bottle, $14.50')).toBeTruthy();
    // Never a step id, never "Not run", never a group it did not reach.
    for (const gone of ['save-details', 'check-document', 'Emailed', 'Not run', 'Working…']) {
      expect(within(progress).queryByText(new RegExp(gone, 'u'))).toBeNull();
    }
    expect(within(progress).getAllByTestId(/^phosphor-react-native-check-circle-/u).map((icon) => icon.props.width)).toEqual([24, 24, 24, 24]);
    expect(screen.getByTestId('run-result').props.children).toBe('Saved: Blue Bottle, $14.50.');
    expect(within(screen.getByText('Steps done').parent!).getByText('4 / 4')).toBeTruthy();
    expect(screen.queryByText('Confidence')).toBeNull();
  });

  it('a group the run came back to shows its latest summary: the second read under Read', async () => {
    await openRun(
      ipRun('succeeded', [
        ['receive', 'ok', 'Photo', 0],
        ['extract', 'ok', 'Read: bill from Acme, $1,200.00', 1],
        ['check-document', 'ok', 'Totals off by $3.00', 2],
        ['verify-read', 'ok', 'Second read matches', 3],
        ['save-details', 'ok', 'Saved: Acme, $1,200.00', 4],
      ]),
    );
    const progress = await screen.findByTestId('run-progress');
    expect(within(progress).getByText('Second read matches')).toBeTruthy();
    expect(within(progress).queryByText('Read: bill from Acme, $1,200.00')).toBeNull();
    expect(within(progress).getByText('Totals off by $3.00')).toBeTruthy();
  });

  it('held: "Waiting for approval.", its group with the hand and its reason', async () => {
    await openRun(
      ipRun('held', [
        ['receive', 'ok', 'PDF, 1 page', 0],
        ['extract', 'ok', 'Read: bill from Acme, $900.00', 1],
        ['decide', 'held', 'Waiting for approval', 2, 'Over the $500 limit, new vendor.'],
      ]),
    );
    expect(await screen.findByText('Waiting for approval.')).toBeTruthy();
    const progress = screen.getByTestId('run-progress');
    expect(within(progress).getByText('Over the $500 limit, new vendor.')).toBeTruthy();
    expect(within(progress).getByTestId(/^phosphor-react-native-hand-palm-/u).props.width).toBe(24);
    expect(within(screen.getByText('Steps done').parent!).getByText('2 / 3')).toBeTruthy();
  });

  it('failed: its reason, the group that failed with the warning — nothing after it', async () => {
    await openRun(
      ipRun('failed', [['receive', 'ok', 'Photo', 0], ['extract', 'failed', 'The document can\'t be read.', 1]], {}, {
        failureReason: "The document can't be read. Try a clearer photo.",
      }),
    );
    expect(await screen.findByText("The document can't be read. Try a clearer photo.")).toBeTruthy();
    const progress = screen.getByTestId('run-progress');
    expect(within(progress).getByTestId(/^phosphor-react-native-warning-circle-/u)).toBeTruthy();
    expect(within(progress).queryByText('Checked')).toBeNull();
  });

  it('running: what it did so far, then Working…', async () => {
    await openRun(ipRun('running', [['receive', 'ok', 'PDF, 2 pages', 0]]));
    const progress = await screen.findByTestId('run-progress');
    expect(within(progress).getByText('Received')).toBeTruthy();
    expect(within(progress).getByText('Working…')).toBeTruthy();
    expect(within(screen.getByText('Steps done').parent!).getByText('1 / 1')).toBeTruthy();
  });

  it("a run of an older version is drawn step by step — never another version's groups — and a step the newest version does not name is drawn by what it said", async () => {
    await openRun(
      ipRun(
        'succeeded',
        [
          ['receive', 'ok', 'Photo', 0],
          ['find-payer', 'ok', 'Paid with the company card', 1],
          ['extract', 'ok', 'Read: receipt from Blue Bottle, $14.50', 2],
        ],
        {},
        { templateVersion: 1 },
      ),
    );
    const progress = await screen.findByTestId('run-progress');
    expect(within(progress).getByText('Document received')).toBeTruthy();
    expect(within(progress).getByText('Paid with the company card')).toBeTruthy();
    expect(within(progress).getByText('Document read')).toBeTruthy();
    expect(within(progress).queryByText('Received')).toBeNull();
    expect(within(progress).queryByText('find-payer')).toBeNull();
    expect(within(screen.getByText('Steps done').parent!).getByText('3 / 3')).toBeTruthy();
  });

  it('names its flow, as the website does — no version beside it', async () => {
    await openRun(ipRun('succeeded', NONE_PATH));
    expect(await screen.findByText('Invoice Processing')).toBeTruthy();
    expect(screen.queryByText(/ · v\d+/u)).toBeNull();
  });

  it("DETAILS: what the run saved, label and value, in the automation's order — and no section when it saved none", async () => {
    const view = await openRun(
      ipRun('succeeded', NONE_PATH, {
        details: [
          { label: 'Type', value: 'Receipt' },
          { label: 'Seller', value: 'Blue Bottle' },
          { label: 'Total', value: '$14.50' },
        ],
      }),
    );
    const details = await screen.findByTestId('run-details');
    expect(within(details).getByText('DETAILS')).toBeTruthy();
    expect(within(details).getAllByText(/^(Type|Seller|Total|Receipt|Blue Bottle|\$14\.50)$/u).map((node) => node.props.children)).toEqual([
      'Type',
      'Receipt',
      'Seller',
      'Blue Bottle',
      'Total',
      '$14.50',
    ]);
    await view.unmount();
    resetSnapshot();
    await openRun(ipRun('succeeded', NONE_PATH));
    await screen.findByTestId('run-progress');
    expect(screen.queryByTestId('run-details')).toBeNull();
    expect(screen.queryByText('DETAILS')).toBeNull();
  });
});

describe('the progress view (lib/view/runs.ts)', () => {
  const entry = invoiceProcessingEntry();
  const clock = (iso: string) => iso.slice(11, 16);
  const steps = (reported: Reported[]) => ipRun('running', reported).steps;

  it('orders groups by the manifest, takes the latest step in each by when it happened, and never draws an unreported group', () => {
    const rows = toProgress(
      // Reported out of order: the platform's order is not trusted for "latest".
      steps([
        ['check-document', 'ok', 'Checks passed', 2],
        ['receive', 'ok', 'Photo', 0],
        ['verify-read', 'ok', 'Second read matches', 3],
        ['extract', 'ok', 'Read: receipt', 1],
      ]),
      entry.pipeline,
      entry.groups,
      clock,
      'succeeded',
    );
    expect(rows.map((row) => [row.title, row.sub, row.time])).toEqual([
      ['Received', 'Photo', '20:00'],
      ['Read', 'Second read matches', '20:03'],
      ['Checked', 'Checks passed', '20:02'],
    ]);
  });

  it('titles steps from the pipeline without groups, a step the manifest does not name by what it said — never its id — and adds Working… while going', () => {
    const rows = toProgress(
      steps([
        ['receive', 'ok', 'Photo', 0],
        ['mystery-step', 'ok', 'Did a thing', 1],
      ]),
      entry.pipeline,
      undefined,
      clock,
      'running',
    );
    expect(rows.map((row) => [row.title, row.sub])).toEqual([
      ['Document received', 'Photo'],
      ['Did a thing', ''],
      ['Working…', ''],
    ]);
    expect(rows.some((row) => row.title === 'mystery-step')).toBe(false);
  });

  it('never drops a reported step the groups do not hold: it follows the groups, by its title or what it said', () => {
    const rows = toProgress(
      steps([
        ['receive', 'ok', 'Photo', 0],
        ['mystery-step', 'failed', 'Could not look it up', 1],
      ]),
      entry.pipeline,
      entry.groups,
      clock,
      'failed',
    );
    expect(rows.map((row) => [row.title, row.sub])).toEqual([
      ['Received', 'Photo'],
      ['Could not look it up', ''],
    ]);
  });

  it('counts the rows done over the rows shown, Working… not among them; none shown is the em dash', () => {
    const rows = toProgress(steps([['receive', 'ok', 'Photo', 0], ['decide', 'held', 'Waiting', 1]]), entry.pipeline, entry.groups, clock, 'running');
    expect(toRunStats(rows, '2m')).toEqual([
      { value: '2m', label: 'Duration' },
      { value: '1 / 2', label: 'Steps done' },
    ]);
    expect(toRunStats(toProgress([], entry.pipeline, entry.groups, clock, 'pending'), '—')[1]).toEqual({ value: '—', label: 'Steps done' });
  });
});
