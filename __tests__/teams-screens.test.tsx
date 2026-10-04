jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';

import TeamScreen from '@/app/(tabs)/settings/team';
import TeamsScreen from '@/app/(tabs)/settings/teams';
import SettingsScreen from '@/app/(tabs)/settings';
import { CreateTeamDialog } from '@/components/teams/create-team-dialog';
import { nocturneDark } from '@/constants/theme';
import { SessionContext, type SessionContextValue } from '@/hooks/use-session';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import { PlatformError } from '@/lib/platform/problem';
import { teamDirectoryIfThere, type AccessRequest, type Project, type TeamDirectoryEntry } from '@/lib/platform/projects';
import { fakePlatform, type Answer, type Sent } from '@/test/fake-platform';
import { TEST_WORKSPACE, sessionAs, signedInSession } from '@/test/platform';
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
const workspaces = (orgRole: 'owner' | 'admin' | 'member' = 'member'): Answer<'GET /v1/workspaces'> => ({
  workspaces: [
    { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: orgRole },
    { id: PERSONAL, name: 'Personal', type: 'personal', role: 'owner' },
  ],
  activeWorkspaceId: TEST_WORKSPACE,
});
/** A team is its kind (24.12): the kind is its name and its type. A team made before keeps its own name. */
const team = (id: string, workspaceId: string, kind: string, extra: Partial<Project> = {}): Project => ({
  id,
  workspaceId,
  name: kind,
  type: kind,
  status: 'active',
  viewerRole: 'owner',
  createdAt: '2026-09-01T00:00:00Z',
  ...extra,
});
const entry = (id: string, kind: string, access: 'member' | 'requested' | 'none'): TeamDirectoryEntry => ({
  id,
  workspaceId: TEST_WORKSPACE,
  name: kind,
  type: kind,
  status: 'active',
  access,
  createdAt: '2026-09-01T00:00:00Z',
});

/** The signed-in session in its organization, with this role there. */
const orgSession = (role: 'owner' | 'admin' | 'member') => sessionAs(role);

/** The same person with their personal workspace active. */
function personalSession(): SessionContextValue {
  if (signedInSession.status !== 'signed-in') throw new Error('fixture');
  return {
    ...signedInSession,
    session: {
      ...signedInSession.session,
      user: { ...signedInSession.session.user, activeWorkspaceId: PERSONAL },
      workspaces: [
        { id: PERSONAL, name: 'Personal', type: 'personal', role: 'owner' },
        { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'member' },
      ],
    },
  };
}

async function pressLast(label: string) {
  const buttons = await screen.findAllByText(label);
  await fireEvent.press(buttons[buttons.length - 1]!);
}

const colorOf = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style) as { color?: string }).color;

