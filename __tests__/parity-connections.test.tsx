import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import type { Connection, ConnectionProvider } from '@/lib/platform/connections';
import { PlatformError } from '@/lib/platform/problem';
import { TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));
jest.mock('@/lib/platform/connections', () => ({
  connectOAuthProvider: jest.fn(),
  connectProviderWithKey: jest.fn(),
  disconnectConnection: jest.fn(),
}));
const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');
const { connectOAuthProvider, connectProviderWithKey, disconnectConnection } = jest.requireMock('@/lib/platform/connections');

/**
 * Gate 24's parity line for Settings › Connections — G12 to G16 of its audit:
 * the website's Connections page (`snoopy` `app/account/connections`), its two
 * lists in the app's one, each row and each answer in its words. The
 * operations themselves are mocked here; what they send is held in
 * `platform-mutations` and `presses-settings`.
 */

const GMAIL: ConnectionProvider = { providerId: 'gmail', displayName: 'Gmail', description: 'Send mail as you.', scopes: [], authType: 'oauth2', icon: 'envelope' };
const TWILIO: ConnectionProvider = {
  providerId: 'twilio',
  displayName: 'Twilio',
  description: 'Send texts as you.',
  scopes: [],
  authType: 'api-key',
  icon: 'chat',
  credentialFields: [
    { name: 'accountSid', label: 'Account SID', secret: false, help: 'Starts with AC' },
    { name: 'authToken', label: 'Auth token', secret: true, help: 'In the Twilio console' },
  ],
};
const CONNECTED_GMAIL: Connection = {
  id: 'c1',
  providerId: 'gmail',
  workspaceId: TEST_WORKSPACE,
  externalAccount: { id: 'a1', displayName: 'alex@acme.co' },
  status: 'connected',
  requiredScopes: [],
  grantedScopes: [],
  usedByCount: 2,
};
const BROKEN_GMAIL: Connection = { ...CONNECTED_GMAIL, status: 'reauthorization-required', errorCode: 'refresh_failed', usedByCount: 0 };
const CONNECTED_TWILIO: Connection = {
  ...CONNECTED_GMAIL,
  id: 'c2',
  providerId: 'twilio',
  externalAccount: { id: 'AC123', displayName: 'AC123' },
  usedByCount: 1,
};

/** Every read the screen makes, answered: the providers, and each connections read in turn (the last kept). */
function route(connections: Connection[][], providers: ConnectionProvider[] = [GMAIL, TWILIO]) {
  const reads: string[] = [];
  platformOperation.mockImplementation((path: string) => {
    reads.push(path);
    if (path === '/v1/connections/providers') return Promise.resolve({ providers });
    return Promise.resolve({ connections: connections.length > 1 ? connections.shift() : connections[0] });
  });
  return { connectionReads: () => reads.filter((path) => path.endsWith('/connections')).length };
}

/** The dialog's own button of that name — the last one on screen (a row can carry the same word). */
async function pressInDialog(label: string) {
  const dialog = within(await screen.findByTestId('connection-dialog'));
  const buttons = dialog.getAllByText(label);
  await fireEvent.press(buttons[buttons.length - 1]!);
}

beforeEach(() => {
  platformOperation.mockReset();
  connectOAuthProvider.mockReset();
  connectProviderWithKey.mockReset();
  disconnectConnection.mockReset();
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
});

