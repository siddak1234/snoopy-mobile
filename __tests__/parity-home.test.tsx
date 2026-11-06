import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import HomeScreen from '@/app/(tabs)/(home)/index';
import { ScreenError } from '@/components/screen-state';
import { NocturneThemeProvider } from '@/hooks/use-theme';
import { ERROR_BODY, NO_MATCHES, busyLoadBody } from '@/lib/content/screen-states';
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
  flowCatalogPayload,
  inboxPayload,
  runStatsPayload,
  runsPayload,
  sessionAs,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { mockRouter, mockTabs, renderWithProviders, setTextSize } from '@/test/render';

/**
 * Gate 24's parity line, Home's half (BUILD-PLAN 24 Gate 24: "Every signed-in
 * web feature present on mobile, checked against snoopy's page list screen by
 * screen"), against the website's dashboard (`snoopy/app/account/page.tsx`) and
 * its Approvals (`snoopy/app/account/approvals/page.tsx`):
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
 * approved by the owner): TODAY, the banner, Add a flow and Flows, and since the
 * owner's build 34 F5 YOUR FLOWS (~~Recent runs~~).
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
 * `?status=pending`, the banner's (~~and every status, for the run rows~~ until
 * F5), and the teams read from every workspace. A refused route throws its
 * refusal. The runs are answered, so a read of them would be seen.
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
    expect(await screen.findByLabelText('Department: Finance')).toBeTruthy();
    // The pending read alone (~~and every status, for RECENT RUNS' rows~~ until F5).
    expect(fake.to('GET /v1/workspaces/{workspaceId}/approvals').map((sent) => sent.query ?? null)).toEqual([{ status: 'pending' }]);
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

    // The pending read refused: whether anything waits is not known, so no
    // banner says it does — not a count from another read.
    const refused = routeHome();
    refused.always('GET /v1/workspaces/{workspaceId}/approvals', (sent) => {
      if (sent.query?.status === 'pending') throw new PlatformError('Service Unavailable', 503);
      return approvalsPayload();
    });
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Welcome back, Alex')).toBeTruthy();
    expect(screen.queryByText(/need(s)? your review/u)).toBeNull();
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
        expect(screen.getByTestId('home-flow-invoice')).toBeTruthy();
      },
    ],
    [
      'the flows',
      'GET /v1/workspaces/{workspaceId}/subscriptions',
      () => {
        // YOUR FLOWS says so (F5); all teams: nothing else narrows through them.
        expect(screen.getByText('YOUR FLOWS')).toBeTruthy();
        expect(screen.getByTestId('home-flows-line').props.children).toBe('Unavailable');
        expect(screen.getByTestId('home-stats')).toBeTruthy();
      },
    ],
    [
      'the approvals',
      'GET /v1/workspaces/{workspaceId}/approvals',
      () => {
        // No banner without the pending read.
        expect(screen.queryByText(/need(s)? your review/u)).toBeNull();
        expect(screen.getByTestId('home-stats')).toBeTruthy();
        expect(screen.getByTestId('home-flow-invoice')).toBeTruthy();
      },
    ],
    [
      'the catalog',
      'GET /v1/workspaces/{workspaceId}/automations',
      () => {
        // The flows by their own names, under no department, and nothing claims no flow is set up.
        expect(screen.queryByTestId('home-first-run')).toBeNull();
        expect(screen.getByText('YOUR FLOWS')).toBeTruthy();
        expect(within(screen.getByTestId('home-flow-invoice')).getByText('Invoice triage')).toBeTruthy();
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

  it("with a team chosen and the flows refused, the team's figures cannot be told: today's counts and its flows say so too", async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    const fake = routeHome({ teams: { [TEST_WORKSPACE]: [team('project-1', TEST_WORKSPACE, 'Finance', 'active')] } });
    refuse(fake, 'GET /v1/workspaces/{workspaceId}/subscriptions', () => new PlatformError('Service Unavailable', 503));
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByLabelText('Department: Finance')).toBeTruthy();

    expect(screen.getByTestId('home-stats-unavailable')).toBeTruthy();
    expect(screen.getByTestId('home-flows-line').props.children).toBe('Unavailable');
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
 * and Flows, YOUR FLOWS (~~RECENT RUNS~~ until the owner's build 34 F5). ~~RUN A
 * FLOW (Build 21, spec A9)~~, ~~OVERVIEW (G6)~~, ~~Connect integration and View
 * teams (G5)~~ and ~~TEAMS (the owner's AM5)~~.
 */
