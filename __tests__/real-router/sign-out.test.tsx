import * as LocalAuthentication from 'expo-local-authentication';
import { fireEvent, screen, within } from 'expo-router/testing-library';

import { DELETION_WORDS } from '@/lib/content/deletion';
import { SIGN_OUT_FAILED } from '@/lib/content/screen-states';
import { PlatformError, PlatformNotConfiguredError, PlatformUnreachableError } from '@/lib/platform/problem';
import { notifySessionEnded } from '@/lib/platform/session-recovery';
import {
  answerPlatform,
  asInProduction,
  flush,
  kept,
  launch,
  press,
  signedInOnThisPhone,
  watchRouter,
} from '@/test/real-router';

/**
 * Signed out is the cover — after Sign out, an ended session, Delete account's
 * "Sign in again" and the Face ID lock's fallback — under the REAL router.
 *
 * The owner's build 12 item 6: "Sign out was clicked and it hung on this screen
 * untill i closed the app then it took me to get started." The logout had
 * answered 204 and the keychain was empty; what failed was the move. "/" names
 * two screens, the cover (app/index.tsx) and Home (app/(tabs)/(home)/index.tsx),
 * and expo-router reads an address from where the person is, preferring a
 * screen in the same group — so from inside the tabs "/" is Home. Settings'
 * `router.replace('/')` became a command the tab bar cannot take, dropped
 * without a word in a release build, and the tab layout's `<Redirect href="/" />`
 * replaced the tabs with themselves, again and again. Since bda1136 (build 8's
 * code), unseen: the unit project's router is a mock that runs no navigator.
 *
 * Now the root stack guards the tabs (`Stack.Protected`, app/_layout.tsx): when
 * the session is not signed in they are removed and the stack lands on its
 * anchor, the cover, by name. Nothing inside the tabs navigates to "/".
 */

jest.setTimeout(60_000);

afterEach(() => {
  jest.restoreAllMocks();
});

const logouts = (calls: string[]) => calls.filter((call) => call === '/v1/auth/logout');

/** Sign out is asked first (the owner's build 13 decision 1): the card, then the dialog's red Sign out. */
async function signOutFromSettings() {
  await press('Sign out');
  await fireEvent.press(within(screen.getByTestId('sign-out-dialog')).getByText('Sign out'));
  await flush(100);
  await flush(1000);
}

