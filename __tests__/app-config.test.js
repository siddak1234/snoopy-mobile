const configFactory = require('../app.config').default;
const appJson = require('../app.json');

/**
 * The release configuration, and the two values it must not get wrong.
 *
 * `EXPO_PUBLIC_NATIVE_REDIRECT_URI` must equal the master plan's string
 * byte-for-byte (ADR-0017): the Edge's `NATIVE_APP_REDIRECT_URIS` compares by
 * exact string, and the app-link claims are derived from it. Through Round 7.5
 * only its SHAPE was validated, so a well-formed URI for the wrong host passed
 * config and shipped — and the value lives in EAS dashboard state that nothing
 * versions. `EXPO_PUBLIC_NATIVE_AUTH_BASE_URL` is where the system browser opens
 * the start leg; it must share an origin with the deployed callback, or the
 * Edge's host-only transaction cookie never reaches it.
 */

const ENV = [
  'EAS_BUILD_PROFILE',
  'EXPO_PUBLIC_BACKEND_API_ORIGIN',
  'EXPO_PUBLIC_NATIVE_REDIRECT_URI',
  'EXPO_PUBLIC_NATIVE_AUTH_BASE_URL',
];
const ORIGINAL = Object.fromEntries(ENV.map((name) => [name, process.env[name]]));

/** The deployed values, as the master plan and the live Edge state them. */
const RELEASE = {
  EXPO_PUBLIC_BACKEND_API_ORIGIN: 'https://api.autom8x.ai',
  EXPO_PUBLIC_NATIVE_REDIRECT_URI: 'https://app.autom8x.ai/auth/native/callback',
  EXPO_PUBLIC_NATIVE_AUTH_BASE_URL: 'https://www.autom8x.ai/api/platform',
};

const EAS_PROJECT_ID = 'cb806193-8885-4b5c-b1d6-850da3f162a2';

function setEnv(values) {
  for (const name of ENV) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
}

afterEach(() => {
  setEnv(ORIGINAL);
});

const base = { ios: {}, android: {}, extra: {} };

