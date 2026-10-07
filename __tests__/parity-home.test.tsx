import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import HomeScreen from '@/app/(tabs)/(home)/index';
import { ScreenError } from '@/components/screen-state';
import { NocturneThemeProvider } from '@/hooks/use-theme';
import { ERROR_BODY, busyLoadBody } from '@/lib/content/screen-states';
import {
  PlatformError,
  PlatformNotConfiguredError,
  PlatformRateLimitedError,
  PlatformUnreachableError,
} from '@/lib/platform/problem';
import { busyMessage } from '@/lib/platform/retry-after';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { homeFailure } from '@/lib/view/home';
import { fakePlatform, type Answer, type Route } from '@/test/fake-platform';
import {
  TEST_WORKSPACE,
  approvalsPayload,
  catalogPayload,
  inboxPayload,
  runStatsPayload,
  runsPayload,
  sessionAs,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

/**
 * Gate 24's parity line, Home's half (BUILD-PLAN 24 Gate 24: "Every signed-in
 * web feature present on mobile, checked against snoopy's page list screen by
 * screen"), against the website's dashboard (`snoopy/app/account/page.tsx`) and
 * its Approvals (`app/account/approvals/page.tsx`):
 *
 * - G1: the review banner counts what the website's Approvals counts — every
 *   pending approval in the workspace, `?status=pending` — whatever team is
 *   chosen; hidden at 0 (the owner, build 13 #3).
 * - G3: Home's own failure says what happened — busy with its wait, failed —
 *   and that the person was not signed out; "Check your connection" only
 *   offline. The shared failed load says it too, in the website's words.
 * - G5: Connect integration and View teams, with flows or none.
 * - G6: the overview's flows and integrations, and every figure failing on its
 *   own.
 * - G7: the first three teams across the workspaces, and View all teams.
 */

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn((prefix: string) => `${prefix}-key`),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

// The team chosen is kept on the device, per workspace; here, in memory.
const mockStored = new Map<string, string | null>();
jest.mock('@/lib/platform/scope-store', () => ({
  readScope: jest.fn(async (workspaceId: string) => mockStored.get(workspaceId) ?? null),
  writeScope: jest.fn(async () => undefined),
}));

const PERSONAL = '00000000-0000-4000-8000-000000000002';

type Approvals = Answer<'GET /v1/workspaces/{workspaceId}/approvals'>;
type Projects = Answer<'GET /v1/workspaces/{workspaceId}/projects'>;
type Project = Projects['projects'][number];
type Workspaces = Answer<'GET /v1/workspaces'>;

const ACME: Workspaces['workspaces'][number] = {
  id: TEST_WORKSPACE,
  name: 'Acme Operations',
  type: 'organization',
  role: 'owner',
};
const OWN: Workspaces['workspaces'][number] = { id: PERSONAL, name: "Alex's space", type: 'personal', role: 'owner' };

function team(id: string, workspaceId: string, kind: string, status: Project['status']): Project {
  return { id, workspaceId, name: kind, type: kind, status, viewerRole: 'owner', createdAt: '2026-09-01T00:00:00Z' };
}

/**
 * Home's reads, each answered as the platform answers it: the approvals read
 * twice — every status, for the run rows, and `?status=pending`, the banner's —
 * and the teams read from every workspace. A refused route throws its refusal.
 */
function routeHome(
  answers: {
    approvals?: Approvals;
    pending?: Approvals;
    subscriptions?: Answer<'GET /v1/workspaces/{workspaceId}/subscriptions'>;
    connections?: Answer<'GET /v1/workspaces/{workspaceId}/connections'>;
    catalog?: Answer<'GET /v1/workspaces/{workspaceId}/automations'>;
    stats?: Answer<'GET /v1/workspaces/{workspaceId}/run-stats'>;
    runs?: Answer<'GET /v1/workspaces/{workspaceId}/runs'>;
    workspaces?: Workspaces['workspaces'];
    teams?: Record<string, Project[]>;
  } = {},
) {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces/{workspaceId}/run-stats', answers.stats ?? runStatsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/runs', answers.runs ?? runsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/automations', answers.catalog ?? catalogPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/approvals', (sent) =>
    sent.query?.status === 'pending' ? (answers.pending ?? approvalsPayload()) : (answers.approvals ?? approvalsPayload()),
  );
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', answers.subscriptions ?? subscriptionsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/connections', answers.connections ?? { connections: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/notifications', inboxPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/projects', (sent) => ({
    projects: answers.teams?.[sent.values.workspaceId!] ?? [],
  }));
  fake.always('GET /v1/workspaces', { workspaces: answers.workspaces ?? [ACME], activeWorkspaceId: TEST_WORKSPACE });
  return fake;
}

