import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import RunDetailScreen from '@/app/(tabs)/(home)/run';
import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import AddFlowScreen from '@/app/(tabs)/flows/add';
import ArchivedFlowsScreen from '@/app/(tabs)/flows/archived';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import SetupScreen from '@/app/(tabs)/flows/setup';
import AccountScreen from '@/app/(tabs)/settings/account';
import BillingScreen from '@/app/(tabs)/settings/billing';
import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import DataExportScreen from '@/app/(tabs)/settings/data';
import OrganizationScreen from '@/app/(tabs)/settings/organization';
import SupportScreen from '@/app/(tabs)/settings/support';
import TeamScreen from '@/app/(tabs)/settings/team';
import TeamsScreen from '@/app/(tabs)/settings/teams';
import {
  TEST_WORKSPACE,
  flowCatalogPayload,
  planSubscriptionsPayload,
  routePlatform,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
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
 * Every pushed page's way back: the circle at the top of the page, loaded,
 * goes back — and nowhere else (build 13, B9). A failure state's circle is
 * held with its state (presses-patterns-failure-states), and an empty
 * standard's where its screen is tested; the inbox's own is held in
 * tab-screens ("is the inbox itself on the Notifications page").
 */

type Route = readonly [RegExp, unknown];

/** The shared routing, these requests answered first. */
function route(...routes: Route[]) {
  routePlatform(platformOperation);
  const routed = platformOperation.getMockImplementation()!;
  platformOperation.mockImplementation((key: string, ...rest: unknown[]) => {
    const hit = routes.find(([pattern]) => pattern.test(key));
    return hit ? Promise.resolve(hit[1]) : routed(key, ...rest);
  });
}

const workspaces = (type: 'organization' | 'personal', role: 'owner' | 'member') => ({
  workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type, role }],
  activeWorkspaceId: TEST_WORKSPACE,
});
const FINANCE = {
  id: 'p1',
  workspaceId: TEST_WORKSPACE,
  name: 'Finance',
  type: 'Finance',
  status: 'active',
  viewerRole: 'owner',
  createdAt: '2026-09-01T00:00:00Z',
};
const ARCHIVED = { ...subscriptionsPayload().subscriptions[0]!, id: 'gone', name: 'Old intake', status: 'archived' };

const PAGES: {
  page: string;
  site: string;
  Screen: React.ComponentType;
  params?: Record<string, string>;
  routes?: Route[];
  /** Something only the loaded page draws. */
  loaded: () => Promise<unknown>;
}[] = [
  {
    page: 'Run detail',
    site: 'app/(tabs)/(home)/run.tsx:223',
    Screen: RunDetailScreen,
    params: { runId: 'run-0' },
    loaded: () => screen.findByText('Duration'),
  },
  {
    page: 'Approvals',
    site: 'app/(tabs)/activity/approvals.tsx:217',
    Screen: ApprovalsScreen,
    loaded: () => screen.findByText('Needs review'),
  },
  {
    page: 'Add a flow',
    site: 'app/(tabs)/flows/add.tsx:110',
    Screen: AddFlowScreen,
    routes: [[/\/subscriptions$/u, planSubscriptionsPayload()]],
    loaded: () => screen.findByText(/^Prebuilt flows, set up in minutes\./u),
  },
  {
    page: 'Flow detail',
    site: 'app/(tabs)/flows/detail.tsx:210',
    Screen: WorkflowDetailScreen,
    params: { flow: 'invoice' },
    routes: [[/\/automations$/u, flowCatalogPayload()]],
    loaded: () => screen.findByTestId('archive-flow'),
  },
  {
    page: 'Setup',
    site: 'app/(tabs)/flows/setup.tsx:298',
    Screen: SetupScreen,
    params: { template: 'tpl.3' },
    loaded: () => screen.findByText('One-time setup'),
  },
  {
    page: 'Account',
    site: 'app/(tabs)/settings/account.tsx:118',
    Screen: AccountScreen,
    routes: [[/^\/v1\/auth\/identities$/u, { identities: [{ provider: 'google', primary: true }] }]],
    loaded: () => screen.findByText('LINKED ACCOUNTS'),
  },
  {
    page: 'Billing',
    site: 'app/(tabs)/settings/billing.tsx:250',
    Screen: BillingScreen,
    routes: [
      [/^\/v1\/workspaces$/u, workspaces('organization', 'member')],
      [/^\/v1\/plans$/u, { plans: [] }],
    ],
    loaded: () => screen.findByText('Billing is managed by the owners and admins of this workspace.'),
  },
  {
    page: 'Connections',
    site: 'app/(tabs)/settings/connections.tsx:75',
    Screen: ConnectionsScreen,
    loaded: () => screen.findByText('HubSpot'),
  },
  {
    page: 'Export my data',
    site: 'app/(tabs)/settings/data.tsx:213',
    Screen: DataExportScreen,
    routes: [[/^\/v1\/workspaces$/u, workspaces('organization', 'owner')]],
    loaded: () => screen.findByText('Export my data'),
  },
  {
    page: 'Organization',
    site: 'app/(tabs)/settings/organization.tsx:135',
    Screen: OrganizationScreen,
    routes: [[/^\/v1\/workspaces$/u, workspaces('organization', 'member')]],
    loaded: () => screen.findByText('Your organization workspace'),
  },
  {
    page: 'Support',
    site: 'app/(tabs)/settings/support.tsx:76',
    Screen: SupportScreen,
    loaded: () => screen.findByText('CONTACT US'),
  },
  {
    page: 'Team',
    site: 'app/(tabs)/settings/team.tsx:109',
    Screen: TeamScreen,
    params: { projectId: 'p1', workspaceId: TEST_WORKSPACE },
    routes: [
      [/^\/v1\/workspaces$/u, workspaces('personal', 'owner')],
      [/\/projects\/p1$/u, { project: FINANCE }],
    ],
    loaded: () => screen.findByText('Delete team'),
  },
  {
    page: 'Teams',
    site: 'app/(tabs)/settings/teams.tsx:156',
    Screen: TeamsScreen,
    routes: [
      [/^\/v1\/workspaces$/u, workspaces('organization', 'owner')],
      [/\/projects$/u, { projects: [FINANCE] }],
      [/\/project-directory$/u, { projects: [] }],
    ],
    loaded: () => screen.findByTestId('team-p1'),
  },
  {
    page: 'Archived flows',
    site: 'components/flows/archived-flows.tsx:105',
    Screen: ArchivedFlowsScreen,
    routes: [
      [/\/automations$/u, flowCatalogPayload()],
      [/\/subscriptions(\?status=archived)?$/u, { subscriptions: [...subscriptionsPayload().subscriptions, ARCHIVED] }],
    ],
    loaded: () => screen.findByText('Old intake'),
  },
];

beforeEach(() => {
  platformOperation.mockReset();
});

describe("a pushed page's Back circle goes back", () => {
  it.each(PAGES)('$page ($site)', async ({ Screen, params, routes, loaded }) => {
    setMockParams(params ?? {});
    route(...(routes ?? []));
    await renderWithProviders(<Screen />, signedInSession);
    expect(await loaded()).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Back'));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });
});
