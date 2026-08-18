import { readCurrentSession } from '@/lib/platform/auth';
import { platformOperation, resetPlatformClientsForTests } from '@/lib/platform/client';
import { PlatformError } from '@/lib/platform/problem';

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

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
  readAccessToken.mockReset();
  readAccessToken.mockResolvedValue(null);
  resetPlatformClientsForTests();
});

describe('generated platform transport', () => {
  it('calls the Edge directly and sends no bearer when signed out', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        authenticated: true,
        user: { userId: 'u1', email: 'person@example.test' },
        workspaces: [],
      }),
    );

    await readCurrentSession();

    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.url).toBe('https://api.example.test/v1/session');
    expect(request.method).toBe('GET');
    expect(request.headers.get('authorization')).toBeNull();
    expect(request.headers.get('cache-control')).toBe('no-store');
  });

  it('adds the SecureStore token as a bearer credential', async () => {
    readAccessToken.mockResolvedValue('token-value');
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        authenticated: true,
        user: { userId: 'u1', email: 'person@example.test' },
        workspaces: [],
      }),
    );

    await readCurrentSession();

    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get('authorization')).toBe('Bearer token-value');
  });

  it('serializes generated path, body and idempotency header parameters', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { run: { id: 'r1' } }));

    await platformOperation('/v1/workspaces/w1/runs', ({ automations }, signal) =>
      automations.POST('/v1/workspaces/{workspaceId}/runs', {
        params: {
          path: { workspaceId: 'w1' },
          header: { 'Idempotency-Key': 'run-abc1234567890' },
        },
        body: { subscriptionId: '00000000-0000-4000-8000-000000000002' },
        signal,
      }),
    );

    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.url).toBe('https://api.example.test/v1/workspaces/w1/runs');
    expect(request.method).toBe('POST');
    expect(request.headers.get('idempotency-key')).toBe('run-abc1234567890');
    expect(await request.json()).toEqual({
      subscriptionId: '00000000-0000-4000-8000-000000000002',
    });
  });

  it('does not depend on AbortSignal.timeout, which devices do not provide', async () => {
    const original = AbortSignal.timeout;
    // @ts-expect-error Simulate React Native's abort-controller polyfill.
    delete AbortSignal.timeout;
    try {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          authenticated: true,
          user: { userId: 'u1', email: 'person@example.test' },
          workspaces: [],
        }),
      );
      await expect(readCurrentSession()).resolves.toMatchObject({ authenticated: true });
      expect((fetchMock.mock.calls[0][0] as Request).signal).toBeDefined();
    } finally {
      AbortSignal.timeout = original;
    }
  });

  it('returns null for a successful operation with no body', async () => {
    await expect(
      platformOperation('/v1/auth/logout', async () => ({
        response: new Response(null, { status: 204 }),
      })),
    ).resolves.toBeNull();
  });

  it('projects public problems and suppresses raw transport errors', async () => {
    await expect(
      platformOperation('/forbidden', async () => ({
        response: jsonResponse(403, {}),
        error: {
          title: 'Over the plan limit',
          code: 'FORBIDDEN',
          details: { reason: 'over_plan_limit' },
        },
      })),
    ).rejects.toMatchObject({
      name: 'PlatformError',
      message: 'Over the plan limit',
      status: 403,
      code: 'FORBIDDEN',
      details: { reason: 'over_plan_limit' },
    });

    await expect(
      platformOperation('/unreachable', async () => {
        throw new TypeError('private transport detail');
      }),
    ).rejects.toMatchObject({ status: 502, message: 'The platform is unreachable' });
  });
});

describe('platform configuration', () => {
  it('refuses to guess an origin when none is configured', async () => {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: { backendApiOrigin: null } } },
    }));

    let operation!: typeof platformOperation;
    jest.isolateModules(() => {
      operation = require('@/lib/platform/client').platformOperation;
    });

    await expect(operation('/v1/session', jest.fn())).rejects.toMatchObject({
      name: 'PlatformNotConfiguredError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PlatformError', () => {
  it('remains the single server-refusal type screens understand', () => {
    expect(new PlatformError('x', 500)).toBeInstanceOf(Error);
  });
});
