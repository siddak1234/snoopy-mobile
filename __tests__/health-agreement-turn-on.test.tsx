// Hoisted above the imports by babel-jest: the transport.
jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import AgreementScreen from '@/app/(tabs)/flows/agreement';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import { ACCEPTING_RUN, ACCEPT_AND_RUN, ACCEPT_AND_TURN_ON, TURNING_ON } from '@/lib/content/health-agreement';
import { SETUP_TURNING_ON } from '@/lib/content/screen-states';
import type { Subscription } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { acceptLabel, agreementRefusal, settleAgreement } from '@/lib/view/health-agreement';
import { fakePlatform } from '@/test/fake-platform';
import {
  TEST_WORKSPACE,
  invoiceProcessingV4Entry,
  planSubscriptionsPayload,
  providersWithQuickBooks,
  recipientsPayload,
  sessionAs,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

/**
 * The review of builds 37 and 39, wave 2 (the website's review, finding 2:
 * "The app's flow page Turn on (snoopy-mobile app/(tabs)/flows/detail.tsx)
 * has no agreement step"; backend ADR-0049 amendment 2): a flow that carries
 * health data, turned on from its own page — a draft not set up, or a paused
 * flow — before the workspace's owner accepted the health data agreement, is
 * refused 403 `agreement_required`. The owner gets the agreement's screen for
 * the turn-on ("Accept and turn on", "Turning on…", the website's words), and
 * the turn-on is sent again with the same key; anyone else the one line; none
 * published, "isn't available yet". Set up asks in its own section instead
 * (`health-agreement.test.tsx`).
 */

const ASK_OWNER = 'Ask your workspace owner to accept the health data agreement.';
const NOT_PUBLISHED = "The health data agreement isn't available yet.";
const PATCH = 'PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}';
const TEXT = 'GET /v1/agreements/health-data';
const ACCEPT = 'POST /v1/workspaces/{workspaceId}/agreements';
const AGREEMENT = { version: 1, text: 'The agreement, between {Covered Entity} and Autom8x.', sha256: 'a'.repeat(64) };
const AGREEMENT_FOR_A_TURN_ON = { pathname: '/(tabs)/flows/agreement', params: { action: 'turn-on', workspace: TEST_WORKSPACE } };

/** 403 `agreement_required`, as the platform answers a turn-on (`assertHealthAgreementAccepted`); no version while none is published. */
function refusedForAgreement(version?: number) {
  return (): never => {
    throw new PlatformError('Forbidden', 403, 'FORBIDDEN', {
      reason: 'agreement_required',
      kind: 'health-data',
      ...(version === undefined ? {} : { version }),
    });
  };
}

/** A paused flow: its page offers Turn on in Step 1. */
const PAUSED: Subscription = {
  ...planSubscriptionsPayload().subscriptions[0]!,
  id: 'ip-1',
  templateId: 'invoice-processing',
  templateVersion: 4,
  status: 'paused',
  config: { vendor: 'none' },
  unmetConnections: [],
  setup: invoiceProcessingV4Entry().setup,
};

beforeEach(() => {
  resetSnapshot();
  settleAgreement(false);
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
});

describe("a turn-on's refusal, and the words (unit)", () => {
  it.each([
    ['the owner, a version published: the agreement opens', 'owner', 1, { open: true }],
    ['the owner, none published', 'owner', undefined, { open: false, line: NOT_PUBLISHED }],
    ['an admin', 'admin', 1, { open: false, line: ASK_OWNER }],
    ['a member', 'member', 1, { open: false, line: ASK_OWNER }],
  ] as const)("the platform's 403 agreement_required on a turn-on — %s", (_case, role, version, read) => {
    let refusal: unknown;
    try {
      refusedForAgreement(version)();
    } catch (error) {
      refusal = error;
    }
    expect(agreementRefusal(refusal, role)).toEqual(read);
  });

  it("any other refusal of a turn-on is not the agreement's: the page says its own words", () => {
    const member = new PlatformError('Forbidden', 403, 'FORBIDDEN', { reason: 'flow_change_requires_admin' });
    const conflict = new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'agreement_required' });
    expect(agreementRefusal(member, 'owner')).toBeNull();
    expect(agreementRefusal(conflict, 'owner')).toBeNull();
  });

  it("the words: \"Accept and turn on\" and \"Turning on…\" (Turn on's own), the website's, beside a run's", () => {
    expect(ACCEPT_AND_TURN_ON).toBe('Accept and turn on');
    expect(TURNING_ON).toBe('Turning on…');
    expect(TURNING_ON).toBe(SETUP_TURNING_ON);
    expect(ACCEPT_AND_RUN).toBe('Accept and start run');
    expect(ACCEPTING_RUN).toBe('Starting…');
  });

  it.each([
    ['turn-on', false, 'Accept and turn on'],
    ['turn-on', true, 'Turning on…'],
    ['run', false, 'Accept and start run'],
    ['run', true, 'Starting…'],
    [undefined, false, 'Accept and start run'],
    ['add', false, 'Accept and start run'],
  ] as const)('acceptLabel(%s, busy %s): "%s"', (action, busy, words) => {
    expect(acceptLabel(action, busy)).toBe(words);
  });
});