describe('Teams (24.11.7)', () => {
  function routeList(
    directory: Answer<'GET /v1/workspaces/{workspaceId}/project-directory'> = {
      projects: [entry('p1', 'Finance', 'member'), entry('p4', 'Legal', 'none'), entry('p5', 'Data', 'requested')],
    },
    orgRole: 'owner' | 'admin' | 'member' = 'member',
  ) {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', workspaces(orgRole));
    fake.always('GET /v1/workspaces/{workspaceId}/projects', (sent: Sent) =>
      sent.values.workspaceId === TEST_WORKSPACE
        ? { projects: [team('p1', TEST_WORKSPACE, 'Finance', { viewerRole: 'member' }), team('p2', TEST_WORKSPACE, 'Sales', { status: 'archived' })] }
        : { projects: [team('p3', PERSONAL, 'Accounting')] },
    );
    fake.always('GET /v1/workspaces/{workspaceId}/project-directory', directory);
    fake.always('POST /v1/workspaces/{workspaceId}/projects', (sent: Sent) => ({
      project: team('p9', sent.values.workspaceId!, (sent.body as { type: string }).type),
    }));
    return fake;
  }

  /** Nothing to list anywhere: no team, nothing to ask onto. */
  function routeNone(orgRole: 'owner' | 'admin' | 'member') {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', workspaces(orgRole));
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/project-directory', { projects: [] });
    fake.always('POST /v1/workspaces/{workspaceId}/projects', (sent: Sent) => ({
      project: team('p9', sent.values.workspaceId!, (sent.body as { type: string }).type),
    }));
    return fake;
  }

  it('lists the teams the person is on, by workspace and not a deleted one, and the ones they can ask to join', async () => {
    routeList();
    await renderWithProviders(<TeamsScreen />, signedInSession);
    expect(await screen.findByText('ACME OPERATIONS')).toBeTruthy();
    expect(screen.getByText('PERSONAL')).toBeTruthy();
    expect(screen.getByText('Accounting')).toBeTruthy();
    expect(screen.queryByText('Sales')).toBeNull();
    expect(screen.getByText('ASK TO JOIN')).toBeTruthy();
    // A team they are on is not offered to ask onto again.
    expect(screen.queryByTestId('askable-p1')).toBeNull();
    expect(screen.getByTestId('request-p4')).toBeTruthy();
    expect(screen.getByTestId('requested-p5')).toBeTruthy();
  });

  it('titles a team by its kind and says the kind once — a team named before 24.12 too (24.12)', async () => {
    const fake = routeList();
    fake.always('GET /v1/workspaces/{workspaceId}/projects', (sent: Sent) =>
      sent.values.workspaceId === TEST_WORKSPACE
        ? { projects: [team('p1', TEST_WORKSPACE, 'Finance', { name: 'AP inbox', viewerRole: 'member' })] }
        : { projects: [team('p3', PERSONAL, 'Accounting')] },
    );
    await renderWithProviders(<TeamsScreen />, signedInSession);
    expect(await screen.findByText('Finance')).toBeTruthy();
    expect(screen.getAllByText('Finance')).toHaveLength(1);
    expect(screen.getAllByText('Accounting')).toHaveLength(1);
    expect(screen.queryByText('AP inbox')).toBeNull();
  });

  it('asks to join a team and reads the directory again; withdraws a request it made', async () => {
    const fake = routeList();
    const mine: AccessRequest = { id: 'r5', projectId: 'p5', workspaceId: TEST_WORKSPACE, userId: 'u1', status: 'pending', email: 'alex@acme.co', createdAt: '2026-10-02T00:00:00Z' };
    fake.always('POST /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests', { request: mine });
    fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests', { requests: [mine] });
    fake.always('DELETE /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}', {
      request: { ...mine, status: 'cancelled' },
    });
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
    // Asking again undoes it, so its confirm is the way on, not red (the owner's build 12 item 5).
    const withdraw = within(screen.getByTestId('withdraw-request-dialog')).getByText('Withdraw');
    expect(colorOf(withdraw)).toBe(nocturneDark.accent);
    expect(colorOf(withdraw)).not.toBe(nocturneDark.danger);
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
    expect(await screen.findByText('Finance')).toBeTruthy();
    expect(screen.queryByText('ASK TO JOIN')).toBeNull();
    expect(screen.queryByText("Couldn't load your teams")).toBeNull();
  });

  it("reads the directory through the one helper Setup shares: a 404 is nothing to list, any other failure is the screen's (F84)", async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/project-directory', () => {
      throw new PlatformError('Not found', 404);
    });
    await expect(teamDirectoryIfThere(TEST_WORKSPACE)).resolves.toEqual([]);

    const refused = new PlatformError('Service Unavailable', 503);
    fake.always('GET /v1/workspaces/{workspaceId}/project-directory', () => {
      throw refused;
    });
    await expect(teamDirectoryIfThere(TEST_WORKSPACE)).rejects.toBe(refused);

    fake.always('GET /v1/workspaces/{workspaceId}/project-directory', { projects: [entry('p4', 'Legal', 'none')] });
    await expect(teamDirectoryIfThere(TEST_WORKSPACE)).resolves.toEqual([entry('p4', 'Legal', 'none')]);
    expect(fake.to('GET /v1/workspaces/{workspaceId}/project-directory').map((sent) => sent.values)).toEqual([
      { workspaceId: TEST_WORKSPACE },
      { workspaceId: TEST_WORKSPACE },
      { workspaceId: TEST_WORKSPACE },
    ]);
  });

  it('creates a team in the workspace the person is in: the kind only, sent as its name and its type (24.12)', async () => {
    const fake = routeList({ projects: [] }, 'admin');
    await renderWithProviders(<TeamsScreen />, orgSession('admin'));
    await fireEvent.press(await screen.findByText('Create a team'));
    // Named, not picked: no organization picker, no name, no description.
    expect(await screen.findByText('In Acme Operations.')).toBeTruthy();
    expect(screen.queryByLabelText(/^Organization:/u)).toBeNull();
    expect(screen.queryByText('Team name')).toBeNull();
    expect(screen.queryByText('Description (optional)')).toBeNull();
    await pressLast('Create team');
    expect(await screen.findByText('Pick the kind of team.')).toBeTruthy();
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('team-kind'));
    expect(screen.getByTestId('team-kind-option-Customer Support')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('team-kind-option-Finance'));
    await pressLast('Create team');
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(1));
    const [created] = fake.to('POST /v1/workspaces/{workspaceId}/projects');
    expect(created!.values).toEqual({ workspaceId: TEST_WORKSPACE });
    expect(created!.body).toEqual({ name: 'Finance', type: 'Finance' });

    expect(await screen.findByText('Your team is ready. Add people on its page.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Done'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/settings/team',
      params: { projectId: 'p9', workspaceId: TEST_WORKSPACE },
    });
  });

  it("sends Other's own words, trimmed, as the name and the type", async () => {
    const fake = routeList({ projects: [] }, 'owner');
    await renderWithProviders(<TeamsScreen />, orgSession('owner'));
    await fireEvent.press(await screen.findByText('Create a team'));
    await fireEvent.press(await screen.findByTestId('team-kind'));
    await fireEvent.press(screen.getByTestId('team-kind-option-Other'));
    await fireEvent.changeText(screen.getByPlaceholderText('Facilities'), '  Treasury ');
    await pressLast('Create team');
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')[0]!.body).toEqual({ name: 'Treasury', type: 'Treasury' });
  });

  it('creates one in the personal workspace when that is the one the person is in', async () => {
    const fake = routeList({ projects: [] });
    await renderWithProviders(<TeamsScreen />, personalSession());
    await fireEvent.press(await screen.findByText('Create a team'));
    expect(await screen.findByText('In your personal workspace.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('team-kind'));
    await fireEvent.press(screen.getByTestId('team-kind-option-HR'));
    await pressLast('Create team');
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(1));
    const [created] = fake.to('POST /v1/workspaces/{workspaceId}/projects');
    expect(created!.values).toEqual({ workspaceId: PERSONAL });
    expect(created!.body).toEqual({ name: 'HR', type: 'HR' });
    // A personal team has only its owner: there is nobody to add.
    expect(await screen.findByText('Your team is ready.')).toBeTruthy();
  });

  it('refuses an empty Other and words outside 2 to 60 characters, sending nothing', async () => {
    const fake = routeList({ projects: [] }, 'admin');
    await renderWithProviders(<TeamsScreen />, orgSession('admin'));
    await fireEvent.press(await screen.findByText('Create a team'));
    await fireEvent.press(await screen.findByTestId('team-kind'));
    await fireEvent.press(screen.getByTestId('team-kind-option-Other'));
    for (const words of ['', ' ', 'X', 'x'.repeat(61)]) {
      await fireEvent.changeText(screen.getByPlaceholderText('Facilities'), words);
      await pressLast('Create team');
      expect(await screen.findByText('Say what kind of team it is, in 2 to 60 characters.')).toBeTruthy();
    }
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(0);
  });

  it('says a second team of a kind in words — never "Conflict" — and a refusal to a member as the rule', async () => {
    const fake = routeList({ projects: [] }, 'admin');
    fake.once('POST /v1/workspaces/{workspaceId}/projects', () => {
      throw new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'team_kind_taken' });
    });
    fake.once('POST /v1/workspaces/{workspaceId}/projects', () => {
      throw new PlatformError('Forbidden', 403, 'FORBIDDEN');
    });
    await renderWithProviders(<TeamsScreen />, orgSession('admin'));
    await fireEvent.press(await screen.findByText('Create a team'));
    await fireEvent.press(await screen.findByTestId('team-kind'));
    await fireEvent.press(screen.getByTestId('team-kind-option-Finance'));
    await pressLast('Create team');
    expect(await screen.findByText('This workspace already has a team for Finance.')).toBeTruthy();
    expect(screen.queryByText('Conflict')).toBeNull();
    await pressLast('Create team');
    expect(await screen.findByText('Only an owner or admin can create a team here.')).toBeTruthy();
    expect(screen.queryByText('Forbidden')).toBeNull();
  });

  it('does not offer Create a team to a plain member of the organization (24.12)', async () => {
    routeList();
    await renderWithProviders(<TeamsScreen />, orgSession('member'));
    expect(await screen.findByText('Finance')).toBeTruthy();
    expect(screen.queryByText('Create a team')).toBeNull();
  });

  it('is the empty-state standard with nothing to list: Create a team opens the dialog, and Back leaves (24.12)', async () => {
    routeNone('admin');
    await renderWithProviders(<TeamsScreen />, orgSession('admin'));
    expect(await screen.findByTestId('screen-empty')).toBeTruthy();
    expect(screen.getByText('No teams yet')).toBeTruthy();
    expect(screen.getByText('A team has its own flows and its own people.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Create a team'));
    expect(await screen.findByTestId('create-team-dialog')).toBeTruthy();
  });

  it("empty for a plain member, it offers no Create a team", async () => {
    routeNone('member');
    await renderWithProviders(<TeamsScreen />, orgSession('member'));
    expect(await screen.findByText('No teams yet')).toBeTruthy();
    expect(screen.queryByText('Create a team')).toBeNull();
  });
});

