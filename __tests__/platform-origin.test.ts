/**
 * The origin parser is the app's only statement about where the backend is, and
 * it is the check that stops a release from talking cleartext. Both make it
 * worth pinning.
 *
 * These assertions rely on a spec-compliant `URL`. That is legitimate here:
 * Expo's winter runtime installs `whatwg-url-without-unicode` as the global
 * `URL` (`expo/src/winter/runtime.native.ts`), replacing React Native's
 * regex-based approximation — so Node's parser and the device's agree.
 */

const ORIGIN = 'https://api.example.test';

type DevGlobal = { __DEV__?: boolean };

/**
 * Resolve the origin under a given configuration and build mode.
 *
 * `__DEV__` has to stay set across the *call*, not just the import: the release
 * check reads it when the function runs. Restoring it too early was the first
 * thing these tests caught.
 */
function resolveWith(configured: unknown, dev = true): string | null {
  const previousDev = (globalThis as DevGlobal).__DEV__;
  (globalThis as DevGlobal).__DEV__ = dev;
  jest.resetModules();
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig: { extra: { backendApiOrigin: configured } } },
  }));
  try {
    let backendApiOrigin!: () => string | null;
    jest.isolateModules(() => {
      backendApiOrigin = require('@/lib/platform/origin').backendApiOrigin;
    });
    return backendApiOrigin();
  } finally {
    (globalThis as DevGlobal).__DEV__ = previousDev;
  }
}

describe('backendApiOrigin — absent configuration', () => {
  it('answers null rather than guessing a default', () => {
    // A build must never silently point at a developer's laptop.
    expect(resolveWith(null)).toBeNull();
    expect(resolveWith(undefined)).toBeNull();
    expect(resolveWith('')).toBeNull();
    expect(resolveWith('   ')).toBeNull();
  });

  it('ignores a non-string value', () => {
    expect(resolveWith(8080)).toBeNull();
  });
});

describe('backendApiOrigin — accepted values', () => {
  it('accepts an HTTPS origin', () => {
    expect(resolveWith(ORIGIN)).toBe(ORIGIN);
  });

  it('accepts the local Compose Edge in development', () => {
    expect(resolveWith('http://localhost:8080')).toBe('http://localhost:8080');
    expect(resolveWith('http://10.0.2.2:8080')).toBe('http://10.0.2.2:8080');
  });

  it('normalises a trailing slash to a bare origin', () => {
    // Paths are concatenated as `${origin}${path}`; a trailing slash here would
    // produce `//v1/session`.
    expect(resolveWith(`${ORIGIN}/`)).toBe(ORIGIN);
  });
});

describe('backendApiOrigin — rejected values', () => {
  it('rejects anything carrying more than an origin', () => {
    expect(() => resolveWith(`${ORIGIN}/v1`)).toThrow('only an origin');
    expect(() => resolveWith(`${ORIGIN}/?x=1`)).toThrow('only an origin');
    expect(() => resolveWith(`${ORIGIN}/#frag`)).toThrow('only an origin');
  });

  it('rejects embedded credentials', () => {
    // A credential in a config value is a credential in a crash report.
    expect(() => resolveWith('https://user:pass@api.example.test')).toThrow(
      'only an origin',
    );
  });

  it('rejects a non-HTTP scheme', () => {
    expect(() => resolveWith('ftp://api.example.test')).toThrow('HTTP or HTTPS');
    expect(() => resolveWith('snoopymobile://callback')).toThrow('HTTP or HTTPS');
  });

  it('rejects a value that is not an absolute URL', () => {
    expect(() => resolveWith('api.example.test')).toThrow();
  });
});

describe('backendApiOrigin — release builds', () => {
  it('refuses cleartext outside development', () => {
    expect(() => resolveWith('http://localhost:8080', false)).toThrow(
      'HTTPS outside development',
    );
  });

  it('still accepts HTTPS outside development', () => {
    expect(resolveWith(ORIGIN, false)).toBe(ORIGIN);
  });
});
