import type { Icon } from 'phosphor-react-native';

import type {
  CatalogEntry,
  CatalogResponse,
  Connection,
  ConnectionProvider,
} from '@/lib/platform/catalog';
import { iconFor } from './icon-registry';
import { statusLabel } from './status';

/**
 * Catalog and connection wire shapes, mapped to what the screens already draw.
 *
 * The prototype's fixtures carry a live phosphor component, a pre-formatted
 * price string and an invented filter list; the platform sends an icon *name*, a
 * number, and its own `categories`. This file is the whole of that difference,
 * which is what lets the screens keep rendering identical characters — the
 * frozen-UI rule is satisfied by absorbing the change here rather than by
 * reshaping a screen.
 */

/** A marketplace card, in the shape `solutionDefs` had. */
export type SolutionView = {
  icon: Icon;
  name: string;
  desc: string;
  cat: string;
  price: number;
  /** Drives Add versus Added — the fixtures tracked this by array index. */
  subscribed: boolean;
  /** Stable identity, which array-index fixtures could not express. */
  templateId: string;
};

/** A template card, in the shape `templates` had. */
export type TemplateView = { icon: Icon; name: string; cat: string; templateId: string };

/** A Settings connection row, in the shape `settingsConnections` had. */
export type ConnectionView = { icon: Icon; name: string; sub: string; connected: boolean };

export function toSolution(entry: CatalogEntry): SolutionView {
  return {
    icon: iconFor(entry.icon),
    name: entry.name,
    desc: entry.description,
    cat: entry.category,
    price: entry.monthlyPriceUsd,
    subscribed: entry.subscribed,
    templateId: entry.templateId,
  };
}

export function toTemplate(entry: CatalogEntry): TemplateView {
  return {
    icon: iconFor(entry.icon),
    name: entry.name,
    cat: entry.category,
    templateId: entry.templateId,
  };
}

export function toSolutions(response: CatalogResponse): SolutionView[] {
  return response.automations.map(toSolution);
}

export function toTemplates(response: CatalogResponse): TemplateView[] {
  return response.automations.map(toTemplate);
}

/**
 * The filter chips, from the server rather than from a constant.
 *
 * `categories` already includes "All"; the contract says so and says a client
 * must render what it is given. A hardcoded list would silently drop a category
 * the catalog gained.
 */
export function toCategories(response: CatalogResponse): string[] {
  return response.categories;
}

/**
 * Settings' CONNECTIONS card: every provider, annotated with its connection.
 *
 * Driven by the provider list rather than the connection list, because the
 * connections read omits a provider with no connection — and the design draws
 * exactly that row ("Slack · Not connected"). `usedByCount` is the one field no
 * single service can answer, and it is precisely the design's "used by 2
 * solutions", so the sub-line needs no invention.
 */
export function toConnectionRows(
  providers: ConnectionProvider[],
  connections: Connection[],
): ConnectionView[] {
  const byProvider = new Map(connections.map((c) => [c.providerId, c]));

  return providers.map((provider) => {
    const connection = byProvider.get(provider.providerId);
    return {
      icon: iconFor(provider.providerId),
      name: provider.displayName,
      sub: connectionSubtitle(connection),
      connected: connection?.status === 'connected',
    };
  });
}

/** `Connected · used by 2 solutions`, `Reauthorization required`, `Not connected`. */
function connectionSubtitle(connection: Connection | undefined): string {
  if (!connection) return 'Not connected';
  const state = statusLabel(connection.status);
  const used = connection.usedByCount;
  if (typeof used !== 'number' || used < 1) return state;
  return `${state} · used by ${used} ${used === 1 ? 'solution' : 'solutions'}`;
}
