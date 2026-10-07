import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import NotificationsScreen from '@/app/(tabs)/(home)/notifications';
import RunDetailScreen from '@/app/(tabs)/(home)/run';
import BillingScreen from '@/app/(tabs)/settings/billing';
import { resetPushForTests } from '@/hooks/use-push-registration';
import type { WorkspaceBilling } from '@/lib/platform/billing';
import { PlatformError } from '@/lib/platform/problem';
import { fakePlatform } from '@/test/fake-platform';
import {
  TEST_WORKSPACE,
  catalogPayload,
  flowCatalogPayload,
  inboxPayload,
  runDetailPayload,
  sessionAs,
  signedInSession,
} from '@/test/platform';
import { renderWithProviders, setMockParams } from '@/test/render';

/**
 * The owner's build 14 feedback, 2026-10-07 (BUILD-PLAN 24.14.14): a running
 * run's page never moved on (#3); a step that never ran stayed "pending" on a
 * finished run (#4, #5) and a failed step counted as done (#8); dismiss took
 * three taps for two rows (#10); a cancelled plan said "Renews" (#11).
 */

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));
const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

// The page's wait between reads, shortened so a test sees several.
jest.mock('@/lib/view/runs', () => ({ ...jest.requireActual('@/lib/view/runs'), RUN_REREAD_MS: 20 }));

let keys = 0;
beforeEach(() => {
  platformOperation.mockReset();
  keys = 0;
  newIdempotencyKey.mockReset().mockImplementation((prefix: string) => `${prefix}-${++keys}`);
  resetPushForTests();
});

/* ------------------------------------------------------------- the run page */

const RUN = 'GET /v1/workspaces/{workspaceId}/runs/{runId}';

/** Invoice check v4's four declared steps, as production's manifest names them. */
const PIPELINE = [
  { id: 'receive', kicker: 'TRIGGER', title: 'Invoice received', description: 'A run is started with the invoice to check.' },
  { id: 'validate', kicker: 'ACTION', title: 'Check the amount', description: 'Compares the invoice against your threshold and holds it if it is above.' },
  { id: 'post', kicker: 'ACTION', title: 'Record the invoice', description: 'Records the invoice once it is within threshold or has been approved.' },
  { id: 'notify', kicker: 'ACTION', title: 'Email the outcome', description: 'Emails the decision from automations@autom8x.ai, when an address is set.' },
] as const;

type Detail = ReturnType<typeof runDetailPayload>;
type Status = Detail['run']['status'];
type Outcome = Detail['steps'][number]['outcome'];

/** One read of the run: its status and the steps it has reported, in order. */
function detail(status: Status, reported: [string, Outcome][]): Detail {
  const base = runDetailPayload('run-1');
  const ended = status === 'succeeded' || status === 'failed' || status === 'cancelled';
  return {
    ...base,
    run: { ...base.run, templateId: 'invoice-check', status, ...(ended ? {} : { endedAt: undefined }) },
    steps: reported.map(([stepId, outcome], n) => ({
      id: `s${n}`,
      runId: 'run-1',
      workspaceId: TEST_WORKSPACE,
      stepId,
      outcome,
      summary: `${stepId} ${outcome}`,
      occurredAt: base.run.createdAt,
    })),
  };
}

/** A read the test lets answer when it chooses: `release()` and it answers. */
type Gated = { read: Detail | Error; gate: Promise<void> };
function gated(read: Detail | Error): Gated & { release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { read, gate, release };
}

/** The catalog with invoice check in it, and the run answering `reads` in turn, then the last for ever. */
function routeRun(...reads: (Detail | Error | Gated)[]) {
  const fake = fakePlatform(platformOperation);
  const catalog = catalogPayload();
  fake.always('GET /v1/workspaces/{workspaceId}/automations', {
    ...catalog,
    automations: [{ ...catalog.automations[0]!, templateId: 'invoice-check', name: 'Invoice check', pipeline: [...PIPELINE] }],
  });
  fake.always('GET /v1/workspaces/{workspaceId}/approvals', { approvals: [] });
  const answer = (step: Detail | Error | Gated) => async () => {
    const read = 'gate' in step ? (await step.gate, step.read) : step;
    if (read instanceof Error) throw read;
    return read;
  };
  for (const read of reads.slice(0, -1)) fake.once(RUN, answer(read));
  fake.always(RUN, answer(reads[reads.length - 1]!));
  return fake;
}

/** Long enough for several re-reads at the shortened wait, were any to be made. */
const aWhile = () => act(async () => new Promise((resolve) => setTimeout(resolve, 150)));

