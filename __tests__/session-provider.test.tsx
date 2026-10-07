import React from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { FaceIdRow } from '@/components/settings/face-id-row';
import { SessionProvider, useSession } from '@/hooks/use-session';
import { NocturneThemeProvider } from '@/hooks/use-theme';
import {
  PlatformError,
  PlatformNotConfiguredError,
  PlatformRateLimitedError,
} from '@/lib/platform/problem';
import { readWorkspaces } from '@/lib/platform/workspaces';
import { coverPlaysEntrance, resetCoverEntranceForTests } from '@/lib/view/cover-entrance';

/**
 * How a failed session request is classified.
 *
 * This is the input to the route guard, so the distinctions are load-bearing:
 * only a 401 may lock the app, and neither an unconfigured build nor an
 * unreachable backend may be mistaken for one.
 */

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));

jest.mock('@/lib/platform/session-store', () => ({
  readSession: jest.fn(),
  clearSession: jest.fn(),
  readRememberSession: jest.fn(async () => true),
  writeRememberSession: jest.fn(async () => undefined),
  readFaceIdEnabled: jest.fn(async () => false),
  writeFaceIdEnabled: jest.fn(async () => undefined),
}));

jest.mock('@/lib/platform/native-auth', () => ({
  refreshSession: jest.fn(),
  signInWithProvider: jest.fn(),
  signOut: jest.fn(),
}));

const { platformOperation } = jest.requireMock('@/lib/platform/client');
const { readSession, clearSession, readRememberSession, readFaceIdEnabled, writeFaceIdEnabled } =
  jest.requireMock('@/lib/platform/session-store');
const { refreshSession, signInWithProvider, signOut } = jest.requireMock('@/lib/platform/native-auth');

function Probe() {
  const session = useSession();
  return <Text>{`status:${session.status}`}</Text>;
}

async function statusAfter(behaviour: () => Promise<unknown>) {
  platformOperation.mockImplementation(behaviour);
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await waitFor(() => expect(screen.queryByText('status:restoring')).toBeNull());
  return screen.getByText(/^status:/).props.children;
}

beforeEach(() => {
  platformOperation.mockReset();
  readSession.mockReset().mockResolvedValue(null);
  clearSession.mockReset().mockResolvedValue(undefined);
  readRememberSession.mockReset().mockResolvedValue(true);
  readFaceIdEnabled.mockReset().mockResolvedValue(false);
  writeFaceIdEnabled.mockReset().mockResolvedValue(undefined);
  refreshSession.mockReset().mockResolvedValue({ status: 'refreshed' });
});

