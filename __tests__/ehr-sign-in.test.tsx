jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
jest.mock('@/lib/platform/connections', () => ({
  connectOAuthProvider: jest.fn(),
  connectProviderWithKey: jest.fn(),
  disconnectConnection: jest.fn(),
}));

import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import type { Connection, ConnectionProvider } from '@/lib/platform/connections';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { signInLabel } from '@/lib/view/ehr-connection';
import { TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation } = jest.requireMock('@/lib/platform/client');
const { connectOAuthProvider, connectProviderWithKey } = jest.requireMock('@/lib/platform/connections');

/**
 * Round 22 (backend ADR-0054): the EHR is a clinic user's sign-in
 * (`authType: smart-launch`). Its Connect opens the EHR's form — the vendor
 * picker for two or more vendors, the FHIR address with its help — and its
 * button signs in, named by the vendor ("Sign in with Epic", the session's
 * wording, as the website's): the two fields go to `authorize` as
 * `credentials` through `connectOAuthProvider`, which opens the EHR's sign-in
 * page in the system auth session and completes the connection as an OAuth
 * connect does (`platform-mutations.test.ts` holds that hand-off). Each
 * refusal is said in the words `snoopy-backend/docs/openapi/connections.yaml` defines; one
 * needing a new sign-in says "Sign in again".
 */

const ADDRESS = 'https://fhir.clinic.example/api/FHIR/R4';
const OTHER_ADDRESS = 'https://fhir.other-clinic.example/api/FHIR/R4';
const EHR: ConnectionProvider = {
  providerId: 'ehr-fhir',
  displayName: 'EHR',
  description: 'Reads and writes visit notes in your EHR, once someone at your clinic signs in.',
  icon: 'FirstAid',
  scopes: ['openid', 'fhirUser', 'offline_access', 'user/DocumentReference.read'],
  authType: 'smart-launch',
  credentialFields: [{ name: 'fhirBaseUrl', label: 'FHIR address', secret: false, help: 'Your EHR team gives you this address.' }],
  vendors: [
    { id: 'epic-test', label: 'Epic (test system)' },
    { id: 'epic', label: 'Epic' },
  ],
};
const SIGNED_IN: Connection = {
  id: 'c-ehr',
  providerId: 'ehr-fhir',
  workspaceId: TEST_WORKSPACE,
  externalAccount: { displayName: 'fhir.clinic.example' },
  status: 'connected',
  requiredScopes: [],
  grantedScopes: [],
  usedByCount: 1,
};
/** An EHR connection made before the sign-in: the platform asks for one (the backend's migration 0015). */
const SIGN_IN_AGAIN: Connection = { ...SIGNED_IN, status: 'reauthorization-required', errorCode: 'no_refresh_token' };

/** The screen's reads: the providers, and the connections — each read in turn, the last kept. */
function route(connections: Connection[][] = [[]], provider: ConnectionProvider = EHR) {
  const reads: string[] = [];
  platformOperation.mockImplementation((path: string) => {
    reads.push(path);
    if (path === '/v1/connections/providers') return Promise.resolve({ providers: [provider] });
    return Promise.resolve({ connections: connections.length > 1 ? connections.shift() : connections[0] });
  });
  return { connectionReads: () => reads.filter((path) => path.endsWith('/connections')).length };
}

async function openForm(connections: Connection[][] = [[]], provider: ConnectionProvider = EHR) {
  const reads = route(connections, provider);
  await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
  await fireEvent.press(await screen.findByTestId('connection-action-ehr-fhir'));
  return { dialog: within(await screen.findByTestId('connection-dialog')), ...reads };
}

beforeEach(() => {
  resetSnapshot();
  platformOperation.mockReset();
  connectOAuthProvider.mockReset();
  connectProviderWithKey.mockReset();
});

