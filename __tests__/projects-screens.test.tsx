jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));

import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import ProjectScreen from '@/app/(tabs)/settings/project';
import ProjectsScreen from '@/app/(tabs)/settings/projects';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import { fakePlatform, type Sent } from '@/test/fake-platform';
import { TEST_WORKSPACE, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

let n = 0;
beforeEach(() => {
  n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
});

const PERSONAL = 'ws-personal';
const WORKSPACES = {
  workspaces: [
    { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'admin' },
    { id: PERSONAL, name: 'Personal', type: 'personal', role: 'owner' },
  ],
  activeWorkspaceId: TEST_WORKSPACE,
};
const project = (id: string, workspaceId: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  workspaceId,
  name,
  type: 'Invoices',
  status: 'active',
  viewerRole: 'owner',
  createdAt: '2026-09-01T00:00:00Z',
  ...extra,
});

async function pressLast(label: string) {
  const buttons = await screen.findAllByText(label);
  await fireEvent.press(buttons[buttons.length - 1]!);
}

describe('Projects (24.5.2)', () => {
  function routeList() {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', WORKSPACES);
    fake.always('GET /v1/workspaces/{workspaceId}/projects', (sent: Sent) =>
      sent.values.workspaceId === TEST_WORKSPACE
        ? { projects: [project('p1', TEST_WORKSPACE, 'AP inbox'), project('p2', TEST_WORKSPACE, 'Old', { status: 'archived' })] }
        : { projects: [project('p3', PERSONAL, 'Receipts')] },
    );
    fake.always('POST /v1/workspaces/{workspaceId}/projects', { project: project('p9', TEST_WORKSPACE, 'New') });
    return fake;
  }

  it('lists every project the person can see, by workspace, and not a deleted one', async () => {
    routeList();
    await renderWithProviders(<ProjectsScreen />, signedInSession);
    expect(await screen.findByText('ACME OPERATIONS TEAM PROJECTS')).toBeTruthy();
    expect(screen.getByText('PERSONAL')).toBeTruthy();
    expect(screen.getByText('AP inbox')).toBeTruthy();
    expect(screen.getByText('Receipts')).toBeTruthy();
    expect(screen.queryByText('Old')).toBeNull();
    expect(screen.getByText('Manage your projects across all organizations')).toBeTruthy();
  });

  it('creates a personal project in the personal workspace, and a team one in the active organization', async () => {
    const fake = routeList();
    await renderWithProviders(<ProjectsScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Create project'));
    await fireEvent.changeText(screen.getByPlaceholderText('My project'), 'Payables');
    await fireEvent.changeText(screen.getByPlaceholderText('Invoice processing'), 'Invoices');
    await pressLast('Create project');
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')[0]!.values).toEqual({ workspaceId: PERSONAL });
    await fireEvent.press(await screen.findByText('Done'));

    await fireEvent.press(await screen.findByText('Create project'));
    await fireEvent.press(screen.getByText('Team'));
    expect(screen.getByText('Created in Acme Operations.')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('My project'), 'Team payables');
    await fireEvent.changeText(screen.getByPlaceholderText('Invoice processing'), 'Invoices');
    await pressLast('Create project');
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(2));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')[1]!.values).toEqual({ workspaceId: TEST_WORKSPACE });
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')[1]!.body).toEqual({ name: 'Team payables', type: 'Invoices' });
  });

  it('refuses a team project once the organization is no longer the active workspace, and sends nothing', async () => {
    const fake = fakePlatform(platformOperation);
    const org = WORKSPACES.workspaces[0] as never;
    await renderWithProviders(
      <CreateProjectDialog
        personal={WORKSPACES.workspaces[1] as never}
        teamWorkspace={org}
        inOrganization
        shownWorkspaceId="another-workspace"
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
      signedInSession,
    );
    await fireEvent.press(screen.getByText('Team'));
    await fireEvent.changeText(screen.getByPlaceholderText('My project'), 'Team payables');
    await fireEvent.changeText(screen.getByPlaceholderText('Invoice processing'), 'Invoices');
    await pressLast('Create project');
    expect(await screen.findByText(WORKSPACE_CHANGED)).toBeTruthy();
    expect(fake.sent).toHaveLength(0);
  });
});

