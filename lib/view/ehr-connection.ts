import type { ConnectionProvider } from '@/lib/platform/catalog';

/**
 * An EHR's form (Round 21 stage 2, D1; backend ADR-0050; Round 22, ADR-0054).
 * Two SMART kinds, one form: `smart-backend` sends its fields to `key`, as a
 * pasted key does; `smart-launch` — the EHR since ADR-0054 — sends the same
 * fields to `authorize` as `credentials` and signs the person in at the EHR's
 * own page (`components/settings/connections-card.tsx`). Its row's line — the
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
 * The sign-in form's button, named by the vendor chosen (the session's
 * wording, Round 22): "Sign in with {vendor}", the vendor as the platform
 * labels it without a closing parenthetical — so Epic's two, "Epic (test
 * system)" and "Epic", both say "Sign in with Epic", and another EHR's says
 * its own name; "Sign in" for a vendor not listed.
 */
export function signInLabel(provider: SmartProvider, vendorId: string | null | undefined): string {
  const vendor = smartVendors(provider).find((each) => each.id === vendorId);
  const name = vendor?.label.replace(/\s*\([^)]*\)\s*$/u, '').trim();
  return name ? `Sign in with ${name}` : 'Sign in';
}
