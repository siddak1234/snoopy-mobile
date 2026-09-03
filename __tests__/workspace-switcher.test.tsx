import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import SettingsScreen from '@/app/(tabs)/settings';
import type { SessionContextValue, SessionReloadOutcome } from '@/hooks/use-session';
import { PlatformError } from '@/lib/platform/problem';
import type { WorkspaceSummary } from '@/lib/platform/workspaces';
import { routePlatform } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn((prefix: string) => `${prefix}-intent`),
}));
const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

/**
 * The workspace switcher, over the published active-workspace operation.
 *
 * The completed web client drives `PATCH /v1/session/active-workspace` from its
 * top bar (snoopy PR #6); this is the same operation from Settings' WORKSPACE
 * row. What the cases pin: the backend session stays the only owner of "active"
 * — the app mutates, then re-reads `/v1/session`, and never holds a workspace
 * of its own; the trigger is hidden below two workspaces unless the session
 * says its list is truncated; and a failed mutation stays on the loaded screen
 * with an inline message, per the contract's rule for actions.
 */

const ORG = '00000000-0000-4000-8000-000000000001';
const PERSONAL = '00000000-0000-4000-8000-000000000002';
const EXTRA = '00000000-0000-4000-8000-000000000003';

const org: WorkspaceSummary = { id: ORG, name: 'Acme Operations', type: 'organization', role: 'owner' };
const personal: WorkspaceSummary = { id: PERSONAL, name: "Alex's space", type: 'personal', role: 'owner' };
const extra: WorkspaceSummary = { id: EXTRA, name: 'Northwind', type: 'organization', role: 'member' };

function sessionWith(
  workspaces: WorkspaceSummary[],
  options: { truncated?: boolean; reload?: jest.Mock<Promise<SessionReloadOutcome>, []> } = {},
): SessionContextValue & { reload: jest.Mock<Promise<SessionReloadOutcome>, []> } {
  const reload = options.reload ?? jest.fn(async () => ({ status: 'signed-in' as const }));
  return {
    status: 'signed-in',
    session: {
      authenticated: true,
      user: { userId: 'u1', email: 'alex@acme.co', activeWorkspaceId: ORG },
      workspaces,
      ...(options.truncated ? { workspacesTruncated: true } : {}),
    },
    refresh: () => {},
    reload,
    signIn: async () => ({ status: 'unconfigured', message: '' }),
    signOut: async () => ({ revoked: true }),
  } as unknown as SessionContextValue & { reload: typeof reload };
}

type Execute = (clients: unknown, signal: AbortSignal) => Promise<unknown>;

/** Route the two new operations exactly; everything else keeps the shared routing. */
function routeWorkspaces(
  list: { workspaces: WorkspaceSummary[]; activeWorkspaceId?: string },
  patch: (execute: Execute) => Promise<unknown>,
) {
  routePlatform(platformOperation);
  const fallback = platformOperation.getMockImplementation();
  platformOperation.mockImplementation((path: string, execute: Execute) => {
    if (path === '/v1/workspaces') return Promise.resolve(list);
    if (path === '/v1/session/active-workspace') return patch(execute);
    return fallback(path, execute);
  });
}

beforeEach(() => {
  platformOperation.mockReset();
  newIdempotencyKey.mockClear();
});

describe('the WORKSPACE row', () => {
  it('is inert with one workspace and no truncation, exactly as before', async () => {
    routeWorkspaces({ workspaces: [org], activeWorkspaceId: ORG }, async () => ({}));
    await renderWithProviders(<SettingsScreen />, sessionWith([org]));

    const row = await screen.findByTestId('workspace-switcher-row');
    expect(screen.queryByTestId('workspace-switcher-caret')).toBeNull();
    await fireEvent.press(row);
    expect(screen.queryByTestId('workspace-switcher-dialog')).toBeNull();
    expect(platformOperation.mock.calls.some(([path]: [string]) => path === '/v1/workspaces')).toBe(false);
  });

  it('opens the switcher with two workspaces, reading the published collection', async () => {
    routeWorkspaces({ workspaces: [org, personal], activeWorkspaceId: ORG }, async () => ({}));
    await renderWithProviders(<SettingsScreen />, sessionWith([org, personal]));

    expect(await screen.findByTestId('workspace-switcher-caret')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('workspace-switcher-row'));

    expect(await screen.findByTestId('workspace-switcher-dialog')).toBeTruthy();
    expect(await screen.findByTestId(`workspace-option-${PERSONAL}`)).toBeTruthy();
    expect(screen.getByText("Alex's space")).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy();
    expect(screen.getByText('Organization')).toBeTruthy();
    // The server's active workspace is the one marked, not a client guess.
    expect(screen.getByTestId(`workspace-active-${ORG}`)).toBeTruthy();
    expect(screen.queryByTestId(`workspace-active-${PERSONAL}`)).toBeNull();
  });

  it('opens with one workspace when the session says its list is truncated', async () => {
    // Non-membership must not be inferred from the bounded session list; the
    // collection is what says how many there are.
    routeWorkspaces({ workspaces: [org, personal, extra], activeWorkspaceId: ORG }, async () => ({}));
    await renderWithProviders(<SettingsScreen />, sessionWith([org], { truncated: true }));

    expect(await screen.findByTestId('workspace-switcher-caret')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('workspace-switcher-row'));
    expect(await screen.findByTestId(`workspace-option-${EXTRA}`)).toBeTruthy();
    expect(screen.getByText('Northwind')).toBeTruthy();
  });

  it('says so, in the dialog, when the collection cannot be read', async () => {
    routePlatform(platformOperation);
    const fallback = platformOperation.getMockImplementation();
    platformOperation.mockImplementation((path: string, execute: Execute) =>
      path === '/v1/workspaces'
        ? Promise.reject(new PlatformError('Service Unavailable', 503))
        : fallback(path, execute),
    );
    await renderWithProviders(<SettingsScreen />, sessionWith([org, personal]));

    await fireEvent.press(await screen.findByTestId('workspace-switcher-row'));
    expect(await screen.findByText('Service Unavailable')).toBeTruthy();
    // The loaded screen is still there behind the dialog; nothing was replaced.
    expect(screen.getByText('Settings')).toBeTruthy();
  });
});

