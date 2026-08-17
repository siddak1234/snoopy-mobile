import { newIdempotencyKey } from '@/lib/platform/client';
import {
  PlatformError,
  PlatformNotConfiguredError,
  fallbackProblemTitle,
  publicProblem,
} from '@/lib/platform/problem';

/** The Edge's own constraint: 16-128 chars from this set, or a hard 400. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._~:-]{16,128}$/u;

describe('newIdempotencyKey', () => {
  it("satisfies the Edge's length and character constraint", () => {
    for (const prefix of ['run', 'subscribe', 'status', 'decision']) {
      expect(newIdempotencyKey(prefix)).toMatch(IDEMPOTENCY_KEY);
    }
  });

  it('never exceeds 128 characters, even for a long prefix', () => {
    const key = newIdempotencyKey('x'.repeat(200));
    expect(key).toHaveLength(128);
    expect(key).toMatch(IDEMPOTENCY_KEY);
  });

  it('is unique per attempt, because a retry is a new intent', () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => newIdempotencyKey('run')),
    );
    expect(keys.size).toBe(50);
  });
});

describe('publicProblem', () => {
  it('keeps only the three renderable members', () => {
    expect(
      publicProblem({
        title: 'Over the plan limit',
        code: 'FORBIDDEN',
        details: { reason: 'over_plan_limit' },
        instance: '/v1/workspaces/abc/subscriptions',
        traceId: 'server-only',
      }),
    ).toEqual({
      title: 'Over the plan limit',
      code: 'FORBIDDEN',
      details: { reason: 'over_plan_limit' },
    });
  });

  it('ignores non-object and malformed payloads', () => {
    expect(publicProblem(null)).toEqual({});
    expect(publicProblem('nope')).toEqual({});
    expect(publicProblem(['nope'])).toEqual({});
    expect(publicProblem({ title: 42, details: ['not-an-object'] })).toEqual({});
  });
});

describe('fallbackProblemTitle', () => {
  it('maps the statuses the Edge actually returns', () => {
    expect(fallbackProblemTitle(400)).toBe('The request could not be accepted.');
    expect(fallbackProblemTitle(401)).toBe('Sign in is required.');
    expect(fallbackProblemTitle(403)).toBe(
      'You are not allowed to complete this action.',
    );
    expect(fallbackProblemTitle(404)).toBe(
      'The requested resource is unavailable.',
    );
    expect(fallbackProblemTitle(409)).toBe(
      'This request conflicts with an earlier operation.',
    );
  });

  it('falls back to one generic sentence for anything else', () => {
    for (const status of [429, 500, 502, 503]) {
      expect(fallbackProblemTitle(status)).toBe(
        'The platform could not complete this request.',
      );
    }
  });
});

describe('platform errors', () => {
  it('carries the status, code and details a screen may render', () => {
    const error = new PlatformError('Denied', 403, 'FORBIDDEN', {
      requiredRole: 'admin',
    });
    expect(error.name).toBe('PlatformError');
    expect(error.status).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.details).toEqual({ requiredRole: 'admin' });
  });

  it('distinguishes an unconfigured client from a failed request', () => {
    // A broken platform must not render as an empty catalog, so these are
    // separate types rather than one error with a flag.
    expect(new PlatformNotConfiguredError()).toBeInstanceOf(Error);
    expect(new PlatformNotConfiguredError().name).toBe(
      'PlatformNotConfiguredError',
    );
  });
});
