jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
  downloadSignedFile: jest.fn(),
}));
// The export's summary goes to the share sheet as a file in the app's cache on
// iOS: a file the test can read back, made and removed as expo-file-system's is.
jest.mock('expo-file-system', () => {
  class File {
    static made: File[] = [];
    readonly name: string;
    readonly uri: string;
    exists = false;
    text: string | null = null;
    constructor(directory: { uri: string }, name: string) {
      this.name = name;
      this.uri = `${directory.uri}/${name}`;
      File.made.push(this);
    }
    create() {
      this.exists = true;
    }
    write(text: string) {
      this.text = text;
    }
    delete() {
      this.exists = false;
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache' } } };
});
// A keychain that keeps what it is given — where the Face ID choice lives.
jest.mock('expo-secure-store', () => {
  const kept = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    kept,
    getItemAsync: jest.fn(async (key: string) => kept.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      kept.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      kept.delete(key);
    }),
  };
});

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Platform, Share } from 'react-native';

import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import DataExportScreen from '@/app/(tabs)/settings/data';
import OrganizationScreen from '@/app/(tabs)/settings/organization';
import TeamScreen from '@/app/(tabs)/settings/team';
import TeamsScreen from '@/app/(tabs)/settings/teams';
import { FaceIdRow } from '@/components/settings/face-id-row';
import { PlatformError } from '@/lib/platform/problem';
import { fakePlatform, type Sent } from '@/test/fake-platform';
import { TEST_WORKSPACE, sessionAs, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

/**
 * Settings' feature presses that no test had pressed (build 13, B9 — the owner's
 * "Ensure auditing of all functionality that buttons and items work as we have
 * configured"), each held to what the recorded decisions configure: the request
 * it sends (method, path, its values and body), the dialog it opens or closes,
 * what changes on screen, and a refusal said in words. A repeated pattern is one
 * table. The presses that a test already held stay with that test.
 */

const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');
const Keychain = jest.requireMock('expo-secure-store') as { kept: Map<string, string>; setItemAsync: jest.Mock };
const FileSystem = jest.requireMock('expo-file-system') as {
  File: { made: { name: string; uri: string; exists: boolean; text: string | null }[] };
};
const Biometrics = jest.requireMock('expo-local-authentication') as {
  hasHardwareAsync: jest.Mock;
  isEnrolledAsync: jest.Mock;
  authenticateAsync: jest.Mock;
};

let n = 0;
beforeEach(() => {
  n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  Keychain.kept.clear();
  FileSystem.File.made.length = 0;
});
afterEach(() => {
  // The share sheet's spy and the platform replaced for a case.
  jest.restoreAllMocks();
});

/** A dialog's actions, as drawn, left to right. */
const actionsOf = (testID: string) =>
  within(screen.getByTestId(`${testID}-actions`))
    .getAllByText(/./u)
    .map((label) => label.props.children);

const PERSONAL = 'ws-personal';
const ORG = { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization' };

/* ───────────────────────────── Organization (24.5.1) ───────────────────────────── */

const DOMAIN = {
  id: 'domain-1',
  workspaceId: TEST_WORKSPACE,
  domain: 'acme.co',
  registrableDomain: 'acme.co',
  status: 'verified',
  joinPolicy: 'approval',
  discoveryEnabled: true,
  verificationRecordName: '_autom8x.acme.co',
  createdAt: '2026-09-01T00:00:00Z',
};
const DOMAINS_READ = 'GET /v1/workspaces/{workspaceId}/domains';
const JOIN_REQUESTS_READ = 'GET /v1/workspaces/{workspaceId}/join-requests';

/** The active organization, managed by its owner: one domain, one person asking to join. */
function routeOrganization(domains: unknown[] = [DOMAIN]) {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces', { workspaces: [{ ...ORG, role: 'owner' }], activeWorkspaceId: TEST_WORKSPACE });
  fake.always('GET /v1/workspaces/{workspaceId}/members', { members: [] });
  fake.always(DOMAINS_READ, { domains });
  fake.always(JOIN_REQUESTS_READ, {
    requests: [
      {
        id: 'jr-1',
        workspaceId: TEST_WORKSPACE,
        userId: 'u9',
        status: 'pending',
        displayName: 'Dana Reyes',
        email: 'dana@acme.co',
        createdAt: '2026-09-29T00:00:00Z',
      },
    ],
  });
  return fake;
}

describe("Organization › a domain: its row, Revoke, Verify DNS, Save settings (org-domains.tsx; DESIGN-CONTRACT 24.5: \"claim, update, verify and revoke a domain\")", () => {
  const REFUSED = 'Only an owner can change this domain.';

  it.each([
    {
      action: 'Revoke',
      domain: DOMAIN,
      said: 'Verified',
      offered: ['Close', 'Revoke', 'Save settings'],
      change: undefined,
      route: 'DELETE /v1/workspaces/{workspaceId}/domains/{domainId}',
      body: undefined,
    },
    {
      action: 'Verify DNS',
      domain: { ...DOMAIN, status: 'pending' },
      said: 'Pending. Add the DNS record named _autom8x.acme.co, then verify this domain.',
      offered: ['Close', 'Revoke', 'Verify DNS', 'Save settings'],
      change: undefined,
      route: 'POST /v1/workspaces/{workspaceId}/domains/{domainId}/verification',
      body: undefined,
    },
    {
      action: 'Save settings',
      domain: DOMAIN,
      said: 'Verified',
      offered: ['Close', 'Revoke', 'Save settings'],
      // Its settings, changed in the dialog: the joining policy, and whether matching people see it.
      change: async (dialog: ReturnType<typeof within>) => {
        await fireEvent.press(dialog.getByText('Automatic'));
        await fireEvent.press(dialog.getByRole('switch'));
      },
      route: 'PATCH /v1/workspaces/{workspaceId}/domains/{domainId}',
      body: { joinPolicy: 'automatic', discoveryEnabled: false },
    },
  ])(
    "$action — the row opens that domain's dialog with what its state allows; $action sends its request for that domain, says a refusal there, and once accepted closes and reads the organization again",
    async ({ action, domain, said, offered, change, route, body }) => {
      const fake = routeOrganization([domain]);
      fake.once(route, () => {
        throw new PlatformError(REFUSED, 403);
      });
      fake.always(route, { domain });
      await renderWithProviders(<OrganizationScreen />, signedInSession);

      // The row: the domain's own dialog, its state in words, and only the actions that state allows.
      await fireEvent.press(await screen.findByTestId('domain-acme.co'));
      const dialog = within(await screen.findByTestId('domain-dialog'));
      expect(dialog.getByText('acme.co')).toBeTruthy();
      expect(dialog.getByText(said)).toBeTruthy();
      expect(actionsOf('domain-dialog')).toEqual(offered);
      await change?.(dialog);

      // Refused: said in the dialog, which stays; nothing is read again.
      const reads = fake.to(DOMAINS_READ).length;
      await fireEvent.press(dialog.getByText(action));
      expect(await dialog.findByText(REFUSED)).toBeTruthy();
      expect(screen.getByTestId('domain-dialog')).toBeTruthy();
      expect(fake.to(DOMAINS_READ)).toHaveLength(reads);

      // Accepted: the dialog closes and the organization is read again.
      await fireEvent.press(dialog.getByText(action));
      await waitFor(() => expect(screen.queryByTestId('domain-dialog')).toBeNull());
      await waitFor(() => expect(fake.to(DOMAINS_READ)).toHaveLength(reads + 1));
      const [refused, accepted] = fake.to(route);
      expect(fake.to(route)).toHaveLength(2);
      expect(accepted!.values).toEqual({ workspaceId: TEST_WORKSPACE, domainId: 'domain-1' });
      expect(accepted!.body).toEqual(body);
      // The same intent sent again keeps its key (CLAUDE.md rule 10, useIntentKeys).
      expect(accepted!.key).toBeDefined();
      expect(accepted!.key).toBe(refused!.key);
    },
  );
});

describe('Organization › a join request (org-people.tsx; DESIGN-CONTRACT 24.5: "approve or reject a join request")', () => {
  it("Reject answers that person's request with reject, then closes and reads the organization again", async () => {
    const fake = routeOrganization();
    const DECIDE = 'PATCH /v1/workspaces/{workspaceId}/join-requests/{joinRequestId}';
    fake.always(DECIDE, { request: {} });
    await renderWithProviders(<OrganizationScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('join-request-jr-1'));
    const dialog = within(await screen.findByTestId('join-request-dialog'));
    const reads = fake.to(JOIN_REQUESTS_READ).length;

    await fireEvent.press(dialog.getByText('Reject'));

    await waitFor(() => expect(screen.queryByTestId('join-request-dialog')).toBeNull());
    expect(fake.to(DECIDE)).toHaveLength(1);
    expect(fake.to(DECIDE)[0]!.values).toEqual({ workspaceId: TEST_WORKSPACE, joinRequestId: 'jr-1' });
    expect(fake.to(DECIDE)[0]!.body).toEqual({ decision: 'reject' });
    await waitFor(() => expect(fake.to(JOIN_REQUESTS_READ)).toHaveLength(reads + 1));
  });
});

/* ───────────────────────────── Teams (24.11.7) ───────────────────────────── */

/** A team is its kind (24.12): the kind is its name and its type. */
const team = (id: string, workspaceId: string, kind: string, extra: Record<string, unknown> = {}) => ({
  id,
  workspaceId,
  name: kind,
  type: kind,
  status: 'active',
  viewerRole: 'member',
  createdAt: '2026-09-01T00:00:00Z',
  ...extra,
});

describe('Settings › Teams › a team row (teams.tsx; DESIGN-CONTRACT: "one team read in its own workspace")', () => {
  it("opens that team's page with the team and the workspace it lives in — an organization's team, and a personal one", async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', {
      workspaces: [
        { ...ORG, role: 'member' },
        { id: PERSONAL, name: 'Personal', type: 'personal', role: 'owner' },
      ],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    fake.always('GET /v1/workspaces/{workspaceId}/projects', (sent: Sent) => ({
      projects: sent.values.workspaceId === TEST_WORKSPACE ? [team('p1', TEST_WORKSPACE, 'Finance')] : [team('p3', PERSONAL, 'Accounting', { viewerRole: 'owner' })],
    }));
    fake.always('GET /v1/workspaces/{workspaceId}/project-directory', { projects: [] });
    await renderWithProviders(<TeamsScreen />, signedInSession);

    await fireEvent.press(await screen.findByTestId('team-p1'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/settings/team',
      params: { projectId: 'p1', workspaceId: TEST_WORKSPACE },
    });
    await fireEvent.press(screen.getByTestId('team-p3'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/settings/team',
      params: { projectId: 'p3', workspaceId: PERSONAL },
    });
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });
});

const MEMBERSHIPS_READ = 'GET /v1/workspaces/{workspaceId}/projects/{projectId}/memberships';
const MEMBERSHIP_DELETE = 'DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/memberships/{userId}';
const membership = (userId: string, role: string, displayName: string) => ({
  projectId: 'p1',
  workspaceId: TEST_WORKSPACE,
  userId,
  role,
  displayName,
  email: `${displayName.toLowerCase()}@acme.co`,
  createdAt: '2026-09-01T00:00:00Z',
});

/** One team in the organization, seen by the signed-in person (u1, Alex) with this role on it. */
function routeTeam(viewerRole: 'admin' | 'member') {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces', { workspaces: [{ ...ORG, role: 'member' }], activeWorkspaceId: TEST_WORKSPACE });
  fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}', { project: team('p1', TEST_WORKSPACE, 'Finance', { viewerRole }) });
  fake.always(MEMBERSHIPS_READ, {
    memberships: [membership('u2', 'owner', 'Ben'), membership('u1', viewerRole, 'Alex'), membership('u3', 'member', 'Carol')],
  });
  fake.always('GET /v1/workspaces/{workspaceId}/members', {
    members: [{ workspaceId: TEST_WORKSPACE, userId: 'u4', role: 'member', displayName: 'Dana', email: 'dana@acme.co', createdAt: '2026-09-01T00:00:00Z' }],
  });
  fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests', { requests: [] });
  setMockParams({ projectId: 'p1', workspaceId: TEST_WORKSPACE });
  return fake;
}

