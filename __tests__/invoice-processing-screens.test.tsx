import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Platform, Share, StyleSheet } from 'react-native';

import RunDetailScreen from '@/app/(tabs)/activity/run';
import RunDetailsScreen from '@/app/(tabs)/activity/run-details';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import SetupScreen from '@/app/(tabs)/flows/setup';
import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import { decideApproval, type Subscription } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import type { Connection } from '@/lib/platform/catalog';
import { connectOAuthProvider } from '@/lib/platform/connections';
import { readProjects, type Project } from '@/lib/platform/projects';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { nocturneDark, status } from '@/constants/theme';
import { flowStepPlan } from '@/lib/view/pipeline';
import { toFlows } from '@/lib/view/catalog';
import { resetPushForTests } from '@/hooks/use-push-registration';
import { fixtureBlocks, visibleWords } from '@/test/blocks';
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
  // The one native download (round 24 P12): the signed link saved into the cache.
  downloadSignedFile: jest.fn(async (_url: string, name: string) => ({ uri: `file:///cache/${name}`, exists: true, delete: jest.fn() })),
}));
jest.mock('@/lib/platform/connections', () => ({
  ...jest.requireActual('@/lib/platform/connections'),
  connectOAuthProvider: jest.fn(),
}));
// The run form's file field reads the document picker and the file system.
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const mockFiles: { name: string; text?: string; deleted: boolean }[] = [];
/** Where Download put each file: the folder picked in Files (`test/mocks/expo-file-system.ts`). */
const mockCopies: string[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  Directory: Object.assign(
    jest.fn().mockImplementation((uri: string) => ({ uri })),
    { pickDirectoryAsync: jest.fn(async () => ({ uri: 'file:///picked/' })) },
  ),
  File: jest.fn().mockImplementation((dir: string | { uri: string }, name?: string) => {
    // `new File(uri)` (a saved file) or `new File(folder, name)`.
    const single = name === undefined;
    const uri = single ? String(dir) : `${typeof dir === 'string' ? `file:///${dir}/` : dir.uri}${name}`;
    const file = { name: single ? uri : name, text: undefined as string | undefined, deleted: false };
    if (!single) mockFiles.push(file);
    return {
      uri,
      copy: (target: { uri: string }) => mockCopies.push(`${uri} -> ${target.uri}`),
      create: jest.fn(),
      write: (text: string) => {
        file.text = text;
      },
      get exists() {
        return single ? !file.deleted : !file.deleted && !uri.startsWith('file:///picked/');
      },
      delete: () => {
        file.deleted = true;
      },
    };
  }),
}));
// The decision a run's step 4 sends (round 24 P6): the real call, watched.
jest.mock('@/lib/platform/automations', () => {
  const actual = jest.requireActual('@/lib/platform/automations');
  return { ...actual, decideApproval: jest.fn(actual.decideApproval) };
});
// The flow page's DASHBOARD reads again every 5 s while a run goes on: 20 ms here.
jest.mock('@/lib/view/runs', () => ({ ...jest.requireActual('@/lib/view/runs'), FLOW_STATS_REREAD_MS: 20 }));
const { platformOperation, downloadSignedFile } = jest.requireMock('@/lib/platform/client');
const mockConnect = connectOAuthProvider as jest.Mock;

