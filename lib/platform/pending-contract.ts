import type { components } from '@/lib/generated/platform-contracts/automations';

/**
 * PENDING CONTRACT — the platform round for a setup dropdown and a review of
 * each change (Round 21; the round's platform spec, F1 and F2). The
 * backend is adding these shapes to its contracts in the same round, and this
 * build runs ahead of them: until `npm run generate:platform-contracts` reads
 * the backend's merged documents, this module is the narrowest local type each
 * screen needs, and the one place they live. At that regeneration this file is
 * deleted and its importers read the generated names (`AutomationSetupField`'s
 * `select`, `options`, `multiple`; `Approval.decisions`; the decision body's
 * `decisions`) — a name that differs is then a typecheck failure, not a guess
 * on screen. Never hand-edit a generated file to match this one.
 */

type GeneratedSetupField = components['schemas']['AutomationSetupField'];
type GeneratedApproval = components['schemas']['Approval'];

/** The new setup control (F1): a list of choices, one or several. */
export type PendingSetupControl = 'select';

/**
 * A setup field as this build reads it: the generated field, with `select`
 * among its controls and the select's own keys — `options` (1 to 32, unique,
 * 1 to 80 characters each) and `multiple` (default false). Its `defaultValue`
 * stays `unknown`, as generated: one option, or a list of them.
 */
export type PendingSetupField = Omit<GeneratedSetupField, 'control'> & {
  control: GeneratedSetupField['control'] | PendingSetupControl;
  options?: string[];
  multiple?: boolean;
};

/** One change a held run offers for review (F2): `id` as a step id, `label` 1–120, `detail` 1–200. */
export type OfferedDecision = { id: string; label: string; detail?: string };

/** A person's answer to one offered change. */
export type DecisionAnswer = 'accepted' | 'denied';

/** One answer, as the decision route takes it and the approval keeps it. */
export type AnsweredDecision = { id: string; decision: DecisionAnswer };

/**
 * An approval that may offer changes (`decisions`) and, once reviewed, keep
 * their answers. The answers' field name is not final in the backend's draft:
 * `reviewAnswers` reads an answer on each offered row or an `answers` list,
 * and the regeneration settles it.
 */
export type PendingApproval = GeneratedApproval & {
  decisions?: (OfferedDecision & { decision?: DecisionAnswer })[];
  answers?: AnsweredDecision[];
};

/** The approval form on a run's page (`questions{approval}`), carrying the changes it offers. */
export type PendingApprovalForm = { approvalId?: string; eligibleRoles?: readonly ('owner' | 'admin' | 'member')[]; decisions?: OfferedDecision[] };

/** The decision route's body for an approval that offers changes: every offered id answered once. */
export type ReviewBody = { decisions: AnsweredDecision[] };

/** The changes an approval offers, or none (a plain approval: Approve / Deny). */
export function offeredDecisions(approval: { decisions?: unknown } | undefined | null): OfferedDecision[] {
  const list = approval?.decisions;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (row): row is OfferedDecision =>
      typeof row === 'object' && row !== null && typeof (row as OfferedDecision).id === 'string' && typeof (row as OfferedDecision).label === 'string',
  );
}

/** An approval's saved answers, wherever the draft contract keeps them; empty when it has none. */
export function reviewAnswers(approval: PendingApproval | undefined | null): AnsweredDecision[] {
  if (!approval) return [];
  if (Array.isArray(approval.answers)) return approval.answers;
  return (approval.decisions ?? []).flatMap((row) =>
    row.decision === 'accepted' || row.decision === 'denied' ? [{ id: row.id, decision: row.decision }] : [],
  );
}
