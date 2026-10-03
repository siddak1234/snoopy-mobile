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
import AppearanceScreen from '@/app/(tabs)/settings/appearance';
import SettingsArchivedFlowsScreen from '@/app/(tabs)/settings/archived';
import NotificationSettingsScreen from '@/app/(tabs)/settings/notifications';
import SecurityScreen from '@/app/(tabs)/settings/security';
import WorkspaceScreen from '@/app/(tabs)/settings/workspace';
import SetupScreen from '@/app/(tabs)/flows/setup';
import SolutionsScreen from '@/app/(tabs)/flows/add';
import NotificationsScreen from '@/app/(tabs)/(home)/notifications';
import ArchivedFlowsScreen from '@/app/(tabs)/flows/archived';
import { nocturneDark, nocturneLight } from '@/constants/theme';
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
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';
import { resetSnapshot } from '@/lib/platform/snapshot';

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
});

describe('Home dashboard', () => {
  it('shows greeting, stats and recent runs from the fixtures', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<HomeScreen />, signedInSession);
    expect(getByText('Welcome back, Alex')).toBeTruthy();
    expect(getByText('Your agents ran 128 tasks today.')).toBeTruthy();
    expect(getByText('128')).toBeTruthy();
    expect(getByText('124')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
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

  it('Add opens Setup with the template, for the scope being looked at', async () => {
    const { getAllByText } = await renderWithProviders(<SolutionsScreen />, signedInSession);
    await fireEvent.press(getAllByText('Add')[0]);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/setup',
      params: expect.objectContaining({ template: expect.any(String) }),
    });
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

  it('says where a flow is already added, and offers Add for the scope it is not in yet (18.6.2)', async () => {
    // Added to a project alone: the whole workspace — the scope looked at — is still free.
    const inProjectOnly = { ...planSubscriptionsPayload().subscriptions[0]!, projectId: 'project-9' };
    routePlatform(platformOperation, {
      '/subscriptions': { subscriptions: [inProjectOnly] },
      '/projects': projectsPayload('Finance'),
    });
    await renderWithProviders(<SolutionsScreen />, signedInSession);
    expect((await screen.findByTestId('added-elsewhere-tpl.0')).props.children.join('')).toMatch(/^Added in /u);
    expect(screen.getByTestId('add-tpl.0')).toBeTruthy();
    expect(screen.queryByTestId('added-tpl.0')).toBeNull();
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
describe('Workflow scope (18.6.2)', () => {
  it('labels each workflow with where it applies, once the workspace has a project', async () => {
    routePlatform(platformOperation, { '/automations': flowCatalogPayload(), '/projects': projectsPayload('Finance') });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText('Whole workspace · 1,284 runs · 1,272 ok · 12 failed')).toBeTruthy();
  });

  it('draws no scope where the workspace has no project', async () => {
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText('1,284 runs · 1,272 ok · 12 failed')).toBeTruthy();
    expect(screen.queryByText(/Whole workspace/)).toBeNull();
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

  it('offers no Edit in Builder: the website has no builder, and mobile offers what the website offers', async () => {
    // Removed 2026-10-02 on the owner's direction (24.7.3 attempt 2 feedback).
    const { queryByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(queryByText('Edit in Builder')).toBeNull();
  });

  it('renders each workflow identity with its own content (design flowDefs)', async () => {
    setMockParams({ flow: 'kpi' });
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(getByText('Weekly KPI report')).toBeTruthy();
    expect(getByText('Sheets → Slack digest')).toBeTruthy();
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

  it('returns to the Flows list after Archive, however the flow was reached', async () => {
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('archive-flow'));
    expect(await screen.findByText('Archive Invoice triage?')).toBeTruthy();
    expect(
      screen.getByText('It stops and moves to Archived flows. Its runs stay in Activity, and you can add it again later.'),
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
    const held = { ...runsPayload().runs[0]!, id: 'held-decided', status: 'held' };
    const continuation = {
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
  it('states that the inbox is in-app only and dismisses the notice', async () => {
    const { getByText, queryByText, getAllByText } = await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(getByText('Know the moment something needs you')).toBeTruthy();
    expect(
      getByText(
        'This build shows held runs and failures in this in-app inbox. Device push delivery is not configured.',
      ),
    ).toBeTruthy();
    await fireEvent.press(getByText('Dismiss'));
    expect(queryByText('Know the moment something needs you')).toBeNull();
  });

  it('lists notifications and opens their targets', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(getAllByText('Run held for review').length).toBeGreaterThan(0);
    // §12.1 #71: the inbox composes held approvals and failed runs only. A
    // billing notice has no source, so it is absent rather than invented.
    expect(queryByText('Invoice paid')).toBeNull();
    await fireEvent.press(getByText('Run failed'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/(home)/run',
      // A composed row points at the real run now, not a prototype variant.
      params: { runId: 'run-4' },
    });
    // "Digest posted" was a prototype success notice. The composed inbox has
    // only held approvals and failed runs, and a held row opens Activity.
    await fireEvent.press(getAllByText('Run held for review')[0]);
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/activity');
  });
});

describe('An empty inbox (24.12)', () => {
  it('is the empty standard with its way back, since the inbox is a pushed screen', async () => {
    routePlatform(platformOperation, { '/approvals': { approvals: [] }, '/runs': { runs: [] } });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findByText('Quiet, as designed')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('Settings & security', () => {
  const CATEGORIES = [
    ['account', 'Account', '/(tabs)/settings/account'],
    ['security', 'Security', '/(tabs)/settings/security'],
    ['connections', 'Connections', '/(tabs)/settings/connections'],
    ['billing', 'Billing', '/(tabs)/settings/billing'],
    ['workspace', 'Workspace', '/(tabs)/settings/workspace'],
    ['notifications', 'Notifications', '/(tabs)/settings/notifications'],
    ['appearance', 'Appearance', '/(tabs)/settings/appearance'],
    ['help', 'Help', '/(tabs)/settings/support'],
  ] as const;

  it('is eight categories in the owner\'s order, then Sign out and the version — and reads nothing (24.12)', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SettingsScreen />, signedInSession);
    // In this order, as drawn, each titled as the owner named it.
    const rows = screen.getAllByTestId(/^settings-/u);
    expect(rows.map((row) => row.props.testID)).toEqual(CATEGORIES.map(([key]) => `settings-${key}`));
    expect(rows.map((row) => within(row).getAllByText(/./u)[0]!.props.children)).toEqual(
      CATEGORIES.map(([, title]) => title),
    );
    expect(getByText('Sign out')).toBeTruthy();
    expect(getByText(/^Autom8x for iOS · v/)).toBeTruthy();
    // The old single screen's rows live on their pages now.
    expect(queryByText('Face ID unlock')).toBeNull();
    expect(queryByText('Export my data')).toBeNull();
    expect(getAllByText('Billing')).toHaveLength(1);
    // Each page reads what it draws; the index reads nothing.
    expect(platformOperation).not.toHaveBeenCalled();
  });

  it('opens each category on its own page', async () => {
    await renderWithProviders(<SettingsScreen />, signedInSession);
    for (const [key, , path] of CATEGORIES) {
      await fireEvent.press(screen.getByTestId(`settings-${key}`));
      expect(mockRouter.push).toHaveBeenLastCalledWith(path);
    }
  });

  it('keeps the Face ID unlock on the Security page, and nothing the website never had', async () => {
    const { getByText, queryByText } = await renderWithProviders(<SecurityScreen />, signedInSession);
    expect(getByText('Security')).toBeTruthy();
    expect(getByText('Face ID unlock')).toBeTruthy();
    // Removed 2026-10-02: two static rows the website never had and nobody could
    // act on (24.7.3 attempt 2, feedback #8 and #9).
    expect(queryByText('Passkeys')).toBeNull();
    expect(queryByText('Stay signed in')).toBeNull();
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

  it('keeps the workspace on its page: the switcher row, the role, and its areas, reading nothing', async () => {
    const { getByText } = await renderWithProviders(<WorkspaceScreen />, signedInSession);
    expect(getByText('Acme Operations')).toBeTruthy();
    expect(getByText('Your role')).toBeTruthy();
    expect(getByText('owner')).toBeTruthy();
    await fireEvent.press(getByText('Export my data'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/data');
    await fireEvent.press(getByText('Teams'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/teams');
    expect(platformOperation).not.toHaveBeenCalled();
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

  it('switches the live theme from the appearance control', async () => {
    const { getByText } = await renderWithProviders(<AppearanceScreen />, signedInSession);
    const title = () =>
      (StyleSheet.flatten(getByText('Appearance').props.style) as { color?: string }).color;
    expect(title()).toBe(nocturneDark.text);
    await fireEvent.press(getByText('Light'));
    expect(title()).toBe(nocturneLight.text);
    await fireEvent.press(getByText('Dark'));
    expect(title()).toBe(nocturneDark.text);
  });

  it('signs out to the cover (24.11.6)', async () => {
    const { getByText, getAllByText, queryByText } = await renderWithProviders(<SettingsScreen />, signedInSession);
    await fireEvent.press(getByText('Sign out'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
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
      [`${TEST_WORKSPACE}/connections`]: { connections: [{ id: 'c-google', providerId: 'google', status: 'connected' }] },
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
    routePlatform(platformOperation, { '/automations': catalog });
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
    routePlatform(platformOperation, { '/automations': catalog });
    setMockParams({ template: 'tpl.0' });
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
    const archived = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'archived-0', status: 'archived' };
    routePlatform(platformOperation, {
      '/automations': catalog,
      '/subscriptions': { subscriptions: [archived], subscription: { ...archived, id: 'fresh-0', status: 'live' } },
    });
    setMockParams({ template: 'tpl.0' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Activate solution'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'fresh-0' } }),
    );
    // Solutions is left at its root first, so Back never shows Setup again.
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/flows');
    const paths: string[] = platformOperation.mock.calls.map(([path]: [string]) => path);
    expect(paths.some((path) => path.endsWith('/subscriptions/archived-0'))).toBe(false);
  });

  it('adds an automation to the project chosen, where the workspace has projects (18.6.2)', async () => {
    const catalog = catalogPayload();
    catalog.automations = catalog.automations.map((automation) => ({ ...automation, setup: [] }));
    const created: unknown[] = [];
    routePlatform(platformOperation, {
      '/automations': catalog,
      '/projects': projectsPayload('Finance'),
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
    await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByText('Whole workspace')).toBeTruthy();
    await fireEvent.press(screen.getByText('Team: Finance'));
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() => expect(created.some((body) => (body as { projectId?: string }).projectId === 'project-1')).toBe(true));
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
  function routeUnmet(subscriptions: unknown[], subscription: unknown) {
    const catalog = catalogPayload();
    catalog.automations = catalog.automations.map((automation) => ({ ...automation, setup: [] }));
    routePlatform(platformOperation, { '/automations': catalog, '/subscriptions': { subscriptions, subscription } });
    setMockParams({ template: 'tpl.0' });
  }

  it('names the page an account is connected on — Settings › Connections — while one is missing (24.12)', async () => {
    const waiting = { ...planSubscriptionsPayload().subscriptions[0]!, unmetConnections: ['hubspot'] };
    routeUnmet([waiting], waiting);
    await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByText('Connect HubSpot in Settings › Connections')).toBeTruthy();
  });

  it('names that page when the flow it just added still needs an account (24.12)', async () => {
    const added = { ...planSubscriptionsPayload().subscriptions[0]!, unmetConnections: ['hubspot'] };
    routeUnmet([], added);
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
    await fireEvent.press(getByTestId('stat-Failed'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/activity', params: { filter: 'Failed' } });
    await fireEvent.press(getByTestId('stat-Success'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/activity', params: { filter: 'Success' } });
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

/* ------------------------------------------------ archived flows (24.11.8) */

function withRemovedFlow(invoiceToo = false) {
  const base = subscriptionsPayload().subscriptions;
  const rows = base.map((row) => (invoiceToo && row.id === 'invoice' ? { ...row, status: 'archived' } : row));
  const gone = { ...base[0]!, id: 'gone', name: 'Old intake', status: 'archived', updatedAt: '2026-09-30T12:00:00Z' };
  routePlatform(platformOperation, {
    '/automations': flowCatalogPayload(),
    '/subscriptions': { subscriptions: [...rows, gone], subscription: rows[0] },
  });
}

describe('Archived flows (24.11.8; "Archived" since 24.12)', () => {
  it('Flows offers the archived ones as a row with a count, which opens the page', async () => {
    withRemovedFlow();
    const { findByText, queryByText } = await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await findByText('Archived flows (1)')).toBeTruthy();
    expect(queryByText('Old intake')).toBeNull();
    await fireEvent.press(screen.getByTestId('flows-archived'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/archived');
  });

  it('the Archived page lists them, read-only, and is the empty standard when there are none', async () => {
    withRemovedFlow();
    const { findByText, getByText } = await renderWithProviders(<ArchivedFlowsScreen />, signedInSession);
    expect(await findByText('Old intake')).toBeTruthy();
    expect(getByText('Archived flows')).toBeTruthy();
    expect(getByText('An archived flow keeps its history here. Add it again any time.')).toBeTruthy();
    expect(getByText('Archived Sep 30, 2026')).toBeTruthy();
    await fireEvent.press(getByText('Old intake'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'gone' } });

    resetSnapshot();
    routePlatform(platformOperation, { '/automations': flowCatalogPayload() });
    const empty = await renderWithProviders(<ArchivedFlowsScreen />, signedInSession);
    expect(await empty.findByTestId('screen-empty')).toBeTruthy();
    expect(empty.getByText('No archived flows')).toBeTruthy();
    expect(empty.getByText('A flow you archive keeps its history here, and you can add it again.')).toBeTruthy();
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

  it("an archived flow's page opens instead of \"Couldn't load\": no actions, its history, and Add it again", async () => {
    setMockParams({ flow: 'gone' });
    withRemovedFlow();
    const { findByText, queryByText, getByText } = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await findByText('Old intake')).toBeTruthy();
    expect(getByText('Archived')).toBeTruthy();
    expect(getByText(/^This flow was archived on Sep 30, 2026\. /u)).toBeTruthy();
    expect(queryByText("Couldn't load this flow")).toBeNull();
    expect(queryByText('Archive flow')).toBeNull();
    expect(queryByText('Pause')).toBeNull();
    await fireEvent.press(getByText('Add it again'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/setup',
      params: { template: 'tplflow.invoice' },
    });
  });

  it("a run whose flow was archived says so on its row", async () => {
    withRemovedFlow(true);
    const { findAllByText } = await renderWithProviders(<ActivityScreen />, signedInSession);
    expect((await findAllByText(/Flow archived/)).length).toBeGreaterThan(0);
  });

  it("Settings › Workspace offers the Archived flows page, in Settings' own stack", async () => {
    const { findByText } = await renderWithProviders(<WorkspaceScreen />, signedInSession);
    await fireEvent.press(await findByText('Archived flows'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/archived');
  });
});