/**
 * Build 21's shared screens (spec A2–A9; the owner's build 20 items 2–13, D3,
 * D4, AM2, AM4, AM5): Set up once, simple; the flow page as the run page —
 * DASHBOARD, STEPS with the document and Start run in Step 1 and the vendor in
 * its step, CONNECTIONS, Edit setup at the bottom; a run's page with every
 * step from the start, its documents and ~~Download JSON~~ (the run package
 * since round 24, P12); every run by its full id. Drawn from the platform's contract (backend ADR-0037, ADR-0039,
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
    externalAccount: { displayName: 'books@example.com' },
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
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [quickbooks({ externalAccount: { displayName: 'Acme Books' } })] });
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
  options: {
    entry?: ReturnType<typeof invoiceProcessingV3Entry>;
    documents?: () => unknown;
    approvals?: Answer<'GET /v1/workspaces/{workspaceId}/approvals'>;
    /** This person's role in the workspace, as the collection says it (round 24 P6). */
    role?: 'owner' | 'admin' | 'member';
    /** What a package request answers, given what was sent (round 24 P12). */
    packageFile?: (sent: { body: unknown; key?: string }) => unknown;
    /** The run's page, or its Run details — its steps, tiles and facts (build 28, F9). */
    page?: 'run' | 'details';
  } = {},
) {
  routePlatform(platformOperation, {
    '/automations': { automations: [options.entry ?? invoiceProcessingV3Entry()], categories: ['All', 'Accounting'] },
    ...(options.approvals ? { '/approvals': options.approvals } : {}),
    ...(options.role
      ? {
          '/v1/workspaces': {
            workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: options.role }],
            activeWorkspaceId: TEST_WORKSPACE,
          },
        }
      : {}),
  });
  const routed = platformOperation.getMockImplementation()!;
  platformOperation.mockImplementation((path: string, ...rest: unknown[]) => {
    if (path.endsWith(`/runs/${RUN_ID}/documents`)) {
      return options.documents ? Promise.resolve().then(options.documents) : Promise.reject(new Error('no file'));
    }
    if (path.endsWith(`/runs/${RUN_ID}/package`)) {
      if (!options.packageFile) return Promise.reject(new Error('no package'));
      // The generated client's POST, as `createRunPackageFile` calls it: what was sent is seen.
      const execute = rest[0] as (clients: unknown, signal?: AbortSignal) => Promise<{ data: unknown }>;
      const post = async (_template: string, init: { body: unknown; params: { header: Record<string, string> } }) => ({
        data: await options.packageFile!({ body: init.body, key: init.params.header['Idempotency-Key'] }),
      });
      return execute({ automations: { POST: post } }).then((answer) => answer.data);
    }
    return path.endsWith(`/runs/${RUN_ID}`) ? Promise.resolve(detail) : routed(path, ...rest);
  });
  setMockParams({ runId: RUN_ID });
  return renderWithProviders(options.page === 'details' ? <RunDetailsScreen /> : <RunDetailScreen />, signedInSession);
}

