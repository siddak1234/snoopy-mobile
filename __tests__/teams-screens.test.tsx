jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));

import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import SettingsScreen from '@/app/(tabs)/settings';
import TeamScreen from '@/app/(tabs)/settings/team';
import TeamsScreen from '@/app/(tabs)/settings/teams';
import { PlatformError } from '@/lib/platform/problem';
import { fakePlatform, type Sent } from '@/test/fake-platform';
import { TEST_WORKSPACE, routePlatform, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

let n = 0;
beforeEach(() => {
  n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
});

/**
 * Teams (BUILD-PLAN 24.11.7): a team is a sub-organization with its own flows —
 * a project, in the platform's contract. These are the screens over the
 * operations backend 24.11.2 and 24.11.4 publish: the teams a person is on, the
 * directory they ask from, creating one, and a team's own page.
 */

const PERSONAL = 'ws-personal';
const workspaces = (orgRole: 'owner' | 'admin' | 'member' = 'member') => ({
  workspaces: [
    { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: orgRole },
    { id: PERSONAL, name: 'Personal', type: 'personal', role: 'owner' },
  ],
  activeWorkspaceId: TEST_WORKSPACE,
});
const team = (id: string, workspaceId: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  workspaceId,
  name,
  type: 'Finance',
  status: 'active',
  viewerRole: 'owner',
  createdAt: '2026-09-01T00:00:00Z',
  ...extra,
});
const entry = (id: string, name: string, access: 'member' | 'requested' | 'none') => ({
  id,
  workspaceId: TEST_WORKSPACE,
  name,
  type: 'Legal',
  status: 'active',
  access,
  createdAt: '2026-09-01T00:00:00Z',
});

async function pressLast(label: string) {
  const buttons = await screen.findAllByText(label);
  await fireEvent.press(buttons[buttons.length - 1]!);
}

