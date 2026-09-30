import { DELETION_WORDS, deletionOutcome } from '@/lib/content/deletion';
import { PlatformError, PlatformRateLimitedError, PlatformUnreachableError } from '@/lib/platform/problem';
import { formatPlanPrice } from '@/lib/view/plan-price';

/**
 * What an account deletion came to, in ADR-0028's words (24.6.2) — each answer
 * `DELETE /v1/account` gives a bearer caller, and what the app may say about it.
 */
describe('deletionOutcome', () => {
  it('reads a clean answer as deleted', () => {
    expect(deletionOutcome(null, false)).toEqual({ kind: 'deleted' });
  });

  it('reads the bearer-only 502 as deleted, with its sign-in still to revoke', () => {
    const error = new PlatformError('Revocation failed', 502, 'SESSION_REVOCATION_FAILED');
    expect(deletionOutcome(error, false)).toEqual({ kind: 'deleted-not-revoked' });
  });

  it('never says "deleted" or "not deleted" for a lost answer: it checks the session first', () => {
    expect(deletionOutcome(new PlatformError('Dependency failure', 502, 'DEPENDENCY_FAILURE'), false)).toEqual({ kind: 'check' });
    expect(deletionOutcome(new PlatformUnreachableError(), false)).toEqual({ kind: 'check' });
    expect(deletionOutcome(new PlatformError('Unavailable', 503), false)).toEqual({ kind: 'check' });
    expect(deletionOutcome(new TypeError('boom'), false)).toEqual({ kind: 'check' });
  });

  it('keeps the account on a partial deletion, and says anything removed is gone', () => {
    expect(deletionOutcome(new PlatformError('Conflict', 409), false)).toEqual({ kind: 'failed', message: DELETION_WORDS.retry });
  });

  it('says an ended session did not run the attempt — unless an earlier one was lost', () => {
    expect(deletionOutcome(new PlatformError('Unauthenticated', 401), false)).toEqual({
      kind: 'expired',
      message: DELETION_WORDS.expired,
    });
    expect(deletionOutcome(new PlatformError('Unauthenticated', 401), true)).toEqual({
      kind: 'expired',
      message: DELETION_WORDS.expiredAfterUnknown,
    });
  });

  it('says a busy platform with its wait, and that nothing was deleted', () => {
    const busy = new PlatformRateLimitedError('The platform is busy right now. Try again in 30 seconds.', 30);
    expect(deletionOutcome(busy, false)).toEqual({
      kind: 'failed',
      message: 'The platform is busy right now. Try again in 30 seconds. Your account was not deleted.',
    });
  });

  it('says any other refusal in words, not the Edge title', () => {
    expect(deletionOutcome(new PlatformError('Forbidden', 403), false)).toEqual({
      kind: 'failed',
      message: DELETION_WORDS.refused,
    });
  });
});

describe('formatPlanPrice — the platform publishes minor units (ADR-0031)', () => {
  it('states a price it can, with its interval', () => {
    expect(formatPlanPrice({ amount: 4900, currency: 'usd', interval: 'month' })).toBe('$49.00 per month');
    expect(formatPlanPrice({ amount: 1200, currency: 'jpy' })).toBe('¥1,200');
  });

  it('states none it would have to guess', () => {
    expect(formatPlanPrice({ amount: 4900, currency: 'bhd' })).toBeUndefined();
    expect(formatPlanPrice({ amount: 49.5, currency: 'usd' })).toBeUndefined();
  });
});
