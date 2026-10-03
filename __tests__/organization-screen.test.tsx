jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));
// The website's origin, for the join link: the browser leg's base, as Support uses it.
const mockExtra: { nativeAuthBaseUrl?: string } = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Platform, Share } from 'react-native';

import OrganizationScreen from '@/app/(tabs)/settings/organization';
import { OrgPeople } from '@/components/organization/org-people';
import type { SessionContextValue } from '@/hooks/use-session';
import { joinLinkLine } from '@/lib/content/join-link';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import type { OrganizationDomain } from '@/lib/platform/organization';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

let n = 0;
beforeEach(() => {
  n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  mockExtra.nativeAuthBaseUrl = 'https://www.example.test/api/platform';
});

function session(email = 'alex@acme.co'): SessionContextValue {
  if (signedInSession.status !== 'signed-in') throw new Error('fixture');
  return { ...signedInSession, session: { ...signedInSession.session, user: { ...signedInSession.session.user, email } } };
}

const ORG = { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization' };
const member = (userId: string, role: string, displayName: string) => ({
  workspaceId: TEST_WORKSPACE,
  userId,
  role,
  displayName,
  email: `${displayName.toLowerCase()}@acme.co`,
  createdAt: '2026-09-01T00:00:00Z',
});
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

function routeManage(role: 'owner' | 'admin' | 'member') {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces', { workspaces: [{ ...ORG, role }], activeWorkspaceId: TEST_WORKSPACE });
  fake.always('GET /v1/workspaces/{workspaceId}/members', {
    members: [member('u1', 'admin', 'Alex'), member('u2', 'owner', 'Ben'), member('u3', 'member', 'Carol')],
  });
  fake.always('GET /v1/workspaces/{workspaceId}/domains', { domains: [DOMAIN] });
  fake.always('GET /v1/workspaces/{workspaceId}/join-requests', {
    requests: [{ id: 'jr-1', workspaceId: TEST_WORKSPACE, userId: 'u9', status: 'pending', createdAt: '2026-09-29T00:00:00Z' }],
  });
  return fake;
}

async function pressLast(label: string) {
  const buttons = await screen.findAllByText(label);
  await fireEvent.press(buttons[buttons.length - 1]!);
}

describe('Organization — an owner or admin of the active organization manages it (24.5.1)', () => {
  it('shows its details, domains, members and pending join requests', async () => {
    routeManage('admin');
    await renderWithProviders(<OrganizationScreen />, session());
    expect(await screen.findByText('Acme Operations')).toBeTruthy();
    expect(screen.getByText('acme.co')).toBeTruthy();
    expect(screen.getByText('Carol')).toBeTruthy();
    expect(screen.getByText('Alex (you)')).toBeTruthy();
    expect(screen.getByText('u9')).toBeTruthy();
  });

  it('removes a member only after a confirmation — never an owner, never the person themselves', async () => {
    const fake = routeManage('admin');
    fake.always('DELETE /v1/workspaces/{workspaceId}/members/{userId}', { removed: true });
    await renderWithProviders(<OrganizationScreen />, session());

    await fireEvent.press(await screen.findByTestId('member-u2'));
    await fireEvent.press(screen.getByTestId('member-u1'));
    expect(screen.queryByTestId('remove-member-dialog')).toBeNull();

    await fireEvent.press(screen.getByTestId('member-u3'));
    expect(await screen.findByText('Remove Carol?')).toBeTruthy();
    await pressLast('Remove member');
    await waitFor(() => expect(fake.to('DELETE /v1/workspaces/{workspaceId}/members/{userId}')).toHaveLength(1));
    expect(fake.to('DELETE /v1/workspaces/{workspaceId}/members/{userId}')[0]!.values).toEqual({
      workspaceId: TEST_WORKSPACE,
      userId: 'u3',
    });
  });

  it('claims a domain and shows its DNS verification value, which comes only once', async () => {
    const fake = routeManage('owner');
    fake.always('POST /v1/workspaces/{workspaceId}/domains', { domain: { ...DOMAIN, domain: 'acme.io' }, verificationRecordValue: 'autom8x-verify=abc' });
    await renderWithProviders(<OrganizationScreen />, session());
    await fireEvent.press(await screen.findByTestId('add-domain'));
    await fireEvent.changeText(await screen.findByPlaceholderText('acme.co'), 'acme.io');
    await pressLast('Add domain');
    expect(await screen.findByText('autom8x-verify=abc')).toBeTruthy();
    expect(fake.to('POST /v1/workspaces/{workspaceId}/domains')[0]!.body).toEqual({ domain: 'acme.io', joinPolicy: 'approval' });
    // Read again once it is closed — not at once, which would take the value away unseen.
    const reads = fake.to('GET /v1/workspaces/{workspaceId}/domains').length;
    await fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(fake.to('GET /v1/workspaces/{workspaceId}/domains').length).toBe(reads + 1));
  });

  it('approves a join request', async () => {
    const fake = routeManage('owner');
    fake.always('PATCH /v1/workspaces/{workspaceId}/join-requests/{joinRequestId}', { request: {} });
    await renderWithProviders(<OrganizationScreen />, session());
    await fireEvent.press(await screen.findByTestId('join-request-jr-1'));
    await pressLast('Approve');
    await waitFor(() => expect(fake.to('PATCH /v1/workspaces/{workspaceId}/join-requests/{joinRequestId}')).toHaveLength(1));
    expect(fake.to('PATCH /v1/workspaces/{workspaceId}/join-requests/{joinRequestId}')[0]!.body).toEqual({ decision: 'approve' });
  });

  it('names the person asking to join — their name and address, the id only when the platform sends neither (24.12)', async () => {
    const fake = routeManage('owner');
    const asked = (id: string, userId: string, who: { displayName?: string; email?: string }) => ({
      id,
      workspaceId: TEST_WORKSPACE,
      userId,
      status: 'pending',
      ...who,
      createdAt: '2026-09-29T00:00:00Z',
    });
    fake.always('GET /v1/workspaces/{workspaceId}/join-requests', {
      requests: [
        asked('jr-1', 'u9', { displayName: 'Dana Reyes', email: 'dana@acme.co' }),
        asked('jr-2', 'u8', { email: 'eli@acme.co' }),
        asked('jr-3', 'u7', {}),
      ],
    });
    await renderWithProviders(<OrganizationScreen />, session());
    const named = await screen.findByTestId('join-request-jr-1');
    expect(within(named).getByText('Dana Reyes')).toBeTruthy();
    expect(within(named).getByText(/^dana@acme\.co · Asked /u)).toBeTruthy();
    expect(within(named).queryByText('u9')).toBeNull();
    expect(within(screen.getByTestId('join-request-jr-2')).getByText('eli@acme.co')).toBeTruthy();
    expect(within(screen.getByTestId('join-request-jr-2')).queryByText('u8')).toBeNull();
    expect(within(screen.getByTestId('join-request-jr-3')).getByText('u7')).toBeTruthy();
    // The decision names the person too.
    await fireEvent.press(named);
    expect(await screen.findByText(/^Dana Reyes asked .+ to join this organization\.$/u)).toBeTruthy();
  });
});

