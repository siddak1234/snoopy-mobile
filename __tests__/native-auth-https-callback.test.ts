/**
 * The sign-in sheet must catch the HTTPS return, never load it (DESIGN-GAPS "Hotfix: sign-in on iOS").
 * Reads the INSTALLED expo-web-browser's Swift: its session code is pinned by sha256, so any change to it
 * fails here until someone re-reads it, and every option it reads must be set true in AUTH_SESSION_OPTIONS.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';

import { AUTH_SESSION_OPTIONS } from '@/lib/platform/native-auth';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

const moduleDir = dirname(require.resolve('expo-web-browser/package.json'));
const version: string = JSON.parse(readFileSync(join(moduleDir, 'package.json'), 'utf8')).version;
const swift = readFileSync(join(moduleDir, 'ios', 'WebAuthSession.swift'), 'utf8');
const options = readFileSync(join(moduleDir, 'ios', 'WebBrowserOptions.swift'), 'utf8');

/**
 * The session code as reviewed on 2026-11-05 (expo-web-browser 57.0.3): the text from `init(authUrl:` to
 * `callback: .https(`. A new hash means the module changed how it builds the sheet: re-read
 * ios/WebAuthSession.swift, confirm the HTTPS return is still caught with AUTH_SESSION_OPTIONS, then
 * record the new version and hash here.
 */
const REVIEWED = { version: '57.0.3', sha256: '36cf51a963f07b55b863c6db5c6ff74fc0abce3ebf32fea01f1c31c0369ed39f' };

/** The text from the session's initializer to the HTTPS-callback call; throws if either is gone. */
export function sessionRegion(source: string): string {
  const start = source.indexOf('init(authUrl:');
  const call = source.indexOf('callback: .https(', start);
  if (start < 0 || call < 0) throw new Error('expo-web-browser no longer builds an HTTPS-callback session: re-read it');
  return source.slice(start, call);
}

/** Every `options.<name>` read anywhere in that text (an outer if, a guard, a local let, a helper's argument). */
export function optionsRead(region: string): string[] {
  return [...new Set([...region.matchAll(/options\.(\w+)/gu)].map((m) => m[1]!))];
}

describe('the sign-in sheet catches the HTTPS return', () => {
  it(`the installed session code is the reviewed one (expo-web-browser ${REVIEWED.version})`, () => {
    const hash = createHash('sha256').update(sessionRegion(swift)).digest('hex');
    expect({ version, sha256: hash }).toEqual(REVIEWED);
  });

  it('every option the session code reads before the HTTPS callback is set true in AUTH_SESSION_OPTIONS', () => {
    const needed = optionsRead(sessionRegion(swift));
    expect(needed).toContain('preferUniversalLinks');
    for (const name of needed) expect(AUTH_SESSION_OPTIONS).toHaveProperty(name, true);
  });

  it('the native options record still declares preferUniversalLinks under its own name', () => {
    expect(options).toMatch(/struct AuthSessionOptions: Record \{[^}]*@Field\s+var preferUniversalLinks: Bool/u);
  });

  it('bites: a new switch in an outer if, a guard or a local let is caught', () => {
    for (const variant of [
      'init(authUrl: URL) {\n if options.newSwitch {\n if options.preferUniversalLinks {\n callback: .https(',
      'init(authUrl: URL) {\n guard options.newSwitch else { return }\n callback: .https(',
      'init(authUrl: URL) {\n let useHttps = options.newSwitch\n callback: .https(',
    ]) {
      const needed = optionsRead(sessionRegion(variant));
      expect(needed).toContain('newSwitch');
      expect(AUTH_SESSION_OPTIONS).not.toHaveProperty('newSwitch');
    }
  });
});