describe('Home, top to bottom (Build 22, H1–H4)', () => {
  it('the header, the greeting, TODAY, the banner, Add a flow and Flows, then YOUR FLOWS — and nothing else', async () => {
    const pending = [pendingOn('invoice', 0)];
    routeHome({ subscriptions: placedSubscriptions(), pending: { approvals: pending } });
    const view = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByTestId('home-approvals')).toBeTruthy();
    const order = readingOrder(view.toJSON());
    const sequence = ['home-header', 'text:AUTOMATION × AI', 'text:TODAY', 'home-stats', 'home-approvals', 'home-quick-actions', 'text:YOUR FLOWS'];
    const at = sequence.map((entry) => [entry, order.indexOf(entry)] as const);
    expect(at.filter(([, index]) => index < 0)).toEqual([]);
    expect([...at].sort((a, b) => a[1] - b[1]).map(([entry]) => entry)).toEqual(sequence);
    // YOUR FLOWS is the last section: nothing after it but its departments and flows.
    expect(order.slice(order.indexOf('text:YOUR FLOWS')).filter((entry) => /^text:[A-Z ]{4,}$/u.test(entry))).toEqual(['text:YOUR FLOWS']);
    expect(screen.queryByText('RECENT RUNS')).toBeNull();
    expect(screen.queryByText('See all')).toBeNull();
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
    for (const id of [/^home-quick-run/u, /^home-integrations$/u, /^home-connect-integration$/u, /^home-view-teams$/u, /^home-team-/u]) {
      expect(screen.queryAllByTestId(id)).toEqual([]);
    }
  });

  it('reads only what it draws: no connections (the session\'s S31), and since F5 no runs and no approvals but the pending ones', async () => {
    const fake = routeHome();
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByTestId('home-stats')).toBeTruthy();
    expect(fake.to('GET /v1/workspaces/{workspaceId}/connections')).toEqual([]);
    expect(fake.to('GET /v1/workspaces/{workspaceId}/runs')).toEqual([]);
    expect(fake.to('GET /v1/workspaces/{workspaceId}/approvals').map((sent) => sent.query?.status)).toEqual(['pending']);
  });

  it('no banner while nothing waits: TODAY is followed by Add a flow and Flows', async () => {
    routeHome({ pending: { approvals: [] } });
    const view = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByTestId('home-stats')).toBeTruthy();
    expect(screen.queryByTestId('home-approvals')).toBeNull();
    const order = readingOrder(view.toJSON());
    expect(order.indexOf('home-stats')).toBeLessThan(order.indexOf('home-quick-actions'));
  });

});

/**
 * YOUR FLOWS, where RECENT RUNS was (the owner's build 34 F5: "Rather than recent runs from now on we
 * will list the flows the account has … in department alphabetical order … upload the resume, select the
 * department and job that is already existing and start run button. When start run is clicked it starts
 * the run and takes you to the run page"). The flows are made up: no flow's word or id is the app's.
 */
