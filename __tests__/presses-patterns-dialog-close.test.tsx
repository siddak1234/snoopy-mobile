import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import SetupScreen from '@/app/(tabs)/flows/setup';
import SettingsScreen from '@/app/(tabs)/settings';
import AccountScreen from '@/app/(tabs)/settings/account';
import ConnectionsScreen from '@/app/(tabs)/settings/connections';
import OrganizationScreen from '@/app/(tabs)/settings/organization';
import TeamScreen from '@/app/(tabs)/settings/team';
import TeamsScreen from '@/app/(tabs)/settings/teams';
import { ScopeControl } from '@/components/scope-control';
import type { SessionContextValue } from '@/hooks/use-session';
import { PlatformError } from '@/lib/platform/problem';
import {
  TEST_WORKSPACE,
  flowCatalogPayload,
  projectsPayload,
  routePlatform,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));
// The run form's file field reads the document picker and the file system; nothing here picks a file.
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: {} } }));
// Account links in the system browser; nothing here links.
jest.mock('@/lib/platform/identity-link', () => ({ linkIdentity: jest.fn() }));

const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Every dialog's Cancel and Close (build 13, B9): the dialog closes and nothing
 * is sent — no change, and no read of the page either, since nothing changed —
 * and the page stays where it was. A Cancel that steps back inside its dialog
 * (Remove's question) returns to the step before. A close a test already holds
 * is not repeated here: Cancel this run?'s Keep it running and the scope's Show
 * › Done (presses-home-activity), Add members › Done (presses-settings).
 */

type Route = readonly [RegExp, unknown];

/** The shared routing, these requests answered first — refused, when the answer is an error. */
function route(...routes: Route[]) {
  routePlatform(platformOperation);
  const routed = platformOperation.getMockImplementation()!;
  platformOperation.mockImplementation((key: string, ...rest: unknown[]) => {
    const hit = routes.find(([pattern]) => pattern.test(key));
    if (!hit) return routed(key, ...rest);
    return hit[1] instanceof Error ? Promise.reject(hit[1]) : Promise.resolve(hit[1]);
  });
}

/** Whatever the press set going lands: a request it sent would be in the record by then. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const press = async (text: string) => fireEvent.press(await screen.findByText(text));
const pressId = async (testID: string) => fireEvent.press(await screen.findByTestId(testID));
const pressIn = async (dialog: string, text: string) =>
  fireEvent.press(within(await screen.findByTestId(dialog)).getByText(text));

/* ───────────────────────────── the pages, loaded ───────────────────────────── */

const PERSONAL = 'ws-personal';
const org = (role: 'owner' | 'admin' | 'member') => ({
  workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role }],
  activeWorkspaceId: TEST_WORKSPACE,
});
const person = (userId: string, role: string, displayName: string) => ({
  workspaceId: TEST_WORKSPACE,
  projectId: 'p1',
  userId,
  role,
  displayName,
  email: `${displayName.toLowerCase()}@acme.co`,
  createdAt: '2026-09-01T00:00:00Z',
});
const finance = (viewerRole: 'owner' | 'admin' | 'member') => ({
  id: 'p1',
  workspaceId: TEST_WORKSPACE,
  name: 'Finance',
  type: 'Finance',
  status: 'active',
  viewerRole,
  createdAt: '2026-09-01T00:00:00Z',
});

/** The active organization, managed by its owner: a domain, three members, one person asking to join. */
async function organization() {
  route(
    [/^\/v1\/workspaces$/u, org('owner')],
    [/\/members$/u, { members: [person('u1', 'admin', 'Alex'), person('u2', 'owner', 'Ben'), person('u3', 'member', 'Carol')] }],
    [
      /\/domains$/u,
      {
        domains: [
          {
            id: 'domain-1',
            workspaceId: TEST_WORKSPACE,
            domain: 'acme.co',
            registrableDomain: 'acme.co',
            status: 'verified',
            joinPolicy: 'approval',
            discoveryEnabled: true,
            verificationRecordName: '_autom8x.acme.co',
            createdAt: '2026-09-01T00:00:00Z',
          },
        ],
      },
    ],
    [/\/join-requests$/u, { requests: [{ id: 'jr-1', workspaceId: TEST_WORKSPACE, userId: 'u9', status: 'pending', createdAt: '2026-09-29T00:00:00Z' }] }],
  );
  await renderWithProviders(<OrganizationScreen />, signedInSession);
  await screen.findByText('ORGANIZATION DETAILS');
}