describe('G12 — a row says the account, its state, the live flows that use it, and when it needs attention', () => {
  it('names the account the connection acts as, and says its flows are live ones', async () => {
    route([[CONNECTED_GMAIL]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    expect(await screen.findByText('alex@acme.co · Connected · used by 2 live flows')).toBeTruthy();
    expect(within(screen.getByTestId('connection-row-twilio')).getByText('Not connected')).toBeTruthy();
  });

  it('a connection with an error code needs attention before it can be used, in the website’s words; one without says nothing of it', async () => {
    route([[BROKEN_GMAIL, CONNECTED_TWILIO]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    const broken = within(await screen.findByTestId('connection-row-gmail'));
    expect(broken.getByText('alex@acme.co · Reauthorization required')).toBeTruthy();
    expect(broken.getByText('This connection needs attention before it can be used.')).toBeTruthy();
    const fine = within(screen.getByTestId('connection-row-twilio'));
    expect(fine.getByText('AC123 · Connected · used by 1 live flow')).toBeTruthy();
    expect(fine.queryByText('This connection needs attention before it can be used.')).toBeNull();
  });
});

describe('G13 — every provider says what it is for, to everyone, and the list says which providers it shows', () => {
  it.each([
    { role: 'owner' as const, who: 'an owner' },
    { role: 'member' as const, who: 'a member' },
  ])('to $who: a connected provider’s description and an unconnected one’s, and the configured-providers line', async ({ role }) => {
    route([[CONNECTED_GMAIL]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs(role));
    expect(within(await screen.findByTestId('connection-row-gmail')).getByText('Send mail as you.')).toBeTruthy();
    expect(within(screen.getByTestId('connection-row-twilio')).getByText('Send texts as you.')).toBeTruthy();
    expect(screen.getByText('Only providers configured for this deployment are shown.')).toBeTruthy();
    expect(screen.queryByText('Only an owner or admin of this workspace can connect or disconnect an account.') !== null).toBe(
      role === 'member',
    );
  });
});

describe('G14 — Connect, or Reconnect: a held connection is reconnected, and a reused answer is said', () => {
  it('a connected OAuth provider offers Reconnect beside Replace account and Disconnect, under its name, and Reconnect asks the provider again for the same account', async () => {
    const { connectionReads } = route([[CONNECTED_GMAIL]]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: CONNECTED_GMAIL });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByTestId('connection-row-gmail'));
    const dialog = within(await screen.findByTestId('connection-dialog'));
    expect(dialog.getByText('Gmail')).toBeTruthy();
    expect(dialog.getByText('alex@acme.co · Connected · used by 2 live flows')).toBeTruthy();
    expect(dialog.getByText('Replace account')).toBeTruthy();
    expect(dialog.getByText('Disconnect')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('connection-dialog-actions').props.style).flexDirection).toBe('column');
    const before = connectionReads();

    await pressInDialog('Reconnect');

    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledTimes(1));
    // Reconnect keeps the account: no connection named for replacement.
    expect(connectOAuthProvider.mock.calls[0]).toEqual([TEST_WORKSPACE, GMAIL]);
    await waitFor(() => expect(screen.queryByTestId('connection-dialog')).toBeNull());
    await waitFor(() => expect(connectionReads()).toBe(before + 1));
    expect(await screen.findByText('Connection completed successfully.')).toBeTruthy();
    expect(disconnectConnection).not.toHaveBeenCalled();
  });

  it.each([
    { press: 'Reconnect', held: [CONNECTED_GMAIL] },
    { press: 'Connect', held: [] as Connection[] },
  ])('$press answered reused says the account is already connected with everything it needs — nothing asked, the rows read again', async ({ press, held }) => {
    const { connectionReads } = route([held]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: CONNECTED_GMAIL, reused: true });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('admin'));
    await fireEvent.press(await screen.findByTestId('connection-row-gmail'));
    const before = connectionReads();

    await pressInDialog(press);

    expect(
      await screen.findByText('Gmail is already connected as alex@acme.co, with everything it needs — there is nothing to authorize.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
    expect(screen.queryByText('Connection completed successfully.')).toBeNull();
    await waitFor(() => expect(connectionReads()).toBe(before + 1));
  });

  it('the notice goes when the next row is opened', async () => {
    route([[CONNECTED_GMAIL]]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: CONNECTED_GMAIL, reused: true });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByTestId('connection-row-gmail'));
    await pressInDialog('Reconnect');
    expect(await screen.findByTestId('connections-notice')).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('connection-row-twilio'));
    expect(screen.queryByTestId('connections-notice')).toBeNull();
  });

  it('a connection that needs reauthorization says Reconnect on its row, and its dialog offers Reconnect and Disconnect — which disconnects it', async () => {
    const { connectionReads } = route([[BROKEN_GMAIL]]);
    disconnectConnection.mockResolvedValue({ connection: { ...BROKEN_GMAIL, status: 'disconnected' } });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    const row = within(await screen.findByTestId('connection-row-gmail'));
    expect(row.getByText('Reconnect')).toBeTruthy();
    expect(row.queryByText('Connect')).toBeNull();
    await fireEvent.press(screen.getByTestId('connection-row-gmail'));
    const dialog = within(await screen.findByTestId('connection-dialog'));
    expect(dialog.getByText('Gmail')).toBeTruthy();
    expect(dialog.getByText('Reconnect')).toBeTruthy();
    const before = connectionReads();

    await pressInDialog('Disconnect');

    await waitFor(() => expect(disconnectConnection).toHaveBeenCalledWith(TEST_WORKSPACE, 'c1'));
    await waitFor(() => expect(screen.queryByTestId('connection-dialog')).toBeNull());
    await waitFor(() => expect(connectionReads()).toBe(before + 1));
    expect(connectOAuthProvider).not.toHaveBeenCalled();
  });

  it('a connection still authorizing is not one to reconnect: Connect, with Replace account beside it as before', async () => {
    route([[{ ...CONNECTED_GMAIL, status: 'authorizing' }]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    expect(within(await screen.findByTestId('connection-row-gmail')).getByText('Connect')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('connection-row-gmail'));
    const dialog = within(await screen.findByTestId('connection-dialog'));
    expect(dialog.getByText('Connect Gmail')).toBeTruthy();
    expect(dialog.getByText('Replace account')).toBeTruthy();
    expect(dialog.queryByText('Reconnect')).toBeNull();
    expect(dialog.queryByText('Disconnect')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('connection-dialog-actions').props.style).flexDirection).toBe('column');
  });

  it('a key provider’s Reconnect asks for its key again in the same dialog — no Replace account — and sends it keyed', async () => {
    const { connectionReads } = route([[CONNECTED_TWILIO]]);
    connectProviderWithKey.mockResolvedValue({ connection: CONNECTED_TWILIO });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByTestId('connection-row-twilio'));
    const actions = within(await screen.findByTestId('connection-dialog'));
    expect(actions.getByText('Twilio')).toBeTruthy();
    expect(actions.queryByText('Replace account')).toBeNull();

    await pressInDialog('Reconnect');

    const form = within(await screen.findByTestId('connection-dialog'));
    expect(form.getByText('Connect Twilio')).toBeTruthy();
    expect(form.queryByText('Disconnect')).toBeNull();
    await fireEvent.changeText(form.getByPlaceholderText('Starts with AC'), 'AC999');
    await fireEvent.changeText(form.getByPlaceholderText('In the Twilio console'), 'new-token');
    const before = connectionReads();
    await pressInDialog('Verify and connect');

    await waitFor(() => expect(connectProviderWithKey).toHaveBeenCalledTimes(1));
    expect(connectProviderWithKey.mock.calls[0]).toEqual([
      TEST_WORKSPACE,
      'twilio',
      { accountSid: 'AC999', authToken: 'new-token' },
      'connection-1',
    ]);
    await waitFor(() => expect(screen.queryByTestId('connection-dialog')).toBeNull());
    await waitFor(() => expect(connectionReads()).toBe(before + 1));
    // A key that verifies says nothing more, as on the website.
    expect(screen.queryByTestId('connections-notice')).toBeNull();
    expect(connectOAuthProvider).not.toHaveBeenCalled();
  });
});