describe('One team › its members (team-members.tsx; DESIGN-CONTRACT 24.5: "leave — typing DELETE, or confirming from one\'s own row; add members, change a role, remove")', () => {
  it("the person's own row asks first, then takes them off the team in the team's workspace and leaves its page — while that is sent the confirm reads Leaving… and sends once (confirm-dialog.tsx)", async () => {
    const fake = routeTeam('member');
    let answer: (reply: unknown) => void = () => undefined;
    fake.always(MEMBERSHIP_DELETE, () => new Promise((resolve) => (answer = resolve)));
    await renderWithProviders(<TeamScreen />, signedInSession);

    await fireEvent.press(await screen.findByTestId('team-member-u1'));
    const dialog = within(await screen.findByTestId('leave-team-row-dialog'));
    expect(dialog.getByText('Leave this team?')).toBeTruthy();
    expect(dialog.getByText('You will lose access to its flows immediately.')).toBeTruthy();
    expect(fake.to(MEMBERSHIP_DELETE)).toHaveLength(0);

    await fireEvent.press(dialog.getByText('Leave'));
    expect(await dialog.findByText('Leaving…')).toBeTruthy();
    await fireEvent.press(dialog.getByText('Leaving…'));
    expect(fake.to(MEMBERSHIP_DELETE)).toHaveLength(1);
    expect(mockRouter.back).not.toHaveBeenCalled();

    await act(async () => answer({ removed: true }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(fake.to(MEMBERSHIP_DELETE)).toHaveLength(1);
    expect(fake.to(MEMBERSHIP_DELETE)[0]!.values).toEqual({ workspaceId: TEST_WORKSPACE, projectId: 'p1', userId: 'u1' });
  });

  it("Remove asks first in the same dialog, sending nothing; its Remove takes that member off the team, says a refusal there, and once accepted closes and reads the team again", async () => {
    const fake = routeTeam('admin');
    const REFUSED = 'An admin removes only a member.';
    fake.once(MEMBERSHIP_DELETE, () => {
      throw new PlatformError(REFUSED, 403);
    });
    fake.always(MEMBERSHIP_DELETE, { removed: true });
    await renderWithProviders(<TeamScreen />, signedInSession);

    await fireEvent.press(await screen.findByTestId('team-member-u3'));
    const dialog = within(await screen.findByTestId('team-member-dialog'));
    expect(dialog.getByText('Carol')).toBeTruthy();

    // The first Remove asks.
    await fireEvent.press(dialog.getByText('Remove'));
    expect(dialog.getByText('Remove Carol from this team?')).toBeTruthy();
    expect(actionsOf('team-member-dialog')).toEqual(['Cancel', 'Remove']);
    expect(fake.to(MEMBERSHIP_DELETE)).toHaveLength(0);

    // The second removes: refused first, said in the dialog, which stays on the question.
    const reads = fake.to(MEMBERSHIPS_READ).length;
    await fireEvent.press(dialog.getByText('Remove'));
    expect(await dialog.findByText(REFUSED)).toBeTruthy();
    expect(dialog.getByText('Remove Carol from this team?')).toBeTruthy();
    expect(fake.to(MEMBERSHIPS_READ)).toHaveLength(reads);

    await fireEvent.press(dialog.getByText('Remove'));
    await waitFor(() => expect(screen.queryByTestId('team-member-dialog')).toBeNull());
    await waitFor(() => expect(fake.to(MEMBERSHIPS_READ)).toHaveLength(reads + 1));
    const [refused, accepted] = fake.to(MEMBERSHIP_DELETE);
    expect(fake.to(MEMBERSHIP_DELETE)).toHaveLength(2);
    expect(accepted!.values).toEqual({ workspaceId: TEST_WORKSPACE, projectId: 'p1', userId: 'u3' });
    expect(accepted!.key).toBe(refused!.key);
  });

  it.each([
    ['after adding someone, closes and reads the team again', true, 1],
    ['with nobody added, closes and reads nothing', false, 0],
  ] as const)('Add members › Done %s', async (_case, add, rereads) => {
    const fake = routeTeam('admin');
    fake.always('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships', { membership: {} });
    await renderWithProviders(<TeamScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Add members'));
    const dialog = within(await screen.findByTestId('add-team-members-dialog'));
    if (add) {
      await fireEvent.press(dialog.getByTestId('add-u4'));
      expect(await dialog.findByText('Everyone in this organization is already on the team.')).toBeTruthy();
    }
    const reads = fake.to(MEMBERSHIPS_READ).length;

    await fireEvent.press(dialog.getByText('Done'));

    await waitFor(() => expect(screen.queryByTestId('add-team-members-dialog')).toBeNull());
    expect(await screen.findByText('Add members')).toBeTruthy();
    expect(fake.to(MEMBERSHIPS_READ)).toHaveLength(reads + rereads);
  });
});

/* ───────────────────────────── Export my data (24.6.3) ───────────────────────────── */

describe('Export my data › Share JSON (data.tsx; DESIGN-CONTRACT 24.6: "the bounded summary shared as a JSON file (iOS) or text (Android)")', () => {
  const SUMMARY = {
    workspaceId: TEST_WORKSPACE,
    exportedAt: '2026-09-30T00:00:00Z',
    complete: true,
    services: [{ service: 'runs', ok: true, data: { truncated: false } }],
  };
  const JSON_TEXT = JSON.stringify(SUMMARY, null, 2);
  type Made = typeof FileSystem.File.made;

  it.each([
    {
      os: 'ios' as const,
      way: "as a JSON file in the app's cache, removed once shared",
      files: [{ name: `workspace-export-${TEST_WORKSPACE}.json`, text: JSON_TEXT, exists: false }],
      shared: (made: Made) => ({ url: made[0]!.uri }),
    },
    {
      os: 'android' as const,
      way: 'as text, which its share sheet carries',
      files: [],
      shared: () => ({ message: JSON_TEXT }),
    },
  ])('on $os, hands the prepared summary to the share sheet $way', async ({ os, files, shared }) => {
    jest.replaceProperty(Platform, 'OS', os);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', { workspaces: [{ ...ORG, role: 'owner' }], activeWorkspaceId: TEST_WORKSPACE });
    fake.always('GET /v1/workspaces/{workspaceId}/export', SUMMARY);
    await renderWithProviders(<DataExportScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByText('Prepare export'));

    await fireEvent.press(await screen.findByText('Share JSON'));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(FileSystem.File.made.map(({ name, text, exists }) => ({ name, text, exists }))).toEqual(files);
    expect(share).toHaveBeenCalledWith(shared(FileSystem.File.made));
    expect(await screen.findByText('Share JSON')).toBeTruthy();
    expect(screen.queryByText('The export could not be shared.')).toBeNull();
  });
});

/* ───────────────────────────── SECURITY: the Face ID row (build 11, D1) ───────────────────────────── */

describe("SECURITY › the Face ID row's Try again (face-id-row.tsx; DESIGN-CONTRACT: \"Failed actions remain on the loaded screen and show the shared inline failure callout\")", () => {
  const FACE_ID_ENABLED = 'autom8x.face-id-enabled';
  let before: unknown[] = [];
  beforeEach(() => {
    before = [Biometrics.hasHardwareAsync, Biometrics.isEnrolledAsync, Biometrics.authenticateAsync].map((mock) =>
      mock.getMockImplementation(),
    );
  });
  afterEach(() => {
    [Biometrics.hasHardwareAsync, Biometrics.isEnrolledAsync, Biometrics.authenticateAsync].forEach((mock, index) =>
      mock.mockImplementation(before[index] as never),
    );
  });

  it.each([
    {
      change: 'turning it on',
      stored: null,
      // The device has no Face ID set up when the toggle is turned on.
      fail: () => Biometrics.hasHardwareAsync.mockImplementation(async () => false),
      failure: 'Face ID is not available or enrolled on this device.',
      prompts: [[{ promptMessage: 'Enable Face ID unlock', disableDeviceFallback: true }]],
      saved: 'true',
      on: true,
    },
    {
      change: 'turning it off',
      stored: 'true',
      // The keychain refuses the write that turns it off.
      fail: () => Keychain.setItemAsync.mockRejectedValueOnce(new Error('The keychain is not available.')),
      failure: 'Face ID preference could not be saved on this device.',
      prompts: [],
      saved: 'false',
      on: false,
    },
  ])('a failure $change is said under the row, and Try again repeats $change', async ({ stored, fail, failure, prompts, saved, on }) => {
    if (stored) Keychain.kept.set(FACE_ID_ENABLED, stored);
    await renderWithProviders(<FaceIdRow testID="settings-face-id" />, signedInSession);
    const toggle = () => screen.getByRole('switch');
    await waitFor(() => expect(toggle().props.accessibilityState).toEqual({ checked: stored === 'true' }));

    fail();
    await fireEvent.press(toggle());
    expect(await screen.findByText(failure)).toBeTruthy();
    expect(within(screen.getByTestId('action-failure')).getByText('Try again')).toBeTruthy();

    // Now the phone can do either: Try again is free to do what was asked.
    Biometrics.hasHardwareAsync.mockImplementation(async () => true);
    Biometrics.isEnrolledAsync.mockImplementation(async () => true);
    Biometrics.authenticateAsync.mockImplementation(async () => ({ success: true }));
    await fireEvent.press(screen.getByText('Try again'));

    await waitFor(() => expect(screen.queryByTestId('action-failure')).toBeNull());
    expect(Biometrics.authenticateAsync.mock.calls).toEqual(prompts);
    expect(Keychain.kept.get(FACE_ID_ENABLED)).toBe(saved);
    expect(toggle().props.accessibilityState).toEqual({ checked: on });
  });
});

/* ───────────────────────────── Connections (24.4.3) ───────────────────────────── */

describe('Settings › Connections › the dialog\'s main button: Disconnect, and Connect with a key (connections-card.tsx; DESIGN-CONTRACT Mutations: "Disconnect: delete the stable connection ID", "API-key connection: generated credential fields → connection mutation with an idempotency key")', () => {
  const GMAIL = { providerId: 'gmail', displayName: 'Gmail', description: 'Send mail as you.', scopes: [], authType: 'oauth2', icon: 'envelope' };
  const TWILIO = {
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
  const CONNECTED_GMAIL = {
    id: 'c1',
    providerId: 'gmail',
    workspaceId: TEST_WORKSPACE,
    externalAccount: { id: 'a1', displayName: 'alex@acme.co' },
    status: 'connected',
    requiredScopes: [],
    grantedScopes: [],
    usedByCount: 1,
  };
  const CONNECTIONS_READ = 'GET /v1/workspaces/{workspaceId}/connections';

  it.each([
    {
      button: 'Disconnect',
      provider: GMAIL,
      connections: [CONNECTED_GMAIL],
      title: 'Disconnect Gmail',
      fill: async (_dialog: ReturnType<typeof within>, _fake: ReturnType<typeof fakePlatform>) => undefined,
      route: 'DELETE /v1/workspaces/{workspaceId}/connections/{connectionId}',
      values: { workspaceId: TEST_WORKSPACE, connectionId: 'c1' },
      body: undefined,
      key: undefined,
    },
    {
      button: 'Connect',
      provider: TWILIO,
      connections: [],
      title: 'Connect Twilio',
      // Every field the provider declares, or nothing is sent and it says so.
      fill: async (dialog: ReturnType<typeof within>, fake: ReturnType<typeof fakePlatform>) => {
        await fireEvent.press(dialog.getByText('Connect'));
        expect(await dialog.findByText('Complete every credential field before connecting.')).toBeTruthy();
        expect(fake.to('POST /v1/workspaces/{workspaceId}/connections/key')).toHaveLength(0);
        await fireEvent.changeText(dialog.getByPlaceholderText('Starts with AC'), ' AC123 ');
        await fireEvent.changeText(dialog.getByPlaceholderText('In the Twilio console'), 'secret-token');
      },
      route: 'POST /v1/workspaces/{workspaceId}/connections/key',
      values: { workspaceId: TEST_WORKSPACE },
      body: { providerId: 'twilio', credentials: { accountSid: 'AC123', authToken: 'secret-token' } },
      key: 'connection-1',
    },
  ])(
    '$button sends its request for that connection, then closes the dialog and reads the connections again',
    async ({ button, provider, connections, title, fill, route, values, body, key }) => {
      const fake = fakePlatform(platformOperation);
      fake.always('GET /v1/connections/providers', { providers: [provider] });
      fake.always(CONNECTIONS_READ, { connections });
      fake.always(route, { connection: {} });
      await renderWithProviders(<ConnectionsScreen />, sessionAs('owner'));
      await fireEvent.press(await screen.findByTestId(`connection-row-${provider.providerId}`));
      const dialog = within(await screen.findByTestId('connection-dialog'));
      expect(dialog.getByText(title)).toBeTruthy();
      await fill(dialog, fake);
      const reads = fake.to(CONNECTIONS_READ).length;

      await fireEvent.press(dialog.getByText(button));

      await waitFor(() => expect(screen.queryByTestId('connection-dialog')).toBeNull());
      await waitFor(() => expect(fake.to(CONNECTIONS_READ)).toHaveLength(reads + 1));
      expect(fake.to(route)).toHaveLength(1);
      expect(fake.to(route)[0]!.values).toEqual(values);
      expect(fake.to(route)[0]!.body).toEqual(body);
      expect(fake.to(route)[0]!.key).toBe(key);
    },
  );
});
