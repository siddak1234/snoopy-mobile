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

import {
  CONNECTION_BUTTON_REACH,
  CONNECTION_ROW_MIN_HEIGHT,
  ConnectionButton,
  ConnectionMark,
  ConnectionRow,
} from '@/components/connection-row';
import { status, typeScale } from '@/constants/theme';
import { VendorChoice } from '@/components/flows/vendor-choice';
import { ConnectionsCard } from '@/components/settings/connections-card';
import type { ThemeMode } from '@/hooks/use-theme';
import { platformOperation } from '@/lib/platform/client';
import { keylessProviders, type Connection, type ConnectionProvider, type PublicConnectionProvider } from '@/lib/platform/catalog';
import { connectOAuthProvider } from '@/lib/platform/connections';
import { needsNoConnect, providerConnected, toConnectionRow } from '@/lib/view/catalog';
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
  externalAccount: { displayName: 'person@example.com' },
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
    ['connected, no email', connection('google', { externalAccount: { displayName: 'Acme Books' } }), 'Connected', 'muted', 'Disconnect'],
    // S1-15 (backend §12.1 #283): the company its grant belongs to, in Connected's place; an email still first.
    ['connected, no email, its company read', connection('google', { externalAccount: { displayName: 'Sandbox' }, companyName: 'Harbor Supply Co.' }), 'Harbor Supply Co.', 'muted', 'Disconnect'],
    ['an email and its company', connection('google', { companyName: 'Harbor Supply Co.' }), 'person@example.com', 'muted', 'Disconnect'],
    ['its company, a sign-in asked again', connection('google', { status: 'reauthorization-required', externalAccount: { displayName: 'Sandbox' }, companyName: 'Harbor Supply Co.' }), 'Needs attention', 'warn', 'Reconnect'],
    ['a sign-in asked again', connection('google', { status: 'reauthorization-required' }), 'person@example.com', 'muted', 'Reconnect'],
    ['an error, no email', connection('google', { errorCode: 'token_revoked', externalAccount: { displayName: 'Acme' } }), 'Needs attention', 'warn', 'Reconnect'],
    ['none', undefined, 'Not connected', 'muted', 'Connect'],
    ['disconnected', connection('google', { status: 'disconnected' }), 'Not connected', 'muted', 'Connect'],
    // S1-8 (backend §12.1 #252): retired by the refresh loop, its errorCode set — never its email.
    ['disconnected at the provider', connection('google', { status: 'disconnected', errorCode: 'invalid_grant' }), 'Disconnected in Google', 'warn', 'Reconnect'],
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

describe('a connection disconnected at the provider (the stage 1 spec\'s S1-8; backend §12.1 #252)', () => {
  it('as a step\'s integration: "Disconnected in {provider}" in the warning colour, and a press connects it again', async () => {
    const onChoose = jest.fn();
    mockConnect.mockResolvedValueOnce({ status: 'cancelled' });
    await renderWithProviders(
      <VendorChoice
        vendors={[{ providerId: 'quickbooks', displayName: 'QuickBooks Online' }]}
        providers={new Map([['quickbooks', QUICKBOOKS_PROVIDER]])}
        connections={[connection('quickbooks', { status: 'disconnected', errorCode: 'invalid_grant' })]}
        chosen="quickbooks"
        canManage
        shownWorkspaceId={TEST_WORKSPACE}
        saving={null}
        onChoose={onChoose}
      />,
      sessionAs('owner'),
    );
    const line = within(screen.getByTestId('vendor-quickbooks')).getByText('Disconnected in QuickBooks Online');
    expect(StyleSheet.flatten(line.props.style).color).toBe(status.warnText);
    await fireEvent.press(screen.getByTestId('vendor-quickbooks'));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledWith(TEST_WORKSPACE, QUICKBOOKS_PROVIDER));
  });
});

describe('an app that needs no key (Round 21 platform round 2, B5)', () => {
  // A public service as the platform lists it — in `publicProviders`, never in `providers` — read through `keylessProviders`.
  const PUBLIC: PublicConnectionProvider = { providerId: 'nppes', displayName: 'NPI Registry', description: 'Looks up a clinician.', icon: 'IdentificationCard' };
  const NPPES = keylessProviders([PUBLIC])[0]!;

  it('is connected for every workspace, with no connection held, and its row offers no Connect', async () => {
    const row = toConnectionRow(NPPES, undefined);
    expect([row.state, row.line, row.connected, row.noConnect]).toEqual(['connected', 'Connected', true, true]);
    expect(providerConnected(NPPES, undefined)).toBe(true);
    await renderWithProviders(
      <ConnectionsCard rows={[row]} loadedFor={TEST_WORKSPACE} canManage notice={null} onNotice={() => {}} onChanged={() => {}} />,
      sessionAs('owner'),
    );
    expect(within(screen.getByTestId('connection-row-nppes')).getByText('Connected')).toBeTruthy();
    expect(screen.queryByTestId('connection-action-nppes')).toBeNull();
  });

  it('as a step\'s integration: drawn Connected, and a press chooses it at once — no sign-in, no Settings', async () => {
    const onChoose = jest.fn();
    await renderWithProviders(
      <VendorChoice
        vendors={[{ providerId: 'nppes', displayName: 'NPI Registry' }]}
        providers={new Map([['nppes', NPPES]])}
        connections={[]}
        chosen="none"
        canManage
        shownWorkspaceId={TEST_WORKSPACE}
        saving={null}
        onChoose={onChoose}
      />,
      sessionAs('owner'),
    );
    expect(within(screen.getByTestId('vendor-nppes')).getByText('Connected')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vendor-nppes'));
    expect(onChoose).toHaveBeenCalledWith('nppes');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('an app with a key or a sign-in is unchanged: not connected until the workspace holds one', () => {
    expect(needsNoConnect(GOOGLE)).toBe(false);
    expect(providerConnected(GOOGLE, undefined)).toBe(false);
    expect(toConnectionRow(GOOGLE, undefined).noConnect).toBe(false);
  });
});

describe("our button reaches 44 to a finger (the Build 21 review; Apple's least target)", () => {
  it('its padding, its border, its words and its reach add to 44 or more, every label', async () => {
    for (const label of ['Connect', 'Reconnect', 'Disconnect']) {
      const shown = await renderWithProviders(
        <ConnectionButton testID="our-button" label={label} onPress={() => {}} />,
        sessionAs('owner'),
      );
      const button = screen.getByTestId('our-button');
      const style = StyleSheet.flatten(button.props.style) as { paddingVertical: number; borderWidth: number };
      const reach = button.props.hitSlop as number;
      expect(reach).toBe(CONNECTION_BUTTON_REACH);
      // The words' own height is at least their size; the reach is added above and below.
      const least = style.paddingVertical * 2 + style.borderWidth * 2 + typeScale.body.fontSize + reach * 2;
      expect([label, least >= 44]).toEqual([label, true]);
      await shown.unmount();
    }
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
