import React from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SessionProvider, useSession } from '@/hooks/use-session';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';

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
}));

jest.mock('@/lib/platform/native-auth', () => ({
  refreshSession: jest.fn(),
  signInWithProvider: jest.fn(),
  signOut: jest.fn(),
}));

const { platformOperation } = jest.requireMock('@/lib/platform/client');
const { readSession, clearSession } = jest.requireMock('@/lib/platform/session-store');
const { refreshSession } = jest.requireMock('@/lib/platform/native-auth');

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

  it('does not mistake a 403 for a sign-out', async () => {
    // Being forbidden is not being unauthenticated; signing out would hide the
    // reason rather than surface it.
    expect(
      await statusAfter(async () => {
        throw new PlatformError('You are not allowed to complete this action.', 403, 'FORBIDDEN');
      }),
    ).toBe('status:unavailable');
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
