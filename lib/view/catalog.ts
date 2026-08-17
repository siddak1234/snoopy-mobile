import type { Icon } from 'phosphor-react-native';

import type {
  CatalogEntry,
  CatalogResponse,
  Connection,
  ConnectionProvider,
} from '@/lib/platform/catalog';
import type { RunStatusCounts, RunSubscriptionCounts, Subscription } from '@/lib/platform/runs';
import { EMPTY, count } from './format';
import { toPipelineSteps, type PipelineStep } from './pipeline';
import { iconFor } from './icon-registry';
import { statusLabel, type StatusPillLabel } from './status';

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

/** A Home stat tile, in the shape `homeStats` had. */
export type StatTileView = { value: string; label: string; tone: 'text' | 'ok' | 'err' };

/**
 * The three tiles Home draws, from `run-stats`' workspace counts.
 *
 * §12.1 #73b names these three of the seven statuses and no others: `total` is
 * "Runs today", `succeeded` is "Successes", `failed` is "Failures". The other
 * four — pending, running, held, cancelled — are deliberately not shown; adding a
 * fourth tile would be a design change, and the UI is frozen.
 *
 * `count()` rather than `String()` so 1284 reads "1,284" as the design draws it.
 */
export function toStatTiles(counts: RunStatusCounts): StatTileView[] {
  return [
    { value: count(counts.total), label: 'Runs today', tone: 'text' },
    { value: count(counts.succeeded), label: 'Successes', tone: 'ok' },
    { value: count(counts.failed), label: 'Failures', tone: 'err' },
  ];
}

/** A workflow row, in the shape `flowDefs` had. */
export type FlowView = {
  key: string;
  /** The catalog identity, so a screen can name the automation to another. */
  templateId: string;
  icon: Icon;
  name: string;
  desc: string;
  status: StatusPillLabel;
  runs: string;
  runCount: string;
  okCount: string;
  failCount: string;
  steps: PipelineStep[];
  /**
   * The workflow's connection rows.
   *
   * **Incomplete against a live workspace, and the reason is the contract.** No
   * published shape names the providers an automation *uses*: the catalog entry
   * has no providers field, and `Subscription.unmetConnections` lists only those
   * still to connect. So a live row set can show what is missing and cannot show
   * what is already satisfied — the design draws both. Filed in
   * DESIGN-CONTRACT.md rather than filled in by guessing at a provider set.
   */
  connections: FlowConnectionView[];
};

export type FlowConnectionView = {
  icon: Icon;
  name: string;
  sub: string;
  tone: 'ok' | 'warn' | 'neutral';
  status: string;
};

/**
 * A workspace's workflows: subscriptions, joined to the catalog and their counts.
 *
 * Three sources, and each is the only one that can answer its part.
 * `Subscription` gives identity and status; the catalog gives the name,
 * description, icon and the declared `pipeline`; `run-stats` gives the run
 * totals the design's summary line and stat tiles draw.
 *
 * A subscription **absent from `run-stats.subscriptions` has no runs in the
 * window**, which is not the same as not existing — the endpoint returns only
 * those with at least one. So a missing entry means zeroes, and a Draft
 * subscription (which has never run) correctly shows the design's em dash rather
 * than "0".
 */
export function toFlows(
  subscriptions: Subscription[],
  catalog: CatalogEntry[],
  perSubscription: RunSubscriptionCounts[],
  providers?: Map<string, ConnectionProvider>,
): FlowView[] {
  const entries = new Map(catalog.map((e) => [e.templateId, e]));
  const counts = new Map(perSubscription.map((c) => [c.subscriptionId, c]));

  return subscriptions.map((sub) => {
    const entry = entries.get(sub.templateId);
    const c = counts.get(sub.id);
    const isDraft = sub.status === 'draft';
    return {
      key: sub.id,
      templateId: sub.templateId,
      icon: iconFor(entry?.icon),
      name: sub.name ?? entry?.name ?? sub.templateId,
      desc: entry?.description ?? '',
      status: statusLabel(sub.status) as StatusPillLabel,
      // A Draft has never run, and the design writes that as words, not zeroes.
      runs: isDraft
        ? 'Not yet published'
        : `${count(c?.total ?? 0)} runs · ${count(c?.succeeded ?? 0)} ok · ${count(c?.failed ?? 0)} failed`,
      runCount: isDraft ? EMPTY : count(c?.total ?? 0),
      okCount: isDraft ? EMPTY : count(c?.succeeded ?? 0),
      failCount: isDraft ? EMPTY : count(c?.failed ?? 0),
      steps: toPipelineSteps(entry?.pipeline),
      connections: sub.unmetConnections.map((providerId) => ({
        icon: iconFor(providerId),
        name: providers?.get(providerId)?.displayName ?? providerId,
        sub: 'Required before publishing',
        tone: 'neutral' as const,
        status: 'Not connected',
      })),
    };
  });
}
