import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { sessionAs, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

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
const { connectOAuthProvider } = jest.requireMock('@/lib/platform/connections');

/**
 * What the CONNECTIONS card — Settings › Connections, its own page since 24.12 —
 * does when the system browser comes back without a handoff.
 *
 * Manifest §12.1 #79's native residue: a system browser that shares a logged-in
 * WEBSITE session authenticates at the connections callback and finishes at the
 * website, so the connection completes upstream and the app never receives its
 * sealed code. The sheet is then dismissed and arrives here as `cancelled`. The
 * only honest response is to re-read the published connections — which is also
 * the only way a person who really did change their mind sees nothing change.
 */

const PROVIDERS = {
  providers: [
    { providerId: 'gmail', displayName: 'Gmail', description: 'Send mail as you.', scopes: [], authType: 'oauth2', icon: 'envelope' },
  ],
};
const CATALOG = { automations: [], categories: ['All'] };

function routeReads(connections: unknown[]) {
  const reads: string[] = [];
  platformOperation.mockImplementation((path: string) => {
    reads.push(path);
    if (path === '/v1/connections/providers') return Promise.resolve(PROVIDERS);
    if (path.endsWith('/automations')) return Promise.resolve(CATALOG);
    if (path.endsWith('/subscriptions')) return Promise.resolve({ subscriptions: [] });
    return Promise.resolve({ connections: connections.splice(0, 1)[0] ?? [] });
  });
  return reads;
}

beforeEach(() => {
  platformOperation.mockReset();
  connectOAuthProvider.mockReset();
});

/** The row's own Connect — through the provider at once, no dialog since Build 21 (spec A4). */
async function openGmailAndConnect() {
  await fireEvent.press(await screen.findByTestId('connection-action-gmail'));
}

describe('an OAuth connect that comes back cancelled', () => {
  it('re-reads the workspace connections, and the row says what the re-read found', async () => {
    const connected = {
      id: 'c1',
      providerId: 'gmail',
      workspaceId: signedInSession.status === 'signed-in' ? signedInSession.session.user.activeWorkspaceId : '',
      externalAccount: { id: 'a1', displayName: 'alex@acme.co' },
      status: 'connected',
      requiredScopes: [],
      grantedScopes: [],
      usedByCount: 1,
    };
    // First read: nothing connected. Second read, after the sheet: the
    // connection the website completed.
    const reads = routeReads([[], [connected]]);
    connectOAuthProvider.mockResolvedValue({ status: 'cancelled' });
    await renderWithProviders(<ConnectionsScreen />, signedInSession);

    expect(await screen.findByText('Not connected')).toBeTruthy();
    const readsBefore = reads.filter((path) => path.endsWith('/connections')).length;

    await openGmailAndConnect();

    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
    await waitFor(() =>
      expect(reads.filter((path) => path.endsWith('/connections')).length).toBe(readsBefore + 1),
    );
    // The truth the re-read established, from the published fields: the account's email (spec A4).
    expect(await screen.findByText('alex@acme.co')).toBeTruthy();
    expect(screen.queryByText('Not connected')).toBeNull();
    expect(screen.queryByText(/used by/u)).toBeNull();
  });

  it('keeps a real failure inline, on the loaded screen', async () => {
    const reads = routeReads([[]]);
    connectOAuthProvider.mockResolvedValue({
      status: 'failed',
      message: 'No web browser is available on this device to continue.',
    });
    await renderWithProviders(<ConnectionsScreen />, signedInSession);
    expect(await screen.findByText('Not connected')).toBeTruthy();
    const readsBefore = reads.filter((path) => path.endsWith('/connections')).length;

    await openGmailAndConnect();

    expect(
      await screen.findByText('No web browser is available on this device to continue.'),
    ).toBeTruthy();
    expect(screen.getByText('Not connected')).toBeTruthy();
    expect(reads.filter((path) => path.endsWith('/connections')).length).toBe(readsBefore);
  });
});

/* ------------------------------------------------ BUILD-PLAN 24.4.3 */

const CONNECTED_GMAIL = {
  id: 'c1',
  providerId: 'gmail',
  workspaceId: signedInSession.status === 'signed-in' ? signedInSession.session.user.activeWorkspaceId : '',
  externalAccount: { id: 'a1', displayName: 'alex@acme.co' },
  status: 'connected',
  requiredScopes: [],
  grantedScopes: [],
  usedByCount: 1,
};


describe('who may change a connection (the Edge refuses a member 403)', () => {
  it('offers a member nothing to press, and says who can change it', async () => {
    routeReads([[CONNECTED_GMAIL]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('member'));
    expect(await screen.findByText('Gmail')).toBeTruthy();
    expect(screen.queryByTestId('connection-action-gmail')).toBeNull();
    expect(screen.queryByText('Disconnect')).toBeNull();
    expect(
      screen.getByText('Only an owner or admin of this workspace can connect or disconnect an account.'),
    ).toBeTruthy();
  });
});

/**
 * ~~The connection dialog's actions, and Replace account~~ until Build 21: the
 * row's one button is Connect, Reconnect or Disconnect (spec A4; the session's
 * S12) — the platform's replace route stays, unused by the row.
 */
describe('the row offers one thing: Disconnect for a connected account, nothing to replace it (spec A4)', () => {
  it('draws no Replace account and no actions dialog for a connected account — Disconnect asks first', async () => {
    routeReads([[CONNECTED_GMAIL]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByTestId('connection-action-gmail'));
    expect(await screen.findByText('Disconnect Gmail?')).toBeTruthy();
    expect(screen.queryByText('Replace account')).toBeNull();
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
    expect(connectOAuthProvider).not.toHaveBeenCalled();
  });
});

describe('Settings › Connections, the integrations page (24.12)', () => {
  it('lists the third-party integrations, and is the empty-state standard with none', async () => {
    const reads = routeReads([[CONNECTED_GMAIL]]);
    const view = await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    expect(await screen.findByText('Gmail')).toBeTruthy();
    expect(screen.getByText('Connections')).toBeTruthy();
    // Integrations only: the sign-in accounts are Account's.
    expect(reads.some((path) => path.includes('/v1/auth/identities'))).toBe(false);
    await view.unmount();

    platformOperation.mockReset();
    platformOperation.mockImplementation((path: string) =>
      Promise.resolve(path === '/v1/connections/providers' ? { providers: [] } : { connections: [] }),
    );
    // A fresh read: the providers are kept in the shared snapshot.
    resetSnapshot();
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    expect(await screen.findByTestId('screen-empty')).toBeTruthy();
    expect(screen.getByText('No integrations yet')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
