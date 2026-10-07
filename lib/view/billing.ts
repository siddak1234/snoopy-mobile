import type { WorkspaceBilling } from '@/lib/platform/billing';
import type { FlowAllowance } from '@/lib/platform/runs';
import type { StatusPillLabel } from './status';

/** The platform's free floor: what a workspace that never paid reports, and never on the plan list. */
export const FREE_PLAN_ID = 'free';

/**
 * The plan a workspace is enrolled in, from what `GET …/billing` answers —
 * ONE rule, shared by the Billing page's cards and the plan's name on the
 * Settings index's Billing row (build 11, D1; on the row's right since the
 * owner's build 12 item 2), so the two can never disagree on a workspace
 * mid-way out of a subscription.
 *
 * `canceled` and `unpaid` end access, which leaves the free floor; `past_due`
 * still grants capabilities — dunning is a period in which the provider
 * retries (the contract's own words on `status`; ADR-0025 §1). A subscription
 * the provider still holds is changed in the portal, and a second checkout
 * would start a second subscription.
 */
export function accessEnded(state: Pick<WorkspaceBilling, 'status'>): boolean {
  return state.status === 'canceled' || state.status === 'unpaid';
}

export function enrolledPlanId(state: Pick<WorkspaceBilling, 'planId' | 'status'>): string {
  return accessEnded(state) ? FREE_PLAN_ID : state.planId;
}

/**
 * The workspace's billing status, as the pill on its enrolled paid plan says it
 * — the website's StatusPill (BillingPanel), drawn for every status while access
 * lasts, `active` included, as ADR-0032 has every platform show the billing
 * status (Gate 24's parity pass, G25; until then a line said the status only
 * when it was not `active`, which no record asks for). The two that end access
 * draw none: that plan is not enrolled any more, Free is.
 */
const BILLING_PILL: Record<NonNullable<WorkspaceBilling['status']>, StatusPillLabel | null> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past due',
  incomplete: 'Incomplete',
  canceled: null,
  unpaid: null,
};

export function billingStatusPill(status: WorkspaceBilling['status']): StatusPillLabel | null {
  return status ? BILLING_PILL[status] : null;
}

/**
 * The enrolled plan's name as a person reads it — "Free", "Plus", "Pro": the
 * platform's display name for the plan the workspace is on, and the free
 * floor's own name (the platform's, or "Free") once access has ended.
 */
export function enrolledPlanName(state: Pick<WorkspaceBilling, 'planId' | 'displayName' | 'status'>): string {
  if (enrolledPlanId(state) === FREE_PLAN_ID) return state.planId === FREE_PLAN_ID ? state.displayName : 'Free';
  return state.displayName;
}

/**
 * A workspace over its plan's flow allowance (the owner's build 13 decision
 * 7a3): no flow starts a run until it is back within it. Null within the plan,
 * on a plan without a ceiling (`allowed: null`), and when the platform could
 * not say (no allowance): unknown is not over. `live` counts every flow not
 * archived — paused and draft too — so archiving is the way back, never pausing.
 */
export function flowsOverPlan(
  allowance: FlowAllowance | undefined,
): { allowed: number; live: number } | null {
  if (!allowance || allowance.allowed === null || allowance.live <= allowance.allowed) return null;
  return { allowed: allowance.allowed, live: allowance.live };
}
