import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { QUICKBOOKS_PROVIDER, TEST_WORKSPACE, sessionAs, signedInSession } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
jest.mock('@/lib/platform/connections', () => ({
  connectOAuthProvider: jest.fn(),
  connectProviderWithKey: jest.fn(),
  disconnectConnection: jest.fn(),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');
const { connectOAuthProvider, disconnectConnection } = jest.requireMock('@/lib/platform/connections');

/**
 * Settings › Connections, QuickBooks's row (spec §3.I, §4; Intuit's technical
 * requirements 1.1 and 1.3): its logo in place of the plug and its name; not
 * connected, Intuit's own Connect to QuickBooks button, which connects at once;
 * connected, "Disconnect from QuickBooks" where the button was, opening the
 * connection's actions, where Disconnect says the same words — and no text
 * "Connect" or "Reconnect" stands in for Intuit's button.
 */

const GMAIL = { providerId: 'gmail', displayName: 'Gmail', description: 'Send mail as you.', scopes: [], authType: 'oauth2', icon: 'envelope' };
const qbConnection = {
  id: 'c-qb',
  providerId: 'quickbooks',
  workspaceId: TEST_WORKSPACE,
  externalAccount: { id: 'realm-1', displayName: 'Acme Books' },
  status: 'connected',
  requiredScopes: [],
  grantedScopes: [],
  usedByCount: 1,
};

/** The reads, the connections answering `connections` in turn and then the last. */
function routeReads(...connections: unknown[][]) {
  platformOperation.mockImplementation((path: string) => {
    if (path === '/v1/connections/providers') return Promise.resolve({ providers: [GMAIL, QUICKBOOKS_PROVIDER] });
    if (path.endsWith('/automations')) return Promise.resolve({ automations: [], categories: ['All'] });
    if (path.endsWith('/subscriptions')) return Promise.resolve({ subscriptions: [] });
    const next = connections.length > 1 ? connections.shift()! : connections[0]!;
    return Promise.resolve({ connections: next });
  });
}

beforeEach(() => {
  platformOperation.mockReset();
  connectOAuthProvider.mockReset();
  disconnectConnection.mockReset();
  resetSnapshot();
});

describe("QuickBooks's row in Settings › Connections (spec §3.I)", () => {
  it("is the logo — no plug, no name beside it — with Intuit's Connect to QuickBooks button while not connected, and no text Connect", async () => {
    routeReads([]);
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    const row = await screen.findByTestId('connection-row-quickbooks');
    expect(within(row).getByTestId('connection-logo-quickbooks').props.accessibilityLabel).toBe('QuickBooks');
    expect(within(row).queryByText('QuickBooks Online')).toBeNull();
    expect(within(row).getByText('Records bills and receipts.')).toBeTruthy();
    expect(within(row).getByLabelText('Connect to QuickBooks')).toBeTruthy();
    expect(within(row).queryByText('Connect')).toBeNull();
    expect(within(row).queryByText('Reconnect')).toBeNull();
    // Another provider keeps its words.
    expect(within(screen.getByTestId('connection-row-gmail')).getByText('Connect')).toBeTruthy();
    expect(screen.queryByText('Only providers configured for this deployment are shown.')).toBeNull();
  });

  it("keeps the logo's clear space — 12 pt, Intuit's half the symbol's height — to its description under it", async () => {
    routeReads([]);
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    const row = await screen.findByTestId('connection-row-quickbooks');
    const brand = within(row).getByTestId('brand-of-connection-row-quickbooks');
    expect(within(brand).getByTestId('connection-logo-quickbooks')).toBeTruthy();
    expect(StyleSheet.flatten(brand.props.style)).toMatchObject({ marginBottom: 12 });
  });

  it('the button connects at once — no dialog — says it completed, and the row reads it again as connected', async () => {
    routeReads([], [qbConnection]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: qbConnection });
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('connect-brand-quickbooks'));
    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledWith(TEST_WORKSPACE, QUICKBOOKS_PROVIDER));
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
    expect(await screen.findByText('Connection completed successfully.')).toBeTruthy();
    expect(await within(screen.getByTestId('connection-row-quickbooks')).findByText('Disconnect from QuickBooks')).toBeTruthy();
    expect(within(screen.getByTestId('connection-row-quickbooks')).queryByLabelText('Connect to QuickBooks')).toBeNull();
  });

  it.each([
    ['came back failed', () => connectOAuthProvider.mockResolvedValue({ status: 'failed', message: 'QuickBooks did not answer.' }), 'QuickBooks did not answer.'],
    ['came back incomplete', () => connectOAuthProvider.mockResolvedValue({ status: 'incomplete' }), 'The connection could not be completed. Try again or contact an owner.'],
    ['was refused', () => connectOAuthProvider.mockRejectedValue(new PlatformError('Only an owner or admin can connect an account.', 403)), 'Only an owner or admin can connect an account.'],
  ])('a connect that %s says so under its row', async (_case, answer, words) => {
    routeReads([]);
    answer();
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('connect-brand-quickbooks'));
    expect(await within(screen.getByTestId('connection-row-quickbooks')).findByText(words)).toBeTruthy();
  });

  it("connected: Disconnect from QuickBooks opens its actions — Disconnect in Intuit's words, no text Reconnect — and disconnects it", async () => {
    routeReads([qbConnection], []);
    disconnectConnection.mockResolvedValue({ connection: { ...qbConnection, status: 'disconnected' } });
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('disconnect-brand-quickbooks'));
    const dialog = await screen.findByTestId('connection-dialog');
    expect(within(dialog).queryByText('Reconnect')).toBeNull();
    expect(within(dialog).getByText('Replace account')).toBeTruthy();
    await fireEvent.press(within(dialog).getByText('Disconnect from QuickBooks'));
    await waitFor(() => expect(disconnectConnection).toHaveBeenCalledWith(TEST_WORKSPACE, 'c-qb'));
    expect(await within(screen.getByTestId('connection-row-quickbooks')).findByLabelText('Connect to QuickBooks')).toBeTruthy();
  });

  it('a member sees the logo and its state, and no button or link', async () => {
    routeReads([]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('member'));
    const row = await screen.findByTestId('connection-row-quickbooks');
    expect(within(row).getByTestId('connection-logo-quickbooks')).toBeTruthy();
    expect(within(row).queryByLabelText('Connect to QuickBooks')).toBeNull();
    expect(within(row).queryByText('Disconnect from QuickBooks')).toBeNull();
    expect(screen.getByText('Only an owner or admin of this workspace can connect or disconnect an account.')).toBeTruthy();
  });
});
