import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import SetupScreen from '@/app/(tabs)/flows/setup';
import ConnectVendorScreen from '@/app/(tabs)/flows/vendor';
import { iconSize } from '@/constants/theme';
import type { Subscription } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fakePlatform, type Answer } from '@/test/fake-platform';
import {
  QUICKBOOKS_PROVIDER,
  TEST_WORKSPACE,
  invoiceProcessingEntry,
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
 * Connect vendor — a flow's own vendor page (the owner's build 19 item 1;
 * backend ADR-0037; spec §3.C, §4): each optional connection as its logo, then
 * None; a tap chooses; a vendor not connected is connected first, with the
 * vendor's own button, and chosen once it is; Done brings the choice back to
 * Set up, Save sends it for an added flow.
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

/** Invoice Processing, added, its vendor choice as `config` holds it. */
const added = (config: Record<string, unknown> = { vendor: 'none', holdAboveAmount: 500 }): Subscription => ({
  ...planSubscriptionsPayload().subscriptions[0]!,
  id: 'ip-1',
  templateId: 'invoice-processing',
  templateVersion: 2,
  status: 'live',
  config,
  setup: invoiceProcessingEntry().setup,
});

function route(options: { connected?: boolean; subscriptions?: Subscription[]; entry?: ReturnType<typeof invoiceProcessingEntry> } = {}) {
  const fake = fakePlatform(platformOperation);
  fake.always(CATALOG, { automations: [options.entry ?? invoiceProcessingEntry()], categories: ['All', 'Accounting'] });
  fake.always(SUBSCRIPTIONS, { subscriptions: options.subscriptions ?? [] });
  fake.always(PROVIDERS, { providers: [...providersPayload().providers, QUICKBOOKS_PROVIDER] });
  fake.always(CONNECTIONS, { connections: options.connected ? [qbConnection] : [] });
  return fake;
}

beforeEach(() => {
  platformOperation.mockReset();
  connectOAuthProvider.mockReset();
  disconnectConnection.mockReset();
  resetSnapshot();
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
});

