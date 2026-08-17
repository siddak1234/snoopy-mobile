import type { components as automations } from '@/lib/generated/platform-contracts/automations';
import type { components as connections } from '@/lib/generated/platform-contracts/connections';
import { platformJson } from './client';

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
export type ConnectionProvider = connections['schemas']['ConnectionProvider'];

/**
 * The automation catalog as this workspace sees it.
 *
 * `categories` comes back with the response and already includes "All". The
 * contract is explicit that a client renders what it is given rather than
 * inventing its own filter vocabulary, so screens must use it instead of a
 * hardcoded list.
 */
export function readCatalog(workspaceId: string): Promise<CatalogResponse> {
  return platformJson<CatalogResponse>(`/v1/workspaces/${workspaceId}/automations`);
}

/** Every connection the workspace holds, live or broken. */
export function readConnections(workspaceId: string): Promise<{ connections: Connection[] }> {
  return platformJson<{ connections: Connection[] }>(`/v1/workspaces/${workspaceId}/connections`);
}

/**
 * Every provider that can be connected.
 *
 * Needed alongside the connections list rather than instead of it: the
 * connections read omits a provider with no connection at all, so the design's
 * "Slack · Not connected" row has no source without this.
 */
export function readConnectionProviders(): Promise<{ providers: ConnectionProvider[] }> {
  return platformJson<{ providers: ConnectionProvider[] }>('/v1/connections/providers');
}