describe('G15 — a pasted key answered 409 may still be verifying', () => {
  async function submitTwilio() {
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByTestId('connection-row-twilio'));
    const form = within(await screen.findByTestId('connection-dialog'));
    expect(form.getByText('Verify and connect')).toBeTruthy();
    await fireEvent.changeText(form.getByPlaceholderText('Starts with AC'), 'AC123');
    await fireEvent.changeText(form.getByPlaceholderText('In the Twilio console'), 'secret-token');
    await pressInDialog('Verify and connect');
  }

  it('says so in the website’s words, and Retry verification sends the same values under the same key', async () => {
    const { connectionReads } = route([[]]);
    connectProviderWithKey
      .mockRejectedValueOnce(new PlatformError('Conflict', 409))
      .mockResolvedValueOnce({ connection: CONNECTED_TWILIO });
    await submitTwilio();

    const dialog = within(await screen.findByTestId('connection-dialog'));
    expect(
      await dialog.findByText(
        'This request may still be in progress. Retry with the same details or refresh the connection list; a new connection request was not created.',
      ),
    ).toBeTruthy();
    expect(dialog.getByText('Conflict')).toBeTruthy();
    expect(dialog.getByText('Retry verification')).toBeTruthy();
    expect(dialog.getByText('Refresh connections')).toBeTruthy();
    expect(dialog.queryByText('Verify and connect')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('connection-dialog-actions').props.style).flexDirection).toBe('column');
    const before = connectionReads();

    await pressInDialog('Retry verification');

    await waitFor(() => expect(connectProviderWithKey).toHaveBeenCalledTimes(2));
    expect(connectProviderWithKey.mock.calls[1]).toEqual(connectProviderWithKey.mock.calls[0]);
    expect(connectProviderWithKey.mock.calls[1][3]).toBe('connection-1');
    await waitFor(() => expect(screen.queryByTestId('connection-dialog')).toBeNull());
    await waitFor(() => expect(connectionReads()).toBe(before + 1));
  });

  it('Refresh connections closes the dialog and reads the rows again, sending nothing', async () => {
    const { connectionReads } = route([[], [CONNECTED_TWILIO]]);
    connectProviderWithKey.mockRejectedValueOnce(new PlatformError('Conflict', 409));
    await submitTwilio();
    expect(await screen.findByText('Refresh connections')).toBeTruthy();
    const before = connectionReads();

    await pressInDialog('Refresh connections');

    await waitFor(() => expect(screen.queryByTestId('connection-dialog')).toBeNull());
    await waitFor(() => expect(connectionReads()).toBe(before + 1));
    // The first request did finish: the row says so now.
    expect(await screen.findByText('AC123 · Connected · used by 1 live flow')).toBeTruthy();
    expect(connectProviderWithKey).toHaveBeenCalledTimes(1);
  });

  it('any other refusal is said with no such guidance, and the button keeps its words', async () => {
    route([[]]);
    connectProviderWithKey.mockRejectedValueOnce(new PlatformError('The credentials were not accepted.', 400));
    await submitTwilio();
    const dialog = within(await screen.findByTestId('connection-dialog'));
    expect(await dialog.findByText('The credentials were not accepted.')).toBeTruthy();
    expect(dialog.queryByText(/may still be in progress/u)).toBeNull();
    expect(dialog.queryByText('Refresh connections')).toBeNull();
    expect(dialog.getByText('Verify and connect')).toBeTruthy();
  });
});

