import { useCallback, useRef, useState } from 'react';

import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { DECISION_NOT_SAVED } from '@/lib/content/screen-states';
import { decideApproval } from '@/lib/platform/automations';
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
 */
export function useApprovalDecision(shownWorkspaceId: string | null | undefined) {
  const session = useSession();
  const [busy, setBusy] = useState<Record<string, Decision>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const intentKeys = useRef<Record<string, { decision: Decision; key: string }>>({});
  const saving = useRef(new Set<string>());

  const decide = useCallback(
    async (approvalId: string, decision: Decision): Promise<boolean> => {
      if (saving.current.has(approvalId)) return false;
      const workspaceId = workspaceIfShown(session, shownWorkspaceId ?? null);
      if (!workspaceId) {
        setErrors((previous) => ({ ...previous, [approvalId]: WORKSPACE_CHANGED }));
        return false;
      }
      const previousIntent = intentKeys.current[approvalId];
      const intent =
        previousIntent?.decision === decision ? previousIntent : { decision, key: newIdempotencyKey('decision') };
      intentKeys.current[approvalId] = intent;
      saving.current.add(approvalId);
      setBusy((previous) => ({ ...previous, [approvalId]: decision }));
      setErrors((previous) => {
        const next = { ...previous };
        delete next[approvalId];
        return next;
      });
      try {
        await decideApproval(workspaceId, approvalId, decision, intent.key);
        delete intentKeys.current[approvalId];
        return true;
      } catch (error) {
        setErrors((previous) => ({ ...previous, [approvalId]: refusalMessage(error, {}, DECISION_NOT_SAVED) }));
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

  return {
    decide,
    busyFor: (approvalId: string): Decision | null => busy[approvalId] ?? null,
    errorFor: (approvalId: string): string | undefined => errors[approvalId],
  };
}
