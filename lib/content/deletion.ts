import { PlatformError, PlatformRateLimitedError, PlatformUnreachableError } from '@/lib/platform/problem';

/**
 * Deleting an account, as ADR-0028 defines it, in the website's words
 * (`snoopy/components/account/DeleteAccountButton.tsx`) — BUILD-PLAN 24.6.2.
 * The copy promises no more than `DELETE /v1/account` does: workspaces go one at
 * a time, a refusal keeps the account, and no workspace is deleted on its own
 * (19.6.2).
 */
export const DELETE_ACCOUNT_TITLE = 'Delete account?';
export const DELETE_ACCOUNT_BODY = [
  'This removes your personal workspace and every organization you are the only owner of — including organizations other people belong to, who lose them and everything in them. Organizations that have another owner are kept; you just leave them.',
  'Workspaces are removed one at a time. If one cannot be removed, your account stays and you can try again; anything already removed stays removed. This cannot be undone.',
] as const;

export const DELETION_WORDS = {
  retry:
    'Some of your workspaces could not be removed, so your account is still here. Anything already removed is gone. You can try again.',
  unknown:
    'The platform could not complete this request, so it is not known whether your account was removed. You can try again.',
  stillHere: 'The platform could not complete this request. Your account is still here. You can try again.',
  expired: 'Your session ended, so this attempt did not run. Sign in again to come back here.',
  expiredAfterUnknown:
    'Your session ended, and your account may already have been removed by the earlier attempt. Sign in again to check.',
  refused:
    'The platform refused this request, so your account was not deleted. Try again; if it is refused again, contact support.',
  notRevoked:
    "Your account was deleted, but this device's sign-in could not be revoked yet. Try again to finish signing out.",
} as const;

/**
 * What one attempt came to. A bearer caller — this app — can meet one answer
 * the website never does: a 502 `SESSION_REVOCATION_FAILED`, the account
 * deleted but the refresh token it sent still live, so sign-out is retried
 * before this device lets go of it. Any other 5xx, or no answer, is unknown, and
 * the contract says to read the session before saying either way (`check`).
 */
export type DeletionOutcome =
  | { kind: 'deleted' }
  | { kind: 'deleted-not-revoked' }
  | { kind: 'check' }
  | { kind: 'expired'; message: string }
  | { kind: 'failed'; message: string };

export function deletionOutcome(error: unknown, anAttemptWasLost: boolean): DeletionOutcome {
  if (error === null) return { kind: 'deleted' };
  if (error instanceof PlatformError && error.status === 502 && error.code === 'SESSION_REVOCATION_FAILED') {
    return { kind: 'deleted-not-revoked' };
  }
  if (error instanceof PlatformUnreachableError || !(error instanceof PlatformError) || error.status >= 500) {
    return { kind: 'check' };
  }
  if (error.status === 401) {
    return { kind: 'expired', message: anAttemptWasLost ? DELETION_WORDS.expiredAfterUnknown : DELETION_WORDS.expired };
  }
  if (error.status === 409) return { kind: 'failed', message: DELETION_WORDS.retry };
  if (error instanceof PlatformRateLimitedError) {
    return { kind: 'failed', message: `${error.message} Your account was not deleted.` };
  }
  return { kind: 'failed', message: DELETION_WORDS.refused };
}
