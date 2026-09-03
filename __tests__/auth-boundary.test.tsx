import React from 'react';

import TabLayout from '@/app/(tabs)/_layout';
import type { SessionContextValue, SessionState } from '@/hooks/use-session';
import { activeWorkspaceId } from '@/hooks/use-session';
import { mockRedirect, renderWithProviders } from '@/test/render';

/**
 * The protected-route boundary.
 *
 * `DESIGN-CONTRACT.md` requires it at the route/layout level, and requires that
 * nothing reaches a protected route before `signed-in`. What makes this worth
 * its own suite is that only one of the four non-authenticated states is an
 * authentication failure; every non-authenticated state must still fail closed.
 */

function withSession(state: SessionState): SessionContextValue {
  return {
    ...state,
    refresh: () => {},
    reload: async () => ({ status: 'signed-in' as const }),
    signIn: async () => ({ status: 'cancelled' }),
    signOut: async () => ({ revoked: true }),
  };
}

const signedIn = withSession({
  status: 'signed-in',
  session: {
    authenticated: true,
    user: {
      userId: 'c1a9e7d2-4f30-4b8a-9e51-77c0d3f21a08',
      email: 'dana@northwind.example',
      activeWorkspaceId: '5e4d1b90-2c77-4f16-8a03-9d61e4b7c520',
    },
    workspaces: [
      {
        id: '5e4d1b90-2c77-4f16-8a03-9d61e4b7c520',
        name: 'Northwind Trading',
        type: 'organization',
        role: 'owner',
      },
    ],
  },
});

describe('tab route guard', () => {
  it('sends a signed-out visitor back to the auth stack', async () => {
    // A 401 from a reachable Edge is the one state that closes the guard.
    await renderWithProviders(<TabLayout />, withSession({ status: 'signed-out' }));
    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/welcome');
  });

  it('admits a signed-in visitor', async () => {
    await renderWithProviders(<TabLayout />, signedIn);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('fails closed when no backend is configured', async () => {
    await renderWithProviders(<TabLayout />, withSession({ status: 'unconfigured' }));
    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/welcome');
  });

  it('does not expose protected routes while the backend is unreachable', async () => {
    await renderWithProviders(
      <TabLayout />,
      withSession({ status: 'unavailable', message: 'The platform is unreachable' }),
    );
    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/welcome');
  });

  it('does not flash a redirect while the session is still restoring', async () => {
    await renderWithProviders(<TabLayout />, withSession({ status: 'restoring' }));
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe('activeWorkspaceId', () => {
  it('prefers the session’s active selection', () => {
    expect(activeWorkspaceId(signedIn)).toBe('5e4d1b90-2c77-4f16-8a03-9d61e4b7c520');
  });

  it('falls back to the first membership when nothing is selected', () => {
    const noSelection = withSession({
      status: 'signed-in',
      session: {
        authenticated: true,
        user: { userId: 'u1', email: 'dana@northwind.example' },
        workspaces: [
          { id: 'w1', name: 'Personal', type: 'personal', role: 'owner' },
          { id: 'w2', name: 'Northwind', type: 'organization', role: 'member' },
        ],
      },
    });
    expect(activeWorkspaceId(noSelection)).toBe('w1');
  });

  it('has no workspace to read when there is no session', () => {
    expect(activeWorkspaceId(withSession({ status: 'signed-out' }))).toBeNull();
    expect(activeWorkspaceId(withSession({ status: 'unconfigured' }))).toBeNull();
  });

  it('answers null rather than inventing a workspace for a member of none', () => {
    const noMemberships = withSession({
      status: 'signed-in',
      session: {
        authenticated: true,
        user: { userId: 'u1', email: 'dana@northwind.example' },
        workspaces: [],
      },
    });
    expect(activeWorkspaceId(noMemberships)).toBeNull();
  });
});
