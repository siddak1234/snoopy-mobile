/**
 * The sign-in sheet must catch the HTTPS return, never load it — the guard for TestFlight 37 and 38's
 * failure (the owner, 2026-11-05: "I cant login. Fix immediately. ... Ensure this never happens ever again").
 *
 * expo-web-browser decides in Swift whether iOS's `ASWebAuthenticationSession` uses the HTTPS callback
 * (`.https(host:path:)`). SDK 54's module used it whenever the redirect was `https`; SDK 55's uses it only
 * under `options.preferUniversalLinks`, and falls back to `callbackURLScheme: "https"`, which never
 * catches an HTTPS return. This test reads the INSTALLED module's Swift: every `options.<name>` in the
 * condition that guards `.https(` must be set true in `AUTH_SESSION_OPTIONS`, so an Expo upgrade that
 * changes or adds a condition fails here, before a build ships.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';

import { AUTH_SESSION_OPTIONS } from '@/lib/platform/native-auth';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

const swiftPath = join(dirname(require.resolve('expo-web-browser/package.json')), 'ios', 'WebAuthSession.swift');

/** The text of the `if` condition whose body creates the HTTPS-callback session. */
export function httpsCallbackCondition(swift: string): string {
  const call = swift.indexOf('callback: .https(');
  if (call < 0) throw new Error(`${swiftPath} no longer creates an HTTPS-callback session: re-read it before shipping`);
  // The last `if` statement (a line that starts with `if`, never the word inside a comment) before the call.
  const ifs = [...swift.slice(0, call).matchAll(/^[ \t]*if\s/gmu)];
  const ifAt = ifs.length ? ifs[ifs.length - 1]!.index! : -1;
  const brace = swift.indexOf('{', ifAt);
  if (ifAt < 0 || brace < 0 || brace > call) throw new Error(`${swiftPath}: the HTTPS callback is not inside an if`);
  return swift.slice(ifAt, brace);
}

/** Each `options.<name>` the condition reads. */
export function optionsRead(condition: string): string[] {
  return [...condition.matchAll(/options\.(\w+)/gu)].map((m) => m[1]!);
}

describe('the sign-in sheet catches the HTTPS return', () => {
  const swift = readFileSync(swiftPath, 'utf8');

  it('the installed expo-web-browser still creates an HTTPS-callback session for an https redirect', () => {
    const condition = httpsCallbackCondition(swift);
    expect(condition).toMatch(/redirectUrl\.scheme == "https"/u);
  });

  it('every option that condition needs is set true in AUTH_SESSION_OPTIONS', () => {
    const needed = optionsRead(httpsCallbackCondition(swift));
    for (const name of needed) expect(AUTH_SESSION_OPTIONS).toHaveProperty(name, true);
  });

  it('bites: a condition gated on an option the app does not set is caught', () => {
    const gated = 'if options.someNewSwitch, let redirectUrl, redirectUrl.scheme == "https" {\n  callback: .https(host: h, path: p)';
    const needed = optionsRead(httpsCallbackCondition(gated));
    expect(needed).toEqual(['someNewSwitch']);
    expect(AUTH_SESSION_OPTIONS).not.toHaveProperty('someNewSwitch');
  });
});
