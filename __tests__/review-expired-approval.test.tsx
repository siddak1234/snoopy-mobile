import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import RunDetailScreen from '@/app/(tabs)/activity/run';
import { status } from '@/constants/theme';
import type { Block } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import type { Approval } from '@/lib/platform/runs';
import { fakePlatform, type Answer, type Sent } from '@/test/fake-platform';
import {
  QUICKBOOKS_PROVIDER,
  TEST_WORKSPACE,
  approvalsPayload,
  flowCatalogPayload,
  providersPayload,
  runDetailPayload,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn((prefix: string) => `${prefix}-key`),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Round 21 stage 2, S1-8b (backend §12.1 #252; the website's 9f2e1e7, its
 * review's finding 4): an Approve the platform refuses 409 `approval_expired`
 * with `expiredBy` — it expired the approval because the connection its held
 * run was built on was disconnected — says Stage 1's two lines where Approve
 * and Deny were, with nothing to press, the provider named from one read of
 * the providers made on that refusal only. Approvals and the run's page are
 * read again; Approvals keeps the card, Expired; the run's page offers no
 * decision once a disconnect expired it. A plain expiry keeps the platform's
 * words and reads nothing again.
 */

const APPROVALS = 'GET /v1/workspaces/{workspaceId}/approvals';
const DECISION = 'POST /v1/workspaces/{workspaceId}/approvals/{approvalId}/decision';
const PROVIDERS = 'GET /v1/connections/providers';
const RUN = 'GET /v1/workspaces/{workspaceId}/runs/{runId}';
const RUN_ID = 'held-run';

const LINES = (provider: string) => [`Expired · ${provider} was disconnected`, `Reconnect ${provider}, then start the run again.`];

/** The platform's refusal: the approval expired by the disconnect of `providerId`, saved before it refused. */
function expiredBy(providerId: string) {
  return () => {
    throw new PlatformError('The approval expired: its connection was disconnected', 409, 'CONFLICT', {
      reason: 'approval_expired',
      expiredBy: { reason: 'connection-disconnected', providerId },
    });
  };
}

function approval(id: string, runId: string, more: Partial<Approval> = {}): Approval {
  return {
    ...approvalsPayload().approvals[0]!,
    id,
    runId,
    eligibleRoles: ['owner', 'admin'],
    expiresAt: new Date(Date.now() + 3 * 3_600_000 + 600_000).toISOString(),
    ...more,
  };
}

const pendingReads = (fake: ReturnType<typeof fakePlatform>) => fake.to(APPROVALS).filter((sent) => sent.query?.status === 'pending');
const colorOf = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style) as { color?: string }).color;

/** Approvals, holding `before` until the decision, then `after`: the list as the platform holds it once it expired one. */
function routeApprovals(before: Approval[], after: Approval[]) {
  const fake = fakePlatform(platformOperation);
  let decided = false;
  fake.always(APPROVALS, () => ({ approvals: decided ? after : before }));
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', subscriptionsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/automations', flowCatalogPayload());
  fake.always('GET /v1/workspaces', {
    workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }],
    activeWorkspaceId: TEST_WORKSPACE,
  });
  return {
    fake,
    refuse(reply: (sent: Sent) => never) {
      fake.always(DECISION, (sent) => {
        decided = true;
        return reply(sent);
      });
    },
  };
}

