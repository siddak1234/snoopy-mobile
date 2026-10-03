import * as LocalAuthentication from 'expo-local-authentication';
import { act, renderRouter, screen } from 'expo-router/testing-library';

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
 * The Face ID lock gates the session, under the REAL router (the build 13 review,
 * its first and third findings).
 *
 * The root guard admitted the tabs for any `signed-in` session, locked or not, so
 * a link that arrived while the lock showed — snoopymobile:///settings from
 * Safari, say — opened the tab without Face ID: expo-router's URL listener
 * (useLinking.native.js) dispatches any address the root stack holds. Pre-existing
 * since before build 12. Now the session is `locked` from the cold start whenever
 * a stored session's owner turned Face ID on, and the guard admits the tabs only
 * signed in AND unlocked, so the listener finds no tab to open and drops the link.
 * The lock's own check passing opens the session, and Home with it.
 */

jest.setTimeout(60_000);

const Biometrics = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
const Notifications = jest.requireMock('expo-notifications') as { getLastNotificationResponseAsync: jest.Mock };

/** A remembered session whose owner turned Face ID on. */
const FACE_ID_ON = { 'autom8x.face-id-enabled': 'true', 'autom8x.remember-session': 'true' };

type Check = Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>;
/** Answers the Face ID check the lock is waiting on; until then, the lock shows. */
let answerCheck: (result: Check) => void = () => {};
let before: [unknown, unknown, unknown, unknown];

beforeEach(() => {
  before = [
    Biometrics.hasHardwareAsync.getMockImplementation(),
    Biometrics.isEnrolledAsync.getMockImplementation(),
    Biometrics.authenticateAsync.getMockImplementation(),
    Notifications.getLastNotificationResponseAsync.getMockImplementation(),
  ];
  // A phone with Face ID set up, whose check answers when the test says.
  Biometrics.hasHardwareAsync.mockImplementation(async () => true);
  Biometrics.isEnrolledAsync.mockImplementation(async () => true);
  Biometrics.authenticateAsync.mockImplementation(
    () =>
      new Promise<Check>((resolve) => {
        answerCheck = resolve;
      }),
  );
});

afterEach(() => {
  Biometrics.hasHardwareAsync.mockImplementation(before[0] as never);
  Biometrics.isEnrolledAsync.mockImplementation(before[1] as never);
  Biometrics.authenticateAsync.mockImplementation(before[2] as never);
  Notifications.getLastNotificationResponseAsync.mockImplementation(before[3] as never);
  jest.restoreAllMocks();
});

type UrlListener = (event: { url: string }) => unknown;

/**
 * Where links from outside the app arrive: the URL listener expo-router
 * registers through expo-linking (`subscribe`, build/link/linking.js) — on a
 * phone, React Native's Linking "url" event. expo-router's testing library
 * swallows that registration (its expo-linking mock answers a no-op), so the
 * listener is kept here. Called before the launch, which registers it.
 */
function listenForLinks(): UrlListener[] {
  const listeners: UrlListener[] = [];
  const linking = jest.requireMock('expo-linking') as {
    addEventListener: (type: string, listener: UrlListener) => { remove(): void };
  };
  jest.spyOn(linking, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'url') listeners.push(listener);
    return { remove() {} };
  });
  return listeners;
}

/** A link opened from outside the app — snoopymobile:///settings from Safari — while it runs. */
async function openLink(listeners: UrlListener[], url: string) {
  expect(listeners).toHaveLength(1);
  await act(async () => {
    await listeners[0]!({ url });
  });
  await flush(100);
  await flush(1000);
}

/** The lock's check answers, and what it sets off settles. */
async function check(result: Check) {
  expect(Biometrics.authenticateAsync).toHaveBeenCalledTimes(1);
  await act(async () => {
    answerCheck(result);
  });
  await flush(100);
  await flush(1000);
}

