import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import NotificationsScreen from '@/app/(tabs)/(home)/notifications';
import RunDetailScreen from '@/app/(tabs)/(home)/run';
import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import ActivityScreen from '@/app/(tabs)/activity/index';
import { ScopeControl } from '@/components/scope-control';
import { nocturneDark } from '@/constants/theme';
import { resetPushForTests } from '@/hooks/use-push-registration';
import type { SessionContextValue } from '@/hooks/use-session';
import type { Approval, Run } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { fakePlatform, type Sent } from '@/test/fake-platform';
import {
  TEST_WORKSPACE,
  approvalsPayload,
  catalogPayload,
  flowCatalogPayload,
  inboxPayload,
  projectsPayload,
  routePlatform,
  runDetailPayload,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

/**
 * The button audit (build 13, B9): the presses of Home, Activity, the inbox and
 * the scope control that no test pressed, or pressed without holding what they
 * are configured to do — the screen and params they open, the request they send,
 * the dialog they open or close, what changes on screen. A press an existing
 * test already holds that way is not pressed again here.
 */

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));
const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

// The team chosen is kept on the device, per workspace; here, in memory.
const mockStored = new Map<string, string | null>();
jest.mock('@/lib/platform/scope-store', () => ({
  readScope: jest.fn(async (workspaceId: string) => mockStored.get(workspaceId) ?? null),
  writeScope: jest.fn(async (workspaceId: string, projectId: string | null) => {
    mockStored.set(workspaceId, projectId);
  }),
}));
const { writeScope } = jest.requireMock('@/lib/platform/scope-store');

const Haptics = jest.requireMock('expo-haptics');

let keys = 0;
beforeEach(() => {
  platformOperation.mockReset();
  keys = 0;
  newIdempotencyKey.mockReset().mockImplementation((prefix: string) => `${prefix}-${++keys}`);
  mockStored.clear();
  // The inbox's "Not now" holds for the session; no test's may hide the next one's card.
  resetPushForTests();
});

/* ------------------------------------------------------------------ the run page */

describe('the run page: its cancel dialog and View flow (24.4.2)', () => {
  const RUN = 'GET /v1/workspaces/{workspaceId}/runs/{runId}';
  const CANCEL = 'POST /v1/workspaces/{workspaceId}/runs/{runId}/cancel';

  /** run-1 of the flow `email`, running until the platform takes a cancel; the catalog and approvals its page joins. */
  function routeRunningRun() {
    const fake = fakePlatform(platformOperation);
    let status: Run['status'] = 'running';
    const detail = (runId: string) => {
      const payload = runDetailPayload(runId);
      return { ...payload, run: { ...payload.run, subscriptionId: 'email', status } };
    };
    fake.always(RUN, (sent: Sent) => detail(sent.values.runId!));
    fake.always('GET /v1/workspaces/{workspaceId}/automations', catalogPayload());
    fake.always('GET /v1/workspaces/{workspaceId}/approvals', { approvals: [] });
    fake.always(CANCEL, (sent: Sent) => {
      status = 'cancelled';
      return { run: detail(sent.values.runId!).run };
    });
    setMockParams({ runId: 'run-1' });
    return fake;
  }

  it('Keep it running closes the dialog and sends nothing: the run goes on, and Cancel run is still offered', async () => {
    const fake = routeRunningRun();
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Cancel run'));
    expect(within(screen.getByTestId('cancel-run-dialog')).getByText('Cancel this run?')).toBeTruthy();

    await fireEvent.press(screen.getByText('Keep it running'));

    expect(screen.queryByTestId('cancel-run-dialog')).toBeNull();
    expect(fake.to(CANCEL)).toEqual([]);
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('Cancel run')).toBeTruthy();
  });

  it('Cancel run, confirmed, posts the cancel of THIS run in its workspace, closes the dialog, and the page reads the run again: Cancelled, with nothing left to cancel', async () => {
    const fake = routeRunningRun();
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Cancel run'));

    await fireEvent.press(within(screen.getByTestId('cancel-run-dialog')).getByText('Cancel run'));

    expect(await screen.findByText('Cancelled')).toBeTruthy();
    expect(fake.to(CANCEL)).toEqual([
      {
        method: 'POST',
        path: '/v1/workspaces/{workspaceId}/runs/{runId}/cancel',
        values: { workspaceId: TEST_WORKSPACE, runId: 'run-1' },
      },
    ]);
    // Read when the page opened, and again after the cancel landed.
    expect(fake.to(RUN)).toHaveLength(2);
    expect(screen.queryByTestId('cancel-run-dialog')).toBeNull();
    expect(screen.queryByText('Cancel run')).toBeNull();
  });

  it("View flow opens the run's own flow: the flow page with its subscription", async () => {
    routeRunningRun();
    await renderWithProviders(<RunDetailScreen />, signedInSession);

    await fireEvent.press(await screen.findByText('View flow'));

    expect(mockRouter.push.mock.calls).toEqual([[{ pathname: '/(tabs)/flows/detail', params: { flow: 'email' } }]]);
  });
});

