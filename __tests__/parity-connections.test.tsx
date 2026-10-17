import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import type { Connection, ConnectionProvider } from '@/lib/platform/connections';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
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
 * lists in the app's one, each answer in its words — each row, since Build 21,
 * the one connection row (spec A4; the owner's build 20 items 6, 7 and 9): its
 * mark, its name, the account's email or its state, and one button. The
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
/** Still connected, but holding an error the platform found: it needs attention, and stays active meanwhile. */
const FLAGGED_GMAIL: Connection = { ...CONNECTED_GMAIL, errorCode: 'scope_missing' };
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

/** A row's one button (Build 21, spec A4): Connect, Reconnect or Disconnect. */
async function pressRow(providerId: string) {
  await fireEvent.press(await screen.findByTestId(`connection-action-${providerId}`));
}

beforeEach(() => {
  platformOperation.mockReset();
  connectOAuthProvider.mockReset();
  connectProviderWithKey.mockReset();
  disconnectConnection.mockReset();
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
});

describe('G12 — a row says the account, else its state; one that needs attention says so (spec A4)', () => {
  it('names the account the connection acts as by its email — no state words, no "used by" line — and an unconnected one "Not connected"', async () => {
    route([[CONNECTED_GMAIL]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    const gmail = within(await screen.findByTestId('connection-row-gmail'));
    expect(gmail.getByText('alex@acme.co')).toBeTruthy();
    expect(screen.queryByText(/used by/u)).toBeNull();
    expect(screen.queryByText(/ · Connected/u)).toBeNull();
    expect(within(screen.getByTestId('connection-row-twilio')).getByText('Not connected')).toBeTruthy();
  });

  it('a connection that needs attention offers Reconnect; with no email to name it says "Needs attention" in the warning colour; a healthy one with no email says "Connected"', async () => {
    route([[BROKEN_GMAIL, { ...CONNECTED_TWILIO, errorCode: 'expired' }]]);
    const { nocturneDark, status } = jest.requireActual('@/constants/theme');
    const view = await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await screen.findByTestId('connection-row-gmail');
    expect(within(screen.getByTestId('connection-action-gmail')).getByText('Reconnect')).toBeTruthy();
    const attention = within(screen.getByTestId('connection-row-twilio')).getByText('Needs attention');
    expect(StyleSheet.flatten(attention.props.style).color).toBe(status.warnText);
    expect(within(screen.getByTestId('connection-action-twilio')).getByText('Reconnect')).toBeTruthy();
    await view.unmount();
    resetSnapshot();

    route([[CONNECTED_TWILIO]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    const fine = within(await screen.findByTestId('connection-row-twilio'));
    expect(StyleSheet.flatten(fine.getByText('Connected').props.style).color).toBe(nocturneDark.neutral[400]);
    expect(within(screen.getByTestId('connection-action-twilio')).getByText('Disconnect')).toBeTruthy();
  });
});

describe('G13 — no description under any row (the owner\'s build 20 item 9: "It should be short not an essay"), and a member is told who changes them', () => {
  it.each([
    { role: 'owner' as const, who: 'an owner' },
    { role: 'member' as const, who: 'a member' },
  ])('to $who: no provider\'s description, no configured-providers line', async ({ role }) => {
    route([[CONNECTED_GMAIL]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs(role));
    await screen.findByTestId('connection-row-gmail');
    expect(screen.queryByText('Send mail as you.')).toBeNull();
    expect(screen.queryByText('Send texts as you.')).toBeNull();
    expect(screen.queryByText('Only providers configured for this deployment are shown.')).toBeNull();
    expect(screen.queryByText('Only an owner or admin of this workspace can connect or disconnect an account.') !== null).toBe(
      role === 'member',
    );
  });
});

describe('G14 — Connect, or Reconnect: a connection that needs attention is reconnected, and a reused answer is said', () => {
  it('Reconnect asks the provider again for the same account — no dialog — and says it completed', async () => {
    const { connectionReads } = route([[BROKEN_GMAIL]]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: CONNECTED_GMAIL });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await screen.findByTestId('connection-row-gmail');
    const before = connectionReads();

    await pressRow('gmail');

    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledTimes(1));
    // Reconnect keeps the account: no connection named for replacement.
    expect(connectOAuthProvider.mock.calls[0]).toEqual([TEST_WORKSPACE, GMAIL]);
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
    await waitFor(() => expect(connectionReads()).toBe(before + 1));
    expect(await screen.findByText('Connection completed successfully.')).toBeTruthy();
    expect(disconnectConnection).not.toHaveBeenCalled();
  });

  it.each([
    { press: 'Reconnect', held: [BROKEN_GMAIL] },
    { press: 'Connect', held: [] as Connection[] },
  ])('$press answered reused says the account is already connected with everything it needs — nothing asked, the rows read again', async ({ press, held }) => {
    const { connectionReads } = route([held]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: CONNECTED_GMAIL, reused: true });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('admin'));
    expect(within(await screen.findByTestId('connection-action-gmail')).getByText(press)).toBeTruthy();
    const before = connectionReads();

    await pressRow('gmail');

    expect(
      await screen.findByText('Gmail is already connected as alex@acme.co, with everything it needs — there is nothing to authorize.'),
    ).toBeTruthy();
    expect(screen.queryByText('Connection completed successfully.')).toBeNull();
    await waitFor(() => expect(connectionReads()).toBe(before + 1));
  });

  it('the notice goes when the next button is pressed', async () => {
    route([[BROKEN_GMAIL]]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: CONNECTED_GMAIL, reused: true });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await pressRow('gmail');
    expect(await screen.findByTestId('connections-notice')).toBeTruthy();
    await pressRow('twilio');
    expect(screen.queryByTestId('connections-notice')).toBeNull();
  });

  it('Disconnect asks first, then disconnects it and reads the rows again', async () => {
    const { connectionReads } = route([[CONNECTED_GMAIL]]);
    disconnectConnection.mockResolvedValue({ connection: { ...CONNECTED_GMAIL, status: 'disconnected' } });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await pressRow('gmail');
    const dialog = within(await screen.findByTestId('disconnect-dialog'));
    expect(dialog.getByText('2 live flows use it. They stop until you connect it again.')).toBeTruthy();
    const before = connectionReads();
    await fireEvent.press(dialog.getByText('Disconnect'));
    await waitFor(() => expect(disconnectConnection).toHaveBeenCalledWith(TEST_WORKSPACE, 'c1'));
    await waitFor(() => expect(screen.queryByTestId('disconnect-dialog')).toBeNull());
    await waitFor(() => expect(connectionReads()).toBe(before + 1));
    expect(connectOAuthProvider).not.toHaveBeenCalled();
  });

  it('a connection still authorizing is not one to reconnect: Connect', async () => {
    route([[{ ...CONNECTED_GMAIL, status: 'authorizing' }]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    expect(within(await screen.findByTestId('connection-action-gmail')).getByText('Connect')).toBeTruthy();
    expect(within(screen.getByTestId('connection-row-gmail')).getByText('Not connected')).toBeTruthy();
  });

  it('a key provider\'s Reconnect asks for its key again — no Replace account — and sends it keyed', async () => {
    const { connectionReads } = route([[{ ...CONNECTED_TWILIO, status: 'reauthorization-required' }]]);
    connectProviderWithKey.mockResolvedValue({ connection: CONNECTED_TWILIO });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await pressRow('twilio');
    const form = within(await screen.findByTestId('connection-dialog'));
    expect(form.getByText('Connect Twilio')).toBeTruthy();
    expect(form.queryByText('Replace account')).toBeNull();
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
    await pressRow('twilio');
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
    expect(await within(screen.getByTestId('connection-row-twilio')).findByText('Connected')).toBeTruthy();
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
  it('a Connect that completes says so above the rows, and the row names the account', async () => {
    route([[], [CONNECTED_GMAIL]]);
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: CONNECTED_GMAIL });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await pressRow('gmail');
    expect(await screen.findByText('Connection completed successfully.')).toBeTruthy();
    expect(await within(screen.getByTestId('connection-row-gmail')).findByText('alex@acme.co')).toBeTruthy();
  });

  it.each([
    { name: 'Connect, with nothing connected', held: [] as Connection[], words: 'The connection could not be completed. Try again or contact an owner.' },
    {
      name: 'Reconnect, with the connection needing reauthorization — which is not active',
      held: [BROKEN_GMAIL],
      words: 'The connection could not be completed. Try again or contact an owner.',
    },
    {
      name: 'Reconnect, with the connection still active but flagged',
      held: [FLAGGED_GMAIL],
      words: "The new authorization didn't complete, so nothing changed — your existing connection is still active. Try again or contact an owner.",
    },
  ])('$name: back without the connection, it says whether what was connected still is — under its row — and changes nothing', async ({ held, words }) => {
    const { connectionReads } = route([held]);
    connectOAuthProvider.mockResolvedValue({ status: 'incomplete' });
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    await screen.findByTestId('connection-row-gmail');
    const before = connectionReads();

    await pressRow('gmail');

    expect(await screen.findByText(words)).toBeTruthy();
    expect(connectionReads()).toBe(before);
    expect(screen.queryByTestId('connections-notice')).toBeNull();
  });
});
