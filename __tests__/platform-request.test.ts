import { platformJson } from '@/lib/platform/client';
import { PlatformError } from '@/lib/platform/problem';

/**
 * Request behaviour of the one network facade.
 *
 * These tests run in Node, whose globals are richer than a device's. Where that
 * difference could hide a total-failure bug, the device's runtime is simulated
 * rather than trusted — see the `AbortSignal.timeout` case.
 */

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { backendApiOrigin: 'https://api.example.test' } } },
}));

jest.mock('@/lib/platform/session-store', () => ({
  readAccessToken: jest.fn(),
}));

const { readAccessToken } = jest.requireMock('@/lib/platform/session-store');

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
  readAccessToken.mockReset();
  readAccessToken.mockResolvedValue(null);
});

describe('platformJson — request shape', () => {
  it('calls the Edge origin directly, with no /api/platform prefix', async () => {
    // That prefix is a Next.js rewrite the website needs to keep its cookie
    // same-origin. A native client has no rewrite to go through.
    fetchMock.mockResolvedValue(jsonResponse(200, { workspaces: [] }));
    await platformJson('/v1/workspaces');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/v1/workspaces');
  });

  it('sends no Authorization header when there is no session', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await platformJson('/v1/session');

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.authorization).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
    expect(headers['cache-control']).toBe('no-store');
  });

  it('sends the session as a Bearer credential when one exists', async () => {
    readAccessToken.mockResolvedValue('token-value');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await platformJson('/v1/session');

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer token-value');
  });

  it('sends an idempotency key only when the caller supplies one', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await platformJson('/v1/workspaces/w1/runs', {
      method: 'POST',
      body: { subscriptionId: 's1' },
      idempotencyKey: 'run-abc1234567890',
    });
    expect(fetchMock.mock.calls[0][1].headers['idempotency-key']).toBe('run-abc1234567890');
    expect(fetchMock.mock.calls[0][1].body).toBe('{"subscriptionId":"s1"}');

    await platformJson('/v1/workspaces/w1/runs');
    expect(fetchMock.mock.calls[1][1].headers['idempotency-key']).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
  });

  it('does not depend on AbortSignal.timeout, which devices do not have', async () => {
    // React Native polyfills AbortSignal from abort-controller@3, which defines
    // no statics. Node defines them, so trusting the test runtime here would
    // hide a bug that breaks every request on a real phone.
    const original = AbortSignal.timeout;
    // @ts-expect-error — simulating the device runtime.
    delete AbortSignal.timeout;
    try {
      fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
      await expect(platformJson('/v1/session')).resolves.toEqual({ ok: true });
      expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
    } finally {
      AbortSignal.timeout = original;
    }
  });
});

describe('platformJson — responses', () => {
  it('returns a parsed body on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { runs: [{ id: 'r1' }] }));
    await expect(platformJson('/v1/workspaces/w1/runs')).resolves.toEqual({
      runs: [{ id: 'r1' }],
    });
  });

  it('returns null for 204, without trying to parse a body', async () => {
    const noBody = {
      ok: true,
      status: 204,
      json: jest.fn(),
    } as unknown as Response;
    fetchMock.mockResolvedValue(noBody);

    await expect(platformJson('/v1/auth/logout', { method: 'POST' })).resolves.toBeNull();
    expect((noBody as unknown as { json: jest.Mock }).json).not.toHaveBeenCalled();
  });

  it('raises the problem title the backend sent', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, {
        title: 'Over the plan limit',
        code: 'FORBIDDEN',
        details: { reason: 'over_plan_limit' },
      }),
    );

    await expect(platformJson('/v1/workspaces/w1/subscriptions')).rejects.toMatchObject({
      name: 'PlatformError',
      message: 'Over the plan limit',
      status: 403,
      code: 'FORBIDDEN',
      details: { reason: 'over_plan_limit' },
    });
  });

  it('falls back to shared wording when the body is not a problem document', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, null));
    await expect(platformJson('/v1/workspaces/w1/runs/missing')).rejects.toThrow(
      'The requested resource is unavailable.',
    );
  });

  it('reports an unanswered request as 502 rather than leaking the transport error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(platformJson('/v1/session')).rejects.toMatchObject({
      status: 502,
      message: 'The platform is unreachable',
    });
  });
});

describe('platformJson — configuration', () => {
  it('refuses to guess an origin when none is configured', async () => {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: { backendApiOrigin: null } } },
    }));

    let unconfigured!: typeof platformJson;
    jest.isolateModules(() => {
      unconfigured = require('@/lib/platform/client').platformJson;
    });

    // An unconfigured client renders an honest "unavailable"; a broken platform
    // must never look like an empty catalog.
    //
    // Asserted by name, not by `instanceof`: the isolated module registry builds
    // its own copy of the class, so identity would compare across two registries.
    await expect(unconfigured('/v1/session')).rejects.toMatchObject({
      name: 'PlatformNotConfiguredError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PlatformError', () => {
  it('is the only error type a screen has to understand', () => {
    expect(new PlatformError('x', 500)).toBeInstanceOf(Error);
  });
});
