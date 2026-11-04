import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { roleIn, useSession } from '@/hooks/use-session';
import { agreementRefusal, awaitAgreement, type AgreementAction } from '@/lib/view/health-agreement';

/**
 * What a screen does with a refusal for the health data agreement (Round 21
 * stage 2, C3; `lib/view/health-agreement.ts`), on Set up's Turn on (`add`)
 * and on Start run (`run`). Asked only after a refusal: no add or run makes a
 * call for it.
 *
 * Answers null for any other refusal — the screen says its own words. Else
 * `{ accepted: true }`: the owner accepted on the agreement screen, and the
 * screen sends again what was refused, with the same idempotency key (a
 * refused add or run recorded none). Else `{ accepted: false, line }`: the line
 * to say — to anyone but the owner, or while none is published — or null when
 * the owner left the agreement screen without accepting.
 */
export type AgreementAnswer = { accepted: true } | { accepted: false; line: string | null };

export function useHealthAgreement(action: AgreementAction) {
  const router = useRouter();
  const session = useSession();
  return useCallback(
    async (error: unknown, workspaceId: string): Promise<AgreementAnswer | null> => {
      const refusal = agreementRefusal(error, roleIn(session, workspaceId));
      if (!refusal) return null;
      if (!refusal.open) return { accepted: false, line: refusal.line };
      const accepted = await awaitAgreement(() =>
        router.push({ pathname: '/(tabs)/flows/agreement', params: { action, workspace: workspaceId } }),
      );
      return accepted ? { accepted: true } : { accepted: false, line: null };
    },
    [action, router, session],
  );
}
