import type { Icon } from 'phosphor-react-native';

import { FIGURE_UNAVAILABLE } from '@/lib/content/screen-states';
import type { CatalogEntry, Connection } from '@/lib/platform/catalog';
import { PlatformNotConfiguredError, PlatformRateLimitedError, PlatformUnreachableError } from '@/lib/platform/problem';
import type { Subscription } from '@/lib/platform/runs';
import { scopeLabel, withoutArchived } from './catalog';
import { count } from './format';
import { iconFor } from './icon-registry';
import { scopeSubscriptions } from './scope';

/**
 * Home's figures, each on its own (Gate 24 parity, G6) — the website's dashboard
 * (`snoopy/app/account/page.tsx`, `readOverview`): a figure the platform refused
 * or could not answer reads "Unavailable" and the rest still show, rather than
 * one read taking the whole of Home with it. `null` is a read that failed.
 */

/**
 * Flows: the subscriptions the workspace still has — the website's count
 * (`status !== "archived"`, `withoutArchived`) — narrowed to the team scope as
 * the TODAY tiles are, so the number is the flows the Flows tab lists.
 */
export function flowsFigure(subscriptions: Subscription[] | null, projectId: string | null): string {
  if (subscriptions === null) return FIGURE_UNAVAILABLE;
  return count(scopeSubscriptions(withoutArchived(subscriptions), projectId).length);
}

/** Integrations: the workspace's connections that are connected — the website's count. */
export function integrationsFigure(connections: readonly Connection[] | null): string {
  if (connections === null) return FIGURE_UNAVAILABLE;
  return count(connections.filter((connection) => connection.status === 'connected').length);
}

/**
 * Why nothing on Home could be read, when nothing could: the refusal its own
 * failure state is worded by (G3). A 429 first, which states its wait; then any
 * answer the platform gave; then a request that never landed; and with no
 * backend or no workspace, that.
 */
export function homeFailure(errors: readonly unknown[]): unknown {
  return (
    errors.find((error) => error instanceof PlatformRateLimitedError) ??
    errors.find(
      (error) => !(error instanceof PlatformUnreachableError) && !(error instanceof PlatformNotConfiguredError),
    ) ??
    errors.find((error) => error instanceof PlatformUnreachableError) ??
    errors[0]
  );
}

/** One row of Home's RUN A FLOW: a live flow, its icon, its name and its team. */
export type QuickRunRow = { id: string; name: string; icon: Icon; team: string };

/**
 * Home's RUN A FLOW (Build 21, spec A9; the owner's "when a user wants to run a
 * random flow. they shouldnt have to do a bunch of work in the app"; the
 * session's S16): every live flow, in the team scope Home is narrowed to as
 * its tiles are, each opening its flow page, whose Step 1 holds the document
 * and Start run — three taps from Home to a started run. Empty, the section is
 * not drawn. ~~TEAMS, the first three teams~~ until Build 21 (the owner's AM5:
 * "remove lsit teams on bottom of home page, it is useless"); teams stay in
 * Settings.
 */
export function quickRunRows(
  subscriptions: readonly Subscription[] | null,
  catalog: readonly CatalogEntry[] | null,
  labels: ReadonlyMap<string, string>,
  projectId: string | null,
): QuickRunRow[] {
  if (subscriptions === null) return [];
  const entries = new Map((catalog ?? []).map((entry) => [entry.templateId, entry]));
  return scopeSubscriptions(
    subscriptions.filter((subscription) => subscription.status === 'live'),
    projectId,
  ).map((subscription) => {
    const entry = entries.get(subscription.templateId);
    return {
      id: subscription.id,
      name: subscription.name ?? entry?.name ?? subscription.templateId,
      icon: iconFor(entry?.icon),
      team: scopeLabel(subscription.projectId, labels),
    };
  });
}