describe('Organization — everyone else', () => {
  it('tells a member of the organization who manages it, and reads nothing it would be refused', async () => {
    const fake = routeManage('member');
    await renderWithProviders(<OrganizationScreen />, session());
    expect(await screen.findByText("Only Acme Operations's owners and admins manage it.")).toBeTruthy();
    expect(fake.to('GET /v1/workspaces/{workspaceId}/members')).toHaveLength(0);
    expect(screen.queryByText('MEMBERS')).toBeNull();
  });

  it('names where to switch to an organization — Settings, whose workspace row is on the index again (build 11, D1)', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', {
      workspaces: [
        { id: TEST_WORKSPACE, name: 'Personal', type: 'personal', role: 'owner' },
        { id: 'org-9', name: 'Acme Operations', type: 'organization', role: 'member' },
      ],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    await renderWithProviders(<OrganizationScreen />, session());
    expect(
      await screen.findByText(
        'You belong to Acme Operations. Switch to it in Settings; its owners and admins manage it there.',
      ),
    ).toBeTruthy();
  });

  it('finds the organization of the email domain, asks to join, and can cancel that request', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Personal', type: 'personal', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    fake.always('GET /v1/organization-discovery', {
      organizations: [{ workspaceId: 'org-9', name: 'Acme', domain: 'acme.co', joinPolicy: 'approval', membershipState: 'none' }],
    });
    fake.always('POST /v1/organizations/{workspaceId}/join', {
      outcome: 'requested',
      workspaceId: 'org-9',
      request: { id: 'jr-7', workspaceId: 'org-9', userId: 'u1', status: 'pending', createdAt: '2026-09-29T00:00:00Z' },
    });
    fake.always('DELETE /v1/workspaces/{workspaceId}/join-requests/{joinRequestId}', { request: {} });
    await renderWithProviders(<OrganizationScreen />, session());

    await fireEvent.press(await screen.findByText('Join Acme'));
    expect(await screen.findByText('Your request was sent for approval.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel request'));
    await waitFor(() => expect(fake.to('DELETE /v1/workspaces/{workspaceId}/join-requests/{joinRequestId}')).toHaveLength(1));
    expect(fake.to('DELETE /v1/workspaces/{workspaceId}/join-requests/{joinRequestId}')[0]!.values).toEqual({
      workspaceId: 'org-9',
      joinRequestId: 'jr-7',
    });
  });

  it('offers setting one up only on a company domain, not a mailbox provider', async () => {
    const route = () => {
      const fake = fakePlatform(platformOperation);
      fake.always('GET /v1/workspaces', {
        workspaces: [{ id: TEST_WORKSPACE, name: 'Personal', type: 'personal', role: 'owner' }],
        activeWorkspaceId: TEST_WORKSPACE,
      });
      fake.always('GET /v1/organization-discovery', { organizations: [] });
    };
    route();
    const view = await renderWithProviders(<OrganizationScreen />, session('alex@gmail.com'));
    // Nothing found and nothing to set up: the whole screen is the empty-state standard (24.12).
    expect(await screen.findByTestId('screen-empty')).toBeTruthy();
    expect(screen.getByText('No organization yet')).toBeTruthy();
    expect(
      screen.getByText('No organization is registered to your email domain. An owner can send you a join link.'),
    ).toBeTruthy();
    expect(screen.queryByText('SET UP AN ORGANIZATION')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
    await view.unmount();

    route();
    await renderWithProviders(<OrganizationScreen />, session('alex@acme.co'));
    expect(await screen.findByText('SET UP AN ORGANIZATION')).toBeTruthy();
  });

  it('creates the organization once: a failed domain claim retries only the claim', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Personal', type: 'personal', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    fake.always('GET /v1/organization-discovery', { organizations: [] });
    fake.always('POST /v1/workspaces', { workspace: { id: 'org-new', name: 'Acme', type: 'organization', role: 'owner' } });
    fake.once('POST /v1/workspaces/{workspaceId}/domains', () => {
      throw new PlatformError('That domain is already claimed.', 409);
    });
    fake.always('POST /v1/workspaces/{workspaceId}/domains', { domain: DOMAIN });
    await renderWithProviders(<OrganizationScreen />, session());

    const nameField = await screen.findByPlaceholderText('Acme Corp');
    await fireEvent.changeText(nameField, 'Acme');
    await fireEvent.press(screen.getByText('Create organization'));
    expect(await screen.findByText('That domain is already claimed.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Claim acme.co again'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/domains')).toHaveLength(2));

    expect(fake.to('POST /v1/workspaces')).toHaveLength(1);
    expect(fake.to('POST /v1/workspaces')[0]!.body).toEqual({ name: 'Acme', type: 'organization', activate: true });
    for (const claim of fake.to('POST /v1/workspaces/{workspaceId}/domains')) {
      expect(claim.values).toEqual({ workspaceId: 'org-new' });
      expect(claim.body).toEqual({ domain: 'acme.co', joinPolicy: 'approval' });
    }
  });
});

