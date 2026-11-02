import type { components as automations } from '@/lib/generated/platform-contracts/automations';
import type { components as connections } from '@/lib/generated/platform-contracts/connections';
import { platformOperation } from './client';
import { GLOBAL_SCOPE, shared } from './snapshot';

/**
 * The reads the marketplace, template and connection screens are built on.
 *
 * Thin on purpose: each is one request through the single transport facade, and
 * the wire→view translation lives in `lib/view/` rather than here. Splitting it
 * that way is what lets a screen's shape change without touching the request,
 * and keeps this module a faithful description of the published contract.
 */

export type CatalogResponse = automations['schemas']['AutomationCatalogResponse'];
export type CatalogEntry = automations['schemas']['AutomationCatalogEntry'];
export type Connection = connections['schemas']['Connection'];
/** A provider as the platform lists it in `providers`: one a workspace connects. */
export type WireConnectionProvider = connections['schemas']['ConnectionProvider'];
/** A public service as the platform lists it in `publicProviders` (backend ADR-0048 amendment 3, B5). */
export type PublicConnectionProvider = connections['schemas']['PublicConnectionProvider'];

/**
 * A provider as every screen reads it: one from `providers`, or a public
 * service from `publicProviders` with `authType` `none` and no scopes
 * (`keylessProviders`) — no key, no Connect, connected for every workspace.
 */
export type ConnectionProvider = Omit<WireConnectionProvider, 'authType'> & {
  authType: WireConnectionProvider['authType'] | 'none';
};

/**
 * The platform's `publicProviders` as rows of the one provider list, each
 * `authType` `none` with no scopes, so Connections, Set up, a flow's page and
 * its vendor page read a public service as connected (`needsNoConnect`). The
 * platform never lists one in `providers`. The website's `keylessProviders`.
 */
export function keylessProviders(publicProviders: readonly PublicConnectionProvider[] | undefined): ConnectionProvider[] {
  return (publicProviders ?? []).map(({ providerId, displayName, description, icon }) => ({
    providerId,
    displayName,
    description,
    icon,
    scopes: [],
    authType: 'none' as const,
  }));
}

/**
 * The automation catalog as this workspace sees it.
 *
 * `categories` comes back with the response and already includes "All". The
 * contract is explicit that a client renders what it is given rather than
 * inventing its own filter vocabulary, so screens must use it instead of a
 * hardcoded list.
 */
export function readCatalog(workspaceId: string): Promise<CatalogResponse> {
  return shared(workspaceId, 'catalog', 'settled', () =>
    platformOperation(`/v1/workspaces/${workspaceId}/automations`, ({ automations }, signal) =>
      automations.GET('/v1/workspaces/{workspaceId}/automations', {
        params: { path: { workspaceId } },
        signal,
      }),
    ),
  );
}

/** Every connection the workspace holds, live or broken. */
export function readConnections(workspaceId: string): Promise<{ connections: Connection[] }> {
  return shared(workspaceId, 'connections', 'volatile', () =>
    platformOperation(`/v1/workspaces/${workspaceId}/connections`, ({ connections }, signal) =>
      connections.GET('/v1/workspaces/{workspaceId}/connections', {
        params: { path: { workspaceId } },
        signal,
      }),
    ),
  );
}

/**
 * Every provider on offer, one list: the platform's `providers`, then its
 * `publicProviders` as keyless rows (`keylessProviders`).
 *
 * Needed alongside the connections list rather than instead of it: the
 * connections read omits a provider with no connection at all, so the design's
 * "Slack · Not connected" row has no source without this.
 */
export function readConnectionProviders(): Promise<{ providers: ConnectionProvider[] }> {
  return shared(GLOBAL_SCOPE, 'providers', 'settled', async () => {
    const body = await platformOperation('/v1/connections/providers', ({ connections }, signal) =>
      connections.GET('/v1/connections/providers', { signal }),
    );
    return { providers: [...body.providers, ...keylessProviders(body.publicProviders)] };
  });
}
