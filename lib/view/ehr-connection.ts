import { EHR_SIGN_IN } from '@/lib/content/ehr-connect';
import type { ConnectionProvider } from '@/lib/platform/catalog';

/**
 * An EHR's form (Round 21 stage 2, D1; backend ADR-0050; Round 22, ADR-0054).
 * Two SMART kinds, one form: `smart-backend` sends its fields to `key`, as a
 * pasted key does; `smart-launch` — the EHR since ADR-0054 — sends the same
 * fields to `authorize` as `credentials` and signs the person in at the EHR's
 * own page (`components/settings/ehr-sign-in-dialog.tsx`). Its row's line — the
 * clinic's host once connected — is `connectionLine`'s (`lib/view/catalog.ts`),
 * by the provider's `authType`, on Connections and on Set up alike
 * (~~hostLine, on Connections only~~ until the review's finding 4).
 */

type SmartProvider = Pick<ConnectionProvider, 'authType' | 'vendors'>;

/** A provider whose Connect opens the sign-in form: an EHR a person signs in to (ADR-0054). */
export function opensSignInForm(authType: ConnectionProvider['authType'] | undefined): boolean {
  return authType === 'smart-launch';
}

/** The vendors an EHR's form offers (`vendors`, those the platform holds a key for), in the platform's order. */
export function smartVendors(provider: SmartProvider): { id: string; label: string }[] {
  return provider.authType === 'smart-backend' || opensSignInForm(provider.authType) ? (provider.vendors ?? []) : [];
}

/**
 * The vendor an EHR's form starts with (the session's parity decision D1, the
 * same on the website): the one listed when the platform lists exactly one,
 * else none until the person picks one — so a clinic never signs in to a
 * system it did not choose. ~~The first listed until another is picked~~
 * until the review of Round 22's app lane.
 */
export function preChosenVendor(provider: SmartProvider): string | null {
  const vendors = smartVendors(provider);
  return vendors.length === 1 ? vendors[0]!.id : null;
}

/**
 * The sign-in form's button, named by the vendor chosen (D1, the website's
 * `signInLabel`): "Sign in with {vendor}", the vendor's full label as the
 * platform gives it — "Sign in with Epic (test system)", "Sign in with Epic" —
 * so the clinic sees which system it signs in to; "Sign in" until one is
 * chosen. ~~Its label without a closing parenthetical~~ until the review of
 * Round 22's app lane.
 */
export function signInLabel(provider: SmartProvider, vendorId: string | null | undefined): string {
  const vendor = smartVendors(provider).find((each) => each.id === vendorId);
  return vendor ? `${EHR_SIGN_IN} with ${vendor.label}` : EHR_SIGN_IN;
}
