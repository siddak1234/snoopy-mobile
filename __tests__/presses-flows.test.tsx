import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import SolutionsScreen from '@/app/(tabs)/flows/add';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import FlowsScreen from '@/app/(tabs)/flows/index';
import SetupScreen from '@/app/(tabs)/flows/setup';
import { UNAVAILABLE_NOTE } from '@/lib/content/screen-states';
import type { Subscription } from '@/lib/platform/automations';
import { PlatformError, PlatformUnreachableError } from '@/lib/platform/problem';
import {
  TEST_WORKSPACE,
  catalogPayload,
  flowCatalogPayload,
  planSubscriptionsPayload,
  projectsPayload,
  routePlatform,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
  putFileToSignedUrl: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

// The team the scope control shows is kept on the device; here, in memory.
const mockStored = new Map<string, string | null>();
jest.mock('@/lib/platform/scope-store', () => ({
  readScope: jest.fn(async (workspaceId: string) => mockStored.get(workspaceId) ?? null),
  writeScope: jest.fn(async (workspaceId: string, projectId: string | null) => {
    mockStored.set(workspaceId, projectId);
  }),
}));

const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

/** Every focus callback, so a test can leave a screen and come back to it as a person does. */
const mockFocusEffects: (() => void | (() => void))[] = [];
jest.mock('expo-router', () => {
  const actual = jest.requireActual('@/test/mocks/expo-router');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void | (() => void)) =>
      ReactActual.useEffect(() => {
        mockFocusEffects.push(effect);
        return effect();
      }, [effect]),
  };
});

/**
 * Build 13's button audit (B9), the flows' own presses: each test presses one
 * and holds what the recorded decisions say it does — the screen and params it
 * opens, the request it sends, or the refusal it says — where no earlier test
 * held it. The rest of the flows' presses are held already, each where the
 * report of this pass names it (tab-screens, automation-actions,
 * build13-unarchive-and-one-flow, select-field).
 */

const WS = `/v1/workspaces/${TEST_WORKSPACE}`;

beforeEach(() => {
  mockStored.clear();
  mockFocusEffects.length = 0;
  platformOperation.mockReset();
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  routePlatform(platformOperation);
});

/** A request a screen sent that changes something: its method, path, key and body. */
type Write = { method: string; path: string; key?: string; body?: unknown };

/**
 * Runs every operation against a client that keeps what it was asked, then
 * answers it from `answers` by "METHOD path" (a function — it throws to
 * refuse), or else from the fixture `routePlatform` routed. Called after
 * `routePlatform`, whose routing it keeps.
 */
function keepWrites(answers: Record<string, () => unknown> = {}): Write[] {
  const writes: Write[] = [];
  const routed = platformOperation.getMockImplementation();
  platformOperation.mockImplementation(async (path: string, execute: Function) => {
    let method = 'GET';
    const call =
      (verb: string) =>
      async (_route: string, init?: { params?: { header?: Record<string, string> }; body?: unknown }) => {
        method = verb;
        if (verb !== 'GET') {
          writes.push({ method: verb, path, key: init?.params?.header?.['Idempotency-Key'], body: init?.body });
        }
        return { data: {} };
      };
    const client = { GET: call('GET'), POST: call('POST'), PATCH: call('PATCH'), PUT: call('PUT'), DELETE: call('DELETE') };
    await execute({ automations: client, platform: client, connections: client }, new AbortController().signal);
    const answer = answers[`${method} ${path}`];
    return answer ? answer() : routed?.(path, execute);
  });
  return writes;
}

/** The dialog's own button of that name — the last one on screen. */
async function pressLast(label: string) {
  const buttons = await screen.findAllByText(label);
  await fireEvent.press(buttons[buttons.length - 1]!);
}

/** The catalog with nothing to fill in, `change` applied to each entry. */
function bareCatalog(change: (automation: ReturnType<typeof catalogPayload>['automations'][number]) => object = () => ({})) {
  const catalog = catalogPayload();
  return {
    ...catalog,
    automations: catalog.automations.map((automation) => ({ ...automation, setup: [], ...change(automation) })),
  };
}