describe('Connect vendor (spec §3.C)', () => {
  it("says what it is and for which flow, then QuickBooks as its logo — no name beside it — and None last, Save the details only", async () => {
    route({ connected: true });
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    expect(await screen.findByText('Connect vendor')).toBeTruthy();
    expect(screen.getByText('For Invoice Processing')).toBeTruthy();
    const quickbooks = screen.getByTestId('vendor-quickbooks');
    // Intuit's full logo, 24 pt tall, in proportion — never a "QB" tile or the symbol alone.
    const logo = within(quickbooks).getByLabelText('QuickBooks');
    expect(StyleSheet.flatten(logo.props.style)).toEqual({ height: iconSize.row, width: iconSize.row * (2345 / 600) });
    expect(within(quickbooks).queryByText('QuickBooks Online')).toBeNull();
    expect(within(quickbooks).getByText('Connected')).toBeTruthy();
    expect(screen.queryByText(/\bQB\b|QBO/u)).toBeNull();
    const none = screen.getByTestId('vendor-none');
    expect(within(none).getByText('None')).toBeTruthy();
    expect(within(none).getByText('Save the details only.')).toBeTruthy();
    // The flow's default, chosen: None.
    expect(within(none).getByTestId('vendor-chosen')).toBeTruthy();
    expect(within(quickbooks).queryByTestId('vendor-chosen')).toBeNull();
  });

  it('chooses with a tap — a connected vendor, then None again — and Done takes the choice back to Set up for a flow not added yet', async () => {
    route({ connected: true });
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('vendor-quickbooks-choice'));
    expect(within(screen.getByTestId('vendor-quickbooks')).getByTestId('vendor-chosen')).toBeTruthy();
    await fireEvent.press(screen.getByText('Done'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/setup',
      params: { template: 'invoice-processing', vendor: 'quickbooks' },
    });

    await fireEvent.press(screen.getByTestId('vendor-none'));
    await fireEvent.press(screen.getByText('Done'));
    expect(mockRouter.dismissTo).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/flows/setup',
      params: { template: 'invoice-processing', vendor: 'none' },
    });
  });

  it('opens on the choice Set up brought, for a flow not added yet', async () => {
    route({ connected: true });
    setMockParams({ template: 'invoice-processing', vendor: 'quickbooks' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    expect(within(await screen.findByTestId('vendor-quickbooks')).getByTestId('vendor-chosen')).toBeTruthy();
  });

  it("not connected, an owner or admin gets Intuit's own Connect to QuickBooks button — at its size — and the vendor is chosen once its connect returns", async () => {
    const fake = route();
    connectOAuthProvider.mockImplementation(async () => {
      fake.always(CONNECTIONS, { connections: [qbConnection] });
      return { status: 'connected', connection: { ...qbConnection } };
    });
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<ConnectVendorScreen />, sessionAs('admin'));
    const row = await screen.findByTestId('vendor-quickbooks');
    // Not connected is no choice yet: the row does not choose it.
    await fireEvent.press(within(row).getByTestId('vendor-quickbooks-choice'));
    expect(within(row).queryByTestId('vendor-chosen')).toBeNull();
    // Intuit's tall green button, its own image, at its own size (274 × 48 pt).
    expect(within(row).getByLabelText('Connect to QuickBooks')).toBeTruthy();
    expect(StyleSheet.flatten(within(row).getByTestId('vendor-connect-quickbooks-image').props.style)).toEqual({
      width: 274,
      height: 48,
    });
    await fireEvent.press(within(row).getByTestId('vendor-connect-quickbooks'));
    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledWith(TEST_WORKSPACE, QUICKBOOKS_PROVIDER));
    await waitFor(() => expect(within(screen.getByTestId('vendor-quickbooks')).getByTestId('vendor-chosen')).toBeTruthy());
    expect(await within(screen.getByTestId('vendor-quickbooks')).findByText('Connected')).toBeTruthy();
  });

  it.each([
    ['failed', { status: 'failed', message: 'QuickBooks did not answer.' }, 'QuickBooks did not answer.'],
    ['incomplete', { status: 'incomplete' }, 'The connection could not be completed. Try again or contact an owner.'],
  ] as const)('a connect that came back %s says so in the connections words, and chooses nothing', async (_case, outcome, words) => {
    route();
    connectOAuthProvider.mockResolvedValue(outcome);
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('vendor-connect-quickbooks'));
    expect(await screen.findByText(words)).toBeTruthy();
    expect(within(screen.getByTestId('vendor-none')).getByTestId('vendor-chosen')).toBeTruthy();
  });

  it('a connect the platform refused says its words', async () => {
    route();
    connectOAuthProvider.mockRejectedValue(new PlatformError('Only an owner or admin can connect an account.', 403));
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('vendor-connect-quickbooks'));
    expect(await screen.findByText('Only an owner or admin can connect an account.')).toBeTruthy();
  });

  it('not connected, a member is told who connects it, and has no button', async () => {
    route();
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<ConnectVendorScreen />, sessionAs('member'));
    const row = await screen.findByTestId('vendor-quickbooks');
    expect(within(row).getByText('Ask an owner or admin to connect it.')).toBeTruthy();
    expect(within(row).queryByLabelText('Connect to QuickBooks')).toBeNull();
    expect(within(row).queryByText('Disconnect from QuickBooks')).toBeNull();
  });

  it("connected, an owner or admin can disconnect it in Intuit's words — confirmed first — and the choice falls back to None", async () => {
    const fake = route({ connected: true });
    disconnectConnection.mockImplementation(async () => {
      fake.always(CONNECTIONS, { connections: [] });
    });
    setMockParams({ template: 'invoice-processing', vendor: 'quickbooks' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Disconnect from QuickBooks'));
    const dialog = await screen.findByTestId('vendor-disconnect-dialog');
    expect(within(dialog).getByText('Disconnect from QuickBooks?')).toBeTruthy();
    expect(within(dialog).getByText('You can connect it again any time.')).toBeTruthy();
    await fireEvent.press(within(dialog).getByText('Disconnect'));
    await waitFor(() => expect(disconnectConnection).toHaveBeenCalledWith(TEST_WORKSPACE, 'c-qb'));
    await waitFor(() => expect(screen.queryByTestId('vendor-disconnect-dialog')).toBeNull());
    expect(within(screen.getByTestId('vendor-none')).getByTestId('vendor-chosen')).toBeTruthy();
    expect(await within(screen.getByTestId('vendor-quickbooks')).findByLabelText('Connect to QuickBooks')).toBeTruthy();
  });

  it('for an added flow: Save sends the choice as its setting — the rest of its settings kept — then goes back', async () => {
    const fake = route({ connected: true, subscriptions: [added()] });
    fake.always(SAVE, { subscription: added({ vendor: 'quickbooks', holdAboveAmount: 500 }) });
    setMockParams({ template: 'invoice-processing', flow: 'ip-1' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('vendor-quickbooks-choice'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')).toEqual([
      expect.objectContaining({
        values: { workspaceId: TEST_WORKSPACE, subscriptionId: 'ip-1' },
        key: expect.stringMatching(/^vendor-/u),
        body: { config: { vendor: 'quickbooks', holdAboveAmount: 500 } },
      }),
    ]);
  });

  it('for an added flow: Save with the choice unchanged sends nothing, and goes back', async () => {
    const fake = route({ connected: true, subscriptions: [added({ vendor: 'quickbooks' })] });
    setMockParams({ template: 'invoice-processing', flow: 'ip-1' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    expect(within(await screen.findByTestId('vendor-quickbooks')).getByTestId('vendor-chosen')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(fake.to(SAVE)).toEqual([]);
  });

  it('says a save that failed in plain words, and stays', async () => {
    const fake = route({ connected: true, subscriptions: [added()] });
    fake.always(SAVE, () => {
      throw new PlatformError('Unprocessable', 422, 'INVALID', { reason: 'invalid_config' });
    });
    setMockParams({ template: 'invoice-processing', flow: 'ip-1' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('vendor-quickbooks-choice'));
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Could not save. Try again.')).toBeTruthy();
    expect(screen.queryByText('Unprocessable')).toBeNull();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('a vendor with no logo bundled is its icon and its name, with a plain Connect', async () => {
    const entry = invoiceProcessingEntry();
    entry.requiredConnections = [
      ...entry.requiredConnections,
      { providerId: 'hubspot', displayName: 'HubSpot', purpose: 'Records deals.', optional: true },
    ];
    route({ entry });
    connectOAuthProvider.mockResolvedValue({ status: 'cancelled' });
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    const row = await screen.findByTestId('vendor-hubspot');
    expect(within(row).getByText('HubSpot')).toBeTruthy();
    await fireEvent.press(within(row).getByText('Connect'));
    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledWith(TEST_WORKSPACE, providersPayload().providers[0]));
  });

  it("VoiceOver reaches Connect to QuickBooks and Disconnect from QuickBooks: neither sits inside the vendor's radio, which still says the vendor and whether it is chosen", async () => {
    /** Whether an element is inside another that VoiceOver reads as one element (an accessible ancestor). */
    const insideOne = (node: ReturnType<typeof screen.getByTestId>) => {
      for (let up = node.parent; up; up = up.parent) if (up.props.accessible === true) return true;
      return false;
    };
    const fake = route();
    connectOAuthProvider.mockImplementation(async () => {
      fake.always(CONNECTIONS, { connections: [qbConnection] });
      return { status: 'connected', connection: { ...qbConnection } };
    });
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    const connect = await screen.findByTestId('vendor-connect-quickbooks');
    expect(connect.props.accessibilityLabel).toBe('Connect to QuickBooks');
    expect(insideOne(connect)).toBe(false);
    const radio = screen.getByTestId('vendor-quickbooks-choice');
    expect(radio.props).toMatchObject({ accessibilityRole: 'radio', accessibilityLabel: 'QuickBooks Online' });
    expect(radio.props.accessibilityState).toMatchObject({ selected: false, disabled: true });

    await fireEvent.press(connect);
    const disconnect = await screen.findByTestId('vendor-disconnect-quickbooks');
    expect(insideOne(disconnect)).toBe(false);
    expect(screen.getByTestId('vendor-quickbooks-choice').props.accessibilityState).toMatchObject({ selected: true, disabled: false });
  });

  it('a choice brought by the link that is not one of this flow\'s is ignored: the page opens on None, and Set up sends None', async () => {
    const fake = route({ connected: true });
    setMockParams({ template: 'invoice-processing', vendor: 'made-up' });
    const page = await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    expect(within(await screen.findByTestId('vendor-none')).getByTestId('vendor-chosen')).toBeTruthy();
    expect(screen.queryByText('made-up')).toBeNull();
    await page.unmount();

    const draft: Subscription = { ...added(), status: 'draft', projectId: 'project-1' };
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    fake.always('POST /v1/workspaces/{workspaceId}/subscriptions', { subscription: draft });
    fake.always(SAVE, (sent) => ({ subscription: { ...draft, status: 'live', config: (sent.body as { config: Record<string, unknown> }).config } }));
    setMockParams({ template: 'invoice-processing', vendor: 'made-up' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    const row = await screen.findByTestId('setup-vendor');
    expect(within(row).getByText('None')).toBeTruthy();
    expect(screen.queryByText(/made-up/u)).toBeNull();
    await fireEvent.press(screen.getByText('Turn on'));
    await waitFor(() => expect(fake.to(SAVE)).toHaveLength(1));
    expect(fake.to(SAVE)[0]!.body).toMatchObject({ config: { vendor: 'none' }, status: 'live' });
  });

  it('a vendor this deployment does not offer: nothing said of it to an owner — no "Ask an owner or admin", no Connect', async () => {
    const fake = route();
    fake.always(PROVIDERS, providersPayload());
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    const row = await screen.findByTestId('vendor-quickbooks');
    expect(within(row).queryByText('Ask an owner or admin to connect it.')).toBeNull();
    expect(within(row).queryByTestId('vendor-connect-quickbooks')).toBeNull();
    expect(within(row).getByText('QuickBooks Online')).toBeTruthy();
  });

  it('a vendor that takes a pasted key is connected in Settings › Connections, where its key is pasted — never the browser sign-in', async () => {
    const entry = invoiceProcessingEntry();
    entry.requiredConnections = [
      ...entry.requiredConnections,
      { providerId: 'keyed', displayName: 'Keyed Books', purpose: 'Records bills.', optional: true },
    ];
    const fake = route({ entry });
    fake.always(PROVIDERS, {
      providers: [
        ...providersPayload().providers,
        QUICKBOOKS_PROVIDER,
        { providerId: 'keyed', displayName: 'Keyed Books', description: '', scopes: [], authType: 'api-key', icon: 'key', credentialFields: [] },
      ],
    });
    setMockParams({ template: 'invoice-processing' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    await fireEvent.press(within(await screen.findByTestId('vendor-keyed')).getByText('Connect'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/connections');
    expect(connectOAuthProvider).not.toHaveBeenCalled();
  });

  it('is unavailable with no flow named, and a failed load for a flow that is not there', async () => {
    route();
    const none = await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    expect(await screen.findByText("Couldn't load this flow's vendors")).toBeTruthy();
    await none.unmount();
    setMockParams({ template: 'invoice-processing', flow: 'gone' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    expect(await screen.findByText("Couldn't load this flow's vendors")).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });
});
