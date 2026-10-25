import { act, screen } from '@testing-library/react-native';
import React, { useState } from 'react';

import RunDetailScreen from '@/app/(tabs)/activity/run';
import RunDetailsScreen from '@/app/(tabs)/activity/run-details';
import { SessionContext, type SessionContextValue } from '@/hooks/use-session';
import { TEST_WORKSPACE, routePlatform, signedInSession } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

const OTHER = '99999999-9999-4999-8999-999999999999';

/** The session the screen sees, switchable mid-test as the switcher does. */
let switchTo: (next: SessionContextValue) => void = () => undefined;
function Switchable({ Page }: { Page: React.ComponentType }) {
  const [session, setSession] = useState<SessionContextValue>(signedInSession);
  switchTo = setSession;
  return (
    <SessionContext.Provider value={session}>
      <Page />
    </SessionContext.Provider>
  );
}

function activeIn(workspaceId: string): SessionContextValue {
  if (signedInSession.status !== 'signed-in') throw new Error('fixture');
  return {
    ...signedInSession,
    session: {
      ...signedInSession.session,
      user: { ...signedInSession.session.user, activeWorkspaceId: workspaceId },
      workspaces: [...signedInSession.session.workspaces, { id: OTHER, name: 'Other', role: 'owner' }],
    },
  } as SessionContextValue;
}

/**
 * A run belongs to the workspace it was opened in (BUILD-PLAN 24.11.9). On
 * build 7 a workspace switch left the run page open and it read the run id in
 * the new workspace: three 404s. Now it leaves instead — and its Run details
 * (build 28, F9), which reads it the same way (`useRunDetail`), too.
 */
describe('the run page across a workspace switch', () => {
  beforeEach(() => {
    platformOperation.mockReset();
    routePlatform(platformOperation);
  });

  it.each([
    ['its page', RunDetailScreen, () => screen.findByTestId('run-open-details')],
    ['its Run details', RunDetailsScreen, () => screen.findByText('Duration')],
  ] as const)('%s reads the run in the workspace it was opened in, and leaves when the active one changes', async (_page, Page, loaded) => {
    setMockParams({ runId: 'run-1' });
    await renderWithProviders(<Switchable Page={Page} />, signedInSession);
    expect(await loaded()).toBeTruthy();
    const runReads = () => platformOperation.mock.calls.map((call: unknown[]) => String(call[0])).filter((key: string) => /\/runs\/run-1$/u.test(key));
    expect(runReads()).toEqual([`/v1/workspaces/${TEST_WORKSPACE}/runs/run-1`]);

    await act(async () => switchTo(activeIn(OTHER)));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(runReads().some((key: string) => key.includes(OTHER))).toBe(false);
  });
});
