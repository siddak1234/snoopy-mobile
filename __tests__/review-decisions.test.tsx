import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import ApprovalsScreen from '@/app/(tabs)/activity/approvals';
import RunDetailScreen from '@/app/(tabs)/activity/run';
import { ReviewDecisions } from '@/components/runs/review-decisions';
import { nocturneDark } from '@/constants/theme';
import { decideApproval, decideReview, type Block } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { newIdempotencyKey } from '@/lib/platform/client';
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
  (newIdempotencyKey as jest.Mock).mockImplementation(() => 'key');
});

type HeldForm = { kind?: 'approval' | 'review'; eligibleRoles?: string[] };

function heldDetail({ kind = 'approval', eligibleRoles = ['owner', 'admin'] }: HeldForm = {}): Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'> {
  const base = runDetailPayload('run-1');
  return {
    ...base,
    run: { ...base.run, id: RUN_ID, status: 'held', endedAt: undefined },
    blocks: [
      { type: 'text', text: '2 changes need your review.', tone: 'warning' },
      {
        type: 'questions',
        form: { kind, approvalId: APPROVAL_ID, eligibleRoles, decisions: CHANGES },
      } as unknown as Block,
    ],
  };
}

function openHeld(role: 'owner' | 'admin' | 'member', approvals: Approval[] = [], form: HeldForm = {}) {
  routePlatform(platformOperation, {
    '/approvals': { approvals },
    '/v1/workspaces': {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role }],
      activeWorkspaceId: TEST_WORKSPACE,
    },
  });
  const routed = platformOperation.getMockImplementation()!;
  const detail = heldDetail(form);
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
    expect(review.getByLabelText('N18.4 → Remove · No line in the note supports this code.')).toBeTruthy();
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

  it('to a member: every row read-only, then "Only an owner or admin can review this."; no pills', async () => {
    await openHeld('member');
    expect((await screen.findByTestId('run-review-member')).props.children).toBe('Only an owner or admin can review this.');
    const rows = within(screen.getByTestId('run-review-readonly'));
    expect(rows.getByLabelText('N18.4 → Remove · No line in the note supports this code.')).toBeTruthy();
    expect(rows.getByText('Add Z99.2')).toBeTruthy();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Deny')).toBeNull();
    expect(screen.queryByText('Accept or deny each change.')).toBeNull();
    expect(screen.queryByText('Save review')).toBeNull();
  });

  it('to an admin on a review only an owner may answer: who may decide it, never the members\' line', async () => {
    await openHeld('admin', [], { eligibleRoles: ['owner'] });
    expect((await screen.findByTestId('run-review-member')).props.children).toBe('Only owner can decide this.');
    expect(screen.queryByText('Only an owner or admin can review this.')).toBeNull();
    const rows = within(screen.getByTestId('run-review-readonly'));
    expect(rows.getByLabelText('N18.4 → Remove · No line in the note supports this code.')).toBeTruthy();
    expect(rows.getByText('Add Z99.2')).toBeTruthy();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Deny')).toBeNull();
    expect(screen.queryByText('Save review')).toBeNull();
  });

  it("the backend's draft form, kind 'review', draws the same rows, not the fallback", async () => {
    await openHeld('owner', [], { kind: 'review' });
    const review = within(await screen.findByTestId('run-review-block'));
    expect(review.getByText('Add Z99.2')).toBeTruthy();
    expect(review.getAllByText('Deny')).toHaveLength(2);
    expect(screen.queryByText("This part can't be shown here yet.")).toBeNull();
  });

  it('a screen reader hears each pill with its change, and the chosen one selected', async () => {
    await openHeld('owner');
    const accept = await screen.findByTestId('run-review-accept-z99-2');
    expect(accept.props.accessibilityLabel).toBe('Accept: Add Z99.2');
    expect(screen.getByTestId('run-review-deny-n18-4').props.accessibilityLabel).toBe('Deny: N18.4 → Remove');
    expect(accept.props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(accept);
    expect(screen.getByTestId('run-review-accept-z99-2').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('run-review-deny-z99-2').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('while it saves, the pills and Save review wait', async () => {
    let finish: (value: unknown) => void = () => undefined;
    (decideReview as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    await openHeld('owner');
    await fireEvent.press(await screen.findByTestId('run-review-accept-n18-4'));
    await fireEvent.press(screen.getByTestId('run-review-accept-z99-2'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('run-review-save'));
    });
    for (const id of ['accept-n18-4', 'deny-n18-4', 'accept-z99-2', 'deny-z99-2', 'save']) {
      expect(screen.getByTestId(`run-review-${id}`).props.accessibilityState).toMatchObject({ disabled: true });
    }
    await act(async () => finish({ approval: {} }));
  });

  it('a refused save tried again with the same answers keeps its key; changed answers take a new one', async () => {
    let n = 0;
    (newIdempotencyKey as jest.Mock).mockImplementation(() => `key-${++n}`);
    const refused = new PlatformError('not now', 503);
    (decideReview as jest.Mock).mockRejectedValueOnce(refused).mockRejectedValueOnce(refused);
    await openHeld('owner');
    await fireEvent.press(await screen.findByTestId('run-review-accept-n18-4'));
    await fireEvent.press(screen.getByTestId('run-review-accept-z99-2'));
    const save = async () => {
      await act(async () => {
        fireEvent.press(screen.getByTestId('run-review-save'));
      });
      await waitFor(() => expect(screen.getByTestId('run-review-save').props.accessibilityState).not.toMatchObject({ disabled: true }));
    };
    await save();
    await save();
    await fireEvent.press(screen.getByTestId('run-review-deny-z99-2'));
    await save();
    const keys = (decideReview as jest.Mock).mock.calls.map((call) => call[3]);
    expect(keys).toEqual(['key-1', 'key-1', 'key-2']);
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

/** A review grouped by visit (Round 21 platform round 2, B3). */
describe('a review whose changes carry groups', () => {
  const GROUPED = [
    { id: 'a1', label: 'Line A1 → Add', group: 'Visit 1 · Oct 1' },
    { id: 'b1', label: 'Line B1 → Keep', group: 'Visit 2 · Oct 3' },
    { id: 'a2', label: 'Line A2 → Remove', detail: 'Not in the note.', group: 'Visit 1 · Oct 1' },
  ];

  it('draws each change under its group\'s heading, the groups in the order first sent, every group open', async () => {
    await renderWithProviders(<ReviewDecisions testID="r" changes={GROUPED} onSave={jest.fn()} />, signedInSession);
    expect(screen.getByTestId('r-group-0').props.children).toBe('Visit 1 · Oct 1');
    expect(screen.getByTestId('r-group-1').props.children).toBe('Visit 2 · Oct 3');
    const words = screen
      .getAllByText(/Visit|Line/u)
      .map((node) => node.props.children as string);
    expect(words).toEqual(['Visit 1 · Oct 1', 'Line A1 → Add', 'Line A2 → Remove', 'Visit 2 · Oct 3', 'Line B1 → Keep']);
  });

  it('400 changes: every one drawn, every group open, and Save review waits for an answer', async () => {
    const onSave = jest.fn();
    const changes = Array.from({ length: 400 }, (_, at) => ({ id: `c-${at}`, label: `Change ${at}`, group: `Visit ${Math.floor(at / 100) + 1}` }));
    await renderWithProviders(<ReviewDecisions testID="r" changes={changes} onSave={onSave} />, signedInSession);
    expect(screen.getAllByText(/^Change /u)).toHaveLength(400);
    expect([0, 1, 2, 3].map((at) => screen.getByTestId(`r-group-${at}`).props.children)).toEqual(['Visit 1', 'Visit 2', 'Visit 3', 'Visit 4']);
    expect(screen.getByTestId('r-save').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('grouped, Save review still needs every answer, and sends them in the order sent', async () => {
    const onSave = jest.fn();
    await renderWithProviders(<ReviewDecisions testID="r" changes={GROUPED} onSave={onSave} />, signedInSession);
    await fireEvent.press(screen.getByTestId('r-accept-a1'));
    await fireEvent.press(screen.getByTestId('r-deny-a2'));
    await fireEvent.press(screen.getByTestId('r-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Accept or deny each change.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('r-accept-b1'));
    await fireEvent.press(screen.getByTestId('r-save'));
    expect(onSave).toHaveBeenCalledWith([
      { id: 'a1', decision: 'accepted' },
      { id: 'b1', decision: 'accepted' },
      { id: 'a2', decision: 'denied' },
    ]);
  });

  it('changes with no group: no heading, one list in the order sent (the plain review, unchanged)', async () => {
    await renderWithProviders(<ReviewDecisions testID="r" changes={CHANGES} onSave={jest.fn()} />, signedInSession);
    expect(screen.queryByTestId('r-group-0')).toBeNull();
    expect(screen.getAllByText(/N18\.4|Z99\.2/u).map((node) => node.props.children)).toEqual(['N18.4 → Remove', 'Add Z99.2']);
  });
});
