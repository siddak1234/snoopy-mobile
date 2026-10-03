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
 * Unlink a sign-in account (backend 24.11.1). A device sends its refresh token
 * in the body, as it does to sign out; the answer is what stays linked, so the
 * screen needs no second read. The account the person signed up with and the
 * last one left are refused with a reason; the screen says it in words
 * (`unlinkRefusal`), since the error carries the problem's title, not its
 * sentence.
 */
export async function unlinkIdentity(provider: LoginIdentity['provider']): Promise<LoginIdentity[]> {
  const left = await platformOperation(`/v1/auth/native/identities/${provider}/unlink`, async ({ platform }, signal) => {
    const stored = await readSession();
    return platform.POST('/v1/auth/native/identities/{provider}/unlink', {
      params: { path: { provider } },
      body: { refreshToken: stored?.refreshToken ?? '' },
      signal,
    });
  });
  return left.identities;
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
