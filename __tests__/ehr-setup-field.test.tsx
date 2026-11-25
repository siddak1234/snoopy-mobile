import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import SetupScreen from '@/app/(tabs)/flows/setup';
import type { Subscription } from '@/lib/platform/automations';
import type { CatalogEntry, Connection } from '@/lib/platform/catalog';
import type { ConnectionProvider } from '@/lib/platform/connections';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, invoiceProcessingV4Entry, planSubscriptionsPayload, sessionAs } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Round 22 (backend ADR-0053 "As built" 3, ADR-0054): a flow started by an
 * upload or by its clinic's EHR declares the EHR an OPTIONAL connection, and
 * its setup a connection field that chooses it — the hook starts the flow
 * only for a setup that chose it. ICD-10 Code Check v6 is that shape (backend
 * BUILD-PLAN 30.21.5; not yet registered, so this is the shape the backend's
 * `snoopy-backend/test/runs-cds-hooks.test.ts` declares: `control: 'connection'`,
 * `defaultValue: 'none'`, not required, in its "Integrations" section). It is
 * drawn by the existing connection field — the EHR row and None — and saved as
 * any vendor choice is: no code for it here. A sign-in EHR not connected is
 * connected on Settings › Connections, as every provider that is not OAuth.
 */

const EHR: ConnectionProvider = {
  providerId: 'ehr-fhir',
  displayName: 'EHR',
  description: 'Reads and writes visit notes in your EHR, once someone at your clinic signs in.',
  icon: 'FirstAid',
  scopes: ['openid', 'fhirUser', 'offline_access'],
  authType: 'smart-launch',
  credentialFields: [{ name: 'fhirBaseUrl', label: 'FHIR address', secret: false, help: 'Your EHR team gives you this address.' }],
  vendors: [{ id: 'epic-test', label: 'Epic (test system)' }],
};
const SIGNED_IN: Connection = {
  id: 'c-ehr',
  providerId: 'ehr-fhir',
  workspaceId: TEST_WORKSPACE,
  externalAccount: { displayName: 'fhir.clinic.example' },
  status: 'connected',
  requiredScopes: [],
  grantedScopes: [],
  usedByCount: 0,
};

/** The v6 shape: v5's NPI setting, the public NPI Registry, and the optional EHR chosen in Integrations. */
function v6Entry(): CatalogEntry {
  return {
    ...invoiceProcessingV4Entry(),
    templateId: 'icd10-code-check',
    name: 'ICD-10 Code Check',
    category: 'Healthcare',
    version: 6,
    healthData: true,
    requiredConnections: [
      { providerId: 'nppes', displayName: 'NPI Registry', purpose: 'Reads your specialties from your NPI when none are picked.', optional: false },
      { providerId: 'ehr-fhir', displayName: 'EHR', purpose: 'Visits come from your EHR.', optional: true },
    ],
    setupSections: [
      { id: 'npi', title: 'NPI' },
      { id: 'integrations', title: 'Integrations' },
    ],
    setup: [
      { section: 'rules', sectionId: 'npi', key: 'npi', title: 'NPI', description: 'Your 10-digit NPI.', control: 'text', required: false },
      { section: 'connections', sectionId: 'integrations', key: 'ehr', title: 'EHR', description: 'Where visits come from.', control: 'connection', defaultValue: 'none', required: false },
    ],
  };
}

const DRAFT: Subscription = {
  ...planSubscriptionsPayload().subscriptions[0]!,
  id: 'icd-1',
  templateId: 'icd10-code-check',
  templateVersion: 6,
  status: 'draft',
  config: {},
  unmetConnections: [],
  setup: v6Entry().setup,
  setupSections: v6Entry().setupSections,
  triggerKind: 'manual',
  projectId: null,
};

const ADD = 'POST /v1/workspaces/{workspaceId}/subscriptions';
const PATCH = 'PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}';

