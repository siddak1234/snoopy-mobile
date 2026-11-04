import { AGREEMENT_NOT_PUBLISHED, ASK_OWNER_TO_ACCEPT } from '@/lib/content/health-agreement';
import { refusalMessage } from '@/lib/content/refusals';
import { PlatformError } from '@/lib/platform/problem';
import type { WorkspaceRole } from '@/lib/view/roles';

/**
 * A flow that carries health data, refused for the health data agreement
 * (Round 21 stage 2, C3; backend ADR-0049, `AgreementRequiredDetails`): its
 * add (`createSubscription`) or a run's start (`createRun`) answered 403
 * `agreement_required` and nothing was made.
 *
 * - The workspace's owner, who alone accepts it, is shown the agreement on its
 *   own screen (`agreementPath`); once accepted, what was refused is sent again
 *   with the same idempotency key.
 * - Anyone else is told the one line, and nothing more is sent.
 * - No version published (`version` absent): the owner is told it is not
 *   available yet, and no screen opens.
 */
export type AgreementAction = 'add' | 'run';

/**
 * Where the agreement opens: in the tab of the screen that was refused, so
 * Back — without accepting, or once accepted — stays in it. Home's own copy
 * for Home's YOUR FLOWS (`/(tabs)/(home)/agreement`), else the Flows tab's
 * (`/(tabs)/flows/agreement`), as `runStack` keeps a run in its stack.
 */
export function agreementPath(segments: readonly string[]): '/(tabs)/(home)/agreement' | '/(tabs)/flows/agreement' {
  return segments.includes('(home)') ? '/(tabs)/(home)/agreement' : '/(tabs)/flows/agreement';
}

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

/** The longest name or title an acceptance takes (the contract's `AgreementAcceptanceRequest`: 1–120, the website's `maxLength`). */
export const SIGNER_FIELD_LIMIT = 120;

/**
 * A refused acceptance, in the website's words (its `acceptHealthAgreement`):
 * 403 — the person is no longer the workspace's owner, by its membership — the
 * line anyone but the owner is told; 503 `agreement_not_published` — no text
 * is current — that none is available yet; any other, the platform's words.
 */
export function acceptanceRefusal(error: unknown): string {
  if (error instanceof PlatformError && error.status === 503 && error.details?.reason === 'agreement_not_published') {
    return AGREEMENT_NOT_PUBLISHED;
  }
  if (error instanceof PlatformError && error.status === 403) return ASK_OWNER_TO_ACCEPT;
  return refusalMessage(error);
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