describe("signed out is the cover, from inside the tabs (the owner's build 12 item 6)", () => {
  it('Settings › Sign out: one logout, the keychain empty, and the cover at "/" with Get started — no command dropped, no loop', async () => {
    signedInOnThisPhone();
    const calls = answerPlatform();
    const view = await launch();
    await press('Settings');
    expect(view.getPathname()).toBe('/settings');
    const { replaces, unhandled } = watchRouter();

    await asInProduction(async () => {
      await signOutFromSettings();
      await flush(3000);
    });

    expect(logouts(calls)).toHaveLength(1);
    expect([...kept.keys()]).toEqual([]);
    expect(screen.getByText('Get started')).toBeTruthy();
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', []]);
    expect(unhandled).toEqual([]);
    expect(replaces.length).toBeLessThanOrEqual(2);
  });

  it('a session that ends inside the tabs — a 401 the refresh cannot recover — reaches the cover', async () => {
    signedInOnThisPhone();
    answerPlatform({
      // What the transport does with it (client.ts, native-auth.ts' recovery): the
      // refresh answered 401, so the keychain is cleared, the session's end is
      // announced, and the 401 goes back to the screen that asked.
      '/v1/auth/identities': () => {
        kept.clear();
        notifySessionEnded();
        throw new PlatformError('Sign in is required.', 401, 'UNAUTHENTICATED');
      },
    });
    const view = await launch();
    await press('Settings');
    const { replaces, unhandled } = watchRouter();

    await asInProduction(async () => {
      // Account reads the linked accounts: that read meets the dead credential.
      await press('Account');
      await flush(3000);
    });

    expect(screen.getByText('Get started')).toBeTruthy();
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', []]);
    expect(unhandled).toEqual([]);
    expect(replaces.length).toBeLessThanOrEqual(2);
  });

  it("the owner's loop, twice: the cover, Get started, Sign in with Google, Home, Settings, Sign out, the cover", async () => {
    kept.clear();
    const calls = answerPlatform();
    const view = await launch();
    const { replaces, unhandled } = watchRouter(30);
    const where = () => [view.getPathname(), view.getSegments()];
    expect(screen.getByText('Get started')).toBeTruthy();

    await asInProduction(async () => {
      for (const round of [1, 2]) {
        await press('Get started');
        await press('Sign in with Google');
        // Signing in still reaches Home under the guard.
        expect(where()).toEqual(['/', ['(tabs)', '(home)']]);
        await press('Settings');
        await signOutFromSettings();
        await flush(3000);
        expect(logouts(calls)).toHaveLength(round);
        expect(screen.getByText('Get started')).toBeTruthy();
        expect(where()).toEqual(['/', []]);
      }
    });

    expect(unhandled).toEqual([]);
    // Get started's move and the sign-in's, each round; Sign out makes none.
    expect(replaces).toEqual(['/(auth)/login', '/(tabs)/(home)', '/(auth)/login', '/(tabs)/(home)']);
  });

  it('a logout that answers 502 keeps the session: Settings stays and says so in its dialog, Sign out offered again, and nothing navigates', async () => {
    signedInOnThisPhone();
    const calls = answerPlatform({
      '/v1/auth/logout': () => {
        throw new PlatformError('Session revocation failed', 502, 'SESSION_REVOCATION_FAILED');
      },
    });
    const view = await launch();
    await press('Settings');
    const { replaces, unhandled } = watchRouter();

    await asInProduction(async () => {
      await signOutFromSettings();
      await flush(3000);
    });

    expect(logouts(calls)).toHaveLength(1);
    // Said in the dialog, which stays — its Sign out is the action offered again (build 13 decision 1).
    expect(within(screen.getByTestId('sign-out-dialog')).getByText(SIGN_OUT_FAILED)).toBeTruthy();
    expect(within(screen.getByTestId('sign-out-dialog')).getByText('Sign out')).toBeTruthy();
    // ADR-0017 §4: nothing cleared for a session still live upstream.
    expect(kept.get('autom8x.refresh-token')).toBe('refresh-1');
    expect(view.getPathname()).toBe('/settings');
    expect(screen.queryByText('Get started')).toBeNull();
    expect(replaces).toEqual([]);
    expect(unhandled).toEqual([]);
  });

  it("Delete account's Sign in again, after an attempt the session's end stopped, signs out and reaches the cover", async () => {
    signedInOnThisPhone();
    const calls = answerPlatform({
      '/v1/auth/identities': () => ({ identities: [{ provider: 'google', primary: true }] }),
      '/v1/account': () => {
        throw new PlatformError('Sign in is required.', 401, 'UNAUTHENTICATED');
      },
    });
    const view = await launch();
    await press('Settings');
    await press('Account');
    await press('Delete Account');
    await press('Yes, delete my account');
    expect(screen.getByText(DELETION_WORDS.expired)).toBeTruthy();
    const { replaces, unhandled } = watchRouter();

    await asInProduction(async () => {
      await press('Sign in again');
      await flush(3000);
    });

    expect(logouts(calls)).toHaveLength(1);
    expect([...kept.keys()]).toEqual([]);
    expect(screen.getByText('Get started')).toBeTruthy();
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', []]);
    expect(unhandled).toEqual([]);
    expect(replaces.length).toBeLessThanOrEqual(2);
  });

  it('a deleted account: Account deleted, signed out, and its Continue reaches the cover', async () => {
    signedInOnThisPhone();
    answerPlatform({
      '/v1/auth/identities': () => ({ identities: [{ provider: 'google', primary: true }] }),
      '/v1/account': () => ({ deleted: true }),
    });
    const view = await launch();
    await press('Settings');
    await press('Account');
    await press('Delete Account');
    const { replaces, unhandled } = watchRouter();

    await asInProduction(async () => {
      await press('Yes, delete my account');
      await flush(3000);
    });
    // Account deleted sits in (auth), which the guard does not move.
    expect(screen.getByText('Account deleted')).toBeTruthy();
    expect(view.getSegments()).toEqual(['(auth)', 'account-deleted']);
    expect([...kept.keys()]).toEqual([]);

    await asInProduction(async () => {
      await press('Continue to Autom8x');
    });
    expect(screen.getByText('Get started')).toBeTruthy();
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', []]);
    expect(unhandled).toEqual([]);
    expect(replaces).toEqual(['/(auth)/account-deleted', '/']);
  });
});

