jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
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
import { TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');
const { connectProviderWithKey } = jest.requireMock('@/lib/platform/connections');

/**
 * Round 21 stage 2, D1 (backend ADR-0050): an EHR — a SMART Backend Services
 * provider (`authType: smart-backend`) — is connected in Connections' key form,
 * as a pasted key is: its one field the clinic's FHIR address (its
 * `credentialFields`), a vendor picker only when the platform lists two or
 * more `vendors`, and "Verify and connect". Connected, its row says the
 * clinic's host. The website's Connections panel, in the same words.
 */

const ADDRESS = 'https://fhir.clinic.example/api/FHIR/R4';
const EHR: ConnectionProvider = {
  providerId: 'ehr-fhir',
  displayName: 'EHR',
  description: 'Reads visit notes from your EHR. It never changes your records.',
  icon: 'FirstAid',
  scopes: ['system/DocumentReference.read'],
  authType: 'smart-backend',
  credentialFields: [{ name: 'fhirBaseUrl', label: 'FHIR address', secret: false, help: 'Your EHR team gives you this address.' }],
  vendors: [
    { id: 'epic-test', label: 'Epic (test system)' },
    { id: 'epic', label: 'Epic' },
  ],
};
const CONNECTED: Connection = {
  id: 'c-ehr',
  providerId: 'ehr-fhir',
  workspaceId: TEST_WORKSPACE,
  externalAccount: { displayName: 'fhir.clinic.example' },
  status: 'connected',
  requiredScopes: [],
  grantedScopes: [],
  usedByCount: 0,
};

function route(provider: ConnectionProvider, connections: Connection[] = []) {
  platformOperation.mockImplementation((path: string) => {
    if (path === '/v1/connections/providers') return Promise.resolve({ providers: [provider] });
    return Promise.resolve({ connections });
  });
}

async function openForm(provider: ConnectionProvider = EHR) {
  route(provider);
  await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
  await fireEvent.press(await screen.findByTestId('connection-action-ehr-fhir'));
  return within(await screen.findByTestId('connection-dialog'));
}

beforeEach(() => {
  resetSnapshot();
  platformOperation.mockReset();
  connectProviderWithKey.mockReset();
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
});

describe("an EHR's Connect (smart-backend)", () => {
  it('opens the key form: the FHIR address, and the vendor picker for two vendors — the one picked is sent beside the address', async () => {
    connectProviderWithKey.mockResolvedValue({ connection: CONNECTED });
    const dialog = await openForm();
    expect(dialog.getByText('Connect EHR')).toBeTruthy();
    expect(dialog.getByText('FHIR address')).toBeTruthy();
    expect(dialog.getByText('Epic (test system)')).toBeTruthy();
    expect(dialog.getByText('Epic')).toBeTruthy();

    await fireEvent.press(dialog.getByText('Epic'));
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), `  ${ADDRESS} `);
    await fireEvent.press(dialog.getByText('Verify and connect'));

    await waitFor(() => expect(connectProviderWithKey).toHaveBeenCalledTimes(1));
    expect(connectProviderWithKey).toHaveBeenCalledWith(
      TEST_WORKSPACE,
      'ehr-fhir',
      { fhirBaseUrl: ADDRESS, vendor: 'epic' },
      expect.stringMatching(/^connection-/u),
    );
  });

  it('one vendor: no picker, and that vendor is sent', async () => {
    connectProviderWithKey.mockResolvedValue({ connection: CONNECTED });
    const dialog = await openForm({ ...EHR, vendors: [{ id: 'epic-test', label: 'Epic (test system)' }] });
    expect(dialog.queryByText('Epic (test system)')).toBeNull();
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), ADDRESS);
    await fireEvent.press(dialog.getByText('Verify and connect'));
    await waitFor(() => expect(connectProviderWithKey).toHaveBeenCalledTimes(1));
    expect(connectProviderWithKey.mock.calls[0][2]).toEqual({ fhirBaseUrl: ADDRESS, vendor: 'epic-test' });
  });

  it.each([
    ['fhir_address_refused', 'Use the https address your EHR team gave you.'],
    ['fhir_not_answering', "That address didn't answer as a FHIR server."],
    ['ehr_not_activated', "Your EHR hasn't turned on Autom8x yet. Ask your EHR team to activate it."],
  ])("a connect refused %s is said in the spec's words, never the platform's \"Bad Request\"; the form stays", async (reason, line) => {
    connectProviderWithKey.mockRejectedValue(new PlatformError('Bad Request', 400, 'BAD_REQUEST', { reason }));
    const dialog = await openForm();
    await fireEvent.changeText(dialog.getByLabelText('FHIR address'), ADDRESS);
    await fireEvent.press(dialog.getByText('Verify and connect'));
    expect(await screen.findByText(line)).toBeTruthy();
    expect(screen.queryByText('Bad Request')).toBeNull();
    expect(screen.getByTestId('connection-dialog')).toBeTruthy();
  });

  it("connected, its row says the clinic's host, and its button is Disconnect", async () => {
    route(EHR, [CONNECTED]);
    await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
    const row = within(await screen.findByTestId('connection-row-ehr-fhir'));
    expect(row.getByText('fhir.clinic.example')).toBeTruthy();
    expect(row.queryByText('Connected')).toBeNull();
    expect(within(screen.getByTestId('connection-action-ehr-fhir')).getByText('Disconnect')).toBeTruthy();
  });

  it('a pasted-key provider keeps its form as it was: no picker, no vendor sent', async () => {
    connectProviderWithKey.mockResolvedValue({ connection: { ...CONNECTED, providerId: 'twilio' } });
    const twilio: ConnectionProvider = {
      providerId: 'ehr-fhir',
      displayName: 'Twilio',
      description: 'Send texts as you.',
      icon: 'chat',
      scopes: [],
      authType: 'api-key',
      credentialFields: [{ name: 'apiKey', label: 'API key', secret: true }],
    };
    const dialog = await openForm(twilio);
    await fireEvent.changeText(dialog.getByLabelText('API key'), 'k-1');
    await fireEvent.press(dialog.getByText('Verify and connect'));
    await waitFor(() => expect(connectProviderWithKey).toHaveBeenCalledTimes(1));
    expect(connectProviderWithKey.mock.calls[0][2]).toEqual({ apiKey: 'k-1' });
  });
});
