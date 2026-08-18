import * as WebBrowser from 'expo-web-browser';

import type { components } from '@/lib/generated/platform-contracts/connections';
import { platformOperation } from './client';
import { matchesNativeCallback, nativeRedirectUri } from './native-auth';
import { PlatformNotConfiguredError } from './problem';

export type Connection = components['schemas']['Connection'];
export type ConnectionState = components['schemas']['ConnectionState'];
export type ConnectionProvider = components['schemas']['ConnectionProvider'];

export type ConnectionOutcome =
  | { status: 'connected'; connection: Connection }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export async function connectOAuthProvider(
  workspaceId: string,
  provider: ConnectionProvider,
): Promise<ConnectionOutcome> {
  const returnTo = nativeRedirectUri();
  if (!returnTo) throw new PlatformNotConfiguredError();

  const started = await platformOperation(
    `/v1/workspaces/${workspaceId}/connections/authorize`,
    ({ connections }, signal) =>
      connections.POST('/v1/workspaces/{workspaceId}/connections/authorize', {
        params: { path: { workspaceId } },
        body: {
          providerId: provider.providerId,
          ...(provider.scopes.length > 0 ? { scopes: provider.scopes } : {}),
          returnTo,
        },
        signal,
      }),
  );

  const result = await WebBrowser.openAuthSessionAsync(started.authorizationUrl, returnTo);
  if (result.type !== 'success') return { status: 'cancelled' };

  const returned = new URL(result.url);
  if (!matchesNativeCallback(returned, returnTo)) {
    return { status: 'failed', message: 'The connection returned to an unexpected address.' };
  }
  if (returned.searchParams.get('status') === 'error') {
    return { status: 'failed', message: connectionFailure(returned.searchParams.get('reason')) };
  }
  const code = returned.searchParams.get('code');
  if (!code) return { status: 'failed', message: 'The connection did not complete.' };

  const completed = await platformOperation('/v1/connections/native/complete', ({ connections }, signal) =>
    connections.POST('/v1/connections/native/complete', {
      body: { code },
      signal,
    }),
  );
  return { status: 'connected', connection: completed.connection };
}

export function connectProviderWithKey(
  workspaceId: string,
  providerId: string,
  credentials: Record<string, string>,
  idempotencyKey: string,
): Promise<{ connection: Connection }> {
  return platformOperation(`/v1/workspaces/${workspaceId}/connections/key`, ({ connections }, signal) =>
    connections.POST('/v1/workspaces/{workspaceId}/connections/key', {
      params: {
        path: { workspaceId },
        header: { 'Idempotency-Key': idempotencyKey },
      },
      body: { providerId, credentials },
      signal,
    }),
  );
}

export function disconnectConnection(
  workspaceId: string,
  connectionId: string,
): Promise<{ connection: ConnectionState }> {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/connections/${connectionId}`,
    ({ connections }, signal) =>
      connections.DELETE('/v1/workspaces/{workspaceId}/connections/{connectionId}', {
        params: { path: { workspaceId, connectionId } },
        signal,
      }),
  );
}

function connectionFailure(reason: string | null): string {
  switch (reason) {
    case 'denied':
      return 'Connection permission was declined.';
    case 'missing_code':
      return 'The provider did not return an authorization code.';
    default:
      return 'The connection did not complete.';
  }
}