/** A team of the organization, seen by its signed-in u1 (Alex) in this role: Ben owns it, Carol is on it, Erin asks to join. */
async function team(viewerRole: 'owner' | 'member') {
  route(
    [/^\/v1\/workspaces$/u, org('member')],
    [/\/projects\/p1$/u, { project: finance(viewerRole) }],
    [/\/projects\/p1\/memberships$/u, { memberships: [person('u2', 'owner', 'Ben'), person('u1', viewerRole === 'owner' ? 'admin' : 'member', 'Alex'), person('u3', 'member', 'Carol')] }],
    [/\/members$/u, { members: [person('u4', 'member', 'Dana')] }],
    [/\/projects\/p1\/access-requests$/u, { requests: [{ ...person('u5', 'member', 'Erin'), id: 'r1', status: 'pending', createdAt: '2026-10-02T00:00:00Z' }] }],
  );
  setMockParams({ projectId: 'p1', workspaceId: TEST_WORKSPACE });
  await renderWithProviders(<TeamScreen />, signedInSession);
  await screen.findByText('MEMBERS · 3');
}

/** Teams, for an owner of the organization: Finance, and Data asked to join. */
async function teams() {
  route(
    [/^\/v1\/workspaces$/u, org('owner')],
    [/\/projects$/u, { projects: [finance('owner')] }],
    [
      /\/project-directory$/u,
      { projects: [{ id: 'p5', workspaceId: TEST_WORKSPACE, name: 'Data', type: 'Data', status: 'active', access: 'requested', createdAt: '2026-09-01T00:00:00Z' }] },
    ],
  );
  await renderWithProviders(<TeamsScreen />, signedInSession);
  await screen.findByTestId('team-p1');
}

/** Account: Google is the primary sign-in, Apple a second one. */
async function account() {
  route([/^\/v1\/auth\/identities$/u, { identities: [{ provider: 'google', primary: true }, { provider: 'apple', primary: false }] }]);
  await renderWithProviders(<AccountScreen />, signedInSession);
  await screen.findByText('LINKED ACCOUNTS');
}

/**
 * Invoice triage's page with every action its flow can offer: start controls on
 * the page (a note; 25.8.3), Move to v2 (the catalog has a newer version), a webhook
 * address (webhook-started, seen by an owner) — none issued yet — and Set up.
 */
async function flow() {
  const catalog = flowCatalogPayload();
  catalog.automations = catalog.automations.map((entry) =>
    entry.templateId === 'tplflow.invoice' ? { ...entry, version: 2 } : entry,
  );
  const note = { key: 'note', title: 'Note', description: 'What to do', control: 'text', required: true };
  const rows = subscriptionsPayload().subscriptions.map((row) =>
    row.id === 'invoice' ? { ...row, runInput: [note], triggerKind: 'webhook' } : row,
  );
  route(
    [/\/automations$/u, catalog],
    [/\/subscriptions$/u, { subscriptions: rows }],
    [/\/webhook$/u, new PlatformError('Not Found', 404)],
  );
  setMockParams({ flow: 'invoice' });
  await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
  await screen.findByTestId('archive-flow');
}

const GMAIL = {
  providers: [{ providerId: 'gmail', displayName: 'Gmail', description: 'Send mail as you.', scopes: [], authType: 'oauth2', icon: 'envelope' }],
};
const GMAIL_CONNECTED = {
  connections: [
    {
      id: 'c1',
      providerId: 'gmail',
      workspaceId: TEST_WORKSPACE,
      externalAccount: { id: 'a1', displayName: 'alex@acme.co' },
      status: 'connected',
      requiredScopes: [],
      grantedScopes: [],
      usedByCount: 1,
    },
  ],
};