describe("an EHR's sign-in form (smart-launch)", () => {
  it('Connect opens the form — the vendors, the FHIR address and its help, "Sign in with Epic" — and the button signs in with the vendor and address as credentials', async () => {
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: SIGNED_IN });
    const { dialog, connectionReads } = await openForm([[], [SIGNED_IN]]);
    expect(dialog.getByText('Connect EHR')).toBeTruthy();
    expect(dialog.getByText('Epic (test system)')).toBeTruthy();
    expect(dialog.getByText('FHIR address')).toBeTruthy();
    expect(dialog.getByPlaceholderText('Your EHR team gives you this address.')).toBeTruthy();
    // Never the key form's words: nothing is verified here, a person signs in.
    expect(dialog.queryByText('Verify and connect')).toBeNull();

    await fireEvent.press(dialog.getByText('Epic'));
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), ` ${ADDRESS} `);
    await fireEvent.press(dialog.getByText('Sign in with Epic'));

    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledTimes(1));
    expect(connectOAuthProvider).toHaveBeenCalledWith(TEST_WORKSPACE, EHR, {
      credentials: { vendor: 'epic', fhirBaseUrl: ADDRESS },
    });
    expect(connectProviderWithKey).not.toHaveBeenCalled();
    // Plain success, the website's words; the form closes and the rows are read again.
    expect(await screen.findByText('Connection completed successfully.')).toBeTruthy();
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
    await waitFor(() => expect(connectionReads()).toBe(2));
    expect(within(screen.getByTestId('connection-row-ehr-fhir')).getByText('fhir.clinic.example')).toBeTruthy();
  });

  it('one vendor: no picker, that vendor sent — and Epic\'s test system is "Sign in with Epic" too', async () => {
    connectOAuthProvider.mockResolvedValue({ status: 'connected', connection: SIGNED_IN });
    const { dialog } = await openForm([[]], { ...EHR, vendors: [{ id: 'epic-test', label: 'Epic (test system)' }] });
    expect(dialog.queryByText('Epic (test system)')).toBeNull();
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), ADDRESS);
    await fireEvent.press(dialog.getByText('Sign in with Epic'));
    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledTimes(1));
    expect(connectOAuthProvider.mock.calls[0][2]).toEqual({ credentials: { vendor: 'epic-test', fhirBaseUrl: ADDRESS } });
  });

  it('the button is named by the vendor: another EHR by its own name, and "Sign in" for none', () => {
    const vendors = { ...EHR, vendors: [{ id: 'oracle-health', label: 'Oracle Health' }] };
    expect(signInLabel(vendors, 'oracle-health')).toBe('Sign in with Oracle Health');
    expect(signInLabel(EHR, 'epic-test')).toBe('Sign in with Epic');
    expect(signInLabel(EHR, undefined)).toBe('Sign in');
    expect(signInLabel({ ...EHR, authType: 'oauth2' }, 'epic')).toBe('Sign in');
  });

  it('an empty address asks for it, and nothing is sent', async () => {
    const { dialog } = await openForm();
    await fireEvent.press(dialog.getByText('Sign in with Epic'));
    expect(await screen.findByText('Complete every credential field before connecting.')).toBeTruthy();
    expect(connectOAuthProvider).not.toHaveBeenCalled();
  });

  it.each([
    ['authorize refused fhir_address_refused', 400, 'fhir_address_refused', 'Use the https address your EHR team gave you.'],
    ['authorize refused fhir_not_answering', 400, 'fhir_not_answering', "That address didn't answer as a FHIR server."],
    ['authorize refused ehr_sign_in_unsupported', 400, 'ehr_sign_in_unsupported', "That EHR doesn't offer the sign-in Autom8x uses. Ask your EHR team."],
    ['the sign-in came back no_refresh_token', 401, 'no_refresh_token', 'Your EHR team needs to allow a lasting sign-in for Autom8x. Ask them, then sign in again.'],
    ['the sign-in came back fhir_address_refused', 401, 'fhir_address_refused', 'Use the https address your EHR team gave you.'],
    ['the sign-in came back fhir_not_answering', 401, 'fhir_not_answering', "That address didn't answer as a FHIR server."],
  ])("%s: said in the contract's words, never the platform's title; the form stays to try again", async (_case, status, reason, words) => {
    connectOAuthProvider.mockRejectedValue(new PlatformError('That authorization could not be completed', status, 'X', { reason }));
    const { dialog } = await openForm();
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), ADDRESS);
    await fireEvent.press(dialog.getByText('Sign in with Epic'));
    expect(await screen.findByText(words)).toBeTruthy();
    expect(screen.queryByText('That authorization could not be completed')).toBeNull();
    expect(screen.getByTestId('connection-dialog')).toBeTruthy();
    expect(within(screen.getByTestId('connection-dialog')).getByText('Sign in with Epic')).toBeTruthy();
  });

  it('a refusal with no words of its own keeps the platform\'s (credential_invalid)', async () => {
    connectOAuthProvider.mockRejectedValue(new PlatformError('The vendor is not listed', 400, 'BAD_REQUEST', { reason: 'credential_invalid' }));
    const { dialog } = await openForm();
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), ADDRESS);
    await fireEvent.press(dialog.getByText('Sign in with Epic'));
    expect(await screen.findByText('The vendor is not listed')).toBeTruthy();
  });

  it('another address than the workspace\'s (409 account_mismatch) asks "Replace it?"; Replace begins again naming the workspace\'s connection', async () => {
    connectOAuthProvider
      .mockRejectedValueOnce(new PlatformError('This workspace is signed in to another EHR address', 409, 'CONFLICT', { reason: 'account_mismatch' }))
      .mockResolvedValueOnce({ status: 'connected', connection: { ...SIGNED_IN, externalAccount: { displayName: 'fhir.other-clinic.example' } } });
    const { dialog } = await openForm([[SIGN_IN_AGAIN]]);
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), OTHER_ADDRESS);
    await fireEvent.press(dialog.getByText('Sign in with Epic'));
    expect(await screen.findByText('This workspace is signed in to another EHR address. Replace it?')).toBeTruthy();
    expect(connectOAuthProvider.mock.calls[0][2]).toEqual({ credentials: { vendor: 'epic-test', fhirBaseUrl: OTHER_ADDRESS } });

    await fireEvent.press(within(screen.getByTestId('connection-dialog')).getByText('Replace'));
    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledTimes(2));
    expect(connectOAuthProvider.mock.calls[1][2]).toEqual({
      credentials: { vendor: 'epic-test', fhirBaseUrl: OTHER_ADDRESS },
      replaceConnectionId: 'c-ehr',
    });
    expect(await screen.findByText('Connection completed successfully.')).toBeTruthy();
  });

  it('after "Replace it?", a changed address is a new sign-in: the button is "Sign in with Epic" again, and nothing is replaced', async () => {
    connectOAuthProvider
      .mockRejectedValueOnce(new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'account_mismatch' }))
      .mockResolvedValueOnce({ status: 'connected', connection: SIGNED_IN, reused: true });
    const { dialog } = await openForm([[SIGN_IN_AGAIN]]);
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), OTHER_ADDRESS);
    await fireEvent.press(dialog.getByText('Sign in with Epic'));
    await screen.findByText('Replace');
    await fireEvent.changeText(within(screen.getByTestId('connection-dialog')).getByLabelText('FHIR address'), ADDRESS);
    expect(within(screen.getByTestId('connection-dialog')).queryByText('Replace')).toBeNull();
    await fireEvent.press(within(screen.getByTestId('connection-dialog')).getByText('Sign in with Epic'));
    await waitFor(() => expect(connectOAuthProvider).toHaveBeenCalledTimes(2));
    expect(connectOAuthProvider.mock.calls[1][2]).toEqual({ credentials: { vendor: 'epic-test', fhirBaseUrl: ADDRESS } });
    // The same address answered `reused`: said as the website says it.
    expect(await screen.findByText('EHR is already connected as fhir.clinic.example, with everything it needs — there is nothing to authorize.')).toBeTruthy();
  });

  it('a Replace refused because the connection changed (another 409): its words, and Refresh connections reads the rows again', async () => {
    connectOAuthProvider
      .mockRejectedValueOnce(new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'account_mismatch' }))
      .mockRejectedValueOnce(new PlatformError('The connection changed before replacement began', 409, 'CONFLICT', { reason: 'stale_connection' }));
    const { dialog, connectionReads } = await openForm([[SIGN_IN_AGAIN]]);
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), OTHER_ADDRESS);
    await fireEvent.press(dialog.getByText('Sign in with Epic'));
    await fireEvent.press(await screen.findByText('Replace'));
    expect(await screen.findByText('The connection changed before replacement began')).toBeTruthy();
    // Never the key form's "still verifying" line: nothing was sent to be verified.
    expect(screen.queryByText(/verif/iu)).toBeNull();
    expect(connectionReads()).toBe(1);
    await fireEvent.press(within(screen.getByTestId('connection-dialog')).getByText('Refresh connections'));
    await waitFor(() => expect(connectionReads()).toBe(2));
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
  });

  it('a mismatch whose connection these rows do not hold cannot be replaced from them: Refresh connections first', async () => {
    connectOAuthProvider.mockRejectedValueOnce(new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'account_mismatch' }));
    const { dialog } = await openForm([[]]);
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), OTHER_ADDRESS);
    await fireEvent.press(dialog.getByText('Sign in with Epic'));
    expect(await screen.findByText('This workspace is signed in to another EHR address. Replace it?')).toBeTruthy();
    const form = within(screen.getByTestId('connection-dialog'));
    expect(form.queryByText('Replace')).toBeNull();
    expect(form.getByText('Refresh connections')).toBeTruthy();
  });

  it('back without the connection: the website\'s words in the form; closed by the person: the form closes and the rows are read again', async () => {
    connectOAuthProvider.mockResolvedValueOnce({ status: 'incomplete' }).mockResolvedValueOnce({ status: 'cancelled' });
    const { dialog, connectionReads } = await openForm();
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), ADDRESS);
    await fireEvent.press(dialog.getByText('Sign in with Epic'));
    expect(await screen.findByText('The connection could not be completed. Try again or contact an owner.')).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('connection-dialog')).getByText('Sign in with Epic'));
    await waitFor(() => expect(screen.queryByTestId('connection-dialog')).toBeNull());
    await waitFor(() => expect(connectionReads()).toBe(2));
  });

  it('a sign-in the system browser could not open says so in the form', async () => {
    connectOAuthProvider.mockResolvedValue({ status: 'failed', message: 'This device has no browser to sign in with.' });
    const { dialog } = await openForm();
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), ADDRESS);
    await fireEvent.press(dialog.getByText('Sign in with Epic'));
    expect(await screen.findByText('This device has no browser to sign in with.')).toBeTruthy();
  });

  it('one the platform asks to be signed in again (reauthorization-required) offers "Sign in again", which opens the form', async () => {
    const { dialog } = await openForm([[SIGN_IN_AGAIN]]);
    expect(dialog.getByText('Sign in with Epic')).toBeTruthy();
    await fireEvent.press(dialog.getByText('Cancel'));
    const row = within(screen.getByTestId('connection-row-ehr-fhir'));
    expect(row.getByText('Needs attention')).toBeTruthy();
    expect(within(screen.getByTestId('connection-action-ehr-fhir')).getByText('Sign in again')).toBeTruthy();
    expect(screen.getByLabelText('Sign in again EHR')).toBeTruthy();
    // Another provider needing attention still says Reconnect.
    expect(screen.queryByText('Reconnect')).toBeNull();
  });

  it('signed in, its row says the clinic\'s host and its button is Disconnect', async () => {
    route([[SIGNED_IN]]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    const row = within(await screen.findByTestId('connection-row-ehr-fhir'));
    expect(row.getByText('fhir.clinic.example')).toBeTruthy();
    expect(within(screen.getByTestId('connection-action-ehr-fhir')).getByText('Disconnect')).toBeTruthy();
  });
});
