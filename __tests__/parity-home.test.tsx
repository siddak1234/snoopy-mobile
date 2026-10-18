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
 * - ~~G5: Connect integration and View teams, with flows or none~~ and
 *   ~~G6's overview (Flows, Integrations)~~ until Build 22 (the owner's build
 *   21 item 1: "Remove overflow … I dont want want flows integrations, connect
 *   integrations, view teams, or run a flow"); G6's rule stands: every figure
 *   fails on its own.
 * - ~~G7: the first three teams across the workspaces, and View all teams~~
 *   until the owner's AM5.
 *
 * The website's dashboard matches the app since Build 22 (the session's D5,
 * approved by the owner): TODAY, the banner, Add a flow and Flows, Recent runs.
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

describe("Home's ways out since Build 22 (H3, H4)", () => {
  it('with flows: Add a flow opens the catalog and Flows the Flows tab — no Connect integration, no View teams', async () => {
    routeHome();
    await renderWithProviders(<HomeScreen />, signedInSession);
    const pills = await screen.findByTestId('home-quick-actions');
    await fireEvent.press(within(pills).getByText('Add a flow'));
    await fireEvent.press(within(pills).getByText('Flows'));
    expect(mockRouter.push.mock.calls).toEqual([['/(tabs)/flows/add'], ['/(tabs)/flows']]);
    for (const gone of ['Connect integration', 'View teams']) expect([gone, screen.queryByText(gone) !== null]).toEqual([gone, false]);
  });

  it('with none set up yet: the first run\'s own Add a flow, no pills, and no Connect integration or View teams', async () => {
    const catalog = catalogPayload();
    catalog.automations = catalog.automations.map((automation) => ({ ...automation, subscribed: false }));
    routeHome({ catalog });
    await renderWithProviders(<HomeScreen />, signedInSession);
    const first = await screen.findByTestId('home-first-run');
    expect(screen.queryByTestId('home-quick-actions')).toBeNull();
    await fireEvent.press(within(first).getByText('Add a flow'));
    expect(mockRouter.push.mock.calls).toEqual([['/(tabs)/flows/add']]);
    for (const gone of ['Connect integration', 'View teams']) expect([gone, screen.queryByText(gone) !== null]).toEqual([gone, false]);
  });
});

