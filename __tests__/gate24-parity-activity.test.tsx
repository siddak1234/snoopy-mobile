import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import RunDetailScreen from '@/app/(tabs)/(home)/run';
import ActivityScreen from '@/app/(tabs)/activity/index';
import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import SettingsRunScreen from '@/app/(tabs)/settings/run';
import TeamsScreen from '@/app/(tabs)/settings/teams';
import { OrgPeople } from '@/components/organization/org-people';
import { TeamMembers } from '@/components/teams/team-members';
import { TeamRequests } from '@/components/teams/team-requests';
import { nocturneDark, status } from '@/constants/theme';
import type { WorkspaceMember } from '@/lib/platform/organization';
import type { AccessRequest, Project, ProjectMembership } from '@/lib/platform/projects';
import type { Approval, Run } from '@/lib/platform/runs';
import { metaFor } from '@/lib/view/runs';
import { fakePlatform, type Answer } from '@/test/fake-platform';
import {
  TEST_WORKSPACE,
  approvalsPayload,
  catalogPayload,
  flowCatalogPayload,
  routePlatform,
  runDetailPayload,
  runsPayload,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn((prefix: string) => `${prefix}-key`),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Gate 24's parity pass (Round 16): what the website's Activity, run page,
 * Approvals, Teams, a team's page and Organization say that the app did not —
 * G17 to G24 of the parity report — each held here in the website's words.
 * Billing's G25 is `billing-screen`'s; a held run's notification opening
 * Approvals (G1's notification half) is `push-registration`'s and `tab-screens`'.
 *
 * Every date here is built in the device's own zone, as the app says one.
 */

beforeEach(() => {
  platformOperation.mockReset();
});

const colorOf = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style) as { color?: string }).color;

/* ------------------------------------------------------------ Activity, G17 */

describe('Activity says a run as the website does: when, the version it ran, and after approval (G17)', () => {
  it('draws the date and time each run was made and the version it ran, under its line', async () => {
    const at = new Date(2026, 8, 30, 21, 5).toISOString();
    const run: Run = { ...runsPayload().runs[0]!, id: 'run-v3', templateVersion: 3, createdAt: at, updatedAt: at };
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/runs': { runs: [run] },
      '/approvals': { approvals: [] },
    });
    await renderWithProviders(<ActivityScreen />, signedInSession);
    const row = await screen.findByTestId('activity-row-run-v3');
    expect(within(row).getByText('Sep 30, 2026, 9:05 PM · v3')).toBeTruthy();
    // The design's own time beside it stays.
    expect(within(row).getByText(/^\d+d$/u)).toBeTruthy();
  });

  it('keeps "After approval" on a continuation held again, beside where its approval stands — the tag a held one lost', async () => {
    const held: Run = {
      ...runsPayload().runs[0]!,
      id: 'held-again',
      status: 'held',
      origin: 'approval-continuation',
      continuesRunId: 'held-first',
    };
    const waiting: Approval = { ...approvalsPayload().approvals[0]!, runId: 'held-again', status: 'pending' };
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/runs': { runs: [held] },
      '/approvals': { approvals: [waiting] },
    });
    await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(await screen.findByText('After approval · Waiting for approval')).toBeTruthy();
    // The rule itself, for Home's recent runs too.
    expect(metaFor(held, [waiting])).toBe('After approval · Waiting for approval');
    expect(metaFor({ ...held, origin: 'trigger' }, [waiting])).toBe('Waiting for approval');
  });
});

/* ----------------------------------------------------------- the run page, G18 */

/** Two declared steps, as a flow's manifest names them. */
const PIPELINE = [
  { id: 'receive', kicker: 'TRIGGER', title: 'Invoice received', description: 'A run is started with the invoice to check.' },
  { id: 'validate', kicker: 'ACTION', title: 'Check the amount', description: 'Holds the invoice when it is above your threshold.' },
] as const;

type Detail = Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'>;

/** Run `run-1` of Invoice check: what it is, and the steps it reported. */
function detail(run: Partial<Detail['run']>, steps: Partial<Detail['steps'][number]>[] = []): Detail {
  const base = runDetailPayload('run-1');
  return {
    ...base,
    run: { ...base.run, id: 'run-1', templateId: 'invoice-check', templateVersion: 4, ...run },
    steps: steps.map((step, n) => ({
      id: `s${n}`,
      runId: 'run-1',
      workspaceId: TEST_WORKSPACE,
      stepId: 'receive',
      outcome: 'ok',
      summary: 'Invoice INV-7 received',
      occurredAt: base.run.createdAt,
      ...step,
    })),
  };
}

