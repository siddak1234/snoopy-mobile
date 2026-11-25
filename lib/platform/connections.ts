import type { components } from '@/lib/generated/platform-contracts/connections';
import { platformOperation } from './client';
import { invalidateShared } from './snapshot';
import { matchesNativeCallback, nativeRedirectUri, openSystemAuthSession } from './native-auth';
import { PlatformNotConfiguredError } from './problem';
import type { ConnectionProvider as OfferedProvider } from './catalog';

export type Connection = components['schemas']['Connection'];
export type ConnectionState = components['schemas']['ConnectionState'];
export type ConnectionProvider = components['schemas']['ConnectionProvider'];

export type ConnectionOutcome =
  /** `reused`: the live connection already held everything; no consent was asked. */
  | { status: 'connected'; connection: ConnectionState; reused?: true }
  | { status: 'cancelled' }
  /**
   * Back from the provider without the connection — it reported an error, or
   * returned no code: nothing changed. The caller says so in the website's
   * words, which turn on whether the provider still has a live connection
   * (`connectionIncomplete`).
   */
  | { status: 'incomplete' }
  | { status: 'failed'; message: string };

/** An EHR sign-in's two fields (backend ADR-0054): the vendor picked and the clinic's FHIR address. */
export type EhrSignIn = { vendor: string; fhirBaseUrl: string };

/**
 * Connect, reconnect or extend a provider — or, with `replaceConnectionId`,
 * replace the account a live connection holds (ADR-0019 §4, ADR-0026, BUILD-PLAN
 * 24.4.3). Replacing names the exact connection it replaces; one that changed
 * since the screen read it is refused with 409 and nothing is started.
 *
 * An EHR a person signs in to (`authType` `smart-launch`, backend ADR-0054,
 * Round 22) begins here too, with `credentials` — its vendor and FHIR address —
 * and goes on as OAuth does: the EHR's own sign-in page in the system auth
 * session, back to the app's claimed callback, the sealed hand-off traded at
 * `/v1/connections/native/complete` (BUILD-PLAN 7.7.6's split callback). Its
 * refusals are thrown with their `details.reason`: `authorize`'s 400 and its
 * 409 `account_mismatch` (another address than the workspace's, answered by
 * `replaceConnectionId`), and the completion's 401 naming `no_refresh_token`
 * or an address refusal — which the transport hands back as it came, never
 * renewed and sent again (`lib/platform/client.ts`).
 */
export async function connectOAuthProvider(
  workspaceId: string,
  // A row of the one provider list (`readConnectionProviders`) as it is; only its id and scopes are read.
  provider: OfferedProvider,
  options: { replaceConnectionId?: string; credentials?: EhrSignIn } = {},
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
          ...(options.replaceConnectionId ? { replaceConnectionId: options.replaceConnectionId } : {}),
          ...(options.credentials ? { credentials: options.credentials } : {}),
          returnTo,
        },
        signal,
      }),
  );

  // `reused`: the live connection already holds every requested scope, so the
  // platform started nothing and there is no consent page to open (ADR-0019 §2,
  // BUILD-PLAN 22.8.1). It carries no `authorizationUrl`; reading it as
  // connected is the whole of the rule.
  if (started.outcome === 'reused') {
    return { status: 'connected', connection: started.connection, reused: true };
  }

  // The same system user-agent login uses, with the same browserless refusal.
  // Note what `cancelled` can hide here: a system browser that shares a
  // logged-in WEBSITE session authenticates at the connections callback and
  // finishes at the website instead of handing back to the app (manifest
  // §12.1 #79). The connection completes upstream; the sheet is then dismissed
  // by the person and arrives here as `cancelled`. Callers must re-read the
  // workspace's connections on `cancelled` rather than assume nothing changed.
  const result = await openSystemAuthSession(started.authorizationUrl, returnTo);
  if (result.type === 'failed') return { status: 'failed', message: result.message };
  if (result.type === 'cancelled') return { status: 'cancelled' };

  const returned = new URL(result.url);
  if (!matchesNativeCallback(returned, returnTo)) {
    return { status: 'failed', message: 'The connection returned to an unexpected address.' };
  }
  // The website reads only `status` here, never the reason (`app/connections`).
  if (returned.searchParams.get('status') === 'error') return { status: 'incomplete' };
  const code = returned.searchParams.get('code');
  if (!code) return { status: 'incomplete' };

  const completed = await platformOperation('/v1/connections/native/complete', ({ connections }, signal) =>
    connections.POST('/v1/connections/native/complete', {
      body: { code },
      signal,
    }),
  );
  invalidateShared(workspaceId, ['connections', 'subscriptions']);
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
