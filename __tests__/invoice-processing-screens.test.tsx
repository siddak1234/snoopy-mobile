import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Platform, Share, StyleSheet } from 'react-native';

import RunDetailScreen from '@/app/(tabs)/activity/run';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import SetupScreen from '@/app/(tabs)/flows/setup';
import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import type { Subscription } from '@/lib/platform/automations';
import type { Connection } from '@/lib/platform/catalog';
import { connectOAuthProvider } from '@/lib/platform/connections';
import { readProjects, type Project } from '@/lib/platform/projects';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { flowStepPlan } from '@/lib/view/pipeline';
import { toFlows } from '@/lib/view/catalog';
import { resetPushForTests } from '@/hooks/use-push-registration';
import { fakePlatform, type Answer } from '@/test/fake-platform';
import {
  QUICKBOOKS_PROVIDER,
  TEST_WORKSPACE,
  invoiceProcessingEntry,
  invoiceProcessingV3Entry,
  invoiceProcessingV4Entry,
  planSubscriptionsPayload,
  providersWithQuickBooks,
  recipientsPayload,
  routePlatform,
  runDetailPayload,
  sessionAs,
  signedInSession,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));
jest.mock('@/lib/platform/connections', () => ({
  ...jest.requireActual('@/lib/platform/connections'),
  connectOAuthProvider: jest.fn(),
}));
// The run form's file field reads the document picker and the file system; the
// run page's Download JSON writes a file to the cache.
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const mockFiles: { name: string; text?: string; deleted: boolean }[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: jest.fn().mockImplementation((_dir: string, name: string) => {
    const file = { name, text: undefined as string | undefined, deleted: false };
    mockFiles.push(file);
    return {
      uri: `file:///cache/${name}`,
      create: jest.fn(),
      write: (text: string) => {
        file.text = text;
      },
      get exists() {
        return !file.deleted;
      },
      delete: () => {
        file.deleted = true;
      },
    };
  }),
}));
// The flow page's DASHBOARD reads again every 5 s while a run goes on: 20 ms here.
jest.mock('@/lib/view/runs', () => ({ ...jest.requireActual('@/lib/view/runs'), FLOW_STATS_REREAD_MS: 20 }));
const { platformOperation } = jest.requireMock('@/lib/platform/client');
const mockConnect = connectOAuthProvider as jest.Mock;

/**
 * Build 21's shared screens (spec A2–A9; the owner's build 20 items 2–13, D3,
 * D4, AM2, AM4, AM5): Set up once, simple; the flow page as the run page —
 * DASHBOARD, STEPS with the document and Start run in Step 1 and the vendor in
 * its step, CONNECTIONS, Edit setup at the bottom; a run's page with every
 * step from the start, its documents and Download JSON; every run by its full
 * id. Drawn from the platform's contract (backend ADR-0037, ADR-0039,
 * ADR-0040), so any flow that declares groups, a vendor per step or documents
 * is drawn alike.
 */

beforeEach(() => {
  platformOperation.mockReset();
  mockConnect.mockReset();
  mockFiles.length = 0;
  resetSnapshot();
  resetPushForTests();
});

const ACCOUNTING_TEAM = {
  id: 'project-1',
  workspaceId: TEST_WORKSPACE,
  name: 'Accounting',
  type: 'Accounting',
  status: 'active' as const,
  viewerRole: 'owner' as const,
  createdAt: '2026-10-14T00:00:00Z',
};

/** Invoice Processing (v4 since Build 22), added to Accounting, its vendor choice as `config` holds it. */
function added(config: Record<string, unknown>, unmet: string[] = [], version: 2 | 3 | 4 = 4): Subscription {
  const entry = version === 4 ? invoiceProcessingV4Entry() : version === 3 ? invoiceProcessingV3Entry() : invoiceProcessingEntry();
  return {
    ...planSubscriptionsPayload().subscriptions[0]!,
    id: 'ip-1',
    templateId: 'invoice-processing',
    templateVersion: version,
    status: 'live',
    config,
    unmetConnections: unmet,
    setup: entry.setup,
    runInput: [{ key: 'invoiceFile', title: 'Document', description: 'A PDF or photo of bills or receipts.', control: 'artifact', required: false }],
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

/** The workspace's QuickBooks connection, connected as an email address unless said otherwise. */
function quickbooks(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'c-qb',
    providerId: 'quickbooks',
    workspaceId: TEST_WORKSPACE,
    externalAccount: { id: 'realm-1', displayName: 'books@example.com' },
    status: 'connected',
    requiredScopes: [],
    grantedScopes: [],
    usedByCount: 1,
    ...overrides,
  };
}

type Stats = Answer<'GET /v1/workspaces/{workspaceId}/run-stats'>;
function stats(counts: Partial<Stats['workspace']> = {}): Stats {
  const row = { total: 0, pending: 0, running: 0, held: 0, succeeded: 0, failed: 0, cancelled: 0, ...counts };
  return { workspace: row, subscriptions: [{ subscriptionId: 'ip-1', ...row }] };
}

function openFlow(
  subscription: Subscription,
  options: { connections?: Connection[]; entry?: ReturnType<typeof invoiceProcessingV4Entry>; runStats?: () => Stats } = {},
) {
  routePlatform(platformOperation, {
    '/automations': { automations: [options.entry ?? invoiceProcessingV4Entry()], categories: ['All', 'Accounting'] },
    '/subscriptions': { subscriptions: [subscription] },
    '/projects': { projects: [ACCOUNTING_TEAM] },
    '/connections/providers': providersWithQuickBooks(),
    [`/v1/workspaces/${TEST_WORKSPACE}/connections`]: { connections: options.connections ?? [] },
  });
  if (options.runStats) {
    const routed = platformOperation.getMockImplementation()!;
    const answer = options.runStats;
    platformOperation.mockImplementation((path: string, ...rest: unknown[]) =>
      path.includes('/run-stats') ? Promise.resolve(answer()) : routed(path, ...rest),
    );
  }
  setMockParams({ flow: subscription.id });
  return renderWithProviders(<WorkflowDetailScreen />, signedInSession);
}

/** What is on screen in reading order: each test id, and each line of text as `text:<words>`. */
function readingOrder(tree: unknown): string[] {
  const order: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      order.push(`text:${node}`);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const { props, children } = node as { props?: { testID?: unknown }; children?: unknown[] | null };
    if (typeof props?.testID === 'string') order.push(props.testID);
    children?.forEach(walk);
  };
  walk(tree);
  return order;
}

