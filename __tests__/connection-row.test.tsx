jest.mock('@/lib/platform/client', () => ({
  ...jest.requireActual('@/lib/platform/client'),
  platformOperation: jest.fn(),
}));
jest.mock('@/lib/platform/connections', () => ({
  ...jest.requireActual('@/lib/platform/connections'),
  connectOAuthProvider: jest.fn(),
}));

import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { CONNECTION_ROW_MIN_HEIGHT, ConnectionButton, ConnectionMark, ConnectionRow } from '@/components/connection-row';
import { ConnectionsCard } from '@/components/settings/connections-card';
import type { ThemeMode } from '@/hooks/use-theme';
import { platformOperation } from '@/lib/platform/client';
import type { Connection, ConnectionProvider } from '@/lib/platform/catalog';
import { connectOAuthProvider } from '@/lib/platform/connections';
import { toConnectionRow } from '@/lib/view/catalog';
import { fakePlatform } from '@/test/fake-platform';
import { QUICKBOOKS_PROVIDER, TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

/**
 * The one connection row (Build 21, spec A4; the owner's build 20 items 6 and
 * 7: "Logo then to the right name then below the account email", "Standard
 * format and size for each connection component on the list not random
 * buttons and such"): every provider the same component at the same height —
 * its 24 × 24 mark, its name, the account's email or its state, and one
 * button of ours.
 */

const GOOGLE: ConnectionProvider = {
  providerId: 'google',
  displayName: 'Google',
  description: 'Reads and sends email.',
  scopes: [],
  authType: 'oauth2',
  icon: 'GoogleLogo',
};

const connection = (providerId: string, overrides: Partial<Connection> = {}): Connection => ({
  id: `c-${providerId}`,
  workspaceId: TEST_WORKSPACE,
  providerId,
  status: 'connected',
  externalAccount: { id: 'x-1', displayName: 'person@example.com' },
  requiredScopes: [],
  grantedScopes: [],
  usedByCount: 0,
  ...overrides,
});

const mockPlatformOperation = platformOperation as jest.Mock;
const mockConnect = connectOAuthProvider as jest.Mock;

describe.each<ThemeMode>(['dark', 'light'])('the connection row — %s palette (snapshot-pinned)', (mode) => {
  it('Google and QuickBooks: the same component, the same least height, mark · name · line · our button', async () => {
    const google = toConnectionRow(GOOGLE, connection('google'));
    const quickbooks = toConnectionRow(QUICKBOOKS_PROVIDER, undefined);
    const { toJSON } = await renderWithProviders(
      <>
        {[google, quickbooks].map((row) => (
          <ConnectionRow
            key={row.providerId}
            testID={`row-${row.providerId}`}
            mark={<ConnectionMark icon={row.iconName} testID={`mark-${row.providerId}`} />}
            name={row.name}
            line={row.line}
            lineTone={row.lineTone}
            right={<ConnectionButton label={row.state === 'connected' ? 'Disconnect' : 'Connect'} onPress={() => {}} />}
          />
        ))}
      </>,
      undefined,
      mode,
    );
    const googleRow = within(screen.getByTestId('row-google'));
    expect(googleRow.getByText('Google')).toBeTruthy();
    expect(googleRow.getByText('person@example.com')).toBeTruthy();
    expect(googleRow.getByText('Disconnect')).toBeTruthy();
    expect(screen.getByTestId('mark-google').props.accessibilityLabel).toBe('Google');

    const quickbooksRow = within(screen.getByTestId('row-quickbooks'));
    expect(quickbooksRow.getByText('QuickBooks Online')).toBeTruthy();
    expect(quickbooksRow.getByText('Not connected')).toBeTruthy();
    expect(quickbooksRow.getByText('Connect')).toBeTruthy();
    // Its round symbol at 24 × 24, never a wordmark or Intuit's button image.
    const mark = screen.getByTestId('mark-quickbooks');
    expect(StyleSheet.flatten(mark.props.style)).toEqual({ width: 24, height: 24 });
    expect(mark.props.source).toBe(require('@/assets/vendors/quickbooks-symbol.png'));

    for (const id of ['row-google', 'row-quickbooks']) {
      expect(StyleSheet.flatten(screen.getByTestId(id).props.style).minHeight).toBe(CONNECTION_ROW_MIN_HEIGHT);
    }
    expect(CONNECTION_ROW_MIN_HEIGHT).toBe(64);
    expect(toJSON()).toMatchSnapshot();
  });
});

describe('the row says the account, else its state (spec A4)', () => {
  it.each([
    ['an email the platform holds', connection('google'), 'person@example.com', 'muted', 'Disconnect'],
    ['connected, no email', connection('google', { externalAccount: { id: 'x', displayName: 'Acme Books' } }), 'Connected', 'muted', 'Disconnect'],
    ['a sign-in asked again', connection('google', { status: 'reauthorization-required' }), 'person@example.com', 'muted', 'Reconnect'],
    ['an error, no email', connection('google', { errorCode: 'token_revoked', externalAccount: { id: 'x', displayName: 'Acme' } }), 'Needs attention', 'warn', 'Reconnect'],
    ['none', undefined, 'Not connected', 'muted', 'Connect'],
    ['disconnected', connection('google', { status: 'disconnected' }), 'Not connected', 'muted', 'Connect'],
  ] as const)('%s', async (_case, held, line, tone, button) => {
    const row = toConnectionRow(GOOGLE, held as Connection | undefined);
    expect([row.line, row.lineTone]).toEqual([line, tone]);
    await renderWithProviders(
      <ConnectionsCard rows={[row]} loadedFor={TEST_WORKSPACE} canManage notice={null} onNotice={() => {}} onChanged={() => {}} />,
      sessionAs('owner'),
    );
    expect(screen.getByTestId('connection-action-google')).toBeTruthy();
    expect(within(screen.getByTestId('connection-action-google')).getByText(button)).toBeTruthy();
  });

  it('draws no description, no "used by" line and no button for a member', async () => {
    const row = toConnectionRow(GOOGLE, connection('google', { usedByCount: 2 }));
    await renderWithProviders(
      <ConnectionsCard rows={[row]} loadedFor={TEST_WORKSPACE} canManage={false} notice={null} onNotice={() => {}} onChanged={() => {}} />,
      sessionAs('member'),
    );
    expect(screen.queryByText('Reads and sends email.')).toBeNull();
    expect(screen.queryByText(/used by/u)).toBeNull();
    expect(screen.queryByTestId('connection-action-google')).toBeNull();
  });
});

describe('Disconnect asks first (spec A4)', () => {
  it.each([
    [0, 'You can connect it again any time.'],
    [1, '1 live flow uses it. It stops until you connect it again.'],
    [3, '3 live flows use it. They stop until you connect it again.'],
  ])('%i live flows: says what it stops, and only Disconnect sends the DELETE', async (used, body) => {
    const fake = fakePlatform(mockPlatformOperation);
    fake.always('DELETE /v1/workspaces/{workspaceId}/connections/{connectionId}', {
      connection: { ...connection('google', { status: 'disconnected' }) },
    });
    const onChanged = jest.fn();
    const row = toConnectionRow(GOOGLE, connection('google', { usedByCount: used }));
    await renderWithProviders(
      <ConnectionsCard rows={[row]} loadedFor={TEST_WORKSPACE} canManage notice={null} onNotice={() => {}} onChanged={onChanged} />,
      sessionAs('owner'),
    );
    await fireEvent.press(screen.getByTestId('connection-action-google'));
    const dialog = within(await screen.findByTestId('disconnect-dialog'));
    expect(dialog.getByText('Disconnect Google?')).toBeTruthy();
    expect(dialog.getByText(body)).toBeTruthy();
    expect(fake.sent).toHaveLength(0);
    await fireEvent.press(dialog.getByText('Disconnect'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fake.sent.map((sent) => `${sent.method} ${sent.path}`)).toEqual([
      'DELETE /v1/workspaces/{workspaceId}/connections/{connectionId}',
    ]);
    expect(fake.sent[0]!.values).toEqual({ workspaceId: TEST_WORKSPACE, connectionId: 'c-google' });
  });

  it('Connect goes through the provider at once, no dialog, with our own button', async () => {
    mockConnect.mockResolvedValue({ status: 'connected', connection: connection('quickbooks') });
    const onChanged = jest.fn();
    const row = toConnectionRow(QUICKBOOKS_PROVIDER, undefined);
    await renderWithProviders(
      <ConnectionsCard rows={[row]} loadedFor={TEST_WORKSPACE} canManage notice={null} onNotice={() => {}} onChanged={onChanged} />,
      sessionAs('owner'),
    );
    await fireEvent.press(screen.getByTestId('connection-action-quickbooks'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockConnect).toHaveBeenCalledWith(TEST_WORKSPACE, QUICKBOOKS_PROVIDER);
    expect(screen.queryByTestId('disconnect-dialog')).toBeNull();
  });
});
