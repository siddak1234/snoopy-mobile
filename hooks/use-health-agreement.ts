import { useRouter, useSegments } from 'expo-router';
import { useCallback } from 'react';

import { roleIn, useSession } from '@/hooks/use-session';
import { agreementPath, agreementRefusal, awaitAgreement } from '@/lib/view/health-agreement';

/**
 * What a screen does with a refusal for the health data agreement (Round 21
 * stage 2, C3; `lib/view/health-agreement.ts`), on Start run and on an item's
 * upload, which starts the run that reads it. Asked only after a refusal: no
 * run makes a call for it. (~~Set up's Turn on, `add`~~ until builds 37 and 39,
 * wave 2: Set up asks in its own "Contract and accept" section.)
 *
 * Answers null for any other refusal — the screen says its own words. Else
 * `{ accepted: true }`: the owner accepted on the agreement screen, and the
 * screen sends again what was refused, with the same idempotency key (a
 * refused run recorded none). Else `{ accepted: false, line }`: the line
 * to say — to anyone but the owner, or while none is published — or null when
 * the owner left the agreement screen without accepting.
 *
 * The agreement opens in the tab the refused screen is in (`agreementPath`):
 * Home's own copy from Home's YOUR FLOWS, so Back returns to Home; Settings'
 * own copy from the flow page Settings opens, so Back returns there; else the
 * Flows tab's. `opening` is called just before it opens — the upload card,
 * a dialog over the page, steps aside for it.
 */
export type AgreementAnswer = { accepted: true } | { accepted: false; line: string | null };

export function useHealthAgreement() {
  const router = useRouter();
  const segments = useSegments();
  const session = useSession();
  return useCallback(
    async (error: unknown, workspaceId: string, opening?: () => void): Promise<AgreementAnswer | null> => {
      const refusal = agreementRefusal(error, roleIn(session, workspaceId));
      if (!refusal) return null;
      if (!refusal.open) return { accepted: false, line: refusal.line };
      opening?.();
      const accepted = await awaitAgreement(() =>
        router.push({ pathname: agreementPath(segments), params: { workspace: workspaceId } }),
      );
      return accepted ? { accepted: true } : { accepted: false, line: null };
    },
    [router, segments, session],
  );
}