/* ───────────────────────────── the flow page (A6, A3) ───────────────────────────── */

describe('the flow page (spec A6; Build 22, P1–P4)', () => {
  it('reads top to bottom: name, team and status; DASHBOARD; the five STEPS — the document and Start run in 1, the integration in 2, nothing in 3 and 4, who gets the email in 5; then Pause, Edit setup and Archive', async () => {
    const view = await openFlow(added({ vendor: 'quickbooks' }), { connections: [quickbooks()] });
    expect(await screen.findByText('Invoice Processing')).toBeTruthy();
    expect(screen.getByTestId('flow-team').props.children).toBe('Department: Accounting');
    const order = readingOrder(view.toJSON());
    const at = (entry: string) => {
      const index = order.indexOf(entry);
      expect([entry, index >= 0]).toEqual([entry, true]);
      return index;
    };
    const sequence = [
      'text:Invoice Processing',
      'text:Live',
      'text:DASHBOARD',
      'flow-stat-All',
      'text:STEPS',
      'text:1 · Upload invoice',
      'start-run',
      'text:Document',
      'text:Start run',
      'text:2 · Connect integration',
      'flow-vendor-vendor',
      'text:3 · AI processing',
      'text:4 · QuickBooks updated',
      'text:5 · Email sent',
      'flow-email',
      'text:Pause',
      'manage-setup',
      'archive-flow',
    ];
    for (let i = 1; i < sequence.length; i += 1) expect([sequence[i - 1], at(sequence[i - 1]!) < at(sequence[i]!)]).toEqual([sequence[i - 1], true]);
    // Step 1 offers Take photo beside Upload, the file field by its title alone.
    const step1 = within(screen.getByTestId('flow-step-upload'));
    expect(step1.getByTestId('run-file-invoiceFile-photo')).toBeTruthy();
    expect(step1.getByTestId('run-file-invoiceFile-upload')).toBeTruthy();
  });

  it('draws no description under the name, no help line under any setting and no lead line (S11, S24; the owner\'s build 20 items 3 and 9)', async () => {
    await openFlow(added({ vendor: 'none' }));
    await screen.findByText('Invoice Processing');
    for (const gone of [
      'Reads bills and receipts, then saves the details or records them in QuickBooks.',
      'A PDF or photo of bills or receipts.',
      'Amounts over this wait for approval.',
      'Where the details go.',
      'Fill this in, then start the run.',
      'Gets the results of each run.',
      'Send results to',
      'CONNECT',
      'NEW RUN',
      // No step's description since Build 22 (the session's S20).
      'Add a PDF or photo.',
      'QuickBooks, or None.',
      'AI reads and checks each document.',
      'Saved, or recorded in QuickBooks.',
      'The results are emailed.',
    ]) {
      expect([gone, screen.queryByText(gone)]).toEqual([gone, null]);
    }
  });

  it('A3: QuickBooks chosen and connected says "Connected" in step 2 — never "Connect vendor"', async () => {
    await openFlow(added({ vendor: 'quickbooks' }), { connections: [quickbooks()] });
    const vendor = await screen.findByTestId('flow-vendor-vendor');
    expect(within(screen.getByTestId('flow-step-connect')).getByTestId('flow-vendor-vendor')).toBe(vendor);
    expect(within(vendor).getByText('QuickBooks Online')).toBeTruthy();
    expect(within(vendor).getByText('Connected')).toBeTruthy();
    expect(within(vendor).queryByText('Not connected')).toBeNull();
    expect(screen.queryByText(/Connect vendor/u)).toBeNull();
    expect(screen.queryByText(/first, or choose None/u)).toBeNull();
    // Its mark is the round symbol at 24 × 24.
    expect(StyleSheet.flatten(within(vendor).getByLabelText('QuickBooks').props.style)).toEqual({ width: 24, height: 24 });
  });

  it('A3: QuickBooks chosen but not connected says "Not connected", and Step 1 says what to do — both open Connect vendor for this step', async () => {
    await openFlow(added({ vendor: 'quickbooks' }, ['quickbooks']), {
      connections: [quickbooks({ status: 'disconnected' })],
    });
    const vendor = await screen.findByTestId('flow-vendor-vendor');
    expect(within(vendor).getByText('Not connected')).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('flow-step-upload')).getByText('Connect QuickBooks Online first, or choose None.'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/flows/vendor', params: { flow: 'ip-1', field: 'vendor' } });
    await fireEvent.press(vendor);
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/flows/vendor', params: { flow: 'ip-1', field: 'vendor' } });
    // The chosen vendor is its step's row, never a second "owed" line.
    expect(screen.queryByTestId('flow-owed')).toBeNull();
  });

  it('A3: None is its mark and "Save the details only."; the row opens Connect vendor', async () => {
    await openFlow(added({ vendor: 'none' }));
    const vendor = await screen.findByTestId('flow-vendor-vendor');
    expect(within(vendor).getByText('None')).toBeTruthy();
    expect(within(vendor).getByText('Save the details only.')).toBeTruthy();
    expect(within(vendor).getByTestId(/^phosphor-react-native-prohibit-/u).props.width).toBe(24);
    await fireEvent.press(vendor);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/vendor', params: { flow: 'ip-1', field: 'vendor' } });
  });

  it('P3: no CONNECTIONS — connected or not, the integration is step 2\'s row alone; Disconnect stays in Settings › Connections', async () => {
    const first = await openFlow(added({ vendor: 'quickbooks' }), { connections: [quickbooks()] });
    await screen.findByTestId('flow-vendor-vendor');
    expect(screen.queryByText('CONNECTIONS')).toBeNull();
    expect(screen.queryByText('Connections')).toBeNull();
    expect(screen.queryByTestId('flow-connections')).toBeNull();
    expect(screen.queryAllByTestId(/^connection-row-/u)).toEqual([]);
    expect(screen.queryByText('Disconnect')).toBeNull();
    expect(screen.queryByText('books@example.com')).toBeNull();
    await first.unmount();
    resetSnapshot();
    await openFlow(added({ vendor: 'none' }));
    await screen.findByTestId('flow-vendor-vendor');
    expect(screen.queryByText('CONNECTIONS')).toBeNull();
    expect(screen.queryAllByTestId(/^connection-row-/u)).toEqual([]);
  });

  /**
   * The Build 21 review's guard, where Disconnect is now (Build 22, P3): Settings ›
   * Connections reads the connections again past the snapshot after a Disconnect,
   * so the row says Not connected at once — never answered from the snapshot.
   */
  it('Disconnect on Settings › Connections: the row says Not connected at once — read again, never answered from the snapshot', async () => {
    const fake = fakePlatform(platformOperation);
    let disconnected = false;
    fake.always('GET /v1/connections/providers', providersWithQuickBooks());
    fake.always('GET /v1/workspaces/{workspaceId}/connections', () => ({
      connections: [disconnected ? quickbooks({ status: 'disconnected' }) : quickbooks()],
    }));
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', { subscriptions: [added({ vendor: 'quickbooks' })] });
    fake.always('DELETE /v1/workspaces/{workspaceId}/connections/{connectionId}', () => {
      disconnected = true;
      return { connection: { ...quickbooks({ status: 'disconnected' }) } };
    });
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('connection-action-quickbooks'));
    const dialog = within(await screen.findByTestId('disconnect-dialog'));
    expect(dialog.getByText('1 live flow uses it. It stops until you connect it again.')).toBeTruthy();
    await fireEvent.press(dialog.getByText('Disconnect'));
    // Within the snapshot's 15 s window: the page says what the platform holds now.
    await waitFor(() =>
      expect(within(screen.getByTestId('connection-action-quickbooks')).getByText('Connect')).toBeTruthy(),
    );
    expect(within(screen.getByTestId('connection-row-quickbooks')).getByText('Not connected')).toBeTruthy();
    expect(fake.to('DELETE /v1/workspaces/{workspaceId}/connections/{connectionId}')).toHaveLength(1);
  });

  it('Edit setup, at the bottom, opens Set up for this flow', async () => {
    await openFlow(added({ vendor: 'none' }));
    const edit = await screen.findByTestId('manage-setup');
    expect(within(edit).getByText('Edit setup')).toBeTruthy();
    await fireEvent.press(edit);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/setup',
      params: { template: 'invoice-processing', flow: 'ip-1' },
    });
  });

  it('paused: Step 1 keeps the document and offers Turn on in Start run\'s place, which turns the flow on', async () => {
    const fake = fakePlatform(platformOperation);
    const paused = { ...added({ vendor: 'none' }), status: 'paused' as const };
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', { subscriptions: [paused] });
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingV4Entry()], categories: ['All'] });
    fake.always('GET /v1/workspaces/{workspaceId}/run-stats', stats());
    fake.always('GET /v1/connections/providers', providersWithQuickBooks());
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [ACCOUNTING_TEAM] });
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/email-recipients', recipientsPayload());
    fake.always('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', { subscription: { ...paused, status: 'live' } });
    setMockParams({ flow: 'ip-1' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    const step1 = within(await screen.findByTestId('flow-step-upload'));
    expect(step1.getByText('Document')).toBeTruthy();
    expect(step1.queryByText('Start run')).toBeNull();
    await fireEvent.press(step1.getByTestId('flow-step-turn-on'));
    await waitFor(() => expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')).toHaveLength(1));
    expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')[0]!.body).toEqual({ status: 'live' });
  });

  it('DASHBOARD is live: read again while a run of the flow goes on, and the tiles change without leaving the page (S30)', async () => {
    let reads = 0;
    // Running until the test has seen it so; then the run ends, a success. A flag rather than a
    // read count: with the re-read at 20 ms, a slow runner read twice before the first look.
    let ended = false;
    await openFlow(added({ vendor: 'none' }), {
      runStats: () => {
        reads += 1;
        return ended ? stats({ total: 1, succeeded: 1 }) : stats({ total: 1, running: 1 });
      },
    });
    const successes = await screen.findByTestId('flow-stat-Success');
    expect(within(successes).getByText('0')).toBeTruthy();
    ended = true;
    await waitFor(() => expect(within(screen.getByTestId('flow-stat-Success')).getByText('1')).toBeTruthy());
    const settled = reads;
    // Nothing running now: no more reads.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(reads).toBe(settled);
  });

  it('a setup field draws only in the setting step it names: a v2 vendor naming no step and a v3 vendor naming a step with work draw nowhere (spec §4)', async () => {
    const v2 = await openFlow(added({ vendor: 'none' }, [], 2), { entry: invoiceProcessingEntry() as never });
    expect(await screen.findByTestId('flow-step-received')).toBeTruthy();
    expect(screen.queryByTestId('flow-vendor-vendor')).toBeNull();
    await v2.unmount();
    resetSnapshot();
    await openFlow(added({ vendor: 'quickbooks' }, [], 3), { entry: invoiceProcessingV3Entry() as never, connections: [quickbooks()] });
    expect(await screen.findByTestId('flow-step-done')).toBeTruthy();
    // "After step 4 i dont want to see quickbooks" (the owner's build 21 item 7).
    expect(screen.queryByTestId('flow-vendor-vendor')).toBeNull();
    // Nor the Approval limit, on Set up alone.
    expect(screen.queryByText('Approval limit')).toBeNull();
  });
});