describe("the flow page's Turn on, refused for the agreement", () => {
  /** The flow page as `role` sees it; the flow is on once a turn-on is answered. */
  async function openFlowPage(role: 'owner' | 'admin', fake: ReturnType<typeof fakePlatform>, status: Subscription['status'] = 'paused') {
    let now = status;
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', () => ({ subscriptions: [{ ...PAUSED, status: now }] }));
    fake.always('GET /v1/workspaces/{workspaceId}/automations', {
      automations: [{ ...invoiceProcessingV4Entry(), healthData: true as const }],
      categories: ['All'],
    });
    const row = { total: 0, pending: 0, running: 0, held: 0, succeeded: 0, failed: 0, cancelled: 0 };
    fake.always('GET /v1/workspaces/{workspaceId}/run-stats', { workspace: row, subscriptions: [{ subscriptionId: 'ip-1', ...row }] });
    fake.always('GET /v1/connections/providers', providersWithQuickBooks());
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/email-recipients', recipientsPayload());
    fake.always(PATCH, (sent) => {
      now = (sent.body as { status: Subscription['status'] }).status;
      return { subscription: { ...PAUSED, status: now } };
    });
    setMockParams({ flow: 'ip-1' });
    await renderWithProviders(<WorkflowDetailScreen />, sessionAs(role));
    await screen.findByTestId('flow-screen');
  }

  it('the owner: the agreement opens for the turn-on; accepted, the turn-on is sent again with the same key, and the flow is on', async () => {
    const fake = fakePlatform(platformOperation);
    fake.once(PATCH, refusedForAgreement(1));
    await openFlowPage('owner', fake);
    await fireEvent.press(await screen.findByTestId('flow-step-turn-on'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(AGREEMENT_FOR_A_TURN_ON));
    expect(fake.to(PATCH)).toHaveLength(1);

    await act(async () => settleAgreement(true));
    await waitFor(() => expect(fake.to(PATCH)).toHaveLength(2));
    const [refused, again] = fake.to(PATCH);
    expect(again!.body).toEqual({ status: 'live' });
    expect(again!.key).toBe(refused!.key);
    expect(await screen.findByText('Pause')).toBeTruthy();
    expect(screen.queryByTestId('flow-step-turn-on')).toBeNull();
    expect(screen.queryByTestId('action-failure')).toBeNull();
  });

  it('the owner leaves the agreement without accepting: nothing more sent, no line, and Turn on offered again', async () => {
    const fake = fakePlatform(platformOperation);
    fake.once(PATCH, refusedForAgreement(1));
    await openFlowPage('owner', fake);
    await fireEvent.press(await screen.findByTestId('flow-step-turn-on'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(AGREEMENT_FOR_A_TURN_ON));

    await act(async () => settleAgreement(false));
    await waitFor(() => expect(screen.getByTestId('flow-step-turn-on').props.accessibilityState?.disabled).toBeFalsy());
    expect(fake.to(PATCH)).toHaveLength(1);
    expect(screen.queryByTestId('action-failure')).toBeNull();
  });

  it.each([
    ['an admin', 'admin', 1, ASK_OWNER],
    ['the owner, none published', 'owner', undefined, NOT_PUBLISHED],
  ] as const)('%s: the one line on the page, no agreement screen, and nothing more sent', async (_case, role, version, line) => {
    const fake = fakePlatform(platformOperation);
    fake.once(PATCH, refusedForAgreement(version));
    await openFlowPage(role, fake);
    await fireEvent.press(await screen.findByTestId('flow-step-turn-on'));
    expect(await screen.findByText(line)).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(fake.to(PATCH)).toHaveLength(1);
  });

  it("a pause is never asked for the agreement: a refusal of it says the platform's words, and no screen opens", async () => {
    const fake = fakePlatform(platformOperation);
    fake.once(PATCH, refusedForAgreement(1));
    await openFlowPage('owner', fake, 'live');
    await fireEvent.press(await screen.findByText('Pause'));
    expect(await screen.findByText('Forbidden')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(fake.to(PATCH)).toEqual([expect.objectContaining({ body: { status: 'paused' } })]);
  });
});

describe('the agreement screen, opened for a turn-on', () => {
  it('its button says "Accept and turn on", and "Turning on…" while it sends; accepted, it goes back', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always(TEXT, AGREEMENT);
    const DOCUMENT = {
      id: '00000000-0000-4000-8000-0000000000d1',
      kind: 'health-data' as const,
      version: 1,
      signerName: 'Dana Reyes',
      signerTitle: 'Practice manager',
      acceptedAt: '2026-11-06T10:00:00Z',
    };
    let answer: () => void = () => undefined;
    fake.always(ACCEPT, () => new Promise<{ document: typeof DOCUMENT }>((resolve) => (answer = () => resolve({ document: DOCUMENT }))));
    setMockParams({ action: 'turn-on', workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    const accept = await screen.findByTestId('agreement-accept');
    expect(within(accept).getByText('Accept and turn on')).toBeTruthy();
    expect(screen.queryByText('Accept and start run')).toBeNull();

    await fireEvent.press(within(screen.getByTestId('agreement-authorized')).getByRole('switch'));
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Dana Reyes');
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Practice manager');
    await fireEvent.press(screen.getByTestId('agreement-accept'));
    expect(await within(screen.getByTestId('agreement-accept')).findByText('Turning on…')).toBeTruthy();
    expect(screen.queryByText('Starting…')).toBeNull();
    await act(async () => answer());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(fake.to(ACCEPT)).toHaveLength(1);
  });
});
