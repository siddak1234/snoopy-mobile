import { base64UrlFromBase64, base64UrlFromBytes, createPkcePair } from '@/lib/platform/pkce';
import { PlatformError } from '@/lib/platform/problem';

/**
 * Native login (ADR-0017).
 *
 * The assertions that matter most are the refusals: which failures discard a
 * session and which keep it. The contract is explicit that a client treating an
 * outage as a dead credential "signs out every user who happened to open the app
 * during it", so that split is pinned here rather than left to review.
 */

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        backendApiOrigin: 'https://api.example.test',
        nativeRedirectUri: 'https://app.example.test/auth/native/callback',
      },
    },
  },
}));

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
jest.mock('@/lib/platform/session-store', () => ({
  readSession: jest.fn(),
  writeSession: jest.fn(),
  clearSession: jest.fn(),
}));

const { openAuthSessionAsync } = jest.requireMock('expo-web-browser');
const { platformOperation } = jest.requireMock('@/lib/platform/client');
const { readSession, writeSession, clearSession } = jest.requireMock(
  '@/lib/platform/session-store',
);

// Imported after the mocks so the module under test binds to them.
const {
  matchesNativeCallback,
  refreshSession,
  signInWithProvider,
  signOut,
} = require('@/lib/platform/native-auth');

const LIVE_SESSION = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() + 3_600_000,
};

beforeEach(() => {
  [openAuthSessionAsync, platformOperation, readSession, writeSession, clearSession].forEach((m) =>
    m.mockReset(),
  );
});

describe('PKCE', () => {
  it('mints a 43-character challenge, which is the length the Edge requires', async () => {
    const { codeVerifier, codeChallenge } = await createPkcePair();
    expect(codeChallenge).toHaveLength(43);
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier.length).toBeLessThanOrEqual(128);
  });

  it('uses only URL-safe characters, so nothing needs escaping in a query', async () => {
    const { codeVerifier, codeChallenge } = await createPkcePair();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('does not repeat a verifier', async () => {
    const pairs = await Promise.all([createPkcePair(), createPkcePair(), createPkcePair()]);
    expect(new Set(pairs.map((p) => p.codeVerifier)).size).toBe(3);
  });

  it('encodes bytes without padding', () => {
    expect(base64UrlFromBytes(new Uint8Array([0, 0, 0]))).toBe('AAAA');
    expect(base64UrlFromBytes(new Uint8Array(32))).toHaveLength(43);
    expect(base64UrlFromBase64('a+b/c==')).toBe('a-b_c');
  });
});

describe('signInWithProvider', () => {
  it('accepts only the configured HTTPS origin and path before reading a code', () => {
    const configured = 'https://app.example.test/auth/native/callback';
    expect(
      matchesNativeCallback(new URL(`${configured}?code=sealed`), configured),
    ).toBe(true);
    expect(
      matchesNativeCallback(
        new URL('https://other.example.test/auth/native/callback?code=sealed'),
        configured,
      ),
    ).toBe(false);
    expect(
      matchesNativeCallback(
        new URL('https://app.example.test/auth/native/other?code=sealed'),
        configured,
      ),
    ).toBe(false);
    expect(
      matchesNativeCallback(new URL(`${configured}#code=sealed`), configured),
    ).toBe(false);
  });

  it('refuses rather than falling back to a custom scheme when unconfigured', async () => {
    // expo-auth-session's makeRedirectUri() would hand back `snoopymobile://`.
    // ADR-0008 rejects custom schemes because any app can register one, so the
    // absence of a claimed HTTPS URL has to be a refusal, not a fallback.
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: { backendApiOrigin: 'https://api.example.test', nativeRedirectUri: null },
        },
      },
    }));
    let signIn!: typeof signInWithProvider;
    jest.isolateModules(() => {
      signIn = require('@/lib/platform/native-auth').signInWithProvider;
    });

    await expect(signIn('google')).resolves.toMatchObject({ status: 'unconfigured' });
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('sends the challenge in the URL and the verifier only in the body', async () => {
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'https://app.example.test/auth/native/callback?code=sealed-code',
    });
    platformOperation.mockResolvedValue({
      tokenType: 'Bearer',
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 3600,
    });

    await expect(signInWithProvider('google')).resolves.toEqual({ status: 'signed-in' });

    const startUrl = new URL(openAuthSessionAsync.mock.calls[0][0]);
    expect(startUrl.pathname).toBe('/v1/auth/native/google/start');
    expect(startUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(startUrl.searchParams.get('code_challenge')).toHaveLength(43);
    // The verifier is the secret half. It must not be in the URL.
    expect(openAuthSessionAsync.mock.calls[0][0]).not.toContain('code_verifier');

    const [path, execute] = platformOperation.mock.calls[0];
    expect(path).toBe('/v1/auth/native/token');
    const post = jest.fn().mockResolvedValue({ data: {}, response: { ok: true } });
    await execute({ platform: { POST: post } }, new AbortController().signal);
    const request = post.mock.calls[0][1];
    expect(request.body.code).toBe('sealed-code');
    expect(request.body.codeVerifier).toMatch(/^[A-Za-z0-9\-_]{43,128}$/);
  });

  it('stores the session with an absolute expiry', async () => {
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'https://app.example.test/auth/native/callback?code=c',
    });
    platformOperation.mockResolvedValue({
      tokenType: 'Bearer',
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 3600,
    });

    await signInWithProvider('google');
    const stored = writeSession.mock.calls[0][0];
    expect(stored.accessToken).toBe('a');
    expect(stored.refreshToken).toBe('r');
    // expiresIn is a duration; what gets stored has to be a moment.
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
  });

  it('treats a dismissed browser sheet as a cancellation, not a failure', async () => {
    openAuthSessionAsync.mockResolvedValue({ type: 'dismiss' });
    await expect(signInWithProvider('google')).resolves.toEqual({ status: 'cancelled' });
    expect(platformOperation).not.toHaveBeenCalled();
  });

  it('never renders a reason the callback supplied verbatim', async () => {
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'https://app.example.test/auth/native/callback?status=error&reason=<script>x</script>',
    });
    const outcome = await signInWithProvider('google');
    expect(outcome.status).toBe('failed');
    expect((outcome as { message: string }).message).toBe('Sign-in could not be completed.');
  });

  it('refuses a successful-looking callback from any other address', async () => {
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'https://attacker.example/auth/native/callback?code=sealed-code',
    });

    await expect(signInWithProvider('google')).resolves.toEqual({
      status: 'failed',
      message: 'Sign-in returned to an unexpected address.',
    });
    expect(platformOperation).not.toHaveBeenCalled();
  });

  it('reports an unconfigured deployment distinctly from a failure', async () => {
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'https://app.example.test/auth/native/callback?code=c',
    });
    platformOperation.mockRejectedValue(new PlatformError('Not configured', 503, 'NOT_CONFIGURED'));
    await expect(signInWithProvider('google')).resolves.toMatchObject({ status: 'unconfigured' });
  });
});

