/**
 * Linking another sign-in account from the app (ADR-0017 §6, backend 24.2.1,
 * BUILD-PLAN 24.6.2): the sealed ticket asked for with the bearer and the
 * refresh token, opened once in the system browser, then login's native code
 * exchange. What is pinned: the refresh token travels in a body — never a URL —
 * and is the one stored at the moment of the request; the ticket is the only
 * thing in the start URL; the callback is checked before its code is used.
 */

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        backendApiOrigin: 'https://api.example.test',
        nativeRedirectUri: 'https://app.example.test/auth/native/callback',
        nativeAuthBaseUrl: 'https://www.example.test/api/platform',
      },
    },
  },
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('@/lib/platform/client', () => ({ platformOperation: jest.fn(), newIdempotencyKey: jest.fn(() => 'k') }));
jest.mock('@/lib/platform/session-store', () => ({
  readSession: jest.fn(),
  writeSession: jest.fn(),
  clearSession: jest.fn(),
}));

const { openAuthSessionAsync } = jest.requireMock('expo-web-browser');
const { platformOperation } = jest.requireMock('@/lib/platform/client');
const { readSession, writeSession } = jest.requireMock('@/lib/platform/session-store');
const { linkIdentity } = require('@/lib/platform/identity-link');
const { websiteOrigin } = require('@/lib/platform/native-auth');

type Call = { path: string; body?: Record<string, unknown>; values?: Record<string, string> };
let calls: Call[];

beforeEach(() => {
  [openAuthSessionAsync, platformOperation, readSession, writeSession].forEach((m) => m.mockReset());
  calls = [];
  // The stored token changes between the first read and the retry, as a renewal would.
  readSession.mockResolvedValueOnce({ accessToken: 'a1', refreshToken: 'refresh-1', expiresAt: 0 });
  readSession.mockResolvedValue({ accessToken: 'a2', refreshToken: 'refresh-2', expiresAt: 0 });
  platformOperation.mockImplementation(async (_key: string, execute: Function) => {
    const post = async (path: string, init: { body?: Record<string, unknown>; params?: { path?: Record<string, string> } }) => {
      calls.push({ path, ...(init.body ? { body: init.body } : {}), ...(init.params?.path ? { values: init.params.path } : {}) });
      if (path.endsWith('/ticket')) return { data: { ticket: 'sealed ticket/+=', expiresIn: 120 } };
      return { data: { accessToken: 'a3', refreshToken: 'refresh-3', expiresIn: 3600, tokenType: 'Bearer' } };
    };
    return (await execute({ platform: { POST: post } })).data;
  });
});

it('asks for a ticket with the refresh token in the body, opens only the ticket in the browser, and keeps the new session', async () => {
  openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'https://app.example.test/auth/native/callback?code=one-time' });
  await expect(linkIdentity('microsoft')).resolves.toEqual({ status: 'linked' });

  const [ticket, token] = calls;
  expect(ticket!.path).toBe('/v1/auth/native/identities/{provider}/ticket');
  expect(ticket!.values).toEqual({ provider: 'microsoft' });
  expect(ticket!.body).toEqual(
    expect.objectContaining({ refreshToken: 'refresh-1', redirectUri: 'https://app.example.test/auth/native/callback' }),
  );
  const [startUrl] = openAuthSessionAsync.mock.calls[0];
  expect(startUrl).toBe(
    'https://www.example.test/api/platform/v1/auth/native/identities/microsoft/start?ticket=sealed%20ticket%2F%2B%3D',
  );
  expect(startUrl).not.toContain('refresh');
  expect(token!.path).toBe('/v1/auth/native/token');
  expect(token!.body).toEqual(expect.objectContaining({ code: 'one-time' }));
  expect(writeSession).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'refresh-3' }));
});

it('reads the refresh token inside the request, so a retry after renewal sends the renewed one', async () => {
  // The transport re-runs the request callback on its one retry.
  platformOperation.mockImplementationOnce(async (_key: string, execute: Function) => {
    const post = async (path: string, init: { body?: Record<string, unknown> }) => {
      calls.push({ path, body: init.body });
      return { data: { ticket: 't', expiresIn: 120 } };
    };
    await execute({ platform: { POST: post } });
    return (await execute({ platform: { POST: post } })).data;
  });
  openAuthSessionAsync.mockResolvedValue({ type: 'cancelled' });
  await linkIdentity('google');
  expect(calls.map((call) => call.body?.refreshToken)).toEqual(['refresh-1', 'refresh-2']);
});

it('uses no code that came back to another address', async () => {
  openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'https://evil.example.test/auth/native/callback?code=stolen' });
  await expect(linkIdentity('apple')).resolves.toEqual({
    status: 'failed',
    message: 'Linking returned to an unexpected address.',
  });
  expect(calls.some((call) => call.path === '/v1/auth/native/token')).toBe(false);
  expect(writeSession).not.toHaveBeenCalled();
});

it('says a declined link in words, and keeps nothing', async () => {
  openAuthSessionAsync.mockResolvedValue({
    type: 'success',
    url: 'https://app.example.test/auth/native/callback?status=error&reason=access_denied',
  });
  await expect(linkIdentity('google')).resolves.toEqual({ status: 'failed', message: 'Sign-in was declined.' });
  expect(writeSession).not.toHaveBeenCalled();
});

it('names the website by the origin the browser leg shares, https only', () => {
  expect(websiteOrigin()).toBe('https://www.example.test');
});

it("says in a sentence when the platform's manual-linking switch is off, never the problem's title (backend §12.1 #200)", async () => {
  const { PlatformError } = require('@/lib/platform/problem');
  platformOperation.mockImplementation(async () => {
    throw new PlatformError('Not Configured', 503, 'NOT_CONFIGURED', { component: 'identity.manual_linking' });
  });
  await expect(linkIdentity('microsoft')).resolves.toEqual({
    status: 'failed',
    message: "Account linking isn't enabled on this platform yet.",
  });
  platformOperation.mockImplementation(async () => {
    throw new PlatformError('Dependency Failure', 502, 'DEPENDENCY_FAILURE');
  });
  await expect(linkIdentity('microsoft')).resolves.toEqual({
    status: 'failed',
    message: "The sign-in provider couldn't be reached. Try again in a moment.",
  });
  expect(openAuthSessionAsync).not.toHaveBeenCalled();
});
