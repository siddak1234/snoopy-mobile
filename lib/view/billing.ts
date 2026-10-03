import type { WorkspaceBilling } from '@/lib/platform/billing';

/** The platform's free floor: what a workspace that never paid reports, and never on the plan list. */
export const FREE_PLAN_ID = 'free';

/**
 * The plan a workspace is enrolled in, from what `GET …/billing` answers —
 * ONE rule, shared by the Billing page's cards and the Settings index's plan
 * line (build 11, D1), so the two can never disagree on a workspace mid-way
 * out of a subscription.
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
 * The enrolled plan's name as a person reads it — "Free", "Plus", "Pro": the
 * platform's display name for the plan the workspace is on, and the free
 * floor's own name (the platform's, or "Free") once access has ended.
 */
export function enrolledPlanName(state: Pick<WorkspaceBilling, 'planId' | 'displayName' | 'status'>): string {
  if (enrolledPlanId(state) === FREE_PLAN_ID) return state.planId === FREE_PLAN_ID ? state.displayName : 'Free';
  return state.displayName;
}