describe('refreshSession — the split that matters', () => {
  it('discards the session on 401, because the credential is dead', async () => {
    readSession.mockResolvedValue(LIVE_SESSION);
    platformOperation.mockRejectedValue(new PlatformError('dead', 401, 'UNAUTHENTICATED'));

    await expect(refreshSession()).resolves.toEqual({ status: 'signed-out' });
    expect(clearSession).toHaveBeenCalled();
  });

  it('KEEPS the session on 502, because an outage is not a refusal', async () => {
    // Treating this as a dead credential would sign out every user who opened
    // the app during a provider outage.
    readSession.mockResolvedValue(LIVE_SESSION);
    platformOperation.mockRejectedValue(new PlatformError('The platform is unreachable', 502));

    await expect(refreshSession()).resolves.toEqual({
      status: 'unavailable',
      message: 'The platform is unreachable',
    });
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('keeps the session when the deployment is unconfigured', async () => {
    readSession.mockResolvedValue(LIVE_SESSION);
    platformOperation.mockRejectedValue(new PlatformError('not configured', 503));

    await expect(refreshSession()).resolves.toEqual({
      status: 'unavailable',
      message: 'not configured',
    });
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('does nothing when there is no stored session', async () => {
    readSession.mockResolvedValue(null);
    await expect(refreshSession()).resolves.toEqual({ status: 'signed-out' });
    expect(platformOperation).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('sends the refresh token, because that is what revokes upstream', async () => {
    readSession.mockResolvedValue(LIVE_SESSION);
    platformOperation.mockResolvedValue(null);

    await expect(signOut()).resolves.toEqual({ revoked: true });
    expect(platformOperation.mock.calls[0][0]).toBe('/v1/auth/logout');
    const execute = platformOperation.mock.calls[0][1];
    const post = jest.fn().mockResolvedValue({ data: null, response: { ok: true } });
    await execute({ platform: { POST: post } }, new AbortController().signal);
    expect(post.mock.calls[0][1].body).toEqual({ refreshToken: 'refresh-1' });
    expect(clearSession).toHaveBeenCalled();
  });

  it('does NOT delete the keychain entry when revocation fails', async () => {
    // A 502 means the session is still live upstream. Deleting the local copy
    // would strand a session nobody can reach — which is why the contract
    // answers 502 rather than 204.
    readSession.mockResolvedValue(LIVE_SESSION);
    platformOperation.mockRejectedValue(new PlatformError('revocation failed', 502));

    await expect(signOut()).resolves.toEqual({ revoked: false });
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('still clears locally when the server says the token is already dead', async () => {
    readSession.mockResolvedValue(LIVE_SESSION);
    platformOperation.mockRejectedValue(new PlatformError('dead', 401));

    await expect(signOut()).resolves.toEqual({ revoked: true });
    expect(clearSession).toHaveBeenCalled();
  });

  it('keeps the credential on every answer that is not terminal about this token', async () => {
    // 400 and 401 are the platform reading the token and refusing it — the
    // device's copy is spent either way. A 500 or a 503 is the platform never
    // getting to say, so clearing would delete the keychain entry for a session
    // that is still live upstream. The contract's rule is "clear locally only
    // on a terminal/successful answer", and 5xx is not terminal.
    for (const status of [500, 503]) {
      clearSession.mockClear();
      readSession.mockResolvedValue(LIVE_SESSION);
      platformOperation.mockRejectedValue(new PlatformError('upstream', status));

      await expect(signOut()).resolves.toEqual({ revoked: false });
      expect(clearSession).not.toHaveBeenCalled();
    }
  });

  it('keeps the credential when the platform was never reached at all', async () => {
    clearSession.mockClear();
    readSession.mockResolvedValue(LIVE_SESSION);
    platformOperation.mockRejectedValue(new Error('socket closed'));

    await expect(signOut()).resolves.toEqual({ revoked: false });
    expect(clearSession).not.toHaveBeenCalled();
  });
});
