import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import ConnectVendorScreen from '@/app/(tabs)/flows/vendor';
import type { Subscription } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fakePlatform, type Answer } from '@/test/fake-platform';
import {
  QUICKBOOKS_PROVIDER,
  TEST_WORKSPACE,
  invoiceProcessingV3Entry,
  planSubscriptionsPayload,
  providersPayload,
  sessionAs,
  signedInSession,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));
// The provider's consent page opens in the system browser: what it comes back with is the test's to say.
jest.mock('@/lib/platform/connections', () => ({
  connectOAuthProvider: jest.fn(),
  disconnectConnection: jest.fn(),
}));
const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');
const { connectOAuthProvider, disconnectConnection } = jest.requireMock('@/lib/platform/connections');

/**
 * Connect vendor — one step's vendor for one flow (Build 21, spec A2; the
 * owner's build 20 item 2: "When i click one of the choices like none i
 * shouldnt need to press done or the back arrow. It should just take me back
 * … and be saved. If i need to connect then after i click and connection
 * happens then it shoukd take me back"): a tap is the choice, saved, and back.
 * Each vendor is the one connection row (A4) with a check on the chosen one;
 * ~~Done, Save, Intuit's Connect button and "Disconnect from QuickBooks"~~.
 */

const CATALOG = 'GET /v1/workspaces/{workspaceId}/automations';
const SUBSCRIPTIONS = 'GET /v1/workspaces/{workspaceId}/subscriptions';
const PROVIDERS = 'GET /v1/connections/providers';
const CONNECTIONS = 'GET /v1/workspaces/{workspaceId}/connections';
const SAVE = 'PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}';

type Connection = Answer<typeof CONNECTIONS>['connections'][number];

const qbConnection: Connection = {
  id: 'c-qb',
  providerId: 'quickbooks',
  workspaceId: TEST_WORKSPACE,
  externalAccount: { id: 'realm-1', displayName: 'Acme Books' },
  status: 'connected',
  requiredScopes: [],
  grantedScopes: [],
  usedByCount: 0,
};

/** Invoice Processing v3, added, its vendor choice as `config` holds it. */
const added = (config: Record<string, unknown> = { vendor: 'none', holdAboveAmount: 500 }): Subscription => ({
  ...planSubscriptionsPayload().subscriptions[0]!,
  id: 'ip-1',
  templateId: 'invoice-processing',
  templateVersion: 3,
  status: 'live',
  config,
  setup: invoiceProcessingV3Entry().setup,
});

function route(
  options: {
    connected?: boolean;
    subscription?: Subscription;
    entry?: ReturnType<typeof invoiceProcessingV3Entry>;
    providers?: Answer<typeof PROVIDERS>['providers'];
    save?: () => Answer<typeof SAVE>;
  } = {},
) {
  const fake = fakePlatform(platformOperation);
  const subscription = options.subscription ?? added();
  fake.always(CATALOG, { automations: [options.entry ?? invoiceProcessingV3Entry()], categories: ['All', 'Accounting'] });
  fake.always(SUBSCRIPTIONS, { subscriptions: [subscription] });
  fake.always(PROVIDERS, { providers: options.providers ?? [...providersPayload().providers, QUICKBOOKS_PROVIDER] });
  fake.always(CONNECTIONS, { connections: options.connected ? [qbConnection] : [] });
  fake.always(SAVE, options.save ?? ((sent) => ({ subscription: { ...subscription, config: (sent.body as { config: Record<string, unknown> }).config } })));
  return fake;
}

async function open(session = signedInSession, field = 'vendor') {
  setMockParams({ flow: 'ip-1', field });
  await renderWithProviders(<ConnectVendorScreen />, session);
  expect(await screen.findByText('Connect vendor')).toBeTruthy();
}

beforeEach(() => {
  platformOperation.mockReset();
  connectOAuthProvider.mockReset();
  disconnectConnection.mockReset();
  resetSnapshot();
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
});

