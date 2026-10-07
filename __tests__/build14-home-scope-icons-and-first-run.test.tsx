import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import {
  Bank,
  Briefcase,
  Calculator,
  Code,
  Cube,
  Database,
  Desktop,
  Flask,
  Gavel,
  Gear,
  Handshake,
  Headset,
  Megaphone,
  ShieldCheck,
  ShoppingCart,
  SquaresFour,
  Users,
  UsersThree,
} from 'phosphor-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import HomeScreen from '@/app/(tabs)/(home)/index';
import type { SessionContextValue } from '@/hooks/use-session';
import {
  ALL_TEAMS_ICON,
  OTHER_TEAM_ICON,
  OTHER_TEAM_TYPE,
  TEAM_TYPES,
  TEAM_TYPE_ICONS,
  teamTypeIcon,
} from '@/lib/content/team-types';
import { fakePlatform } from '@/test/fake-platform';
import {
  TEST_WORKSPACE,
  approvalsPayload,
  catalogPayload,
  inboxPayload,
  personalSession,
  projectsPayload,
  runStatsPayload,
  runsPayload,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { mockRouter, renderWithProviders } from '@/test/render';

/**
 * The owner's build 13 decisions 2 and 5 (2026-10-06, on TestFlight build 13):
 * Home's scope control is two icons beside the bell — the workspace, a person or
 * a building; the team, its kind's icon or four squares for All teams — each a
 * button that opens the card the pills open and is read aloud as what it is and
 * what is chosen; and Home with no flow is the dashboard as it is with flows,
 * the first run where RECENT RUNS goes.
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
  writeScope: jest.fn(async (workspaceId: string, projectId: string | null) => {
    mockStored.set(workspaceId, projectId);
  }),
}));
const { writeScope } = jest.requireMock('@/lib/platform/scope-store');

/**
 * The icons the two scope buttons draw, each standing in as a View that names
 * it, so a test reads which one is drawn. Every other icon is the real one, and
 * the map in `lib/content/team-types.ts` holds these same stand-ins.
 */
jest.mock('phosphor-react-native', () => {
  const actual = jest.requireActual('phosphor-react-native');
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const named: Record<string, unknown> = {};
  for (const name of [
    'User',
    'Buildings',
    'Users',
    'Calculator',
    'Bank',
    'Gavel',
    'ShieldCheck',
    'Database',
    'Gear',
    'Handshake',
    'Megaphone',
    'Headset',
    'Desktop',
    'Code',
    'Cube',
    'ShoppingCart',
    'Briefcase',
    'Flask',
    'UsersThree',
    'SquaresFour',
  ]) {
    named[name] = function StandIn() {
      return createElement(View, { testID: `icon-${name}` });
    };
  }
  return { __esModule: true, ...actual, ...named };
});

const Haptics = jest.requireMock('expo-haptics');

const PERSONAL = '00000000-0000-4000-8000-000000000002';

beforeEach(() => {
  platformOperation.mockReset();
  mockStored.clear();
});

/** Home's five reads, its bell's inbox and the team list, answered; the switcher's read of the workspaces too. */
function routeHome(
  answers: {
    projects?: ReturnType<typeof projectsPayload>;
    catalog?: ReturnType<typeof catalogPayload>;
    stats?: ReturnType<typeof runStatsPayload>;
    runs?: ReturnType<typeof runsPayload>;
    approvals?: ReturnType<typeof approvalsPayload>;
    subscriptions?: ReturnType<typeof subscriptionsPayload>;
    inbox?: ReturnType<typeof inboxPayload>;
  } = {},
) {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces/{workspaceId}/run-stats', answers.stats ?? runStatsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/runs', answers.runs ?? runsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/automations', answers.catalog ?? catalogPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/approvals', answers.approvals ?? approvalsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', answers.subscriptions ?? subscriptionsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/projects', answers.projects ?? projectsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/notifications', answers.inbox ?? inboxPayload());
  fake.always('GET /v1/workspaces', {
    workspaces: [
      { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' },
      { id: PERSONAL, name: "Alex's space", type: 'personal', role: 'owner' },
    ],
    activeWorkspaceId: TEST_WORKSPACE,
  });
  return fake;
}

/** A workspace that has never set a flow up: nothing subscribed, nothing run, nothing waiting. */
function routeNothingYet() {
  const catalog = catalogPayload();
  catalog.automations = catalog.automations.map((automation) => ({ ...automation, subscribed: false }));
  const zero = { total: 0, pending: 0, running: 0, held: 0, succeeded: 0, failed: 0, cancelled: 0 };
  return routeHome({
    catalog,
    stats: { workspace: zero, subscriptions: [] },
    runs: { runs: [] },
    approvals: { approvals: [] },
    subscriptions: { subscriptions: [] },
    inbox: { items: [], unreadCount: 0 },
  });
}

/** The signed-in session holding the test workspace and the person's own, with a reload to watch. */
function holdingTwo(): SessionContextValue & { reload: jest.Mock } {
  if (signedInSession.status !== 'signed-in') throw new Error('fixture');
  const reload = jest.fn(async () => ({ status: 'signed-in' as const }));
  return {
    ...signedInSession,
    reload,
    session: {
      ...signedInSession.session,
      workspaces: [
        ...signedInSession.session.workspaces,
        { id: PERSONAL, name: "Alex's space", type: 'personal', role: 'owner' },
      ],
    },
  };
}

/** The header's buttons, in the order drawn, by what each is read aloud as. */
const headerButtons = () =>
  screen
    .getByTestId('home-header-actions')
    .children.map((child) => (typeof child === 'string' ? child : child.props.accessibilityLabel));

describe("the kinds' icons, beside the list (the owner's build 13 decision 2)", () => {
  it("gives every kind on the list an icon — the owner's, each its own — and Other, a kind in a person's own words and none chosen theirs", () => {
    // Every entry, and nothing else: the map is the list's.
    expect(Object.keys(TEAM_TYPE_ICONS)).toEqual([...TEAM_TYPES]);
    for (const kind of TEAM_TYPES) expect([kind, typeof TEAM_TYPE_ICONS[kind]]).toEqual([kind, 'function']);

    const owners = [
      ['HR', Users],
      ['Accounting', Calculator],
      ['Finance', Bank],
      ['Legal', Gavel],
      ['Compliance', ShieldCheck],
      ['Data', Database],
      ['Operations', Gear],
      ['Sales', Handshake],
      ['Marketing', Megaphone],
      ['Customer Support', Headset],
      ['IT', Desktop],
      ['Engineering', Code],
      ['Product', Cube],
      ['Procurement', ShoppingCart],
      ['Administration', Briefcase],
      ['Research', Flask],
    ] as const;
    expect(owners.map(([kind]) => kind)).toEqual([...TEAM_TYPES]);
    for (const [kind, icon] of owners) expect([kind, teamTypeIcon(kind) === icon]).toEqual([kind, true]);
    expect(new Set(TEAM_TYPES.map((kind) => teamTypeIcon(kind))).size).toBe(TEAM_TYPES.length);

    // Other, and any kind off the list, is the team icon; none chosen is All teams'.
    expect(OTHER_TEAM_ICON).toBe(UsersThree);
    for (const kind of [OTHER_TEAM_TYPE, 'Facilities', 'constructor', 'toString']) {
      expect([kind, teamTypeIcon(kind) === UsersThree]).toEqual([kind, true]);
    }
    expect(ALL_TEAMS_ICON).toBe(SquaresFour);
    // As the platform compares kinds: ignoring case.
    expect(teamTypeIcon('legal')).toBe(Gavel);
    expect(teamTypeIcon('customer support')).toBe(Headset);
  });
});

describe("Home's scope: two icons beside the bell (the owner's build 13 decision 2)", () => {
  it('draws the workspace and the team as icons before the bell and the avatar — a building and four squares — each read aloud as what it is and what is chosen; the labelled pills are gone', async () => {
    routeHome();
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Welcome back, Alex')).toBeTruthy();

    expect(headerButtons()).toEqual(['Workspace: Acme Operations', 'Team: All teams', 'Notifications', 'Account and settings']);
    expect(within(screen.getByLabelText('Workspace: Acme Operations')).getByTestId('icon-Buildings')).toBeTruthy();
    expect(within(screen.getByLabelText('Team: All teams')).getByTestId('icon-SquaresFour')).toBeTruthy();
    for (const label of ['Workspace: Acme Operations', 'Team: All teams']) {
      const button = screen.getByLabelText(label);
      expect(button.props.accessibilityRole).toBe('button');
      // Drawn as the bell beside them.
      expect(StyleSheet.flatten(button.props.style)).toMatchObject({ width: 38, height: 38, borderRadius: 999, borderWidth: 1 });
    }
    // No words: the pill row is not on Home.
    expect(screen.queryByTestId('scope-control')).toBeNull();
    expect(screen.queryByText('Acme Operations')).toBeNull();
    expect(screen.queryByText('All teams')).toBeNull();
  });

  it('draws a personal workspace as a person', async () => {
    routeHome();
    await renderWithProviders(<HomeScreen />, personalSession());
    const workspace = await screen.findByLabelText('Workspace: Acme Operations');
    expect(within(workspace).getByTestId('icon-User')).toBeTruthy();
    expect(within(workspace).queryByTestId('icon-Buildings')).toBeNull();
  });

  it("draws the chosen team as its kind's icon, and a kind in a person's own words as the team icon", async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    routeHome({ projects: projectsPayload('Legal', 'Facilities') });
    await renderWithProviders(<HomeScreen />, signedInSession);
    const legal = await screen.findByLabelText('Team: Legal');
    expect(within(legal).getByTestId('icon-Gavel')).toBeTruthy();

    await fireEvent.press(legal);
    await fireEvent.press(within(screen.getByTestId('scope-team-dialog')).getByTestId('scope-option-project-2'));
    const facilities = await screen.findByLabelText('Team: Facilities');
    expect(within(facilities).getByTestId('icon-UsersThree')).toBeTruthy();
  });

  it('the team icon ticks and opens Show — the team list, in words — and a team chosen there is the scope: kept, the icon and its label follow, and Home narrows to it', async () => {
    const subscriptions = subscriptionsPayload();
    // Every run in the fixtures is of `invoice`: in Finance; Legal has no flow.
    subscriptions.subscriptions = subscriptions.subscriptions.map((row) =>
      row.id === 'invoice' ? { ...row, projectId: 'project-1' } : row,
    );
    routeHome({ projects: projectsPayload('Finance', 'Legal'), subscriptions });
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Run #4821 · posted to QuickBooks')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Team: All teams'));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    const dialog = screen.getByTestId('scope-team-dialog');
    expect(within(dialog).getByText('Show')).toBeTruthy();
    expect(within(dialog).getByText('All teams')).toBeTruthy();
    expect(within(dialog).getByText('Finance')).toBeTruthy();
    expect(within(dialog).getByText('Legal')).toBeTruthy();

    await fireEvent.press(within(dialog).getByTestId('scope-option-project-2'));
    expect(screen.queryByTestId('scope-team-dialog')).toBeNull();
    expect(writeScope.mock.calls).toEqual([[TEST_WORKSPACE, 'project-2']]);
    const legal = await screen.findByLabelText('Team: Legal');
    expect(within(legal).getByTestId('icon-Gavel')).toBeTruthy();
    expect(screen.getByText('No runs in this team yet.')).toBeTruthy();
    expect(screen.queryByText('Run #4821 · posted to QuickBooks')).toBeNull();

    // And back to every team, from the same card.
    await fireEvent.press(legal);
    await fireEvent.press(within(screen.getByTestId('scope-team-dialog')).getByTestId('scope-option-all'));
    expect(within(await screen.findByLabelText('Team: All teams')).getByTestId('icon-SquaresFour')).toBeTruthy();
    expect(screen.getByText('Run #4821 · posted to QuickBooks')).toBeTruthy();
  });

  it('the workspace icon ticks and opens Switch workspace — the workspaces, in words — and choosing another switches: the active workspace PATCHed with a key, then the session read again', async () => {
    const fake = routeHome();
    fake.always('PATCH /v1/session/active-workspace', { activeWorkspaceId: PERSONAL });
    const session = holdingTwo();
    await renderWithProviders(<HomeScreen />, session);

    await fireEvent.press(await screen.findByLabelText('Workspace: Acme Operations'));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    const dialog = screen.getByTestId('workspace-switcher-dialog');
    expect(within(dialog).getByText('Switch workspace')).toBeTruthy();
    expect(await within(dialog).findByText("Alex's space")).toBeTruthy();
    expect(within(dialog).getByText('Acme Operations')).toBeTruthy();
    expect(within(dialog).getByTestId(`workspace-active-${TEST_WORKSPACE}`)).toBeTruthy();

    await fireEvent.press(within(dialog).getByTestId(`workspace-option-${PERSONAL}`));
    await waitFor(() => expect(session.reload).toHaveBeenCalledTimes(1));
    expect(fake.to('PATCH /v1/session/active-workspace')).toEqual([
      {
        method: 'PATCH',
        path: '/v1/session/active-workspace',
        values: {},
        key: 'workspace-activate-key',
        body: { workspaceId: PERSONAL },
      },
    ]);
    await waitFor(() => expect(screen.queryByTestId('workspace-switcher-dialog')).toBeNull());
  });

  it('the workspace icon is a button with one workspace too — the card is where its name is read — and choosing it sends nothing', async () => {
    const fake = routeHome();
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    await renderWithProviders(<HomeScreen />, signedInSession);

    await fireEvent.press(await screen.findByLabelText('Workspace: Acme Operations'));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    const dialog = screen.getByTestId('workspace-switcher-dialog');
    expect(await within(dialog).findByText('Acme Operations')).toBeTruthy();
    expect(within(dialog).getAllByTestId(/^workspace-option-/u)).toHaveLength(1);

    await fireEvent.press(within(dialog).getByTestId(`workspace-option-${TEST_WORKSPACE}`));
    await waitFor(() => expect(screen.queryByTestId('workspace-switcher-dialog')).toBeNull());
    expect(fake.to('PATCH /v1/session/active-workspace')).toEqual([]);
  });
});

describe("Home with no flow is the dashboard (the owner's build 13 decision 5)", () => {
  it('draws the header, the greeting and TODAY at 0, and Nothing automated. Yet. with Add a flow where RECENT RUNS goes — no review banner, and no Add a flow or Flows pills over it', async () => {
    routeNothingYet();
    await renderWithProviders(<HomeScreen />, signedInSession);

    expect(await screen.findByText('Welcome back, Alex')).toBeTruthy();
    expect(screen.getByText('AUTOMATION × AI')).toBeTruthy();
    expect(screen.getByText('Your agents ran 0 tasks today.')).toBeTruthy();
    expect(headerButtons()).toEqual(['Workspace: Acme Operations', 'Team: All teams', 'Notifications', 'Account and settings']);
    // TODAY, its three tiles at 0, each the button it is with flows.
    const stats = screen.getByTestId('home-stats');
    expect(within(stats.parent!).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'TODAY',
      '0',
      'Runs',
      '0',
      'Successes',
      '0',
      'Failures',
    ]);

    // The first run, last on the page, where the runs would be.
    const firstRun = screen.getByTestId('home-first-run');
    expect(within(firstRun).getByText('Nothing automated. Yet.')).toBeTruthy();
    expect(
      within(firstRun).getByText('Add a prebuilt flow and your first agent is running in minutes — no building required.'),
    ).toBeTruthy();
    expect(screen.queryByText('RECENT RUNS')).toBeNull();
    expect(screen.queryByText('See all')).toBeNull();
    // The quick actions' pills are not drawn over it; the website's other two
    // quick actions are, as rows (Gate 24 parity, G5).
    const quickActions = screen.getByTestId('home-quick-actions');
    expect(within(quickActions).queryByText('Flows')).toBeNull();
    expect(within(quickActions).getByText('Connect integration')).toBeTruthy();
    expect(within(quickActions).getByText('View teams')).toBeTruthy();
    expect(screen.getAllByText('Add a flow')).toHaveLength(1);
    expect(screen.queryByText(/need(s)? your review/u)).toBeNull();

    await fireEvent.press(within(firstRun).getByText('Add a flow'));
    expect(mockRouter.push.mock.calls).toEqual([['/(tabs)/flows/add']]);
  });

  it('its bell, avatar and scope icons are buttons, as with flows: each ticks and opens its page or card', async () => {
    routeNothingYet();
    await renderWithProviders(<HomeScreen />, signedInSession);
    await screen.findByTestId('home-first-run');

    await fireEvent.press(screen.getByLabelText('Notifications'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/(tabs)/(home)/notifications');
    await fireEvent.press(screen.getByLabelText('Account and settings'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/(tabs)/settings');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);

    await fireEvent.press(screen.getByLabelText('Team: All teams'));
    expect(screen.getByTestId('scope-team-dialog')).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('scope-team-dialog')).getByText('Done'));
    await fireEvent.press(screen.getByLabelText('Workspace: Acme Operations'));
    expect(screen.getByTestId('workspace-switcher-dialog')).toBeTruthy();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(5);

    // A tile too: Activity, today, its outcome.
    await fireEvent.press(screen.getByTestId('stat-All'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/activity', params: { filter: 'All', period: 'today' } });
  });
});
