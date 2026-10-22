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
 * Settings › Connections, QuickBooks's row — the one connection row since
 * Build 21 (spec A4; the owner's build 20 items 6 and 7, and his ~04:15Z: "we
 * will list on apples app store not intuits. so we do not need that"): its
 * round symbol at 24 × 24, its name beside it, the account's email or its
 * state under it, and our own Connect / Disconnect — ~~Intuit's Connect to
 * QuickBooks button image, "Disconnect from QuickBooks" and the logo carrying
 * its name~~.
 */

const GMAIL = { providerId: 'gmail', displayName: 'Gmail', description: 'Send mail as you.', scopes: [], authType: 'oauth2', icon: 'envelope' };
const qbConnection = {
  id: 'c-qb',
  providerId: 'quickbooks',
  workspaceId: TEST_WORKSPACE,
  externalAccount: { displayName: 'books@example.com' },
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

describe("QuickBooks's row in Settings › Connections (spec A4)", () => {
  it('is the round symbol at 24 × 24 · QuickBooks Online · Not connected · our Connect — no description, no Intuit button', async () => {
    routeReads([]);
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    const row = within(await screen.findByTestId('connection-row-quickbooks'));
    const mark = row.getByTestId('connection-mark-quickbooks');
    expect(mark.props.accessibilityLabel).toBe('QuickBooks');
    expect(StyleSheet.flatten(mark.props.style)).toEqual({ width: 24, height: 24 });
    expect(row.getByText('QuickBooks Online')).toBeTruthy();
    expect(row.getByText('Not connected')).toBeTruthy();
    expect(within(screen.getByTestId('connection-action-quickbooks')).getByText('Connect')).toBeTruthy();
    for (const gone of ['Records bills and receipts.', 'Connect to QuickBooks', 'Disconnect from QuickBooks']) {
      expect([gone, screen.queryByText(gone), screen.queryByLabelText(gone)]).toEqual([gone, null, null]);
    }
    // Every provider the same row: Gmail's says the same things in the same places.
    expect(within(screen.getByTestId('connection-action-gmail')).getByText('Connect')).toBeTruthy();
    expect(screen.queryByText('CONNECTIONS')).toBeNull();
  });

  it('Connect connects at once — no dialog — says it completed, and the row reads it again: the email and Disconnect', async () => {
    routeReads([], [qbConnection]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: qbConnection });
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('connection-action-quickbooks'));
    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledWith(TEST_WORKSPACE, QUICKBOOKS_PROVIDER));
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
    expect(await screen.findByText('Connection completed successfully.')).toBeTruthy();
    const row = within(await screen.findByTestId('connection-row-quickbooks'));
    expect(await row.findByText('books@example.com')).toBeTruthy();
    expect(within(screen.getByTestId('connection-action-quickbooks')).getByText('Disconnect')).toBeTruthy();
  });

  it.each([
    ['came back failed', () => connectOAuthProvider.mockResolvedValue({ status: 'failed', message: 'QuickBooks did not answer.' }), 'QuickBooks did not answer.'],
    ['came back incomplete', () => connectOAuthProvider.mockResolvedValue({ status: 'incomplete' }), 'The connection could not be completed. Try again or contact an owner.'],
    ['was refused', () => connectOAuthProvider.mockRejectedValue(new PlatformError('Only an owner or admin can connect an account.', 403)), 'Only an owner or admin can connect an account.'],
  ])('a connect that %s says so under its row', async (_case, answer, words) => {
    routeReads([]);
    answer();
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('connection-action-quickbooks'));
    expect(await screen.findByText(words)).toBeTruthy();
  });

  it('connected: Disconnect asks first — "Disconnect QuickBooks Online?" and what it stops — then disconnects it', async () => {
    routeReads([qbConnection], []);
    disconnectConnection.mockResolvedValue({ connection: { ...qbConnection, status: 'disconnected' } });
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('connection-action-quickbooks'));
    const dialog = within(await screen.findByTestId('disconnect-dialog'));
    expect(dialog.getByText('Disconnect QuickBooks Online?')).toBeTruthy();
    expect(dialog.getByText('1 live flow uses it. It stops until you connect it again.')).toBeTruthy();
    expect(disconnectConnection).not.toHaveBeenCalled();
    await fireEvent.press(dialog.getByText('Disconnect'));
    await waitFor(() => expect(disconnectConnection).toHaveBeenCalledWith(TEST_WORKSPACE, 'c-qb'));
    expect(await within(screen.getByTestId('connection-row-quickbooks')).findByText('Not connected')).toBeTruthy();
  });

  it('a member sees the symbol, the name and its state, and no button', async () => {
    routeReads([qbConnection]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('member'));
    const row = within(await screen.findByTestId('connection-row-quickbooks'));
    expect(row.getByTestId('connection-mark-quickbooks')).toBeTruthy();
    expect(row.getByText('books@example.com')).toBeTruthy();
    expect(screen.queryByTestId('connection-action-quickbooks')).toBeNull();
    expect(screen.queryByText('Disconnect')).toBeNull();
  });
});