/** The flow page for the live "invoice" flow, its subscription changed by `invoice`. */
async function openInvoicePage(invoice: Record<string, unknown>, answers: Record<string, () => unknown> = {}) {
  const subscriptions = subscriptionsPayload().subscriptions.map((row) => (row.id === 'invoice' ? { ...row, ...invoice } : row));
  routePlatform(platformOperation, { '/automations': flowCatalogPayload(), '/subscriptions': { subscriptions } });
  const writes = keepWrites(answers);
  setMockParams({ flow: 'invoice' });
  await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
  expect(await screen.findByText('Invoice triage')).toBeTruthy();
  return writes;
}

/** Setup for tpl.0, not held, the Finance team chosen by the catalog: Activate, refused with `error`. */
async function activateRefusedWith(error: PlatformError) {
  routePlatform(platformOperation, {
    '/automations': bareCatalog(),
    '/projects': projectsPayload('Finance'),
    '/subscriptions': { subscriptions: [] },
  });
  keepWrites({
    [`POST ${WS}/subscriptions`]: () => {
      throw error;
    },
  });
  setMockParams({ template: 'tpl.0', project: 'project-1' });
  await renderWithProviders(<SetupScreen />, signedInSession);
  await fireEvent.press(await screen.findByText('Activate solution'));
}

/** The flow page of a webhook-started flow with no address yet: Create address, refused with `error`. */
async function createAddressRefusedWith(error: PlatformError) {
  await openInvoicePage(
    { triggerKind: 'webhook' },
    {
      [`GET ${WS}/subscriptions/invoice/webhook`]: () => {
        throw new PlatformError('Not found', 404);
      },
      [`POST ${WS}/subscriptions/invoice/webhook`]: () => {
        throw error;
      },
    },
  );
  await fireEvent.press(screen.getByTestId('manage-webhook'));
  await fireEvent.press(await screen.findByText('Create address'));
}

/** The flow page's Run, for a flow that takes a file: Choose file, the upload refused with `error`. */
async function chooseFileRefusedWith(error: PlatformError) {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/notes.exe', name: 'notes.exe', mimeType: 'application/x-msdownload' }],
  });
  (File as unknown as jest.Mock).mockImplementation(() => ({ size: 5, bytes: async () => new Uint8Array(5) }));
  await openInvoicePage(
    { runInput: [{ key: 'receipt', title: 'Receipt', description: 'The file to read', control: 'artifact', required: true }] },
    {
      [`POST ${WS}/uploads`]: () => {
        throw error;
      },
    },
  );
  await fireEvent.press(screen.getByText('Run'));
  await fireEvent.press(await screen.findByTestId('run-file-receipt'));
}

describe("Flows, in a team with no flow while the workspace has some (build 11, D6: the team's own line)", () => {
  it("Add a flow, under the team's line, opens the catalog", async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    const subscriptions = subscriptionsPayload().subscriptions.map((row) => ({ ...row, projectId: null }));
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/subscriptions': { subscriptions },
      '/projects': projectsPayload('Finance'),
    });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText('No flows in this team yet')).toBeTruthy();
    expect(screen.queryByTestId('screen-empty')).toBeNull();
    await fireEvent.press(screen.getByText('Add a flow'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/add');
  });
});