describe("the Face ID lock's fallback, under the root guard (the owner's build 12 items 7 and 6)", () => {
  const Biometrics = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
  let before: [unknown, unknown, unknown];

  beforeEach(() => {
    before = [
      Biometrics.hasHardwareAsync.getMockImplementation(),
      Biometrics.isEnrolledAsync.getMockImplementation(),
      Biometrics.authenticateAsync.getMockImplementation(),
    ];
    // A phone with Face ID set up, whose check does not unlock (cancelled, or another face).
    Biometrics.hasHardwareAsync.mockImplementation(async () => true);
    Biometrics.isEnrolledAsync.mockImplementation(async () => true);
    Biometrics.authenticateAsync.mockImplementation(async () => ({ success: false, error: 'user_cancel' }));
  });

  afterEach(() => {
    Biometrics.hasHardwareAsync.mockImplementation(before[0] as never);
    Biometrics.isEnrolledAsync.mockImplementation(before[1] as never);
    Biometrics.authenticateAsync.mockImplementation(before[2] as never);
  });

  it("Use identity provider with a signed-in session signs out to the cover, and signing in again asks Face ID's question", async () => {
    signedInOnThisPhone({ 'autom8x.face-id-enabled': 'true', 'autom8x.remember-session': 'true' });
    const calls = answerPlatform();
    const view = await launch();
    expect(view.getSegments()).toEqual(['(auth)', 'faceid']);
    const { unhandled } = watchRouter();

    await asInProduction(async () => {
      await press('Use identity provider');
      await flush(3000);
    });

    expect(logouts(calls)).toHaveLength(1);
    // The Face ID choice went with the tokens: the next sign-in is asked again.
    expect([...kept.keys()]).toEqual([]);
    expect(screen.getByText('Get started')).toBeTruthy();
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', []]);

    await asInProduction(async () => {
      await press('Get started');
      await press('Sign in with Google');
    });
    expect(screen.getByText('Open with Face ID next time?')).toBeTruthy();
    expect(view.getSegments()).toEqual(['(auth)', 'faceid-offer']);
    expect(unhandled).toEqual([]);
  });
});

/**
 * Only `signed-in` passes the root guard (DESIGN-CONTRACT: every other state
 * fails closed). The unit project's tab-layout cases held this as a Redirect;
 * the guard is the root stack's now, so it is held here, by what is drawn.
 */
describe('the root guard fails closed', () => {
  it.each([
    ['signed out (the session read answers 401)', () => new PlatformError('Sign in is required.', 401, 'UNAUTHENTICATED')],
    ['no backend configured', () => new PlatformNotConfiguredError()],
    ['the platform unreachable', () => new PlatformUnreachableError()],
  ])('%s: a tab address opens the cover, never the tab', async (_state, refusal) => {
    signedInOnThisPhone();
    answerPlatform({
      '/v1/session': () => {
        throw refusal();
      },
    });
    const { replaces, unhandled } = watchRouter();

    const view = await launch('/settings');

    expect(screen.queryByText('Sign out')).toBeNull();
    expect(screen.getByText('Get started')).toBeTruthy();
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', []]);
    expect(unhandled).toEqual([]);
    expect(replaces.length).toBeLessThanOrEqual(2);
  });
});
