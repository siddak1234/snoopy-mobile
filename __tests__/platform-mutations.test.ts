jest.mock('@/lib/platform/client', () => ({ platformOperation: jest.fn() }));
jest.mock('@/lib/platform/native-auth', () => ({
  nativeRedirectUri: jest.fn(() => 'https://app.example.test/auth/native/callback'),
  matchesNativeCallback: jest.fn(
    (returned: URL, configured: string) =>
      `${returned.origin}${returned.pathname}` === configured && returned.hash === '',
  ),
  // The real one: the connect flow shares login's browser wrapper, and its
  // browserless refusal is what the last case below exercises.
  openSystemAuthSession: jest.requireActual('@/lib/platform/native-auth').openSystemAuthSession,
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

import * as WebBrowser from 'expo-web-browser';

import {
  createSubscription,
  decideApproval,
  updateSubscription,
} from '@/lib/platform/automations';
import {
  connectOAuthProvider,
  connectProviderWithKey,
  disconnectConnection,
} from '@/lib/platform/connections';
import { readWorkspaces, selectActiveWorkspace } from '@/lib/platform/workspaces';

const { platformOperation } = jest.requireMock('@/lib/platform/client');
const automationsPost = jest.fn();
const automationsPatch = jest.fn();
const connectionsPost = jest.fn();
const connectionsDelete = jest.fn();
const platformGet = jest.fn();
const platformPatch = jest.fn();
const signal = new AbortController().signal;

beforeEach(() => {
  platformOperation.mockReset();
  automationsPost.mockReset();
  automationsPatch.mockReset();
  connectionsPost.mockReset();
  connectionsDelete.mockReset();
  platformGet.mockReset();
  platformPatch.mockReset();
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockReset();

  platformOperation.mockImplementation(async (_key: string, execute: Function) => {
    const result = await execute(
      {
        automations: { POST: automationsPost, PATCH: automationsPatch },
        connections: { POST: connectionsPost, DELETE: connectionsDelete },
        platform: { GET: platformGet, PATCH: platformPatch },
      },
      signal,
    );
    return result.data ?? null;
  });
});

describe('workspace operations', () => {
  it('reads the published workspace collection, not the bounded session list', async () => {
    const list = { workspaces: [{ id: 'ws-1' }], activeWorkspaceId: 'ws-1' };
    platformGet.mockResolvedValue({ data: list, response: { ok: true } });
    await expect(readWorkspaces()).resolves.toBe(list);
    expect(platformOperation.mock.calls[0][0]).toBe('/v1/workspaces');
    expect(platformGet).toHaveBeenCalledWith('/v1/workspaces', { signal });
  });

  it('selects the active workspace through the session operation with an idempotency key', async () => {
    // The same operation the web switcher drives (snoopy PR #6). The backend
    // session owns "active"; the app sends one intent and reads the answer.
    const answer = { activeWorkspaceId: 'ws-2' };
    platformPatch.mockResolvedValue({ data: answer, response: { ok: true } });
    await expect(selectActiveWorkspace('ws-2', 'workspace-activate-1')).resolves.toBe(answer);
    expect(platformOperation.mock.calls[0][0]).toBe('/v1/session/active-workspace');
    expect(platformPatch).toHaveBeenCalledWith('/v1/session/active-workspace', {
      params: { header: { 'Idempotency-Key': 'workspace-activate-1' } },
      body: { workspaceId: 'ws-2' },
      signal,
    });
  });
});

describe('automation mutations', () => {
  it('creates and updates a subscription with an idempotency key', async () => {
    const created = { subscription: { id: 'sub-1' } };
    automationsPost.mockResolvedValue({ data: created, response: { ok: true } });
    await expect(
      createSubscription('workspace-1', { templateId: 'invoice', templateVersion: 3 }, 'intent-1'),
    ).resolves.toBe(created);
    expect(automationsPost).toHaveBeenCalledWith(
      '/v1/workspaces/{workspaceId}/subscriptions',
      expect.objectContaining({
        params: {
          path: { workspaceId: 'workspace-1' },
          header: { 'Idempotency-Key': 'intent-1' },
        },
        body: { templateId: 'invoice', templateVersion: 3 },
        signal,
      }),
    );

    const updated = { subscription: { id: 'sub-1', status: 'live' } };
    automationsPatch.mockResolvedValue({ data: updated, response: { ok: true } });
    await expect(
      updateSubscription('workspace-1', 'sub-1', { status: 'live' }, 'intent-2'),
    ).resolves.toBe(updated);
    expect(automationsPatch).toHaveBeenCalledWith(
      '/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}',
      expect.objectContaining({
        params: {
          path: { workspaceId: 'workspace-1', subscriptionId: 'sub-1' },
          header: { 'Idempotency-Key': 'intent-2' },
        },
        body: { status: 'live' },
      }),
    );
  });

  it('posts an approval decision to that approval, never to a list index', async () => {
    const answer = { approval: { id: 'approval-9', status: 'approved' } };
    automationsPost.mockResolvedValue({ data: answer, response: { ok: true } });
    await expect(
      decideApproval('workspace-1', 'approval-9', 'approved', 'decision-1'),
    ).resolves.toBe(answer);
    expect(automationsPost).toHaveBeenCalledWith(
      '/v1/workspaces/{workspaceId}/approvals/{approvalId}/decision',
      expect.objectContaining({
        params: {
          path: { workspaceId: 'workspace-1', approvalId: 'approval-9' },
          header: { 'Idempotency-Key': 'decision-1' },
        },
        body: { decision: 'approved' },
      }),
    );
  });
});

describe('connection mutations', () => {
  it('completes OAuth through the claimed HTTPS return and sealed handoff', async () => {
    connectionsPost
      .mockResolvedValueOnce({
        data: { authorizationUrl: 'https://provider.example.test/authorize' },
        response: { ok: true },
      })
      .mockResolvedValueOnce({
        data: { connection: { id: 'connection-1' } },
        response: { ok: true },
      });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'https://app.example.test/auth/native/callback?code=sealed-connection-code',
    });

    await expect(
      connectOAuthProvider('workspace-1', {
        providerId: 'quickbooks',
        displayName: 'QuickBooks',
        description: 'Accounting',
        authType: 'oauth2',
        scopes: ['accounting'],
        icon: 'plugs',
      }),
    ).resolves.toMatchObject({ status: 'connected' });

    expect(connectionsPost.mock.calls[0]).toEqual([
      '/v1/workspaces/{workspaceId}/connections/authorize',
      expect.objectContaining({
        body: {
          providerId: 'quickbooks',
          scopes: ['accounting'],
          returnTo: 'https://app.example.test/auth/native/callback',
        },
      }),
    ]);
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://provider.example.test/authorize',
      'https://app.example.test/auth/native/callback',
    );
    expect(connectionsPost.mock.calls[1][1].body).toEqual({ code: 'sealed-connection-code' });
  });

  it('does not exchange a connection code returned to a different address', async () => {
    connectionsPost.mockResolvedValueOnce({
      data: { authorizationUrl: 'https://provider.example.test/authorize' },
      response: { ok: true },
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'https://attacker.example/auth/native/callback?code=sealed-code',
    });

    await expect(
      connectOAuthProvider('workspace-1', {
        providerId: 'quickbooks',
        displayName: 'QuickBooks',
        description: 'Accounting',
        authType: 'oauth2',
        scopes: [],
        icon: 'plugs',
      }),
    ).resolves.toEqual({
      status: 'failed',
      message: 'The connection returned to an unexpected address.',
    });
    expect(connectionsPost).toHaveBeenCalledTimes(1);
  });

  it('sends pasted credentials once with idempotency and can disconnect by connection id', async () => {
    connectionsPost.mockResolvedValue({ data: { connection: { id: 'c1' } }, response: { ok: true } });
    await connectProviderWithKey('workspace-1', 'api-provider', { apiKey: 'secret' }, 'key-intent');
    expect(connectionsPost).toHaveBeenCalledWith(
      '/v1/workspaces/{workspaceId}/connections/key',
      expect.objectContaining({
        params: {
          path: { workspaceId: 'workspace-1' },
          header: { 'Idempotency-Key': 'key-intent' },
        },
        body: { providerId: 'api-provider', credentials: { apiKey: 'secret' } },
      }),
    );

    connectionsDelete.mockResolvedValue({ data: { connection: { id: 'c1' } }, response: { ok: true } });
    await disconnectConnection('workspace-1', 'c1');
    expect(connectionsDelete).toHaveBeenCalledWith(
      '/v1/workspaces/{workspaceId}/connections/{connectionId}',
      expect.objectContaining({
        params: { path: { workspaceId: 'workspace-1', connectionId: 'c1' } },
      }),
    );
  });

  it('reports a device with no browser as a failed connect, not a crash', async () => {
    // expo-web-browser rejects with `NoMatchingActivityException` when no
    // Custom Tabs provider exists. Before Round 7.5M that rejection escaped
    // `connectOAuthProvider` (and `signInWithProvider`) uncaught.
    connectionsPost.mockResolvedValueOnce({
      data: { authorizationUrl: 'https://provider.example.test/authorize' },
      response: { ok: true },
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockRejectedValue(
      Object.assign(new Error('No matching browser activity found'), {
        code: 'ERR_NO_MATCHING_ACTIVITY',
      }),
    );

    await expect(
      connectOAuthProvider('workspace-1', {
        providerId: 'quickbooks',
        displayName: 'QuickBooks',
        description: 'Accounting',
        authType: 'oauth2',
        scopes: [],
        icon: 'plugs',
      }),
    ).resolves.toEqual({
      status: 'failed',
      message: 'No web browser is available on this device to continue.',
    });
    // The attempt was minted; nothing was completed against it.
    expect(connectionsPost).toHaveBeenCalledTimes(1);
  });
});