describe('Create a team acts on the workspace it was opened in (24.12, CLAUDE.md rule 10)', () => {
  /** The session the dialog sees, switchable mid-test as the switcher does. */
  let switchTo: (next: SessionContextValue) => void = () => undefined;
  function Switchable({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<SessionContextValue>(orgSession('admin'));
    switchTo = setSession;
    return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
  }

  it('keeps naming that workspace, and refuses Create in words — sending nothing — once another is active', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('POST /v1/workspaces/{workspaceId}/projects', (sent: Sent) => ({
      project: team('p9', sent.values.workspaceId!, (sent.body as { type: string }).type),
    }));
    await renderWithProviders(
      <Switchable>
        <CreateTeamDialog onClose={() => undefined} onCreated={() => undefined} />
      </Switchable>,
      orgSession('admin'),
    );
    expect(screen.getByText('In Acme Operations.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('team-kind'));
    await fireEvent.press(screen.getByTestId('team-kind-option-Finance'));

    // The scope control keeps the dialog open while another workspace becomes active.
    await act(async () => switchTo(personalSession()));
    expect(screen.getByText('In Acme Operations.')).toBeTruthy();
    expect(screen.queryByText('In your personal workspace.')).toBeNull();
    await pressLast('Create team');
    expect(await screen.findByText(WORKSPACE_CHANGED)).toBeTruthy();
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
    fake.always('GET /v1/workspaces/{workspaceId}/projects/{projectId}', { project: team('p1', workspaceId, 'Finance', { viewerRole }) });
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
    fake.always('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}', {
      project: team('p1', PERSONAL, 'Finance', { status: 'archived' }),
    });
    await renderWithProviders(<TeamScreen />, signedInSession);
    // Its title is its kind, said once (24.12).
    expect(await screen.findByText('Finance')).toBeTruthy();
    expect(screen.queryByText(/^Finance · /u)).toBeNull();
    await fireEvent.press(await screen.findByText('Delete team'));
    expect(await screen.findByText('Delete "Finance"?')).toBeTruthy();
    // What actually happens — not a promise that data "reattaches" (it never did).
    expect(screen.getByText('It leaves every team list. Its flows keep running until you archive them in Flows.')).toBeTruthy();
    await pressLast('Delete team');
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    const [archived] = fake.to('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}');
    expect(archived!.values).toEqual({ workspaceId: PERSONAL, projectId: 'p1' });
    expect(archived!.body).toEqual({ status: 'archived' });
  });

  it("draws Delete team for its owner and Leave team for a member in red, as their confirms are (the owner's build 12 item 5)", async () => {
    routeTeam('owner', { workspaceId: PERSONAL });
    const owner = await renderWithProviders(<TeamScreen />, signedInSession);
    expect(colorOf(await owner.findByText('Delete team'))).toBe(nocturneDark.danger);
    await fireEvent.press(owner.getByText('Delete team'));
    expect(colorOf(within(await owner.findByTestId('delete-team-dialog')).getByText('Delete team'))).toBe(nocturneDark.danger);
    await owner.unmount();

    routeTeam('member');
    const member = await renderWithProviders(<TeamScreen />, signedInSession);
    expect(colorOf(await member.findByText('Leave team'))).toBe(nocturneDark.danger);
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
    fake.always('POST /v1/workspaces/{workspaceId}/projects/{projectId}/memberships', {
      membership: { projectId: 'p1', workspaceId: TEST_WORKSPACE, userId: 'u3', role: 'admin', displayName: 'Carol', email: 'carol@acme.co', createdAt: '2026-09-01T00:00:00Z' },
    });
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
    fake.always('PATCH /v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}', {
      request: { id: 'r1', projectId: 'p1', workspaceId: TEST_WORKSPACE, userId: 'u5', status: 'approved', displayName: 'Erin', email: 'erin@acme.co', createdAt: '2026-10-02T00:00:00Z' },
    });
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

describe('Settings rows for the admin areas (24.3.8, 24.5, 24.11.7; on the index again since build 11)', () => {
  it('always offers Organization and Teams — and no Projects row, and no organization-only Teams', async () => {
    await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(await screen.findByTestId('settings-organization')).toBeTruthy();
    expect(screen.queryByTestId('settings-projects')).toBeNull();
    await fireEvent.press(screen.getByTestId('settings-teams'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/teams');
  });
});
