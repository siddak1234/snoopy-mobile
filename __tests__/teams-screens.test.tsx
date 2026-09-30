jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import SettingsScreen from '@/app/(tabs)/settings';
import TeamScreen from '@/app/(tabs)/settings/team';
import TeamsScreen from '@/app/(tabs)/settings/teams';
import type { SessionContextValue } from '@/hooks/use-session';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, routePlatform, sessionAs, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

let n = 0;
beforeEach(() => {
  n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
});

const org = (role: string) => ({
  workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role }],
  activeWorkspaceId: TEST_WORKSPACE,
});
const team = (viewerRole?: 'manager' | 'member') => ({
  id: 't1',
  workspaceId: TEST_WORKSPACE,
  name: 'Finance',
  description: 'Payables and receivables',
  status: 'active',
  ...(viewerRole ? { viewerRole } : {}),
  createdAt: '2026-09-01T00:00:00Z',
});

async function pressLast(label: string) {
  const buttons = await screen.findAllByText(label);
  await fireEvent.press(buttons[buttons.length - 1]!);
}

describe('Teams (24.5.3)', () => {
  it('belong to an organization: a personal workspace is told so', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Personal', type: 'personal', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    await renderWithProviders(<TeamsScreen />, signedInSession);
    expect(await screen.findByText('Teams belong to an organization workspace. Switch to one to see its teams.')).toBeTruthy();
  });

  it('an owner or admin sees every team and creates one; a two-letter name is the least it sends', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', org('admin'));
    fake.always('GET /v1/workspaces/{workspaceId}/teams', { teams: [team()] });
    fake.always('POST /v1/workspaces/{workspaceId}/teams', { team: team() });
    await renderWithProviders(<TeamsScreen />, sessionAs('admin'));
    expect(await screen.findByText('Every team in this organization')).toBeTruthy();
    expect(screen.getByText('Finance')).toBeTruthy();

    const [name] = screen.getAllByDisplayValue('');
    await fireEvent.changeText(name!, 'F');
    await fireEvent.press(screen.getByText('Create team'));
    expect(await screen.findByText('A team name needs at least two characters.')).toBeTruthy();
    expect(fake.to('POST /v1/workspaces/{workspaceId}/teams')).toHaveLength(0);

    await fireEvent.changeText(name!, 'Field ops');
    await fireEvent.press(screen.getByText('Create team'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/teams')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/teams')[0]!.body).toEqual({ name: 'Field ops' });
  });

  it('anyone else sees the teams they are on, and is offered no Create', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', org('member'));
    fake.always('GET /v1/workspaces/{workspaceId}/teams', { teams: [team('member')] });
    await renderWithProviders(<TeamsScreen />, sessionAs('member'));
    expect(await screen.findByText('The teams you are on')).toBeTruthy();
    expect(screen.getByText('Payables and receivables · You are its member.')).toBeTruthy();
    expect(screen.queryByText('CREATE A TEAM')).toBeNull();
  });
});

describe('One team (24.5.3)', () => {
  function routeTeam(role: string, viewerRole?: 'manager' | 'member') {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', org(role));
    fake.always('GET /v1/workspaces/{workspaceId}/teams', { teams: [team(viewerRole)] });
    fake.always('GET /v1/workspaces/{workspaceId}/teams/{teamId}/memberships', {
      memberships: [{ teamId: 't1', workspaceId: TEST_WORKSPACE, userId: 'u1', role: 'manager', createdAt: '2026-09-01T00:00:00Z' }],
    });
    fake.always('GET /v1/workspaces/{workspaceId}/members', {
      members: [
        { workspaceId: TEST_WORKSPACE, userId: 'u1', role: role, displayName: 'Alex', email: 'alex@acme.co', createdAt: '2026-09-01T00:00:00Z' },
        { workspaceId: TEST_WORKSPACE, userId: 'u3', role: 'member', displayName: 'Carol', email: 'carol@acme.co', createdAt: '2026-09-01T00:00:00Z' },
      ],
    });
    setMockParams({ teamId: 't1' });
    return fake;
  }

  it("is read only by its managers and the organization's owners and admins", async () => {
    const fake = routeTeam('member', 'member');
    await renderWithProviders(<TeamScreen />, sessionAs('member'));
    expect(
      await screen.findByText("Only this team's managers, and the organization's owners and admins, can see who is on it."),
    ).toBeTruthy();
    expect(fake.to('GET /v1/workspaces/{workspaceId}/teams/{teamId}/memberships')).toHaveLength(0);
  });

  it('a manager adds someone or changes their role, in one control', async () => {
    const fake = routeTeam('member', 'manager');
    fake.always('POST /v1/workspaces/{workspaceId}/teams/{teamId}/memberships', { membership: {} });
    await renderWithProviders(<TeamScreen />, sessionAs('member'));
    await fireEvent.press(await screen.findByTestId('team-member-person'));
    await fireEvent.press(await screen.findByTestId('pick-u3'));
    await fireEvent.press(screen.getByText('Manager'));
    await fireEvent.press(screen.getByText('Add or change role'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/teams/{teamId}/memberships')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/teams/{teamId}/memberships')[0]!.body).toEqual({ userId: 'u3', role: 'manager' });
  });

  it('a manager who takes themselves off leaves a team they can no longer see', async () => {
    const fake = routeTeam('member', 'manager');
    fake.always('DELETE /v1/workspaces/{workspaceId}/teams/{teamId}/memberships/{userId}', { removed: true });
    await renderWithProviders(<TeamScreen />, sessionAs('member'));
    await fireEvent.press(await screen.findByTestId('team-member-u1'));
    expect(await screen.findByText('Remove Alex from Finance?')).toBeTruthy();
    await pressLast('Remove');
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });
});

describe('Settings rows for the admin areas (24.3.8, 24.5)', () => {
  it('always offers Organization and Projects, and Teams only in an organization', async () => {
    routePlatform(platformOperation);
    const view = await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(await screen.findByTestId('settings-organization')).toBeTruthy();
    expect(screen.getByTestId('settings-projects')).toBeTruthy();
    expect(screen.queryByTestId('settings-teams')).toBeNull();
    await view.unmount();

    const inOrganization = {
      ...signedInSession,
      session: {
        ...(signedInSession as Extract<SessionContextValue, { status: 'signed-in' }>).session,
        workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'member' }],
      },
    } as SessionContextValue;
    routePlatform(platformOperation);
    await renderWithProviders(<SettingsScreen />, inOrganization);
    await fireEvent.press(await screen.findByTestId('settings-teams'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/teams');
  });
});
