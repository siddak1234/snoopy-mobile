import { FLOW_QUEUE_FULL, runRefusal, uploadRefusalMessage } from '@/lib/content/refusals';
import { readCurrentSession } from '@/lib/platform/auth';
import { completeUpload, createRun } from '@/lib/platform/automations';
import {
  downloadSignedFile,
  platformOperation,
  putFileToSignedUrl,
  resetPlatformClientsForTests,
} from '@/lib/platform/client';
import { PlatformBusyError, PlatformError, PlatformRateLimitedError } from '@/lib/platform/problem';
import {
  RUN_PACKAGE_MAXIMUM_BYTES,
  RunPackageFileRefusedError,
  createRunPackageFile,
  packageRetryWaitMs,
  requestRunPackageFile,
} from '@/lib/platform/runs';
import { sendRunFile } from '@/lib/platform/run-file';

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
  // A folder made for one view (build 28's review, finding 5): made, then removed with what it holds.
  Directory: jest.fn(function (this: { parent: unknown; name: string; exists: boolean; create: jest.Mock; delete: jest.Mock }, parent: unknown, name: string) {
    this.parent = parent;
    this.name = name;
    this.exists = false;
    this.create = jest.fn(() => (this.exists = true));
    this.delete = jest.fn(() => (this.exists = false));
  }),
  Paths: { cache: { uri: 'file:///cache/' } },
}));
const { File: MockFile, Directory: MockDirectory } = jest.requireMock('expo-file-system');

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

  it("keeps an upload completion's 429 details, so a file with no place yet to be measured is said in the website's words (backend 25.2.39)", async () => {
    // The contract's 429 on completeUpload: `details.reason` measurement_busy, no retry-after.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 429,
          code: 'TOO_MANY_REQUESTS',
          title: 'The file is waiting to be measured',
          details: { reason: 'measurement_busy' },
        }),
        { status: 429, headers: { 'content-type': 'application/problem+json' } },
      ),
    );

    const error = await completeUpload('ws-1', '0b7c5f0e-6a1d-4c39-9d0e-3f5a2b1c4d6e').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlatformRateLimitedError);
    expect(error).toMatchObject({
      status: 429,
      details: { reason: 'measurement_busy' },
      message: 'The platform is busy right now. Try again in a moment.',
    });
    expect(uploadRefusalMessage(error, 'The file could not be sent.')).toBe(
      'Files are checked one at a time. Nothing was lost. Choose the file again in a moment.',
    );
    // The transport asks once. Completing the same upload again is the upload's own
    // (`sendRunFile`, below), and these words are said only when that has not measured it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('completes the same upload again after the wait its 429 states — the transport reads the wait, the upload keeps it (backend 25.2.39)', async () => {
    const ticket = {
      uploadSessionId: '0b7c5f0e-6a1d-4c39-9d0e-3f5a2b1c4d6e',
      uploadUrl: 'https://store.example.test/put?signature=abc',
      expiresAt: '2026-10-13T12:15:00Z',
      maximumSizeBytes: 1_000_000,
    };
    const artifact = { artifactId: 'artifact-1', filename: 'invoice.pdf', contentType: 'application/pdf', sizeBytes: 3 };
    // The contract's 429 on completeUpload, stating a wait of 3 s; then the file, measured.
    const completions = [
      () =>
        new Response(
          JSON.stringify({
            status: 429,
            code: 'TOO_MANY_REQUESTS',
            title: 'The file is waiting to be measured',
            details: { reason: 'measurement_busy' },
          }),
          { status: 429, headers: { 'content-type': 'application/problem+json', 'retry-after': '3' } },
        ),
      () => jsonResponse(200, { artifact }),
    ];
    const asked: string[] = [];
    fetchMock.mockImplementation(async (input: Request | string, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      asked.push(`${typeof input === 'string' ? init?.method : input.method} ${url}`);
      if (url.endsWith('/complete')) return completions.shift()!();
      if (url === ticket.uploadUrl) return new Response(null, { status: 200 });
      return jsonResponse(201, ticket);
    });
    const completed = () => asked.filter((request) => request.endsWith('/complete')).length;

    jest.useFakeTimers();
    try {
      const sent = sendRunFile('ws-1', 'sub-1', {
        name: 'invoice.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 3,
        read: async () => new Uint8Array([1, 2, 3]),
      });
      await jest.advanceTimersByTimeAsync(0);
      expect(completed()).toBe(1);
      await jest.advanceTimersByTimeAsync(2_999);
      expect(completed()).toBe(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(sent).resolves.toEqual(artifact);
      expect(asked).toEqual([
        'POST https://api.example.test/v1/workspaces/ws-1/uploads',
        'PUT https://store.example.test/put?signature=abc',
        'POST https://api.example.test/v1/workspaces/ws-1/uploads/0b7c5f0e-6a1d-4c39-9d0e-3f5a2b1c4d6e/complete',
        'POST https://api.example.test/v1/workspaces/ws-1/uploads/0b7c5f0e-6a1d-4c39-9d0e-3f5a2b1c4d6e/complete',
      ]);
    } finally {
      jest.useRealTimers();
    }
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

  it('a file to be drawn goes into a folder made for that one view, a new one each time; removed, the folder goes; a failed download leaves none', async () => {
    MockFile.downloadFileAsync.mockReset().mockImplementation(async (_url: string, destination: { name: string }) => ({
      uri: `file:///cache/folder/${destination.name}`,
      exists: true,
      delete: jest.fn(),
    }));
    MockDirectory.mockClear();
    const first = await downloadSignedFile('https://store.example.test/x', 'view.pdf', { freshFolder: true });
    const second = await downloadSignedFile('https://store.example.test/x', 'view.pdf', { freshFolder: true });
    const [made, again] = MockDirectory.mock.instances as { parent: unknown; name: string; exists: boolean; create: jest.Mock; delete: jest.Mock }[];
    expect(made!.parent).toEqual({ uri: 'file:///cache/' });
    expect(made!.name).toMatch(/^view-[0-9a-f-]{36}$/u);
    expect(again!.name).toMatch(/^view-[0-9a-f-]{36}$/u);
    expect(again!.name).not.toBe(made!.name);
    expect(made!.create).toHaveBeenCalledTimes(1);
    // The file is made inside the folder, under the name it was given.
    const destination = MockFile.downloadFileAsync.mock.calls[0][1];
    expect(destination.directory).toBe(made);
    expect(destination.name).toBe('view.pdf');
    expect(first.uri).toBe('file:///cache/folder/view.pdf');
    expect(first.exists).toBe(true);
    first.delete();
    expect(made!.delete).toHaveBeenCalledTimes(1);
    expect(first.exists).toBe(false);
    expect(second.exists).toBe(true);

    MockFile.downloadFileAsync.mockReset().mockRejectedValue(new Error('UnableToDownload: status 403'));
    await expect(downloadSignedFile('https://store.example.test/x', 'view.pdf', { freshFolder: true })).rejects.toThrow(
      'The file could not be saved.',
    );
    const failed = MockDirectory.mock.instances.at(-1) as { exists: boolean; delete: jest.Mock };
    expect(failed.delete).toHaveBeenCalledTimes(1);
    expect(failed.exists).toBe(false);
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

/**
 * The run package's file (round 24 P12; backend ADR-0045): a POST with a key,
 * answered as a signed link; a busy 503 carries its wait, and is asked once
 * more after it.
 */
describe('the run package file', () => {
  const WS = '00000000-0000-4000-8000-000000000001';
  const RUN = '793eef82-102d-81be-a2d3-9e8d4e2b2c36';
  const FILE = {
    format: 'pdf',
    filename: `run-${RUN}.pdf`,
    contentType: 'application/pdf',
    sizeBytes: 52_000,
    downloadUrl: 'https://files.example.test/signed/run.pdf?sig=1',
    expiresAt: '2026-10-20T12:00:00Z',
  };
  const busy = () =>
    new Response(JSON.stringify({ status: 503, code: 'package_busy', title: 'Busy' }), {
      status: 503,
      headers: { 'content-type': 'application/problem+json', 'retry-after': '5' },
    });

  it('POSTs the format and zone to the job\'s package with the key, and answers the signed link', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, FILE));
    await expect(createRunPackageFile(WS, RUN, 'pdf', 'run-package-pdf-1', 'America/Chicago')).resolves.toEqual(FILE);
    const request = fetchMock.mock.calls[0]![0] as Request;
    expect(request.method).toBe('POST');
    expect(request.url).toBe(`https://api.example.test/v1/workspaces/${WS}/runs/${RUN}/package`);
    expect(request.headers.get('idempotency-key')).toBe('run-package-pdf-1');
    expect(await request.json()).toEqual({ format: 'pdf', timeZone: 'America/Chicago' });
  });

  it('a 503 that states its wait is busy (PlatformBusyError, still 503); one that states none is a plain refusal', async () => {
    fetchMock.mockResolvedValueOnce(busy());
    const error = await createRunPackageFile(WS, RUN, 'xlsx', 'k-1').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlatformBusyError);
    expect(error).toMatchObject({ status: 503, code: 'package_busy', retryAfterSeconds: 5 });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 503, title: 'Unavailable' }), { status: 503, headers: { 'content-type': 'application/problem+json' } }));
    const plain = await createRunPackageFile(WS, RUN, 'xlsx', 'k-2').catch((caught: unknown) => caught);
    expect(plain).toBeInstanceOf(PlatformError);
    expect(plain).not.toBeInstanceOf(PlatformBusyError);
  });

  it('busy once: waits the stated seconds, asks again with the same key, and answers; busy twice: says so', async () => {
    const sleep = jest.fn(async () => undefined);
    fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(jsonResponse(200, FILE));
    await expect(requestRunPackageFile(WS, RUN, 'pdf', 'k-same', undefined, sleep)).resolves.toEqual(FILE);
    expect(sleep).toHaveBeenCalledWith(5000);
    const keys = fetchMock.mock.calls.map((call) => (call[0] as Request).headers.get('idempotency-key'));
    expect(keys).toEqual(['k-same', 'k-same']);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy());
    await expect(requestRunPackageFile(WS, RUN, 'pdf', 'k-2', undefined, sleep)).rejects.toBeInstanceOf(PlatformBusyError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /** A 503 as the platform says it: with `retry-after` when given, or with none. */
  const unavailable = (retryAfter?: string) =>
    new Response(JSON.stringify({ status: 503, code: 'package_busy', title: 'Busy' }), {
      status: 503,
      headers: { 'content-type': 'application/problem+json', ...(retryAfter === undefined ? {} : { 'retry-after': retryAfter }) },
    });

  it("waits as the website's packageRetryWaitMs does: 2 s when no wait is named, the named wait up to 10 s, else none", () => {
    expect(packageRetryWaitMs(undefined)).toBe(2_000);
    expect(packageRetryWaitMs(0)).toBe(0);
    expect(packageRetryWaitMs(10)).toBe(10_000);
    expect(packageRetryWaitMs(11)).toBeNull();
  });

  it('a 503 naming no wait is asked again after 2 s, with the same key', async () => {
    const sleep = jest.fn(async () => undefined);
    fetchMock.mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(jsonResponse(200, FILE));
    await expect(requestRunPackageFile(WS, RUN, 'pdf', 'k-none', undefined, sleep)).resolves.toEqual(FILE);
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(fetchMock.mock.calls.map((call) => (call[0] as Request).headers.get('idempotency-key'))).toEqual(['k-none', 'k-none']);
  });

  it('a named wait of 10 s is waited out; one of 11 s is not — said at once, after one request', async () => {
    const sleep = jest.fn(async () => undefined);
    fetchMock.mockResolvedValueOnce(unavailable('10')).mockResolvedValueOnce(jsonResponse(200, FILE));
    await expect(requestRunPackageFile(WS, RUN, 'pdf', 'k-10', undefined, sleep)).resolves.toEqual(FILE);
    expect(sleep).toHaveBeenCalledWith(10_000);

    fetchMock.mockReset();
    sleep.mockClear();
    fetchMock.mockResolvedValueOnce(unavailable('11'));
    await expect(requestRunPackageFile(WS, RUN, 'pdf', 'k-11', undefined, sleep)).rejects.toMatchObject({ status: 503 });
    expect(sleep).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a file over 25 MiB or in another format than asked; 26,214,400 bytes is taken', async () => {
    expect(RUN_PACKAGE_MAXIMUM_BYTES).toBe(26_214_400);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...FILE, sizeBytes: 26_214_400 }));
    await expect(requestRunPackageFile(WS, RUN, 'pdf', 'k-a', undefined)).resolves.toMatchObject({ sizeBytes: 26_214_400 });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...FILE, sizeBytes: 26_214_401 }));
    await expect(requestRunPackageFile(WS, RUN, 'pdf', 'k-b', undefined)).rejects.toBeInstanceOf(RunPackageFileRefusedError);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, FILE));
    await expect(requestRunPackageFile(WS, RUN, 'xlsx', 'k-c', undefined)).rejects.toBeInstanceOf(RunPackageFileRefusedError);
  });
});
