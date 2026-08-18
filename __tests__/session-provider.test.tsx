import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';

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