/** The run's Run details page (build 28, F9): where its steps, tiles and facts are. */
function openRunDetails(detail: RunDetail, options: Omit<Parameters<typeof openRun>[1] & object, 'page'> = {}) {
  return openRun(detail, { ...options, page: 'details' });
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

describe("a run's Run details — every step from the start, a live tracker (spec A7; the owner's build 20 items 10 and 11)", () => {
  it('at the start: every group drawn, the first Working… and the rest Waiting; Steps done 0 of them', async () => {
    await openRunDetails(ipRun('pending', []));
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
      await openRunDetails(ipRun('pending', []));
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

  it('the working step\'s icon, Reduce Motion answered on after it started turning: it stands upright, never tilted where it stopped (the round 24 second review)', async () => {
    // The system answers late: the icon turns first, as on a phone, then Reduce Motion is on.
    const motion = AccessibilityInfo.isReduceMotionEnabled as jest.Mock;
    const asItWas = motion.getMockImplementation();
    const answers: ((reduced: boolean) => void)[] = [];
    motion.mockImplementation(() => new Promise<boolean>((answer) => answers.push(answer)));
    try {
      await openRunDetails(ipRun('pending', []));
      const spinner = await screen.findByTestId('run-step-spinner');
      const rotate = () => (spinner.props.jestAnimatedStyle.value as { transform: [{ rotate: string }] }).transform[0].rotate;
      await act(async () => {
        await new Promise((settle) => setTimeout(settle, 300));
      });
      expect(rotate()).not.toBe('0deg');
      await act(async () => {
        for (const answer of answers) answer(true);
        await new Promise((settle) => setTimeout(settle, 50));
      });
      expect(rotate()).toBe('0deg');
    } finally {
      motion.mockImplementation(asItWas);
    }
  });

  it('while running: done groups say Done and when, the next Working…, and Steps done never runs ahead (fb10\'s "1 / 1" impossible)', async () => {
    await openRunDetails(ipRun('running', [['receive', 'ok', 'PDF, 2 pages', 0]]));
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
    await openRunDetails(ipRun('failed', RUN_793EEF82, {}, { templateVersion: 2, failureReason: 'Add one document per file.' }), {
      entry: v2 as never,
    });
    // The run by its full id on its Run details too (build 28, F9).
    expect((await screen.findByTestId('run-details-name')).props.children).toBe(`Run ${RUN_ID}`);
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
    await openRunDetails(
      ipRun('held', [
        ['receive', 'ok', 'PDF, 1 page', 0],
        ['extract', 'ok', 'Read 3 documents', 1],
        ['decide', 'ok', 'Ready', 2],
        ['ask-approval', 'held', 'Waiting for approval', 3, 'Document 2: the total can\'t be read.'],
      ]),
    );
    const done = within(await screen.findByTestId('run-step-group:done'));
    expect(done.getByText("Waiting for approval: Document 2: the total can't be read.")).toBeTruthy();
    // How it went is the run page's line, not its Run details' (build 28's review, finding 2).
    expect(screen.queryByTestId('run-result')).toBeNull();
    expect(done.getByTestId(/^phosphor-react-native-hand-palm-/u).props.width).toBe(24);
    expect(within(screen.getByTestId('run-step-group:checked')).getByText(/^Done · /u)).toBeTruthy();
  });

  it('an approved job (round 24 P9: its runs\' steps together under one id): the held step is done once it runs on, every group Done', async () => {
    await openRunDetails(
      ipRun('succeeded', [
        ['receive', 'ok', 'PDF, 1 page', 0],
        ['extract', 'ok', 'Read 3 documents', 1],
        ['decide', 'ok', 'Ready', 2],
        ['ask-approval', 'held', 'Waiting for approval', 3, 'Document 2: the total can\'t be read.'],
        ['confirm-company', 'ok', 'Checked', 10],
        ['create-approved-records', 'ok', 'Recorded', 11],
      ]),
    );
    await screen.findByTestId('run-progress');
    for (const id of ['received', 'read', 'checked', 'done']) {
      expect([id, within(screen.getByTestId(`run-step-group:${id}`)).queryByText(/^Done/u) !== null]).toEqual([id, true]);
    }
    expect(within(screen.getByText('Steps done').parent!).getByText('4 / 4')).toBeTruthy();
    expect(screen.queryByText(/Waiting for approval/u)).toBeNull();
  });

  it("a run of an older version is drawn by the steps it reported — titled from the catalog where it names them — never another version's groups", async () => {
    await openRunDetails(
      ipRun('succeeded', [['receive', 'ok', 'Photo', 0], ['find-payer', 'ok', 'Paid with the company card', 1]], {}, { templateVersion: 1 }),
    );
    const steps = await screen.findByTestId('run-progress');
    expect(within(steps).getByText('1 · Document received')).toBeTruthy();
    expect(within(steps).getByText('2 · Step 2')).toBeTruthy();
    expect(within(steps).queryByText('Paid with the company card')).toBeNull();
    expect(within(steps).queryByText('find-payer')).toBeNull();
  });
});

/** An approval of this run, as the platform lists it. */
function runApproval(id: string, status: 'pending' | 'approved' | 'rejected' | 'expired', createdAt: string, eligibleRoles: ('owner' | 'admin' | 'member')[] = ['owner', 'admin']) {
  return {
    id,
    workspaceId: TEST_WORKSPACE,
    runId: RUN_ID,
    subscriptionId: 'invoice',
    stepId: 'ask-approval',
    status,
    reason: 'Document 2: the total can\'t be read.',
    eligibleRoles,
    createdAt,
    expiresAt: '2026-10-21T20:00:00Z',
  };
}

const HELD: Reported[] = [
  ['receive', 'ok', 'PDF, 1 page', 0],
  ['extract', 'ok', 'Read 3 documents', 1],
  ['ask-approval', 'held', 'Waiting for approval', 3, "Document 2: the total can't be read."],
];

/**
 * Approve / Deny inside step 4 (round 24 P6; the owner's build 23 F7–F10: "It
 * should be step 4 approve or deny", "Deny should be red", "not many clicks").
 */
/** The fixture's approval form (v7-held-waiting): its approval, and the roles that may decide it. */
const FORM_APPROVAL = '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d';

describe("a held run is decided from its page: Approve or Deny in its approval form (round 24, P6; build 28's review, finding 1; backend ADR-0048)", () => {
  const runReads = () =>
    platformOperation.mock.calls.filter((call: unknown[]) => String(call[0]).endsWith(`/runs/${RUN_ID}`)).length;
  const held = (fixture = 'v7-held-waiting') => ipRun('held', HELD, { blocks: fixtureBlocks(fixture) });

  it('a role the form names: both buttons under "Waiting for approval.", Deny the danger pill; Approve decides the form\'s approval with a key, then reads the run again', async () => {
    await openRun(held(), { role: 'admin' });
    expect((await screen.findByTestId('run-blocks-0')).props.children).toBe('Waiting for approval.');
    const decision = within(await screen.findByTestId('run-decision-block'));
    expect(decision.getByText('Approve')).toBeTruthy();
    expect((StyleSheet.flatten(decision.getByText('Deny').props.style) as { color?: string }).color).toBe(nocturneDark.danger);
    // Under the result line, before the documents and the Run details row: the platform's order.
    expect(screen.getAllByTestId(/^run-(blocks-0|decision-block|blocks-2|open-details)$/u).map((node) => node.props.testID)).toEqual([
      'run-blocks-0',
      'run-decision-block',
      'run-blocks-2',
      'run-open-details',
    ]);
    expect(screen.queryByTestId('run-deciders')).toBeNull();
    // A plain approval, no changes offered: never the review of each change (Round 21's platform round, F2).
    expect(screen.queryByTestId('run-review-block')).toBeNull();
    expect(screen.queryByText('Save review')).toBeNull();

    const before = runReads();
    await fireEvent.press(screen.getByTestId('run-decision-approve'));
    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith(TEST_WORKSPACE, FORM_APPROVAL, 'approved', 'key'));
    await waitFor(() => expect(runReads()).toBeGreaterThan(before));
    expect(decideApproval).toHaveBeenCalledTimes(1);
  });

  it('its Run details: the held step says where it stands, and offers no buttons', async () => {
    await openRunDetails(held(), { approvals: { approvals: [runApproval('ap-1', 'pending', '2026-10-14T20:03:00Z')] as never }, role: 'owner' });
    const step = within(await screen.findByTestId('run-step-group:done'));
    expect(step.getByText("Waiting for approval: Document 2: the total can't be read.")).toBeTruthy();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Deny')).toBeNull();
    expect(screen.queryByTestId('run-deciders')).toBeNull();
  });

  it('while it saves both wait and the pressed one says "Denying…"; refused, the page says why and offers both again', async () => {
    let refuse: (error: Error) => void = () => undefined;
    (decideApproval as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, reject) => (refuse = reject)));
    await openRun(held(), { role: 'owner' });
    await fireEvent.press(await screen.findByTestId('run-decision-deny'));
    expect(decideApproval).toHaveBeenCalledWith(TEST_WORKSPACE, FORM_APPROVAL, 'rejected', 'key');
    expect(screen.getByText('Denying…')).toBeTruthy();
    expect(screen.getByTestId('run-decision-approve').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('run-decision-deny').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => refuse(new PlatformError('This approval was already decided.', 409, 'CONFLICT')));
    expect(await screen.findByText('This approval was already decided.')).toBeTruthy();
    expect(screen.getByText('Deny')).toBeTruthy();
  });

  it('a role the form does not name: who can decide, and no buttons', async () => {
    await openRun(held(), { role: 'member' });
    expect(await screen.findByTestId('run-deciders')).toBeTruthy();
    expect(screen.getByText('Only owner or admin can decide this.')).toBeTruthy();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Deny')).toBeNull();
  });

  it('a role that cannot be read: the page still draws and says it waits, no buttons', async () => {
    routePlatform(platformOperation, { '/automations': { automations: [invoiceProcessingV3Entry()], categories: ['All', 'Accounting'] } });
    const routed = platformOperation.getMockImplementation()!;
    const detail = held();
    platformOperation.mockImplementation((path: string, ...rest: unknown[]) => {
      if (path === '/v1/workspaces') return Promise.reject(new PlatformError('Service Unavailable', 503));
      return path.endsWith(`/runs/${RUN_ID}`) ? Promise.resolve(detail) : routed(path, ...rest);
    });
    setMockParams({ runId: RUN_ID });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect((await screen.findByTestId('run-blocks-0')).props.children).toBe('Waiting for approval.');
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByTestId('run-deciders')).toBeNull();
  });

  it('denied: the line on its page says Denied, with no form and no buttons; step 4 on its Run details says Denied too', async () => {
    const options = { approvals: { approvals: [runApproval('ap-1', 'rejected', '2026-10-14T20:03:00Z')] as never }, role: 'owner' as const };
    const page = await openRun(held('v7-held-denied'), options);
    expect((await screen.findByTestId('run-blocks-0')).props.children).toBe('Denied');
    expect(screen.queryByText('Approve')).toBeNull();
    await page.unmount();
    resetSnapshot();
    await openRunDetails(held('v7-held-denied'), options);
    expect(within(await screen.findByTestId('run-step-group:done')).getByText('Denied')).toBeTruthy();
    expect(screen.queryByText('Approve')).toBeNull();
  });
});