describe('Organization — every change acts on the workspace the screen loaded (24.3.6)', () => {
  it('refuses in words, and sends nothing, once another workspace is active', async () => {
    const fake = fakePlatform(platformOperation);
    await renderWithProviders(
      <OrgPeople
        orgName="Acme Operations"
        viewerUserId="u1"
        members={[member('u3', 'member', 'Carol') as never]}
        requests={[]}
        shownWorkspaceId="another-workspace"
        onChanged={() => undefined}
      />,
      session(),
    );
    await fireEvent.press(screen.getByTestId('member-u3'));
    await pressLast('Remove member');
    expect(await screen.findByText(WORKSPACE_CHANGED)).toBeTruthy();
    expect(fake.sent).toHaveLength(0);
  });
});

describe('Organization — the join link (24.12, the owner\'s decision 5)', () => {
  const LINK = `https://www.example.test/onboarding/join-org?w=${encodeURIComponent(TEST_WORKSPACE)}`;
  let share: jest.SpyInstance;
  beforeEach(() => {
    share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  });
  afterEach(() => share.mockRestore());

  it("lets an owner share it on iOS as a link, saying who at the verified domain can ask to join", async () => {
    const ios = jest.replaceProperty(Platform, 'OS', 'ios');
    routeManage('owner');
    await renderWithProviders(<OrganizationScreen />, session());
    expect(await screen.findByText('Share join link')).toBeTruthy();
    expect(screen.getByText('People at acme.co can ask to join. You approve them here.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('organization-join-link'));
    expect(share).toHaveBeenCalledWith({ url: LINK });
    ios.restore();
  });

  it("shares it on Android as text, which is what Android's share sheet carries", async () => {
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    routeManage('admin');
    await renderWithProviders(<OrganizationScreen />, session());
    await fireEvent.press(await screen.findByTestId('organization-join-link'));
    expect(share).toHaveBeenCalledWith({ message: LINK });
    android.restore();
  });

  it('says a domain must be verified first when none is', async () => {
    const fake = routeManage('owner');
    fake.always('GET /v1/workspaces/{workspaceId}/domains', { domains: [{ ...DOMAIN, status: 'pending' }] });
    await renderWithProviders(<OrganizationScreen />, session());
    expect(await screen.findByText('Verify your email domain first — only people at it can ask to join.')).toBeTruthy();
  });

  /** The test domain — verified, shown for matching emails, approval — changed as a case says. */
  const domain = (change: Partial<OrganizationDomain> = {}) => ({ ...DOMAIN, ...change }) as OrganizationDomain;

  it.each<[string, Partial<OrganizationDomain>, string]>([
    ['approval', {}, 'People at acme.co can ask to join. You approve them here.'],
    ['automatic', { joinPolicy: 'automatic' }, 'People at acme.co join as soon as they open it.'],
    ['invite only', { joinPolicy: 'invite_only' }, 'Joining at acme.co is invite only, so the link lets no one in.'],
    [
      'verified, not shown for matching emails',
      { discoveryEnabled: false },
      'People at acme.co cannot find it until "Show for matching verified email domains" is on.',
    ],
    ['none verified', { status: 'pending' }, 'Verify your email domain first — only people at it can ask to join.'],
  ])('words the line by the joining policy — %s (joinLinkLine, 24.12)', (_case, change, line) => {
    expect(joinLinkLine([domain(change)])).toBe(line);
  });

  it('takes a domain shown for matching emails over a hidden one, whatever the order', () => {
    const hidden = domain({ domain: 'acme.io', discoveryEnabled: false, joinPolicy: 'automatic' });
    const shown = domain();
    const line = 'People at acme.co can ask to join. You approve them here.';
    expect(joinLinkLine([hidden, shown])).toBe(line);
    expect(joinLinkLine([shown, hidden])).toBe(line);
  });

  it('is not offered to a member, nor without a website to link to', async () => {
    routeManage('member');
    const member = await renderWithProviders(<OrganizationScreen />, session());
    expect(await screen.findByText("Only Acme Operations's owners and admins manage it.")).toBeTruthy();
    expect(screen.queryByText('Share join link')).toBeNull();
    await member.unmount();

    delete mockExtra.nativeAuthBaseUrl;
    // The member's workspace list is in the shared snapshot: read the owner's afresh.
    resetSnapshot();
    routeManage('owner');
    await renderWithProviders(<OrganizationScreen />, session());
    expect(await screen.findByText('Acme Operations')).toBeTruthy();
    expect(screen.queryByText('Share join link')).toBeNull();
  });
});

describe('Organization — a rename shows at once (24.12, the owner\'s build 9)', () => {
  it('reads the workspace list again after a rename, so the new name shows', async () => {
    const fake = routeManage('owner');
    let renamed = false;
    fake.always('GET /v1/workspaces', () => ({
      workspaces: [{ ...ORG, name: renamed ? 'Acme Group' : 'Acme Operations', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    }));
    fake.always('PATCH /v1/workspaces/{workspaceId}', () => {
      renamed = true;
      return { workspace: { ...ORG, name: 'Acme Group', role: 'owner' } };
    });
    await renderWithProviders(<OrganizationScreen />, session());
    await fireEvent.press(await screen.findByTestId('organization-name'));
    await fireEvent.changeText(await screen.findByDisplayValue('Acme Operations'), 'Acme Group');
    await pressLast('Save');
    expect(await screen.findByText('Acme Group')).toBeTruthy();
    expect(fake.to('PATCH /v1/workspaces/{workspaceId}')[0]!.body).toEqual({ name: 'Acme Group' });
    expect(fake.to('GET /v1/workspaces')).toHaveLength(2);
  });
});
