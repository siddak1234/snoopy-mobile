import { readCurrentSession } from '@/lib/platform/auth';
import { platformOperation, resetPlatformClientsForTests } from '@/lib/platform/client';
import { PlatformError, PlatformRateLimitedError, PlatformUnreachableError } from '@/lib/platform/problem';
import {
  notifySessionEnded,
  onSessionEnded,
  recoverSession,
  resetSessionRecoveryForTests,
  setSessionRecovery,
  type RecoveryOutcome,
} from '@/lib/platform/session-recovery';

/**
 * The 401 that nothing used to handle.
 *
 * `hooks/use-resource.tsx` turns a `PlatformError` into an error state and
 * declines 401 by name; `hooks/use-session.tsx` refreshed only at mount. So an
 * access token that expired while the app was open left every screen reading
 * "Sign in is required" with no path back — a state a person could only escape
 * by killing the app. These tests pin the renewal that closes that hole, and
 * each one FAILS against the previous transport.
 *
 * They exercise the real `platformOperation` against a stubbed `fetch`, so the
 * generated request, the bearer middleware and the retry all run for real.
 */

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { backendApiOrigin: 'https://api.example.test' } } },
}));

jest.mock('@/lib/platform/session-store', () => ({
  readAccessToken: jest.fn(),
}));

const { readAccessToken } = jest.requireMock('@/lib/platform/session-store');
const fetchMock = jest.fn();

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const SESSION_BODY = {
  authenticated: true,
  user: { userId: 'u1', email: 'person@example.test' },
  workspaces: [],
};

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
  readAccessToken.mockReset();
  readAccessToken.mockResolvedValue('expired-token');
  resetPlatformClientsForTests();
  resetSessionRecoveryForTests();
});

describe('401 renewal in the transport', () => {
  it('renews once and retries once, so an expired token is not a dead end', async () => {
    const renew = jest.fn(async () => {
      readAccessToken.mockResolvedValue('fresh-token');
      return { status: 'renewed' as const };
    });
    setSessionRecovery(renew);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { title: 'Authentication Required' }))
      .mockResolvedValueOnce(jsonResponse(200, SESSION_BODY));

    await expect(readCurrentSession()).resolves.toMatchObject({ authenticated: true });

    expect(renew).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry carries the renewed credential, not the one that just 401'd.
    const retried = fetchMock.mock.calls[1][0] as Request;
    expect(retried.headers.get('authorization')).toBe('Bearer fresh-token');
  });

  it('gives up after one retry rather than looping on a token the Edge keeps refusing', async () => {
    setSessionRecovery(async () => ({ status: 'renewed' }));
    // A new Response per call: a body can only be read once, and reusing one
    // would surface as a transport failure rather than the second 401.
    fetchMock.mockImplementation(async () =>
      jsonResponse(401, { title: 'Authentication Required' }),
    );

    await expect(readCurrentSession()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the renewal is refused, and surfaces the original 401', async () => {
    const renew = jest.fn(async () => ({ status: 'refused' as const }));
    setSessionRecovery(renew);
    fetchMock.mockResolvedValue(jsonResponse(401, { title: 'Authentication Required' }));

    await expect(readCurrentSession()).rejects.toBeInstanceOf(PlatformError);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hands the caller a renewal the platform could not make — a 429 with its wait — never the 401 it stood in for (24.3.3; Gate 24's security review)", async () => {
    const busy = new PlatformRateLimitedError('The platform is busy right now. Try again in 30 seconds.', 30);
    const renew = jest.fn(async () => ({ status: 'unavailable' as const, cause: busy }));
    setSessionRecovery(renew);
    fetchMock.mockResolvedValue(jsonResponse(401, { title: 'Authentication Required' }));

    const error = await readCurrentSession().catch((caught: unknown) => caught);

    // The 429 itself, with its wait: a screen reads it as busy. Handed the 401
    // instead, `reload` took it as the credential's final answer and cleared
    // the keychain while the refresh token was good.
    expect(error).toBe(busy);
    expect(renew).toHaveBeenCalledTimes(1);
    // One request: no retry with the expired token.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the same for an outage on the refresh route: unreachable, never signed out', async () => {
    const down = new PlatformUnreachableError();
    setSessionRecovery(async () => ({ status: 'unavailable', cause: down }));
    fetchMock.mockResolvedValue(jsonResponse(401, { title: 'Authentication Required' }));

    await expect(readCurrentSession()).rejects.toBe(down);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never renews on the credential routes, or a dead refresh token would renew itself forever', async () => {
    const renew = jest.fn(async () => ({ status: 'renewed' as const }));
    setSessionRecovery(renew);
    fetchMock.mockResolvedValue(jsonResponse(401, { title: 'Authentication Required' }));

    await expect(
      platformOperation('/v1/auth/native/refresh', ({ platform }, signal) =>
        platform.POST('/v1/auth/native/refresh', { body: { refreshToken: 'dead' }, signal }),
      ),
    ).rejects.toMatchObject({ status: 401 });

    expect(renew).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves an outage alone: only 401 renews, so 502 and 503 never spend a refresh', async () => {
    const renew = jest.fn(async () => ({ status: 'renewed' as const }));
    setSessionRecovery(renew);
    for (const status of [500, 502, 503]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(jsonResponse(status, { title: 'Upstream' }));
      await expect(readCurrentSession()).rejects.toMatchObject({ status });
    }
    expect(renew).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing has registered, so the 401 passes through unchanged', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { title: 'Authentication Required' }));

    await expect(readCurrentSession()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('recoverSession is single-flight', () => {
  it('collapses a burst of concurrent 401s into one renewal', async () => {
    let resolveRenew: (value: RecoveryOutcome) => void = () => {};
    const renew = jest.fn(
      () =>
        new Promise<RecoveryOutcome>((resolve) => {
          resolveRenew = resolve;
        }),
    );
    setSessionRecovery(renew);

    const all = Promise.all([recoverSession(), recoverSession(), recoverSession()]);
    resolveRenew({ status: 'renewed' });

    expect(await all).toEqual([{ status: 'renewed' }, { status: 'renewed' }, { status: 'renewed' }]);
    // Three screens mounting three parallel reads must not race three refreshes
    // against a provider that invalidates each previous refresh token.
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh attempt once the previous one has settled', async () => {
    const renew = jest.fn(async () => ({ status: 'renewed' as const }));
    setSessionRecovery(renew);

    await recoverSession();
    await recoverSession();

    expect(renew).toHaveBeenCalledTimes(2);
  });
});

describe('session-ended notification', () => {
  it('reaches every listener and stops after unsubscribe', () => {
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribe = onSessionEnded(first);
    onSessionEnded(second);

    notifySessionEnded();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribe();
    notifySessionEnded();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