describe('Teams (24.11.7)', () => {
  function routeList(directory: unknown = { projects: [entry('p1', 'AP inbox', 'member'), entry('p4', 'Legal', 'none'), entry('p5', 'Data', 'requested')] }) {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', workspaces());
    fake.always('GET /v1/workspaces/{workspaceId}/projects', (sent: Sent) =>
      sent.values.workspaceId === TEST_WORKSPACE
        ? { projects: [team('p1', TEST_WORKSPACE, 'AP inbox', { viewerRole: 'member' }), team('p2', TEST_WORKSPACE, 'Old', { status: 'archived' })] }
        : { projects: [team('p3', PERSONAL, 'Receipts')] },
    );
    fake.always('GET /v1/workspaces/{workspaceId}/project-directory', directory);
    fake.always('POST /v1/workspaces/{workspaceId}/projects', (sent: Sent) => ({
      project: team('p9', sent.values.workspaceId!, (sent.body as { name: string }).name),
    }));
    return fake;
  }

  it('lists the teams the person is on, by workspace and not a deleted one, and the ones they can ask to join', async () => {
    routeList();
    await renderWithProviders(<TeamsScreen />, signedInSession);
    expect(await screen.findByText('ACME OPERATIONS')).toBeTruthy();
    expect(screen.getByText('PERSONAL')).toBeTruthy();
    expect(screen.getByText('AP inbox')).toBeTruthy();
    expect(screen.getByText('Receipts')).toBeTruthy();
    expect(screen.queryByText('Old')).toBeNull();
    expect(screen.getByText('ASK TO JOIN')).toBeTruthy();
    // A team they are on is not offered to ask onto again.
    expect(screen.queryByTestId('askable-p1')).toBeNull();
    expect(screen.getByTestId('request-p4')).toBeTruthy();
    expect(screen.getByTestId('requested-p5')).toBeTruthy();
  });

  it('asks to join a team and reads the directory again; withdraws a request it made', async () => {
    const fake = routeList();
    fake.always('POST /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests', { request: {} });
    fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests', {
      requests: [{ id: 'r5', projectId: 'p5', workspaceId: TEST_WORKSPACE, userId: 'u1', status: 'pending', email: 'alex@acme.co', createdAt: '2026-10-02T00:00:00Z' }],
    });
    fake.always('DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}', { request: {} });
    await renderWithProviders(<TeamsScreen />, signedInSession);
    const reads = () => fake.to('GET /v1/workspaces/{workspaceId}/project-directory').length;
    await fireEvent.press(await screen.findByTestId('request-p4'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests')[0]!.values).toEqual({
      workspaceId: TEST_WORKSPACE,
      projectId: 'p4',
    });
    await waitFor(() => expect(reads()).toBeGreaterThan(1));

    await fireEvent.press(await screen.findByTestId('requested-p5'));
    expect(await screen.findByText('Withdraw your request to join Data?')).toBeTruthy();
    await pressLast('Withdraw');
    await waitFor(() =>
      expect(fake.to('DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}')).toHaveLength(1),
    );
    expect(fake.to('DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}')[0]!.values).toEqual({
      workspaceId: TEST_WORKSPACE,
      projectId: 'p5',
      requestId: 'r5',
    });
  });

  it('lists the teams it is on when the platform has no directory yet, and offers nothing to ask for', async () => {
    const fake = routeList();
    fake.always('GET /v1/workspaces/{workspaceId}/project-directory', () => {
      throw new PlatformError('Not found', 404);
    });
    await renderWithProviders(<TeamsScreen />, signedInSession);
    expect(await screen.findByText('AP inbox')).toBeTruthy();
    expect(screen.queryByText('ASK TO JOIN')).toBeNull();
    expect(screen.queryByText("Couldn't load your teams")).toBeNull();
  });

  it('creates a team where the person picks, of a kind from the list or in their own words, then opens it', async () => {
    const fake = routeList({ projects: [] });
    await renderWithProviders(<TeamsScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Create a team'));
    // Preselected: the workspace being looked at.
    expect(await screen.findByLabelText('Organization: Acme Operations')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Accounts payable'), 'Payables');
    await pressLast('Create team');
    expect(await screen.findByText('Pick the kind of team.')).toBeTruthy();
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(0);

    // The kinds are a dropdown; Other opens a field for the person's own words.
    await fireEvent.press(screen.getByTestId('team-kind'));
    expect(screen.getByTestId('team-kind-option-Customer Support')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('team-kind-option-Other'));
    await fireEvent.changeText(screen.getByPlaceholderText('Facilities'), 'Treasury');
    await fireEvent.press(screen.getByTestId('team-workspace'));
    await fireEvent.press(screen.getByTestId(`team-workspace-option-${PERSONAL}`));
    expect(screen.getByLabelText('Organization: Personal — just you')).toBeTruthy();
    await pressLast('Create team');
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(1));
    const [created] = fake.to('POST /v1/workspaces/{workspaceId}/projects');
    expect(created!.values).toEqual({ workspaceId: PERSONAL });
    expect(created!.body).toEqual({ name: 'Payables', type: 'Treasury' });

    await fireEvent.press(await screen.findByText('Done'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/settings/team',
      params: { projectId: 'p9', workspaceId: PERSONAL },
    });
  });

  it('refuses a one-letter name and an empty Other, sending nothing', async () => {
    const fake = routeList({ projects: [] });
    await renderWithProviders(<TeamsScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Create a team'));
    await fireEvent.changeText(await screen.findByPlaceholderText('Accounts payable'), 'P');
    await fireEvent.press(screen.getByTestId('team-kind'));
    await fireEvent.press(screen.getByTestId('team-kind-option-HR'));
    await pressLast('Create team');
    expect(await screen.findByText('A team name is 2 to 60 characters.')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Accounts payable'), 'People');
    await fireEvent.press(screen.getByTestId('team-kind'));
    await fireEvent.press(screen.getByTestId('team-kind-option-Other'));
    await pressLast('Create team');
    expect(await screen.findByText('Say what kind of team it is, in up to 120 characters.')).toBeTruthy();
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(0);
  });
});

describe('One team (24.11.7)', () => {
  function routeTeam(
    viewerRole: 'owner' | 'admin' | 'member',
    options: { workspaceId?: string; onTeam?: boolean; orgRole?: 'owner' | 'admin' | 'member' } = {},
  ) {
    const workspaceId = options.workspaceId ?? TEST_WORKSPACE;
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', workspaces(options.orgRole));
    fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}', { project: team('p1', workspaceId, 'AP inbox', { viewerRole }) });
    fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}/memberships', {
      memberships: [
        { projectId: 'p1', workspaceId, userId: 'u2', role: 'owner', displayName: 'Ben', email: 'ben@acme.co', createdAt: '2026-09-01T00:00:00Z' },
        ...(options.onTeam === false
          ? []
          : [{ projectId: 'p1', workspaceId, userId: 'u1', role: viewerRole === 'owner' ? 'admin' : viewerRole, displayName: 'Alex', email: 'alex@acme.co', createdAt: '2026-09-01T00:00:00Z' }]),
        { projectId: 'p1', workspaceId, userId: 'u3', role: 'member', displayName: 'Carol', email: 'carol@acme.co', createdAt: '2026-09-01T00:00:00Z' },
      ],
    });
    fake.always('GET /v1/workspaces/{workspaceId}/members', {
      members: [{ workspaceId, userId: 'u4', role: 'member', displayName: 'Dana', email: 'dana@acme.co', createdAt: '2026-09-01T00:00:00Z' }],
    });
    fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests', {
      requests: [
        { id: 'r1', projectId: 'p1', workspaceId, userId: 'u5', status: 'pending', displayName: 'Erin', email: 'erin@acme.co', createdAt: '2026-10-02T00:00:00Z' },
        { id: 'r2', projectId: 'p1', workspaceId, userId: 'u6', status: 'denied', email: 'fay@acme.co', createdAt: '2026-10-01T00:00:00Z' },
      ],
    });
    setMockParams({ projectId: 'p1', workspaceId });
    return fake;
  }

  it("deletes its owner's team in the team's own workspace, saying what becomes of its flows", async () => {
    const fake = routeTeam('owner', { workspaceId: PERSONAL });
    fake.always('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}', { project: {} });
    await renderWithProviders(<TeamScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Delete team'));
    expect(await screen.findByText('Delete "AP inbox"?')).toBeTruthy();
    // What actually happens — not a promise that data "reattaches" (it never did).
    expect(screen.getByText('It leaves every team list. Its flows keep running until you remove them in Flows.')).toBeTruthy();
    await pressLast('Delete team');
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    const [archived] = fake.to('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}');
    expect(archived!.values).toEqual({ workspaceId: PERSONAL, projectId: 'p1' });
    expect(archived!.body).toEqual({ status: 'archived' });
  });

  it('lets a member leave only after typing DELETE, and shows them no requests', async () => {
    const fake = routeTeam('member');
    fake.always('DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/memberships/{userId}', { removed: true });
    await renderWithProviders(<TeamScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Leave team'));
    expect(screen.queryByText(/ASKING TO JOIN/u)).toBeNull();
    expect(fake.to('GET /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests')).toHaveLength(0);
    await pressLast('Leave team');
    expect(fake.to('DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/memberships/{userId}')).toHaveLength(0);

    await fireEvent.changeText(screen.getByPlaceholderText('Type DELETE'), 'delete');
    await pressLast('Leave team');
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(fake.to('DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/memberships/{userId}')[0]!.values).toEqual({
      workspaceId: TEST_WORKSPACE,
      projectId: 'p1',
      userId: 'u1',
    });
  });

  it("changes a member's role and adds someone; an owner's row is not changed", async () => {
    const fake = routeTeam('owner');
    fake.always('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships', { membership: {} });
    await renderWithProviders(<TeamScreen />, signedInSession);

    await fireEvent.press(await screen.findByTestId('team-member-u2'));
    expect(screen.queryByTestId('team-member-dialog')).toBeNull();

    await fireEvent.press(screen.getByTestId('team-member-u3'));
    await fireEvent.press(within(await screen.findByTestId('team-member-dialog')).getByText('Admin'));
    await pressLast('Save role');
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships')[0]!.body).toEqual({ userId: 'u3', role: 'admin' });

    await fireEvent.press(await screen.findByText('Add members'));
    await fireEvent.press(await screen.findByTestId('add-u4'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships')).toHaveLength(2));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships')[1]!.body).toEqual({ userId: 'u4', role: 'member' });
  });

  it('shows a manager who is asking to join, and approves or denies them', async () => {
    const fake = routeTeam('admin');
    fake.always('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}', { request: {} });
    await renderWithProviders(<TeamScreen />, signedInSession);
    expect(await screen.findByText('ASKING TO JOIN · 1')).toBeTruthy();
    // Only what is still waiting: a denied request is not a decision to make.
    expect(screen.queryByText('fay@acme.co')).toBeNull();
    await fireEvent.press(screen.getByTestId('team-request-r1'));
    expect(await screen.findByText('Request to join')).toBeTruthy();
    await pressLast('Approve');
    await waitFor(() =>
      expect(fake.to('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}')).toHaveLength(1),
    );
    const [decided] = fake.to('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}');
    expect(decided!.values).toEqual({ workspaceId: TEST_WORKSPACE, projectId: 'p1', requestId: 'r1' });
    expect(decided!.body).toEqual({ decision: 'approve' });

    await fireEvent.press(await screen.findByTestId('team-request-r1'));
    await pressLast('Deny');
    await waitFor(() =>
      expect(fake.to('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}')).toHaveLength(2),
    );
    expect(fake.to('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}')[1]!.body).toEqual({
      decision: 'deny',
    });
  });

  it('lets an organization admin who is not on the team see it and decide, with nothing to leave (24.11.3)', async () => {
    routeTeam('admin', { onTeam: false, orgRole: 'admin' });
    await renderWithProviders(<TeamScreen />, signedInSession);
    expect(await screen.findByText(/You see every team as an organization admin/u)).toBeTruthy();
    expect(screen.getByText('ASKING TO JOIN · 1')).toBeTruthy();
    expect(screen.queryByText('Leave team')).toBeNull();
    expect(screen.queryByText('Delete team')).toBeNull();
  });
});

describe('Settings rows for the admin areas (24.3.8, 24.5, 24.11.7)', () => {
  it('always offers Organization and Teams — and no Projects row, and no organization-only Teams', async () => {
    routePlatform(platformOperation);
    await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(await screen.findByTestId('settings-organization')).toBeTruthy();
    expect(screen.queryByTestId('settings-projects')).toBeNull();
    await fireEvent.press(screen.getByTestId('settings-teams'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/teams');
  });
});