/** One of Home's routes refused, every time it is asked. */
function refuse(fake: ReturnType<typeof fakePlatform>, route: Route, refusal: () => Error) {
  fake.always(route, () => {
    throw refusal();
  });
}

/** Every one of the workspace's reads Home makes, refused the same way. */
const WORKSPACE_READS: Route[] = [
  'GET /v1/workspaces/{workspaceId}/run-stats',
  'GET /v1/workspaces/{workspaceId}/runs',
  'GET /v1/workspaces/{workspaceId}/automations',
  'GET /v1/workspaces/{workspaceId}/approvals',
  'GET /v1/workspaces/{workspaceId}/subscriptions',
  'GET /v1/workspaces/{workspaceId}/connections',
];

/** The four fixture flows, placed: invoice in Finance, email and lead in Legal, kpi the whole workspace's. */
function placedSubscriptions() {
  const subscriptions = subscriptionsPayload();
  const team: Record<string, string | null> = { invoice: 'project-1', email: 'project-2', kpi: null, lead: 'project-2' };
  subscriptions.subscriptions = subscriptions.subscriptions.map((row) => ({ ...row, projectId: team[row.id] ?? null }));
  return subscriptions;
}

const pendingOn = (subscriptionId: string, index: number): Approvals['approvals'][number] => ({
  ...approvalsPayload().approvals[index]!,
  id: `apr-${subscriptionId}`,
  subscriptionId,
});

/** What a row of the overview says: its figure. */
const figure = (testID: string) => screen.getByTestId(`value-of-${testID}`).props.children;

beforeEach(() => {
  platformOperation.mockReset();
  mockStored.clear();
});

