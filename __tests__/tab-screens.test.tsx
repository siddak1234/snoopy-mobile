import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import ActivityScreen from '@/app/(tabs)/activity/index';
import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import FlowsScreen from '@/app/(tabs)/flows/index';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import HomeScreen from '@/app/(tabs)/(home)/index';
import RunDetailScreen from '@/app/(tabs)/(home)/run';
import SettingsScreen from '@/app/(tabs)/settings';
import SettingsArchivedFlowsScreen from '@/app/(tabs)/settings/archived';
import SettingsArchivedFlowScreen from '@/app/(tabs)/settings/archived-flow';
import NotificationSettingsScreen from '@/app/(tabs)/settings/notifications';
import SetupScreen from '@/app/(tabs)/flows/setup';
import SolutionsScreen from '@/app/(tabs)/flows/add';
import NotificationsScreen from '@/app/(tabs)/(home)/notifications';
import ArchivedFlowsScreen from '@/app/(tabs)/flows/archived';
import { layout, nocturneDark, nocturneLight } from '@/constants/theme';
import {
  TEST_WORKSPACE,
  approvalsPayload,
  catalogPayload,
  flowCatalogPayload,
  planSubscriptionsPayload,
  projectsPayload,
  routePlatform,
  runDetailPayload,
  runsPayload,
  personalSession,
  sessionAs,
  signedInSession,
  subscriptionsPayload,
  unpublishedAnswer,
  type RouteOverrides,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';
import { touch } from '@/test/touch';
import type { SessionContextValue } from '@/hooks/use-session';
import type { Run, Subscription } from '@/lib/platform/automations';
import type { WorkspaceBilling } from '@/lib/platform/billing';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { resetPushForTests } from '@/hooks/use-push-registration';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

/**
 * These screens read the platform now, so they render with a session and a
 * routed transport mock. The payloads are built FROM `lib/fixtures` in
 * `test/platform.tsx` — Gate 8 exempts tests — so the assertions below still
 * describe what the DESIGN draws, while the values travel through the real
 * mappers on the way. That is a stronger test than before, not a weaker one.
 */
beforeEach(() => {
  platformOperation.mockReset();
  newIdempotencyKey.mockReset().mockReturnValue('test-intent');
  routePlatform(platformOperation);
  // The inbox card's "Not now" is shared by both inboxes for the session; one
  // test's must not hide the next one's card.
  resetPushForTests();
});

describe('Home dashboard', () => {
  it('shows greeting, stats and recent runs from the fixtures', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(getByText('Welcome back, Alex')).toBeTruthy();
    expect(getByText('Your agents ran 128 tasks today.')).toBeTruthy();
    expect(getByText('128')).toBeTruthy();
    expect(getByText('124')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
    expect(getByText('Runs')).toBeTruthy();
    expect(getByText('Successes')).toBeTruthy();
    expect(getByText('Failures')).toBeTruthy();
    expect(getByText('3 items need your review')).toBeTruthy();
    // §12.1 #67 refuses run output; the row draws `resultSummary`.
    expect(getByText('Run #4821 · posted to QuickBooks')).toBeTruthy();
  });

  it('routes every affordance per the design flow map', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    await fireEvent.press(getByText('3 items need your review'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity/approvals');
    await fireEvent.press(getByText('Add a flow'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/add');
    await fireEvent.press(getByText('Flows'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows');
    await fireEvent.press(getByText('See all'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity');
  });

  it("ticks when the avatar, the bell or See all is tapped, then opens its page (the owner's build 10 item 10; D7)", async () => {
    const Haptics = jest.requireMock('expo-haptics');
    await renderWithProviders(<HomeScreen />, signedInSession);
    await screen.findByText('Welcome back, Alex');
    await fireEvent.press(screen.getByLabelText('Account and settings'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Notifications'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/(home)/notifications');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
    // A Text's own handler, through pressed().
    await fireEvent.press(screen.getByText('See all'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(3);
  });

  it('opens Run detail from a recent-run row', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Run #4821 · posted to QuickBooks'));
    // A real run id now, not a prototype variant.
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/(home)/run',
      params: { runId: 'run-0' },
    });
  });
});

describe('Rows draw no border under the last one (the owner, build 13 #7)', () => {
  const borderOf = (id: string) => {
    const pressable = screen.getByTestId(id);
    const style = pressable.props.style;
    return (StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {}).borderBottomWidth;
  };

  it("Home's recent runs: every row but the last has its divider", async () => {
    await renderWithProviders(<HomeScreen />, signedInSession);
    await screen.findByText('Run #4821 · posted to QuickBooks');
    const rows = screen.getAllByTestId(/^home-run-/u).map((row) => row.props.testID as string);
    expect(rows.length).toBeGreaterThan(1);
    rows.slice(0, -1).forEach((id) => expect(borderOf(id)).toBe(1));
    expect(borderOf(rows[rows.length - 1]!)).toBeUndefined();
  });

  it("Activity: in each day's card, every row but the last has its divider", async () => {
    await renderWithProviders(<ActivityScreen />, signedInSession);
    const rows = (await screen.findAllByTestId(/^activity-row-/u)).map((row) => row.props.testID as string);
    expect(rows.length).toBeGreaterThan(1);
    expect(borderOf(rows[rows.length - 1]!)).toBeUndefined();
    expect(rows.slice(0, -1).some((id) => borderOf(id) === 1)).toBe(true);
  });
});

describe('Home approvals banner (feedback #5, #7)', () => {
  it('counts pending approvals only, though every approval is read for the run rows', async () => {
    routePlatform(platformOperation, {
      '/approvals': {
        approvals: [
          { ...approvalsPayload().approvals[0]!, id: 'a-pending', runId: 'run-0', status: 'pending' },
          { ...approvalsPayload().approvals[1]!, id: 'a-done', runId: 'run-1', status: 'approved' },
          { ...approvalsPayload().approvals[2]!, id: 'a-no', runId: 'run-2', status: 'rejected' },
        ],
      },
    });
    const { getByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(getByText('1 item needs your review')).toBeTruthy();
    expect(queryByText('3 items need your review')).toBeNull();
  });

  it('is not drawn when nothing waits (the owner, build 13 #3)', async () => {
    routePlatform(platformOperation, {
      '/approvals': {
        approvals: [{ ...approvalsPayload().approvals[0]!, id: 'a-done', status: 'approved' }],
      },
    });
    await renderWithProviders(<HomeScreen />, signedInSession);
    await screen.findByText('Welcome back, Alex');
    expect(screen.queryByText(/need(s)? your review/u)).toBeNull();
    expect(screen.queryByText('Exceptions your agents held for judgment')).toBeNull();
  });
});

describe('Add a flow — the catalog inside Flows (24.9.3)', () => {
  const solutionSubscriptions = planSubscriptionsPayload().subscriptions;

  beforeEach(() => {
    routePlatform(platformOperation, { '/subscriptions': planSubscriptionsPayload() });
  });

  it('lists the catalog with prices, Added ✓ for what this scope holds and Add for the rest — no plan banner', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    expect(await screen.findByText('Add a flow')).toBeTruthy();
    expect(getByText('Prebuilt flows, set up in minutes. Adding to your workspace.')).toBeTruthy();
    expect(getAllByText('Weekly KPI digest').length).toBeGreaterThan(0);
    expect(getAllByText('Finance · $39/mo').length).toBeGreaterThan(0);
    expect(getAllByText('Ops · $9/mo').length).toBeGreaterThan(0);
    expect(getAllByText('Added ✓')).toHaveLength(3);
    expect(getAllByText('Add').length).toBeGreaterThan(0);
    expect(queryByText(/plan and billing/u)).toBeNull();
    expect(queryByText(/Solutions · \$/u)).toBeNull();
  });

  it('Add opens Setup with the template; under All teams no team is chosen for the person (D4)', async () => {
    const { getAllByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    await fireEvent.press(getAllByText('Add')[0]);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/setup',
      params: expect.objectContaining({ template: expect.any(String) }),
    });
    const pushed = mockRouter.push.mock.calls[0]![0] as { params: Record<string, string> };
    expect(pushed.params).not.toHaveProperty('project');
  });

  it('Added ✓ is not a button: the card opens the flow, where Pause and Archive live (feedback #3, #5)', async () => {
    const { getAllByText, queryByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    await fireEvent.press(getAllByText('Added ✓')[0]);
    expect(queryByText('Pause Invoice triage?')).toBeNull();
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'solution-0' } });
  });

  it('filters the catalog by category', async () => {
    const { getByText, queryByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    await fireEvent.press(getByText('Finance'));
    expect(getByText('Invoice triage')).toBeTruthy();
    expect(getByText('Receipt OCR')).toBeTruthy();
    expect(queryByText('Email triage')).toBeNull();
    expect(queryByText('Slack alerts')).toBeNull();
    await fireEvent.press(getByText('Ops'));
    expect(getByText('Email triage')).toBeTruthy();
    expect(queryByText('Invoice triage')).toBeNull();
  });

  it('opens the correct flow from a filtered list', async () => {
    const { getByText, getAllByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    await fireEvent.press(getByText('Finance'));
    // Finance shows Invoice triage first; its flow is subscription solution-0.
    await fireEvent.press(getAllByText('Added ✓')[0]);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'solution-0' } });
  });

  it('answers Added from the subscriptions the workspace still has — a removed one is gone', async () => {
    // The catalog still flags tpl.0–2 `subscribed`: its flag counts an archived
    // row too. The list is the answer, and there every one of them is archived.
    routePlatform(platformOperation, {
      '/subscriptions': {
        subscriptions: solutionSubscriptions.map((row) => ({ ...row, status: 'archived' })),
      },
    });
    const { queryAllByText, getAllByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    expect(await screen.findByText('Add a flow')).toBeTruthy();
    expect(queryAllByText('Added ✓')).toHaveLength(0);
    expect(getAllByText('Add').length).toBeGreaterThan(0);
  });

  it('names where a flow is held — Added ✓ with its team, the card opens it — and offers no Add for another team (the owner\'s build 12 item 9: one flow per workspace; until build 13 "Added in …" and Add, 18.6.2)', async () => {
    // Held in a team alone, looked at from All teams (the whole workspace): no second copy is offered.
    const inTeamOnly = { ...planSubscriptionsPayload().subscriptions[0]!, projectId: 'project-1' };
    routePlatform(platformOperation, {
      '/subscriptions': { subscriptions: [inTeamOnly] },
      '/projects': projectsPayload('Finance'),
    });
    await renderWithProviders(<SolutionsScreen />, signedInSession);
    expect((await screen.findByTestId('added-where-tpl.0')).props.children).toBe('Team: Finance');
    expect(screen.getByTestId('added-tpl.0')).toBeTruthy();
    expect(screen.queryByTestId('add-tpl.0')).toBeNull();
    expect(screen.queryByText(/^Added in /u)).toBeNull();
    await fireEvent.press(screen.getByTestId('added-tpl.0'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'solution-0' } });
  });
});

describe('An empty catalog (24.12)', () => {
  it('is the whole-screen empty standard, with its way back', async () => {
    routePlatform(platformOperation, { '/automations': { automations: [], categories: ['All'] } });
    await renderWithProviders(<SolutionsScreen />, signedInSession);
    expect(await screen.findByTestId('screen-empty')).toBeTruthy();
    expect(screen.getByText('No flows to add yet')).toBeTruthy();
    expect(screen.getByText('More are on the way.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('Run detail', () => {
  it('shows a run from RunDetail, without the fields card the platform refuses', async () => {
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    // §12.1 #67 refuses run output, so the extracted-fields card is gone and
    // confidence is the design's own em dash. §12.1 #69 refuses a run number.
    expect(await screen.findByText('Duration')).toBeTruthy();
    expect(screen.getByText('Confidence')).toBeTruthy();
    expect(screen.queryByText('Beacon Supply Co')).toBeNull();
    expect(screen.queryByText('Run #4820')).toBeNull();
  });

  it('routes to the workflow, which is now ITS workflow', async () => {
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('View flow'));
    expect(mockRouter.push).toHaveBeenCalled();
  });
});

/* flow screens read the flow catalog */
describe('Workflows', () => {
  beforeEach(() => routePlatform(platformOperation, { '/automations': flowCatalogPayload() }));
  it('lists all four flows with statuses', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(getByText('Invoice triage')).toBeTruthy();
    expect(getByText('Email triage')).toBeTruthy();
    expect(getByText('Weekly KPI report')).toBeTruthy();
    expect(getByText('Lead enrichment')).toBeTruthy();
    expect(getByText('Paused')).toBeTruthy();
    expect(getByText('Draft')).toBeTruthy();
  });

  it('opens detail from a card, and New leads to Solutions — the website has no builder', async () => {
    const { getByText } = await renderWithProviders(<FlowsScreen />, signedInSession);
    await fireEvent.press(getByText('Invoice triage'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/detail',
      params: { flow: 'invoice' },
    });
    await fireEvent.press(getByText('New'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/add');
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.stringContaining('templates'));
    // Archived sits left of New, drawn with nothing archived too (build 11, D5).
    expect(screen.getAllByText(/^(Archived|New)$/u).map((label) => label.props.children)).toEqual(['Archived', 'New']);
  });
});

/* flow screens read the flow catalog */
describe('Workflows search (design v4)', () => {
  beforeEach(() => routePlatform(platformOperation, { '/automations': flowCatalogPayload() }));
  it('filters the list by query and shows the no-match state', async () => {
    const { getByPlaceholderText, getByText, queryByText, getAllByText } = await renderWithProviders(
      <FlowsScreen />,
      signedInSession,
    );
    await fireEvent.changeText(getByPlaceholderText('Search flows'), 'invoice');
    expect(getByText('Invoice triage')).toBeTruthy();
    expect(queryByText('Email triage')).toBeNull();
    await fireEvent.changeText(getByPlaceholderText('Search flows'), 'zzz');
    expect(getByText('No flows match "zzz".')).toBeTruthy();
    await fireEvent.changeText(getByPlaceholderText('Search flows'), '');
    expect(getByText('Email triage')).toBeTruthy();
  });
});

/* flow screens read the flow catalog */
describe('Workflow scope (18.6.2; every flow says its team since build 11, D4)', () => {
  it('labels each flow with its team or the whole workspace, once the workspace has a team', async () => {
    routePlatform(platformOperation, { '/automations': flowCatalogPayload(), '/projects': projectsPayload('Finance') });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText('Whole workspace · 1,284 runs · 1,272 ok · 12 failed')).toBeTruthy();
  });

  it("says Whole workspace where the workspace has no team at all (the owner's build 10 item 7)", async () => {
    // Until build 11 the label was drawn only once the workspace had a team, so a
    // workspace with none could not answer "What team is that flow part of?".
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText('Whole workspace · 1,284 runs · 1,272 ok · 12 failed')).toBeTruthy();
    expect(screen.queryByText('1,284 runs · 1,272 ok · 12 failed')).toBeNull();
  });

  it("a flow's page says it under the name, and an archived row says it too, with no team in the workspace", async () => {
    setMockParams({ flow: 'invoice' });
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await screen.findByText('Whole workspace · AP inbox → QuickBooks')).toBeTruthy();

    resetSnapshot();
    withRemovedFlow();
    const archived = await renderWithProviders(<ArchivedFlowsScreen />, signedInSession);
    expect(await archived.findByText(/^Whole workspace · /u)).toBeTruthy();
  });
});

describe('Workflow detail', () => {
  beforeEach(() => {
    setMockParams({ flow: 'invoice' });
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
  });
  it('shows stats and the four pipeline steps', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(getByText('1,284')).toBeTruthy();
    expect(getByText('1,272')).toBeTruthy();
    expect(getByText('12')).toBeTruthy();
    expect(getByText('Invoice triage')).toBeTruthy();
    expect(getByText('New email in AP inbox')).toBeTruthy();
    expect(getByText('Extract invoice fields')).toBeTruthy();
    expect(getByText('Classify & GL-code')).toBeTruthy();
    expect(getByText('Post to QuickBooks')).toBeTruthy();
  });

  it("keeps Pause plain — Resume undoes it in one tap — while Archive flow, last, is red (the owner's build 12 item 5)", async () => {
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    const color = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style) as { color?: string }).color;
    expect(color(await screen.findByText('Pause'))).toBe(nocturneDark.text);
    expect(color(screen.getByText('Pause'))).not.toBe(nocturneDark.danger);
    expect(color(screen.getByText('Archive flow'))).toBe(nocturneDark.danger);
  });

  it('offers no Edit in Builder: the website has no builder, and mobile offers what the website offers', async () => {
    // Removed 2026-10-02 on the owner's direction (24.7.3 attempt 2 feedback).
    const { queryByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(queryByText('Edit in Builder')).toBeNull();
  });

  it('renders each workflow identity with its own content (design flowDefs)', async () => {
    setMockParams({ flow: 'kpi' });
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(getByText('Weekly KPI report')).toBeTruthy();
    // Its team under its name — the whole workspace's, here — since build 11 (D4).
    expect(getByText('Whole workspace · Sheets → Slack digest')).toBeTruthy();
    expect(getByText('Paused')).toBeTruthy();
    // FINDING 6: only `unmetConnections` is published, so a satisfied provider
    // cannot be listed. The paused workflow has none outstanding.
    expect(queryByText('Google Sheets')).toBeNull();
    // FINDING 6: a satisfied/broken provider's detail is not published.
    expect(queryByText('Auth expired — tap to reconnect')).toBeNull();
    expect(getByText('Every Monday, 9:00 AM')).toBeTruthy();
    expect(queryByText('New email in AP inbox')).toBeNull();
  });

  it('shows a Draft with em-dash stats and a Publish action', async () => {
    setMockParams({ flow: 'lead' });
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(getByText('Lead enrichment')).toBeTruthy();
    expect(getByText('Draft')).toBeTruthy();
    expect(getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(getByText('HubSpot')).toBeTruthy();
    expect(getByText('Publish')).toBeTruthy();
  });

  it('holds Publish back while an account is unconnected, as the website holds Go live', async () => {
    setMockParams({ flow: 'lead' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Publish'));
    expect(platformOperation.mock.calls.some(([path]: [string]) => /\/subscriptions\/lead$/.test(path))).toBe(false);
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('offers what the website offers for this flow: Set up for its settings, and Archive flow last (24.9.4, 24.12)', async () => {
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await screen.findByTestId('manage-setup')).toBeTruthy();
    expect(screen.getByTestId('archive-flow')).toBeTruthy();
    expect(screen.getByText('Archive flow')).toBeTruthy();
    // Its pinned version declares no run input, so there is no form to offer.
    expect(screen.queryByText('Run')).toBeNull();
  });

  it("returns to the Flows list after Archive, however the flow was reached — the confirmation saying it can be unarchived later (the owner's build 12 item 4)", async () => {
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('archive-flow'));
    expect(await screen.findByText('Archive Invoice triage?')).toBeTruthy();
    expect(
      screen.getByText('It stops and moves to Archived flows. Its runs stay in Activity, and you can unarchive it later.'),
    ).toBeTruthy();
    const buttons = await screen.findAllByText('Archive');
    await fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/flows'));
  });

  it('gives a Resume after a lost Pause its own key, even when a re-read flips the button', async () => {
    const { PlatformUnreachableError } = jest.requireActual('@/lib/platform/problem');
    let n = 0;
    newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
    let status = 'live';
    const statusKeys: string[] = [];
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation(async (path: string, execute: Function) => {
      if (/\/subscriptions\/invoice$/.test(path)) {
        let sent: { body: { status?: string }; key: string } | undefined;
        const patch = async (_p: string, init: { body: { status?: string }; params: { header: Record<string, string> } }) => {
          sent = { body: init.body, key: init.params.header['Idempotency-Key']! };
          return { data: {} };
        };
        await execute({ automations: { PATCH: patch } });
        if (sent?.body.status) {
          statusKeys.push(sent.key);
          const lost = status === 'live';
          status = sent.body.status;
          // The first Pause lands, but its answer is lost on the way back.
          if (lost) throw new PlatformUnreachableError();
        }
        return { subscription: { ...subscriptionsPayload().subscriptions[0], status } };
      }
      if (/\/subscriptions$/.test(path)) {
        const rows = subscriptionsPayload().subscriptions.map((row) => (row.id === 'invoice' ? { ...row, status } : row));
        return { subscriptions: rows };
      }
      return routed?.(path, execute);
    });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Pause'));
    expect(await screen.findByText('The platform is unreachable')).toBeTruthy();

    // Saving the settings re-reads: the Pause had landed, so the button now resumes.
    await fireEvent.press(screen.getByTestId('manage-setup'));
    const save = await screen.findAllByText('Save setup');
    await fireEvent.press(save[save.length - 1]!);
    await fireEvent.press(await screen.findByText('Resume'));
    await waitFor(() => expect(statusKeys).toHaveLength(2));
    expect(statusKeys[1]).not.toBe(statusKeys[0]);
  });

  it('toggles Live → Paused and back (design dToggle), showing what the platform answers', async () => {
    // A platform that keeps what it is sent: the PATCH's status is what every
    // later read of the subscription returns.
    let status = 'live';
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation(async (path: string, execute: Function) => {
      if (/\/subscriptions\/invoice$/.test(path)) {
        const patch = async (_path: string, init: { body: { status: string } }) => ({ data: init.body });
        status = (await execute({ automations: { PATCH: patch } })).data.status;
        return { subscription: { ...subscriptionsPayload().subscriptions[0], status } };
      }
      if (/\/subscriptions$/.test(path)) {
        const rows = subscriptionsPayload().subscriptions.map((row) => (row.id === 'invoice' ? { ...row, status } : row));
        return { subscriptions: rows };
      }
      return routed?.(path, execute);
    });
    setMockParams({ flow: 'invoice' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await screen.findByText('Live')).toBeTruthy();
    await fireEvent.press(screen.getByText('Pause'));
    expect(await screen.findByText('Paused')).toBeTruthy();
    expect(screen.getByText('Resume')).toBeTruthy();
    await fireEvent.press(screen.getByText('Resume'));
    expect(await screen.findByText('Live')).toBeTruthy();
  });

  it('keeps the page while re-reading after Pause, never the skeleton (feedback #6)', async () => {
    // The first TestFlight build re-read with reload(), which starts from
    // `loading` and drew the tiled skeleton over the page: "it goes blank".
    // The status just answered is already shown, so the re-read keeps the page.
    let status = 'live';
    let listReads = 0;
    let releaseReread: (() => void) | undefined;
    const rereadReleased = new Promise<void>((resolve) => {
      releaseReread = resolve;
    });
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation(async (path: string, execute: Function) => {
      if (/\/subscriptions\/invoice$/.test(path)) {
        const patch = async (_path: string, init: { body: { status: string } }) => ({ data: init.body });
        status = (await execute({ automations: { PATCH: patch } })).data.status;
        return { subscription: { ...subscriptionsPayload().subscriptions[0], status } };
      }
      if (/\/subscriptions$/.test(path)) {
        // The re-read after the PATCH is slow: the page must stay up meanwhile.
        if (++listReads > 1) await rereadReleased;
        const rows = subscriptionsPayload().subscriptions.map((row) => (row.id === 'invoice' ? { ...row, status } : row));
        return { subscriptions: rows };
      }
      return routed?.(path, execute);
    });
    setMockParams({ flow: 'invoice' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await screen.findByText('Live')).toBeTruthy();
    await fireEvent.press(screen.getByText('Pause'));
    // The platform's answer shows the moment it is answered — before the re-read
    // lands — and the page stays: the name, no skeleton, and never the old label
    // again (24.7.3 attempt 2: "it switches back, then to the right state").
    expect(await screen.findByText('Paused')).toBeTruthy();
    expect(screen.getByText('Resume')).toBeTruthy();
    await waitFor(() => expect(listReads).toBeGreaterThan(1));
    expect(screen.queryByTestId('screen-loading')).toBeNull();
    expect(screen.getByText('Invoice triage')).toBeTruthy();
    expect(screen.queryByText('Pause')).toBeNull();
    // The re-read lands and agrees; nothing flips.
    releaseReread?.();
    await waitFor(() => expect(screen.getByText('Resume')).toBeTruthy());
    expect(screen.queryByText('Pause')).toBeNull();
    expect(screen.queryByTestId('screen-loading')).toBeNull();
  });
});

/* flow screens read the flow catalog */
describe('Activity', () => {
  beforeEach(() => routePlatform(platformOperation, { '/automations': flowCatalogPayload() }));
  it('groups today and yesterday from the fixtures', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(getByText('TODAY')).toBeTruthy();
    expect(getByText('YESTERDAY')).toBeTruthy();
    expect(getByText('32 emails routed · 3 escalated')).toBeTruthy();
    expect(getByText('Run #52 · failed — Sheets auth expired')).toBeTruthy();
  });

  it('opens a run from its row, as Home and the inbox do (24.4.4)', async () => {
    const { getByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    mockRouter.push.mockClear();
    await fireEvent.press(getByText('32 emails routed · 3 escalated'));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    const target = mockRouter.push.mock.calls[0]?.[0] as { pathname: string; params: { runId: string } };
    expect(target.pathname).toBe('/(tabs)/(home)/run');
    expect(typeof target.params.runId).toBe('string');
    expect(target.params.runId.length).toBeGreaterThan(0);
  });

  it('filters to held runs via Needs review (design v3: chip filters, not navigates)', async () => {
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    await fireEvent.press(getByText('Needs review'));
    // A held run's row says where its approval stands — pending here, from the
    // approvals read beside the runs — never just its status word (24.7.3 #5, #7).
    expect(getAllByText(/Waiting for approval|Held for review/).length).toBeGreaterThan(0);
    expect(queryByText('32 emails routed · 3 escalated')).toBeNull();
    expect(queryByText('YESTERDAY')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('leaves a decided held run out of Needs review and says how it was decided (feedback #5, #7)', async () => {
    // A run stays `held` after its approval, because the approval starts a new
    // run (FR-15). The first signed-in session saw five "held" rows from
    // September under Needs review with nothing to approve.
    const held: Run = { ...runsPayload().runs[0]!, id: 'held-decided', status: 'held' };
    const continuation: Run = {
      ...runsPayload().runs[0]!,
      id: 'held-continued',
      status: 'succeeded',
      origin: 'approval-continuation',
      continuesRunId: 'held-decided',
      resultSummary: 'Recorded INV-7',
    };
    routePlatform(platformOperation, {
      '/runs': { runs: [held, continuation] },
      '/approvals': { approvals: [{ ...approvalsPayload().approvals[0]!, runId: 'held-decided', status: 'approved' }] },
    });
    const { getByText, queryByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(getByText('Approved — continued in a new run')).toBeTruthy();
    expect(getByText('After approval · Recorded INV-7')).toBeTruthy();
    await fireEvent.press(getByText('Needs review'));
    expect(getByText('No held runs.')).toBeTruthy();
    expect(queryByText('Approved — continued in a new run')).toBeNull();
  });

  it('filters to successes only', async () => {
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    await fireEvent.press(getByText('Success'));
    expect(getByText('32 emails routed · 3 escalated')).toBeTruthy();
    expect(queryByText('Run #52 · failed — Sheets auth expired')).toBeNull();
    expect(queryByText('Run #4820 · held for review — amount mismatch')).toBeNull();
  });

  it('lists runs older than two days under EARLIER, never as "no activity yet" (feedback #3)', async () => {
    // The website's Activity is every run in the workspace. The first TestFlight
    // build showed the first-run empty to a workspace whose 13 runs were all
    // older than two days, while Home listed them under Recent runs.
    const old = new Date();
    old.setDate(old.getDate() - 16);
    const runs = runsPayload();
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/runs': {
        runs: runs.runs.map((run) => ({ ...run, status: 'succeeded', createdAt: old.toISOString(), updatedAt: old.toISOString() })),
      },
    });
    const { getByText, queryByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(getByText('EARLIER')).toBeTruthy();
    expect(getByText('32 emails routed · 3 escalated')).toBeTruthy();
    expect(queryByText('No activity yet')).toBeNull();
    expect(queryByText('TODAY')).toBeNull();
    expect(queryByText('YESTERDAY')).toBeNull();
    // A filter with nothing under it says so without inventing a window.
    // A filter with nothing to show says so — it is not the first-run empty.
    await fireEvent.press(getByText('Needs review'));
    expect(getByText('No held runs.')).toBeTruthy();
    expect(queryByText('No activity yet')).toBeNull();
  });

  it('shows the first-run empty only to a workspace with no runs at all', async () => {
    routePlatform(platformOperation, { '/automations': flowCatalogPayload(), '/runs': { runs: [] } });
    const { getByText, queryByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(getByText('No activity yet')).toBeTruthy();
    expect(queryByText('EARLIER')).toBeNull();
  });

  it('filters to failures and hides the empty TODAY section', async () => {
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    await fireEvent.press(getByText('Failed'));
    expect(getByText('Run #52 · failed — Sheets auth expired')).toBeTruthy();
    expect(queryByText('TODAY')).toBeNull();
    expect(getByText('YESTERDAY')).toBeTruthy();
    await fireEvent.press(getByText('All'));
    expect(getByText('TODAY')).toBeTruthy();
    expect(getByText('Run #911 · 4 receipts captured')).toBeTruthy();
  });
});

describe('Approvals inbox', () => {
  beforeEach(() => routePlatform(platformOperation, { '/automations': flowCatalogPayload() }));
  it('approves and rejects independently, matching the design done-states', async () => {
    const { getAllByText, getByText, queryAllByText, queryByText } = await renderWithProviders(<ApprovalsScreen />, signedInSession);
    expect(getAllByText('Approve')).toHaveLength(3);
    // Reject is an answer, not a removal: plain, as the design draws it (the owner's build 12 item 5).
    expect((StyleSheet.flatten(getAllByText('Reject')[0]!.props.style) as { color?: string }).color).toBe(nocturneDark.neutral[300]);

    await fireEvent.press(getAllByText('Approve')[0]);
    expect(getByText('Approved ✓ — agent resuming')).toBeTruthy();
    expect(queryAllByText('Approve')).toHaveLength(2);

    await fireEvent.press(getAllByText('Reject')[0]);
    expect(getByText('Rejected — sent back to sender')).toBeTruthy();
    expect(queryAllByText('Approve')).toHaveLength(1);
  });

  it('decrements the pending count and shows the all-caught-up banner', async () => {
    const { getAllByText, getByText, queryByText } = await renderWithProviders(<ApprovalsScreen />, signedInSession);
    expect(getByText('3')).toBeTruthy();
    await fireEvent.press(getAllByText('Approve')[0]);
    expect(getByText('2')).toBeTruthy();
    expect(queryByText('All caught up — decisions synced to your workflows.')).toBeNull();
    await fireEvent.press(getAllByText('Approve')[0]);
    await fireEvent.press(getAllByText('Reject')[0]);
    expect(getByText('0')).toBeTruthy();
    expect(getByText('All caught up — decisions synced to your workflows.')).toBeTruthy();
  });

  it('shows the review reasons verbatim', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<ApprovalsScreen />, signedInSession);
    // §12.1 #70 refuses an approval title. The three-hop join renders the
    // automation and the step it paused at instead.
    expect(getAllByText(/Invoice triage · /).length).toBeGreaterThan(0);
    expect(getByText('Above the $500 auto-approve threshold.')).toBeTruthy();
  });

  it('mints a new idempotency intent when a failed decision changes body', async () => {
    const routed = platformOperation.getMockImplementation();
    let decisionAttempts = 0;
    platformOperation.mockImplementation((path: string, ...args: unknown[]) => {
      if (path.includes('/decision')) {
        decisionAttempts += 1;
        if (decisionAttempts === 1) return Promise.reject(new Error('Temporary refusal'));
        return Promise.resolve({ approval: { id: 'apr-0', status: 'rejected' } });
      }
      return routed?.(path, ...args);
    });
    newIdempotencyKey
      .mockReturnValueOnce('approve-intent')
      .mockReturnValueOnce('reject-intent');

    const { getAllByText, findByText } = await renderWithProviders(
      <ApprovalsScreen />,
      signedInSession,
    );
    await fireEvent.press(getAllByText('Approve')[0]);
    expect(await findByText('Temporary refusal')).toBeTruthy();
    await fireEvent.press(getAllByText('Reject')[0]);
    expect(await findByText('Rejected — sent back to sender')).toBeTruthy();
    expect(newIdempotencyKey).toHaveBeenNthCalledWith(1, 'decision');
    expect(newIdempotencyKey).toHaveBeenNthCalledWith(2, 'decision');
  });
});

describe('Notifications inbox (design sNotifs)', () => {
  beforeEach(() => routePlatform(platformOperation, { '/automations': flowCatalogPayload() }));
  it("asks for notifications on this phone, asks iOS nothing until Turn on, and Not now hides the ask (build 11, D8; the owner's build 10 item 13)", async () => {
    // Decided flip: until build 11 this card said "This build shows held runs and
    // failures in this in-app inbox. Device push delivery is not configured." and
    // only dismissed ("Got it", "Dismiss"); the owner asked "What do we need to do
    // here?" and decided to add push (D8).
    const Notifications = jest.requireMock('expo-notifications');
    const { getByText, queryByText, findByText } = await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await findByText('Know the moment something needs you')).toBeTruthy();
    expect(getByText('Get a notification on this phone when a run is held or fails.')).toBeTruthy();
    expect(getByText('Turn on')).toBeTruthy();
    expect(queryByText(/Device push delivery is not configured/u)).toBeNull();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    await fireEvent.press(getByText('Not now'));
    expect(queryByText('Know the moment something needs you')).toBeNull();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('lists notifications and opens their targets', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(getAllByText('Run held for review').length).toBeGreaterThan(0);
    // The platform's inbox lists held runs and failed runs only (decision 3A). A
    // billing notice has no source, so it is absent rather than invented.
    expect(queryByText('Invoice paid')).toBeNull();
    await fireEvent.press(getByText('Run failed'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/(home)/run',
      // A row points at the real run, not a prototype variant.
      params: { runId: 'run-4' },
    });
    // "Digest posted" was a prototype success notice. The inbox has only held
    // runs and failed runs, and a held row opens Activity.
    await fireEvent.press(getAllByText('Run held for review')[0]);
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity');
  });
});

describe('An empty inbox (24.12)', () => {
  it('is the empty standard with its way back, since the inbox is a pushed screen', async () => {
    routePlatform(platformOperation, { '/notifications': { items: [], unreadCount: 0 } });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findByText('Quiet, as designed')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('Settings — one grouped page (build 11, D1)', () => {
  /** The rows and the control, as drawn, in the build's order: each by its test id and its first words. */
  const ROWS = [
    ['settings-account', 'Account'],
    ['settings-face-id', 'Face ID unlock'],
    ['settings-connections', 'Connections'],
    ['settings-billing', 'Billing'],
    ['workspace-switcher-row', 'Acme Operations'],
    ['settings-role', 'Your role'],
    ['settings-organization', 'Organization'],
    ['settings-teams', 'Teams'],
    ['settings-archived-flows', 'Archived flows'],
    ['settings-data', 'Export my data'],
    ['settings-notifications', 'Notifications'],
    ['settings-appearance', 'Auto'],
    ['settings-help', 'Help'],
  ] as const;
  /** Everything a person reads down the page, in order: the labels, the rows, the control's options, Sign out. */
  const AS_DRAWN = [
    'Account',
    'SECURITY',
    'Face ID unlock',
    'Connections',
    'Billing',
    'WORKSPACE',
    'Acme Operations',
    'Your role',
    'Organization',
    'Teams',
    'Archived flows',
    'Export my data',
    'Notifications',
    'APPEARANCE',
    'Auto',
    'Dark',
    'Light',
    'Help',
    'Sign out',
  ];
  /** The rows that open a page, and where. */
  const PAGES = [
    ['settings-account', '/(tabs)/settings/account'],
    ['settings-connections', '/(tabs)/settings/connections'],
    ['settings-billing', '/(tabs)/settings/billing'],
    ['settings-organization', '/(tabs)/settings/organization'],
    ['settings-teams', '/(tabs)/settings/teams'],
    ['settings-archived-flows', '/(tabs)/settings/archived'],
    ['settings-data', '/(tabs)/settings/data'],
    ['settings-notifications', '/(tabs)/settings/notifications'],
    ['settings-help', '/(tabs)/settings/support'],
  ] as const;
  const BILLING = `/v1/workspaces/${TEST_WORKSPACE}/billing`;
  const ON_PLUS: WorkspaceBilling = { workspaceId: TEST_WORKSPACE, planId: 'team', displayName: 'Plus', status: 'active' };

  it("is the groups in the build's order, as drawn — the labels, the rows, the control — then Sign out and the version", async () => {
    routePlatform(platformOperation, { [BILLING]: ON_PLUS });
    // A personal workspace: an organization's row would also name it (the platform always says which).
    await renderWithProviders(<SettingsScreen />, personalSession());
    expect(await screen.findByText('Plus')).toBeTruthy();
    // In this order, as drawn, each titled as the build names it.
    const rows = screen.getAllByTestId(/^(settings-|workspace-switcher-row$)/u);
    expect(rows.map((row) => row.props.testID)).toEqual(ROWS.map(([id]) => id));
    expect(rows.map((row) => within(row).getAllByText(/./u)[0]!.props.children)).toEqual(ROWS.map(([, first]) => first));
    const drawn = screen.getAllByText(new RegExp(`^(${AS_DRAWN.join('|')})$`, 'u'));
    expect(drawn.map((node) => node.props.children)).toEqual(AS_DRAWN);
    expect(screen.getByText(/^Autom8x for iOS · v/u)).toBeTruthy();
    // Roomier rows, on this page only (the owner's "vertically more roomy").
    expect(StyleSheet.flatten(screen.getByTestId('settings-account').props.style).paddingVertical).toBe(layout.rowPadVRoomy);
    // The three pages of 24.12 went: their content is here, and nothing is titled for them.
    expect(screen.queryByText('Security')).toBeNull();
    expect(screen.queryByText('Workspace')).toBeNull();
    expect(screen.queryByText('Appearance')).toBeNull();
  });

  it("reads only the plan, quietly: one billing read for an owner, shown as Billing's value on its right; the email under Account", async () => {
    routePlatform(platformOperation, { [BILLING]: ON_PLUS });
    await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(await screen.findByText('Plus')).toBeTruthy();
    // The plan is the row's value, on the title's line before the arrow (the owner's
    // build 12 item 2) — not a line under "Billing", so the row keeps its height.
    expect(screen.getByTestId('value-of-settings-billing').props.children).toBe('Plus');
    expect(within(screen.getByTestId('settings-billing')).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'Billing',
      'Plus',
    ]);
    expect(within(screen.getByTestId('settings-account')).getByText('alex@acme.co')).toBeTruthy();
    // The one request: the workspace's billing — not the workspace list, not the plans, nothing for any other row.
    expect(platformOperation.mock.calls.map(([path]: [string]) => path)).toEqual([BILLING]);
  });

  it('says Free on the free floor and for a subscription whose access has ended — the Billing page\'s own rule', async () => {
    routePlatform(platformOperation, { [BILLING]: { workspaceId: TEST_WORKSPACE, planId: 'free', displayName: 'Free' } });
    await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(await screen.findByText('Free')).toBeTruthy();

    resetSnapshot();
    routePlatform(platformOperation, { [BILLING]: { ...ON_PLUS, status: 'canceled' } });
    const canceled = await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(await canceled.findByText('Free')).toBeTruthy();
    expect(canceled.queryByText('Plus')).toBeNull();
  });

  it('never reads billing for a member, whose line says who manages it', async () => {
    await renderWithProviders(<SettingsScreen />, sessionAs('member'));
    expect(await screen.findByText('Managed by owners and admins')).toBeTruthy();
    expect(within(screen.getByTestId('settings-billing')).getByText('Managed by owners and admins')).toBeTruthy();
    // It explains rather than states a plan: the line under the title, and Billing has no value.
    expect(screen.queryByTestId('value-of-settings-billing')).toBeNull();
    expect(StyleSheet.flatten(screen.getByText('Billing').parent!.props.style)).toEqual({ flex: 1 });
    expect(platformOperation).not.toHaveBeenCalled();
    expect(screen.queryByText('Free')).toBeNull();
  });

  /** A session in the given workspaces, the first one active unless said. */
  function sessionIn(
    workspaces: { id: string; name: string; type: 'personal' | 'organization'; role: 'owner' | 'admin' | 'member' }[],
    options: { active?: string; truncated?: boolean } = {},
  ): SessionContextValue {
    return {
      ...signedInSession,
      session: {
        user: { userId: 'u1', email: 'alex@acme.co', activeWorkspaceId: options.active ?? workspaces[0]!.id },
        workspaces,
        ...(options.truncated ? { workspacesTruncated: true } : {}),
      },
    } as SessionContextValue;
  }
  const PERSONAL = '00000000-0000-4000-8000-0000000000aa';
  const SECOND_ORG = '00000000-0000-4000-8000-0000000000bb';

  it('names the active organization on the Organization row, for an owner and for a member, with no request', async () => {
    routePlatform(platformOperation, { [BILLING]: ON_PLUS });
    const owner = await renderWithProviders(
      <SettingsScreen />,
      sessionIn([{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }]),
    );
    expect(await owner.findByText('Plus')).toBeTruthy();
    expect(owner.getByTestId('value-of-settings-organization').props.children).toBe('Acme Operations');
    expect(within(owner.getByTestId('settings-organization')).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'Organization',
      'Acme Operations',
    ]);
    // The name is the session's: the one request is still the plan.
    expect(platformOperation.mock.calls.map(([path]: [string]) => path)).toEqual([BILLING]);
    await owner.unmount();

    platformOperation.mockClear();
    // A member of it, and of another: still the one they are in, not a count of both.
    const member = await renderWithProviders(
      <SettingsScreen />,
      sessionIn([
        { id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'member' },
        { id: SECOND_ORG, name: 'Sikho Mode Solutions', type: 'organization', role: 'owner' },
        { id: PERSONAL, name: 'Alex Kim', type: 'personal', role: 'owner' },
      ]),
    );
    expect(await member.findByText('Managed by owners and admins')).toBeTruthy();
    expect(member.getByTestId('value-of-settings-organization').props.children).toBe('Acme Operations');
    expect(platformOperation).not.toHaveBeenCalled();
  });

  it('in a personal workspace, names the organization the session lists: one by name, several as a count, none as None, and nothing when the list is cut off without one', async () => {
    const personal = { id: PERSONAL, name: 'Alex Kim', type: 'personal', role: 'owner' } as const;
    const sikho = { id: TEST_WORKSPACE, name: 'Sikho Mode Solutions', type: 'organization', role: 'owner' } as const;
    const acme = { id: SECOND_ORG, name: 'Acme Operations', type: 'organization', role: 'member' } as const;
    const PERSONAL_BILLING = `/v1/workspaces/${PERSONAL}/billing`;
    const cases = [
      { workspaces: [personal, sikho], truncated: false, value: 'Sikho Mode Solutions' },
      { workspaces: [personal, sikho, acme], truncated: false, value: '2 organizations' },
      { workspaces: [personal], truncated: false, value: 'None' },
      { workspaces: [personal], truncated: true, value: null },
    ];
    for (const { workspaces, truncated, value } of cases) {
      resetSnapshot();
      platformOperation.mockClear();
      routePlatform(platformOperation, { [PERSONAL_BILLING]: { ...ON_PLUS, workspaceId: PERSONAL } });
      const view = await renderWithProviders(<SettingsScreen />, sessionIn([...workspaces], { active: PERSONAL, truncated }));
      expect(await view.findByText('Plus')).toBeTruthy();
      if (value === null) {
        expect(view.queryByTestId('value-of-settings-organization')).toBeNull();
        expect(view.queryByText('None')).toBeNull();
      } else {
        expect(view.getByTestId('value-of-settings-organization').props.children).toBe(value);
      }
      // Whatever it says, it asked for nothing but the plan.
      expect(platformOperation.mock.calls.map(([path]: [string]) => path)).toEqual([PERSONAL_BILLING]);
      await view.unmount();
    }
  });

  it('shows no plan line and no error screen when the billing read is refused or the platform is unreachable', async () => {
    const { PlatformError, PlatformUnreachableError } = jest.requireActual('@/lib/platform/problem');
    routePlatform(platformOperation);
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation((path: string, ...rest: unknown[]) =>
      path === BILLING ? Promise.reject(new PlatformError('Service Unavailable', 503)) : routed?.(path, ...rest),
    );
    await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(await screen.findByText('Settings')).toBeTruthy();
    await waitFor(() => expect(platformOperation).toHaveBeenCalledWith(BILLING, expect.anything()));
    expect(within(screen.getByTestId('settings-billing')).queryByText(/Free|Plus|Pro|Unavailable/u)).toBeNull();
    expect(screen.queryByText("Couldn't load settings")).toBeNull();
    expect(screen.getByText('Sign out')).toBeTruthy();

    platformOperation.mockImplementation((path: string, ...rest: unknown[]) =>
      path === BILLING ? Promise.reject(new PlatformUnreachableError()) : routed?.(path, ...rest),
    );
    const offline = await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(await offline.findByText('Settings')).toBeTruthy();
    expect(offline.queryByText("You're offline")).toBeNull();
    expect(within(offline.getByTestId('settings-billing')).queryByText(/Free|Plus|Pro/u)).toBeNull();
  });

  it("opens each page row on its page — Archived flows in Settings' own stack (the owner's build 9)", async () => {
    await renderWithProviders(<SettingsScreen />, signedInSession);
    for (const [id, path] of PAGES) {
      await fireEvent.press(screen.getByTestId(id));
      expect(mockRouter.push).toHaveBeenLastCalledWith(path);
    }
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.stringMatching(/settings\/(security|workspace|appearance)$/u));
    expect(mockRouter.push).not.toHaveBeenCalledWith('/(tabs)/flows/archived');
  });

  it('keeps the Face ID unlock on the index, under SECURITY, and nothing the website never had', async () => {
    const { getByText, queryByText } = await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(getByText('SECURITY')).toBeTruthy();
    expect(getByText('Face ID unlock')).toBeTruthy();
    expect(getByText('Require Face ID when opening')).toBeTruthy();
    // Removed 2026-10-02: two static rows the website never had and nobody could
    // act on (24.7.3 attempt 2, feedback #8 and #9).
    expect(queryByText('Passkeys')).toBeNull();
    expect(queryByText('Stay signed in')).toBeNull();
  });

  it('says a failed Face ID enable right under its row, and keeps the page', async () => {
    await renderWithProviders(<SettingsScreen />, signedInSession);
    // The test device has no biometric hardware (test/jest-setup.js).
    await fireEvent.press(screen.getByRole('switch'));
    expect(await screen.findByText('Face ID is not available or enrolled on this device.')).toBeTruthy();
    expect(screen.getByTestId('action-failure')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('keeps the workspace rows on the index: the switcher row, the role, and its areas', async () => {
    const { getByText } = await renderWithProviders(<SettingsScreen />, personalSession());
    expect(getByText('WORKSPACE')).toBeTruthy();
    expect(getByText('Acme Operations')).toBeTruthy();
    expect(getByText('Your role')).toBeTruthy();
    expect(getByText('owner')).toBeTruthy();
    await fireEvent.press(getByText('Export my data'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/data');
    await fireEvent.press(getByText('Teams'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/teams');
  });

  it('switches the live theme from the control on the index — Auto, Dark, Light, in that order', async () => {
    const { getByText } = await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(
      within(screen.getByTestId('settings-appearance'))
        .getAllByText(/./u)
        .map((option) => option.props.children),
    ).toEqual(['Auto', 'Dark', 'Light']);
    const title = () => (StyleSheet.flatten(getByText('Settings').props.style) as { color?: string }).color;
    expect(title()).toBe(nocturneDark.text);
    await fireEvent.press(getByText('Light'));
    expect(title()).toBe(nocturneLight.text);
    await fireEvent.press(getByText('Dark'));
    expect(title()).toBe(nocturneDark.text);
  });

  it("is the inbox itself on the Notifications page, in Settings' own stack: its rows, its Back, and its runs (24.12)", async () => {
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    const { getByText, getAllByText, queryByText } = await renderWithProviders(
      <NotificationSettingsScreen />,
      signedInSession,
    );
    // The inbox's own header and rows — not a row that pushes Home's copy across tabs.
    expect(getByText('Notifications')).toBeTruthy();
    expect(getAllByText('Run held for review').length).toBeGreaterThan(0);
    expect(queryByText('Open inbox')).toBeNull();
    // A failed run opens in the Settings stack, so Back returns to Settings.
    await fireEvent.press(getByText('Run failed'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/settings/run', params: { runId: 'run-4' } });
    // A held run still switches to Activity, where it is decided, as from Home.
    await fireEvent.press(getAllByText('Run held for review')[0]);
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity');
    // Its Back is the inbox's own: back to Settings, never into Home.
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalledWith('/(tabs)/(home)/notifications');
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/(tabs)/(home)/run' }));
  });

  it('shows Billing without the plan totals (24.9.5)', async () => {
    const { getByText, queryByText } = await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(await screen.findByText('Billing')).toBeTruthy();
    expect(queryByText('Solutions total')).toBeNull();
    expect(queryByText('Manage solutions')).toBeNull();
    expect(queryByText('Visa ···· 4242')).toBeNull();
    await fireEvent.press(getByText('Billing'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/billing');
  });

  it.each([
    ['dark', '#f87171'],
    ['light', '#dc2626'],
  ] as const)("says Sign out in the theme's red — %s, %s (the owner's build 12 item 5)", async (mode, red) => {
    await renderWithProviders(<SettingsScreen />, signedInSession, mode);
    const label = await screen.findByText('Sign out');
    expect((StyleSheet.flatten(label.props.style) as { color?: string }).color).toBe(red);
    expect(screen.getByTestId(/^phosphor-react-native-sign-out-/u).props.color).toBe(red);
  });
});

describe('Cancelling a run (24.4.2)', () => {
  function routeRunningRun(cancel: (path: string) => Promise<unknown>) {
    routePlatform(platformOperation);
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation((path: string, ...rest: unknown[]) => {
      if (path.endsWith('/cancel')) return cancel(path);
      if (/\/runs\/run-1$/.test(path)) {
        const payload = runDetailPayload('run-1');
        return Promise.resolve({ ...payload, run: { ...payload.run, status: 'running' } });
      }
      return routed?.(path, ...rest);
    });
  }

  async function confirmCancel() {
    await fireEvent.press(await screen.findByText('Cancel run'));
    expect(await screen.findByText('Cancel this run?')).toBeTruthy();
    const buttons = screen.getAllByText('Cancel run');
    await fireEvent.press(buttons[buttons.length - 1]);
  }

  it('offers Cancel while a run is going, confirms first, and cancels THIS run', async () => {
    const cancelled: string[] = [];
    routeRunningRun((path) => {
      cancelled.push(path);
      return Promise.resolve({ run: {} });
    });
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    await confirmCancel();
    await waitFor(() => expect(cancelled).toHaveLength(1));
    expect(cancelled[0]).toMatch(/\/v1\/workspaces\/[^/]+\/runs\/run-1\/cancel$/);
  });

  it('says a 404 as "already stopped", the one thing a person here can act on', async () => {
    const { PlatformError } = jest.requireActual('@/lib/platform/problem');
    routeRunningRun(() => Promise.reject(new PlatformError('Not found', 404)));
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    await confirmCancel();
    expect(await screen.findByText('This run has already stopped, so there is nothing to cancel.')).toBeTruthy();
  });

  it("draws Cancel run in red and View flow as it was (the owner's build 12 item 5: \"stop\")", async () => {
    routeRunningRun(() => Promise.resolve({ run: {} }));
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    const color = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style) as { color?: string }).color;
    expect(color(await screen.findByText('Cancel run'))).toBe(nocturneDark.danger);
    expect(screen.getByTestId('phosphor-react-native-stop-circle-regular').props.color).toBe(nocturneDark.danger);
    expect(color(screen.getByText('View flow'))).toBe(nocturneDark.text);
    await fireEvent.press(screen.getByText('Cancel run'));
    expect(color(within(await screen.findByTestId('cancel-run-dialog')).getByText('Cancel run'))).toBe(nocturneDark.danger);
    // Keep it running is the neutral way out.
    expect(color(screen.getByText('Keep it running'))).not.toBe(nocturneDark.danger);
  });

  it('offers no Cancel on a run that has ended', async () => {
    routePlatform(platformOperation);
    setMockParams({ runId: 'run-0' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Duration')).toBeTruthy();
    expect(screen.queryByText('Cancel run')).toBeNull();
  });
});

describe('Run detail variants (design runDefs)', () => {
  it('renders a successful run with its result line', async () => {
    setMockParams({ runId: 'run-0' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Duration')).toBeTruthy();
  });

  it('offers no Retry, because a client cannot express one', async () => {
    setMockParams({ runId: 'run-4' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    // DESIGN-CONTRACT finding 9: POST /runs takes {subscriptionId, input} and
    // RunOrigin is not client-settable, so a retry cannot be expressed.
    expect(await screen.findByText('Duration')).toBeTruthy();
    expect(screen.queryByText('Retry run')).toBeNull();
  });
});

describe('Home data states (design sHomeLoad/Empty/Err)', () => {
  it('renders the skeleton while loading', async () => {
    platformOperation.mockImplementation(() => new Promise(() => {}));
    const { queryByText, getAllByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(queryByText('Welcome back, Alex')).toBeNull();
    expect(queryByText('3 items need your review')).toBeNull();
  });

  it('renders the first-run empty state with its CTAs', async () => {
    const emptyCatalog = catalogPayload();
    emptyCatalog.automations = emptyCatalog.automations.map((automation) => ({
      ...automation,
      subscribed: false,
    }));
    routePlatform(platformOperation, { '/automations': emptyCatalog });
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Nothing automated. Yet.')).toBeTruthy();
    expect(
      getByText(
        'Add a prebuilt flow and your first agent is running in minutes — no building required.',
      ),
    ).toBeTruthy();
    await fireEvent.press(getByText('Add a flow'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/add');
    // The onboarding tour went with the sign-up screen (2026-10-02): one way in.
    expect(mockRouter.push).not.toHaveBeenCalledWith('/(auth)/onboarding');
  });

  it('renders the connection-error state with Retry', async () => {
    platformOperation.mockRejectedValue(new Error('offline'));
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText("Can't reach Autom8x")).toBeTruthy();
    expect(
      getByText(
        "Check your connection. Your agents keep running in the cloud and will sync when you're back.",
      ),
    ).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
  });
});

describe('Home header — the mark fills its row and draws nothing else (D9, 2026-10-03)', () => {
  // The row is as tall as its buttons; the mark takes that height and no more.
  const ROW = 38;
  const MARK_WIDTH = (ROW * 1800) / 879; // the PNG's aspect
  // The workspace, the team, the bell and the avatar, a gap between each: four
  // since the scope became two icons beside the bell (the owner's build 13 decision 2).
  const BUTTONS = 4 * 38 + 3 * 10;

  function expectMarkFillsTheRow(mark: { props: Record<string, unknown> }, tint: string | undefined) {
    const style = StyleSheet.flatten(mark.props.style as never) as Record<string, unknown>;
    expect(style.height).toBe(ROW);
    expect(style.width).toBeCloseTo(MARK_WIDTH, 5);
    expect(style.opacity).toBe(1);
    expect(style.tintColor).toBe(tint);
    // Just the mark: no tile, border, shadow or offset around it.
    for (const key of ['backgroundColor', 'borderWidth', 'borderColor', 'shadowOpacity', 'elevation', 'position']) {
      expect(style[key]).toBeUndefined();
    }
  }

  it('fills the 38-pt row on the dashboard, beside the scope icons, the bell and the avatar it leaves untouched', async () => {
    const { getByTestId, getByLabelText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Welcome back, Alex')).toBeTruthy();
    expectMarkFillsTheRow(getByTestId('home-mark'), undefined);
    // The row sizes to its content: no fixed height that the mark could overflow.
    const row = StyleSheet.flatten(getByTestId('home-header').props.style);
    expect(row).toMatchObject({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' });
    expect(row.height).toBeUndefined();
    // The buttons keep their size, so the row stays 38 and nothing below moves.
    for (const label of ['Workspace: Acme Operations', 'Team: All teams', 'Notifications']) {
      expect(StyleSheet.flatten(getByLabelText(label).props.style)).toMatchObject({ width: 38, height: 38 });
    }
    const [avatar] = getByLabelText('Account and settings').children;
    expect(typeof avatar).not.toBe('string');
    const avatarStyle = typeof avatar === 'string' ? undefined : avatar.props.style;
    expect(StyleSheet.flatten(avatarStyle as never)).toMatchObject({ width: 38, height: 38 });
    // And the mark leaves the buttons their room on the narrowest phone (320 pt, 20 a side).
    expect(MARK_WIDTH + BUTTONS).toBeLessThanOrEqual(320 - 2 * layout.screenX);
  });

  it('is the same mark in the light palette, tinted as the design inverts it', async () => {
    const { getByTestId } = await renderWithProviders(<HomeScreen />, signedInSession, 'light');
    expect(await screen.findByText('Welcome back, Alex')).toBeTruthy();
    expectMarkFillsTheRow(getByTestId('home-mark'), nocturneLight.brandTint);
  });

  it('is the same size while the dashboard loads, beside a circle for each of the four buttons to come', async () => {
    platformOperation.mockImplementation(() => new Promise(() => {}));
    const { getByTestId } = await renderWithProviders(<HomeScreen />, signedInSession);
    expectMarkFillsTheRow(getByTestId('home-mark'), undefined);
    // The workspace, the team, the bell and the avatar (four since build 14): nothing moves when it loads.
    expect(getByTestId('home-header-actions').children).toHaveLength(4);
  });

  it('is the same size on the first run', async () => {
    const emptyCatalog = catalogPayload();
    emptyCatalog.automations = emptyCatalog.automations.map((automation) => ({ ...automation, subscribed: false }));
    routePlatform(platformOperation, { '/automations': emptyCatalog });
    const { getByTestId } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Nothing automated. Yet.')).toBeTruthy();
    expectMarkFillsTheRow(getByTestId('home-mark'), undefined);
  });

  it('is the same size when the platform is unreachable', async () => {
    platformOperation.mockRejectedValue(new Error('offline'));
    const { getByTestId } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText("Can't reach Autom8x")).toBeTruthy();
    expectMarkFillsTheRow(getByTestId('home-mark'), undefined);
  });
});

describe('Setup wizard (design sSetup)', () => {
  it('names the solution it is setting up', async () => {
    setMockParams({ template: 'tpl.3' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    // Item 3's first case: each solution opens its OWN setup.
    expect(await screen.findByText(/Weekly KPI digest/)).toBeTruthy();
  });

  it('numbers the accounts an automation needs as step 1, Connected or Connect, before the fields (feedback #5)', async () => {
    const catalog = catalogPayload();
    const sample = catalog.automations[0]!.setup[0]!;
    catalog.automations = catalog.automations.map((automation) => ({
      ...automation,
      requiredConnections: [
        { providerId: 'google', displayName: 'Google', purpose: 'Read the invoices' },
        { providerId: 'quickbooks', displayName: 'QuickBooks Online', purpose: 'Post draft bills' },
      ],
      setup: [{ ...sample, key: 'holdAboveAmount', title: 'Hold above', control: 'money', section: 'rules', required: false, defaultValue: 500 }],
    }));
    routePlatform(platformOperation, {
      '/automations': catalog,
      // The workspace's connections, not the providers list (`/v1/connections/providers`).
      [`${TEST_WORKSPACE}/connections`]: {
        connections: [
          {
            id: 'c-google',
            providerId: 'google',
            workspaceId: TEST_WORKSPACE,
            externalAccount: { id: 'google-account', displayName: 'Google account' },
            status: 'connected',
            requiredScopes: [],
            grantedScopes: [],
            usedByCount: 0,
          },
        ],
      },
    });
    setMockParams({ template: 'tpl.0' });
    const { getByText } = await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByText('1 · CONNECTIONS')).toBeTruthy();
    expect(getByText('Connected ✓')).toBeTruthy();
    expect(getByText('Post draft bills')).toBeTruthy();
    expect(getByText('2 · REVIEW RULES')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Connect QuickBooks Online'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings');
  });

  it('draws no Connections step when the platform predates `requiredConnections` (the image before the SEVENTEENTH promotion)', async () => {
    const base = catalogPayload();
    const sample = base.automations[0]!.setup[0]!;
    const catalog = {
      ...base,
      automations: base.automations.map((automation) => {
        const entry: Record<string, unknown> = {
          ...automation,
          setup: [{ ...sample, key: 'holdAboveAmount', title: 'Hold above', control: 'money', section: 'rules', required: false, defaultValue: 500 }],
        };
        delete entry.requiredConnections;
        return entry;
      }),
    };
    routePlatform(platformOperation, { '/automations': unpublishedAnswer<RouteOverrides['/automations']>(catalog) });
    setMockParams({ template: 'tpl.0' });
    const { queryByText } = await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByText('1 · REVIEW RULES')).toBeTruthy();
    expect(queryByText(/CONNECTIONS/u)).toBeNull();
  });

  it('keeps a cleared amount cleared, and asks for a number before activating (feedback #4)', async () => {
    const catalog = catalogPayload();
    const sample = catalog.automations[0]!.setup[0]!;
    catalog.automations = catalog.automations.map((automation) => ({
      ...automation,
      setup: [{ ...sample, key: 'holdAboveAmount', title: 'Hold above', control: 'money', section: 'rules', required: false, defaultValue: 500 }],
    }));
    routePlatform(platformOperation, { '/automations': catalog, '/projects': projectsPayload('Finance') });
    setMockParams({ template: 'tpl.0', project: 'project-1' });
    const { getByLabelText, getByText } = await renderWithProviders(<SetupScreen />, signedInSession);
    const amount = await waitFor(() => getByLabelText('Hold above'));
    expect(amount.props.value).toBe('500.00');
    // Rules and notifications only: numbered 1 and 2, not 3 and 4 (feedback #5).
    expect(screen.getByText('1 · REVIEW RULES')).toBeTruthy();
    await fireEvent.changeText(amount, '');
    // The default does not come back under the thumb.
    expect(getByLabelText('Hold above').props.value).toBe('');
    await fireEvent.press(getByText('Activate solution'));
    expect(await screen.findByText('Enter a number for Hold above.')).toBeTruthy();
    expect(platformOperation.mock.calls.some(([path]: [string]) => /\/subscriptions/.test(path) && false)).toBe(false);
  });

  it('adds an archived automation afresh rather than reviving the archived subscription', async () => {
    const catalog = catalogPayload();
    catalog.automations = catalog.automations.map((automation) => ({ ...automation, setup: [] }));
    const archived: Subscription = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'archived-0', status: 'archived' };
    routePlatform(platformOperation, {
      '/automations': catalog,
      '/projects': projectsPayload('Finance'),
      '/subscriptions': { subscriptions: [archived], subscription: { ...archived, id: 'fresh-0', status: 'live' } },
    });
    setMockParams({ template: 'tpl.0' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    // The team is a full-width dropdown since build 13 (#5): open it, then choose.
    await fireEvent.press(await screen.findByTestId('setup-team'));
    await fireEvent.press(screen.getByText('Team: Finance'));
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'fresh-0' } }),
    );
    // Solutions is left at its root first, so Back never shows Setup again.
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/flows');
    const paths: string[] = platformOperation.mock.calls.map(([path]: [string]) => path);
    expect(paths.some((path) => path.endsWith('/subscriptions/archived-0'))).toBe(false);
  });

  /** The catalog with nothing to fill in, the teams, and a client that keeps what a create sends. */
  function routeTeams(projects: RouteOverrides['/projects'], created: unknown[]) {
    const catalog = catalogPayload();
    catalog.automations = catalog.automations.map((automation) => ({ ...automation, setup: [] }));
    routePlatform(platformOperation, {
      '/automations': catalog,
      '/projects': projects,
      '/subscriptions': { subscriptions: [], subscription: { ...planSubscriptionsPayload().subscriptions[0]!, id: 'scoped-0' } },
    });
    const routed = platformOperation.getMockImplementation();
    // Each call to the subscriptions collection also runs against a client that
    // keeps what a create sends; the routed fixture then answers it.
    platformOperation.mockImplementation(async (path: string, execute: Function) => {
      if (/\/subscriptions$/.test(path)) {
        const client = {
          GET: async () => ({ data: {} }),
          POST: async (_p: string, init: { body: unknown }) => {
            created.push(init.body);
            return { data: {} };
          },
        };
        await execute({ automations: client }).catch(() => undefined);
      }
      return routed?.(path, execute);
    });
    setMockParams({ template: 'tpl.0' });
  }

  it('adds a flow to the team chosen — there is no whole-workspace choice, and nothing is sent until one is picked (D4)', async () => {
    const created: unknown[] = [];
    routeTeams(projectsPayload('Finance'), created);
    await renderWithProviders(<SetupScreen />, signedInSession);
    // A full-width dropdown of the open teams (build 13 #5), nothing chosen yet.
    expect(await screen.findByLabelText('Add to: Choose a team')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('setup-team'));
    expect(screen.getByText('Team: Finance')).toBeTruthy();
    expect(screen.queryByText('Whole workspace')).toBeNull();
    await fireEvent.press(screen.getByTestId('setup-team'));
    // No team chosen for the person: Activate refuses in words and sends nothing.
    await fireEvent.press(screen.getByText('Activate solution'));
    expect(await screen.findByText('Pick a team.')).toBeTruthy();
    expect(created).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('setup-team'));
    await fireEvent.press(screen.getByText('Team: Finance'));
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() => expect(created).toHaveLength(1));
    expect((created[0] as { projectId?: string }).projectId).toBe('project-1');
  });

  it('a team the catalog passed is chosen already, and sent (24.9.3)', async () => {
    const created: unknown[] = [];
    routeTeams(projectsPayload('Finance', 'Sales'), created);
    setMockParams({ template: 'tpl.0', project: 'project-2' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Activate solution'));
    await waitFor(() => expect(created).toHaveLength(1));
    expect((created[0] as { projectId?: string }).projectId).toBe('project-2');
    expect(screen.queryByText('Pick a team.')).toBeNull();
  });

  it('with no team yet, an owner or admin creates one first — from Setup — and it is the team chosen (D4)', async () => {
    const created: unknown[] = [];
    const finance = { ...projectsPayload('Finance').projects[0]!, id: 'p-new' };
    let made = false;
    routeTeams({ projects: [] }, created);
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation(async (path: string, execute: Function) => {
      if (path.endsWith('/projects')) {
        const client = {
          GET: async () => ({ data: { projects: made ? [finance] : [] } }),
          POST: async () => {
            made = true;
            return { data: { project: finance } };
          },
        };
        return (await execute({ platform: client })).data;
      }
      return routed?.(path, execute);
    });
    await renderWithProviders(<SetupScreen />, sessionAs('admin'));
    expect(await screen.findByText('Create a team first.')).toBeTruthy();
    expect(screen.queryByText('Add to')).toBeNull();
    // Activate without one sends nothing.
    await fireEvent.press(screen.getByText('Activate solution'));
    expect(await screen.findByText('Pick a team.')).toBeTruthy();
    expect(created).toHaveLength(0);

    await fireEvent.press(screen.getByText('Create a team'));
    expect(await screen.findByTestId('create-team-dialog')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('team-kind'));
    await fireEvent.press(screen.getByTestId('team-kind-option-Finance'));
    const create = await screen.findAllByText('Create team');
    await fireEvent.press(create[create.length - 1]!);
    await fireEvent.press(await screen.findByText('Done'));
    // The team made is the chip, chosen: the flow is added to it.
    expect(await screen.findByText('Team: Finance')).toBeTruthy();
    expect(screen.queryByText('Create a team first.')).toBeNull();
    expect(screen.queryByText('Pick a team.')).toBeNull();
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() => expect(created).toHaveLength(1));
    expect((created[0] as { projectId?: string }).projectId).toBe('p-new');
  });

  it('with no team yet, a plain member is told an owner or admin creates the first one, and has no Activate', async () => {
    const created: unknown[] = [];
    routeTeams({ projects: [] }, created);
    await renderWithProviders(<SetupScreen />, sessionAs('member'));
    expect(await screen.findByText('An owner or admin creates the first team.')).toBeTruthy();
    expect(screen.queryByText('Create a team first.')).toBeNull();
    expect(screen.queryByText('Create a team')).toBeNull();
    expect(screen.queryByText('Activate solution')).toBeNull();
    expect(created).toHaveLength(0);
  });

  /** A team in the organization's directory, and where this person stands with it. */
  const listed = (id: string, kind: string, access: 'member' | 'requested' | 'none') => ({
    id,
    workspaceId: TEST_WORKSPACE,
    name: kind,
    type: kind,
    status: 'active',
    access,
    createdAt: '2026-09-01T00:00:00Z',
  });

  /** The team directory's answer — or its refusal — over whatever the test routed already. */
  function routeDirectory(answer: () => unknown) {
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation(async (path: string, execute: Function) =>
      path.endsWith('/project-directory') ? answer() : routed?.(path, execute),
    );
  }
  const directoryReads = () =>
    platformOperation.mock.calls.filter(([path]: [string]) => path.endsWith('/project-directory')).map(([path]: [string]) => path);

  it('with no team yet, a plain member whose organization has a team to ask onto is told to ask to join one, with See teams — and has no Activate (F84)', async () => {
    // Not on it and not asked yet, or asked already: either way a team they could be on.
    for (const access of ['none', 'requested'] as const) {
      platformOperation.mockReset();
      mockRouter.push.mockClear();
      const created: unknown[] = [];
      routeTeams({ projects: [] }, created);
      routeDirectory(() => ({ projects: [listed('p-ops', 'Operations', access)] }));
      const view = await renderWithProviders(<SetupScreen />, sessionAs('member'));
      expect(await screen.findByText('Ask to join a team first.')).toBeTruthy();
      expect(directoryReads()).toEqual([`/v1/workspaces/${TEST_WORKSPACE}/project-directory`]);
      expect(screen.queryByText('An owner or admin creates the first team.')).toBeNull();
      expect(screen.queryByText('Create a team first.')).toBeNull();
      expect(screen.queryByText('Activate solution')).toBeNull();
      await fireEvent.press(screen.getByText('See teams'));
      expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/teams');
      expect(created).toHaveLength(0);
      await view.unmount();
    }
  });

  it('with no team yet, a plain member whose directory lists nothing to ask onto is still told an owner or admin creates the first one (F84)', async () => {
    // An empty directory, and one listing only a team they can already see.
    for (const directory of [[], [listed('p-ops', 'Operations', 'member')]]) {
      platformOperation.mockReset();
      routeTeams({ projects: [] }, []);
      routeDirectory(() => ({ projects: directory }));
      const view = await renderWithProviders(<SetupScreen />, sessionAs('member'));
      expect(await screen.findByText('An owner or admin creates the first team.')).toBeTruthy();
      expect(directoryReads()).toHaveLength(1);
      expect(screen.queryByText('Ask to join a team first.')).toBeNull();
      expect(screen.queryByText('See teams')).toBeNull();
      expect(screen.queryByText('Activate solution')).toBeNull();
      await view.unmount();
    }
  });

  it('a platform with no directory yet (404) leaves a plain member the owner-or-admin line, and Setup still draws (F84)', async () => {
    const { PlatformError } = jest.requireActual('@/lib/platform/problem');
    routeTeams({ projects: [] }, []);
    routeDirectory(() => Promise.reject(new PlatformError('Not found', 404)));
    await renderWithProviders(<SetupScreen />, sessionAs('member'));
    expect(await screen.findByText('An owner or admin creates the first team.')).toBeTruthy();
    expect(screen.getByText('One-time setup')).toBeTruthy();
    expect(screen.queryByText("Couldn't load this setup")).toBeNull();
    expect(screen.queryByText('Ask to join a team first.')).toBeNull();
  });

  it('an owner or admin with no team is offered Create a team first, whatever the directory lists — their line comes first (F84)', async () => {
    for (const role of ['owner', 'admin'] as const) {
      platformOperation.mockReset();
      routeTeams({ projects: [] }, []);
      routeDirectory(() => ({ projects: [listed('p-ops', 'Operations', 'none')] }));
      const view = await renderWithProviders(<SetupScreen />, sessionAs(role));
      expect(await screen.findByText('Create a team first.')).toBeTruthy();
      expect(screen.getByText('Create a team')).toBeTruthy();
      expect(screen.getByText('Activate solution')).toBeTruthy();
      expect(screen.queryByText('Ask to join a team first.')).toBeNull();
      expect(screen.queryByText('See teams')).toBeNull();
      await view.unmount();
    }
  });

  it('reads the directory only where there is no team to add to: with a team, the chips and no directory read (F84)', async () => {
    routeTeams(projectsPayload('Finance'), []);
    routeDirectory(() => ({ projects: [listed('p-ops', 'Operations', 'none')] }));
    await renderWithProviders(<SetupScreen />, sessionAs('member'));
    expect(await screen.findByTestId('setup-team')).toBeTruthy();
    expect(screen.queryByText('Ask to join a team first.')).toBeNull();
    expect(directoryReads()).toEqual([]);
  });

  it('generates its sections from manifest.setup[]', async () => {
    setMockParams({ template: 'tpl.0' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    // Generated, not hardcoded — BUILD-PLAN 4.5.3.
    expect(await screen.findByText('QuickBooks Online')).toBeTruthy();
    expect(screen.getByText('Watch inbox')).toBeTruthy();
    expect(screen.getByText('1 · CONNECTIONS')).toBeTruthy();
  });

  /** The catalog with nothing to fill in, and the subscriptions `/subscriptions` answers. */
  function routeUnmet(subscriptions: Subscription[], subscription: Subscription) {
    const catalog = catalogPayload();
    catalog.automations = catalog.automations.map((automation) => ({ ...automation, setup: [] }));
    routePlatform(platformOperation, { '/automations': catalog, '/subscriptions': { subscriptions, subscription } });
    setMockParams({ template: 'tpl.0' });
  }

  it('names the page an account is connected on — Settings › Connections — while one is missing (24.12)', async () => {
    const waiting = { ...planSubscriptionsPayload().subscriptions[0]!, projectId: 'project-1', unmetConnections: ['hubspot'] };
    routeUnmet([waiting], waiting);
    routePlatform(platformOperation, {
      '/automations': { ...catalogPayload(), automations: catalogPayload().automations.map((automation) => ({ ...automation, setup: [] })) },
      '/projects': projectsPayload('Finance'),
      '/subscriptions': { subscriptions: [waiting], subscription: waiting },
    });
    setMockParams({ template: 'tpl.0', project: 'project-1' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByText('Connect HubSpot in Settings › Connections')).toBeTruthy();
  });

  it('names that page when the flow it just added still needs an account (24.12)', async () => {
    const added = { ...planSubscriptionsPayload().subscriptions[0]!, unmetConnections: ['hubspot'] };
    routeUnmet([], added);
    routePlatform(platformOperation, {
      '/automations': { ...catalogPayload(), automations: catalogPayload().automations.map((automation) => ({ ...automation, setup: [] })) },
      '/projects': projectsPayload('Finance'),
      '/subscriptions': { subscriptions: [], subscription: added },
    });
    setMockParams({ template: 'tpl.0', project: 'project-1' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Activate solution'));
    expect(
      await screen.findByText('Connect the required providers in Settings › Connections, then return to activate.'),
    ).toBeTruthy();
  });
});

/* ------------------------------------------------- flow history: the tiles (24.11.9) */

describe('Flow history — the tiles open Activity (24.11.9)', () => {
  it('a Home stat tile opens Activity for that outcome', async () => {
    const { getByTestId } = await renderWithProviders(<HomeScreen />, signedInSession);
    // And for today, the window its number counts (the owner's build 12 item 1).
    await fireEvent.press(getByTestId('stat-Failed'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/activity',
      params: { filter: 'Failed', period: 'today' },
    });
    await fireEvent.press(getByTestId('stat-Success'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/activity',
      params: { filter: 'Success', period: 'today' },
    });
    await fireEvent.press(getByTestId('stat-All'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/activity', params: { filter: 'All', period: 'today' } });
  });

  it("a flow page's three tiles open Activity for this flow and that outcome", async () => {
    setMockParams({ flow: 'invoice' });
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    const { getByTestId } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    await screen.findByText('Invoice triage');
    await fireEvent.press(getByTestId('flow-stat-Failed'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/activity',
      params: { flow: 'invoice', flowName: 'Invoice triage', filter: 'Failed' },
    });
    await fireEvent.press(getByTestId('flow-stat-All'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/activity',
      params: { flow: 'invoice', flowName: 'Invoice triage', filter: 'All' },
    });
  });

  it('Activity arrives with the flow and the outcome, shows the flow as a chip, and the chip clears it', async () => {
    setMockParams({ flow: 'invoice', flowName: 'Invoice triage', filter: 'Failed' });
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(await screen.findByText('Invoice triage ✕')).toBeTruthy();
    // The outcome arrived too: a failed row is drawn and a successful one is not.
    expect(getAllByText(/Sheets auth expired/).length).toBeGreaterThan(0);
    expect(queryByText(/posted to QuickBooks/)).toBeNull();
    await fireEvent.press(getByText('Invoice triage ✕'));
    expect(queryByText('Invoice triage ✕')).toBeNull();
  });

  it('a flow nobody ran reads as its own empty, not as a workspace with no runs', async () => {
    setMockParams({ flow: 'kpi', flowName: 'Weekly KPI digest', filter: 'All' });
    const { findByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(await findByText('No runs for Weekly KPI digest yet.')).toBeTruthy();
  });
});

/* --------------------------------- Home's tiles: today's, said and opened (build 12 item 1) */

/**
 * The owner's build 12 item 1: "Why do i see 0 numbers for the runs if we have
 * activities? Also i thought i said they should be buttons to see the actual
 * numbers". Home counts today (run-stats?since=<local midnight>, §12.1 #73),
 * which only one tile of three said; the tiles had opened Activity since 24.11.9
 * but looked like static cards; and a tile opened every run, not the ones it
 * counted. Now: TODAY over the row, a caret and a pressed tint on every stat
 * tile, and a Home tile opens Activity with its outcome AND today.
 */
describe("Home's tiles count today, say so, and open today's runs (the owner's build 12 item 1)", () => {
  /** Runs today (2 succeeded, 1 failed, 1 held), yesterday and ten days ago, in the platform's order. */
  function todayAndOlder() {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const older = new Date(now);
    older.setDate(now.getDate() - 10);
    const base = runsPayload().runs[0]!;
    const run = (id: string, status: Run['status'], at: Date): Run => ({
      ...base,
      id,
      rootRunId: id,
      status,
      resultSummary: status === 'succeeded' ? `Summary ${id}` : undefined,
      failureReason: status === 'failed' ? `Reason ${id}` : undefined,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
    });
    return [
      run('today-ok-1', 'succeeded', now),
      run('today-ok-2', 'succeeded', now),
      run('today-failed', 'failed', now),
      run('today-held', 'held', now),
      run('yesterday-ok', 'succeeded', yesterday),
      run('yesterday-failed', 'failed', yesterday),
      run('older-ok', 'succeeded', older),
      run('older-failed', 'failed', older),
    ];
  }

  /**
   * The platform's run-stats, counted as it counts (created_at >= since, every
   * status in the total; snoopy-backend apps/runs/src/postgres-stats.ts) from the
   * same runs the list answers with — so a tile's number and the list it opens
   * come from one set of runs, as on the device.
   */
  function routeRuns(runs: ReturnType<typeof todayAndOlder>) {
    routePlatform(platformOperation, { '/runs': { runs } });
    const routed = platformOperation.getMockImplementation();
    platformOperation.mockImplementation((path: string, ...rest: unknown[]) => {
      if (!path.includes('/run-stats')) return routed?.(path, ...rest);
      const since = new URLSearchParams(path.split('?')[1] ?? '').get('since');
      const counted = since ? runs.filter((run) => new Date(run.createdAt) >= new Date(since)) : runs;
      const of = (status: string) => counted.filter((run) => run.status === status).length;
      const counts = { total: counted.length, pending: 0, running: 0, held: of('held'), succeeded: of('succeeded'), failed: of('failed'), cancelled: 0 };
      return Promise.resolve({ workspace: counts, subscriptions: [{ subscriptionId: 'invoice', ...counts }] });
    });
  }

  it('says its window once, over the row: TODAY, then Runs, Successes, Failures — the greeting as it was', async () => {
    await renderWithProviders(<HomeScreen />, signedInSession);
    expect(await screen.findByText('Your agents ran 128 tasks today.')).toBeTruthy();
    const row = screen.getByTestId('home-stats');
    // TODAY is the label of the group the row sits in, drawn first, as RECENT RUNS heads its card.
    expect(within(row.parent!).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'TODAY',
      '128',
      'Runs',
      '124',
      'Successes',
      '4',
      'Failures',
    ]);
    expect(screen.queryByText('Runs today')).toBeNull();
    // Still today's: the read is run-stats?since=<local midnight> (§12.1 #73).
    expect(platformOperation).toHaveBeenCalledWith(
      `/v1/workspaces/${TEST_WORKSPACE}/run-stats?since=${encodeURIComponent(new Date(new Date().setHours(0, 0, 0, 0)).toISOString())}`,
      expect.any(Function),
    );
  });

  it('every stat tile looks like the button it is, on Home and on a flow page: a caret on each, and the tint while pressed', async () => {
    const home = await renderWithProviders(<HomeScreen />, signedInSession);
    await home.findByText('Welcome back, Alex');
    for (const id of ['stat-All', 'stat-Success', 'stat-Failed']) {
      expect(home.getByTestId(`${id}-caret`)).toBeTruthy();
      expect(home.getByTestId(id).props.accessibilityRole).toBe('button');
    }
    // Pressed, the review banner's accent tint is drawn over the tile; let go, it goes.
    const tile = home.getByTestId('stat-Success');
    expect(home.queryByTestId('stat-Success-pressed')).toBeNull();
    await fireEvent(tile, 'responderGrant', touch('onResponderGrant'));
    expect(StyleSheet.flatten(home.getByTestId('stat-Success-pressed').props.style).backgroundColor).toBe(
      `rgba(145,132,217,0.15)`,
    );
    await fireEvent(tile, 'responderRelease', touch('onResponderRelease'));
    await waitFor(() => expect(home.queryByTestId('stat-Success-pressed')).toBeNull());
    await home.unmount();

    setMockParams({ flow: 'invoice' });
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    const flowPage = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    await flowPage.findByText('Invoice triage');
    for (const id of ['flow-stat-All', 'flow-stat-Success', 'flow-stat-Failed']) {
      expect(flowPage.getByTestId(`${id}-caret`)).toBeTruthy();
      expect(flowPage.getByTestId(id).props.accessibilityRole).toBe('button');
    }
    await fireEvent(flowPage.getByTestId('flow-stat-All'), 'responderGrant', touch('onResponderGrant'));
    expect(flowPage.getByTestId('flow-stat-All-pressed')).toBeTruthy();
  });

  it("each Home tile's number is the rows it opens: today's runs by outcome, the older ones left out (All teams)", async () => {
    const runs = todayAndOlder();
    routeRuns(runs);
    const home = await renderWithProviders(<HomeScreen />, signedInSession);
    await home.findByText('Welcome back, Alex');
    const tiles = [
      ['stat-All', '4'],
      ['stat-Success', '2'],
      ['stat-Failed', '1'],
    ] as const;
    const opened: { id: string; number: string; params: Record<string, string> }[] = [];
    for (const [id, number] of tiles) {
      expect(within(home.getByTestId(id)).getAllByText(/./u)[0]!.props.children).toBe(number);
      mockRouter.push.mockClear();
      await fireEvent.press(home.getByTestId(id));
      opened.push({ id, number, params: mockRouter.push.mock.calls[0]![0].params });
    }
    await home.unmount();

    for (const { id, number, params } of opened) {
      setMockParams(params);
      const activity = await renderWithProviders(<ActivityScreen />, signedInSession);
      // Today, on the time range (the owner's build 13 decision 4; a Today ✕ chip until build 14).
      expect(await activity.findByLabelText('Time range: Today')).toBeTruthy();
      const rows = activity.queryAllByTestId(/^activity-row-/u).map((row) => row.props.testID);
      // The number on the tile is the rows it opened — today's, nothing older.
      expect([id, String(rows.length)]).toEqual([id, number]);
      expect(rows.every((testID: string) => testID.startsWith('activity-row-today-'))).toBe(true);
      expect(activity.queryByText('YESTERDAY')).toBeNull();
      expect(activity.queryByText('EARLIER')).toBeNull();
      await activity.unmount();
    }
  });

  it("Activity arriving with today and Failed lists only today's failed runs; the time range says Today, and choosing All time there lists every failed run again — and Today again after it (the owner's build 13 decision 4; until build 14 a Today ✕ chip on a row of its own, which could only clear)", async () => {
    routeRuns(todayAndOlder());
    setMockParams({ filter: 'Failed', period: 'today' });
    await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(await screen.findByLabelText('Time range: Today')).toBeTruthy();
    expect(screen.queryAllByTestId(/^activity-row-/u).map((row) => row.props.testID)).toEqual(['activity-row-today-failed']);
    // No chip for the day: the range is the button's word, and no selection row is drawn without a flow.
    expect(screen.queryByText('Today ✕')).toBeNull();
    expect(screen.queryByTestId('activity-selection')).toBeNull();
    expect(within(screen.getByTestId('activity-outcomes')).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'All',
      'Success',
      'Needs review',
      'Failed',
    ]);

    await fireEvent.press(screen.getByLabelText('Time range: Today'));
    await fireEvent.press(within(screen.getByTestId('activity-range-dialog')).getByTestId('activity-range-all'));
    expect(screen.queryByTestId('activity-range-dialog')).toBeNull();
    expect(screen.getByLabelText('Time range: All time')).toBeTruthy();
    // Every failed run again, under its day; the outcome stays as chosen.
    expect(screen.getByText('YESTERDAY')).toBeTruthy();
    expect(screen.getByText('EARLIER')).toBeTruthy();
    expect(screen.queryAllByTestId(/^activity-row-/u).map((row) => row.props.testID)).toEqual([
      'activity-row-today-failed',
      'activity-row-yesterday-failed',
      'activity-row-older-failed',
    ]);

    // What the chip could never do: Today, chosen again.
    await fireEvent.press(screen.getByLabelText('Time range: All time'));
    await fireEvent.press(within(screen.getByTestId('activity-range-dialog')).getByTestId('activity-range-today'));
    expect(screen.getByLabelText('Time range: Today')).toBeTruthy();
    expect(screen.queryAllByTestId(/^activity-row-/u).map((row) => row.props.testID)).toEqual(['activity-row-today-failed']);
  });

  it('with no run today but older ones, each tile\'s list says so: No runs today. / No successful runs today. / No failed runs today.', async () => {
    routeRuns(todayAndOlder().filter((run) => !run.id.startsWith('today-')));
    for (const [filter, line] of [
      ['All', 'No runs today.'],
      ['Success', 'No successful runs today.'],
      ['Failed', 'No failed runs today.'],
    ] as const) {
      setMockParams({ filter, period: 'today' });
      const activity = await renderWithProviders(<ActivityScreen />, signedInSession);
      expect(await activity.findByText(line)).toBeTruthy();
      expect(activity.queryAllByTestId(/^activity-row-/u)).toHaveLength(0);
      // Not the first-run empty: the workspace has runs, just none today.
      expect(activity.queryByText('No activity yet')).toBeNull();
      await activity.unmount();
    }
  });

  it("a flow page's chip sits on the same row, above the outcomes, and its tiles bring no day: they count all time", async () => {
    setMockParams({ flow: 'invoice', flowName: 'Invoice triage', filter: 'Failed' });
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(await screen.findByText('Invoice triage ✕')).toBeTruthy();
    expect(within(screen.getByTestId('activity-selection')).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'Invoice triage ✕',
    ]);
    expect(within(screen.getByTestId('activity-outcomes')).queryByText('Invoice triage ✕')).toBeNull();
    // All time: no day was chosen (the time range since the owner's build 13 decision 4), so yesterday's failed run is listed.
    expect(screen.getByLabelText('Time range: All time')).toBeTruthy();
    expect(screen.getByText('YESTERDAY')).toBeTruthy();
  });

  it('opening Activity from the tab bar after a tile visit leaves Today as it was', async () => {
    routeRuns(todayAndOlder());
    setMockParams({ filter: 'Success', period: 'today' });
    const view = await renderWithProviders(<ActivityScreen />, signedInSession);
    expect(await view.findByLabelText('Time range: Today')).toBeTruthy();
    expect(view.queryAllByTestId(/^activity-row-/u)).toHaveLength(2);
    // The tab bar arrives with nothing, and changes nothing: the screen draws again
    // with no params (an outcome chosen here), and today is still the day chosen.
    setMockParams({});
    await fireEvent.press(view.getByText('All'));
    expect(view.getByLabelText('Time range: Today')).toBeTruthy();
    expect(view.queryAllByTestId(/^activity-row-/u)).toHaveLength(4);
    expect(view.queryByText('YESTERDAY')).toBeNull();
  });
});

/* ------------------------------------------------ archived flows (24.11.8) */

function withRemovedFlow(invoiceToo = false) {
  const base = subscriptionsPayload().subscriptions;
  const rows = base.map((row): Subscription => (invoiceToo && row.id === 'invoice' ? { ...row, status: 'archived' } : row));
  const gone: Subscription = { ...base[0]!, id: 'gone', name: 'Old intake', status: 'archived', updatedAt: '2026-09-30T12:00:00Z' };
  routePlatform(platformOperation, {
    '/automations': flowCatalogPayload(),
    '/subscriptions': { subscriptions: [...rows, gone], subscription: rows[0] },
  });
}

describe('Archived flows (24.11.8; "Archived" since 24.12)', () => {
  it('Flows offers Archived as a header button, left of New, which opens the page — no row on the page, under a no-match search either (build 11, D5)', async () => {
    withRemovedFlow();
    const { findByText, queryByText } = await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await findByText('Invoice triage')).toBeTruthy();
    // As drawn: Archived, then New.
    expect(screen.getAllByText(/^(Archived|New)$/u).map((label) => label.props.children)).toEqual(['Archived', 'New']);
    expect(queryByText(/^Archived flows/u)).toBeNull();
    expect(queryByText('Old intake')).toBeNull();
    await fireEvent.press(screen.getByTestId('flows-archived'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/archived');
    // Under a search with no match: the header, still; no row.
    await fireEvent.changeText(screen.getByPlaceholderText('Search flows'), 'zzz');
    expect(screen.getByText('No flows match "zzz".')).toBeTruthy();
    expect(screen.getByTestId('flows-archived')).toBeTruthy();
    expect(queryByText(/^Archived flows/u)).toBeNull();
  });

  it("the Archived page lists them, read-only, and is the empty standard when there are none — each saying unarchive (the owner's build 12 item 4)", async () => {
    withRemovedFlow();
    const { findByText, getByText } = await renderWithProviders(<ArchivedFlowsScreen />, signedInSession);
    expect(await findByText('Old intake')).toBeTruthy();
    expect(getByText('Archived flows')).toBeTruthy();
    expect(getByText('An archived flow keeps its history here. Unarchive it any time.')).toBeTruthy();
    expect(getByText('Archived Sep 30, 2026')).toBeTruthy();
    await fireEvent.press(getByText('Old intake'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'gone' } });

    resetSnapshot();
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    const empty = await renderWithProviders(<ArchivedFlowsScreen />, signedInSession);
    expect(await empty.findByTestId('screen-empty')).toBeTruthy();
    expect(empty.getByText('No archived flows')).toBeTruthy();
    expect(empty.getByText('A flow you archive keeps its history here, and you can unarchive it.')).toBeTruthy();
    await fireEvent.press(empty.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('the Settings copy opens an archived flow in the Settings stack, so Back returns to Settings', async () => {
    withRemovedFlow();
    const { findByText } = await renderWithProviders(<SettingsArchivedFlowsScreen />, signedInSession);
    await fireEvent.press(await findByText('Old intake'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/settings/archived-flow', params: { flow: 'gone' } });

    // With none, the Settings copy is the same empty standard, with its way back.
    resetSnapshot();
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    const empty = await renderWithProviders(<SettingsArchivedFlowsScreen />, signedInSession);
    expect(await empty.findByText('No archived flows')).toBeTruthy();
    await fireEvent.press(empty.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("an archived flow's page opens instead of \"Couldn't load\": no actions, its history, and Unarchive where no live twin exists — Add it again renamed, still Setup for its flow (the owner's build 12 item 4)", async () => {
    setMockParams({ flow: 'gone' });
    // The live 'invoice' row is archived too: nothing live holds this template in the workspace.
    withRemovedFlow(true);
    const { findByText, queryByText, getByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await findByText('Old intake')).toBeTruthy();
    expect(getByText('Archived')).toBeTruthy();
    expect(
      getByText('This flow was archived on Sep 30, 2026. Its runs stay in Activity, and you can unarchive it — its setup starts fresh.'),
    ).toBeTruthy();
    expect(queryByText("Couldn't load this flow")).toBeNull();
    expect(queryByText('Archive flow')).toBeNull();
    expect(queryByText('Pause')).toBeNull();
    expect(queryByText('Open the live flow')).toBeNull();
    expect(queryByText('Add it again')).toBeNull();
    await fireEvent.press(getByText('Unarchive'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/setup',
      params: { template: 'tplflow.invoice' },
    });
  });

  it("offers no Unarchive once the flow is live again in the same scope: it says so and opens the live flow (build 11, D3; the owner's build 10 items 5, 6 and 11; Unarchive since the owner's build 12 item 4)", async () => {
    setMockParams({ flow: 'gone' });
    // `gone` shares its template and its scope (the whole workspace) with the LIVE 'invoice' row.
    withRemovedFlow();
    const { findByText, queryByText, getByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await findByText('Old intake')).toBeTruthy();
    expect(getByText('Archived')).toBeTruthy();
    expect(
      getByText('This flow was archived on Sep 30, 2026. Its runs stay in Activity. It has been added again, and the new copy is in Flows.'),
    ).toBeTruthy();
    expect(queryByText('Unarchive')).toBeNull();
    expect(queryByText(/unarchive it — its setup starts fresh/u)).toBeNull();
    await fireEvent.press(getByText('Open the live flow'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'invoice' } });
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/(tabs)/flows/setup' }));
  });

  it("offers no Unarchive when the live copy is another team's: that copy is the twin, and it opens (the owner's build 12 item 9: one flow per workspace; until build 13 the whole workspace matched the whole workspace only)", async () => {
    setMockParams({ flow: 'gone' });
    const base = subscriptionsPayload().subscriptions;
    // The template is live again, in a team: not this archived row's scope, and still its twin.
    const rows = base.map((row) => (row.id === 'invoice' ? { ...row, projectId: 'project-1' } : row));
    const gone: Subscription = { ...base[0]!, id: 'gone', name: 'Old intake', status: 'archived', updatedAt: '2026-09-30T12:00:00Z' };
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/projects': projectsPayload('Finance'),
      '/subscriptions': { subscriptions: [...rows, gone], subscription: rows[0] },
    });
    const { findByText, queryByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(
      await findByText('This flow was archived on Sep 30, 2026. Its runs stay in Activity. It has been added again, and the new copy is in Flows.'),
    ).toBeTruthy();
    expect(queryByText('Unarchive')).toBeNull();
    await fireEvent.press(await findByText('Open the live flow'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'invoice' } });
  });

  it('the Settings copy opens the live flow in the Settings stack, so Back returns to Settings', async () => {
    setMockParams({ flow: 'gone' });
    withRemovedFlow();
    const { findByText } = await renderWithProviders(<SettingsArchivedFlowScreen />, signedInSession);
    await fireEvent.press(await findByText('Open the live flow'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/settings/archived-flow', params: { flow: 'invoice' } });
  });

  it("a run whose flow was archived says so on its row", async () => {
    withRemovedFlow(true);
    const { findAllByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    expect((await findAllByText(/Flow archived/)).length).toBeGreaterThan(0);
  });

  it("Settings offers the Archived flows page, in Settings' own stack", async () => {
    const { findByText } = await renderWithProviders(<SettingsScreen />, signedInSession);
    await fireEvent.press(await findByText('Archived flows'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/archived');
  });
});

/* ------------------------------------------------ flows with no live flow (build 11, D6) */

describe('Flows with no live flow (build 11, D6)', () => {
  it("is the empty standard whatever is archived — Activity's format — with the way to the archived ones under Add a flow (the owner's build 10 items 8 and 9)", async () => {
    const gone: Subscription = { ...subscriptionsPayload().subscriptions[0]!, id: 'gone', name: 'Old intake', status: 'archived' };
    routePlatform(platformOperation, { '/automations': flowCatalogPayload(), '/subscriptions': { subscriptions: [gone] } });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByTestId('screen-empty')).toBeTruthy();
    expect(screen.getByText('No flows yet')).toBeTruthy();
    expect(screen.getByText('Add a prebuilt flow — your first one can be live in minutes.')).toBeTruthy();
    // Not the team's inline line, and not the old counted row.
    expect(screen.queryByText('No flows in this team yet')).toBeNull();
    expect(screen.queryByText(/^Archived flows \(/u)).toBeNull();
    expect(screen.queryByText('Old intake')).toBeNull();
    await fireEvent.press(screen.getByText('Add a flow'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/add');
    await fireEvent.press(screen.getByText('Archived flows'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/archived');
  });

  it('offers no Archived flows button when nothing is archived', async () => {
    routePlatform(platformOperation, { '/automations': flowCatalogPayload(), '/subscriptions': { subscriptions: [] } });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByTestId('screen-empty')).toBeTruthy();
    expect(screen.getByText('Add a flow')).toBeTruthy();
    expect(screen.queryByText('Archived flows')).toBeNull();
  });

  it('keeps the inline line for a team with no flow while the workspace has some, so the scope control stays', async () => {
    const subscriptions = subscriptionsPayload();
    subscriptions.subscriptions = subscriptions.subscriptions.map((row) => ({ ...row, projectId: null }));
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/subscriptions': subscriptions,
      '/projects': projectsPayload('Finance'),
    });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    await screen.findByText('Invoice triage');
    await fireEvent.press(screen.getByLabelText('Team: All teams'));
    await fireEvent.press(await screen.findByTestId('scope-option-project-1'));
    expect(await screen.findByText('No flows in this team yet')).toBeTruthy();
    expect(screen.queryByTestId('screen-empty')).toBeNull();
    expect(screen.getByTestId('scope-control')).toBeTruthy();
  });
});
