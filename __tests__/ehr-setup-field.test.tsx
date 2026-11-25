import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import SetupScreen from '@/app/(tabs)/flows/setup';
import type { Subscription } from '@/lib/platform/automations';
import type { CatalogEntry, Connection } from '@/lib/platform/catalog';
import type { ConnectionProvider } from '@/lib/platform/connections';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, invoiceProcessingV4Entry, planSubscriptionsPayload, sessionAs } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));
// The sign-in's hand-off is `platform-mutations.test.ts`'s; here, what it came back with.
jest.mock('@/lib/platform/connections', () => ({
  ...jest.requireActual('@/lib/platform/connections'),
  connectOAuthProvider: jest.fn(),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');
const { connectOAuthProvider } = jest.requireMock('@/lib/platform/connections');

/**
 * Round 22 (backend ADR-0053 "As built" 3, ADR-0054): a flow started by an
 * upload or by its clinic's EHR declares the EHR an OPTIONAL connection, and
 * its setup a connection field that chooses it — the hook starts the flow
 * only for a setup that chose it. ICD-10 Code Check v6 is that shape: the
 * fixture below is its manifest's
 * (`snoopy-automations/manifests/icd10-code-check.v6.json`, branch
 * round-22/icd10-v6) — its connections,
 * its four sections, and its setup, the field verbatim (`providers:
 * ["ehr-fhir"]`, in "Connections", "Your EHR"), the specialties' 695 options
 * cut to two. It is drawn by the existing connection field — the EHR row and
 * None — and saved as any vendor choice is: no code for it here. An EHR not
 * signed in to is signed in to on Set up itself, in the EHR's sign-in form,
 * and comes back chosen (the session's parity decision D4).
 */

const ADDRESS = 'https://fhir.clinic.example/api/FHIR/R4';
const EHR: ConnectionProvider = {
  providerId: 'ehr-fhir',
  displayName: 'EHR',
  description: 'Reads and writes visit notes in your EHR, once someone at your clinic signs in.',
  icon: 'FirstAid',
  scopes: ['openid', 'fhirUser', 'offline_access'],
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
  usedByCount: 0,
};

/** ICD-10 Code Check v6, as the catalog projects its manifest. */
function v6Entry(): CatalogEntry {
  return {
    ...invoiceProcessingV4Entry(),
    templateId: 'icd10-code-check',
    name: 'ICD-10 Code Check',
    description: "Checks each visit's diagnosis codes against its note. You accept or deny each change. For doctors and coders. Test charts only for now.",
    category: 'Healthcare',
    version: 6,
    healthData: true,
    requiredConnections: [
      { providerId: 'nppes', displayName: 'NPI Registry', purpose: 'Reads your specialties from your NPI when none are picked.', optional: false },
      {
        providerId: 'ehr-fhir',
        displayName: 'EHR',
        purpose:
          "Optional. Reads a visit's notes when its chart opens, to suggest codes. After your review of an upload, adds a note with the codes you approved to the visit.",
        optional: true,
      },
    ],
    setupSections: [
      { id: 'npi', title: 'NPI' },
      { id: 'specialty', title: 'Specialty' },
      { id: 'connections', title: 'Connections' },
      { id: 'improvement', title: 'Continuous improvement' },
    ],
    setup: [
      {
        section: 'rules',
        sectionId: 'npi',
        key: 'npi',
        title: 'NPI',
        description: 'Fills your specialties when none are picked. Optional.',
        example: '10 digits, e.g. 1234567893',
        control: 'text',
        required: false,
        group: 'check',
      },
      {
        section: 'rules',
        sectionId: 'specialty',
        key: 'specialties',
        title: 'Specialties',
        description: 'The specialties your clinic treats. Their codes are listed first when a code is picked.',
        control: 'select',
        options: [
          { value: '207K00000X', label: 'Allergy & Immunology Physician', group: 'Allopathic & Osteopathic Physicians' },
          { value: '207KA0200X', label: 'Allergy Physician', group: 'Allopathic & Osteopathic Physicians' },
        ],
        multiple: true,
        required: false,
        group: 'check',
      },
      {
        section: 'connections',
        sectionId: 'connections',
        key: 'ehr',
        title: 'Your EHR',
        description:
          "Optional. Pick your EHR to suggest codes when a visit's chart opens, and to add a note with your approved codes to each uploaded visit.",
        control: 'connection',
        providers: ['ehr-fhir'],
        defaultValue: 'none',
        required: false,
      },
      {
        section: 'rules',
        sectionId: 'improvement',
        key: 'learn',
        title: "Learn from this clinic's reviews",
        description:
          'On by default. Each accepted or denied change, without names, numbers or dates, guides later picks. Turn it off to stop and clear what was learned.',
        control: 'toggle',
        defaultValue: true,
        required: false,
        group: 'check',
      },
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
const CONNECTIONS = 'GET /v1/workspaces/{workspaceId}/connections';
const PATCH = 'PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}';

function routeSetup(fake: ReturnType<typeof fakePlatform>, connections: Connection[], entry: CatalogEntry = v6Entry()) {
  let held: Subscription[] = [];
  const workspace = { connections };
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [entry], categories: ['All', 'Healthcare'] });
  fake.always('GET /v1/connections/providers', {
    providers: [EHR],
    publicProviders: [{ providerId: 'nppes', displayName: 'NPI Registry', description: 'Looks up a clinician by NPI.', icon: 'IdentificationCard' }],
  });
  fake.always(CONNECTIONS, () => ({ connections: workspace.connections }));
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
  /** What the workspace holds from now on: what a sign-in made. */
  return { hold: (next: Connection[]) => (workspace.connections = next) };
}

async function openSetup() {
  setMockParams({ template: 'icd10-code-check' });
  await renderWithProviders(<SetupScreen />, sessionAs('owner'));
  await screen.findByText('Set up ICD-10 Code Check');
}

beforeEach(() => {
  resetSnapshot();
  platformOperation.mockReset();
  connectOAuthProvider.mockReset();
  mockRouter.push.mockReset();
});

/** The EHR's row on Set up's field. */
const ehrField = () => within(screen.getByTestId('setup-vendor-ehr'));
const signInForm = () => within(screen.getByTestId('connection-dialog'));

describe("a flow's optional EHR connection field (the v6 shape)", () => {
  it('is drawn in the section its manifest names — "3 · CONNECTIONS" — by the existing connection field: the EHR and None, None chosen; Turn on saves None', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, []);
    await openSetup();
    expect(screen.getAllByText(/^\d+ · /u).map((label) => label.props.children)).toEqual(
      expect.arrayContaining(['1 · NPI', '2 · SPECIALTY', '3 · CONNECTIONS', '4 · CONTINUOUS IMPROVEMENT']),
    );
    // The public NPI Registry asks for nothing, and the optional EHR is no account owed: no CONNECT step.
    expect(screen.queryByTestId('setup-connect')).toBeNull();
    const field = within(within(screen.getByTestId('setup-section-3')).getByTestId('setup-vendor-ehr'));
    expect(field.getByText('EHR')).toBeTruthy();
    expect(field.getByText('Not connected')).toBeTruthy();
    expect(field.getByText('None')).toBeTruthy();
    expect(field.getByTestId('vendor-chosen-none')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('setup-turn-on'));
    await waitFor(() => expect(fake.to(PATCH)).toHaveLength(1));
    expect(fake.to(PATCH)[0]!.body).toMatchObject({ config: { ehr: 'none' }, status: 'live' });
  });

  it("chooses only among the connections it names (`providers`): another optional connection of the flow is not the EHR field's", async () => {
    const fake = fakePlatform(platformOperation);
    const entry = v6Entry();
    entry.requiredConnections = [
      ...entry.requiredConnections,
      { providerId: 'google-drive', displayName: 'Google Drive', purpose: 'Saves each review to a folder.', optional: true },
    ];
    routeSetup(fake, [], entry);
    await openSetup();
    expect(ehrField().getByTestId('vendor-ehr-fhir')).toBeTruthy();
    expect(ehrField().queryByTestId('vendor-google-drive')).toBeNull();
    expect(ehrField().queryByText('Google Drive')).toBeNull();
  });

  it('a signed-in EHR is chosen at a tap and saved as the choice — the clinic\'s host on its row', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, [SIGNED_IN]);
    await openSetup();
    expect(ehrField().getByText('fhir.clinic.example')).toBeTruthy();
    await fireEvent.press(ehrField().getByTestId('vendor-ehr-fhir'));
    await fireEvent.press(screen.getByTestId('setup-turn-on'));
    await waitFor(() => expect(fake.to(PATCH)).toHaveLength(1));
    expect(fake.to(PATCH)[0]!.body).toMatchObject({ config: { ehr: 'ehr-fhir' }, status: 'live' });
  });

  it('an EHR not signed in to opens its sign-in form here, on Set up; signed in, it comes back to this Set up with the EHR chosen and its host on its row (D4)', async () => {
    const fake = fakePlatform(platformOperation);
    const workspace = routeSetup(fake, []);
    connectOAuthProvider.mockImplementation(async () => {
      workspace.hold([SIGNED_IN]);
      return { status: 'connected', connection: SIGNED_IN };
    });
    await openSetup();
    const reads = fake.to(CONNECTIONS).length;
    await fireEvent.press(ehrField().getByTestId('vendor-ehr-fhir'));
    // Nowhere else to go: the form is over this Set up.
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(signInForm().getByText('Connect EHR')).toBeTruthy();
    expect(signInForm().getByText('Sign in')).toBeTruthy();
    await fireEvent.press(signInForm().getByText('Epic (test system)'));
    await fireEvent.changeText(signInForm().getByLabelText('FHIR address'), ADDRESS);
    await fireEvent.press(signInForm().getByText('Sign in with Epic (test system)'));

    await waitFor(() => expect(screen.queryByTestId('connection-dialog')).toBeNull());
    expect(connectOAuthProvider).toHaveBeenCalledWith(TEST_WORKSPACE, EHR, {
      credentials: { vendor: 'epic-test', fhirBaseUrl: ADDRESS },
    });
    expect(ehrField().getByTestId('vendor-chosen-ehr-fhir')).toBeTruthy();
    await waitFor(() => expect(fake.to(CONNECTIONS).length).toBeGreaterThan(reads));
    expect(await within(screen.getByTestId('setup-vendor-ehr')).findByText('fhir.clinic.example')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('setup-turn-on'));
    await waitFor(() => expect(fake.to(PATCH)).toHaveLength(1));
    expect(fake.to(PATCH)[0]!.body).toMatchObject({ config: { ehr: 'ehr-fhir' }, status: 'live' });
  });

  it("Cancel closes the form and chooses nothing; the EHR's page closed by the person closes it too, reads the connections again and chooses nothing", async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, []);
    connectOAuthProvider.mockResolvedValue({ status: 'cancelled' });
    await openSetup();
    await fireEvent.press(ehrField().getByTestId('vendor-ehr-fhir'));
    await fireEvent.press(signInForm().getByText('Cancel'));
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
    expect(connectOAuthProvider).not.toHaveBeenCalled();
    expect(ehrField().getByTestId('vendor-chosen-none')).toBeTruthy();

    const reads = fake.to(CONNECTIONS).length;
    await fireEvent.press(ehrField().getByTestId('vendor-ehr-fhir'));
    await fireEvent.press(signInForm().getByText('Epic'));
    await fireEvent.changeText(signInForm().getByLabelText('FHIR address'), ADDRESS);
    await fireEvent.press(signInForm().getByText('Sign in with Epic'));
    await waitFor(() => expect(screen.queryByTestId('connection-dialog')).toBeNull());
    await waitFor(() => expect(fake.to(CONNECTIONS).length).toBeGreaterThan(reads));
    expect(ehrField().getByTestId('vendor-chosen-none')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('a sign-in Replace cannot answer (another 409): Refresh connections closes the form and reads the connections again', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, []);
    connectOAuthProvider.mockRejectedValue(new PlatformError('The connection changed before replacement began', 409, 'CONFLICT', { reason: 'stale_connection' }));
    await openSetup();
    await fireEvent.press(ehrField().getByTestId('vendor-ehr-fhir'));
    await fireEvent.press(signInForm().getByText('Epic (test system)'));
    await fireEvent.changeText(signInForm().getByLabelText('FHIR address'), ADDRESS);
    await fireEvent.press(signInForm().getByText('Sign in with Epic (test system)'));
    expect(await screen.findByText('The connection changed before replacement began')).toBeTruthy();
    const reads = fake.to(CONNECTIONS).length;
    await fireEvent.press(signInForm().getByText('Refresh connections'));
    expect(screen.queryByTestId('connection-dialog')).toBeNull();
    await waitFor(() => expect(fake.to(CONNECTIONS).length).toBeGreaterThan(reads));
    expect(ehrField().getByTestId('vendor-chosen-none')).toBeTruthy();
  });
});