/* -------------------------------------------------------------------- Activity */

describe('Activity: a row opens its own run (24.4.4)', () => {
  it("opens the run page, in the Home stack, with THAT row's run — today's row and yesterday's alike", async () => {
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    await renderWithProviders(<ActivityScreen />, signedInSession);

    for (const [line, runId] of [
      ['32 emails routed · 3 escalated', 'run-2'],
      ['Run #52 · failed — Sheets auth expired', 'run-4'],
    ] as const) {
      mockRouter.push.mockClear();
      await fireEvent.press(await screen.findByText(line));
      expect(mockRouter.push.mock.calls).toEqual([[{ pathname: '/(tabs)/(home)/run', params: { runId } }]]);
    }
  });
});

/* ------------------------------------------------------------------- Approvals */

describe("Approvals: Approve and Reject post that approval's decision (DESIGN-CONTRACT, Mutations)", () => {
  const DECISION = 'POST /v1/workspaces/{workspaceId}/approvals/{approvalId}/decision';

  function routeInbox() {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/approvals', approvalsPayload());
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', subscriptionsPayload());
    fake.always('GET /v1/workspaces/{workspaceId}/automations', flowCatalogPayload());
    // The person's role, which the approvals name as able to decide (Gate 24's parity pass, G20).
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    return fake;
  }

  it.each([
    ['Approve', 'approved', 'Approved ✓ — agent resuming'],
    ['Reject', 'rejected', 'Rejected — sent back to sender'],
  ] as const)(
    '%s on the second card posts { decision: "%s" } to ITS approval with a key; refused, the card says why and the retry sends the same key; then the card says "%s"',
    async (label, decision, done) => {
      const fake = routeInbox();
      fake.once(DECISION, () => {
        throw new PlatformError('Service Unavailable', 503);
      });
      fake.always(DECISION, (sent: Sent) => ({
        approval: { ...approvalsPayload().approvals[1]!, status: (sent.body as { decision: Approval['status'] }).decision },
      }));
      await renderWithProviders(<ApprovalsScreen />, signedInSession);

      await fireEvent.press((await screen.findAllByText(label))[1]!);
      expect(await screen.findByText('Service Unavailable')).toBeTruthy();
      // Not decided: its card still offers both answers.
      expect(screen.getAllByText(label)).toHaveLength(3);

      await fireEvent.press(screen.getAllByText(label)[1]!);
      expect(await screen.findByText(done)).toBeTruthy();
      expect(screen.queryByText('Service Unavailable')).toBeNull();
      expect(screen.getAllByText(label)).toHaveLength(2);

      const posted = {
        method: 'POST',
        path: '/v1/workspaces/{workspaceId}/approvals/{approvalId}/decision',
        values: { workspaceId: TEST_WORKSPACE, approvalId: 'apr-1' },
        key: 'decision-1',
        body: { decision },
      };
      expect(fake.to(DECISION)).toEqual([posted, posted]);
    },
  );
});

/* --------------------------------------------------------------- Notifications */

