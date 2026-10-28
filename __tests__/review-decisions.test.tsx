import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import RunDetailScreen from '@/app/(tabs)/activity/run';
import { nocturneDark } from '@/constants/theme';
import { decideApproval, decideReview, type Block } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import type { Approval } from '@/lib/platform/runs';
import type { Answer } from '@/test/fake-platform';
import { TEST_WORKSPACE, approvalsPayload, routePlatform, runDetailPayload, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));
jest.mock('@/lib/platform/automations', () => ({
  ...jest.requireActual('@/lib/platform/automations'),
  decideApproval: jest.fn(async () => ({ approval: {} })),
  decideReview: jest.fn(async () => ({ approval: {} })),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * A review of each change (Round 21's platform round, F2; ICD-10 Code Check's
 * words.md section 3, word for word): a held run whose approval form carries
 * changes draws each as a row with Accept and Deny (the danger pill); Save
 * review only once every row is answered, sending every answer; a member is
 * told who may review; Approvals' card says "Review {n} changes" and opens
 * the run. A plain held run keeps Approve / Deny (invoice-processing-screens).
 */

const RUN_ID = 'held-run';
const APPROVAL_ID = '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d';
const CHANGES = [
  { id: 'n18-4', label: 'N18.4 → Remove', detail: 'No line in the note supports this code.' },
  { id: 'z99-2', label: 'Add Z99.2' },
];

beforeEach(() => {
  platformOperation.mockReset();
  (decideReview as jest.Mock).mockClear();
  (decideApproval as jest.Mock).mockClear();
});

function heldDetail(): Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'> {
  const base = runDetailPayload('run-1');
  return {
    ...base,
    run: { ...base.run, id: RUN_ID, status: 'held', endedAt: undefined },
    blocks: [
      { type: 'text', text: '2 changes need your review.', tone: 'warning' },
      {
        type: 'questions',
        form: { kind: 'approval', approvalId: APPROVAL_ID, eligibleRoles: ['owner', 'admin'], decisions: CHANGES },
      } as unknown as Block,
    ],
  };
}

function openHeld(role: 'owner' | 'member', approvals: Approval[] = []) {
  routePlatform(platformOperation, {
    '/approvals': { approvals },
    '/v1/workspaces': {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role }],
      activeWorkspaceId: TEST_WORKSPACE,
    },
  });
  const routed = platformOperation.getMockImplementation()!;
  const detail = heldDetail();
  platformOperation.mockImplementation((path: string, ...rest: unknown[]) =>
    path.split('?')[0]!.endsWith(`/runs/${RUN_ID}`) ? Promise.resolve(detail) : routed(path, ...rest),
  );
  setMockParams({ runId: RUN_ID });
  return renderWithProviders(<RunDetailScreen />, signedInSession);
}

const colorOf = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style) as { color?: string }).color;