describe('G1 — the review banner counts what Approvals lists', () => {
  it("counts every pending approval in the workspace, as the website's Approvals does — the other teams' and the whole workspace's too, with a team chosen, and one the newest hundred of every status leaves out", async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    const pending = [pendingOn('invoice', 0), pendingOn('email', 1), pendingOn('kpi', 2)];
    const fake = routeHome({
      subscriptions: placedSubscriptions(),
      teams: { [TEST_WORKSPACE]: [team('project-1', TEST_WORKSPACE, 'Finance', 'active'), team('project-2', TEST_WORKSPACE, 'Legal', 'active')] },
      // The newest hundred of every status holds only Finance's.
      approvals: { approvals: [pending[0]!] },
      pending: { approvals: pending },
    });
    await renderWithProviders(<HomeScreen />, signedInSession);

    expect(await screen.findByText('3 items need your review')).toBeTruthy();
    // Home narrows to Finance — the scope is chosen — while the banner does not.
    expect(await screen.findByLabelText('Team: Finance')).toBeTruthy();
    expect(fake.to('GET /v1/workspaces/{workspaceId}/approvals').map((sent) => sent.query ?? null)).toEqual(
      expect.arrayContaining([{ status: 'pending' }, null]),
    );
    await fireEvent.press(screen.getByText('3 items need your review'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity/approvals');
  });

  it('is hidden when the platform lists nothing pending (the owner, build 13 #3), and when its read is refused', async () => {
    const fake = routeHome({ pending: { approvals: [] } });
    const view = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Welcome back, Alex')).toBeTruthy();
    expect(screen.queryByText(/need(s)? your review/u)).toBeNull();
    expect(fake.to('GET /v1/workspaces/{workspaceId}/approvals').some((sent) => sent.query?.status === 'pending')).toBe(true);
    await view.unmount();
    // A fresh launch: nothing the first read answered serves the second.
    resetSnapshot();

    // The pending read refused, every approval read: whether anything waits is
    // not known, so no banner says it does — not a count from another read —
    // while the run rows still say how a held run was decided.
    const refused = routeHome();
    refused.always('GET /v1/workspaces/{workspaceId}/approvals', (sent) => {
      if (sent.query?.status === 'pending') throw new PlatformError('Service Unavailable', 503);
      return approvalsPayload();
    });
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Welcome back, Alex')).toBeTruthy();
    expect(screen.queryByText(/need(s)? your review/u)).toBeNull();
    expect(screen.getByText('Waiting for approval')).toBeTruthy();
    expect(screen.getByTestId('home-stats')).toBeTruthy();
  });
});

describe("G3 — Home's own failure says what happened, and that nobody was signed out", () => {
  it('every read refused 429: the platform is busy, the wait it stated, not signed out — and Retry, never "Check your connection"', async () => {
    const fake = routeHome();
    for (const route of WORKSPACE_READS) refuse(fake, route, () => new PlatformRateLimitedError(busyMessage(30), 30));
    await renderWithProviders(<HomeScreen />, signedInSession);

    const failure = await screen.findByTestId('home-failure-error');
    expect(within(failure).getByText('The platform is busy right now')).toBeTruthy();
    expect(within(failure).getByText('You have not been signed out, and nothing was lost. Try again in 30 seconds.')).toBeTruthy();
    expect(within(failure).getByText('Retry')).toBeTruthy();
    expect(screen.queryByText(/Check your connection/u)).toBeNull();
    expect(screen.queryByText("Can't reach Autom8x")).toBeNull();
  });

  it('every read failing 503: the platform could not answer just now, and not signed out', async () => {
    const fake = routeHome();
    for (const route of WORKSPACE_READS) refuse(fake, route, () => new PlatformError('Service Unavailable', 503));
    await renderWithProviders(<HomeScreen />, signedInSession);

    const failure = await screen.findByTestId('home-failure-error');
    expect(within(failure).getByText('The platform could not answer just now')).toBeTruthy();
    expect(within(failure).getByText('You have not been signed out, and nothing was lost. Try again in a moment.')).toBeTruthy();
    expect(screen.queryByText(/Check your connection/u)).toBeNull();
  });

  it('offline it is the design\'s: Can\'t reach Autom8x, Check your connection', async () => {
    const fake = routeHome();
    for (const route of WORKSPACE_READS) refuse(fake, route, () => new PlatformUnreachableError());
    await renderWithProviders(<HomeScreen />, signedInSession);

    const failure = await screen.findByTestId('home-failure-offline');
    expect(within(failure).getByText("Can't reach Autom8x")).toBeTruthy();
    expect(
      within(failure).getByText("Check your connection. Your agents keep running in the cloud and will sync when you're back."),
    ).toBeTruthy();
  });

  it('no backend: the unavailable words, and no Retry that could not succeed', async () => {
    const fake = routeHome();
    for (const route of WORKSPACE_READS) refuse(fake, route, () => new PlatformNotConfiguredError());
    await renderWithProviders(<HomeScreen />, signedInSession);

    const failure = await screen.findByTestId('home-failure-unconfigured');
    expect(
      within(failure).getByText(
        'This build has no workspace to read from yet. Sign in again, or check that the app is pointed at your Autom8x workspace.',
      ),
    ).toBeTruthy();
    expect(within(failure).queryByText('Retry')).toBeNull();
    expect(screen.queryByText(/Check your connection/u)).toBeNull();
  });

  it('is worded by the busiest answer: a 429 among other failures, then any answer the platform gave, then none landing', () => {
    const busy = new PlatformRateLimitedError(busyMessage(30), 30);
    const failed = new PlatformError('Service Unavailable', 503);
    const offline = new PlatformUnreachableError();
    const unconfigured = new PlatformNotConfiguredError();
    expect(homeFailure([offline, failed, busy])).toBe(busy);
    expect(homeFailure([offline, failed, offline])).toBe(failed);
    expect(homeFailure([offline, offline])).toBe(offline);
    expect(homeFailure([unconfigured, unconfigured])).toBe(unconfigured);
  });

  it("the shared failed load says the person was not signed out, in the website's words, and busy says the wait too", async () => {
    expect(ERROR_BODY).toBe('You have not been signed out, and nothing was lost. Try again in a moment.');
    expect(busyLoadBody(30)).toBe(
      'The platform is busy right now. You have not been signed out, and nothing was lost. Try again in 30 seconds.',
    );
    expect(busyLoadBody()).toBe(
      'The platform is busy right now. You have not been signed out, and nothing was lost. Try again in a moment.',
    );
    await render(
      <NocturneThemeProvider>
        <ScreenError title="Couldn't load activity" onRetry={() => undefined} />
      </NocturneThemeProvider>,
    );
    expect(screen.getByText('You have not been signed out, and nothing was lost. Try again in a moment.')).toBeTruthy();
  });
});

describe("G5 — the website's other quick actions", () => {
  it.each([
    ['with flows', () => routeHome()],
    [
      'with none set up yet',
      () => {
        const catalog = catalogPayload();
        catalog.automations = catalog.automations.map((automation) => ({ ...automation, subscribed: false }));
        return routeHome({ catalog });
      },
    ],
  ])('%s: Connect integration opens Settings › Connections, and View teams opens Settings › Teams', async (_case, route) => {
    route();
    await renderWithProviders(<HomeScreen />, signedInSession);
    const quickActions = await screen.findByTestId('home-quick-actions');

    await fireEvent.press(within(quickActions).getByText('Connect integration'));
    expect(mockRouter.push.mock.calls).toEqual([['/(tabs)/settings/connections']]);
    await fireEvent.press(within(quickActions).getByText('View teams'));
    expect(mockRouter.push.mock.calls).toEqual([['/(tabs)/settings/connections'], ['/(tabs)/settings/teams']]);
  });
});

describe('G6 — the overview, and every figure on its own', () => {
  it("says the workspace's flows that are not archived — in the team chosen, as the tiles are — and its connected integrations", async () => {
    const subscriptions = placedSubscriptions();
    subscriptions.subscriptions.push({ ...subscriptions.subscriptions[0]!, id: 'gone', status: 'archived', projectId: 'project-1' });
    const connection = {
      workspaceId: TEST_WORKSPACE,
      externalAccount: { id: 'acct-1', displayName: 'ap@acme.co' },
      requiredScopes: [],
      grantedScopes: [],
      usedByCount: 1,
    };
    routeHome({
      subscriptions,
      teams: { [TEST_WORKSPACE]: [team('project-1', TEST_WORKSPACE, 'Finance', 'active'), team('project-2', TEST_WORKSPACE, 'Legal', 'active')] },
      connections: {
        connections: [
          { ...connection, id: 'c1', providerId: 'gmail', status: 'connected' },
          { ...connection, id: 'c2', providerId: 'quickbooks', status: 'connected' },
          { ...connection, id: 'c3', providerId: 'hubspot', status: 'reauthorization-required' },
        ],
      },
    });
    const view = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('OVERVIEW')).toBeTruthy();
    expect(figure('home-flows')).toBe('4');
    expect(figure('home-integrations')).toBe('2');

    // Finance chosen: its one live flow; the integrations are the workspace's.
    mockStored.set(TEST_WORKSPACE, 'project-1');
    await view.unmount();
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByLabelText('Team: Finance')).toBeTruthy();
    expect(figure('home-flows')).toBe('1');
    expect(figure('home-integrations')).toBe('2');
  });

  it.each<[string, Route, () => void]>([
    [
      "today's counts",
      'GET /v1/workspaces/{workspaceId}/run-stats',
      () => {
        expect(screen.getByTestId('home-stats-unavailable').props.children).toBe('Unavailable');
        expect(screen.queryByTestId('home-stats')).toBeNull();
        expect(screen.queryByText(/Your agents ran/u)).toBeNull();
        expect(screen.getByText('Run #4821 · posted to QuickBooks')).toBeTruthy();
        expect(figure('home-flows')).toBe('4');
      },
    ],
    [
      'the runs',
      'GET /v1/workspaces/{workspaceId}/runs',
      () => {
        expect(screen.getByText('Recent activity could not be read just now.')).toBeTruthy();
        expect(screen.queryByText('No runs in this team yet.')).toBeNull();
        expect(screen.getByTestId('home-stats')).toBeTruthy();
        expect(screen.getByText('Your agents ran 128 tasks today.')).toBeTruthy();
      },
    ],
    [
      'the flows',
      'GET /v1/workspaces/{workspaceId}/subscriptions',
      () => {
        expect(figure('home-flows')).toBe('Unavailable');
        // All teams: nothing else narrows through them.
        expect(screen.getByTestId('home-stats')).toBeTruthy();
        expect(screen.getByText('Run #4821 · posted to QuickBooks')).toBeTruthy();
      },
    ],
    [
      'the integrations',
      'GET /v1/workspaces/{workspaceId}/connections',
      () => {
        expect(figure('home-integrations')).toBe('Unavailable');
        expect(figure('home-flows')).toBe('4');
      },
    ],
    [
      'the approvals',
      'GET /v1/workspaces/{workspaceId}/approvals',
      () => {
        // No banner without the pending read, and a held run says only that it is held.
        expect(screen.queryByText(/need(s)? your review/u)).toBeNull();
        expect(screen.getByText('Held')).toBeTruthy();
        expect(screen.queryByText('Waiting for approval')).toBeNull();
        expect(screen.getByTestId('home-stats')).toBeTruthy();
      },
    ],
    [
      'the catalog',
      'GET /v1/workspaces/{workspaceId}/automations',
      () => {
        // Runs are named by their template id, and nothing claims no flow is set up.
        expect(screen.queryByTestId('home-first-run')).toBeNull();
        expect(screen.getAllByText('tpl.0').length).toBeGreaterThan(0);
        expect(screen.getByText('RECENT RUNS')).toBeTruthy();
      },
    ],
  ])('%s refused: says so in its place, and the rest of Home still shows', async (_figure, route, expectations) => {
    const fake = routeHome();
    refuse(fake, route, () => new PlatformError('Service Unavailable', 503));
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Welcome back, Alex')).toBeTruthy();
    expect(screen.queryByTestId('home-failure-error')).toBeNull();
    expectations();
  });

  it("with a team chosen and the flows refused, the team's figures cannot be told: today's counts and its runs say so too", async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    const fake = routeHome({ teams: { [TEST_WORKSPACE]: [team('project-1', TEST_WORKSPACE, 'Finance', 'active')] } });
    refuse(fake, 'GET /v1/workspaces/{workspaceId}/subscriptions', () => new PlatformError('Service Unavailable', 503));
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByLabelText('Team: Finance')).toBeTruthy();

    expect(figure('home-flows')).toBe('Unavailable');
    expect(screen.getByTestId('home-stats-unavailable')).toBeTruthy();
    expect(screen.getByText('Recent activity could not be read just now.')).toBeTruthy();
    expect(figure('home-integrations')).toBe('0');
  });
});