describe('a flow on an older version (Invoice Processing v1, held until the owner retires it)', () => {
  it('still needs QuickBooks — its version has no vendor choice — and says so in Step 1', async () => {
    await openFlow({ ...heldV1(['quickbooks']), status: 'paused' }, { entry: invoiceProcessingEntry() as never });
    expect(await screen.findByTestId('flow-owed')).toBeTruthy();
    expect(screen.getByTestId('flow-owed').props.children).toBe('Connect QuickBooks Online first.');
    expect(screen.queryByTestId('flow-vendor-vendor')).toBeNull();
  });

  it("STEPS: its steps by title, as an ungrouped manifest draws them — never another version's groups", async () => {
    await openFlow(heldV1([]), { entry: invoiceProcessingEntry() as never });
    const steps = await screen.findByTestId('flow-steps');
    expect(within(steps).getByText('1 · Document received')).toBeTruthy();
    expect(within(steps).queryByText('1 · Received')).toBeNull();
  });
});

describe('the flow-page rows view (lib/view/pipeline.ts)', () => {
  it('numbers groups when declared, and steps when not — titles only (the session\'s S20)', () => {
    const entry = invoiceProcessingEntry();
    expect(flowStepPlan(entry.pipeline, entry.groups, [], {}).map((row) => row.label)).toEqual([
      '1 · Received',
      '2 · Read',
      '3 · Checked',
      '4 · Done',
      '5 · Emailed',
    ]);
    expect(flowStepPlan(entry.pipeline.slice(0, 2), undefined, [], {}).map((row) => [row.id, row.label])).toEqual([
      ['receive', '1 · Document received'],
      ['read-company', '2 · QuickBooks checked'],
    ]);
  });

  it("places the input in the trigger's group, and a field in the setting step it names", () => {
    const v4 = invoiceProcessingV4Entry();
    expect(flowStepPlan(v4.pipeline, v4.groups, v4.setup!, {}).map((row) => [row.id, row.input, row.fields])).toEqual([
      ['upload', true, []],
      ['connect', false, ['vendor']],
      ['process', false, []],
      ['record', false, []],
      ['email', false, []],
    ]);
  });

  it("draws an owed account by its provider's own icon name, never looked up by its id (the blank of build 19)", () => {
    const [flow] = toFlows(
      [added({ vendor: 'quickbooks' }, ['quickbooks'])],
      [invoiceProcessingV3Entry()],
      [],
      new Map([[QUICKBOOKS_PROVIDER.providerId, QUICKBOOKS_PROVIDER]]),
    );
    expect(flow!.connections).toEqual([
      expect.objectContaining({ id: 'quickbooks', iconName: 'QuickBooksLogo', name: 'QuickBooks Online', status: 'Not connected' }),
    ]);
  });
});

