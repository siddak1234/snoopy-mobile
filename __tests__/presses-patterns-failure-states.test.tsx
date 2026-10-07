import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import HomeScreen from '@/app/(tabs)/(home)/index';
import NotificationsScreen from '@/app/(tabs)/(home)/notifications';
import RunDetailScreen from '@/app/(tabs)/(home)/run';
import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import ActivityScreen from '@/app/(tabs)/activity/index';
import AddFlowScreen from '@/app/(tabs)/flows/add';
import ArchivedFlowsScreen from '@/app/(tabs)/flows/archived';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import FlowsScreen from '@/app/(tabs)/flows/index';
import SetupScreen from '@/app/(tabs)/flows/setup';
import AccountScreen from '@/app/(tabs)/settings/account';
import BillingScreen from '@/app/(tabs)/settings/billing';
import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import DataExportScreen from '@/app/(tabs)/settings/data';
import OrganizationScreen from '@/app/(tabs)/settings/organization';
import TeamScreen from '@/app/(tabs)/settings/team';
import TeamsScreen from '@/app/(tabs)/settings/teams';
import { BACK_LABEL, RETRY_LABEL } from '@/lib/content/screen-states';
import { PlatformError, PlatformNotConfiguredError, PlatformUnreachableError } from '@/lib/platform/problem';
import { TEST_WORKSPACE, routePlatform, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
  downloadSignedFile: jest.fn(),
}));
// Export my data saves its file into the app (24.12); the module is native.
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: {} } }));
// Account links in the system browser; nothing here links.
jest.mock('@/lib/platform/identity-link', () => ({ linkIdentity: jest.fn() }));

