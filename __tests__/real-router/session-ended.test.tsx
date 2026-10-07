import * as LocalAuthentication from 'expo-local-authentication';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { PlatformError } from '@/lib/platform/problem';
import { notifySessionEnded } from '@/lib/platform/session-recovery';
import type { Answer } from '@/test/fake-platform';
import { SESSION, answerPlatform, asInProduction, flush, kept, launch, press, signedInOnThisPhone } from '@/test/real-router';

/**
 * A session that ended while it was in use (Gate 24 parity, G4), under the REAL
 * router: the website's `SessionEnded` says "Your session has ended — Sign in
 * again to carry on where you were", and its way back returns to the page. Here
 * the cover stays what being signed out looks like (BUILD-PLAN 24.11.6, the
 * owner's rule): it says why, Get started is still the way to Sign in, and the
 * sign-in returns to the screen that was open, its params with it.
 */

jest.setTimeout(60_000);

afterEach(() => {
  jest.restoreAllMocks();
});

const ENDED_TITLE = 'Your session has ended';
const ENDED_BODY = 'Sign in again to carry on where you were.';

/** What the transport does when a refresh is refused (client.ts, native-auth.ts): the keychain cleared, the end announced. */
async function endTheSession() {
  await act(async () => {
    kept.clear();
    notifySessionEnded();
  });
  await flush(1000);
}

/** The run page of the newest run, opened from Home's recent runs. */
async function openTheRun(view: Awaited<ReturnType<typeof launch>>) {
  await press('Run #4821 · posted to QuickBooks');
  expect([view.getSegments(), view.getSearchParams()]).toEqual([['(tabs)', '(home)', 'run'], { runId: 'run-0' }]);
  expectTheRun(view);
}

/**
 * The page of that run, `runId` and all: its request named in the title, its
 * summary under it. Read from the page, as a replace into the tabs gives the
 * screen its params while the address keeps none.
 */