describe('SessionProvider', () => {
  it('is signed-in when the Edge answers a session', async () => {
    expect(
      await statusAfter(async () => ({
        authenticated: true,
        user: { userId: 'u1', email: 'dana@northwind.example' },
        workspaces: [],
      })),
    ).toBe('status:signed-in');
  });

  it('is signed-out only on a 401', async () => {
    expect(
      await statusAfter(async () => {
        throw new PlatformError('Sign in is required.', 401, 'UNAUTHENTICATED');
      }),
    ).toBe('status:signed-out');
  });

  it('is unconfigured when no backend origin is set', async () => {
    // The design prototype's normal state. Must not read as a sign-out, or the
    // UI this round protects becomes unreachable.
    expect(
      await statusAfter(async () => {
        throw new PlatformNotConfiguredError();
      }),
    ).toBe('status:unconfigured');
  });

  it('is unavailable when a configured backend does not answer', async () => {
    expect(
      await statusAfter(async () => {
        throw new PlatformError('The platform is unreachable', 502);
      }),
    ).toBe('status:unavailable');
  });

  it('stops after an expired-session refresh outage without clearing or probing session', async () => {
    readSession.mockResolvedValue({
      accessToken: 'expired-access',
      refreshToken: 'preserved-refresh',
      expiresAt: 0,
    });
    refreshSession.mockResolvedValue({
      status: 'unavailable',
      message: 'The identity provider could not be reached.',
    });

    expect(await statusAfter(jest.fn())).toBe('status:unavailable');
    expect(platformOperation).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('stops after a refresh 401 instead of probing session with a cleared credential', async () => {
    readSession.mockResolvedValue({
      accessToken: 'expired-access',
      refreshToken: 'dead-refresh',
      expiresAt: 0,
    });
    refreshSession.mockResolvedValue({ status: 'signed-out' });

    expect(await statusAfter(jest.fn())).toBe('status:signed-out');
    expect(platformOperation).not.toHaveBeenCalled();
  });

  it('ends a session the person chose not to remember at the next cold start, keeping nothing', async () => {
    // Remember me off (24.7.3 attempt 4): the session lasted until the app was
    // closed. The stored credential is cleared before any refresh or probe.
    readSession.mockResolvedValue({
      accessToken: 'live-access',
      refreshToken: 'live-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    readRememberSession.mockResolvedValue(false);

    expect(await statusAfter(jest.fn())).toBe('status:signed-out');
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(platformOperation).not.toHaveBeenCalled();
  });

  it('does not mistake a 403 for a sign-out', async () => {
    // Being forbidden is not being unauthenticated; signing out would hide the
    // reason rather than surface it.
    expect(
      await statusAfter(async () => {
        throw new PlatformError('You are not allowed to complete this action.', 403, 'FORBIDDEN');
      }),
    ).toBe('status:unavailable');
  });

  it('does not mistake a 429 for a sign-out, and keeps the stored credential', async () => {
    // BUILD-PLAN 24.3.3, backend §12.1 #114: "busy" is the platform asking to be
    // left for a while. The web read it as "no session" once (§12.1 #160).
    expect(
      await statusAfter(async () => {
        throw new PlatformRateLimitedError('The platform is busy right now. Try again in 30 seconds.', 30);
      }),
    ).toBe('status:unavailable');
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('starts by restoring rather than assuming either answer', async () => {
    platformOperation.mockImplementation(() => new Promise(() => {}));
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByText('status:restoring')).toBeTruthy();
  });
});

/**
 * `reload()` — a re-read of `/v1/session` while signed in.
 *
 * Added for the workspace switcher: after `PATCH /v1/session/active-workspace`
 * succeeds the screens must follow the server's active workspace, which only a
 * fresh session read can state. `refresh()` would do that by re-running the
 * launch sequence, and its classification of a failed read as `unavailable`
 * fails the tab guard closed — correct at launch, an ejection after a mutation
 * that landed. So the distinction pinned here is that an outage leaves the
 * resolved session in force, and only a 401 ends it.
 */
function sessionFor(workspaceId: string) {
  return {
    authenticated: true,
    user: { userId: 'u1', email: 'dana@northwind.example', activeWorkspaceId: workspaceId },
    workspaces: [],
  };
}

const outcomes: unknown[] = [];

function ReloadProbe() {
  const session = useSession();
  return (
    <>
      <Text>{`status:${session.status}`}</Text>
      <Text>{`workspace:${session.status === 'signed-in' ? session.session.user.activeWorkspaceId : '-'}`}</Text>
      <Pressable testID="reload" onPress={() => void session.reload().then((o) => outcomes.push(o))}>
        <Text>reload</Text>
      </Pressable>
    </>
  );
}

async function signedInProbe() {
  platformOperation.mockResolvedValue(sessionFor('ws-1'));
  await render(
    <SessionProvider>
      <ReloadProbe />
    </SessionProvider>,
  );
  await screen.findByText('status:signed-in');
  expect(screen.getByText('workspace:ws-1')).toBeTruthy();
}

describe('SessionProvider.reload', () => {
  beforeEach(() => {
    outcomes.length = 0;
  });

  it('adopts the platform\'s answer without passing through restoring', async () => {
    await signedInProbe();
    platformOperation.mockResolvedValue(sessionFor('ws-2'));

    await fireEvent.press(screen.getByTestId('reload'));

    await waitFor(() => expect(screen.getByText('workspace:ws-2')).toBeTruthy());
    expect(screen.queryByText('status:restoring')).toBeNull();
    expect(outcomes).toEqual([{ status: 'signed-in' }]);
  });

  it('keeps the resolved session through an outage, and says so', async () => {
    await signedInProbe();
    platformOperation.mockRejectedValue(new PlatformError('The platform is unreachable', 502));

    await fireEvent.press(screen.getByTestId('reload'));

    await waitFor(() =>
      expect(outcomes).toEqual([{ status: 'unavailable', message: 'The platform is unreachable' }]),
    );
    expect(screen.getByText('status:signed-in')).toBeTruthy();
    expect(screen.getByText('workspace:ws-1')).toBeTruthy();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('ends the session only on a 401, which is the credential\'s final answer', async () => {
    await signedInProbe();
    platformOperation.mockRejectedValue(new PlatformError('Sign in is required.', 401, 'UNAUTHENTICATED'));

    await fireEvent.press(screen.getByTestId('reload'));

    await waitFor(() => expect(screen.getByText('status:signed-out')).toBeTruthy());
    expect(clearSession).toHaveBeenCalled();
    expect(outcomes).toEqual([{ status: 'signed-out' }]);
  });
});

/**
 * The shared snapshot (24.9.1) belongs to one session (24.12). Its global
 * entries — the workspace list, the providers — would otherwise answer the next
 * account on this device for up to their 120 s window: it is emptied when a
 * session ends and when one begins, so the next read is a real request.
 */
describe('SessionProvider and the shared snapshot', () => {
  const listReads = () =>
    platformOperation.mock.calls.filter(([path]: [string]) => path === '/v1/workspaces').length;
  /** What each sign-in answered, once it has finished. */
  const signIns: unknown[] = [];
  beforeEach(() => {
    signIns.length = 0;
  });

  function SnapshotProbe() {
    const session = useSession();
    return (
      <>
        <Text>{`status:${session.status}`}</Text>
        <Pressable testID="sign-out" onPress={() => void session.signOut()}>
          <Text>sign out</Text>
        </Pressable>
        <Pressable testID="sign-in" onPress={() => void session.signIn('google').then((o) => signIns.push(o))}>
          <Text>sign in</Text>
        </Pressable>
        <Pressable testID="reload" onPress={() => void session.reload()}>
          <Text>reload</Text>
        </Pressable>
      </>
    );
  }

  /** Signed in, with the workspace list read once and answered from the snapshot after. */
  async function signedInWithAList() {
    platformOperation.mockImplementation(async (path: string) =>
      path === '/v1/workspaces' ? { workspaces: [], activeWorkspaceId: 'ws-1' } : sessionFor('ws-1'),
    );
    await render(
      <SessionProvider>
        <SnapshotProbe />
      </SessionProvider>,
    );
    await screen.findByText('status:signed-in');
    await readWorkspaces();
    await readWorkspaces();
    expect(listReads()).toBe(1);
  }

  it('is emptied by a sign-out the platform revoked', async () => {
    await signedInWithAList();
    signOut.mockResolvedValue({ revoked: true });
    await fireEvent.press(screen.getByTestId('sign-out'));
    await screen.findByText('status:signed-out');
    await readWorkspaces();
    expect(listReads()).toBe(2);
  });

  it('marks the cover to be shown at once after a sign-out that revoked, and only then (build 13 decision 1)', async () => {
    resetCoverEntranceForTests();
    await signedInWithAList();
    signOut.mockResolvedValueOnce({ revoked: false });
    await fireEvent.press(screen.getByTestId('sign-out'));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(coverPlaysEntrance()).toBe(true);
    signOut.mockResolvedValueOnce({ revoked: true });
    await fireEvent.press(screen.getByTestId('sign-out'));
    await screen.findByText('status:signed-out');
    expect(coverPlaysEntrance()).toBe(false);
    resetCoverEntranceForTests();
  });

  it('is emptied when a session ends by itself (a 401 on a re-read)', async () => {
    await signedInWithAList();
    platformOperation.mockImplementation(async (path: string) => {
      if (path === '/v1/workspaces') return { workspaces: [], activeWorkspaceId: 'ws-1' };
      throw new PlatformError('Sign in is required.', 401, 'UNAUTHENTICATED');
    });
    await fireEvent.press(screen.getByTestId('reload'));
    await screen.findByText('status:signed-out');
    await readWorkspaces();
    expect(listReads()).toBe(2);
  });

  it('is emptied when a new session begins', async () => {
    await signedInWithAList();
    signInWithProvider.mockResolvedValue({ status: 'signed-in' });
    await fireEvent.press(screen.getByTestId('sign-in'));
    await waitFor(() => expect(signIns).toEqual([{ status: 'signed-in' }]));
    expect(signInWithProvider).toHaveBeenCalledWith('google');
    await readWorkspaces();
    expect(listReads()).toBe(2);
  });
});

/**
 * The Face ID lock (the build 13 review): `locked` is what the root guard reads
 * beside `signed-in`. A cold start locks a stored session whose owner turned
 * Face ID on — from the first render, so the guard never opens on a guess — and
 * the lock's own check, a sign-in, or Face ID turned off opens it; only the next
 * cold start locks it again. Where the guard then lands is the real-router
 * project's (`__tests__/real-router/face-id-lock.test.tsx`).
 */
describe('SessionProvider: the Face ID lock', () => {
  /** Every render's status and lock, in order. */
  const drawn: string[] = [];

  function LockProbe() {
    const session = useSession();
    drawn.push(`${session.status} ${session.locked ? 'locked' : 'open'}`);
    return (
      <>
        <Text>{`${session.status} ${session.locked ? 'locked' : 'open'}`}</Text>
        <Pressable testID="unlock" onPress={() => session.unlock()}>
          <Text>unlock</Text>
        </Pressable>
        <Pressable testID="refresh" onPress={() => session.refresh()}>
          <Text>refresh</Text>
        </Pressable>
        <Pressable testID="sign-in" onPress={() => void session.signIn('google')}>
          <Text>sign in</Text>
        </Pressable>
      </>
    );
  }

  /** A remembered session this phone holds, its owner's Face ID choice, and the platform answering it. */
  function storedSession(faceId: boolean) {
    readSession.mockResolvedValue({
      accessToken: 'live-access',
      refreshToken: 'live-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    readFaceIdEnabled.mockResolvedValue(faceId);
    platformOperation.mockResolvedValue(sessionFor('ws-1'));
  }

  /** A cold start: the provider mounts and restores. */
  async function coldStart(children: React.ReactNode = <LockProbe />) {
    const view = await render(
      <NocturneThemeProvider>
        <SessionProvider>{children}</SessionProvider>
      </NocturneThemeProvider>,
    );
    await screen.findByText(/^signed-in /u);
    return view;
  }

  beforeEach(() => {
    drawn.length = 0;
  });

  it('locks a stored session whose owner turned Face ID on from the first render: never once signed in and open', async () => {
    storedSession(true);
    await coldStart();
    expect(screen.getByText('signed-in locked')).toBeTruthy();
    expect(drawn[0]).toBe('restoring locked');
    expect(drawn).not.toContain('signed-in open');
  });

  it('with Face ID off, a stored session is open', async () => {
    storedSession(false);
    await coldStart();
    expect(screen.getByText('signed-in open')).toBeTruthy();
  });

  it("the lock's check opens it, a later refresh does not lock it again, and the next cold start does", async () => {
    storedSession(true);
    const first = await coldStart();
    expect(screen.getByText('signed-in locked')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unlock'));
    expect(screen.getByText('signed-in open')).toBeTruthy();

    // A refresh re-runs the launch's reads, and is not a cold start: what it
    // draws, once its session read has answered, is open.
    const before = drawn.length;
    await fireEvent.press(screen.getByTestId('refresh'));
    await waitFor(() => expect(platformOperation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(drawn.length).toBeGreaterThan(before));
    expect(drawn.slice(before)).toEqual(['signed-in open']);

    await first.unmount();
    await coldStart();
    expect(screen.getByText('signed-in locked')).toBeTruthy();
  });

  it('a sign-in opens a locked session: it is its own proof', async () => {
    storedSession(true);
    await coldStart();
    expect(screen.getByText('signed-in locked')).toBeTruthy();
    signInWithProvider.mockResolvedValue({ status: 'signed-in' });
    await fireEvent.press(screen.getByTestId('sign-in'));
    await waitFor(() => expect(screen.getByText('signed-in open')).toBeTruthy());
  });

  it('a sign-in after a cold start that ended signed out decides the lock: a refresh does not lock it, though Face ID was turned on since', async () => {
    // The cold start finds no session: signed out, and nothing decided.
    platformOperation.mockRejectedValue(new PlatformError('Sign in is required.', 401, 'UNAUTHENTICATED'));
    await render(
      <SessionProvider>
        <LockProbe />
      </SessionProvider>,
    );
    await screen.findByText(/^signed-out /u);

    signInWithProvider.mockResolvedValue({ status: 'signed-in' });
    platformOperation.mockReset().mockResolvedValue(sessionFor('ws-1'));
    await fireEvent.press(screen.getByTestId('sign-in'));
    await screen.findByText('signed-in open');

    // The new session is kept, and its owner turned Face ID on (the question after a sign-in).
    storedSession(true);
    const before = drawn.length;
    await fireEvent.press(screen.getByTestId('refresh'));
    await waitFor(() => expect(platformOperation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(drawn.length).toBeGreaterThan(before));
    expect(drawn.slice(before)).toEqual(['signed-in open']);
  });

  it("turning Face ID off on Settings' row opens a locked session", async () => {
    storedSession(true);
    await coldStart(
      <>
        <LockProbe />
        <FaceIdRow />
      </>,
    );
    expect(screen.getByText('signed-in locked')).toBeTruthy();
    // The row reads the choice it shows from the keychain: on.
    await waitFor(() => expect(screen.getByRole('switch').props.accessibilityState).toMatchObject({ checked: true }));

    await fireEvent.press(screen.getByRole('switch'));
    await waitFor(() => expect(writeFaceIdEnabled).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.getByText('signed-in open')).toBeTruthy());
  });
});