describe("YOUR FLOWS (the owner's build 34 F5)", () => {
  type Subscriptions = Answer<'GET /v1/workspaces/{workspaceId}/subscriptions'>;
  type Items = Answer<'GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items'>;
  const NOTE = { key: 'note', title: 'Note', description: 'A line.', control: 'text' as const, required: false };
  const DECLARED = {
    words: { singular: 'Job', plural: 'Jobs' },
    runWords: { singular: 'Candidate', plural: 'Candidates' },
    titleField: 'title',
    groupField: 'department',
    fields: [
      { key: 'title', title: 'Title', control: 'text' as const, required: true },
      { key: 'department', title: 'Department', control: 'text' as const, required: true },
    ],
    file: { key: 'jobFile', title: 'Job description', description: 'A PDF.', acceptedContentTypes: ['application/pdf'] },
  };
  const job = (id: string, title: string, department: string, over: Partial<Items['items'][number]> = {}): Items['items'][number] => ({
    id,
    subscriptionId: 'email',
    title,
    fields: { title, department },
    status: 'ready',
    runCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    topScore: null,
    createdAt: '2026-10-20T10:00:00Z',
    createdByUserId: null,
    archivedAt: null,
    ...over,
  });

  /** Invoice triage and Email triage — a flow with jobs — in Finance, the KPI report in Accounting, Lead enrichment a draft. */
  function routeFlows(over: { subscriptions?: Subscriptions } = {}) {
    const catalog = flowCatalogPayload();
    type Department = Answer<'GET /v1/workspaces/{workspaceId}/automations'>['automations'][number]['category'];
    const department: Record<string, Department> = {
      'tplflow.invoice': 'Finance',
      'tplflow.email': 'Finance',
      'tplflow.kpi': 'Accounting',
      'tplflow.lead': 'Sales',
    };
    catalog.automations = catalog.automations.map((entry) => ({ ...entry, category: department[entry.templateId]!, subscribed: true }));
    const subscriptions = subscriptionsPayload();
    subscriptions.subscriptions = subscriptions.subscriptions.map((row) =>
      row.id === 'invoice'
        ? { ...row, runInput: [NOTE] }
        : row.id === 'email'
          ? { ...row, runInput: [NOTE], items: DECLARED }
          : row.id === 'kpi'
            ? { ...row, status: 'live' as const, runInput: [] }
            : row,
    );
    const fake = routeHome({ catalog, subscriptions: over.subscriptions ?? subscriptions });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items', {
      items: [
        job('j-designer', 'Designer', 'Product'),
        job('j-accountant', 'Accountant', 'Finance'),
        job('j-intern', 'Intern', 'Product', { status: 'reading' }),
        job('j-old', 'Old role', 'Finance', { archivedAt: '2026-10-21T10:00:00Z' }),
      ],
      choices: {},
    });
    fake.always('POST /v1/workspaces/{workspaceId}/runs', { run: { ...runsPayload().runs[0]!, id: 'run-new', status: 'pending' } });
    return fake;
  }

  it("the live flows by department A–Z, each A–Z by name, under YOUR FLOWS — every flow its own card: icon, name, description, pill; no rows, no carets (build 39 item 8; items 1 and 4)", async () => {
    routeFlows();
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('YOUR FLOWS')).toBeTruthy();
    expect(screen.queryByText('RECENT RUNS')).toBeNull();
    const section = (at: number) => screen.getByTestId(`home-flows-section-${at}`);
    expect(within(section(0)).getByText('ACCOUNTING')).toBeTruthy();
    expect(within(section(0)).getAllByTestId(/^home-flow-[a-z]+$/u).map((row) => row.props.testID)).toEqual(['home-flow-kpi']);
    expect(within(section(1)).getByText('FINANCE')).toBeTruthy();
    // Email triage before Invoice triage, though the catalog lists Invoice triage first.
    expect(within(section(1)).getAllByTestId(/^home-flow-[a-z]+$/u).map((row) => row.props.testID)).toEqual(['home-flow-email', 'home-flow-invoice']);
    expect(screen.queryByTestId('home-flows-section-2')).toBeNull();
    expect(screen.queryByTestId('home-flow-lead')).toBeNull();
    const card = within(screen.getByTestId('home-flow-invoice'));
    expect(card.getByTestId('home-flow-invoice-icon')).toBeTruthy();
    expect(card.getByTestId('home-flow-invoice-name').props.children).toBe('Invoice triage');
    expect(card.getByTestId('home-flow-invoice-description').props.children).toBe(flowCatalogPayload().automations.find((entry) => entry.templateId === 'tplflow.invoice')!.description);
    expect(card.getByText('Live')).toBeTruthy();
    // Always open: the form inside the card, nothing to expand.
    expect(card.getByTestId('home-flow-invoice-form')).toBeTruthy();
    expect(screen.getByTestId('home-flow-invoice').props.accessibilityState).toBeUndefined();
  });

  it('the department drop-down: "All departments" first, then the departments A–Z; one chosen shows its heading and cards alone', async () => {
    routeFlows();
    await renderWithProviders(<HomeScreen />, signedInSession);
    const pill = await screen.findByTestId('home-flows-department');
    expect(pill.props.accessibilityLabel).toBe('YOUR FLOWS: All departments');
    await fireEvent.press(pill);
    const menu = within(screen.getByTestId('home-flows-department-menu'));
    expect(menu.getAllByText(/./u).map((node) => node.props.children)).toEqual(['All departments', 'Accounting', 'Finance']);
    await fireEvent.press(screen.getByTestId('home-flows-department-option-Finance'));
    expect(screen.getByTestId('home-flows-department').props.accessibilityLabel).toBe('YOUR FLOWS: Finance');
    expect(screen.queryByText('ACCOUNTING')).toBeNull();
    expect(screen.queryByTestId('home-flow-kpi')).toBeNull();
    expect(within(screen.getByTestId('home-flows-section-0')).getByText('FINANCE')).toBeTruthy();
    expect(screen.getByTestId('home-flow-email')).toBeTruthy();
    expect(screen.getByTestId('home-flow-invoice')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-flows-department'));
    await fireEvent.press(screen.getByTestId('home-flows-department-option-all'));
    expect(screen.getByTestId('home-flow-kpi')).toBeTruthy();
  });

  it('"Search flows" narrows the cards by name, any case; nothing found says so', async () => {
    routeFlows();
    await renderWithProviders(<HomeScreen />, signedInSession);
    const search = await screen.findByTestId('home-flows-search');
    expect(search.props.placeholder).toBe('Search flows');
    await fireEvent.changeText(search, 'INVOICE');
    expect(screen.getByTestId('home-flow-invoice')).toBeTruthy();
    expect(screen.queryByTestId('home-flow-email')).toBeNull();
    expect(screen.queryByTestId('home-flow-kpi')).toBeNull();
    expect(screen.queryByText('ACCOUNTING')).toBeNull();
    expect(screen.queryByTestId('home-flows-no-match')).toBeNull();
    await fireEvent.changeText(search, 'nothing like it');
    expect(screen.getByTestId('home-flows-no-match').props.children).toBe(NO_MATCHES);
    expect(screen.queryByTestId('home-flows-section-0')).toBeNull();
  });

  it("a flow without items: its run's fields and Start run inside its card; Start run opens the run in Flows over the flow's page", async () => {
    const fake = routeFlows();
    await renderWithProviders(<HomeScreen />, signedInSession);
    const form = within(await screen.findByTestId('home-flow-invoice-form'));
    expect(form.getByText('Note')).toBeTruthy();
    await fireEvent.changeText(form.getByLabelText('Note'), 'From Home');
    await fireEvent.press(form.getByTestId('start-run-button'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/runs')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/runs')[0]!.body).toEqual({ subscriptionId: 'invoice', input: { note: 'From Home' } });
    await waitFor(() => expect(mockTabs.navigate).toHaveBeenCalledTimes(1));
    expect(mockTabs.navigate).toHaveBeenCalledWith('flows', {
      state: { routes: [{ name: 'index' }, { name: 'detail', params: { flow: 'invoice' } }, { name: 'run', params: { runId: 'run-new' } }] },
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('a flow with items has them read when Home loads — one read for it — the newest ready job chosen, still changeable, and Start run names it and opens over its flow and job', async () => {
    const fake = routeFlows();
    await renderWithProviders(<HomeScreen />, signedInSession);
    await waitFor(() => expect(fake.to('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items')).toHaveLength(1));
    expect(fake.to('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items')[0]!.values).toMatchObject({ subscriptionId: 'email' });
    // Newest first: Designer is the newest ready one (Intern is still reading, Old role archived).
    const pill = await screen.findByTestId('home-flow-email-item');
    expect(pill.props.accessibilityLabel).toBe('Job: Designer');
    expect(within(screen.getByTestId('home-flow-email-form')).getByTestId('start-run-button')).toBeTruthy();
    await fireEvent.press(pill);
    const menu = within(screen.getByTestId('home-flow-email-item-menu'));
    expect(menu.getAllByText(/./u).map((node) => node.props.children)).toEqual(['JOB', 'FINANCE', 'Accountant', 'PRODUCT', 'Designer']);
    await fireEvent.press(screen.getByTestId('home-flow-email-item-option-j-accountant'));
    expect(screen.getByTestId('home-flow-email-item').props.accessibilityLabel).toBe('Job: Accountant');
    await fireEvent.press(within(screen.getByTestId('home-flow-email-form')).getByTestId('start-run-button'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/runs')).toHaveLength(1));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/runs')[0]!.body).toEqual({ subscriptionId: 'email', input: {}, itemId: 'j-accountant' });
    await waitFor(() => expect(mockTabs.navigate).toHaveBeenCalledTimes(1));
    expect(mockTabs.navigate).toHaveBeenCalledWith('flows', {
      state: {
        routes: [
          { name: 'index' },
          { name: 'detail', params: { flow: 'email' } },
          { name: 'item', params: { item: 'j-accountant' } },
          { name: 'run', params: { runId: 'run-new' } },
        ],
      },
    });
  });

  it('a person\'s own job choice is kept across re-reads while an upload reads', async () => {
    const fake = routeFlows();
    await renderWithProviders(<HomeScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('home-flow-email-item'));
    await fireEvent.press(screen.getByTestId('home-flow-email-item-option-j-accountant'));
    // Intern is still reading: the list is read again, and the choice stays.
    await waitFor(() => expect(fake.to('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items').length).toBeGreaterThan(1), { timeout: 4000 });
    expect(screen.getByTestId('home-flow-email-item').props.accessibilityLabel).toBe('Job: Accountant');
  });

  it('no ready job: "No jobs yet." and "Upload job", which opens the upload card; the job then reads in the card and, ready, is chosen — without leaving Home (build 37 items 2 and 5)', async () => {
    const fake = routeFlows();
    let listed: Items['items'] = [];
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items', () => ({ items: listed, choices: {} }));
    const made = job('j-new', 'Analyst', 'Finance', { status: 'reading', createdAt: '2026-11-06T10:00:00Z' });
    fake.always('POST /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items', { item: made });
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect((await screen.findByTestId('home-flow-email-items-line')).props.children).toBe('No jobs yet.');
    const upload = screen.getByTestId('home-flow-email-upload');
    expect(within(upload).getByText('Upload job')).toBeTruthy();
    await fireEvent.press(upload);
    expect(await screen.findByTestId('item-upload-dialog')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
    // Cancel closes the card, nothing sent; the button is there again.
    await fireEvent.press(screen.getByTestId('item-upload-cancel'));
    await waitFor(() => expect(screen.queryByTestId('item-upload-dialog')).toBeNull());
    expect(fake.to('POST /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items')).toEqual([]);
    expect(screen.getByTestId('home-flow-email-upload')).toBeTruthy();
    await screen.unmount();
    resetSnapshot();

    // The card after the upload: reading, then — read again — ready and chosen.
    listed = [made];
    const again = routeFlows();
    again.always('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items', () => ({ items: listed, choices: {} }));
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect((await screen.findByTestId('home-flow-email-items-line')).props.children).toBe('Reading…');
    expect(within(screen.getByTestId('home-flow-email-reading')).getByText('Analyst')).toBeTruthy();
    listed = [{ ...made, status: 'ready' }];
    expect((await screen.findByTestId('home-flow-email-item', {}, { timeout: 4000 })).props.accessibilityLabel).toBe('Job: Analyst');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('a flow whose items cannot be read says "Unavailable" in its place; the other cards still draw', async () => {
    const fake = routeFlows();
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items', () => {
      throw new PlatformError('Service Unavailable', 503);
    });
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect((await screen.findByTestId('home-flow-email-items-line')).props.children).toBe('Unavailable');
    expect(screen.getByTestId('home-flow-invoice-form')).toBeTruthy();
  });

  it("at the largest text size the job choice and the run form sit inside the flow's card (build 37 item 3: the cut-off \"Choose\")", async () => {
    const restore = setTextSize(3.571);
    try {
      routeFlows();
      await renderWithProviders(<HomeScreen />, signedInSession);
      const card = within(await screen.findByTestId('home-flow-email'));
      expect(await card.findByTestId('home-flow-email-item')).toBeTruthy();
      expect(card.getByTestId('home-flow-email-form')).toBeTruthy();
      expect(card.getByTestId('start-run-button')).toBeTruthy();
      expect(screen.queryByText('Choose')).toBeNull();
    } finally {
      // The size goes back while the screen is drawn: inside act, so its re-render is awaited.
      await act(async () => {
        restore();
      });
    }
  });

  it("a flow that cannot start a run here — no run fields, or a flow with items to a member — shows Open, to its flow page; nothing is read for it", async () => {
    routeFlows();
    await renderWithProviders(<HomeScreen />, signedInSession);
    const kpi = within(await screen.findByTestId('home-flow-kpi'));
    expect(kpi.queryByTestId('home-flow-kpi-form')).toBeNull();
    await fireEvent.press(kpi.getByTestId('home-flow-kpi-open'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'kpi' } });
    await screen.unmount();
    resetSnapshot();

    const fake = routeFlows();
    await renderWithProviders(<HomeScreen />, sessionAs('member'));
    const email = within(await screen.findByTestId('home-flow-email'));
    expect(email.queryByTestId('home-flow-email-form')).toBeNull();
    expect(within(email.getByTestId('home-flow-email-open')).getByText('Open')).toBeTruthy();
    await fireEvent.press(email.getByTestId('home-flow-email-open'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'email' } });
    expect(fake.to('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items')).toEqual([]);
    // A member still starts a flow without items here.
    expect(screen.getByTestId('home-flow-invoice-form')).toBeTruthy();
  });

  it("with a department chosen, its flows alone; none live there, or none at all: no YOUR FLOWS, as the website's", async () => {
    mockStored.set(TEST_WORKSPACE, 'project-2');
    const placed = subscriptionsPayload();
    placed.subscriptions = placed.subscriptions.map((row) => ({ ...row, projectId: row.id === 'invoice' ? 'project-1' : 'project-2' }));
    routeFlows({ subscriptions: placed });
    const teams = { [TEST_WORKSPACE]: [team('project-1', TEST_WORKSPACE, 'Finance', 'active'), team('project-2', TEST_WORKSPACE, 'Legal', 'active')] };
    const fake = routeHome({ subscriptions: placed, teams });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items', { items: [], choices: {} });
    const view = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByLabelText('Department: Legal')).toBeTruthy();
    expect(screen.getByTestId('home-flow-email')).toBeTruthy();
    expect(screen.queryByTestId('home-flow-invoice')).toBeNull();
    await view.unmount();
    resetSnapshot();

    mockStored.set(TEST_WORKSPACE, 'project-2');
    const noneInLegal = subscriptionsPayload();
    noneInLegal.subscriptions = noneInLegal.subscriptions.map((row) => ({ ...row, projectId: 'project-1' }));
    routeHome({ subscriptions: noneInLegal, teams });
    const again = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByLabelText('Department: Legal')).toBeTruthy();
    expect(screen.getByTestId('home-stats')).toBeTruthy();
    expect(screen.queryByText('YOUR FLOWS')).toBeNull();
    expect(screen.queryByTestId('home-flows-line')).toBeNull();
    await again.unmount();
    resetSnapshot();

    mockStored.clear();
    const paused = subscriptionsPayload();
    paused.subscriptions = paused.subscriptions.map((row) => ({ ...row, status: 'paused' as const }));
    routeHome({ subscriptions: paused });
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByTestId('home-stats')).toBeTruthy();
    expect(screen.queryByText('YOUR FLOWS')).toBeNull();
    expect(screen.queryByTestId('home-first-run')).toBeNull();
  });
});