const steps = () => screen.getByText('Steps done').parent!;

describe('a run that has not ended is read again until it has (feedback #3)', () => {
  it('moves from Running to Success without a hand on it, one read at a time, and stops once it has ended', async () => {
    const second = gated(detail('running', [['receive', 'ok']]));
    const third = gated(detail('succeeded', [['receive', 'ok'], ['validate', 'ok'], ['post', 'ok']]));
    const fake = routeRun(detail('running', []), second, third);
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Running')).toBeTruthy();
    expect(within(steps()).getByText('0 / 4')).toBeTruthy();

    // Read again; while that read is unanswered, no other is made.
    await waitFor(() => expect(fake.to(RUN)).toHaveLength(2));
    await aWhile();
    expect(fake.to(RUN)).toHaveLength(2);

    await act(async () => second.release());
    expect(await screen.findByText('1 / 4')).toBeTruthy();
    expect(screen.getByText('Running')).toBeTruthy();

    await waitFor(() => expect(fake.to(RUN)).toHaveLength(3));
    await act(async () => third.release());
    expect(await screen.findByText('Success')).toBeTruthy();
    expect(within(steps()).getByText('3 / 4')).toBeTruthy();
    expect(screen.queryByText('Cancel run')).toBeNull();

    // Ended: no further read, however long the page stays open.
    await aWhile();
    expect(fake.to(RUN)).toHaveLength(3);
  });

  it('keeps reading after a refused read, which leaves the page as it was', async () => {
    const refused = gated(new PlatformError('Service Unavailable', 503));
    const fake = routeRun(
      detail('pending', []),
      refused,
      detail('succeeded', [['receive', 'ok'], ['validate', 'ok'], ['post', 'ok']]),
    );
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Queued')).toBeTruthy();
    await waitFor(() => expect(fake.to(RUN)).toHaveLength(2));

    await act(async () => refused.release());
    expect(await screen.findByText('Success')).toBeTruthy();
    expect(fake.to(RUN)).toHaveLength(3);
    expect(screen.queryByText('Service Unavailable')).toBeNull();
  });

  it('reads a finished run once', async () => {
    const fake = routeRun(detail('failed', [['receive', 'failed']]));
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Failed')).toBeTruthy();
    await aWhile();
    expect(fake.to(RUN)).toHaveLength(1);
  });
});

describe('a finished run says which steps never ran (feedback #4, #5, #8)', () => {
  it('a success with no address set: "Email the outcome" did not run, and three of four steps are done', async () => {
    routeRun(detail('succeeded', [['receive', 'ok'], ['validate', 'ok'], ['post', 'ok']]));
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Success')).toBeTruthy();
    expect(screen.getByText('Not run · Emails the decision from automations@autom8x.ai, when an address is set.')).toBeTruthy();
    expect(screen.getByTestId(/^phosphor-react-native-minus-circle-/u)).toBeTruthy();
    expect(screen.queryByTestId(/^phosphor-react-native-circle-dashed-/u)).toBeNull();
    expect(within(steps()).getByText('3 / 4')).toBeTruthy();
  });

  it('a failure at its first step: the three after it did not run, and none is done', async () => {
    routeRun(detail('failed', [['receive', 'failed']]));
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Failed')).toBeTruthy();
    expect(screen.getAllByText(/^Not run · /u)).toHaveLength(3);
    expect(within(steps()).getByText('0 / 4')).toBeTruthy();
  });

  it('a held run still shows what is left as waiting, as the design draws it', async () => {
    routeRun(detail('held', [['receive', 'ok'], ['validate', 'held']]));
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByText('Records the invoice once it is within threshold or has been approved.')).toBeTruthy();
    expect(screen.queryByText(/^Not run · /u)).toBeNull();
    expect(screen.getAllByTestId(/^phosphor-react-native-circle-dashed-/u)).toHaveLength(2);
    expect(within(steps()).getByText('1 / 4')).toBeTruthy();
  });
});

/* -------------------------------------------------------------- the inbox */

