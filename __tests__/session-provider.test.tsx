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

jest.mock('@/lib/platform/client', () => ({ platformJson: jest.fn() }));

const { platformJson } = jest.requireMock('@/lib/platform/client');

function Probe() {
  const session = useSession();
  return <Text>{`status:${session.status}`}</Text>;
}

async function statusAfter(behaviour: () => Promise<unknown>) {
  platformJson.mockImplementation(behaviour);
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await waitFor(() => expect(screen.queryByText('status:restoring')).toBeNull());
  return screen.getByText(/^status:/).props.children;
}

beforeEach(() => {
  platformJson.mockReset();
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
    platformJson.mockImplementation(() => new Promise(() => {}));
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByText('status:restoring')).toBeTruthy();
  });
});