describe('a held run that offers changes: Accept or Deny each, then Save review (F2)', () => {
  it('draws each change as "{label} · {detail}" with Accept and Deny, Deny the danger pill; no Approve', async () => {
    await openHeld('owner');
    const review = within(await screen.findByTestId('run-review-block'));
    expect(review.getByText('N18.4 → Remove · No line in the note supports this code.')).toBeTruthy();
    expect(review.getByText('Add Z99.2')).toBeTruthy();
    expect(review.getAllByText('Accept')).toHaveLength(2);
    expect(colorOf(review.getAllByText('Deny')[0]!)).toBe(nocturneDark.danger);
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByTestId('run-decision-block')).toBeNull();
  });

  it('Save review waits, saying "Accept or deny each change.", until every row is answered; then sends every answer once', async () => {
    await openHeld('owner');
    await screen.findByTestId('run-review-block');
    expect(screen.getByText('Accept or deny each change.')).toBeTruthy();
    expect(screen.getByTestId('run-review-save').props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.press(screen.getByTestId('run-review-accept-n18-4'));
    await fireEvent.press(screen.getByTestId('run-review-save'));
    expect(decideReview).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('run-review-deny-z99-2'));
    // Answered, the other pill goes quiet; a press of it changes the answer.
    expect(colorOf(within(screen.getByTestId('run-review-deny-n18-4')).getByText('Deny'))).not.toBe(nocturneDark.danger);
    expect(screen.queryByText('Accept or deny each change.')).toBeNull();
    expect(screen.getByTestId('run-review-save').props.accessibilityState).not.toMatchObject({ disabled: true });

    await fireEvent.press(screen.getByTestId('run-review-save'));
    await waitFor(() =>
      expect(decideReview).toHaveBeenCalledWith(
        TEST_WORKSPACE,
        APPROVAL_ID,
        [
          { id: 'n18-4', decision: 'accepted' },
          { id: 'z99-2', decision: 'denied' },
        ],
        'key',
      ),
    );
    expect(decideApproval).not.toHaveBeenCalled();
    // Saved: the page says how many of each.
    expect((await screen.findByTestId('run-review-tally')).props.children).toBe('1 accepted · 1 denied');
  });

  it('refused, the page says "The review wasn\'t saved. Try again." and Save review is offered again', async () => {
    (decideReview as jest.Mock).mockRejectedValueOnce(new PlatformError('decisions must answer every change once', 400));
    await openHeld('owner');
    await fireEvent.press(await screen.findByTestId('run-review-deny-n18-4'));
    await fireEvent.press(screen.getByTestId('run-review-deny-z99-2'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('run-review-save'));
    });
    expect(await screen.findByText("The review wasn't saved. Try again.")).toBeTruthy();
    expect(screen.getByTestId('run-review-save').props.accessibilityState).not.toMatchObject({ disabled: true });
    expect(screen.queryByTestId('run-review-tally')).toBeNull();
  });

  it('to a member: "Only an owner or admin can review this." and no pills', async () => {
    await openHeld('member');
    expect((await screen.findByTestId('run-review-member')).props.children).toBe('Only an owner or admin can review this.');
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Save review')).toBeNull();
  });

  it("once reviewed, the job's approval's answers say it on the run", async () => {
    const reviewed = {
      ...approvalsPayload().approvals[0]!,
      runId: RUN_ID,
      status: 'approved' as const,
      decisions: [
        { ...CHANGES[0]!, decision: 'accepted' },
        { ...CHANGES[1]!, decision: 'accepted' },
      ],
    } as Approval;
    await openHeld('owner', [reviewed]);
    expect((await screen.findByTestId('run-review-tally')).props.children).toBe('2 accepted · 0 denied');
  });
});

describe('Approvals: a review\'s card says "Review {n} changes" and opens the run (F2)', () => {
  function routeInbox(approvals: Approval[]) {
    routePlatform(platformOperation, {
      '/approvals': { approvals },
      '/v1/workspaces': {
        workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'owner' }],
        activeWorkspaceId: TEST_WORKSPACE,
      },
    });
  }
  const pending = (id: string, extra: object = {}) =>
    ({ ...approvalsPayload().approvals[0]!, id, runId: `run-of-${id}`, status: 'pending', eligibleRoles: ['owner'], ...extra }) as Approval;

  it('in place of Approve and Deny; a plain one beside it keeps them', async () => {
    routeInbox([pending('review', { decisions: CHANGES }), pending('plain')]);
    await renderWithProviders(<ApprovalsScreen />, signedInSession);
    const card = within(await screen.findByTestId('approval-review'));
    expect(card.getByText('Review 2 changes')).toBeTruthy();
    expect(card.queryByText('Approve')).toBeNull();
    expect(within(screen.getByTestId('approval-plain')).getByText('Approve')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('review-review'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/activity/run', params: { runId: 'run-of-review' } });
    expect(decideReview).not.toHaveBeenCalled();
    expect(decideApproval).not.toHaveBeenCalled();
  });
});
