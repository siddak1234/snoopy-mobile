const configFactory = require('../app.config').default;
const appJson = require('../app.json');

const ORIGINAL = {
  EAS_BUILD_PROFILE: process.env.EAS_BUILD_PROFILE,
  EXPO_PUBLIC_BACKEND_API_ORIGIN: process.env.EXPO_PUBLIC_BACKEND_API_ORIGIN,
  EXPO_PUBLIC_NATIVE_REDIRECT_URI: process.env.EXPO_PUBLIC_NATIVE_REDIRECT_URI,
};

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const [name, value] of Object.entries(ORIGINAL)) restore(name, value);
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
    delete process.env.EAS_BUILD_PROFILE;
    delete process.env.EXPO_PUBLIC_BACKEND_API_ORIGIN;
    delete process.env.EXPO_PUBLIC_NATIVE_REDIRECT_URI;

    expect(configFactory({ config: base }).extra).toEqual({
      backendApiOrigin: null,
      nativeRedirectUri: null,
    });
  });

  it('fails a production build when either required endpoint is absent', () => {
    process.env.EAS_BUILD_PROFILE = 'production';
    delete process.env.EXPO_PUBLIC_BACKEND_API_ORIGIN;
    delete process.env.EXPO_PUBLIC_NATIVE_REDIRECT_URI;

    expect(() => configFactory({ config: base })).toThrow(
      'Preview and production builds require',
    );
  });

  it('rejects cleartext release origins and redirect URLs with URL extras', () => {
    process.env.EAS_BUILD_PROFILE = 'preview';
    process.env.EXPO_PUBLIC_BACKEND_API_ORIGIN = 'http://api.example.test';
    process.env.EXPO_PUBLIC_NATIVE_REDIRECT_URI = 'https://app.example.test/auth/native/callback';
    expect(() => configFactory({ config: base })).toThrow('must use HTTPS');

    process.env.EXPO_PUBLIC_BACKEND_API_ORIGIN = 'https://api.example.test';
    process.env.EXPO_PUBLIC_NATIVE_REDIRECT_URI =
      'https://app.example.test/auth/native/callback?claim=too-broad';
    expect(() => configFactory({ config: base })).toThrow('plain HTTPS app-link URL');
  });

  it('derives both native link claims from the exact production redirect', () => {
    process.env.EAS_BUILD_PROFILE = 'production';
    process.env.EXPO_PUBLIC_BACKEND_API_ORIGIN = 'https://api.example.test';
    process.env.EXPO_PUBLIC_NATIVE_REDIRECT_URI =
      'https://app.example.test/auth/native/callback';

    const result = configFactory({ config: base });
    expect(result.extra).toMatchObject({
      backendApiOrigin: 'https://api.example.test',
      nativeRedirectUri: 'https://app.example.test/auth/native/callback',
    });
    expect(result.ios.associatedDomains).toEqual(['applinks:app.example.test']);
    expect(result.android.intentFilters[0]).toMatchObject({
      autoVerify: true,
      data: [
        {
          scheme: 'https',
          host: 'app.example.test',
          pathPrefix: '/auth/native/callback',
        },
      ],
    });
  });
});