describe('Notifications: read and dismissed on the platform (the owner\'s build 13 decision 3A)', () => {
  const INBOX = 'GET /v1/workspaces/{workspaceId}/notifications';
  const READ = 'POST /v1/workspaces/{workspaceId}/notifications/read';
  const DISMISS = 'POST /v1/workspaces/{workspaceId}/notifications/{notificationId}/dismiss';
  const TITLES = /^(Run held for review|Run failed)$/u;
  /** The unread dot a row draws first, before its glyph and its words: from a line of the row, up to the row. */
  const dotOf = (line: ReturnType<typeof screen.getByText>) => {
    const dot = line.parent!.parent!.children[0];
    if (dot === undefined || typeof dot === 'string') throw new Error('a row draws its dot first');
    return (StyleSheet.flatten(dot.props.style) as { backgroundColor?: string }).backgroundColor;
  };
  const dots = () => screen.getAllByText(TITLES).map(dotOf);
  const UNREAD = nocturneDark.accent;

  /** The inbox and the catalog it names its rows from; the inbox first answers `first`, then `after`. */
  function routeInbox(first: ReturnType<typeof inboxPayload>, after = first) {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/automations', flowCatalogPayload());
    fake.once(INBOX, first);
    fake.always(INBOX, after);
    return fake;
  }

  it('Mark all read saves the rows on screen read, by id (DESIGN-GAPS: "not rows a later re-read brings in"), and draws what the platform answers', async () => {
    const inbox = inboxPayload();
    // By the time the save lands, one more run has failed: the platform lists it, unread.
    const later = { ...inbox.items[3]!, id: 'run:run-later', runId: 'run-later', failureReason: 'Reason run-later' };
    // The re-read after the save is held, so what the screen shows meanwhile can be seen.
    let answer!: () => void;
    const held = new Promise<void>((resolve) => (answer = resolve));
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/automations', flowCatalogPayload());
    fake.once(INBOX, inbox);
    fake.always(INBOX, async () => {
      await held;
      return { items: [later, ...inbox.items.map((item) => ({ ...item, read: true }))], unreadCount: 1 };
    });
    fake.always(READ, { unreadCount: 1 });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    // Three held for review and one failed, every one unread, as the platform lists them.
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);
    expect(dots()).toEqual([UNREAD, UNREAD, UNREAD, UNREAD]);

    await fireEvent.press(screen.getByText('Mark all read'));

    expect(fake.to(READ)).toEqual([
      {
        method: 'POST',
        path: '/v1/workspaces/{workspaceId}/notifications/read',
        values: { workspaceId: TEST_WORKSPACE },
        key: 'notifications-read-1',
        body: { ids: inbox.items.map((item) => item.id) },
      },
    ]);
    // The rows stay while the inbox is re-read: no skeleton to confirm a dot.
    await waitFor(() => expect(fake.to(INBOX)).toHaveLength(2));
    expect(screen.queryByTestId('screen-loading')).toBeNull();
    expect(screen.getAllByText(TITLES)).toHaveLength(4);
    await act(async () => answer());
    expect(await screen.findByText(/Reason run-later/u)).toBeTruthy();
    expect(dotOf(screen.getByText(/Reason run-later/u))).toBe(UNREAD);
    expect(dots()).toEqual([UNREAD, 'transparent', 'transparent', 'transparent', 'transparent']);

    // Nothing unread on screen but the newcomer: a second press names only it.
    await fireEvent.press(screen.getByText('Mark all read'));
    expect(fake.to(READ)[1]?.body).toEqual({ ids: ['run:run-later'] });
  });

  it('Mark all read with every row read sends nothing', async () => {
    const inbox = inboxPayload();
    const fake = routeInbox({ items: inbox.items.map((item) => ({ ...item, read: true })), unreadCount: 0 });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);
    await fireEvent.press(screen.getByText('Mark all read'));
    expect(fake.to(READ)).toEqual([]);
  });

  it('a refused save says so and changes nothing on screen', async () => {
    const fake = routeInbox(inboxPayload());
    fake.once(READ, () => {
      throw new PlatformError('Service Unavailable', 503);
    });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);

    await fireEvent.press(screen.getByText('Mark all read'));

    expect(await screen.findByText('Service Unavailable')).toBeTruthy();
    expect(dots()).toEqual([UNREAD, UNREAD, UNREAD, UNREAD]);
    expect(fake.to(INBOX)).toHaveLength(1);
  });

  it('opening an unread row reads it on the platform and still opens it; a read row sends nothing', async () => {
    const inbox = inboxPayload();
    const failedRead = inbox.items.map((item) => (item.kind === 'run-failed' ? { ...item, read: true } : item));
    const fake = routeInbox(inbox, { items: failedRead, unreadCount: 3 });
    fake.always(READ, { unreadCount: 3 });
    await renderWithProviders(<NotificationsScreen />, signedInSession);

    await fireEvent.press(await screen.findByText('Run failed'));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(home)/run', params: { runId: 'run-4' } });
    expect(fake.to(READ)).toEqual([
      {
        method: 'POST',
        path: '/v1/workspaces/{workspaceId}/notifications/read',
        values: { workspaceId: TEST_WORKSPACE },
        key: 'notifications-read-1',
        body: { ids: ['run:run-4'] },
      },
    ]);
    await waitFor(() => expect(dotOf(screen.getByText('Run failed'))).toBe('transparent'));

    await fireEvent.press(screen.getByText('Run failed'));
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
    expect(fake.to(READ)).toHaveLength(1);
  });

  it('Dismiss sits beside its row, not inside it, so a screen reader reaches it on its own', async () => {
    routeInbox(inboxPayload());
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    // The row is the nearest element a screen reader treats as one: everything in it is read as one.
    let row = (await screen.findByText('Run failed')).parent;
    while (row && row.props.accessible !== true) row = row.parent;
    expect(row).toBeTruthy();
    expect(within(row!).queryByTestId('dismiss-run:run-4')).toBeNull();
    expect(screen.getByTestId('dismiss-run:run-4').props.accessibilityLabel).toBe('Dismiss: Run failed');
  });

  it('Dismiss takes one row off the inbox on the platform, without opening it', async () => {
    const inbox = inboxPayload();
    const [first, ...rest] = inbox.items;
    const fake = routeInbox(inbox, { items: rest, unreadCount: rest.length });
    fake.always(DISMISS, { unreadCount: rest.length });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);

    const dismiss = screen.getByTestId(`dismiss-${first!.id}`);
    expect(dismiss.props.accessibilityLabel).toBe('Dismiss: Run held for review');
    await fireEvent.press(dismiss);

    expect(fake.to(DISMISS)).toEqual([
      {
        method: 'POST',
        path: '/v1/workspaces/{workspaceId}/notifications/{notificationId}/dismiss',
        values: { workspaceId: TEST_WORKSPACE, notificationId: first!.id },
        key: 'notification-dismiss-1',
      },
    ]);
    await waitFor(() => expect(screen.getAllByText(TITLES)).toHaveLength(3));
    expect(screen.queryByTestId(`dismiss-${first!.id}`)).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(fake.to(READ)).toEqual([]);
  });
});