/** The signed-in person in the organization and their personal workspace: the switcher is offered. */
const twoWorkspaces = (): SessionContextValue => {
  if (signedInSession.status !== 'signed-in') throw new Error('fixture');
  return {
    ...signedInSession,
    session: {
      ...signedInSession.session,
      workspaces: [
        { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' },
        { id: PERSONAL, name: 'Personal', type: 'personal', role: 'owner' },
      ],
    },
  } as SessionContextValue;
};

/* ───────────────────────────── the dialogs ───────────────────────────── */

type DialogCase = {
  /** The dialog, and the press that closes it. */
  name: string;
  site: string;
  /** Loads the page and opens the dialog. */
  open: () => Promise<unknown>;
  dialog: string;
  close: string;
  /** For a Cancel that steps back inside its dialog: what the dialog shows again, and the question it leaves. */
  returnsTo?: { shows: string; leaves: string };
};

const CASES: DialogCase[] = [
  {
    name: 'Setup › Create a team: Cancel',
    site: 'app/(tabs)/flows/setup.tsx:435',
    open: async () => {
      route();
      setMockParams({ template: 'tpl.3' });
      await renderWithProviders(<SetupScreen />, signedInSession);
      await press('Create a team');
    },
    dialog: 'create-team-dialog',
    close: 'Cancel',
  },
  {
    name: 'Account › Unlink Apple?: Cancel',
    site: 'app/(tabs)/settings/account.tsx:176',
    open: async () => {
      await account();
      await pressId('unlink-apple');
    },
    dialog: 'unlink-dialog',
    close: 'Cancel',
  },
  {
    name: 'Account › Delete account?: Cancel',
    site: 'app/(tabs)/settings/account.tsx:195',
    open: async () => {
      await account();
      await press('Delete Account');
    },
    dialog: 'delete-account-dialog',
    close: 'Cancel',
  },
  {
    name: 'Organization › Organization name: Cancel',
    site: 'app/(tabs)/settings/organization.tsx:187',
    open: async () => {
      await organization();
      await pressId('organization-name');
    },
    dialog: 'rename-organization-dialog',
    close: 'Cancel',
  },
  {
    name: 'Organization › a domain: Close',
    site: 'components/organization/org-domains.tsx:101',
    open: async () => {
      await organization();
      await pressId('domain-acme.co');
    },
    dialog: 'domain-dialog',
    close: 'Close',
  },
  {
    name: 'Organization › Add domain, nothing claimed: Cancel',
    site: 'components/organization/org-domains.tsx:260',
    open: async () => {
      await organization();
      await pressId('add-domain');
    },
    dialog: 'add-domain-dialog',
    close: 'Cancel',
  },
  {
    name: 'Organization › Remove Carol?: Cancel',
    site: 'components/organization/org-people.tsx:130',
    open: async () => {
      await organization();
      await pressId('member-u3');
    },
    dialog: 'remove-member-dialog',
    close: 'Cancel',
  },
  {
    name: 'Organization › Join request: Cancel',
    site: 'components/organization/org-people.tsx:141',
    open: async () => {
      await organization();
      await pressId('join-request-jr-1');
    },
    dialog: 'join-request-dialog',
    close: 'Cancel',
  },
  {
    name: 'Team › Delete "Finance"?: Cancel',
    site: 'app/(tabs)/settings/team.tsx:170',
    open: async () => {
      await team('owner');
      await press('Delete team');
    },
    dialog: 'delete-team-dialog',
    close: 'Cancel',
  },
  {
    name: 'Team › Leave “Finance”?: Cancel',
    site: 'app/(tabs)/settings/team.tsx:189',
    open: async () => {
      await team('member');
      await press('Leave team');
    },
    dialog: 'leave-team-dialog',
    close: 'Cancel',
  },
  {
    name: 'Team › a member: Close',
    site: 'components/teams/team-members.tsx:111',
    open: async () => {
      await team('owner');
      await pressId('team-member-u3');
    },
    dialog: 'team-member-dialog',
    close: 'Close',
  },
  {
    name: 'Team › a member › Remove Carol from this team?: Cancel',
    site: 'components/teams/team-members.tsx:192',
    open: async () => {
      await team('owner');
      await pressId('team-member-u3');
      await pressIn('team-member-dialog', 'Remove');
      await screen.findByText('Remove Carol from this team?');
    },
    dialog: 'team-member-dialog',
    close: 'Cancel',
    returnsTo: { shows: 'Close', leaves: 'Remove Carol from this team?' },
  },
  {
    name: 'Team › their own row, Leave this team?: Cancel',
    site: 'components/teams/team-members.tsx:127',
    open: async () => {
      await team('owner');
      await pressId('team-member-u1');
    },
    dialog: 'leave-team-row-dialog',
    close: 'Cancel',
  },
  {
    name: 'Team › Request to join: Cancel',
    site: 'components/teams/team-requests.tsx:68',
    open: async () => {
      await team('owner');
      await pressId('team-request-r1');
    },
    dialog: 'team-request-dialog',
    close: 'Cancel',
  },
  {
    name: 'Teams › Create a team: Cancel',
    site: 'app/(tabs)/settings/teams.tsx:125',
    open: async () => {
      await teams();
      await press('Create a team');
    },
    dialog: 'create-team-dialog',
    close: 'Cancel',
  },
  {
    name: 'Teams › Withdraw your request to join Data?: Cancel',
    site: 'app/(tabs)/settings/teams.tsx:262',
    open: async () => {
      await teams();
      await pressId('requested-p5');
    },
    dialog: 'withdraw-request-dialog',
    close: 'Cancel',
  },
  {
    name: 'Flow › Set up: Cancel',
    site: 'components/automations/automation-actions.tsx:177',
    open: async () => {
      await flow();
      await pressId('manage-setup');
    },
    dialog: 'setup-dialog',
    close: 'Cancel',
  },
  {
    name: 'Flow › Webhook address: Close',
    site: 'components/automations/automation-actions.tsx:189',
    open: async () => {
      await flow();
      await pressId('manage-webhook');
      // Its address is read as it opens: none yet.
      await screen.findByText('This flow has no address yet.');
    },
    dialog: 'webhook-dialog',
    close: 'Close',
  },
  {
    name: 'Flow › Archive Invoice triage?: Cancel',
    site: 'components/automations/automation-actions.tsx:200',
    open: async () => {
      await flow();
      await pressId('archive-flow');
    },
    dialog: 'archive-dialog',
    close: 'Cancel',
  },
  {
    name: 'Flow › Move Invoice triage to v2?: Cancel',
    site: 'components/automations/move-version.tsx:145',
    open: async () => {
      await flow();
      await press('Move to v2');
    },
    dialog: 'move-version-dialog',
    close: 'Cancel',
  },
  {
    name: 'Connections › Connect HubSpot: Cancel',
    site: 'components/settings/connections-card.tsx:228',
    open: async () => {
      route();
      await renderWithProviders(<ConnectionsScreen />, signedInSession);
      await press('HubSpot');
    },
    dialog: 'connection-dialog',
    close: 'Cancel',
  },
  {
    name: 'Connections › Replace alex@acme.co?: Cancel',
    site: 'components/settings/connections-card.tsx:223',
    open: async () => {
      route([/^\/v1\/connections\/providers$/u, GMAIL], [/\/connections$/u, GMAIL_CONNECTED]);
      await renderWithProviders(<ConnectionsScreen />, signedInSession);
      await press('Gmail');
      await pressIn('connection-dialog', 'Replace account');
      await screen.findByText('Replace alex@acme.co?');
    },
    dialog: 'replace-account-dialog',
    close: 'Cancel',
  },
  {
    name: 'Settings › Switch workspace: Cancel',
    site: 'components/settings/workspace-switcher.tsx:140',
    open: async () => {
      route([
        /^\/v1\/workspaces$/u,
        {
          workspaces: [
            { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' },
            { id: PERSONAL, name: 'Personal', type: 'personal', role: 'owner' },
          ],
          activeWorkspaceId: TEST_WORKSPACE,
        },
      ]);
      await renderWithProviders(<SettingsScreen />, twoWorkspaces());
      await pressId('workspace-switcher-row');
      // The workspaces are read as it opens.
      await screen.findByTestId(`workspace-option-${PERSONAL}`);
    },
    dialog: 'workspace-switcher-dialog',
    close: 'Cancel',
  },
  {
    name: 'Scope › Show › Create a team: Cancel',
    site: 'components/scope-control.tsx:138',
    open: async () => {
      route([/\/projects$/u, projectsPayload('Finance')]);
      await renderWithProviders(<ScopeControl />, signedInSession);
      await fireEvent.press(await screen.findByLabelText('Team: All teams'));
      await pressId('scope-create-team');
    },
    dialog: 'create-team-dialog',
    close: 'Cancel',
  },
];

beforeEach(() => {
  platformOperation.mockReset();
});

describe("a dialog's Cancel or Close closes it and sends nothing", () => {
  it.each(CASES)('$name ($site)', async ({ open, dialog, close, returnsTo }) => {
    await open();
    const shown = await screen.findByTestId(dialog);
    await settle();
    const before = platformOperation.mock.calls.length;

    await fireEvent.press(within(shown).getByText(close));

    if (returnsTo) {
      expect(within(screen.getByTestId(dialog)).getByText(returnsTo.shows)).toBeTruthy();
      expect(screen.queryByText(returnsTo.leaves)).toBeNull();
    } else {
      await waitFor(() => expect(screen.queryByTestId(dialog)).toBeNull());
    }
    await settle();
    expect(platformOperation.mock.calls.slice(before)).toEqual([]);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });
});
