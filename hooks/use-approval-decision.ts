import { useCallback, useRef, useState } from 'react';

import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { DECISION_NOT_SAVED, REVIEW_NOT_SAVED } from '@/lib/content/screen-states';
import { decideApproval, decideReview, type AnsweredDecision } from '@/lib/platform/automations';
import { newIdempotencyKey } from '@/lib/platform/client';

/** The API's two answers: Approve, and Deny (`rejected`; S6). */
export type Decision = 'approved' | 'rejected';

/**
 * One decision logic for the two places a person decides (round 24 P6, P7; the
 * owner's build 23 F7–F11): the run's step 4 and a Needs-review card —
 * extracted from Approvals, where it was, not copied.
 *
 * - Bound to the workspace the screen read (`workspaceIfShown`): another active
 *   one is refused in the platform's words before anything is sent.
 * - One idempotency key per approval and decision, kept across a failure, so
 *   the same decision tried again is the same request; a new one once it saved.
 * - `busyFor(id)` is the decision being saved (both buttons wait while it is);
 *   `errorFor(id)` the refusal's words, "The decision was not saved." by default.
 * - `decide` answers whether it saved.
 * - `review` (Round 21's platform round, F2) saves a review of each change the
 *   same way — one key per approval and set of answers — and while it saves
 *   `reviewingFor(id)` is true; refused or unanswered, "The review wasn't saved.
 *   Try again." (words.md section 3), whatever the platform said.
 */
export function useApprovalDecision(shownWorkspaceId: string | null | undefined) {
  const session = useSession();
  const [busy, setBusy] = useState<Record<string, Decision | 'review'>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const intentKeys = useRef<Record<string, { decision: string; key: string }>>({});
  const saving = useRef(new Set<string>());

  const send = useCallback(
    async (
      approvalId: string,
      decision: Decision | 'review',
      intentOf: string,
      post: (workspaceId: string, key: string) => Promise<unknown>,
      said: (error: unknown) => string,
    ): Promise<boolean> => {
      if (saving.current.has(approvalId)) return false;
      const workspaceId = workspaceIfShown(session, shownWorkspaceId ?? null);
      if (!workspaceId) {
        setErrors((previous) => ({ ...previous, [approvalId]: WORKSPACE_CHANGED }));
        return false;
      }
      const previousIntent = intentKeys.current[approvalId];
      const intent =
        previousIntent?.decision === intentOf ? previousIntent : { decision: intentOf, key: newIdempotencyKey('decision') };
      intentKeys.current[approvalId] = intent;
      saving.current.add(approvalId);
      setBusy((previous) => ({ ...previous, [approvalId]: decision }));
      setErrors((previous) => {
        const next = { ...previous };
        delete next[approvalId];
        return next;
      });
      try {
        await post(workspaceId, intent.key);
        delete intentKeys.current[approvalId];
        return true;
      } catch (error) {
        setErrors((previous) => ({ ...previous, [approvalId]: said(error) }));
        return false;
      } finally {
        saving.current.delete(approvalId);
        setBusy((previous) => {
          const next = { ...previous };
          delete next[approvalId];
          return next;
        });
      }
    },
    [session, shownWorkspaceId],
  );

  const decide = useCallback(
    (approvalId: string, decision: Decision): Promise<boolean> =>
      send(
        approvalId,
        decision,
        decision,
        (workspaceId, key) => decideApproval(workspaceId, approvalId, decision, key),
        (error) => refusalMessage(error, {}, DECISION_NOT_SAVED),
      ),
    [send],
  );

  const review = useCallback(
    (approvalId: string, answers: readonly AnsweredDecision[]): Promise<boolean> =>
      send(
        approvalId,
        'review',
        `review:${JSON.stringify(answers.map(({ id, decision }) => [id, decision]))}`,
        (workspaceId, key) => decideReview(workspaceId, approvalId, [...answers], key),
        // Refused or unanswered, the one sentence words.md approves for it.
        () => REVIEW_NOT_SAVED,
      ),
    [send],
  );

  return {
    decide,
    review,
    busyFor: (approvalId: string): Decision | null => {
      const pending = busy[approvalId];
      return pending === 'approved' || pending === 'rejected' ? pending : null;
    },
    reviewingFor: (approvalId: string): boolean => busy[approvalId] === 'review',
    errorFor: (approvalId: string): string | undefined => errors[approvalId],
  };
}
