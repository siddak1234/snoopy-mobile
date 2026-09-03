import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import SettingsScreen from '@/app/(tabs)/settings';
import { signedInSession } from '@/test/platform';
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
const { connectOAuthProvider } = jest.requireMock('@/lib/platform/connections');

/**
 * What the CONNECTIONS card does when the system browser comes back without a
 * handoff.
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
    await renderWithProviders(<SettingsScreen />, signedInSession);

    expect(await screen.findByText('Not connected')).toBeTruthy();
    const readsBefore = reads.filter((path) => path.endsWith('/connections')).length;

    await openGmailAndConnect();

    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Connect Gmail')).toBeNull());
    await waitFor(() =>
      expect(reads.filter((path) => path.endsWith('/connections')).length).toBe(readsBefore + 1),
    );
    // The truth the re-read established, rendered from the published field.
    expect(await screen.findByText('Connected · used by 1 solution')).toBeTruthy();
    expect(screen.queryByText('Not connected')).toBeNull();
  });

  it('keeps a real failure inline, on the loaded screen', async () => {
    const reads = routeReads([[]]);
    connectOAuthProvider.mockResolvedValue({
      status: 'failed',
      message: 'No web browser is available on this device to continue.',
    });
    await renderWithProviders(<SettingsScreen />, signedInSession);
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