describe('One project (24.5.2)', () => {
  function routeProject(viewerRole: 'owner' | 'admin' | 'member', workspaceId = TEST_WORKSPACE) {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', WORKSPACES);
    fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}', { project: project('p1', workspaceId, 'AP inbox', { viewerRole }) });
    fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}/memberships', {
      memberships: [
        { projectId: 'p1', workspaceId, userId: 'u2', role: 'owner', displayName: 'Ben', email: 'ben@acme.co', createdAt: '2026-09-01T00:00:00Z' },
        { projectId: 'p1', workspaceId, userId: 'u1', role: viewerRole === 'owner' ? 'admin' : viewerRole, displayName: 'Alex', email: 'alex@acme.co', createdAt: '2026-09-01T00:00:00Z' },
        { projectId: 'p1', workspaceId, userId: 'u3', role: 'member', displayName: 'Carol', email: 'carol@acme.co', createdAt: '2026-09-01T00:00:00Z' },
      ],
    });
    fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}/team-grants', { grants: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/teams', {
      teams: [{ id: 't1', workspaceId, name: 'Finance', status: 'active', createdAt: '2026-09-01T00:00:00Z' }],
    });
    fake.always('GET /v1/workspaces/{workspaceId}/members', {
      members: [{ workspaceId, userId: 'u4', role: 'member', displayName: 'Dana', email: 'dana@acme.co', createdAt: '2026-09-01T00:00:00Z' }],
    });
    setMockParams({ projectId: 'p1', workspaceId });
    return fake;
  }

  it("deletes its owner's project in the project's own workspace, after a confirmation", async () => {
    const fake = routeProject('owner', PERSONAL);
    fake.always('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}', { project: {} });
    await renderWithProviders(<ProjectScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Delete project'));
    expect(await screen.findByText('Delete "AP inbox"?')).toBeTruthy();
    await pressLast('Delete');
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    const [archived] = fake.to('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}');
    expect(archived!.values).toEqual({ workspaceId: PERSONAL, projectId: 'p1' });
    expect(archived!.body).toEqual({ status: 'archived' });
  });

  it('lets anyone else leave only after typing DELETE', async () => {
    const fake = routeProject('member');
    fake.always('DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/memberships/{userId}', { removed: true });
    await renderWithProviders(<ProjectScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Leave project'));
    await pressLast('Leave project');
    expect(fake.to('DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/memberships/{userId}')).toHaveLength(0);

    await fireEvent.changeText(screen.getByPlaceholderText('Type DELETE'), 'delete');
    await pressLast('Leave project');
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(fake.to('DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/memberships/{userId}')[0]!.values).toEqual({
      workspaceId: TEST_WORKSPACE,
      projectId: 'p1',
      userId: 'u1',
    });
  });

  it("changes a member's role and adds someone; an owner's row is not changed", async () => {
    const fake = routeProject('owner');
    fake.always('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships', { membership: {} });
    await renderWithProviders(<ProjectScreen />, signedInSession);

    await fireEvent.press(await screen.findByTestId('project-member-u2'));
    expect(screen.queryByTestId('project-member-dialog')).toBeNull();

    await fireEvent.press(screen.getByTestId('project-member-u3'));
    await fireEvent.press(within(await screen.findByTestId('project-member-dialog')).getByText('Admin'));
    await pressLast('Save role');
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships')[0]!.body).toEqual({ userId: 'u3', role: 'admin' });

    await fireEvent.press(await screen.findByText('Add team members'));
    await fireEvent.press(await screen.findByTestId('add-u4'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships')).toHaveLength(2));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships')[1]!.body).toEqual({ userId: 'u4', role: 'member' });
  });

  it('gives a team access, never ownership', async () => {
    const fake = routeProject('admin');
    fake.always('POST /v1/workspaces/{workspaceId}/projects/{projectId}/team-grants', { grant: {} });
    await renderWithProviders(<ProjectScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('grant-team'));
    await fireEvent.press(await screen.findByTestId('pick-t1'));
    await fireEvent.press(screen.getByText('Give access'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/team-grants')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects/{projectId}/team-grants')[0]!.body).toEqual({ teamId: 't1', role: 'member' });
  });
});
