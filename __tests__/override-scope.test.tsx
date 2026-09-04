import React from 'react';
import { Text, Pressable } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import {
  SessionContext,
  overrideScopeKey,
  type SessionContextValue,
  type SessionState,
} from '@/hooks/use-session';
import { SolutionsProvider, useSolutions } from '@/hooks/use-solutions';
import { WorkflowsProvider, useWorkflows } from '@/hooks/use-workflows';

/**
 * Local overrides belong to one person in one workspace.
 *
 * `SolutionsProvider` and `WorkflowsProvider` are mounted above the route tree
 * in `app/_layout.tsx`, so they survive a sign-out. Each had exactly one write
 * site and no clear site, which meant the overrides one account accumulated
 * were still layered over the next account's catalog in the same app process —
 * and a workspace switch applied one tenant's local state to another tenant's
 * ids. Every case here fails against the previous providers.
 */

function sessionFor(state: SessionState): SessionContextValue {
  return {
    ...state,
    refresh: () => {},
    reload: async () => ({ status: 'signed-in' as const }),
    signIn: async () => ({ status: 'unconfigured', message: '' }),
    signOut: async () => ({ revoked: true }),
  } as SessionContextValue;
}

function signedIn(userId: string, workspaceId: string): SessionContextValue {
  return sessionFor({
    status: 'signed-in',
    session: {
      authenticated: true,
      user: { userId, email: `${userId}@example.test`, activeWorkspaceId: workspaceId },
      workspaces: [{ id: workspaceId, name: 'Acme', role: 'owner' }],
    },
  } as unknown as SessionState);
}

const SIGNED_OUT = sessionFor({ status: 'signed-out' });

describe('overrideScopeKey', () => {
  it('changes when the person changes', () => {
    expect(overrideScopeKey(signedIn('user-a', 'ws-1'))).not.toBe(
      overrideScopeKey(signedIn('user-b', 'ws-1')),
    );
  });

  it('changes when the workspace changes, because ids are workspace-scoped', () => {
    expect(overrideScopeKey(signedIn('user-a', 'ws-1'))).not.toBe(
      overrideScopeKey(signedIn('user-a', 'ws-2')),
    );
  });

  it('collapses every signed-out state to one scope', () => {
    expect(overrideScopeKey(SIGNED_OUT)).toBe('signed-out');
    expect(overrideScopeKey(sessionFor({ status: 'restoring' }))).toBe('signed-out');
    expect(overrideScopeKey(sessionFor({ status: 'unconfigured' }))).toBe('signed-out');
  });

  it('is stable for an unchanged session, so overrides are not cleared on every render', () => {
    expect(overrideScopeKey(signedIn('user-a', 'ws-1'))).toBe(
      overrideScopeKey(signedIn('user-a', 'ws-1')),
    );
  });
});

function SolutionProbe() {
  const { isActive, toggle, setActive, totals } = useSolutions();
  const { activeCount } = totals([{ templateId: 'tpl.invoice', price: 49, subscribed: true }]);
  return (
    <>
      <Text testID="solution">{String(isActive('tpl.invoice', true))}</Text>
      <Text testID="active-count">{String(activeCount)}</Text>
      <Pressable testID="toggle-solution" onPress={() => toggle('tpl.invoice', true)}>
        <Text>toggle</Text>
      </Pressable>
      <Pressable testID="pause-solution" onPress={() => setActive('tpl.invoice', false)}>
        <Text>pause</Text>
      </Pressable>
      <Pressable testID="activate-solution" onPress={() => setActive('tpl.invoice', true)}>
        <Text>activate</Text>
      </Pressable>
    </>
  );
}

function WorkflowProbe() {
  const { status, toggle } = useWorkflows();
  return (
    <>
      <Text testID="workflow">{status('sub-1', 'Live')}</Text>
      <Pressable testID="toggle-workflow" onPress={() => toggle('sub-1', 'Live')}>
        <Text>toggle</Text>
      </Pressable>
    </>
  );
}

function tree(session: SessionContextValue) {
  return (
    <SessionContext.Provider value={session}>
      <SolutionsProvider>
        <WorkflowsProvider>
          <SolutionProbe />
          <WorkflowProbe />
        </WorkflowsProvider>
      </SolutionsProvider>
    </SessionContext.Provider>
  );
}

/** RTL v14 render is async in this project — always await it. */
async function mount(session: SessionContextValue) {
  return await render(tree(session));
}

describe('overrides do not outlive their scope', () => {
  it('drops a solution override on sign-out, so the next account starts clean', async () => {
    const { rerender } = await mount(signedIn('user-a', 'ws-1'));

    await fireEvent.press(screen.getByTestId('toggle-solution'));
    expect(screen.getByTestId('solution')).toHaveTextContent('false');

    rerender(tree(SIGNED_OUT));
    // Back to the server's own answer, not the previous account's override.
    // The reset is an effect, so it lands on the commit after the rerender.
    await waitFor(() => expect(screen.getByTestId('solution')).toHaveTextContent('true'));
  });

  it('drops a workflow override when the workspace changes', async () => {
    const { rerender } = await mount(signedIn('user-a', 'ws-1'));

    await fireEvent.press(screen.getByTestId('toggle-workflow'));
    expect(screen.getByTestId('workflow')).toHaveTextContent('Paused');

    rerender(tree(signedIn('user-a', 'ws-2')));
    await waitFor(() => expect(screen.getByTestId('workflow')).toHaveTextContent('Live'));
  });

  it('keeps an override while the scope is unchanged', async () => {
    const { rerender } = await mount(signedIn('user-a', 'ws-1'));

    await fireEvent.press(screen.getByTestId('toggle-solution'));
    rerender(tree(signedIn('user-a', 'ws-1')));
    expect(screen.getByTestId('solution')).toHaveTextContent('false');
  });
});

/**
 * A mutation the platform accepted states the plan membership; it does not
 * flip it. Found live on 2026-09-03: the marketplace's pause set the override
 * to false, the setup screen's Activate never set it back, and Settings
 * counted "0 active" against a subscription the database showed as `live`.
 */
describe('an accepted activation supersedes an earlier pause override', () => {
  it('counts the solution active again after pause, then activate', async () => {
    await mount(signedIn('user-a', 'ws-1'));
    expect(screen.getByTestId('active-count')).toHaveTextContent('1');

    await fireEvent.press(screen.getByTestId('pause-solution'));
    expect(screen.getByTestId('solution')).toHaveTextContent('false');
    expect(screen.getByTestId('active-count')).toHaveTextContent('0');

    await fireEvent.press(screen.getByTestId('activate-solution'));
    expect(screen.getByTestId('solution')).toHaveTextContent('true');
    expect(screen.getByTestId('active-count')).toHaveTextContent('1');
  });

  it('states false on a repeated pause instead of flipping back to true', async () => {
    // `toggle` after a pause would have flipped an already-false override to
    // true; `setActive(false)` cannot.
    await mount(signedIn('user-a', 'ws-1'));
    await fireEvent.press(screen.getByTestId('pause-solution'));
    await fireEvent.press(screen.getByTestId('pause-solution'));
    expect(screen.getByTestId('solution')).toHaveTextContent('false');
  });
});