describe('Setup — Activate (24.4: create, then patch its settings; 24.12: the button names Settings › Connections)', () => {
  it('for a flow the workspace does not hold: adds it to the team chosen — POST, with its key — then sets it up and makes it live — PATCH — and opens it', async () => {
    const catalog = bareCatalog(() => ({
      version: 3,
      setup: [
        { section: 'source', key: 'inbox', title: 'Watch inbox', description: 'Where invoices arrive', control: 'text', required: true },
        { section: 'rules', key: 'holdAboveAmount', title: 'Hold above', description: 'Hold larger ones', control: 'money', required: false, defaultValue: 500 },
      ],
    }));
    const created = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'new-0', templateVersion: 3, status: 'draft', projectId: 'project-1' };
    routePlatform(platformOperation, {
      '/automations': catalog,
      '/projects': projectsPayload('Finance'),
      '/subscriptions': { subscriptions: [] },
    });
    const writes = keepWrites({
      [`POST ${WS}/subscriptions`]: () => ({ subscription: created }),
      [`PATCH ${WS}/subscriptions/new-0`]: () => ({ subscription: { ...created, status: 'live' } }),
    });
    setMockParams({ template: 'tpl.0', project: 'project-1' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    await fireEvent.changeText(await screen.findByLabelText('Watch inbox'), 'ap@acme.co');
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'new-0' } }),
    );
    expect(writes).toEqual([
      {
        method: 'POST',
        path: `${WS}/subscriptions`,
        key: expect.stringMatching(/^subscribe-/u),
        body: { templateId: 'tpl.0', templateVersion: 3, projectId: 'project-1' },
      },
      {
        method: 'PATCH',
        path: `${WS}/subscriptions/new-0`,
        key: expect.stringMatching(/^activate-/u),
        body: { config: { inbox: 'ap@acme.co', holdAboveAmount: 500 }, status: 'live' },
      },
    ]);
  });

  it('while an account its flow needs is unconnected: the button says where to connect it, opens Settings › Connections, and sends nothing', async () => {
    const held: Subscription = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'held-0', projectId: 'project-1', status: 'paused', unmetConnections: ['hubspot'] };
    routePlatform(platformOperation, {
      '/automations': bareCatalog(),
      '/projects': projectsPayload('Finance'),
      '/subscriptions': { subscriptions: [held], subscription: held },
    });
    const writes = keepWrites();
    setMockParams({ template: 'tpl.0' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Connect HubSpot in Settings › Connections'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/connections');
    expect(writes).toEqual([]);
  });
});

/**
 * Setup's two keys, held where a key is spent (backend manifest §12.2 #20: the
 * re-mints were written by hand and no test stood behind them). Catalog keys a
 * request on the workspace and the key alone, and answers a key it has seen
 * from what the first request did — or with a 409 — never acting again. So a
 * key goes with one intent: a retry keeps it, and a changed body or a success
 * spends it (DESIGN-CONTRACT, "An idempotency key is the identity of one
 * intent").
 */
