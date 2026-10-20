import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import NotificationsScreen from '@/app/(tabs)/(home)/notifications';
import RunDetailScreen from '@/app/(tabs)/activity/run';
import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import ActivityScreen from '@/app/(tabs)/activity/index';
import { ScopeIcons } from '@/components/scope-control';
import { nocturneDark, status, typeScale } from '@/constants/theme';
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
  it("opens the run page, in Activity's stack, with THAT row's run — today's row and yesterday's alike", async () => {
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    await renderWithProviders(<ActivityScreen />, signedInSession);

    for (const [line, runId] of [
      ['32 emails routed · 3 escalated', 'run-2'],
      ['Run #52 · failed — Sheets auth expired', 'run-4'],
    ] as const) {
      mockRouter.push.mockClear();
      await fireEvent.press(await screen.findByText(line));
      expect(mockRouter.push.mock.calls).toEqual([[{ pathname: '/(tabs)/activity/run', params: { runId } }]]);
    }
  });
});

/* ------------------------------------------------------------------- Approvals */

describe("Approvals: Approve and Deny post that approval's decision (DESIGN-CONTRACT, Mutations)", () => {
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
    ['Approve', 'approved'],
    ['Deny', 'rejected'],
  ] as const)(
    '%s on the second card posts { decision: "%s" } to ITS approval with a key; refused, the card says why and the retry sends the same key; then the card leaves',
    async (label, decision) => {
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
      await waitFor(() => expect(screen.queryByTestId('approval-apr-1')).toBeNull());
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

/**
 * Needs review after a decision (round 24 P7; the owner's build 23 F11: "After
 * approving why do i still see the card. Shiuldnt that card slide away or
 * dissapear. If none are left it should take me back to activity main page").
 */
describe('Needs review: a decided card leaves (round 24, P7)', () => {
  const DECISION = 'POST /v1/workspaces/{workspaceId}/approvals/{approvalId}/decision';

  function routeTwo(count: number) {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/approvals', { approvals: approvalsPayload().approvals.slice(0, count) });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', subscriptionsPayload());
    fake.always('GET /v1/workspaces/{workspaceId}/automations', flowCatalogPayload());
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    fake.always(DECISION, (sent: Sent) => ({
      approval: { ...approvalsPayload().approvals[0]!, status: (sent.body as { decision: Approval['status'] }).decision },
    }));
    return fake;
  }

  it('deciding the only card goes back to Activity', async () => {
    const fake = routeTwo(1);
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('decide-apr-0-approve'));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/activity'));
    expect(fake.to(DECISION)).toHaveLength(1);
    expect(screen.queryByTestId('approval-apr-0')).toBeNull();
    // Not the empty state of a queue that was empty on arrival.
    expect(screen.queryByText('Go back')).toBeNull();
  });

  it('deciding one of two: that card goes, the other stays — and its pill never says Pending beside the decision', async () => {
    jest.useFakeTimers();
    try {
      routeTwo(2);
      await renderWithProviders(<ApprovalsScreen />, signedInSession);
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });
      const first = await screen.findByTestId('approval-apr-0');
      expect(within(first).getByText('Pending')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('decide-apr-0-deny'));
      // Saved: before it leaves, its pill says how it was decided, and its buttons are gone.
      await act(async () => {
        await Promise.resolve();
      });
      const leaving = screen.getByTestId('approval-apr-0');
      expect(within(leaving).getByText('Denied')).toBeTruthy();
      expect(within(leaving).queryByText('Pending')).toBeNull();
      expect(within(leaving).queryByText('Approve')).toBeNull();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(300);
      });
      expect(screen.queryByTestId('approval-apr-0')).toBeNull();
      expect(within(screen.getByTestId('approval-apr-1')).getByText('Pending')).toBeTruthy();
      expect(screen.getByTestId('approvals-count').props.children).toBe(1);
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a decided pill is the decision\'s colour: Approved ok, Denied the error tone', async () => {
    jest.useFakeTimers();
    try {
      routeTwo(2);
      await renderWithProviders(<ApprovalsScreen />, signedInSession);
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });
      await fireEvent.press(await screen.findByTestId('decide-apr-1-approve'));
      await act(async () => {
        await Promise.resolve();
      });
      const pill = within(screen.getByTestId('approval-apr-1')).getByText('Approved');
      expect(StyleSheet.flatten(pill.props.style).color).toBe(status.ok);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the warning callout\'s icon sits centred on its first line', async () => {
    routeTwo(1);
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    await screen.findByTestId('approval-apr-0');
    const icon = screen.getByTestId('callout-icon-apr-0', { includeHiddenElements: true });
    expect(StyleSheet.flatten(icon.props.style).marginTop).toBe((typeScale.body.lineHeight - 16) / 2);
  });
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

  /**
   * Clear all (round 24 P8; the owner's build 23 F6: "The mark all as read does
   * not clear. Rename it to clear all and it should wipe the notifications").
   */
  const CLEAR = 'POST /v1/workspaces/{workspaceId}/notifications/clear';

  it('Clear all: the rows leave at the tap, the platform is asked once with a key, and the empty inbox is drawn', async () => {
    let answer!: () => void;
    const held = new Promise<void>((resolve) => (answer = resolve));
    const fake = routeInbox(inboxPayload(), { items: [], unreadCount: 0 });
    fake.always(CLEAR, async () => {
      await held;
      return { unreadCount: 0 };
    });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);
    expect(screen.queryByText('Mark all read')).toBeNull();

    await fireEvent.press(screen.getByTestId('inbox-clear-all'));
    // Gone before the platform answers.
    expect(screen.queryAllByText(TITLES)).toHaveLength(0);
    expect(fake.to(CLEAR)).toEqual([
      { method: 'POST', path: '/v1/workspaces/{workspaceId}/notifications/clear', values: { workspaceId: TEST_WORKSPACE }, key: 'notifications-clear-1' },
    ]);
    await act(async () => answer());
    // The inbox read again: empty.
    await waitFor(() => expect(fake.to(INBOX)).toHaveLength(2));
    expect(screen.queryAllByText(TITLES)).toHaveLength(0);
    expect(fake.to(CLEAR)).toHaveLength(1);
  });

  it('Clear all refused: the rows come back, with the reason', async () => {
    const fake = routeInbox(inboxPayload());
    fake.once(CLEAR, () => {
      throw new PlatformError('Service Unavailable', 503);
    });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);

    await fireEvent.press(screen.getByTestId('inbox-clear-all'));

    expect(await screen.findByText('Service Unavailable')).toBeTruthy();
    expect(screen.getAllByText(TITLES)).toHaveLength(4);
    expect(dots()).toEqual([UNREAD, UNREAD, UNREAD, UNREAD]);
    expect(fake.to(INBOX)).toHaveLength(1);
  });

  it('Clear all pressed again after a refusal is a new intent: a new key, never the refused one', async () => {
    const fake = routeInbox(inboxPayload(), { items: [], unreadCount: 0 });
    fake.once(CLEAR, () => {
      throw new PlatformError('Service Unavailable', 503);
    });
    fake.always(CLEAR, { unreadCount: 0 });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);

    await fireEvent.press(screen.getByTestId('inbox-clear-all'));
    expect(await screen.findByText('Service Unavailable')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('inbox-clear-all'));

    await waitFor(() => expect(fake.to(CLEAR)).toHaveLength(2));
    expect(fake.to(CLEAR).map((entry) => entry.key)).toEqual(['notifications-clear-1', 'notifications-clear-2']);
    await waitFor(() => expect(fake.to(INBOX)).toHaveLength(2));
    expect(screen.queryAllByText(TITLES)).toHaveLength(0);
  });

  it('Clear all clears the rows it was pressed on: one that arrives after is listed', async () => {
    const inbox = inboxPayload();
    const later = { ...inbox.items[3]!, id: 'run:run-later', runId: 'run-later', failureReason: 'Reason run-later' };
    const fake = routeInbox(inbox, { items: [later], unreadCount: 1 });
    fake.always(CLEAR, { unreadCount: 0 });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);
    await fireEvent.press(screen.getByTestId('inbox-clear-all'));
    expect(await screen.findByText(/Reason run-later/u)).toBeTruthy();
    expect(screen.getAllByText(TITLES)).toHaveLength(1);
  });

  it('opening an unread row reads it on the platform and still opens it; a read row sends nothing', async () => {
    const inbox = inboxPayload();
    const failedRead = inbox.items.map((item) => (item.kind === 'run-failed' ? { ...item, read: true } : item));
    const fake = routeInbox(inbox, { items: failedRead, unreadCount: 3 });
    fake.always(READ, { unreadCount: 3 });
    await renderWithProviders(<NotificationsScreen />, signedInSession);

    await fireEvent.press(await screen.findByText('Run failed'));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/activity/run', params: { runId: 'run-4', returnTo: 'home' } }, { withAnchor: true });
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

  // Since Build 22 the scope is the two circles on every page (F1–F3): the
  // workspace circle opens the switcher with any number of workspaces, as
  // Home's always did — only the card can name the one there is. ~~The pill's
  // rule (two or more, or a cut list)~~ went with the pills.
  it.each([
    ['two workspaces', holding([ACME, { id: PERSONAL, name: 'Personal', role: 'owner' }])],
    ['a list cut short (workspacesTruncated)', holding([ACME], true)],
    ['one workspace', holding([ACME])],
  ] as const)('the workspace circle with %s opens Switch workspace, which lists them', async (_case, session) => {
    routeTeams();
    await renderWithProviders(<ScopeIcons testIDPrefix="title-scope" />, session);

    await fireEvent.press(await screen.findByLabelText('Workspace: Acme Operations'));

    const dialog = await screen.findByTestId('workspace-switcher-menu');
    expect(within(dialog).getByText('WORKSPACE')).toBeTruthy();
    expect(await within(dialog).findByTestId(`workspace-option-${PERSONAL}`)).toBeTruthy();
  });

  it.each([
    ['All departments', 'project-1', 'scope-option-all', 'Department: All departments', [[TEST_WORKSPACE, null]]],
    ['a team', null, 'scope-option-project-2', 'Department: Sales', [[TEST_WORKSPACE, 'project-2']]],
    ['a tap outside', 'project-1', 'scope-team-backdrop', 'Department: Finance', []],
  ] as const)(
    'the Department drop-down: %s closes it, and the department circle says the scope it leaves — kept for this workspace when it changed',
    async (_row, before, press, pill, kept) => {
      if (before) mockStored.set(TEST_WORKSPACE, before);
      routeTeams();
      await renderWithProviders(<ScopeIcons testIDPrefix="title-scope" />, signedInSession);
      await fireEvent.press(await screen.findByLabelText(before ? 'Department: Finance' : 'Department: All departments'));
      const dialog = screen.getByTestId('scope-team-menu');

      await fireEvent.press(press === 'scope-team-backdrop' ? screen.getByTestId(press) : within(dialog).getByTestId(press));

      expect(screen.queryByTestId('scope-team-menu')).toBeNull();
      expect(screen.getByLabelText(pill)).toBeTruthy();
      expect(writeScope.mock.calls).toEqual(kept);
    },
  );
});