describe('release app configuration', () => {
  it('requires iOS 17.4, where ASWebAuthenticationSession can match an HTTPS host and path', () => {
    const buildProperties = appJson.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );
    expect(buildProperties).toEqual([
      'expo-build-properties',
      { ios: { deploymentTarget: '17.4' } },
    ]);
  });

  it('permits an unconfigured local development build', () => {
    setEnv({});

    expect(configFactory({ config: base }).extra).toEqual({
      backendApiOrigin: null,
      nativeRedirectUri: null,
      nativeAuthBaseUrl: null,
    });
  });

  it('lets a development build point the browser leg anywhere, and normalises it', () => {
    // Local runs name their own hosts; only release builds are pinned.
    setEnv({
      EXPO_PUBLIC_BACKEND_API_ORIGIN: 'http://localhost:8080',
      EXPO_PUBLIC_NATIVE_REDIRECT_URI: 'https://app.example.test/auth/native/callback',
      EXPO_PUBLIC_NATIVE_AUTH_BASE_URL: 'https://www.example.test/api/platform/',
    });

    expect(configFactory({ config: base }).extra).toEqual({
      backendApiOrigin: 'http://localhost:8080',
      nativeRedirectUri: 'https://app.example.test/auth/native/callback',
      nativeAuthBaseUrl: 'https://www.example.test/api/platform',
    });
  });

  it('fails a release build when any of the three required values is absent', () => {
    for (const profile of ['preview', 'production']) {
      for (const missing of Object.keys(RELEASE)) {
        setEnv({ ...RELEASE, EAS_BUILD_PROFILE: profile, [missing]: undefined });
        expect(() => configFactory({ config: base })).toThrow(
          'Preview and production builds require',
        );
      }
    }
  });

  it('rejects cleartext release origins and redirect URLs with URL extras', () => {
    setEnv({
      ...RELEASE,
      EAS_BUILD_PROFILE: 'preview',
      EXPO_PUBLIC_BACKEND_API_ORIGIN: 'http://api.example.test',
    });
    expect(() => configFactory({ config: base })).toThrow('must use HTTPS');

    setEnv({
      ...RELEASE,
      EAS_BUILD_PROFILE: 'preview',
      EXPO_PUBLIC_NATIVE_REDIRECT_URI: 'https://app.autom8x.ai/auth/native/callback?claim=too-broad',
    });
    // Shape is diagnosed before equality, so a malformed value is reported as
    // malformed rather than as "the wrong deployment".
    expect(() => configFactory({ config: base })).toThrow('plain HTTPS app-link URL');
  });

  it('refuses a well-formed redirect URI that is not the deployment\'s, byte-for-byte', () => {
    for (const profile of ['preview', 'production']) {
      for (const wrong of [
        'https://app.example.test/auth/native/callback',
        'https://app.autom8x.ai/auth/native/callback/',
        'https://app.autom8x.ai/auth/native/Callback',
        'https://www.autom8x.ai/auth/native/callback',
      ]) {
        setEnv({ ...RELEASE, EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_NATIVE_REDIRECT_URI: wrong });
        expect(() => configFactory({ config: base })).toThrow('byte-for-byte');
      }
    }
  });

  it('refuses a browser-leg base on any origin but the deployed callback\'s', () => {
    for (const profile of ['preview', 'production']) {
      for (const wrong of [
        // The API origin: where the bearer calls go, and exactly where the
        // start leg must NOT be opened — its cookie never reaches the callback.
        'https://api.autom8x.ai',
        'https://www.example.test/api/platform',
        'https://www.autom8x.ai',
      ]) {
        setEnv({ ...RELEASE, EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_NATIVE_AUTH_BASE_URL: wrong });
        expect(() => configFactory({ config: base })).toThrow(
          'must equal https://www.autom8x.ai/api/platform',
        );
      }
    }

    // A trailing slash is the same base, and is normalised rather than refused.
    setEnv({
      ...RELEASE,
      EAS_BUILD_PROFILE: 'production',
      EXPO_PUBLIC_NATIVE_AUTH_BASE_URL: 'https://www.autom8x.ai/api/platform/',
    });
    expect(configFactory({ config: base }).extra.nativeAuthBaseUrl).toBe(
      'https://www.autom8x.ai/api/platform',
    );
  });

  it('validates the browser-leg base like the other two values', () => {
    setEnv({ ...RELEASE, EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_NATIVE_AUTH_BASE_URL: 'not a url' });
    expect(() => configFactory({ config: base })).toThrow('must be an absolute URL');

    setEnv({
      ...RELEASE,
      EAS_BUILD_PROFILE: 'preview',
      EXPO_PUBLIC_NATIVE_AUTH_BASE_URL: 'https://www.autom8x.ai/api/platform?next=1',
    });
    expect(() => configFactory({ config: base })).toThrow('plain base URL');

    setEnv({
      ...RELEASE,
      EAS_BUILD_PROFILE: 'preview',
      EXPO_PUBLIC_NATIVE_AUTH_BASE_URL: 'http://www.autom8x.ai/api/platform',
    });
    expect(() => configFactory({ config: base })).toThrow('must use HTTPS');
  });

  it('derives both native link claims from the exact release redirect', () => {
    setEnv({ ...RELEASE, EAS_BUILD_PROFILE: 'production' });

    const result = configFactory({ config: base });
    expect(result.extra).toEqual({
      backendApiOrigin: 'https://api.autom8x.ai',
      nativeRedirectUri: 'https://app.autom8x.ai/auth/native/callback',
      nativeAuthBaseUrl: 'https://www.autom8x.ai/api/platform',
    });
    expect(result.ios.associatedDomains).toEqual(['applinks:app.autom8x.ai']);
    expect(result.android.intentFilters[0]).toMatchObject({
      autoVerify: true,
      data: [
        {
          scheme: 'https',
          host: 'app.autom8x.ai',
          pathPrefix: '/auth/native/callback',
        },
      ],
    });
  });
});

describe('the real static config, through the factory', () => {
  /**
   * Round 7.5 linked the EAS project by writing `extra.eas.projectId` into
   * `app.json`, and then found that nothing pinned it: the previous version of
   * this suite asserted `extra` against a synthetic `extra: {}`, so if the
   * factory ever stopped spreading `config.extra` the link would vanish from
   * resolved config and the suite would stay green. This runs the factory over
   * the committed `app.json` under the production profile, which is exactly the
   * evaluation a cloud build performs.
   */
  it('carries the linked EAS project and owner through to the resolved config', () => {
    setEnv({ ...RELEASE, EAS_BUILD_PROFILE: 'production' });

    expect(appJson.expo.extra.eas.projectId).toBe(EAS_PROJECT_ID);
    expect(appJson.expo.owner).toBe('autom8x.ai');

    const resolved = configFactory({ config: appJson.expo });
    expect(resolved.extra.eas).toEqual({ projectId: EAS_PROJECT_ID });
    expect(resolved.owner).toBe('autom8x.ai');
    expect(resolved.slug).toBe('snoopy-mobile');
    expect(resolved.ios.bundleIdentifier).toBe('ai.autom8x.snoopy');
    expect(resolved.android.package).toBe('ai.autom8x.snoopy');
    // The static native config survives the derived claims being merged in.
    expect(resolved.ios.associatedDomains).toEqual(['applinks:app.autom8x.ai']);
    expect(resolved.android.intentFilters[0].data[0].host).toBe('app.autom8x.ai');
    expect(resolved.android.adaptiveIcon).toEqual(appJson.expo.android.adaptiveIcon);
  });

  it('keeps the project link in a development build too', () => {
    setEnv({});
    expect(configFactory({ config: appJson.expo }).extra.eas).toEqual({ projectId: EAS_PROJECT_ID });
  });
});
