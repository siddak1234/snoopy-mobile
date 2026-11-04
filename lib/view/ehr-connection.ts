import type { Connection, ConnectionProvider } from '@/lib/platform/catalog';

/**
 * An EHR's connection row (Round 21 stage 2, D1; backend ADR-0050): a SMART
 * Backend Services connection names no email — the platform keeps the clinic's
 * FHIR host as the account's name (`externalAccount.displayName`) — so a
 * connected one says that host in Connected's place. Null for any other
 * provider, or one not connected, whose line is `connectionLine`'s.
 */
export function hostLine(
  provider: Pick<ConnectionProvider, 'authType'>,
  connection: Connection | undefined,
): { text: string; tone: 'muted' } | null {
  if (provider.authType !== 'smart-backend' || connection?.status !== 'connected' || connection.errorCode) return null;
  const host = connection.externalAccount.displayName;
  return host ? { text: host, tone: 'muted' } : null;
}

/** The vendors its key form offers (`vendors`, those the platform holds a key for), in the platform's order. */
export function smartVendors(provider: Pick<ConnectionProvider, 'authType' | 'vendors'>): { id: string; label: string }[] {
  return provider.authType === 'smart-backend' ? (provider.vendors ?? []) : [];
}
