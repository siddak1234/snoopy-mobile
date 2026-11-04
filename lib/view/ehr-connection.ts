import type { ConnectionProvider } from '@/lib/platform/catalog';

/**
 * An EHR's key form (Round 21 stage 2, D1; backend ADR-0050). Its row's line —
 * the clinic's host once connected — is `connectionLine`'s (`lib/view/catalog.ts`),
 * by the provider's `authType`, on Connections and on Set up alike
 * (~~hostLine, on Connections only~~ until the review's finding 4).
 */

/** The vendors its key form offers (`vendors`, those the platform holds a key for), in the platform's order. */
export function smartVendors(provider: Pick<ConnectionProvider, 'authType' | 'vendors'>): { id: string; label: string }[] {
  return provider.authType === 'smart-backend' ? (provider.vendors ?? []) : [];
}