describe('switching', () => {
  it('PATCHes the published operation with a fresh idempotency key, then re-reads the session', async () => {
    const patch = jest.fn().mockResolvedValue({
      data: { activeWorkspaceId: PERSONAL },
      response: { ok: true },
    });
    let captured: Execute | null = null;
    routeWorkspaces({ workspaces: [org, personal], activeWorkspaceId: ORG }, async (execute) => {
      captured = execute;
      return { activeWorkspaceId: PERSONAL };
    });
    const session = sessionWith([org, personal]);
    await renderWithProviders(<SettingsScreen />, session);

    await fireEvent.press(await screen.findByTestId('workspace-switcher-row'));
    await fireEvent.press(await screen.findByTestId(`workspace-option-${PERSONAL}`));

    await waitFor(() => expect(session.reload).toHaveBeenCalledTimes(1));
    expect(captured).not.toBeNull();
    const signal = new AbortController().signal;
    await captured!({ platform: { PATCH: patch } }, signal);
    expect(patch).toHaveBeenCalledWith('/v1/session/active-workspace', {
      params: { header: { 'Idempotency-Key': 'workspace-activate-intent' } },
      body: { workspaceId: PERSONAL },
      signal,
    });
    expect(newIdempotencyKey).toHaveBeenCalledWith('workspace-activate');
    // Success is the server's session, adopted: the dialog closes on it.
    await waitFor(() => expect(screen.queryByTestId('workspace-switcher-dialog')).toBeNull());
  });

  it('closes without a mutation when the active workspace is chosen again', async () => {
    const patch = jest.fn(async () => ({}));
    routeWorkspaces({ workspaces: [org, personal], activeWorkspaceId: ORG }, patch);
    const session = sessionWith([org, personal]);
    await renderWithProviders(<SettingsScreen />, session);

    await fireEvent.press(await screen.findByTestId('workspace-switcher-row'));
    await fireEvent.press(await screen.findByTestId(`workspace-option-${ORG}`));

    await waitFor(() => expect(screen.queryByTestId('workspace-switcher-dialog')).toBeNull());
    expect(patch).not.toHaveBeenCalled();
    expect(session.reload).not.toHaveBeenCalled();
  });

  it('stays open with the platform\'s refusal inline, and never re-reads the session', async () => {
    routeWorkspaces({ workspaces: [org, personal], activeWorkspaceId: ORG }, async () => {
      throw new PlatformError('The requested resource is unavailable.', 404, 'NOT_FOUND');
    });
    const session = sessionWith([org, personal]);
    await renderWithProviders(<SettingsScreen />, session);

    await fireEvent.press(await screen.findByTestId('workspace-switcher-row'));
    await fireEvent.press(await screen.findByTestId(`workspace-option-${PERSONAL}`));

    expect(await screen.findByTestId('workspace-switch-error')).toHaveTextContent(
      'The requested resource is unavailable.',
    );
    expect(screen.getByTestId('workspace-switcher-dialog')).toBeTruthy();
    expect(session.reload).not.toHaveBeenCalled();
    // Still the server's answer: the org stays marked active.
    expect(screen.getByTestId(`workspace-active-${ORG}`)).toBeTruthy();
  });

  it('offers the session re-read again when the switch landed but the re-read did not', async () => {
    const reload = jest
      .fn<Promise<SessionReloadOutcome>, []>()
      .mockResolvedValueOnce({ status: 'unavailable', message: 'The platform is unreachable' })
      .mockResolvedValueOnce({ status: 'signed-in' });
    routeWorkspaces({ workspaces: [org, personal], activeWorkspaceId: ORG }, async () => ({
      activeWorkspaceId: PERSONAL,
    }));
    await renderWithProviders(<SettingsScreen />, sessionWith([org, personal], { reload }));

    await fireEvent.press(await screen.findByTestId('workspace-switcher-row'));
    await fireEvent.press(await screen.findByTestId(`workspace-option-${PERSONAL}`));

    expect(await screen.findByTestId('workspace-switch-error')).toHaveTextContent(
      'The workspace was switched, but this session could not be reloaded. The platform is unreachable',
    );
    // The dialog does not pretend the switch failed, and does not eject anyone.
    expect(screen.getByText('Reload session')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();

    await fireEvent.press(screen.getByText('Reload session'));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('workspace-switcher-dialog')).toBeNull());
  });
});