describe('dismiss takes the row away at the tap (feedback #10)', () => {
  const INBOX = 'GET /v1/workspaces/{workspaceId}/notifications';
  const DISMISS = 'POST /v1/workspaces/{workspaceId}/notifications/{notificationId}/dismiss';
  const TITLES = /^(Run held for review|Run failed)$/u;

  function routeInbox() {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/automations', flowCatalogPayload());
    fake.always(INBOX, inboxPayload());
    return fake;
  }

  it('gone before the platform answers, and gone after', async () => {
    const inbox = inboxPayload();
    const fake = routeInbox();
    let answer!: () => void;
    const held = new Promise<void>((resolve) => (answer = resolve));
    fake.always(DISMISS, async () => {
      await held;
      return { unreadCount: 3 };
    });
    fake.once(INBOX, inbox);
    fake.always(INBOX, { items: inbox.items.slice(1), unreadCount: 3 });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);

    await fireEvent.press(screen.getByTestId(`dismiss-${inbox.items[0]!.id}`));

    // The platform has not answered: the row has already gone.
    expect(fake.to(DISMISS)).toHaveLength(1);
    expect(screen.getAllByText(TITLES)).toHaveLength(3);
    expect(screen.queryByTestId(`dismiss-${inbox.items[0]!.id}`)).toBeNull();

    await act(async () => answer());
    await waitFor(() => expect(fake.to(INBOX)).toHaveLength(2));
    expect(screen.getAllByText(TITLES)).toHaveLength(3);
  });

  it('refused, the row comes back with the reason', async () => {
    const inbox = inboxPayload();
    const fake = routeInbox();
    fake.always(DISMISS, () => {
      throw new PlatformError('Service Unavailable', 503);
    });
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    expect(await screen.findAllByText(TITLES)).toHaveLength(4);

    await fireEvent.press(screen.getByTestId(`dismiss-${inbox.items[0]!.id}`));

    expect(await screen.findByText('Service Unavailable')).toBeTruthy();
    expect(screen.getAllByText(TITLES)).toHaveLength(4);
    expect(screen.getByTestId(`dismiss-${inbox.items[0]!.id}`)).toBeTruthy();
  });

  it('is a 44-point target, reaching no further than itself', async () => {
    const inbox = inboxPayload();
    routeInbox();
    await renderWithProviders(<NotificationsScreen />, signedInSession);
    const target = await screen.findByTestId(`dismiss-${inbox.items[0]!.id}`);
    const box = StyleSheet.flatten(target.props.style) as { width?: number; height?: number };
    expect([box.width, box.height]).toEqual([44, 44]);
    expect(target.props.hitSlop).toBeUndefined();
  });
});

/* ------------------------------------------------------------- billing */

describe('a cancelled plan says it ends, then Free (feedback #11)', () => {
  const ON_PLUS: WorkspaceBilling = {
    workspaceId: TEST_WORKSPACE,
    planId: 'team',
    displayName: 'Plus',
    status: 'active',
    currentPeriodEnd: '2026-10-21T17:15:11Z',
  };
  const card = (planId: string) => within(screen.getByTestId(`plan-${planId}`));

  function routeBilling(billing: WorkspaceBilling) {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Acme', type: 'organization', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    fake.always('GET /v1/plans', {
      plans: [
        { planId: 'team', displayName: 'Plus', capabilities: { 'automation.subscribe': 5 }, price: { amount: 500, currency: 'usd', interval: 'month' } },
      ],
    });
    fake.always('GET /v1/workspaces/{workspaceId}/billing', billing);
    return fake;
  }

  const ends = `Ends ${new Date(ON_PLUS.currentPeriodEnd!).toLocaleDateString()}, then Free`;
  // The cards act on iOS only, and the Free card's line is one of their actions.
  let ios: jest.ReplaceProperty<typeof Platform.OS>;
  beforeEach(() => {
    ios = jest.replaceProperty(Platform, 'OS', 'ios');
  });
  afterEach(() => ios.restore());

  it('cancelled: "Ends <date>, then Free", and the Free card no longer says to cancel', async () => {
    routeBilling({ ...ON_PLUS, cancelAtPeriodEnd: true });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText(ends)).toBeTruthy();
    expect(card('team').getByText(ends)).toBeTruthy();
    expect(screen.queryByText(/^Renews /u)).toBeNull();
    expect(card('team').getByText('Manage billing')).toBeTruthy();
    expect(screen.queryByText(/^To move to Free/u)).toBeNull();
  });

  it('renewing: "Renews <date>", and the Free card says how to move to it, as before', async () => {
    routeBilling({ ...ON_PLUS, cancelAtPeriodEnd: false });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText(`Renews ${new Date(ON_PLUS.currentPeriodEnd!).toLocaleDateString()}`)).toBeTruthy();
    expect(card('free').getByText('To move to Free, cancel Plus in Manage billing.')).toBeTruthy();
    expect(screen.queryByText(/, then Free$/u)).toBeNull();
  });
});