/* ───────────────────────────── Set up (AM4) ───────────────────────────── */

function routeSetup(fake: ReturnType<typeof fakePlatform>, held: () => Subscription[], connections: () => Connection[] = () => []) {
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingV4Entry()], categories: ['All', 'Accounting'] });
  fake.always('GET /v1/connections/providers', providersWithQuickBooks());
  fake.always('GET /v1/workspaces/{workspaceId}/connections', () => ({ connections: connections() }));
  fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [ACCOUNTING_TEAM] });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', () => ({ subscriptions: held() }));
}

describe('Set up — one simple page, once, everything on it (the owner\'s AM4)', () => {
  it('Add: the vendor and None right on the page, the settings by title alone, then Turn on adds and turns on the flow with them', async () => {
    const fake = fakePlatform(platformOperation);
    let held: Subscription[] = [];
    const draft: Subscription = { ...added({}), status: 'draft' };
    routeSetup(fake, () => held);
    fake.always('POST /v1/workspaces/{workspaceId}/subscriptions', () => {
      held = [draft];
      return { subscription: draft };
    });
    fake.always('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', { subscription: { ...draft, status: 'live' } });
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<SetupScreen />, sessionAs('owner'));
    expect(await screen.findByText('Set up Invoice Processing')).toBeTruthy();
    expect(screen.getByTestId('setup-team').props.children).toBe('Department: Accounting');
    expect(screen.getByText('1 · CONNECT')).toBeTruthy();
    expect(screen.getByText('2 · SETTINGS')).toBeTruthy();
    const vendor = within(screen.getByTestId('setup-vendor-vendor'));
    expect(vendor.getByText('QuickBooks Online')).toBeTruthy();
    expect(vendor.getByText('Not connected')).toBeTruthy();
    expect(vendor.getByText('None')).toBeTruthy();
    expect(vendor.getByTestId('vendor-chosen-none')).toBeTruthy();
    expect(screen.getByText('Approval limit')).toBeTruthy();
    for (const gone of ['Amounts over this wait for approval.', 'Where the details go.', 'Connect vendor ›']) {
      expect([gone, screen.queryByText(gone)]).toEqual([gone, null]);
    }
    // Its one button is a button to a screen reader too (the Build 21 review).
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'ip-1' } }),
    );
    // No version is sent: a new flow runs the newest (Build 22, P4; backend ADR-0041).
    expect(fake.to('POST /v1/workspaces/{workspaceId}/subscriptions')[0]!.body).toEqual({
      templateId: 'invoice-processing',
    });
    expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')[0]!.body).toEqual({
      config: { vendor: 'none', holdAboveAmount: 500 },
      status: 'live',
    });
  });

  it('a tap on QuickBooks not connected connects it at once, then chooses it — Turn on sends it, no Done, no second page', async () => {
    const fake = fakePlatform(platformOperation);
    let connected: Connection[] = [];
    let held: Subscription[] = [];
    const draft: Subscription = { ...added({}), status: 'draft' };
    routeSetup(fake, () => held, () => connected);
    fake.always('POST /v1/workspaces/{workspaceId}/subscriptions', () => {
      held = [draft];
      return { subscription: draft };
    });
    fake.always('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', { subscription: { ...draft, status: 'live' } });
    mockConnect.mockImplementation(async () => {
      connected = [quickbooks()];
      return { status: 'connected', connection: quickbooks() };
    });
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<SetupScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByTestId('vendor-quickbooks'));
    await waitFor(() => expect(screen.getByTestId('vendor-chosen-quickbooks')).toBeTruthy());
    expect(mockConnect).toHaveBeenCalledWith(TEST_WORKSPACE, QUICKBOOKS_PROVIDER);
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/(tabs)/flows/vendor' }));
    for (const gone of ['Done', 'Save']) expect(screen.queryByText(gone)).toBeNull();
    await waitFor(() => expect(screen.getByText('books@example.com')).toBeTruthy());
    await fireEvent.press(screen.getByText('Turn on'));
    await waitFor(() => expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')).toHaveLength(1));
    expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')[0]!.body).toEqual({
      config: { vendor: 'quickbooks', holdAboveAmount: 500 },
      status: 'live',
    });
  });

  it('Edit setup on a live flow: Save keeps its status, sends the settings once and goes back', async () => {
    const fake = fakePlatform(platformOperation);
    const live = added({ vendor: 'quickbooks', holdAboveAmount: 500 });
    routeSetup(fake, () => [live], () => [quickbooks()]);
    fake.always('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', { subscription: live });
    setMockParams({ template: 'invoice-processing', flow: 'ip-1' });
    await renderWithProviders(<SetupScreen />, sessionAs('owner'));
    expect(await screen.findByTestId('vendor-chosen-quickbooks')).toBeTruthy();
    expect(screen.queryByText('Turn on')).toBeNull();
    await fireEvent.press(screen.getByTestId('vendor-none'));
    await fireEvent.changeText(screen.getByLabelText('Approval limit'), '25000');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}').map((sent) => [sent.values.subscriptionId, sent.body])).toEqual([
      ['ip-1', { config: { vendor: 'none', holdAboveAmount: 250 } }],
    ]);
    expect(fake.to('POST /v1/workspaces/{workspaceId}/subscriptions')).toEqual([]);
  });

  it('a member: a vendor not connected is no choice — "Ask an owner or admin to connect it."', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, () => []);
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<SetupScreen />, sessionAs('member'));
    const row = await screen.findByTestId('vendor-quickbooks');
    expect(within(row).getByText('Ask an owner or admin to connect it.')).toBeTruthy();
    await fireEvent.press(row);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('a member on a live flow (round 23, B3): the integration is read-only — no row is a choice, and the list says who can change it', async () => {
    const fake = fakePlatform(platformOperation);
    const live = added({ vendor: 'quickbooks', holdAboveAmount: 500 });
    routeSetup(fake, () => [live], () => [quickbooks()]);
    setMockParams({ template: 'invoice-processing', flow: 'ip-1' });
    await renderWithProviders(<SetupScreen />, sessionAs('member'));
    expect(await screen.findByTestId('vendor-chosen-quickbooks')).toBeTruthy();
    expect(screen.getByTestId('vendor-read-only')).toHaveTextContent('Only an owner or admin can change the integration.');
    for (const id of ['vendor-quickbooks', 'vendor-none']) {
      const row = screen.getByTestId(id);
      expect([id, row.props.accessibilityState]).toEqual([id, expect.objectContaining({ disabled: true })]);
      await fireEvent.press(row);
    }
    // The choice did not move.
    expect(screen.getByTestId('vendor-chosen-quickbooks')).toBeTruthy();
    expect(screen.queryByTestId('vendor-chosen-none')).toBeNull();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('a member adding a flow still chooses its integration (ADR-0036): no read-only line, None is a choice', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, () => [], () => [quickbooks()]);
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<SetupScreen />, sessionAs('member'));
    expect(await screen.findByTestId('vendor-quickbooks')).toBeTruthy();
    expect(screen.queryByTestId('vendor-read-only')).toBeNull();
    await fireEvent.press(screen.getByTestId('vendor-quickbooks'));
    await waitFor(() => expect(screen.getByTestId('vendor-chosen-quickbooks')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('vendor-none'));
    await waitFor(() => expect(screen.getByTestId('vendor-chosen-none')).toBeTruthy());
  });
});