describe('the Face ID lock gates the session (the build 13 review)', () => {
  it('a link to a tab that arrives while the lock shows opens nothing — Settings never drawn, the lock stays — and Face ID passing opens Home', async () => {
    signedInOnThisPhone(FACE_ID_ON);
    answerPlatform();
    const links = listenForLinks();
    const view = await launch();
    expect(view.getSegments()).toEqual(['(auth)', 'faceid']);
    const { replaces, unhandled } = watchRouter();

    await asInProduction(async () => {
      await openLink(links, 'snoopymobile:///settings');
    });

    expect(screen.queryByText('Sign out')).toBeNull();
    expect(view.getSegments()).toEqual(['(auth)', 'faceid']);
    expect(screen.getByText('Unlocking your workspace…')).toBeTruthy();

    await asInProduction(async () => {
      await check({ success: true });
    });

    // Home, as a passed check always opened: the dropped link is not replayed.
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
    expect(screen.queryByText('Sign out')).toBeNull();
    expect(replaces).toEqual(['/(tabs)/(home)']);
    expect(unhandled).toEqual([]);
  });

  it('a Face ID check that does not pass keeps the lock: a link to a tab after it opens nothing either', async () => {
    signedInOnThisPhone(FACE_ID_ON);
    answerPlatform();
    const links = listenForLinks();
    const view = await launch();
    const { unhandled } = watchRouter();

    await asInProduction(async () => {
      await check({ success: false, error: 'user_cancel' });
      expect(screen.getByText('Face ID did not unlock this workspace.')).toBeTruthy();
      await openLink(links, 'snoopymobile:///settings');
    });

    expect(screen.queryByText('Sign out')).toBeNull();
    expect(view.getSegments()).toEqual(['(auth)', 'faceid']);
    expect(screen.getByText('Use identity provider')).toBeTruthy();
    expect(unhandled).toEqual([]);
  });

  it('a cold start at a tab address with Face ID on draws no tab at any moment, and ends on the lock', async () => {
    signedInOnThisPhone(FACE_ID_ON);
    answerPlatform();
    const view = renderRouter('./app', { initialUrl: '/settings' });
    // The helpers ride on the render's promise (test/real-router.tsx): keep them first.
    const where = () => view.getSegments();
    await (view as unknown as Promise<unknown>);
    const seen: string[] = [];
    const look = () => seen.push(`${where().join('/')}${screen.queryByText('Sign out') ? ' — Settings drawn' : ''}`);

    look();
    for (const ms of [0, 10, 50, 100, 500, 1000, 2500, 100]) {
      await flush(ms);
      look();
    }

    expect(seen.filter((sample) => sample.includes('Settings drawn'))).toEqual([]);
    expect(where()).toEqual(['(auth)', 'faceid']);
  });

  it('with Face ID off, a cold start reaches Home through the splash, and nothing asks for Face ID', async () => {
    signedInOnThisPhone({ 'autom8x.face-id-enabled': 'false', 'autom8x.remember-session': 'true' });
    answerPlatform();
    const { replaces, unhandled } = watchRouter();

    let view: Awaited<ReturnType<typeof launch>> | undefined;
    await asInProduction(async () => {
      view = await launch();
    });

    expect([view!.getPathname(), view!.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
    expect(Biometrics.authenticateAsync).not.toHaveBeenCalled();
    expect(replaces).toEqual(['/(tabs)/(home)']);
    expect(unhandled).toEqual([]);
  });

  it('a link to the Face ID question while the lock shows opens nothing: it cannot be answered Not now, and Face ID stays on for the next cold start', async () => {
    signedInOnThisPhone(FACE_ID_ON);
    answerPlatform();
    const links = listenForLinks();
    const view = await launch();
    expect(view.getSegments()).toEqual(['(auth)', 'faceid']);

    await asInProduction(async () => {
      await openLink(links, 'snoopymobile:///faceid-offer');
    });

    // The lock is what is drawn. (expo-router's route info names the link's
    // screen from the dropped params; the auth stack never opened it.)
    expect(screen.queryByText('Open with Face ID next time?')).toBeNull();
    expect(screen.queryByText('Not now')).toBeNull();
    expect(screen.getByText('Unlocking your workspace…')).toBeTruthy();
    expect(kept.get('autom8x.face-id-enabled')).toBe('true');

    // Nor does the question open once the lock does: Face ID passing opens Home.
    await asInProduction(async () => {
      await check({ success: true });
    });
    expect(screen.queryByText('Open with Face ID next time?')).toBeNull();
    expect(view.getSegments()).toEqual(['(tabs)', '(home)']);
    expect(kept.get('autom8x.face-id-enabled')).toBe('true');
  });

  it('a sign-in opens a session the lock held — it is its own proof: Use identity provider, Get started, Sign in with Google, Not now, Home', async () => {
    signedInOnThisPhone(FACE_ID_ON);
    answerPlatform();
    const view = await launch();
    const { unhandled } = watchRouter(30);

    await asInProduction(async () => {
      await check({ success: false, error: 'user_cancel' });
      await press('Use identity provider');
      await flush(3000);
      await press('Get started');
      await press('Sign in with Google');
      // The sign-out cleared the Face ID choice with the tokens: asked again.
      await press('Not now');
    });

    expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
    expect(unhandled).toEqual([]);
  });

  it('a push tap that opened the app waits for the lock: nothing opens while it shows, and the run opens once Face ID passes', async () => {
    Notifications.getLastNotificationResponseAsync.mockImplementation(async () => ({
      notification: {
        request: { identifier: 'tap-while-locked', content: { data: { event: 'run-failed', runId: 'run-1' } } },
      },
    }));
    signedInOnThisPhone(FACE_ID_ON);
    answerPlatform();
    const view = await launch();
    const { unhandled } = watchRouter();

    expect(view.getSegments()).toEqual(['(auth)', 'faceid']);
    expect(Notifications.getLastNotificationResponseAsync).not.toHaveBeenCalled();

    await asInProduction(async () => {
      await check({ success: true });
      await flush(1000);
    });

    expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled();
    expect(view.getSegments()).toEqual(['(tabs)', '(home)', 'run']);
    expect(unhandled).toEqual([]);
  });
});
