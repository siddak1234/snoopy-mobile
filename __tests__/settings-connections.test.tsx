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

async function openGmailAndConnect() {
  await fireEvent.press(await screen.findByText('Gmail'));
  expect(await screen.findByText('Connect Gmail')).toBeTruthy();
  // The row's own "Connect" link is also on screen; the dialog's button is last.
  const buttons = screen.getAllByText('Connect');
  await fireEvent.press(buttons[buttons.length - 1]);
}

describe('an OAuth connect that comes back cancelled', () => {
  it('closes the dialog and re-reads the workspace connections', async () => {
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
    await waitFor(() => expect(screen.queryByText('Connect Gmail')).toBeNull());
    await waitFor(() =>
      expect(reads.filter((path) => path.endsWith('/connections')).length).toBe(readsBefore + 1),
    );
    // The truth the re-read established, rendered from the published fields.
    expect(await screen.findByText('alex@acme.co · Connected · used by 1 live flow')).toBeTruthy();
    expect(screen.queryByText('Not connected')).toBeNull();
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
    expect(screen.getByText('Connect Gmail')).toBeTruthy();
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
    await fireEvent.press(await screen.findByText('Gmail'));
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
    expect(screen.queryByText('Connect')).toBeNull();
    expect(
      screen.getByText('Only an owner or admin of this workspace can connect or disconnect an account.'),
    ).toBeTruthy();
  });
});

describe('the connection dialog’s actions (feedback #2)', () => {
  it('stacks the actions of a connected, replaceable connection — Reconnect, Replace account, Disconnect — and keeps two in a row', async () => {
    // The first TestFlight build drew Cancel and Replace account on one line
    // and Disconnect alone on a second, right-aligned — a wrapped row read as
    // broken. Three actions or more stack at full width; two still share a row.
    const { StyleSheet } = jest.requireActual('react-native');
    routeReads([[CONNECTED_GMAIL], [CONNECTED_GMAIL]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByText('Gmail'));
    expect(within(await screen.findByTestId('connection-dialog')).getByText('Reconnect')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('connection-dialog-actions').props.style).flexDirection).toBe('column');

    await fireEvent.press(screen.getByText('Replace account'));
    expect(await screen.findByText('Replace alex@acme.co?')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('replace-account-dialog-actions').props.style).flexDirection).toBe('row');
  });
});

describe('replacing a connection’s account', () => {
  async function openReplace() {
    await fireEvent.press(await screen.findByText('Gmail'));
    expect(within(await screen.findByTestId('connection-dialog')).getByText('Disconnect')).toBeTruthy();
    await fireEvent.press(screen.getByText('Replace account'));
    expect(await screen.findByText('Replace alex@acme.co?')).toBeTruthy();
    const buttons = screen.getAllByText('Replace account');
    await fireEvent.press(buttons[buttons.length - 1]);
  }

  it('names the exact connection it replaces', async () => {
    routeReads([[CONNECTED_GMAIL], [CONNECTED_GMAIL]]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: CONNECTED_GMAIL });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await openReplace();
    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledTimes(1));
    const [workspaceId, provider, options] = connectOAuthProvider.mock.calls[0];
    expect(workspaceId).toBe(CONNECTED_GMAIL.workspaceId);
    expect(provider.providerId).toBe('gmail');
    expect(options).toEqual({ replaceConnectionId: 'c1' });
  });

  it('says a stale replacement (409) in words, changes nothing, and re-reads when closed', async () => {
    const { PlatformError } = jest.requireActual('@/lib/platform/problem');
    const reads = routeReads([[CONNECTED_GMAIL], [CONNECTED_GMAIL]]);
    connectOAuthProvider.mockRejectedValue(new PlatformError('Conflict', 409));
    await renderWithProviders(<ConnectionsScreen />, sessionAs('admin'));
    await openReplace();
    expect(
      await screen.findByText(
        'This connection changed since this screen loaded, so nothing was replaced. Reload it to see it, then choose again.',
      ),
    ).toBeTruthy();
    const readsBefore = reads.filter((path) => path.endsWith('/connections')).length;
    await fireEvent.press(screen.getByText('Cancel'));
    // The rows were stale: the next choice is made on what is connected now.
    await waitFor(() =>
      expect(reads.filter((path) => path.endsWith('/connections')).length).toBe(readsBefore + 1),
    );
  });

  it('says so when the platform reused the connection instead', async () => {
    routeReads([[CONNECTED_GMAIL]]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: CONNECTED_GMAIL, reused: true });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await openReplace();
    expect(await screen.findByText('alex@acme.co is still connected — there was nothing to replace.')).toBeTruthy();
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
