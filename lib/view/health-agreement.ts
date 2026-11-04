import { AGREEMENT_NOT_PUBLISHED, ASK_OWNER_TO_ACCEPT } from '@/lib/content/health-agreement';
import { PlatformError } from '@/lib/platform/problem';
import type { WorkspaceRole } from '@/lib/view/roles';

/**
 * A flow that carries health data, refused for the health data agreement
 * (Round 21 stage 2, C3; backend ADR-0049, `AgreementRequiredDetails`): its
 * add (`createSubscription`) or a run's start (`createRun`) answered 403
 * `agreement_required` and nothing was made.
 *
 * - The workspace's owner, who alone accepts it, is shown the agreement on its
 *   own screen (`/(tabs)/flows/agreement`); once accepted, what was refused is
 *   sent again with the same idempotency key.
 * - Anyone else is told the one line, and nothing more is sent.
 * - No version published (`version` absent): the owner is told it is not
 *   available yet, and no screen opens.
 */
export type AgreementAction = 'add' | 'run';

export type AgreementRefusal = { open: true } | { open: false; line: string };

/** What a refusal asks of this person; null for any refusal that is not the agreement's. */
export function agreementRefusal(error: unknown, role: WorkspaceRole | undefined): AgreementRefusal | null {
  if (!(error instanceof PlatformError) || error.status !== 403 || error.details?.reason !== 'agreement_required') {
    return null;
  }
  if (role !== 'owner') return { open: false, line: ASK_OWNER_TO_ACCEPT };
  const version = error.details?.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    return { open: false, line: AGREEMENT_NOT_PUBLISHED };
  }
  return { open: true };
}

/**
 * The screen that was refused waits for the agreement screen's answer: one
 * ask at a time, held in memory for the process's life, as `return-to.ts`
 * holds a screen. `true` once the owner accepted; `false` when the screen was
 * left without it, or another ask replaced this one.
 */
let waiting: ((accepted: boolean) => void) | null = null;

/** Opens the agreement screen (`open`), and answers once it closes. */
export function awaitAgreement(open: () => void): Promise<boolean> {
  settleAgreement(false);
  return new Promise<boolean>((resolve) => {
    waiting = resolve;
    open();
  });
}

/** The agreement screen's answer, once: accepted, or left without accepting. Nothing waiting: nothing happens. */
export function settleAgreement(accepted: boolean): void {
  const resolve = waiting;
  waiting = null;
  resolve?.(accepted);
}
