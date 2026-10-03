import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';
import { invalidateShared, shared } from './snapshot';

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

/**
 * Owner or admin only; the Edge refuses anyone else. Through the shared
 * snapshot since build 11 (D1), for the Settings index's quiet plan line: a
 * visit to Settings is one request per workspace per settled window, not one
 * per mount. A hosted page handed out drops it (`changedBilling` below).
 *
 * The Billing page reads `fresh`: a real request every time it loads, as it
 * was before the snapshot — a read the snapshot kept from before Stripe's
 * webhook landed would otherwise show the old plan on the page itself for up
 * to the window's two minutes after a checkout (the build 11 review). Its
 * answer replaces the snapshot's, so the plan line reads what the page read.
 */
export function readBilling(workspaceId: string, options: { fresh?: boolean } = {}): Promise<WorkspaceBilling> {
  if (options.fresh) invalidateShared(workspaceId, ['billing']);
  return shared(workspaceId, 'billing', 'settled', () =>
    platformOperation(`/v1/workspaces/${workspaceId}/billing`, ({ platform }, signal) =>
      platform.GET('/v1/workspaces/{workspaceId}/billing', { params: { path: { workspaceId } }, signal }),
    ),
  );
}

/**
 * The workspace's billing may have changed — a checkout or the portal was
 * opened, and what the person does there is the provider's to know — so its
 * next read is a real request rather than the snapshot's answer.
 */
function changedBilling<T>(workspaceId: string): (answer: T) => T {
  return (answer) => {
    invalidateShared(workspaceId, ['billing']);
    return answer;
  };
}

/** A hosted checkout for one plan; the platform returns to its own origin. */
export function openCheckout(workspaceId: string, planId: string): Promise<HostedBillingSession> {
  return platformOperation(`/v1/workspaces/${workspaceId}/billing/checkout`, ({ platform }, signal) =>
    platform.POST('/v1/workspaces/{workspaceId}/billing/checkout', {
      params: { path: { workspaceId } },
      body: { planId },
      signal,
    }),
  ).then(changedBilling(workspaceId));
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
  ).then(changedBilling(workspaceId));
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