describe('G16 — what a connect came back with is said, as the website’s page says it', () => {
  it('a Connect that completes says so above the rows', async () => {
    route([[], [CONNECTED_GMAIL]]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: CONNECTED_GMAIL });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByTestId('connection-row-gmail'));
    expect(within(await screen.findByTestId('connection-dialog')).getByText('Connect Gmail')).toBeTruthy();
    await pressInDialog('Connect');
    expect(await screen.findByText('Connection completed successfully.')).toBeTruthy();
    expect(await screen.findByText('alex@acme.co · Connected · used by 2 live flows')).toBeTruthy();
  });

  it('a Replace that completes says so too', async () => {
    route([[CONNECTED_GMAIL]]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: { ...CONNECTED_GMAIL, externalAccount: { id: 'a2', displayName: 'sam@acme.co' } } });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByTestId('connection-row-gmail'));
    await pressInDialog('Replace account');
    const confirm = within(await screen.findByTestId('replace-account-dialog'));
    const buttons = confirm.getAllByText('Replace account');
    await fireEvent.press(buttons[buttons.length - 1]!);
    expect(await screen.findByText('Connection completed successfully.')).toBeTruthy();
    expect(connectOAuthProvider.mock.calls[0][2]).toEqual({ replaceConnectionId: 'c1' });
  });

  it.each([
    {
      name: 'Connect, with nothing connected',
      held: [] as Connection[],
      open: async () => pressInDialog('Connect'),
      words: 'The connection could not be completed. Try again or contact an owner.',
      dialog: 'connection-dialog',
    },
    {
      name: 'Reconnect, with the account connected',
      held: [CONNECTED_GMAIL],
      open: async () => pressInDialog('Reconnect'),
      words: "The new authorization didn't complete, so nothing changed — your existing connection is still active. Try again or contact an owner.",
      dialog: 'connection-dialog',
    },
    {
      name: 'Reconnect, with the connection needing reauthorization — which is not active',
      held: [BROKEN_GMAIL],
      open: async () => pressInDialog('Reconnect'),
      words: 'The connection could not be completed. Try again or contact an owner.',
      dialog: 'connection-dialog',
    },
    {
      name: 'Replace account, with the account connected',
      held: [CONNECTED_GMAIL],
      open: async () => {
        await pressInDialog('Replace account');
        const buttons = within(await screen.findByTestId('replace-account-dialog')).getAllByText('Replace account');
        await fireEvent.press(buttons[buttons.length - 1]!);
      },
      words: "The new authorization didn't complete, so nothing changed — your existing connection is still active. Try again or contact an owner.",
      dialog: 'replace-account-dialog',
    },
  ])('$name: back without the connection, it says whether what was connected still is — and changes nothing', async ({ held, open, words, dialog }) => {
    const { connectionReads } = route([held]);
    connectOAuthProvider.mockResolvedValue({ status: 'incomplete' });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByTestId('connection-row-gmail'));
    const before = connectionReads();

    await open();

    expect(await within(screen.getByTestId(dialog)).findByText(words)).toBeTruthy();
    expect(connectionReads()).toBe(before);
    expect(screen.queryByTestId('connections-notice')).toBeNull();
  });
});
