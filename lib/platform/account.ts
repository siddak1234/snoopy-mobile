import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';
import { readSession } from './session-store';

/**
 * The person's own account (BUILD-PLAN 24.6.2): the sign-in accounts linked to
 * it, and deleting it (FR-21, ADR-0028). The website's `LinkedAccountsSection`
 * and `DeleteAccountButton` read and call the same operations.
 */

type Schema = components['schemas'];
export type LoginIdentity = Schema['LoginIdentitySummary'];

export async function readIdentities(): Promise<LoginIdentity[]> {
  const found = await platformOperation('/v1/auth/identities', ({ platform }, signal) =>
    platform.GET('/v1/auth/identities', { signal }),
  );
  return found.identities;
}

/**
 * Delete the account. A bearer caller sends its refresh token so the Edge can
 * revoke it upstream; it is read inside the request, so the one retry after a
 * renewed session sends the renewed token, not the one the renewal spent.
 *
 * What an answer means is the contract's, and `deletionOutcome` says it.
 */
export function deleteAccount(): Promise<unknown> {
  return platformOperation('/v1/account', async ({ platform }, signal) => {
    const stored = await readSession();
    return platform.DELETE('/v1/account', {
      ...(stored ? { body: { refreshToken: stored.refreshToken } } : {}),
      signal,
    });
  });
}