const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * The failure states every fetching screen shares (`gErr`, `gOff`, and the
 * unavailable state of DESIGN-CONTRACT's data states), and Home's own
 * `sHomeErr`, pressed on every screen that draws them (build 13, B9).
 *
 * - Retry reads the screen again: the read that failed is sent a second time.
 * - Back — the circle, and Go back where a failed load draws it — goes back.
 * - Unavailable offers no Retry: no backend, no workspace or no subject cannot
 *   succeed on a second attempt (DESIGN-CONTRACT, "`unavailable` is separate
 *   from `error` because Retry distinguishes them"; DESIGN-GAPS, "`unconfigured`
 *   is its own state").
 *
 * A tab's own screen (Activity, Flows) is given no way back, so only its Retry
 * is pressed there.
 */

type FetchingScreen = {
  Screen: React.ComponentType;
  params?: Record<string, string>;
  /** The screen's read, by its request: the one refused here, and the one Retry sends again. */
  read: RegExp;
};

const SCREENS = {
  Home: { Screen: HomeScreen, read: /\/run-stats\?since=/u },
  Run: { Screen: RunDetailScreen, params: { runId: 'run-0' }, read: /\/runs\/run-0$/u },
  Approvals: { Screen: ApprovalsScreen, read: /\/approvals\?status=pending$/u },
  Activity: { Screen: ActivityScreen, read: /\/runs$/u },
  'Add a flow': { Screen: AddFlowScreen, read: /\/automations$/u },
  'Flow detail': { Screen: WorkflowDetailScreen, params: { flow: 'invoice' }, read: /\/subscriptions$/u },
  Flows: { Screen: FlowsScreen, read: /\/subscriptions$/u },
  Setup: { Screen: SetupScreen, params: { template: 'tpl.0' }, read: /\/automations$/u },
  Account: { Screen: AccountScreen, read: /^\/v1\/auth\/identities$/u },
  Billing: { Screen: BillingScreen, read: /^\/v1\/workspaces$/u },
  Connections: { Screen: ConnectionsScreen, read: /\/connections$/u },
  'Export my data': { Screen: DataExportScreen, read: /^\/v1\/workspaces$/u },
  Organization: { Screen: OrganizationScreen, read: /^\/v1\/workspaces$/u },
  Team: { Screen: TeamScreen, params: { projectId: 'p1', workspaceId: TEST_WORKSPACE }, read: /^\/v1\/workspaces$/u },
  Teams: { Screen: TeamsScreen, read: /^\/v1\/workspaces$/u },
  'Archived flows': { Screen: ArchivedFlowsScreen, read: /\/subscriptions\?status=archived$/u },
  Notifications: { Screen: NotificationsScreen, read: /\/notifications$/u },
} satisfies Record<string, FetchingScreen>;

/** How the read is refused, what the screen then draws, and what that state offers. */
const STATES = {
  offline: { refusal: () => new PlatformUnreachableError(), testID: 'screen-offline', retry: true, goBack: false },
  error: { refusal: () => new PlatformError('Internal Server Error', 500), testID: 'screen-error', retry: true, goBack: true },
  unavailable: { refusal: () => new PlatformNotConfiguredError(), testID: 'screen-unavailable', retry: false, goBack: true },
} as const;

type Case = [name: keyof typeof SCREENS, state: keyof typeof STATES, site: string, back: boolean];

const CASES: Case[] = [
  // Home's one combined failure state (DESIGN-CONTRACT's carve-out): Retry only.
  ['Home', 'offline', 'app/(tabs)/(home)/index.tsx:285', false],
  ['Run', 'offline', 'app/(tabs)/(home)/run.tsx:189', true],
  ['Run', 'unavailable', 'app/(tabs)/(home)/run.tsx:198', true],
  ['Run', 'error', 'app/(tabs)/(home)/run.tsx:207-208', true],
  ['Approvals', 'offline', 'app/(tabs)/activity/approvals.tsx:174', true],
  ['Approvals', 'unavailable', 'app/(tabs)/activity/approvals.tsx:180', true],
  ['Approvals', 'error', 'app/(tabs)/activity/approvals.tsx:189-190', true],
  ['Activity', 'offline', 'app/(tabs)/activity/index.tsx:292', false],
  ['Activity', 'error', 'app/(tabs)/activity/index.tsx:301', false],
  ['Add a flow', 'offline', 'app/(tabs)/flows/add.tsx:71', true],
  ['Add a flow', 'unavailable', 'app/(tabs)/flows/add.tsx:74', true],
  ['Add a flow', 'error', 'app/(tabs)/flows/add.tsx:80-82', true],
  ['Flow detail', 'offline', 'app/(tabs)/flows/detail.tsx:171', true],
  ['Flow detail', 'unavailable', 'app/(tabs)/flows/detail.tsx:180', true],
  ['Flow detail', 'error', 'app/(tabs)/flows/detail.tsx:189-190', true],
  ['Flows', 'offline', 'app/(tabs)/flows/index.tsx:101', false],
  ['Flows', 'error', 'app/(tabs)/flows/index.tsx:108', false],
  ['Setup', 'offline', 'app/(tabs)/flows/setup.tsx:140', true],
  ['Setup', 'error', 'app/(tabs)/flows/setup.tsx:146-147', true],
  // An unconfigured read is the unavailable state on Setup as on every other
  // fetching screen: Back, and no Retry that cannot succeed.
  ['Setup', 'unavailable', 'app/(tabs)/flows/setup.tsx:142-151', true],
  ['Account', 'offline', 'app/(tabs)/settings/account.tsx:92', true],
  ['Account', 'unavailable', 'app/(tabs)/settings/account.tsx:95', true],
  ['Account', 'error', 'app/(tabs)/settings/account.tsx:101-103', true],
  ['Billing', 'offline', 'app/(tabs)/settings/billing.tsx:194', true],
  ['Billing', 'unavailable', 'app/(tabs)/settings/billing.tsx:197', true],
  ['Billing', 'error', 'app/(tabs)/settings/billing.tsx:203-205', true],
  ['Connections', 'offline', 'app/(tabs)/settings/connections.tsx:42', true],
  ['Connections', 'unavailable', 'app/(tabs)/settings/connections.tsx:45', true],
  ['Connections', 'error', 'app/(tabs)/settings/connections.tsx:51-53', true],
  ['Export my data', 'offline', 'app/(tabs)/settings/data.tsx:192', true],
  ['Export my data', 'unavailable', 'app/(tabs)/settings/data.tsx:195', true],
  ['Export my data', 'error', 'app/(tabs)/settings/data.tsx:199', true],
  ['Organization', 'offline', 'app/(tabs)/settings/organization.tsx:89', true],
  ['Organization', 'unavailable', 'app/(tabs)/settings/organization.tsx:92', true],
  ['Organization', 'error', 'app/(tabs)/settings/organization.tsx:98-100', true],
  ['Team', 'offline', 'app/(tabs)/settings/team.tsx:78', true],
  ['Team', 'unavailable', 'app/(tabs)/settings/team.tsx:81', true],
  ['Team', 'error', 'app/(tabs)/settings/team.tsx:87-89', true],
  ['Teams', 'offline', 'app/(tabs)/settings/teams.tsx:97', true],
  ['Teams', 'unavailable', 'app/(tabs)/settings/teams.tsx:100', true],
  ['Teams', 'error', 'app/(tabs)/settings/teams.tsx:106-108', true],
  ['Archived flows', 'offline', 'components/flows/archived-flows.tsx:68', true],
  ['Archived flows', 'unavailable', 'components/flows/archived-flows.tsx:71', true],
  ['Archived flows', 'error', 'components/flows/archived-flows.tsx:77-79', true],
  ['Notifications', 'offline', 'components/notifications/inbox.tsx:120', true],
  ['Notifications', 'unavailable', 'components/notifications/inbox.tsx:126', true],
  ['Notifications', 'error', 'components/notifications/inbox.tsx:135-136', true],
];

/** The shared routing, with the screen's own read refused every time it is sent. */
function refuse(read: RegExp, refusal: Error) {
  routePlatform(platformOperation);
  const routed = platformOperation.getMockImplementation()!;
  platformOperation.mockImplementation((key: string, ...rest: unknown[]) =>
    read.test(key) ? Promise.reject(refusal) : routed(key, ...rest),
  );
}

/** How many times the read was sent. */
const sent = (read: RegExp) => platformOperation.mock.calls.filter(([key]: [string]) => read.test(key)).length;

/** The failure state the screen draws: Home's own, or the shared one by its test id. */
const drawn = (name: Case[0], state: Case[1]) =>
  name === 'Home' ? screen.findByText("Can't reach Autom8x") : screen.findByTestId(STATES[state].testID);

beforeEach(() => {
  platformOperation.mockReset();
});

describe('the failure states: Retry reads the screen again, Back goes back', () => {
  it.each(CASES)('%s, %s (%s)', async (name, state, _site, back) => {
    const { Screen, params, read }: FetchingScreen = SCREENS[name];
    const { refusal, retry, goBack } = STATES[state];
    setMockParams(params ?? {});
    refuse(read, refusal());
    await renderWithProviders(<Screen />, signedInSession);
    expect(await drawn(name, state)).toBeTruthy();
    expect(sent(read)).toBe(1);

    if (back) {
      await fireEvent.press(screen.getByLabelText('Back'));
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
      if (goBack) {
        await fireEvent.press(screen.getByText(BACK_LABEL));
        expect(mockRouter.back).toHaveBeenCalledTimes(2);
      }
    } else {
      // A tab's root has nothing to go back to: no back circle and no "Go back"
      // that would do nothing (build 13's button audit).
      expect(screen.queryByLabelText('Back')).toBeNull();
      expect(screen.queryByText(BACK_LABEL)).toBeNull();
    }

    if (retry) {
      await fireEvent.press(screen.getByText(RETRY_LABEL));
      await waitFor(() => expect(sent(read)).toBe(2));
      // Refused again, it says so again.
      expect(await drawn(name, state)).toBeTruthy();
    } else {
      expect(screen.queryByText(RETRY_LABEL)).toBeNull();
    }
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