function expectTheRun(view: Awaited<ReturnType<typeof launch>>) {
  expect(view.getSegments()).toEqual(['(tabs)', '(home)', 'run']);
  expect(screen.getByText('Run req-0')).toBeTruthy();
  // The run's subheader: its flow, the version it ran (Gate 24 parity, G18), and how it ended.
  expect(screen.getByText(/^Invoice triage · v\d+ · Run #4821 · posted to QuickBooks$/)).toBeTruthy();
}

/** The session another person's sign-in reads: theirs, not the one before. */
const SOMEONE_ELSE: Answer<'GET /v1/session'> = {
  ...SESSION,
  user: { ...SESSION.user, userId: 'u2', email: 'sam@acme.co' },
};

/** The platform: the person on this phone until a sign-in names someone else (`answers['/v1/session']`). */
function sessionFor(signedInAs: () => Answer<'GET /v1/session'>) {
  return () => {
    if (!kept.has('autom8x.access-token')) throw new PlatformError('Sign in is required.', 401, 'UNAUTHENTICATED');
    return kept.get('autom8x.access-token') === 'access-signed-in' ? signedInAs() : SESSION;
  };
}

describe('a session that ends while it is in use (Gate 24 parity, G4)', () => {
  it("on a run's page: the cover says why, over Get started, and signing in again returns to that run — its params with it", async () => {
    signedInOnThisPhone();
    answerPlatform();
    const view = await launch();
    await openTheRun(view);

    await asInProduction(async () => {
      await endTheSession();
    });
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', []]);
    const reason = screen.getByTestId('cover-session-ended');
    expect(within(reason).getByText(ENDED_TITLE)).toBeTruthy();
    expect(within(reason).getByText(ENDED_BODY)).toBeTruthy();
    expect(screen.getByText('Get started')).toBeTruthy();

    await asInProduction(async () => {
      await press('Get started');
      await press('Sign in with Google');
    });
    expectTheRun(view);

    // Ended there again, it returns there again: the params it was given are kept, not the address's.
    await asInProduction(async () => {
      await endTheSession();
      await press('Get started');
      await press('Sign in with Google');
    });
    expectTheRun(view);
  });

  it('told twice — the transport, then the re-read that met it — it still says why, and still returns', async () => {
    signedInOnThisPhone();
    answerPlatform();
    const view = await launch();
    await openTheRun(view);

    await asInProduction(async () => {
      await act(async () => {
        kept.clear();
        notifySessionEnded();
        notifySessionEnded();
      });
      await flush(1000);
    });
    expect(within(screen.getByTestId('cover-session-ended')).getByText(ENDED_TITLE)).toBeTruthy();

    await asInProduction(async () => {
      await press('Get started');
      await press('Sign in with Google');
    });
    expectTheRun(view);
  });

  it('through the Face ID question: answered, it returns to the screen the session ended on', async () => {
    // A phone with Face ID set up, so a remembered sign-in asks the question.
    const Biometrics = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
    const before = [Biometrics.hasHardwareAsync.getMockImplementation(), Biometrics.isEnrolledAsync.getMockImplementation()];
    Biometrics.hasHardwareAsync.mockImplementation(async () => true);
    Biometrics.isEnrolledAsync.mockImplementation(async () => true);
    try {
      signedInOnThisPhone();
      answerPlatform();
      const view = await launch();
      await openTheRun(view);

      await asInProduction(async () => {
        await endTheSession();
        await press('Get started');
        await press('Sign in with Google');
      });
      expect(view.getSegments()).toEqual(['(auth)', 'faceid-offer']);

      await asInProduction(async () => {
        await press('Not now');
      });
      expectTheRun(view);
    } finally {
      Biometrics.hasHardwareAsync.mockImplementation(before[0] as never);
      Biometrics.isEnrolledAsync.mockImplementation(before[1] as never);
    }
  });

  it('is owed once: signing out and in again after it opens Home', async () => {
    signedInOnThisPhone();
    answerPlatform();
    const view = await launch();
    await openTheRun(view);

    await asInProduction(async () => {
      await endTheSession();
      await press('Get started');
      await press('Sign in with Google');
    });
    expectTheRun(view);

    await asInProduction(async () => {
      await press('Settings');
      await press('Sign out');
      await fireEvent.press(within(screen.getByTestId('sign-out-dialog')).getByText('Sign out'));
      await flush(1000);
      await press('Get started');
      await press('Sign in with Google');
    });
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
  });

  it('someone else signing in after it opens Home, never the screen the session before them left', async () => {
    signedInOnThisPhone();
    answerPlatform({ '/v1/session': sessionFor(() => SOMEONE_ELSE) });
    const view = await launch();
    await openTheRun(view);

    await asInProduction(async () => {
      await endTheSession();
      await press('Get started');
      await press('Sign in with Google');
    });
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
  });

  it('the same person signing in again is owed it, read from the session the sign-in resolves', async () => {
    signedInOnThisPhone();
    answerPlatform({ '/v1/session': sessionFor(() => SESSION) });
    const view = await launch();
    await openTheRun(view);

    await asInProduction(async () => {
      await endTheSession();
      await press('Get started');
      await press('Sign in with Google');
    });
    expectTheRun(view);
  });
});

describe('no reason where the session did not end in use', () => {
  it('ended on the Face ID question — no tab screen in front — nothing is said of it, and the next sign-in opens Home', async () => {
    const Biometrics = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
    const before = [Biometrics.hasHardwareAsync.getMockImplementation(), Biometrics.isEnrolledAsync.getMockImplementation()];
    Biometrics.hasHardwareAsync.mockImplementation(async () => true);
    Biometrics.isEnrolledAsync.mockImplementation(async () => true);
    try {
      kept.clear();
      answerPlatform();
      const view = await launch();
      await asInProduction(async () => {
        await press('Get started');
        await press('Sign in with Google');
      });
      expect(view.getSegments()).toEqual(['(auth)', 'faceid-offer']);

      // The question is guarded as the tabs are: it goes, and Sign in under it shows.
      await asInProduction(async () => {
        await endTheSession();
      });
      expect(view.getSegments()).toEqual(['(auth)', 'login']);
      expect(screen.queryByText(ENDED_TITLE)).toBeNull();

      await asInProduction(async () => {
        await press('Sign in with Google');
        await press('Not now');
      });
      expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
    } finally {
      Biometrics.hasHardwareAsync.mockImplementation(before[0] as never);
      Biometrics.isEnrolledAsync.mockImplementation(before[1] as never);
    }
  });

  it('Sign out on purpose: the cover says nothing of an ended session, and signing in again opens Home', async () => {
    signedInOnThisPhone();
    answerPlatform();
    const view = await launch();
    await openTheRun(view);

    await asInProduction(async () => {
      await press('Settings');
      await press('Sign out');
      await fireEvent.press(within(screen.getByTestId('sign-out-dialog')).getByText('Sign out'));
      await flush(1000);
    });
    expect(screen.getByText('Get started')).toBeTruthy();
    expect(screen.queryByText(ENDED_TITLE)).toBeNull();

    await asInProduction(async () => {
      await press('Get started');
      await press('Sign in with Google');
    });
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
  });

  it('a 401 landing while signing out on purpose owes nothing: signing in again opens Home', async () => {
    signedInOnThisPhone();
    answerPlatform({
      '/v1/auth/logout': () => {
        // Another read met the dead credential while the logout was in flight.
        notifySessionEnded();
        return null;
      },
    });
    const view = await launch();
    await openTheRun(view);

    await asInProduction(async () => {
      await press('Settings');
      await press('Sign out');
      await fireEvent.press(within(screen.getByTestId('sign-out-dialog')).getByText('Sign out'));
      await flush(1000);
    });
    expect(screen.getByText('Get started')).toBeTruthy();
    expect(screen.queryByText(ENDED_TITLE)).toBeNull();

    await asInProduction(async () => {
      await press('Get started');
      await press('Sign in with Google');
    });
    expect([view.getPathname(), view.getSegments()]).toEqual(['/', ['(tabs)', '(home)']]);
  });

  it('a cold start whose stored session is refused opens the cover with no reason: nothing was open', async () => {
    signedInOnThisPhone();
    answerPlatform({
      '/v1/session': () => {
        // The transport's answer to a refresh it could not make: cleared, announced, refused.
        kept.clear();
        notifySessionEnded();
        throw new PlatformError('Sign in is required.', 401, 'UNAUTHENTICATED');
      },
    });
    const view = await launch();

    expect([view.getPathname(), view.getSegments()]).toEqual(['/', []]);
    expect(screen.getByText('Get started')).toBeTruthy();
    expect(screen.queryByText(ENDED_TITLE)).toBeNull();
  });
});
