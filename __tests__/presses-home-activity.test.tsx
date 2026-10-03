import { act, fireEvent, screen, within } from '@testing-library/react-native';
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
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fakePlatform, type Sent } from '@/test/fake-platform';
import {
  TEST_WORKSPACE,
  approvalsPayload,
  catalogPayload,
  flowCatalogPayload,
  projectsPayload,
  routePlatform,
  runDetailPayload,
  runsPayload,
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

/** Every focus callback, so a test can come back to a screen as a person does. */
const mockFocusEffects: (() => void)[] = [];
jest.mock('expo-router', () => {
  const actual = jest.requireActual('@/test/mocks/expo-router');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      ReactActual.useEffect(() => {
        mockFocusEffects.push(effect);
        return effect();
      }, [effect]),
  };
});

const Haptics = jest.requireMock('expo-haptics');

let keys = 0;
beforeEach(() => {
  platformOperation.mockReset();
  keys = 0;
  newIdempotencyKey.mockReset().mockImplementation((prefix: string) => `${prefix}-${++keys}`);
  mockStored.clear();
  mockFocusEffects.length = 0;
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
    let status = 'running';
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
        approval: { ...approvalsPayload().approvals[1]!, status: (sent.body as { decision: string }).decision },
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

describe('Notifications: Mark all read (DESIGN-GAPS: "marks read the rows Mark all read covered, not rows a later re-read brings in")', () => {
  const TITLES = /^(Run held for review|Run failed)$/u;
  /** The unread dot a row draws first, before its glyph and its words: from a line of the row, up to the row. */
  const dotOf = (line: ReturnType<typeof screen.getByText>) => {
    const dot = line.parent!.parent!.children[0];
    if (dot === undefined || typeof dot === 'string') throw new Error('a row draws its dot first');
    return (StyleSheet.flatten(dot.props.style) as { backgroundColor?: string }).backgroundColor;
  };
  const dots = () => screen.getAllByText(TITLES).map(dotOf);

  it('takes the dot off every row on screen and keeps the rows; a row a later re-read brings in is still unread', async () => {
    const runs = runsPayload();
    routePlatform(platformOperation, { '/automations': flowCatalogPayload(), '/runs': runs });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    // Three held for review and one failed: every row unread, as composed.
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);
    expect(dots()).toEqual([nocturneDark.accent, nocturneDark.accent, nocturneDark.accent, nocturneDark.accent]);

    await fireEvent.press(screen.getByText('Mark all read'));

    expect(dots()).toEqual(['transparent', 'transparent', 'transparent', 'transparent']);

    // Back on the inbox once its window has passed: the platform lists one more failed run.
    const later = { ...runs.runs[4]!, id: 'run-later', rootRunId: 'run-later', failureReason: 'Reason run-later' };
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/runs': { runs: [later, ...runs.runs] },
    });
    resetSnapshot();
    await act(async () => {
      for (const effect of mockFocusEffects) effect();
    });

    expect(await screen.findByText(/Reason run-later/u)).toBeTruthy();
    expect(dotOf(screen.getByText(/Reason run-later/u))).toBe(nocturneDark.accent);
    expect(dots().filter((color) => color === 'transparent')).toHaveLength(4);
    expect(dots()).toHaveLength(5);
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