/* ----------------------------------------------------------- the scope control */

describe('the scope control (24.9.2; teams since 24.11.7)', () => {
  const PERSONAL = 'ws-personal';

  /** The signed-in session holding these workspaces, the test workspace active. */
  function holding(workspaces: { id: string; name: string; role: string }[], truncated = false): SessionContextValue {
    if (signedInSession.status !== 'signed-in') throw new Error('fixture');
    return {
      ...signedInSession,
      session: {
        ...signedInSession.session,
        workspaces,
        ...(truncated ? { workspacesTruncated: true } : {}),
      },
    } as SessionContextValue;
  }
  const ACME = { id: TEST_WORKSPACE, name: 'Acme Operations', role: 'owner' };

  /** Two teams in the test workspace; the switcher's own read of the workspace collection. */
  function routeTeams() {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/projects', projectsPayload('Finance', 'Sales'));
    fake.always('GET /v1/workspaces', {
      workspaces: [
        { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' },
        { id: PERSONAL, name: 'Personal', type: 'personal', role: 'owner' },
      ],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    return fake;
  }

  it.each([
    ['two workspaces opens Switch workspace, which lists them', holding([ACME, { id: PERSONAL, name: 'Personal', role: 'owner' }]), true],
    ['a list cut short (workspacesTruncated) opens Switch workspace too', holding([ACME], true), true],
    ['one workspace is not a button: nothing opens', holding([ACME]), false],
  ] as const)('the workspace pill with %s (DESIGN-CONTRACT: the switcher shows with two or more, or a truncated list)', async (_case, session, opens) => {
    routeTeams();
    await renderWithProviders(<ScopeControl />, session);

    await fireEvent.press(await screen.findByLabelText('Workspace: Acme Operations'));

    if (opens) {
      const dialog = await screen.findByTestId('workspace-switcher-dialog');
      expect(within(dialog).getByText('Switch workspace')).toBeTruthy();
      expect(await within(dialog).findByTestId(`workspace-option-${PERSONAL}`)).toBeTruthy();
    } else {
      expect(screen.queryByTestId('workspace-switcher-dialog')).toBeNull();
      // A press with no handler gives no tick (D7).
      expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['All teams', 'project-1', 'scope-option-all', 'Team: All teams', [[TEST_WORKSPACE, null]]],
    ['a team', null, 'scope-option-project-2', 'Team: Sales', [[TEST_WORKSPACE, 'project-2']]],
    ['Done', 'project-1', 'Done', 'Team: Finance', []],
  ] as const)(
    'the Show dialog: %s closes it, and the pill says the scope it leaves — kept for this workspace when it changed',
    async (_row, before, press, pill, kept) => {
      if (before) mockStored.set(TEST_WORKSPACE, before);
      routeTeams();
      await renderWithProviders(<ScopeControl />, signedInSession);
      await fireEvent.press(await screen.findByLabelText(before ? 'Team: Finance' : 'Team: All teams'));
      const dialog = screen.getByTestId('scope-team-dialog');

      await fireEvent.press(press === 'Done' ? within(dialog).getByText('Done') : within(dialog).getByTestId(press));

      expect(screen.queryByTestId('scope-team-dialog')).toBeNull();
      expect(screen.getByLabelText(pill)).toBeTruthy();
      expect(writeScope.mock.calls).toEqual(kept);
    },
  );
});