describe('Approvals: an Approve a disconnect expired (S1-8b)', () => {
  it("says Stage 1's two lines where Approve and Deny were, nothing to press, its pill Expired; the list is read again and the card kept, though the list no longer holds it", async () => {
    const { fake, refuse } = routeApprovals([approval('a1', 'run-a1'), approval('a2', 'run-a2')], [approval('a2', 'run-a2')]);
    refuse(expiredBy('quickbooks'));
    fake.always(PROVIDERS, { providers: [...providersPayload().providers, QUICKBOOKS_PROVIDER] });
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    await screen.findByTestId('approval-a1');
    expect(pendingReads(fake)).toHaveLength(1);
    expect(fake.to(PROVIDERS)).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('decide-a1-approve'));
    const card = within(await screen.findByTestId('approval-a1'));
    const lines = within(await screen.findByTestId('expired-a1'));
    expect(lines.getAllByText(/./u).map((node) => node.props.children)).toEqual(LINES('QuickBooks'));
    expect(colorOf(lines.getByText('Expired · QuickBooks was disconnected'))).toBe(status.warnText);
    expect(card.getByText('Expired')).toBeTruthy();
    expect(card.queryByText('Pending')).toBeNull();
    expect(card.queryByText('Approve')).toBeNull();
    expect(card.queryByText('Deny')).toBeNull();
    // Read again once, on this refusal: the list no longer holds it, and the card stays where it was.
    await waitFor(() => expect(pendingReads(fake)).toHaveLength(2));
    expect(screen.getByTestId('approval-a1')).toBeTruthy();
    expect(screen.getAllByTestId(/^approval-a\d$/u).map((node) => node.props.testID)).toEqual(['approval-a1', 'approval-a2']);
    expect(screen.getByTestId('approvals-count').props.children).toBe(1);
    expect(fake.to(PROVIDERS)).toHaveLength(1);
    expect(fake.to(DECISION)).toHaveLength(1);
    expect(screen.queryByText('The approval expired: its connection was disconnected')).toBeNull();
  });

  it('names any other provider as its connection row does, from the one providers read', async () => {
    const { fake, refuse } = routeApprovals([approval('a1', 'run-a1')], []);
    refuse(expiredBy('google-drive'));
    fake.always(PROVIDERS, {
      providers: [{ providerId: 'google-drive', displayName: 'Google Drive', description: '', scopes: [], authType: 'oauth2', icon: 'plugs' }],
    });
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('decide-a1-approve'));
    const lines = within(await screen.findByTestId('expired-a1'));
    expect(lines.getAllByText(/./u).map((node) => node.props.children)).toEqual(LINES('Google Drive'));
    expect(fake.to(PROVIDERS)).toHaveLength(1);
  });

  it('the providers unreadable: the provider by its id', async () => {
    const { fake, refuse } = routeApprovals([approval('a1', 'run-a1')], []);
    refuse(expiredBy('google-drive'));
    fake.always(PROVIDERS, () => {
      throw new PlatformError('Service Unavailable', 503);
    });
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('decide-a1-approve'));
    const lines = within(await screen.findByTestId('expired-a1'));
    expect(lines.getAllByText(/./u).map((node) => node.props.children)).toEqual(LINES('google-drive'));
    expect(screen.getByText('Expired')).toBeTruthy();
  });

  it("a plain expiry keeps the platform's words, the card as it was, and reads nothing again", async () => {
    const { fake, refuse } = routeApprovals([approval('a1', 'run-a1')], []);
    refuse(() => {
      throw new PlatformError('This approval has expired.', 409, 'CONFLICT', { reason: 'approval_expired' });
    });
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('decide-a1-approve'));
    expect(await screen.findByText('This approval has expired.')).toBeTruthy();
    expect(screen.queryByTestId('expired-a1')).toBeNull();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByTestId('decide-a1-approve')).toBeTruthy();
    expect(pendingReads(fake)).toHaveLength(1);
    expect(fake.to(PROVIDERS)).toHaveLength(0);
  });

  it("an expiry for a reason this build does not know reads as a plain one: the platform's words, no lines, nothing read again", async () => {
    const { fake, refuse } = routeApprovals([approval('a1', 'run-a1')], []);
    refuse(() => {
      throw new PlatformError('This approval has expired.', 409, 'CONFLICT', {
        reason: 'approval_expired',
        expiredBy: { reason: 'workspace-closed', providerId: 'quickbooks' },
      });
    });
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('decide-a1-approve'));
    expect(await screen.findByText('This approval has expired.')).toBeTruthy();
    expect(screen.queryByTestId('expired-a1')).toBeNull();
    expect(pendingReads(fake)).toHaveLength(1);
    expect(fake.to(PROVIDERS)).toHaveLength(0);
  });
});