describe('Connect vendor — a tap saves and goes back (spec A2)', () => {
  it('says what it is and for which flow; each vendor the one row — symbol, name, state — then None; the chosen one checked; no Done, no Save', async () => {
    route({ connected: true });
    await open();
    expect(screen.getByText('For Invoice Processing')).toBeTruthy();
    const quickbooks = within(screen.getByTestId('vendor-quickbooks'));
    expect(StyleSheet.flatten(quickbooks.getByLabelText('QuickBooks').props.style)).toEqual({ width: 24, height: 24 });
    expect(quickbooks.getByText('QuickBooks Online')).toBeTruthy();
    expect(quickbooks.getByText('Connected')).toBeTruthy();
    const none = within(screen.getByTestId('vendor-none'));
    expect(none.getByText('None')).toBeTruthy();
    expect(none.getByText('Save the details only.')).toBeTruthy();
    expect(none.getByTestId('vendor-chosen-none').props.width).toBe(24);
    expect(screen.queryByTestId('vendor-chosen-quickbooks')).toBeNull();
    for (const gone of ['Done', 'Save', 'Saving…', 'Connect to QuickBooks', 'Disconnect from QuickBooks', 'Disconnect']) {
      expect([gone, screen.queryByText(gone), screen.queryByLabelText(gone)]).toEqual([gone, null, null]);
    }
    // HubSpot is no vendor of this step: the field names QuickBooks alone (backend ADR-0040).
    expect(screen.queryByTestId('vendor-hubspot')).toBeNull();
  });

  it('tapping None on a QuickBooks flow saves None once — the rest of its settings kept — and goes back, no other tap', async () => {
    const fake = route({ connected: true, subscription: added({ vendor: 'quickbooks', holdAboveAmount: 750 }) });
    await open();
    await fireEvent.press(screen.getByTestId('vendor-none'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(fake.to(SAVE).map((sent) => [sent.values.subscriptionId, sent.body])).toEqual([
      ['ip-1', { config: { vendor: 'none', holdAboveAmount: 750 } }],
    ]);
  });

  it('tapping a connected vendor saves it and goes back; tapping the one already chosen sends nothing and goes back', async () => {
    const fake = route({ connected: true });
    await open();
    await fireEvent.press(screen.getByTestId('vendor-quickbooks'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(fake.to(SAVE).map((sent) => sent.body)).toEqual([{ config: { vendor: 'quickbooks', holdAboveAmount: 500 } }]);

    await fireEvent.press(screen.getByTestId('vendor-none'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(2));
    expect(fake.to(SAVE)).toHaveLength(1);
  });

  it('while it saves, the tapped row says Saving… and the rest wait', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    route({
      connected: true,
      save: () => {
        throw new Error('replaced below');
      },
    });
    const routed = platformOperation.getMockImplementation()!;
    platformOperation.mockImplementation(async (key: string, execute: Function) => {
      if (/\/subscriptions\/ip-1$/u.test(key)) {
        await gate;
        return { subscription: added({ vendor: 'quickbooks' }) };
      }
      return routed(key, execute);
    });
    await open();
    await fireEvent.press(screen.getByTestId('vendor-quickbooks'));
    expect(await within(screen.getByTestId('vendor-quickbooks')).findByText('Saving…')).toBeTruthy();
    expect(screen.getByTestId('vendor-none').props.accessibilityState).toMatchObject({ disabled: true });
    release();
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });

  it('not connected, for an owner or admin: the tap connects through the provider at once, then saves it and goes back', async () => {
    const fake = route();
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: qbConnection });
    await open(sessionAs('admin'));
    expect(within(screen.getByTestId('vendor-quickbooks')).getByText('Not connected')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vendor-quickbooks'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(connectOAuthProvider).toHaveBeenCalledWith(TEST_WORKSPACE, QUICKBOOKS_PROVIDER);
    expect(fake.to(SAVE).map((sent) => sent.body)).toEqual([{ config: { vendor: 'quickbooks', holdAboveAmount: 500 } }]);
  });

  it.each([
    ['came back failed', () => connectOAuthProvider.mockResolvedValue({ status: 'failed', message: 'QuickBooks did not answer.' }), 'QuickBooks did not answer.'],
    ['came back incomplete', () => connectOAuthProvider.mockResolvedValue({ status: 'incomplete' }), 'The connection could not be completed. Try again or contact an owner.'],
    ['was refused', () => connectOAuthProvider.mockRejectedValue(new PlatformError('Only an owner or admin can connect an account.', 403)), 'Only an owner or admin can connect an account.'],
  ])('a connect that %s says so under its row, saves nothing and stays', async (_case, answer, words) => {
    const fake = route();
    answer();
    await open(sessionAs('owner'));
    await fireEvent.press(screen.getByTestId('vendor-quickbooks'));
    expect(await screen.findByText(words)).toBeTruthy();
    expect(fake.to(SAVE)).toEqual([]);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('a cancelled sign-in saves nothing, stays, and reads the connections again — it may have connected at the website', async () => {
    const fake = route();
    connectOAuthProvider.mockResolvedValue({ status: 'cancelled' });
    await open(sessionAs('owner'));
    const reads = fake.to(CONNECTIONS).length;
    await fireEvent.press(screen.getByTestId('vendor-quickbooks'));
    await waitFor(() => expect(fake.to(CONNECTIONS).length).toBe(reads + 1));
    expect(fake.to(SAVE)).toEqual([]);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('not connected, a member is told who connects it, and the row is no choice', async () => {
    const fake = route();
    await open(sessionAs('member'));
    const row = screen.getByTestId('vendor-quickbooks');
    expect(within(row).getByText('Ask an owner or admin to connect it.')).toBeTruthy();
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(row);
    expect(connectOAuthProvider).not.toHaveBeenCalled();
    expect(fake.to(SAVE)).toEqual([]);
  });

  it('says a save that failed in plain words, under the card, and stays', async () => {
    route({
      connected: true,
      save: () => {
        throw new PlatformError('Service Unavailable', 503);
      },
    });
    await open();
    await fireEvent.press(screen.getByTestId('vendor-quickbooks'));
    expect(await screen.findByText('Could not save. Try again.')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('vendor-quickbooks')).queryByText('Saving…')).toBeNull();
  });

  it('a vendor that takes a pasted key is connected in Settings › Connections, where its key is pasted — never the browser sign-in', async () => {
    const keyed = { ...QUICKBOOKS_PROVIDER, authType: 'api-key' as const, credentialFields: [{ name: 'token', label: 'Token', secret: true }] };
    route({ providers: [keyed] });
    await open(sessionAs('owner'));
    await fireEvent.press(screen.getByTestId('vendor-quickbooks'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/connections');
    expect(connectOAuthProvider).not.toHaveBeenCalled();
  });

  it('a vendor this deployment does not list is drawn with nothing to do — no Ask an owner, no Connect', async () => {
    route({ providers: providersPayload().providers });
    await open(sessionAs('owner'));
    const row = screen.getByTestId('vendor-quickbooks');
    expect(within(row).getByText('Not connected')).toBeTruthy();
    expect(within(row).queryByText('Ask an owner or admin to connect it.')).toBeNull();
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("chooses for the step the link names: a version with a vendor per step (ADR-0040) offers that step's vendors alone", async () => {
    const entry = invoiceProcessingV3Entry();
    entry.requiredConnections = [
      ...entry.requiredConnections,
      { providerId: 'hubspot', displayName: 'HubSpot', purpose: 'Emails results.', optional: true },
    ];
    entry.setup = [
      ...entry.setup,
      { section: 'connections', key: 'crm', title: 'CRM', description: 'Where contacts go.', control: 'connection', defaultValue: 'none', required: false, providers: ['hubspot'], group: 'done' },
    ];
    const fake = route({ entry, subscription: { ...added({ vendor: 'quickbooks', crm: 'none' }), setup: entry.setup } });
    fake.always(CONNECTIONS, { connections: [{ ...qbConnection, id: 'c-hs', providerId: 'hubspot' }] });
    await open(signedInSession, 'crm');
    expect(screen.getByTestId('vendor-hubspot')).toBeTruthy();
    expect(screen.queryByTestId('vendor-quickbooks')).toBeNull();
    await fireEvent.press(screen.getByTestId('vendor-hubspot'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(fake.to(SAVE).map((sent) => sent.body)).toEqual([{ config: { vendor: 'quickbooks', crm: 'hubspot' } }]);
  });
});
