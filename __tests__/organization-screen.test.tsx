jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import OrganizationScreen from '@/app/(tabs)/settings/organization';
import { OrgPeople } from '@/components/organization/org-people';
import type { SessionContextValue } from '@/hooks/use-session';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import { PlatformError } from '@/lib/platform/problem';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, signedInSession } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

let n = 0;
beforeEach(() => {
  n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
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
});

describe('Organization — everyone else', () => {
  it('tells a member of the organization who manages it, and reads nothing it would be refused', async () => {
    const fake = routeManage('member');
    await renderWithProviders(<OrganizationScreen />, session());
    expect(await screen.findByText("Only Acme Operations's owners and admins manage it.")).toBeTruthy();
    expect(fake.to('GET /v1/workspaces/{workspaceId}/members')).toHaveLength(0);
    expect(screen.queryByText('MEMBERS')).toBeNull();
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
    expect(await screen.findByText('No organization is registered to your email domain yet.')).toBeTruthy();
    expect(screen.queryByText('SET UP AN ORGANIZATION')).toBeNull();
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
