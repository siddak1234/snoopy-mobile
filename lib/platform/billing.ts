import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';

/**
 * Billing — ADR-0025's four read-or-redirect operations and nothing else, as
 * `snoopy/lib/billing.ts` consumes them (BUILD-PLAN 24.6.1). Checkout and the
 * portal are provider-hosted: the platform answers a URL and the system browser
 * opens it, so no card field and no identifier other than this platform's own
 * plan id passes through the app. There is no in-app purchase (ADR-0032).
 */

type Schema = components['schemas'];
export type PurchasablePlan = Schema['PurchasablePlan'];
export type PlanPrice = Schema['PlanPrice'];
export type WorkspaceBilling = Schema['WorkspaceBillingResponse'];
export type HostedBillingSession = Schema['HostedBillingSession'];

export function readPlans(): Promise<{ plans: PurchasablePlan[] }> {
  return platformOperation('/v1/plans', ({ platform }, signal) => platform.GET('/v1/plans', { signal }));
}

/** Owner or admin only; the Edge refuses anyone else. */
export function readBilling(workspaceId: string): Promise<WorkspaceBilling> {
  return platformOperation(`/v1/workspaces/${workspaceId}/billing`, ({ platform }, signal) =>
    platform.GET('/v1/workspaces/{workspaceId}/billing', { params: { path: { workspaceId } }, signal }),
  );
}

/** A hosted checkout for one plan; the platform returns to its own origin. */
export function openCheckout(workspaceId: string, planId: string): Promise<HostedBillingSession> {
  return platformOperation(`/v1/workspaces/${workspaceId}/billing/checkout`, ({ platform }, signal) =>
    platform.POST('/v1/workspaces/{workspaceId}/billing/checkout', {
      params: { path: { workspaceId } },
      body: { planId },
      signal,
    }),
  );
}

/**
 * A hosted portal session. `{}` is sent because an Edge deployed before backend
 * §12.1 #165 answers 400 to an empty body (the website's reason, too). A 409
 * means the workspace has no billing account yet: choose a plan instead.
 */
export function openPortal(workspaceId: string): Promise<HostedBillingSession> {
  return platformOperation(`/v1/workspaces/${workspaceId}/billing/portal`, ({ platform }, signal) =>
    platform.POST('/v1/workspaces/{workspaceId}/billing/portal', {
      params: { path: { workspaceId } },
      body: {},
      signal,
    }),
  );
}

/**
 * The hosted address, only when it is an https URL — a capability, not a
 * credential, and nothing else is opened. Ported from the website's `hosted`.
 */
export function hostedAddress(session: HostedBillingSession): string | null {
  try {
    const url = new URL(session.url);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