function routeSetup(fake: ReturnType<typeof fakePlatform>, connections: Connection[]) {
  let held: Subscription[] = [];
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [v6Entry()], categories: ['All', 'Healthcare'] });
  fake.always('GET /v1/connections/providers', {
    providers: [EHR],
    publicProviders: [{ providerId: 'nppes', displayName: 'NPI Registry', description: 'Looks up a clinician by NPI.', icon: 'IdentificationCard' }],
  });
  fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections });
  fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', () => ({ subscriptions: held }));
  // The workspace accepted the health data agreement already: Turn on is not held for it.
  fake.always('GET /v1/workspaces/{workspaceId}/agreements/health-data', {
    kind: 'health-data',
    current: { version: 1, sha256: 'a'.repeat(64) },
    acceptance: {
      id: '00000000-0000-4000-8000-0000000000d1',
      kind: 'health-data',
      version: 1,
      signerName: 'Dana Reyes',
      signerTitle: 'Practice manager',
      acceptedAt: '2026-11-04T12:00:00Z',
    },
  });
  fake.always(ADD, () => {
    held = [DRAFT];
    return { subscription: DRAFT };
  });
  fake.always(PATCH, { subscription: { ...DRAFT, status: 'live' } });
}

async function openSetup() {
  setMockParams({ template: 'icd10-code-check' });
  await renderWithProviders(<SetupScreen />, sessionAs('owner'));
  await screen.findByText('Set up ICD-10 Code Check');
}

beforeEach(() => {
  resetSnapshot();
  platformOperation.mockReset();
  mockRouter.push.mockReset();
});

describe("a flow's optional EHR connection field (the v6 shape)", () => {
  it('is drawn in its own section by the existing connection field — the EHR and None, None chosen — and Turn on saves None', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, []);
    await openSetup();
    expect(screen.getAllByText(/^\d+ · /u).map((label) => label.props.children)).toEqual(
      expect.arrayContaining(['1 · NPI', '2 · INTEGRATIONS']),
    );
    // The public NPI Registry asks for nothing, and the optional EHR is no account owed: no CONNECT step.
    expect(screen.queryByTestId('setup-connect')).toBeNull();
    const field = within(within(screen.getByTestId('setup-section-2')).getByTestId('setup-vendor-ehr'));
    expect(field.getByText('EHR')).toBeTruthy();
    expect(field.getByText('Not connected')).toBeTruthy();
    expect(field.getByText('None')).toBeTruthy();
    expect(field.getByTestId('vendor-chosen-none')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('setup-turn-on'));
    await waitFor(() => expect(fake.to(PATCH)).toHaveLength(1));
    expect(fake.to(PATCH)[0]!.body).toEqual({ config: { npi: undefined, ehr: 'none' }, status: 'live' });
  });

  it('a signed-in EHR is chosen at a tap and saved as the choice — the clinic\'s host on its row', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, [SIGNED_IN]);
    await openSetup();
    const field = within(screen.getByTestId('setup-vendor-ehr'));
    expect(field.getByText('fhir.clinic.example')).toBeTruthy();
    await fireEvent.press(field.getByTestId('vendor-ehr-fhir'));
    await fireEvent.press(screen.getByTestId('setup-turn-on'));
    await waitFor(() => expect(fake.to(PATCH)).toHaveLength(1));
    expect(fake.to(PATCH)[0]!.body).toMatchObject({ config: { ehr: 'ehr-fhir' }, status: 'live' });
  });

  it('an EHR not signed in to opens Settings › Connections to sign in, and chooses nothing yet', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, []);
    await openSetup();
    await fireEvent.press(within(screen.getByTestId('setup-vendor-ehr')).getByTestId('vendor-ehr-fhir'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/connections');
    expect(within(screen.getByTestId('setup-vendor-ehr')).getByTestId('vendor-chosen-none')).toBeTruthy();
    expect(fake.to(PATCH)).toHaveLength(0);
  });
});
