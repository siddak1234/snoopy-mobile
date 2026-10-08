import { FLOW_QUEUE_FULL, runRefusal } from '@/lib/content/refusals';
import { readCurrentSession } from '@/lib/platform/auth';
import { createRun } from '@/lib/platform/automations';
import {
  downloadSignedFile,
  platformOperation,
  putFileToSignedUrl,
  resetPlatformClientsForTests,
} from '@/lib/platform/client';
import { PlatformError, PlatformRateLimitedError } from '@/lib/platform/problem';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { backendApiOrigin: 'https://api.example.test' } } },
}));

jest.mock('@/lib/platform/session-store', () => ({
  readAccessToken: jest.fn(),
}));

// The native download, as expo-file-system's File: a destination names itself.
jest.mock('expo-file-system', () => ({
  File: Object.assign(
    jest.fn(function (this: { directory: unknown; name: string }, directory: unknown, name: string) {
      this.directory = directory;
      this.name = name;
    }),
    { downloadFileAsync: jest.fn() },
  ),
  Paths: { cache: { uri: 'file:///cache/' } },
}));
const { File: MockFile } = jest.requireMock('expo-file-system');

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

  it('reads a 429 as busy, with the wait it stated, and never renews the session', async () => {
    // BUILD-PLAN 24.3.3, backend §12.1 #114. The Edge sends `retry-after` in
    // whole seconds with `code: TOO_MANY_REQUESTS`.
    readAccessToken.mockResolvedValue('token-value');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 429, code: 'TOO_MANY_REQUESTS' }), {
        status: 429,
        headers: { 'content-type': 'application/problem+json', 'retry-after': '30' },
      }),
    );

    const error = await readCurrentSession().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlatformRateLimitedError);
    expect(error).toMatchObject({
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      retryAfterSeconds: 30,
      message: 'The platform is busy right now. Try again in 30 seconds.',
    });
    // One request: a 429 says nothing about the credential, so nothing renews it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says a 429 without a time when the platform stated none it can read', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, { status: 429, headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' } }),
    );

    await expect(readCurrentSession()).rejects.toMatchObject({
      status: 429,
      message: 'The platform is busy right now. Try again in a moment.',
    });
  });

  it("keeps a 429's public details, so a run refused at a flow whose queue is full is said in the flow's words (backend 25.2.10)", async () => {
    // The contract's 429 on createRun: `details.reason` max_concurrent_runs, the limit as a string, no retry-after.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 429,
          code: 'TOO_MANY_REQUESTS',
          title: 'The automation is at capacity',
          details: { reason: 'max_concurrent_runs', limit: '2' },
        }),
        { status: 429, headers: { 'content-type': 'application/problem+json' } },
      ),
    );

    const error = await createRun('ws-1', 'sub-1', 'run-0123456789abcdef', { note: 'x' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlatformRateLimitedError);
    expect(error).toMatchObject({
      status: 429,
      details: { reason: 'max_concurrent_runs', limit: '2' },
      // Every other screen still says the platform's busy words.
      message: 'The platform is busy right now. Try again in a moment.',
    });
    expect(runRefusal(error)).toEqual({ message: FLOW_QUEUE_FULL, fileGone: false });
    expect(FLOW_QUEUE_FULL).toBe(
      'This flow is busy and its queue is full, so the run was not started. Try again once one of its runs has ended.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('PUTs a file to its signed URL with no credential, even when signed in (24.3.4)', async () => {
    readAccessToken.mockResolvedValue('token-value');
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const bytes = new Uint8Array([1, 2, 3]);

    await putFileToSignedUrl('https://store.example.test/bucket/key?signature=abc', bytes, 'application/pdf');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://store.example.test/bucket/key?signature=abc');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(bytes);
    expect(init.credentials).toBe('omit');
    // The type it was opened for: Android refuses a body sent with none.
    expect(init.headers).toEqual({ 'Content-Type': 'application/pdf' });
    // The URL is the capability. A bearer here would hand the session to the store.
    expect(JSON.stringify(init.headers ?? {})).not.toContain('token-value');
    expect(readAccessToken).not.toHaveBeenCalled();
  });

  it('saves a signed file with no credential, under its own name, for the share sheet (24.12)', async () => {
    readAccessToken.mockResolvedValue('token-value');
    const saved = { uri: 'file:///cache/acme-export.json', exists: true, delete: jest.fn() };
    MockFile.downloadFileAsync.mockReset().mockResolvedValue(saved);

    await expect(
      downloadSignedFile('https://store.example.test/export?signature=abc', 'exports/acme-export.json'),
    ).resolves.toBe(saved);

    const [url, destination, options] = MockFile.downloadFileAsync.mock.calls[0];
    expect(url).toBe('https://store.example.test/export?signature=abc');
    expect(destination.directory).toEqual({ uri: 'file:///cache/' });
    expect(destination.name).toBe('acme-export.json');
    // No headers at all: the URL is the capability, and a bearer here would hand the session to the store.
    expect(options).toEqual({ idempotent: true });
    expect(readAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps only the last step of the name the platform gave, never a way out of the cache', async () => {
    MockFile.downloadFileAsync.mockReset().mockResolvedValue({ uri: 'file:///cache/x', exists: true, delete: jest.fn() });
    for (const [given, kept] of [
      ['../../secrets.json', 'secrets.json'],
      ['a\\b\\c.json', 'c.json'],
      ['..', 'workspace-export'],
      ['exports/', 'workspace-export'],
    ]) {
      await downloadSignedFile('https://store.example.test/x', given!);
      expect(MockFile.downloadFileAsync.mock.calls.at(-1)[1].name).toBe(kept);
    }
  });

  it('says a refused or lost download in words, never the store\'s own', async () => {
    MockFile.downloadFileAsync.mockReset().mockRejectedValue(new Error('UnableToDownload: status 403'));
    await expect(downloadSignedFile('https://store.example.test/x', 'x.json')).rejects.toThrow(
      'The file could not be saved.',
    );
  });

  it('says a refused or lost upload in words, never as a session failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(putFileToSignedUrl('https://store.example.test/k', new Uint8Array([1]), 'text/plain')).rejects.toMatchObject({
      status: 403,
      message: 'The file was not accepted. Choose it again.',
    });

    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    await expect(putFileToSignedUrl('https://store.example.test/k', new Uint8Array([1]), 'text/plain')).rejects.toMatchObject({
      status: 502,
      message: 'The file could not be sent. Try again.',
    });
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