describe("a run's documents and its package (spec A7, C2; the owner's ~04:05Z and AM7; round 24 P10, P12; the platform's blocks since Round 21)", () => {
  const recorded = (status: RunDetail['run']['status'] = 'succeeded', packageAvailable = true) =>
    ipRun(status, [['receive', 'ok', 'Photo', 0]], { blocks: fixtureBlocks('v7-recorded'), packageAvailable });

  it('three invoices: "DOCUMENTS", then "Invoice 1 of 3" … each a closed card of its own — its seller and total under it, its chip — that opens to its type, seller, place, time, numbers, lines with "quantity × unit price", totals and result', async () => {
    await openRun(recorded());
    expect(await screen.findByText('Documents')).toBeTruthy();
    for (const at of [2, 3, 4]) {
      expect(screen.getByTestId(`run-blocks-${at}-toggle`).props.accessibilityState).toMatchObject({ expanded: false });
      expect(screen.queryByTestId(`run-blocks-${at}-body`)).toBeNull();
    }
    expect(screen.getByTestId('run-blocks-2-toggle').props.accessibilityLabel).toBe('Invoice 1 of 3, Harbor Paper Co. · $102.60, Recorded');
    expect((StyleSheet.flatten(screen.getByTestId('run-blocks-2-badge').props.style) as { color?: string }).color).toBe(status.ok);
    expect(screen.queryByText('Copy paper, case')).toBeNull();

    // #3 opens on its own, and only #3.
    await fireEvent.press(screen.getByTestId('run-blocks-4-toggle'));
    expect(screen.queryByTestId('run-blocks-2-body')).toBeNull();
    const third = within(screen.getByTestId('run-blocks-4-body'));
    expect(visibleWords(screen.getByTestId('run-blocks-4-body')).slice(0, 8)).toEqual([
      'Document type',
      'Bill',
      'Format',
      'PDF',
      'Bill · Harbor Paper Co.',
      '18 Dock St, Salem, OR',
      'Oct 14, 2026 · 2:32 PM',
      'Invoice #',
    ]);
    expect(third.getByText('2 × $41.50')).toBeTruthy();
    expect(third.getByText('More lines on the document.')).toBeTruthy();
    expect(third.getByText('Card ending 4417')).toBeTruthy();
    expect(third.getByText('Recorded in QuickBooks: bill')).toBeTruthy();
    // Pressed again, it closes.
    await fireEvent.press(screen.getByTestId('run-blocks-4-toggle'));
    expect(screen.queryByTestId('run-blocks-4-body')).toBeNull();
  });

  /** The package file the platform answers (round 24 P12): a signed https link. */
  const pdfLink = (format: 'pdf' | 'xlsx' = 'pdf') => ({
    format,
    filename: `run-${RUN_ID}.${format}`,
    contentType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 52000,
    downloadUrl: `https://files.example.test/run.${format}?sig=1`,
    expiresAt: '2026-10-20T12:00:00Z',
  });

  it('the run package replaces Download JSON (round 24 P12): View package opens the package page; no Download JSON', async () => {
    await openRun(recorded());
    await fireEvent.press(await screen.findByTestId('run-view-package'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/activity/package', params: { runId: RUN_ID } });
    expect(screen.queryByTestId('run-download-json')).toBeNull();
    expect(screen.queryByText('Download JSON')).toBeNull();
    expect(screen.getByText('Download PDF')).toBeTruthy();
    expect(screen.getByText('Download Excel')).toBeTruthy();
  });

  it.each([
    ['run-download-pdf', 'pdf'],
    ['run-download-excel', 'xlsx'],
  ] as const)('%s asks the platform for the %s with a key and the phone\'s zone, saves the signed link into the folder picked in Files — no share sheet — then removes the cache copy', async (testID, format) => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const sent: { body: unknown; key?: string }[] = [];
    const os = Platform.OS;
    Platform.OS = 'ios';
    mockCopies.length = 0;
    try {
      await openRun(recorded(), { packageFile: (request) => (sent.push(request), pdfLink(format)) });
      await fireEvent.press(await screen.findByTestId(testID));
      await waitFor(() => expect(mockCopies).toEqual([`file:///cache/run-${RUN_ID}.${format} -> file:///picked/run-${RUN_ID}.${format}`]));
      expect(share).not.toHaveBeenCalled();
      expect(sent).toEqual([{ body: { format, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, key: 'key' }]);
      expect(downloadSignedFile).toHaveBeenCalledWith(`https://files.example.test/run.${format}?sig=1`, `run-${RUN_ID}.${format}`);
      const saved = await (downloadSignedFile as jest.Mock).mock.results.at(-1)!.value;
      expect(saved.delete).toHaveBeenCalledTimes(1);
    } finally {
      Platform.OS = os;
      share.mockRestore();
    }
  });

  it('Share, after Download PDF and Download Excel, hands the PDF itself to the share sheet, then removes it; no Share on Android', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const os = Platform.OS;
    Platform.OS = 'ios';
    try {
      const view = await openRun(recorded(), { packageFile: () => pdfLink('pdf') });
      const order = within(await screen.findByTestId('run-package-actions')).getAllByText(/^(Download PDF|Download Excel|Share)$/u);
      expect(order.map((node) => node.props.children)).toEqual(['Download PDF', 'Download Excel', 'Share']);
      await fireEvent.press(screen.getByTestId('run-share-package'));
      await waitFor(() => expect(share).toHaveBeenCalledWith({ url: `file:///cache/run-${RUN_ID}.pdf` }));
      const saved = await (downloadSignedFile as jest.Mock).mock.results.at(-1)!.value;
      expect(saved.delete).toHaveBeenCalledTimes(1);
      await view.unmount();
      resetSnapshot();
      Platform.OS = 'android';
      await openRun(recorded());
      await screen.findByTestId('run-download-pdf');
      expect(screen.queryByTestId('run-share-package')).toBeNull();
    } finally {
      Platform.OS = os;
      share.mockRestore();
    }
  });

  it('Download Excel answered with a file that is not a workbook, or one over 25 MiB: "Could not download. Try again.", nothing saved', async () => {
    for (const answer of [pdfLink('pdf'), { ...pdfLink('xlsx'), sizeBytes: 26_214_401 }]) {
      (downloadSignedFile as jest.Mock).mockClear();
      const view = await openRun(recorded(), { packageFile: () => answer });
      await fireEvent.press(await screen.findByTestId('run-download-excel'));
      expect(await screen.findByText('Could not download. Try again.')).toBeTruthy();
      expect(downloadSignedFile).not.toHaveBeenCalled();
      await view.unmount();
      resetSnapshot();
    }
  });

  it('says "Could not download. Try again." when the package cannot be made; no package where the platform offers none (`packageAvailable`)', async () => {
    const view = await openRun(recorded());
    await fireEvent.press(await screen.findByTestId('run-download-pdf'));
    expect(await screen.findByText('Could not download. Try again.')).toBeTruthy();
    await view.unmount();
    resetSnapshot();
    const going = await openRun(recorded('running', false));
    await screen.findByTestId('run-open-details');
    expect(screen.queryByTestId('run-view-package')).toBeNull();
    await going.unmount();
    resetSnapshot();
    await openRun(ipRun('succeeded', []));
    await screen.findByTestId('run-open-details');
    expect(screen.queryByTestId('run-view-package')).toBeNull();
    expect(screen.queryByTestId('run-download-pdf')).toBeNull();
    expect(screen.queryByText('Documents')).toBeNull();
  });

  it('a waiting document reads "Not approved" once its approval was refused (S21): the platform\'s chip, drawn as sent', async () => {
    await openRun(ipRun('held', HELD, { blocks: fixtureBlocks('v7-held-denied') }));
    expect(within(await screen.findByTestId('run-blocks-3-toggle')).getByText('Not approved')).toBeTruthy();
  });

  it("DETAILS: a v1/v2 run's saved lines, label and value, when it wrote no documents", async () => {
    await openRun(ipRun('succeeded', [], { blocks: fixtureBlocks('v2-details') }));
    expect(await screen.findByText('Details')).toBeTruthy();
    expect(visibleWords(screen.getByTestId('run-blocks-2'))).toEqual(['Seller', 'Harbor Paper Co.', 'Total', '$102.60']);
  });
});