/** A held run whose page body still carries its approval form, as the platform sent it. */
function heldDetail(): Answer<typeof RUN> {
  const base = runDetailPayload('run-1');
  return {
    ...base,
    run: { ...base.run, id: RUN_ID, status: 'held', endedAt: undefined },
    blocks: [
      { type: 'text', text: 'The bill needs your approval.', tone: 'warning' },
      { type: 'questions', form: { kind: 'approval', approvalId: 'h1', eligibleRoles: ['owner', 'admin'] } } as unknown as Block,
    ],
  };
}

/** The run's page over a held run; its approvals `before` until the decision, then `after` (or unreadable). */
function openHeld(before: Approval[], after: Approval[] | 'unreadable') {
  const fake = fakePlatform(platformOperation);
  let decided = false;
  fake.always(RUN, heldDetail());
  fake.always(APPROVALS, () => {
    if (!decided) return { approvals: before };
    if (after === 'unreadable') throw new PlatformError('Service Unavailable', 503);
    return { approvals: after };
  });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', subscriptionsPayload());
  fake.always('GET /v1/workspaces/{workspaceId}/automations', flowCatalogPayload());
  fake.always('GET /v1/workspaces', {
    workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }],
    activeWorkspaceId: TEST_WORKSPACE,
  });
  fake.always(PROVIDERS, { providers: [QUICKBOOKS_PROVIDER] });
  fake.always(DECISION, () => {
    decided = true;
    return expiredBy('quickbooks')();
  });
  setMockParams({ runId: RUN_ID });
  return fake;
}

const pending = () => approval('h1', RUN_ID);
const expiredByQuickBooks = () => approval('h1', RUN_ID, { status: 'expired', expiredBy: { reason: 'connection-disconnected', providerId: 'quickbooks' } });

describe("the run's page: an Approve a disconnect expired (S1-8b)", () => {
  it('reads the run again: the two lines over its body, and no Approve or Deny', async () => {
    const fake = openHeld([pending()], [expiredByQuickBooks()]);
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('run-decision-approve'));
    const lines = within(await screen.findByTestId('run-expired'));
    expect(lines.getAllByText(/./u).map((node) => node.props.children)).toEqual(LINES('QuickBooks'));
    expect(screen.queryByTestId('run-decision-block')).toBeNull();
    expect(screen.queryByTestId('run-decision-expired')).toBeNull();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(fake.to(RUN)).toHaveLength(2);
    expect(fake.to(APPROVALS)).toHaveLength(2);
    expect(fake.to(PROVIDERS)).toHaveLength(1);
  });

  it('its approvals unreadable on that read: the pair\'s place still says the two lines, with nothing to press', async () => {
    openHeld([pending()], 'unreadable');
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    await fireEvent.press(await screen.findByTestId('run-decision-approve'));
    const lines = within(await screen.findByTestId('run-decision-expired'));
    expect(lines.getAllByText(/./u).map((node) => node.props.children)).toEqual(LINES('QuickBooks'));
    expect(screen.queryByTestId('run-decision-approve')).toBeNull();
    expect(screen.queryByTestId('run-decision-deny')).toBeNull();
  });

  it('opened once a disconnect expired it, its form still in the body: no Approve or Deny, the two lines over it', async () => {
    const fake = openHeld([expiredByQuickBooks()], [expiredByQuickBooks()]);
    await renderWithProviders(<RunDetailScreen />, signedInSession);
    expect(await screen.findByTestId('run-expired')).toBeTruthy();
    expect(screen.getByTestId('run-blocks')).toBeTruthy();
    expect(screen.queryByTestId('run-decision-block')).toBeNull();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(fake.to(PROVIDERS)).toHaveLength(0);
  });
});