describe("Turn on, the first add of a category's flow (U2; the review of the Invoice Processing screens)", () => {
  const ACCOUNTING: Project = { ...ACCOUNTING_TEAM, viewerRole: 'member', createdAt: '2026-10-14T20:00:00Z' };

  it('reads the teams again once the add made the team: the flow page says "Department: Accounting", never "a team"', async () => {
    const fake = fakePlatform(platformOperation);
    let teams: Project[] = [];
    let held: Subscription[] = [];
    const draft: Subscription = { ...added({ vendor: 'none' }), status: 'draft' };
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingV3Entry()], categories: ['All', 'Accounting'] });
    fake.always('GET /v1/connections/providers', providersWithQuickBooks());
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/run-stats', stats());
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
    expect((await screen.findByTestId('flow-team')).props.children).toBe('Department: Accounting');
    await expect(readProjects(TEST_WORKSPACE)).resolves.toEqual([ACCOUNTING]);
    expect(fake.to('GET /v1/workspaces/{workspaceId}/projects')).toHaveLength(2);
  });
});

describe('Set up for a flow the workspace holds on an older version', () => {
  it("draws and sends that version's own settings — no vendor key, which it would refuse — and the QuickBooks it needs", async () => {
    const fake = fakePlatform(platformOperation);
    const v1 = { ...heldV1([]), status: 'paused' as const };
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingV3Entry()], categories: ['All', 'Accounting'] });
    fake.always('GET /v1/connections/providers', providersWithQuickBooks());
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [quickbooks({ externalAccount: { id: 'realm-1', displayName: 'Acme Books' } })] });
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', { subscriptions: [v1] });
    fake.always('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', { subscription: { ...v1, status: 'live' } });
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByText('Default category')).toBeTruthy();
    expect(screen.queryByTestId('setup-vendor-vendor')).toBeNull();
    // The account it cannot run without, as the one row: connected.
    expect(within(screen.getByTestId('connection-row-quickbooks')).getByText('Connected')).toBeTruthy();
    expect(screen.queryByText('Approval limit')).toBeNull();
    // Paused: Save keeps its status.
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')).toHaveLength(1));
    const body = fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')[0]!.body as { config: Record<string, unknown> };
    expect(body).toEqual({ config: { holdAboveAmount: 500, expenseAccount: 'Office' } });
    expect(fake.to('POST /v1/workspaces/{workspaceId}/subscriptions')).toEqual([]);
  });
});

/* ───────────────────────────── a run's page (A7, A8) ───────────────────────────── */