function routeRun(read: Detail) {
  const fake = fakePlatform(platformOperation);
  const catalog = catalogPayload();
  fake.always('GET /v1/workspaces/{workspaceId}/automations', {
    ...catalog,
    automations: [{ ...catalog.automations[0]!, templateId: 'invoice-check', name: 'Invoice check', pipeline: [...PIPELINE] }],
  });
  fake.always('GET /v1/workspaces/{workspaceId}/approvals', { approvals: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/runs/{runId}', read);
  return fake;
}

/** A fact under the title: its label and its value, as drawn. */
const fact = (label: 'Started' | 'Ended' | 'Trigger') =>
  within(screen.getByTestId(`run-fact-${label}`))
    .getAllByText(/./u)
    .map((node) => node.props.children);

describe("a run's page says what the website's says (G18)", () => {
  it('names the version it ran, then when it started and ended and how it started: the website’s facts', async () => {
    routeRun(
      detail(
        {
          status: 'succeeded',
          origin: 'trigger',
          resultSummary: 'Recorded INV-7',
          startedAt: new Date(2026, 9, 7, 9, 5, 2).toISOString(),
          endedAt: new Date(2026, 9, 7, 9, 6, 40).toISOString(),
        },
        [{ stepId: 'receive' }, { stepId: 'validate', summary: 'Within the $500 threshold' }],
      ),
    );
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Invoice check · v4 · Recorded INV-7')).toBeTruthy();
    expect(fact('Started')).toEqual(['Started', 'Oct 7, 2026, 9:05 AM']);
    expect(fact('Ended')).toEqual(['Ended', 'Oct 7, 2026, 9:06 AM']);
    expect(fact('Trigger')).toEqual(['Trigger', 'Triggered']);
    expect(screen.queryByTestId('run-continues')).toBeNull();
  });

  it('says a run that has not started or ended with the em dash, and a manual start as the website does', async () => {
    routeRun(detail({ status: 'pending', origin: 'manual', startedAt: undefined, endedAt: undefined }));
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    await screen.findByTestId('run-fact-Started');
    expect(fact('Started')).toEqual(['Started', '—']);
    expect(fact('Ended')).toEqual(['Ended', '—']);
    expect(fact('Trigger')).toEqual(['Trigger', 'Manual']);
  });

  it('links a continuation to the run that was held, in the stack it is in — Home’s, and Settings’ from its inbox', async () => {
    routeRun(
      detail({ status: 'succeeded', origin: 'approval-continuation', continuesRunId: 'run-held', resultSummary: 'Recorded INV-7' }, [
        { stepId: 'receive' },
      ]),
    );
    setMockParams({ runId: 'run-1' });
    const home = await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(fact('Trigger')).toEqual(['Trigger', 'After approval']);
    // Its id's first characters, which nothing opened, are gone.
    expect(screen.queryByText(/continues run /u)).toBeNull();
    expect(colorOf(screen.getByText('the run that was held'))).toBe(nocturneDark.accentRamp[300]);
    await fireEvent.press(screen.getByTestId('run-continues'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(home)/run', params: { runId: 'run-held' } });
    await home.unmount();

    mockRouter.push.mockClear();
    await renderWithProviders(<SettingsRunScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('run-continues'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/settings/run', params: { runId: 'run-held' } });
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('keeps a held step’s summary, its reason beside it, and says when each step happened — its date and its time', async () => {
    routeRun(
      detail(
        {
          status: 'held',
          origin: 'trigger',
          startedAt: new Date(2026, 9, 7, 9, 4).toISOString(),
          endedAt: new Date(2026, 9, 8, 7, 0).toISOString(),
        },
        [
          { stepId: 'receive', occurredAt: new Date(2026, 9, 7, 9, 5).toISOString() },
          {
            stepId: 'validate',
            outcome: 'held',
            summary: 'Checked $730 against $500',
            heldReason: 'Above the $500 auto-approve threshold.',
            occurredAt: new Date(2026, 9, 7, 21, 6).toISOString(),
          },
        ],
      ),
    );
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Checked $730 against $500')).toBeTruthy();
    expect(colorOf(screen.getByText('Above the $500 auto-approve threshold.'))).toBe(status.warnText);
    expect(screen.getByText('Oct 7, 2026, 9:05 AM')).toBeTruthy();
    expect(screen.getByText('Oct 7, 2026, 9:06 PM')).toBeTruthy();
    expect(screen.queryByText('No steps reported yet.')).toBeNull();
  });

  it('says No steps reported yet. while the run has reported none, and its flow’s steps still follow, waiting', async () => {
    routeRun(detail({ status: 'running', origin: 'trigger', endedAt: undefined }));
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('No steps reported yet.')).toBeTruthy();
    expect(screen.getByText('Invoice received')).toBeTruthy();
    expect(screen.getByText('Check the amount')).toBeTruthy();
  });
});

/* -------------------------------------------------------- Approvals, G19 and G20 */

const DECISION = 'POST /v1/workspaces/{workspaceId}/approvals/{approvalId}/decision';

/** Pending approvals, and this person's role in the workspace collection — where the website reads it. */
function routeApprovals(role: 'owner' | 'admin' | 'member' | null, approvals: Approval[]) {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces/{workspaceId}/approvals', { approvals });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', subscriptionsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/automations', flowCatalogPayload());
  fake.always('GET /v1/workspaces', {
    workspaces: role ? [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role }] : [],
    activeWorkspaceId: TEST_WORKSPACE,
  });
  fake.always(DECISION, (sent) => ({
    approval: { ...approvals[0]!, id: sent.values.approvalId!, status: 'approved' },
  }));
  return fake;
}

/** A pending approval of run `run-of-<id>`, expiring `inMs` from now, decided by `eligibleRoles`. */
function approval(id: string, eligibleRoles: Approval['eligibleRoles'], inMs = 3 * 3_600_000 + 600_000): Approval {
  return {
    ...approvalsPayload().approvals[0]!,
    id,
    runId: `run-of-${id}`,
    eligibleRoles,
    expiresAt: new Date(Date.now() + inMs).toISOString(),
  };
}

describe("Approvals says each approval as the website's does: its status, its expiry, the run it holds (G19)", () => {
  it('draws each one’s Pending pill and the time it has left, and View the run opens the run it holds', async () => {
    const fake = routeApprovals('owner', [
      approval('a1', ['owner']),
      approval('a2', ['owner'], 49 * 3_600_000),
      approval('a3', ['owner'], -3_600_000),
    ]);
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    expect(await screen.findByText('Expires in 3h')).toBeTruthy();
    expect(screen.getByText('Expires in 2d')).toBeTruthy();
    expect(screen.getByText('Expires shortly')).toBeTruthy();
    const pills = screen.getAllByText('Pending');
    expect(pills).toHaveLength(3);
    // The website's info tone, which is the accent here, as a running run's pill is.
    expect(colorOf(pills[0]!)).toBe(nocturneDark.accentRamp[300]);

    await fireEvent.press(screen.getByTestId('view-run-a2'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(home)/run', params: { runId: 'run-of-a2' } });
    expect(fake.to(DECISION)).toHaveLength(0);
  });
});

describe('Approvals offers Approve and Reject only to a role the approval names (G20)', () => {
  it('a role it does not name is told which roles can decide, and offered nothing to press — its role read from the workspace collection, as the website reads it', async () => {
    // The session says owner; the collection, which decides, says member.
    const fake = routeApprovals('member', [approval('x', ['owner', 'admin']), approval('y', ['owner', 'admin', 'member'])]);
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    expect(await screen.findByText('Only owner or admin can decide this.')).toBeTruthy();
    // One card offers its answers: the one that names a member.
    expect(screen.getAllByText('Approve')).toHaveLength(1);
    expect(screen.getAllByText('Reject')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Approve'));
    await waitFor(() => expect(fake.to(DECISION)).toHaveLength(1));
    expect(fake.to(DECISION)[0]!.values).toEqual({ workspaceId: TEST_WORKSPACE, approvalId: 'y' });
    // The run it holds is anyone's to look at.
    await fireEvent.press(screen.getByTestId('view-run-x'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(home)/run', params: { runId: 'run-of-x' } });
  });

  it('an admin an owner-only approval does not name is not offered it; an admin it names decides', async () => {
    const fake = routeApprovals('admin', [approval('only-owner', ['owner']), approval('admins-too', ['owner', 'admin'])]);
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    expect(await screen.findByText('Only owner can decide this.')).toBeTruthy();
    expect(screen.queryByText('Only owner or admin can decide this.')).toBeNull();
    expect(screen.getAllByText('Reject')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Reject'));
    await waitFor(() => expect(fake.to(DECISION)).toHaveLength(1));
    expect(fake.to(DECISION)[0]!.values.approvalId).toBe('admins-too');
    expect(fake.to(DECISION)[0]!.body).toEqual({ decision: 'rejected' });
  });

  it('a workspace the collection does not list gives no role, so no answer is offered on any card', async () => {
    routeApprovals(null, [approval('z', ['owner', 'admin', 'member'])]);
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    expect(await screen.findByText('Only owner or admin or member can decide this.')).toBeTruthy();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
  });
});

/* ------------------------------------------------- Teams, a team, Organization */

const team = (id: string, kind: string, teamStatus: Project['status']): Project => ({
  id,
  workspaceId: TEST_WORKSPACE,
  name: kind,
  type: kind,
  status: teamStatus,
  viewerRole: 'owner',
  createdAt: '2026-09-01T00:00:00Z',
});

describe("Teams says each team's status, as the website's pill beside it does (G21)", () => {
  it('draws Active and Paused on their rows; an archived team is not listed', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    fake.always('GET /v1/workspaces/{workspaceId}/projects', {
      projects: [team('p1', 'Finance', 'active'), team('p2', 'Legal', 'paused'), team('p3', 'Sales', 'archived')],
    });
    fake.always('GET /v1/workspaces/{workspaceId}/project-directory', { projects: [] });
    await renderWithProviders(<TeamsScreen />, signedInSession);
    const finance = await screen.findByTestId('team-p1');
    expect(within(finance).getByText('Active')).toBeTruthy();
    expect(colorOf(within(finance).getByText('Active'))).toBe(status.ok);
    expect(within(screen.getByTestId('team-p2')).getByText('Paused')).toBeTruthy();
    expect(screen.queryByTestId('team-p3')).toBeNull();
  });
});

/** A day at noon in the device's zone, as the platform would send it. */
const noon = (month: number, day: number) => new Date(2026, month, day, 12).toISOString();

describe("a team's members say the day they joined, as the website's list does (G22)", () => {
  it('a team member: under the address beside a name, and alone under an address', async () => {
    const membership = (userId: string, email: string, createdAt: string, displayName?: string): ProjectMembership => ({
      projectId: 'p1',
      workspaceId: TEST_WORKSPACE,
      userId,
      role: 'member',
      email,
      createdAt,
      ...(displayName ? { displayName } : {}),
    });
    await renderWithProviders(
      <TeamMembers
        workspaceId={TEST_WORKSPACE}
        projectId="p1"
        viewerUserId="u1"
        viewerRole="member"
        members={[membership('u2', 'ben@acme.co', noon(8, 1), 'Ben'), membership('u7', 'dana@acme.co', noon(8, 15))]}
        available={[]}
        onChanged={jest.fn()}
        onLeft={jest.fn()}
      />,
      signedInSession,
    );
    expect(within(screen.getByTestId('team-member-u2')).getByText('ben@acme.co · Joined Sep 1, 2026')).toBeTruthy();
    expect(within(screen.getByTestId('team-member-u7')).getByText('dana@acme.co')).toBeTruthy();
    expect(within(screen.getByTestId('team-member-u7')).getByText('Joined Sep 15, 2026')).toBeTruthy();
  });
});

describe('a team’s requests to join say the address under a name, as the website’s list does (G23)', () => {
  it('beside when they asked; an address alone is said once', async () => {
    const DAY = 86_400_000;
    const request = (id: string, email: string, ago: number, displayName?: string): AccessRequest => ({
      id,
      projectId: 'p1',
      workspaceId: TEST_WORKSPACE,
      userId: `user-${id}`,
      status: 'pending',
      email,
      createdAt: new Date(Date.now() - ago).toISOString(),
      ...(displayName ? { displayName } : {}),
    });
    await renderWithProviders(
      <TeamRequests
        workspaceId={TEST_WORKSPACE}
        projectId="p1"
        teamName="Finance"
        requests={[request('r1', 'erin@acme.co', 2 * DAY + 60_000, 'Erin'), request('r2', 'fay@acme.co', DAY + 60_000)]}
        onChanged={jest.fn()}
      />,
      signedInSession,
    );
    const erin = screen.getByTestId('team-request-r1');
    expect(within(erin).getByText('Erin')).toBeTruthy();
    expect(within(erin).getByText('erin@acme.co · Asked 2d ago')).toBeTruthy();
    const fay = screen.getByTestId('team-request-r2');
    expect(within(fay).getAllByText(/fay@acme\.co/u)).toHaveLength(1);
    expect(within(fay).getByText('Asked 1d ago')).toBeTruthy();
  });
});

describe("Organization's members say the day they joined, as the website's list does (G24)", () => {
  it('an organization member: under the address beside a name, and alone under an address', async () => {
    const member = (userId: string, email: string, createdAt: string, displayName?: string): WorkspaceMember => ({
      workspaceId: TEST_WORKSPACE,
      userId,
      role: 'member',
      email,
      createdAt,
      ...(displayName ? { displayName } : {}),
    });
    await renderWithProviders(
      <OrgPeople
        orgName="Acme Operations"
        viewerUserId="u1"
        members={[member('u2', 'ben@acme.co', noon(7, 20), 'Ben'), member('u8', 'gus@acme.co', noon(9, 2))]}
        requests={[]}
        shownWorkspaceId={TEST_WORKSPACE}
        onChanged={jest.fn()}
      />,
      signedInSession,
    );
    expect(within(screen.getByTestId('member-u2')).getByText('ben@acme.co · Joined Aug 20, 2026')).toBeTruthy();
    expect(within(screen.getByTestId('member-u8')).getByText('Joined Oct 2, 2026')).toBeTruthy();
  });
});