describe("G7 — the website's Teams on Home", () => {
  it('lists the first three teams across the workspaces, the deleted left out — each its kind and status, and its workspace when they span several — each opening its page in its workspace, with View all teams', async () => {
    routeHome({
      workspaces: [ACME, OWN],
      teams: {
        [TEST_WORKSPACE]: [
          team('finance', TEST_WORKSPACE, 'Finance', 'active'),
          team('legal', TEST_WORKSPACE, 'Legal', 'archived'),
          team('sales', TEST_WORKSPACE, 'Sales', 'paused'),
        ],
        [PERSONAL]: [team('hr', PERSONAL, 'HR', 'draft'), team('it', PERSONAL, 'IT', 'active')],
      },
    });
    await renderWithProviders(<HomeScreen />, signedInSession);
    const finance = await screen.findByTestId('home-team-finance');

    const rows = screen.getAllByTestId(/^home-team-/u).map((row) => row.props.testID as string);
    expect(rows).toEqual(['home-team-finance', 'home-team-sales', 'home-team-hr']);
    expect(within(finance).getByText('Finance')).toBeTruthy();
    expect(figure('home-team-finance')).toBe('Active');
    expect(figure('home-team-sales')).toBe('Paused');
    expect(figure('home-team-hr')).toBe('Draft');
    expect(within(finance).getByText('Acme Operations')).toBeTruthy();
    expect(within(screen.getByTestId('home-team-hr')).getByText("Alex's space")).toBeTruthy();

    await fireEvent.press(finance);
    await fireEvent.press(screen.getByTestId('home-team-hr'));
    await fireEvent.press(screen.getByText('View all teams'));
    expect(mockRouter.push.mock.calls).toEqual([
      [{ pathname: '/(tabs)/settings/team', params: { projectId: 'finance', workspaceId: TEST_WORKSPACE } }],
      [{ pathname: '/(tabs)/settings/team', params: { projectId: 'hr', workspaceId: PERSONAL } }],
      ['/(tabs)/settings/teams'],
    ]);
  });

  it('teams of one workspace do not name it', async () => {
    routeHome({
      workspaces: [ACME, OWN],
      teams: { [TEST_WORKSPACE]: [team('finance', TEST_WORKSPACE, 'Finance', 'active'), team('sales', TEST_WORKSPACE, 'Sales', 'active')] },
    });
    await renderWithProviders(<HomeScreen />, signedInSession);
    const finance = await screen.findByTestId('home-team-finance');
    expect(within(finance).queryByText('Acme Operations')).toBeNull();
    expect(within(screen.getByTestId('home-team-sales')).queryByText('Acme Operations')).toBeNull();
  });

  it('with none: No teams yet., and Create a team — opening Teams — for an owner or admin only', async () => {
    routeHome();
    const view = await renderWithProviders(<HomeScreen />, sessionAs('member'));
    expect(await screen.findByText('No teams yet.')).toBeTruthy();
    expect(screen.queryByTestId('home-create-team')).toBeNull();
    expect(screen.queryByText('View all teams')).toBeNull();
    await view.unmount();

    routeHome();
    await renderWithProviders(<HomeScreen />, sessionAs('admin'));
    expect(await screen.findByText('No teams yet.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-create-team'));
    expect(mockRouter.push.mock.calls).toEqual([['/(tabs)/settings/teams']]);
  });

  it('a teams read that is refused says so, and the rest of Home still shows', async () => {
    const fake = routeHome();
    refuse(fake, 'GET /v1/workspaces', () => new PlatformError('Service Unavailable', 503));
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Your teams could not be read just now.')).toBeTruthy();
    expect(screen.queryByText('View all teams')).toBeNull();
    expect(screen.getByTestId('home-stats')).toBeTruthy();
  });
});