type RunDetail = Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'>;
type RunDocument = NonNullable<RunDetail['documents']>[number];
type Reported = [stepId: string, outcome: 'ok' | 'held' | 'failed', summary: string, minute: number, heldReason?: string];

const RUN_ID = '793eef82-102d-81be-a2d3-9e8d4e2b2c36';

function ipRun(
  status: RunDetail['run']['status'],
  reported: Reported[],
  extra: Partial<RunDetail> = {},
  run: Partial<RunDetail['run']> = {},
): RunDetail {
  const base = runDetailPayload('run-1');
  const ended = status === 'succeeded' || status === 'failed' || status === 'cancelled';
  return {
    ...base,
    run: {
      ...base.run,
      id: RUN_ID,
      requestId: '1e3231c6-0000-4000-8000-000000000000',
      templateId: 'invoice-processing',
      templateVersion: 3,
      status,
      ...(ended ? {} : { endedAt: undefined }),
      ...run,
    },
    steps: reported.map(([stepId, outcome, summary, minute, heldReason], n) => ({
      id: `s${n}`,
      runId: RUN_ID,
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

function openRun(
  detail: RunDetail,
  options: { entry?: ReturnType<typeof invoiceProcessingV3Entry>; documents?: () => unknown; approvals?: Answer<'GET /v1/workspaces/{workspaceId}/approvals'> } = {},
) {
  routePlatform(platformOperation, {
    '/automations': { automations: [options.entry ?? invoiceProcessingV3Entry()], categories: ['All', 'Accounting'] },
    ...(options.approvals ? { '/approvals': options.approvals } : {}),
  });
  const routed = platformOperation.getMockImplementation()!;
  platformOperation.mockImplementation((path: string, ...rest: unknown[]) => {
    if (path.endsWith(`/runs/${RUN_ID}/documents`)) {
      return options.documents ? Promise.resolve().then(options.documents) : Promise.reject(new Error('no file'));
    }
    return path.endsWith(`/runs/${RUN_ID}`) ? Promise.resolve(detail) : routed(path, ...rest);
  });
  setMockParams({ runId: RUN_ID });
  return renderWithProviders(<RunDetailScreen />, signedInSession);
}

/** A receipt as v3 writes it (spec §1.1, AM7): every field present, null when not printed. */
function receipt(index: number, overrides: Partial<RunDocument> = {}): RunDocument {
  return {
    index,
    status: 'saved',
    statusText: 'Saved',
    type: 'receipt',
    vendor: { name: "Lowe's", address: '2150 W Shaw Ave', city: 'Fresno, CA 93711', storeNumber: '1234' },
    number: '48291',
    numberLabel: 'Receipt #',
    references: [{ label: 'Register', value: '07' }],
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
    recordedIn: null,
    details: [{ label: 'Category', value: 'Materials' }],
    ...overrides,
  };
}

/** Run 793eef82's real steps (v2, 2026-10-15), its summaries as they were. */
const RUN_793EEF82: Reported[] = [
  ['receive', 'ok', 'PDF, 1 page', 0],
  ['read-company', 'ok', 'QuickBooks: Autom8x Test Co', 0],
  ['read-preferences', 'ok', 'Preferences read', 0],
  ['find-accounts', 'ok', '34 accounts read', 0],
  ['extract', 'ok', "Read: receipt from Lowe's", 1],
  ['check-document', 'failed', 'Add one document per file.', 1],
];

describe("a run's page — every step from the start, a live tracker (spec A7; the owner's build 20 items 10 and 11)", () => {
  it('at the start: every group drawn, the first Working… and the rest Waiting; Steps done 0 of them', async () => {
    await openRun(ipRun('pending', []));
    const steps = await screen.findByTestId('run-progress');
    expect(within(steps).getByText('STEPS')).toBeTruthy();
    expect(screen.queryByText('PROGRESS')).toBeNull();
    const rows = within(steps).getAllByTestId(/^run-step-(?!spinner)/u);
    expect(rows.map((row) => row.props.testID)).toEqual([
      'run-step-group:received',
      'run-step-group:read',
      'run-step-group:checked',
      'run-step-group:done',
    ]);
    expect(within(rows[0]!).getByText('1 · Received')).toBeTruthy();
    expect(within(rows[0]!).getByText('Working…')).toBeTruthy();
    for (const row of rows.slice(1)) expect(within(row).getByText('Waiting')).toBeTruthy();
    // The working step's icon turns (round 23, A4); no other row's does.
    expect(within(rows[0]!).getByTestId('run-step-spinner')).toBeTruthy();
    expect(within(steps).getAllByTestId('run-step-spinner')).toHaveLength(1);
    expect(within(screen.getByText('Steps done').parent!).getByText('0 / 4')).toBeTruthy();
    expect(screen.queryByText('No steps reported yet.')).toBeNull();
  });

  it.each([
    [false, 'turns'],
    [true, 'stands still under Reduce Motion'],
  ])('the working step\'s icon (round 23, A4), Reduce Motion %s: it %s', async (reduced) => {
    // The system's answer, then react-native's own mock's again (a spy's restore would leave it answering nothing).
    const motion = AccessibilityInfo.isReduceMotionEnabled as jest.Mock;
    const asItWas = motion.getMockImplementation();
    motion.mockResolvedValue(reduced);
    try {
      await openRun(ipRun('pending', []));
      const spinner = await screen.findByTestId('run-step-spinner');
      await act(async () => {
        await new Promise((settle) => setTimeout(settle, 300));
      });
      const turned = (spinner.props.jestAnimatedStyle.value as { transform: [{ rotate: string }] }).transform[0].rotate;
      if (reduced) expect(turned).toBe('0deg');
      else expect(turned).not.toBe('0deg');
    } finally {
      motion.mockImplementation(asItWas);
    }
  });

  it('while running: done groups say Done and when, the next Working…, and Steps done never runs ahead (fb10\'s "1 / 1" impossible)', async () => {
    await openRun(ipRun('running', [['receive', 'ok', 'PDF, 2 pages', 0]]));
    const received = await screen.findByTestId('run-step-group:received');
    expect(within(received).getByText(/^Done · \d{1,2}:\d{2} (AM|PM)$/u)).toBeTruthy();
    expect(within(screen.getByTestId('run-step-group:read')).getByText('Working…')).toBeTruthy();
    expect(within(screen.getByTestId('run-step-group:checked')).getByText('Waiting')).toBeTruthy();
    // Only the working step turns: not a done one, not a waiting one.
    expect(within(screen.getByTestId('run-step-group:read')).getByTestId('run-step-spinner')).toBeTruthy();
    expect(within(received).queryByTestId('run-step-spinner')).toBeNull();
    expect(within(screen.getByTestId('run-step-group:checked')).queryByTestId('run-step-spinner')).toBeNull();
    expect(within(screen.getByText('Steps done').parent!).getByText('1 / 4')).toBeTruthy();
    // Never a step's own summary.
    expect(screen.queryByText('PDF, 2 pages')).toBeNull();
  });

  it("run 793eef82 as it was: never a step's summary — no \"34 accounts read\" — the failure on the step that failed, and the run by its FULL id, never its request id", async () => {
    // v2's steps as its manifest grouped them: QuickBooks' three lookups under Received (B3).
    const v2 = invoiceProcessingEntry();
    const step = (id: string, group: string, title: string) => ({ id, kicker: 'ACTION' as const, group, title, description: title });
    v2.pipeline = [
      step('receive', 'received', 'Document received'),
      step('read-company', 'received', 'QuickBooks checked'),
      step('read-preferences', 'received', 'QuickBooks settings read'),
      step('find-accounts', 'received', 'Accounts read'),
      step('extract', 'read', 'Document read'),
      step('check-document', 'checked', 'Details checked'),
      step('save-details', 'done', 'Details saved'),
      step('notify', 'emailed', 'Summary emailed'),
    ];
    await openRun(ipRun('failed', RUN_793EEF82, {}, { templateVersion: 2, failureReason: 'Add one document per file.' }), {
      entry: v2 as never,
    });
    expect((await screen.findByTestId('run-title')).props.children).toBe(`Run ${RUN_ID}`);
    expect(screen.queryByText(/1e3231c6/u)).toBeNull();
    expect(within(screen.getByTestId('run-fact-Run ID')).getByText(RUN_ID)).toBeTruthy();
    for (const summary of ['34 accounts read', 'QuickBooks: Autom8x Test Co', 'Preferences read', "Read: receipt from Lowe's", 'PDF, 1 page']) {
      expect([summary, screen.queryByText(summary)]).toEqual([summary, null]);
    }
    const checked = within(screen.getByTestId('run-step-group:checked'));
    expect(checked.getByText('Add one document per file.')).toBeTruthy();
    expect(checked.getByTestId(/^phosphor-react-native-warning-circle-/u).props.width).toBe(24);
    expect(within(screen.getByTestId('run-step-group:done')).getByText('Stopped')).toBeTruthy();
  });

  it('held: its group says "Waiting for approval:" and why, with the hand; what comes after waits', async () => {
    await openRun(
      ipRun('held', [
        ['receive', 'ok', 'PDF, 1 page', 0],
        ['extract', 'ok', 'Read 3 documents', 1],
        ['decide', 'ok', 'Ready', 2],
        ['ask-approval', 'held', 'Waiting for approval', 3, 'Document 2: the total can\'t be read.'],
      ]),
    );
    expect(await screen.findByText('Waiting for approval.')).toBeTruthy();
    const done = within(screen.getByTestId('run-step-group:done'));
    expect(done.getByText("Waiting for approval: Document 2: the total can't be read.")).toBeTruthy();
    expect(done.getByTestId(/^phosphor-react-native-hand-palm-/u).props.width).toBe(24);
    expect(within(screen.getByTestId('run-step-group:checked')).getByText(/^Done · /u)).toBeTruthy();
  });

  it('a continuation: the groups before its first step are done', async () => {
    await openRun(
      ipRun('succeeded', [['confirm-company', 'ok', 'Checked', 0], ['create-approved-records', 'ok', 'Recorded', 1]], {}, {
        origin: 'approval-continuation',
      }),
    );
    await screen.findByTestId('run-progress');
    for (const id of ['received', 'read', 'checked', 'done']) {
      expect([id, within(screen.getByTestId(`run-step-group:${id}`)).queryByText(/^Done/u) !== null]).toEqual([id, true]);
    }
    expect(within(screen.getByText('Steps done').parent!).getByText('4 / 4')).toBeTruthy();
  });

  it("a run of an older version is drawn by the steps it reported — titled from the catalog where it names them — never another version's groups", async () => {
    await openRun(
      ipRun('succeeded', [['receive', 'ok', 'Photo', 0], ['find-payer', 'ok', 'Paid with the company card', 1]], {}, { templateVersion: 1 }),
    );
    const steps = await screen.findByTestId('run-progress');
    expect(within(steps).getByText('1 · Document received')).toBeTruthy();
    expect(within(steps).getByText('2 · Step 2')).toBeTruthy();
    expect(within(steps).queryByText('Paid with the company card')).toBeNull();
    expect(within(steps).queryByText('find-payer')).toBeNull();
  });
});

describe("a run's documents and Download JSON (spec A7, C2; the owner's ~04:05Z and AM7)", () => {
  const three = [
    receipt(1),
    receipt(2, {
      status: 'recorded',
      statusText: 'Recorded in QuickBooks: expense',
      vendor: { name: 'Blue Bottle', address: null, city: 'Oakland, CA', storeNumber: null },
      number: 'INV-7',
      numberLabel: 'Invoice #',
      references: [{ label: 'PO number', value: 'PO-55' }],
      type: 'invoice',
      lineItems: [
        { description: 'Latte', quantity: '2', unitPrice: '5.25', amount: '10.50' },
        { description: 'Tip jar', quantity: null, unitPrice: null, amount: '1.00' },
      ],
      lineItemsComplete: false,
      recordedIn: { providerId: 'quickbooks', recordType: 'expense', recordId: '1452' },
      payment: { method: 'cash', cardLast4: null },
      tip: '2.00',
      discount: '0.50',
      total: '13.00',
    }),
    receipt(3, { vendor: { name: null, address: null, city: null, storeNumber: null }, currency: 'CAD', total: '1234.5', number: null, numberLabel: null, references: [], payment: { method: 'not_shown', cardLast4: null } }),
  ];

  it('three receipts from one photo: "Document 1 of 3" … each its own vendor, place, numbers, lines with "quantity × unit price", totals and result', async () => {
    await openRun(ipRun('succeeded', [['receive', 'ok', 'Photo', 0]], { documents: three, details: [{ label: 'Total', value: '$1' }] }));
    const documents = await screen.findByTestId('run-documents');
    expect(within(documents).getByText('DOCUMENTS')).toBeTruthy();
    expect(screen.queryByTestId('run-details')).toBeNull();

    const first = within(screen.getByTestId('document-1'));
    expect(first.getByText('Document 1 of 3')).toBeTruthy();
    expect(screen.getByTestId('document-1-chip').props.children).toBe('Saved');
    expect(first.getByText("Receipt · Lowe's")).toBeTruthy();
    expect(first.getByText('2150 W Shaw Ave, Fresno, CA 93711 · Store 1234')).toBeTruthy();
    expect(first.getByText('Oct 14, 2026 · 2:32 PM')).toBeTruthy();
    expect(first.getByText('Receipt #')).toBeTruthy();
    expect(first.getByText('48291')).toBeTruthy();
    expect(first.getByText('Register')).toBeTruthy();
    const line = within(screen.getByTestId('document-1-line-1'));
    expect(line.getByText('2X4-8 STUD')).toBeTruthy();
    expect(line.getByText('$15.92')).toBeTruthy();
    expect(line.getByText('4 × $3.98')).toBeTruthy();
    expect(first.getByText('$17.19')).toBeTruthy();
    expect(first.getByText('Card ending 4417')).toBeTruthy();
    expect(first.getByText('Materials')).toBeTruthy();

    const second = within(screen.getByTestId('document-2'));
    expect(second.getByText('Document 2 of 3')).toBeTruthy();
    expect(screen.getByTestId('document-2-chip').props.children).toBe('Recorded');
    expect(second.getByText('Invoice · Blue Bottle')).toBeTruthy();
    expect(second.getByText('Invoice #')).toBeTruthy();
    expect(second.getByText('INV-7')).toBeTruthy();
    expect(second.getByText('PO-55')).toBeTruthy();
    expect(second.getByText('More lines on the document.')).toBeTruthy();
    expect(second.getByText('−$0.50')).toBeTruthy();
    expect(second.getByText('Cash')).toBeTruthy();
    expect(second.getByText('Recorded in QuickBooks: expense')).toBeTruthy();
    expect(within(screen.getByTestId('document-2-line-2')).queryByText(/×/u)).toBeNull();

    const third = within(screen.getByTestId('document-3'));
    expect(third.getByText('Document 3 of 3')).toBeTruthy();
    expect(third.getByText('Receipt')).toBeTruthy();
    expect(third.getByText('1,234.5 CAD')).toBeTruthy();
    expect(third.queryByText('Paid')).toBeNull();
  });

  it('Download JSON hands the platform\'s file to the share sheet as run-{full id}.json, then removes it', async () => {
    const file = { runId: RUN_ID, templateId: 'invoice-processing', templateVersion: 3, status: 'succeeded', startedAt: null, endedAt: null, documents: three };
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const os = Platform.OS;
    Platform.OS = 'ios';
    try {
      await openRun(ipRun('succeeded', [], { documents: three }), { documents: () => file });
      await fireEvent.press(await screen.findByTestId('run-download-json'));
      await waitFor(() => expect(share).toHaveBeenCalledWith({ url: `file:///cache/run-${RUN_ID}.json` }));
      expect(mockFiles).toEqual([{ name: `run-${RUN_ID}.json`, text: JSON.stringify(file, null, 2), deleted: true }]);
      expect(platformOperation).toHaveBeenCalledWith(`/v1/workspaces/${TEST_WORKSPACE}/runs/${RUN_ID}/documents`, expect.any(Function));
    } finally {
      Platform.OS = os;
      share.mockRestore();
    }
  });

  it('says "Could not download. Try again." when the file could not be read, and offers no Download JSON without documents', async () => {
    const view = await openRun(ipRun('succeeded', [], { documents: three }));
    await fireEvent.press(await screen.findByTestId('run-download-json'));
    expect(await screen.findByText('Could not download. Try again.')).toBeTruthy();
    await view.unmount();
    resetSnapshot();
    await openRun(ipRun('succeeded', []));
    await screen.findByTestId('run-progress');
    expect(screen.queryByTestId('run-download-json')).toBeNull();
    expect(screen.queryByText('DOCUMENTS')).toBeNull();
  });

  it('a waiting document reads "Not approved" once its approval was rejected (S21)', async () => {
    await openRun(
      ipRun('held', [['ask-approval', 'held', 'Waiting', 0, 'Document 1: needs a look.']], {
        documents: [receipt(1, { status: 'waiting', statusText: 'Waiting for approval: needs a look' })],
      }),
      {
        approvals: {
          approvals: [
            {
              id: 'ap-1',
              workspaceId: TEST_WORKSPACE,
              runId: RUN_ID,
              stepId: 'ask-approval',
              status: 'rejected',
              reason: 'Document 1: needs a look.',
              eligibleRoles: ['owner'],
              createdAt: '2026-10-14T20:00:00Z',
              expiresAt: '2026-10-15T20:00:00Z',
            } as never,
          ],
        },
      },
    );
    expect(within(await screen.findByTestId('document-1')).getByText('Not approved')).toBeTruthy();
  });

  it("DETAILS: a v1/v2 run's saved lines, label and value, when it wrote no documents", async () => {
    await openRun(
      ipRun('succeeded', [], {
        details: [
          { label: 'Type', value: 'Receipt' },
          { label: 'Seller', value: 'Blue Bottle' },
        ],
      }),
    );
    const details = await screen.findByTestId('run-details');
    expect(within(details).getByText('DETAILS')).toBeTruthy();
    expect(within(details).getByText('Blue Bottle')).toBeTruthy();
  });
});