describe('G6 — every figure on its own', () => {
  it.each<[string, Route, () => void]>([
    [
      "today's counts",
      'GET /v1/workspaces/{workspaceId}/run-stats',
      () => {
        expect(screen.getByTestId('home-stats-unavailable').props.children).toBe('Unavailable');
        expect(screen.queryByTestId('home-stats')).toBeNull();
        expect(screen.queryByText(/Your agents ran/u)).toBeNull();
        expect(screen.getByText('Run #4821 · posted to QuickBooks')).toBeTruthy();
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
        // All teams: nothing else narrows through them.
        expect(screen.getByTestId('home-stats')).toBeTruthy();
        expect(screen.getByText('Run #4821 · posted to QuickBooks')).toBeTruthy();
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

    expect(screen.getByTestId('home-stats-unavailable')).toBeTruthy();
    expect(screen.getByText('Recent activity could not be read just now.')).toBeTruthy();
  });
});

/** The order of what is on screen: each test id, and each line of text as `text:<words>`. */
function readingOrder(tree: unknown): string[] {
  const order: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') return void order.push(`text:${node}`);
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return void node.forEach(walk);
    const { props, children } = node as { props?: { testID?: unknown }; children?: unknown[] | null };
    if (typeof props?.testID === 'string') order.push(props.testID);
    children?.forEach(walk);
  };
  walk(tree);
  return order;
}

/**
 * Build 22, H1–H4 (the owner's build 21 item 1, verbatim: "Remove run a flow
 * section. We did not add thus. / Remove overflow, it should be the 3 icons for
 * today with the run types / Then add a flow and flow buttons / Then recent
 * runs. / I dont want want flows integrations, connect integrations, view teams,
 * or run a flow. / Recent runs is fine"; "overflow" is OVERVIEW and the banner
 * stays right after TODAY — the session's D4 and D6, approved by the owner):
 * the header, the greeting, TODAY, the banner while something waits, Add a flow
 * and Flows, RECENT RUNS. ~~RUN A FLOW (Build 21, spec A9)~~, ~~OVERVIEW (G6)~~,
 * ~~Connect integration and View teams (G5)~~ and ~~TEAMS (the owner's AM5)~~.
 */
describe('Home, top to bottom (Build 22, H1–H4)', () => {
  it('the header, the greeting, TODAY, the banner, Add a flow and Flows, then RECENT RUNS — and nothing else', async () => {
    const pending = [pendingOn('invoice', 0)];
    routeHome({ subscriptions: placedSubscriptions(), pending: { approvals: pending } });
    const view = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByTestId('home-approvals')).toBeTruthy();
    const order = readingOrder(view.toJSON());
    const sequence = ['home-header', 'text:AUTOMATION × AI', 'text:TODAY', 'home-stats', 'home-approvals', 'home-quick-actions', 'text:RECENT RUNS'];
    const at = sequence.map((entry) => [entry, order.indexOf(entry)] as const);
    expect(at.filter(([, index]) => index < 0)).toEqual([]);
    expect([...at].sort((a, b) => a[1] - b[1]).map(([entry]) => entry)).toEqual(sequence);
    // RECENT RUNS is the last section: nothing after its card but its rows.
    expect(order.slice(order.indexOf('text:RECENT RUNS')).filter((entry) => /^text:[A-Z ]{4,}$/u.test(entry))).toEqual(['text:RECENT RUNS']);
  });

  it('draws no RUN A FLOW — though flows are live — no OVERVIEW, no Integrations, no Connect integration, no View teams, no Teams list', async () => {
    routeHome({
      subscriptions: placedSubscriptions(),
      workspaces: [ACME, OWN],
      teams: { [TEST_WORKSPACE]: [team('finance', TEST_WORKSPACE, 'Finance', 'active')], [PERSONAL]: [team('hr', PERSONAL, 'HR', 'draft')] },
    });
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByTestId('home-stats')).toBeTruthy();
    for (const gone of ['RUN A FLOW', 'OVERVIEW', 'Integrations', 'Connect integration', 'View teams', 'TEAMS', 'View all teams']) {
      expect([gone, screen.queryByText(gone) !== null]).toEqual([gone, false]);
    }
    for (const id of [/^home-quick-run/u, /^home-flows$/u, /^home-integrations$/u, /^home-connect-integration$/u, /^home-view-teams$/u, /^home-team-/u]) {
      expect(screen.queryAllByTestId(id)).toEqual([]);
    }
  });

  it('reads only what it draws: no connections (the session\'s S31)', async () => {
    const fake = routeHome();
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByTestId('home-stats')).toBeTruthy();
    expect(fake.to('GET /v1/workspaces/{workspaceId}/connections')).toEqual([]);
  });

  it('no banner while nothing waits: TODAY is followed by Add a flow and Flows', async () => {
    routeHome({ pending: { approvals: [] } });
    const view = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByTestId('home-stats')).toBeTruthy();
    expect(screen.queryByTestId('home-approvals')).toBeNull();
    const order = readingOrder(view.toJSON());
    expect(order.indexOf('home-stats')).toBeLessThan(order.indexOf('home-quick-actions'));
  });

  it('names each recent run by its full id, under its line (spec A8; the owner\'s AM2)', async () => {
    const runs = runsPayload();
    runs.runs = [{ ...runs.runs[0]!, id: '793eef82-102d-81be-a2d3-9e8d4e2b2c36', requestId: '1e3231c6-0000-4000-8000-000000000000' }];
    routeHome({ runs });
    await renderWithProviders(<HomeScreen />, signedInSession);
    const stamp = await screen.findByTestId('home-stamp-793eef82-102d-81be-a2d3-9e8d4e2b2c36');
    expect(stamp.props.children).toMatch(/ · Run 793eef82-102d-81be-a2d3-9e8d4e2b2c36$/u);
    expect(screen.queryByText(/1e3231c6/u)).toBeNull();
  });
});