describe("Setup — each request's key (DESIGN-CONTRACT: a retry keeps it; a changed body or a success spends it)", () => {
  /** tpl.0 with one field, filled by default: Activate sends at once, and an edit changes what it sends. */
  const inboxCatalog = () =>
    bareCatalog(() => ({
      setup: [
        { section: 'source', key: 'inbox', title: 'Watch inbox', description: 'Where invoices arrive', control: 'text', required: true, defaultValue: 'ap@acme.co' },
      ],
    }));

  /** What a create answers: a draft in the Finance team that owes no account. */
  const draft = (id: string): Subscription => ({
    ...planSubscriptionsPayload().subscriptions[0]!,
    id,
    status: 'draft',
    projectId: 'project-1',
  });

  const refused = (): never => {
    throw new PlatformError('Service Unavailable', 503);
  };

  /** Setup for tpl.0, held nowhere, in the teams named, the first chosen by the catalog. */
  async function openSetup(answers: Record<string, () => unknown>, kinds = ['Finance']) {
    routePlatform(platformOperation, {
      '/automations': inboxCatalog(),
      '/projects': projectsPayload(...kinds),
      '/subscriptions': { subscriptions: [] },
    });
    const writes = keepWrites(answers);
    setMockParams({ template: 'tpl.0', project: 'project-1' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    return writes;
  }

  const opened = (flow: string) => ({ pathname: '/(tabs)/flows/detail', params: { flow } });

  it('a refused create, tried again, keeps its key, and so does the refused activation of the copy it added — the same request sent again', async () => {
    let creates = 0;
    let activations = 0;
    const writes = await openSetup({
      [`POST ${WS}/subscriptions`]: () => (++creates === 1 ? refused() : { subscription: draft('new-0') }),
      [`PATCH ${WS}/subscriptions/new-0`]: () =>
        ++activations === 1 ? refused() : { subscription: { ...draft('new-0'), status: 'live' } },
    });
    await fireEvent.press(await screen.findByText('Activate solution'));
    await fireEvent.press(within(await screen.findByTestId('action-failure')).getByText('Try again'));
    await waitFor(() => expect(writes.map((write) => write.method)).toEqual(['POST', 'POST', 'PATCH']));
    // The create began the copy from nothing (Catalog stores `{}`), so the
    // activation tried again sends what the refused one sent: a retry, not a
    // new intent.
    await fireEvent.press(within(await screen.findByTestId('action-failure')).getByText('Try again'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(opened('new-0')));
    const [create, createAgain, activate, activateAgain] = writes;
    expect(createAgain).toEqual(create);
    expect(activateAgain).toEqual(activate);
  });

  it('added, its activation lost, then archived on the website: adding it again sends a new create key, and its activation a new key — the spent ones would answer for the first copy', async () => {
    let listed: Subscription[] = [];
    let creates = 0;
    const writes = await openSetup({
      [`GET ${WS}/subscriptions`]: () => ({ subscriptions: listed }),
      [`POST ${WS}/subscriptions`]: () => ({ subscription: draft(`new-${creates++}`) }),
      [`PATCH ${WS}/subscriptions/new-0`]: () => {
        throw new PlatformUnreachableError();
      },
      [`PATCH ${WS}/subscriptions/new-1`]: () => ({ subscription: { ...draft('new-1'), status: 'live' } }),
    });
    await fireEvent.press(await screen.findByText('Activate solution'));
    expect(await screen.findByText('The platform is unreachable')).toBeTruthy();

    // The person leaves and comes back; meanwhile the copy was archived. The
    // return drops the local draft and re-reads: nothing is held, so the team
    // is offered again.
    listed = [{ ...draft('new-0'), status: 'archived' }];
    await act(async () => {
      for (const effect of mockFocusEffects) effect();
    });
    expect(await screen.findByLabelText('Add to: Team: Finance')).toBeTruthy();
    expect(screen.queryByTestId('setup-held')).toBeNull();

    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(opened('new-1')));
    expect(writes.map((write) => [write.method, write.path])).toEqual([
      ['POST', `${WS}/subscriptions`],
      ['PATCH', `${WS}/subscriptions/new-0`],
      ['POST', `${WS}/subscriptions`],
      ['PATCH', `${WS}/subscriptions/new-1`],
    ]);
    const [create, activate, createAgain, activateAgain] = writes;
    expect(createAgain!.key).not.toBe(create!.key);
    expect(activateAgain!.key).not.toBe(activate!.key);
  });

  it('a field edited after a refused activation is a new intent: the new settings go with a new key, never under the refused one', async () => {
    const held: Subscription = { ...draft('held-0'), status: 'paused' };
    routePlatform(platformOperation, {
      '/automations': inboxCatalog(),
      '/projects': projectsPayload('Finance'),
      '/subscriptions': { subscriptions: [held], subscription: held },
    });
    let activations = 0;
    const writes = keepWrites({
      [`PATCH ${WS}/subscriptions/held-0`]: () =>
        ++activations === 1 ? refused() : { subscription: { ...held, status: 'live' } },
    });
    setMockParams({ template: 'tpl.0' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Activate solution'));
    const failure = await screen.findByTestId('action-failure');

    await fireEvent.changeText(screen.getByLabelText('Watch inbox'), 'billing@acme.co');
    await fireEvent.press(within(failure).getByText('Try again'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(opened('held-0')));
    expect(writes.map((write) => write.body)).toEqual([
      { config: { inbox: 'ap@acme.co' }, status: 'live' },
      { config: { inbox: 'billing@acme.co' }, status: 'live' },
    ]);
    expect(writes[1]!.key).not.toBe(writes[0]!.key);
  });

  it('another team chosen after a refused create is a new intent: the create for that team goes with a new key', async () => {
    let creates = 0;
    const forSales = { ...draft('new-0'), projectId: 'project-2' };
    const writes = await openSetup(
      {
        [`POST ${WS}/subscriptions`]: () => (++creates === 1 ? refused() : { subscription: forSales }),
        [`PATCH ${WS}/subscriptions/new-0`]: () => ({ subscription: { ...forSales, status: 'live' } }),
      },
      ['Finance', 'Sales'],
    );
    await fireEvent.press(await screen.findByText('Activate solution'));
    expect(await screen.findByTestId('action-failure')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('setup-team'));
    await fireEvent.press(screen.getByText('Team: Sales'));
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(opened('new-0')));
    const [first, second] = writes;
    expect(first).toMatchObject({ method: 'POST', body: { projectId: 'project-1' } });
    expect(second).toMatchObject({ method: 'POST', body: { projectId: 'project-2' } });
    expect(second!.key).not.toBe(first!.key);
  });

  it('made live, the activation is spent: Activate again on the same screen is a new intent with a new key — never a replay of the one that succeeded', async () => {
    const writes = await openSetup({
      [`POST ${WS}/subscriptions`]: () => ({ subscription: draft('new-0') }),
      [`PATCH ${WS}/subscriptions/new-0`]: () => ({ subscription: { ...draft('new-0'), status: 'live' } }),
    });
    await fireEvent.press(await screen.findByText('Activate solution'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(opened('new-0')));

    // On a phone the screen is dismissed by now; the unit router opens nothing,
    // so it stays, and the rule is held here.
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() => expect(writes.map((write) => write.method)).toEqual(['POST', 'PATCH', 'PATCH']));
    expect(writes[2]!.body).toEqual(writes[1]!.body);
    expect(writes[2]!.key).not.toBe(writes[1]!.key);
  });
});

describe("The flow page's Run (24.4.1: the run's page shows each step as it happens)", () => {
  it("Start run starts this flow's run with what was entered, closes the dialog and opens the run's page", async () => {
    const writes = await openInvoicePage(
      { runInput: [{ key: 'note', title: 'Note', description: 'What to do', control: 'text', required: true }] },
      { [`POST ${WS}/runs`]: () => ({ run: { id: 'run-42' } }) },
    );
    await fireEvent.press(screen.getByText('Run'));
    expect(await screen.findByTestId('run-dialog')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Pay the Acme invoice');
    await pressLast('Start run');
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(home)/run', params: { runId: 'run-42' } }),
    );
    expect(writes).toEqual([
      {
        method: 'POST',
        path: `${WS}/runs`,
        key: expect.stringMatching(/^run-/u),
        body: { subscriptionId: 'invoice', input: { note: 'Pay the Acme invoice' } },
      },
    ]);
    expect(screen.queryByTestId('run-dialog')).toBeNull();
  });
});

describe('An automation that failed its probe (DESIGN-CONTRACT: its Add / Activate / create actions are refused; Go live only on an available automation)', () => {
  it.each([
    {
      press: 'Add, on the catalog',
      route: () =>
        routePlatform(platformOperation, {
          '/automations': { ...catalogPayload(), automations: catalogPayload().automations.map((a) => (a.templateId === 'tpl.1' ? { ...a, available: false } : a)) },
          '/subscriptions': { subscriptions: [] },
        }),
      open: async () => {
        await renderWithProviders(<SolutionsScreen />, signedInSession);
        return screen.findByTestId('add-tpl.1');
      },
    },
    {
      press: 'Activate, on Setup',
      route: () =>
        routePlatform(platformOperation, {
          '/automations': bareCatalog((a) => ({ available: a.templateId !== 'tpl.0' })),
          '/projects': projectsPayload('Finance'),
          '/subscriptions': { subscriptions: [] },
        }),
      open: async () => {
        setMockParams({ template: 'tpl.0', project: 'project-1' });
        await renderWithProviders(<SetupScreen />, signedInSession);
        return screen.findByText('Activate solution');
      },
    },
    {
      press: 'Resume, on the flow page',
      route: () =>
        routePlatform(platformOperation, {
          '/automations': {
            ...flowCatalogPayload(),
            automations: flowCatalogPayload().automations.map((a) => (a.templateId === 'tplflow.kpi' ? { ...a, available: false } : a)),
          },
        }),
      open: async () => {
        setMockParams({ flow: 'kpi' });
        await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
        return screen.findByText('Resume');
      },
    },
  ])('$press sends nothing and opens nothing, and the screen says it is not responding', async ({ route, open }) => {
    route();
    const writes = keepWrites();
    await fireEvent.press(await open());
    expect(await screen.findByText(UNAVAILABLE_NOTE)).toBeTruthy();
    expect(writes).toEqual([]);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('Try again, under a failed action (DESIGN-CONTRACT: a failed action stays on the loaded screen with the shared inline failure callout; useIntentKeys: a resubmission keeps its key)', () => {
  it.each([
    {
      press: 'Pause, on the flow page',
      open: async () => {
        // The first Pause is lost on the way; the platform keeps what it is sent after that.
        let status = 'live';
        let attempts = 0;
        const rows = () => subscriptionsPayload().subscriptions.map((row) => (row.id === 'invoice' ? { ...row, status } : row));
        const writes = await openInvoicePage(
          {},
          {
            [`GET ${WS}/subscriptions`]: () => ({ subscriptions: rows() }),
            [`PATCH ${WS}/subscriptions/invoice`]: () => {
              attempts += 1;
              if (attempts === 1) throw new PlatformUnreachableError();
              status = 'paused';
              return { subscription: rows()[0] };
            },
          },
        );
        await fireEvent.press(screen.getByText('Pause'));
        return writes;
      },
      done: async () => {
        expect(await screen.findByText('Paused')).toBeTruthy();
        expect(screen.getByText('Resume')).toBeTruthy();
      },
    },
    {
      press: 'Activate, on Setup',
      open: async () => {
        const created = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'new-0', status: 'draft', projectId: 'project-1' };
        let attempts = 0;
        routePlatform(platformOperation, {
          '/automations': bareCatalog(),
          '/projects': projectsPayload('Finance'),
          '/subscriptions': { subscriptions: [] },
        });
        const writes = keepWrites({
          [`POST ${WS}/subscriptions`]: () => {
            attempts += 1;
            if (attempts === 1) throw new PlatformUnreachableError();
            return { subscription: created };
          },
          [`PATCH ${WS}/subscriptions/new-0`]: () => ({ subscription: { ...created, status: 'live' } }),
        });
        setMockParams({ template: 'tpl.0', project: 'project-1' });
        await renderWithProviders(<SetupScreen />, signedInSession);
        await fireEvent.press(await screen.findByText('Activate solution'));
        return writes;
      },
      done: async () => {
        await waitFor(() =>
          expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'new-0' } }),
        );
      },
    },
  ])('$press, lost on the way: Try again sends the same request with the same key, and it lands', async ({ open, done }) => {
    const writes = await open();
    const failure = await screen.findByTestId('action-failure');
    expect(within(failure).getByText('The platform is unreachable')).toBeTruthy();
    expect(writes).toHaveLength(1);
    await fireEvent.press(within(failure).getByText('Try again'));
    await done();
    expect(writes[1]).toEqual(writes[0]);
    expect(screen.queryByTestId('action-failure')).toBeNull();
  });
});

describe("A refusal a person can act on is said in the website's words (DESIGN-CONTRACT's refusal map: uploading its file, issuing a webhook address, Add's two plan reasons — on a 403 only)", () => {
  it.each([
    {
      press: 'Activate, refused 403 over_plan_limit',
      refuse: () => activateRefusedWith(new PlatformError('Forbidden', 403, 'FORBIDDEN', { reason: 'over_plan_limit' })),
      says: 'This workspace has reached its current plan limit.',
    },
    {
      press: 'Activate, refused 403 entitlements_not_configured',
      refuse: () => activateRefusedWith(new PlatformError('Forbidden', 403, 'FORBIDDEN', { reason: 'entitlements_not_configured' })),
      says: 'Subscriptions are unavailable while billing entitlements are not configured.',
    },
    {
      press: 'Activate, refused 409 over_plan_limit (not a 403: the platform\'s own words)',
      refuse: () => activateRefusedWith(new PlatformError('Over the plan limit', 409, 'CONFLICT', { reason: 'over_plan_limit' })),
      says: 'Over the plan limit',
    },
    {
      press: 'Create address, refused trigger_kind_mismatch',
      refuse: () => createAddressRefusedWith(new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'trigger_kind_mismatch' })),
      says: 'This flow is not started by a webhook.',
    },
    {
      press: "Choose file, the upload refused content_type_not_accepted",
      refuse: () => chooseFileRefusedWith(new PlatformError('Unsupported Media Type', 415, 'UNSUPPORTED_MEDIA_TYPE', { reason: 'content_type_not_accepted' })),
      says: 'This flow does not accept that type of file.',
    },
  ])('$press says "$says", and stays', async ({ refuse, says }) => {
    await refuse();
    expect(await screen.findByText(says)).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
