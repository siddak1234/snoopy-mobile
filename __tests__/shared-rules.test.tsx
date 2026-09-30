import React from 'react';
import { Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { SessionContext, workspaceIfShown, type SessionContextValue } from '@/hooks/use-session';
import { MOVE_REFUSALS, WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { PlatformError } from '@/lib/platform/problem';
import { administers } from '@/lib/view/roles';

/**
 * The rules every Round 16 screen leans on (BUILD-PLAN 24.3.6). Each is small,
 * and each is the one place its decision lives, so each is held here once.
 */

jest.mock('@/lib/platform/client', () => {
  let n = 0;
  return { newIdempotencyKey: jest.fn((prefix: string) => `${prefix}-${++n}`) };
});

function signedIn(activeWorkspaceId: string | null): SessionContextValue {
  return {
    status: 'signed-in',
    session: {
      authenticated: true,
      user: { userId: 'u1', email: 'person@example.test', activeWorkspaceId },
      workspaces: [{ id: 'w1', name: 'One', type: 'personal', role: 'owner' }],
    },
    refresh: jest.fn(),
    reload: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  } as unknown as SessionContextValue;
}

describe('administers', () => {
  it('is owner or admin, as the Edge decides, and never a member', () => {
    expect(administers('owner')).toBe(true);
    expect(administers('admin')).toBe(true);
    expect(administers('member')).toBe(false);
    expect(administers(undefined)).toBe(false);
    expect(administers(null)).toBe(false);
  });
});

describe('workspaceIfShown', () => {
  it('answers the active workspace only while it is the one the screen loaded', () => {
    expect(workspaceIfShown(signedIn('w1'), 'w1')).toBe('w1');
    expect(workspaceIfShown(signedIn('w2'), 'w1')).toBeNull();
    expect(workspaceIfShown(signedIn('w1'), null)).toBeNull();
    expect(workspaceIfShown({ status: 'signed-out' }, 'w1')).toBeNull();
  });
});

describe('refusalMessage', () => {
  it('says a listed reason in words, and otherwise the platform’s own message', () => {
    const pending = new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'approvals_pending' });
    expect(refusalMessage(pending, MOVE_REFUSALS)).toBe(MOVE_REFUSALS.approvals_pending);

    const unlisted = new PlatformError('Over the plan limit', 403, 'FORBIDDEN', { reason: 'other' });
    expect(refusalMessage(unlisted, MOVE_REFUSALS)).toBe('Over the plan limit');

    // An inherited name is not a listed reason.
    const inherited = new PlatformError('Refused', 409, 'CONFLICT', { reason: 'toString' });
    expect(refusalMessage(inherited, MOVE_REFUSALS)).toBe('Refused');

    expect(refusalMessage('not an error')).toBe('That did not work. Try again.');
    expect(WORKSPACE_CHANGED).toMatch(/Reload this screen/);
  });
});

describe('useIntentKeys', () => {
  function Keys({ onKeys }: { onKeys: (keys: ReturnType<typeof useIntentKeys>) => void }) {
    onKeys(useIntentKeys('pause'));
    return null;
  }

  it('keeps one key per intent until it settles, and separates scopes', async () => {
    let keys!: ReturnType<typeof useIntentKeys>;
    await render(<Keys onKeys={(value) => (keys = value)} />);

    const first = keys.keyFor('sub-1');
    expect(keys.keyFor('sub-1')).toBe(first); // a retry of the same intent
    expect(keys.keyFor('sub-2')).not.toBe(first); // another thing, another key
    keys.settle('sub-1');
    expect(keys.keyFor('sub-1')).not.toBe(first); // a new intent after success
  });
});

describe('useWorkspaceResource', () => {
  function Probe() {
    const resource = useWorkspaceResource(async (workspaceId) => `data for ${workspaceId}`);
    return <Text>{`${resource.status}:${resource.loadedFor ?? 'none'}`}</Text>;
  }

  it('keeps the label of the data on screen when an older read finishes last', async () => {
    const pending: Record<string, (value: string) => void> = {};
    function Switching() {
      const resource = useWorkspaceResource(
        (workspaceId) => new Promise<string>((resolve) => (pending[workspaceId] = resolve)),
      );
      return (
        <Text>{`${resource.status}:${resource.status === 'ready' ? resource.data : ''}:${resource.loadedFor ?? 'none'}`}</Text>
      );
    }
    const view = await render(
      <SessionContext.Provider value={signedIn('w1')}>
        <Switching />
      </SessionContext.Provider>,
    );
    // Switch before w1's read answers; w2's answers first, then w1's, late.
    await view.rerender(
      <SessionContext.Provider value={signedIn('w2')}>
        <Switching />
      </SessionContext.Provider>,
    );
    await act(async () => pending.w2!('data for w2'));
    await waitFor(() => expect(screen.getByText('ready:data for w2:w2')).toBeTruthy());
    await act(async () => pending.w1!('data for w1'));
    // The stale answer is dropped, and it must not relabel w2's data as w1's —
    // on this render or the next one anything else causes.
    await view.rerender(
      <SessionContext.Provider value={signedIn('w2')}>
        <Switching />
      </SessionContext.Provider>,
    );
    expect(screen.getByText('ready:data for w2:w2')).toBeTruthy();
    expect(workspaceIfShown(signedIn('w2'), 'w2')).toBe('w2');
  });

  it('reports the workspace its data was read for, once it is ready', async () => {
    await render(
      <SessionContext.Provider value={signedIn('w1')}>
        <Probe />
      </SessionContext.Provider>,
    );
    await waitFor(() => expect(screen.getByText('ready:w1')).toBeTruthy());
  });
});
