import type { Icon } from 'phosphor-react-native';

import type {
  CatalogEntry,
  CatalogResponse,
  Connection,
  ConnectionProvider,
} from '@/lib/platform/catalog';
import type { RunStatusCounts, RunSubscriptionCounts, Subscription } from '@/lib/platform/runs';
import { EMPTY, calendarDate, count } from './format';
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
  /** The version Add pins: the card says "v{N}", as the website's card does. */
  version: number;
  /**
   * Drives Add versus Added: the workspace holds a subscription to it that is
   * not archived (`withoutArchived`), rather than the catalog's own
   * `subscribed`, which still counts an archived one.
   */
  subscribed: boolean;
  /**
   * Evidence from the platform's reachability probe, never an assumption.
   *
   * `AutomationCatalogEntry.available` is a required published field and the
   * completed web client gates both Add and Go live on it
   * (`snoopy/app/account/automations/AutomationActions.tsx:92,116`). Dropping it
   * here would let the two clients offer different actions against the same
   * Edge, which is the divergence Gate 8's "both clients drive the §1 scenario"
   * line forbids.
   */
  available: boolean;
  /** Stable identity, which array-index fixtures could not express. */
  templateId: string;
};

/** A template card, in the shape `templates` had. */
export type TemplateView = {
  icon: Icon;
  name: string;
  cat: string;
  templateId: string;
  /** See `SolutionView.available` — the same probe, the same refusal. */
  available: boolean;
};

/** A Settings connection row, in the shape `settingsConnections` had. */
export type ConnectionView = {
  provider: ConnectionProvider;
  providerId: string;
  connectionId?: string;
  authType: ConnectionProvider['authType'];
  credentialFields: NonNullable<ConnectionProvider['credentialFields']>;
  icon: Icon;
  name: string;
  sub: string;
  connected: boolean;
  /** The account the connection acts as — what Replace names (BUILD-PLAN 24.4.3). */
  accountName?: string;
  /**
   * Whether its account can be replaced through consent: an OAuth connection
   * that is not disconnected. A pasted key is replaced by pasting another.
   * Ported from the website's `ConnectionsPanel` rule.
   */
  replaceable: boolean;
  /**
   * A connection the workspace holds that Reconnect renews or repairs:
   * connected, or needing reauthorization (backend §12.1 #175) — the website's
   * `reconnectableProviderIds`, where its button reads "Reconnect".
   */
  reconnectable: boolean;
  /** It has an `errorCode`: the website says it needs attention before it can be used. */
  attention: boolean;
};

/**
 * The subscriptions a workspace still has.
 *
 * Archiving is one-way and gives the plan slot back; using that automation
 * again means adding it afresh. The list's contract does not promise to omit
 * archived rows, so every screen treats one as absent — the website's rule
 * (`snoopy/app/account/automations/page.tsx`). The catalog's `subscribed` is not
 * used for this: it is true for a template with ANY subscription row, archived
 * included (DESIGN-GAPS.md, Round 16), so after an Archive it would still say
 * Added and offer Pause on a subscription the platform no longer runs.
 */
export function withoutArchived(subscriptions: Subscription[]): Subscription[] {
  return subscriptions.filter((subscription) => subscription.status !== 'archived');
}

/**
 * Team names to label every flow with (build 11, D4; the owner's build 10 item
 * 7: "What team is that flow part of?"): a map whatever the workspace holds,
 * so each card, archived row and flow page says "Team: {kind}" or "Whole
 * workspace", as the website labels each subscription. Until build 11 the
 * label was drawn only where the workspace had a team, so a workspace with
 * none could not answer the question. (A team is a project in the platform's
 * contract, 24.11.5.) A team is named by its kind (24.12).
 */
export function scopeLabels(
  projects: readonly { id: string; type: string; status: string }[],
): ReadonlyMap<string, string> {
  return new Map(projects.map((project) => [project.id, project.type]));
}

/** One flow's label from `scopeLabels`: "Team: {kind}", or "Whole workspace" (D4). */
export function scopeLabel(projectId: string | null | undefined, labels: ReadonlyMap<string, string>): string {
  return projectId ? `Team: ${labels.get(projectId) ?? 'a team'}` : 'Whole workspace';
}

/**
 * Where the workspace holds a flow (the owner's build 12 item 9: "Teams cannot
 * have the same flows. One flow per account type. Personal or org not multiple
 * of the same in account type."): its subscriptions that are not archived —
 * live, paused or draft — in any team or the whole workspace. A workspace holds
 * a flow once — Personal is one workspace, each organization one — so this is
 * one subscription, or two where a workspace added a flow to two teams before
 * the rule, both kept and both listed. Add reads a held flow as "Added ✓" and
 * Setup configures it rather than adding a second. The rule is the clients' in
 * build 13: the platform still accepts one copy per team (18.6.2) until its
 * own guard lands.
 */
export function heldAs(templateId: string, subscriptions: readonly Subscription[]): Subscription[] {
  return withoutArchived([...subscriptions]).filter((candidate) => candidate.templateId === templateId);
}

/**
 * The live twin of an archived subscription (build 11, D3; the owner's build
 * 10 items 5, 6 and 11: "I already added it back I shouldnt see add it again"):
 * the workspace holds its flow again (`heldAs`), in any team or the whole
 * workspace. Until the owner's build 12 item 9 it had to be in the same scope
 * too — the platform's per-team uniqueness. With a twin the archived page
 * offers no "Unarchive"; it opens the twin instead.
 */
export function addedAgainAs(
  archived: Pick<Subscription, 'templateId'>,
  subscriptions: readonly Subscription[],
): Subscription | undefined {
  return heldAs(archived.templateId, subscriptions)[0];
}

export function toSolution(entry: CatalogEntry, subscribed: boolean): SolutionView {
  return {
    icon: iconFor(entry.icon),
    name: entry.name,
    desc: entry.description,
    cat: entry.category,
    price: entry.monthlyPriceUsd,
    version: entry.version,
    subscribed,
    available: entry.available,
    templateId: entry.templateId,
  };
}

/** A catalog card's price, in the website's words: "Included" for a flow that costs nothing, else "$39/mo". */
export function catalogPrice(monthlyPriceUsd: number): string {
  return monthlyPriceUsd === 0 ? 'Included' : `$${monthlyPriceUsd}/mo`;
}

export function toTemplate(entry: CatalogEntry): TemplateView {
  return {
    icon: iconFor(entry.icon),
    name: entry.name,
    cat: entry.category,
    templateId: entry.templateId,
    available: entry.available,
  };
}

export function toSolutions(response: CatalogResponse, subscriptions: Subscription[]): SolutionView[] {
  const added = new Set(withoutArchived(subscriptions).map((subscription) => subscription.templateId));
  return response.automations.map((entry) => toSolution(entry, added.has(entry.templateId)));
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
      provider,
      providerId: provider.providerId,
      ...(connection ? { connectionId: connection.id } : {}),
      authType: provider.authType,
      credentialFields: provider.credentialFields ?? [],
      icon: iconFor(provider.icon),
      name: provider.displayName,
      sub: connectionSubtitle(connection),
      connected: connection?.status === 'connected',
      ...(connection ? { accountName: connection.externalAccount.displayName } : {}),
      replaceable: Boolean(
        connection && connection.status !== 'disconnected' && provider.authType === 'oauth2',
      ),
      reconnectable: connection?.status === 'connected' || connection?.status === 'reauthorization-required',
      attention: Boolean(connection?.errorCode),
    };
  });
}

/**
 * `alex@acme.co · Connected · used by 2 live flows`, `alex@acme.co ·
 * Reauthorization required`, `Not connected`: the account it acts as, as the
 * website names each connection, and "live" because `usedByCount` counts only
 * live flows — a draft is being set up, not running.
 */
function connectionSubtitle(connection: Connection | undefined): string {
  if (!connection) return 'Not connected';
  const state = `${connection.externalAccount.displayName} · ${statusLabel(connection.status)}`;
  const used = connection.usedByCount;
  if (typeof used !== 'number' || used < 1) return state;
  return `${state} · used by ${used} live ${used === 1 ? 'flow' : 'flows'}`;
}

/** A Home stat tile, in the shape `homeStats` had. */
export type StatTileView = { value: string; label: string; tone: 'text' | 'ok' | 'err' };

/**
 * The three tiles Home draws, from `run-stats`' workspace counts.
 *
 * §12.1 #73b names these three of the seven statuses and no others: `total` is
 * the runs, `succeeded` "Successes", `failed` "Failures". The other four —
 * pending, running, held, cancelled — are deliberately not shown; adding a
 * fourth tile would be a design change, and the UI is frozen.
 *
 * The window is today, and Home says so once, over the row (TODAY), so each tile
 * reads as a flow page's does — "Runs", not "Runs today" beside two that named
 * no window (the owner's build 12 item 1).
 *
 * `count()` rather than `String()` so 1284 reads "1,284" as the design draws it.
 */
export function toStatTiles(counts: RunStatusCounts): StatTileView[] {
  return [
    { value: count(counts.total), label: 'Runs', tone: 'text' },
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
  /**
   * Where it applies — "Whole workspace" or "Team: …" (18.6.2; teams since
   * 24.11.7), as the website labels each subscription. Present when the
   * caller hands over the team names, which every flow screen does since
   * build 11 (D4): a flow always says its team, or that it is the workspace's.
   */
  scope?: string;
  /** The team it is scoped to, `null` for the whole workspace (24.9.2). */
  projectId: string | null;
  /** Removed (archived): kept with its history, read-only, addable again (24.11.8). */
  removed: boolean;
  /**
   * The day it was removed (24.11.8): its `updatedAt`, since archiving is the
   * last change anything in the app makes to it — a removed flow offers none.
   */
  removedOn?: string;
};

export type FlowConnectionView = {
  /** Stable provider identity from `unmetConnections`. */
  id: string;
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
 * than "0". An archived subscription is not a workflow any more and is left
 * out (`withoutArchived`).
 */
export function toFlows(
  subscriptions: Subscription[],
  catalog: CatalogEntry[],
  perSubscription: RunSubscriptionCounts[],
  providers?: Map<string, ConnectionProvider>,
  /** Project names by id, to label each workflow's scope; absent, no label. */
  projectNames?: ReadonlyMap<string, string>,
): FlowView[] {
  return withoutArchived(subscriptions).map((sub) =>
    flowFrom(sub, catalog, perSubscription, providers, projectNames),
  );
}

/**
 * The flows removed from a workspace (24.11.8): the archived subscriptions,
 * built the same way, marked `removed`. A separate reader because every other
 * screen treats an archived row as absent, and only Removed and a run's own
 * page want to see one.
 */
export function toRemovedFlows(
  subscriptions: Subscription[],
  catalog: CatalogEntry[],
  perSubscription: RunSubscriptionCounts[],
  projectNames?: ReadonlyMap<string, string>,
): FlowView[] {
  return subscriptions
    .filter((subscription) => subscription.status === 'archived')
    .map((sub) => flowFrom(sub, catalog, perSubscription, undefined, projectNames));
}

function flowFrom(
  sub: Subscription,
  catalog: CatalogEntry[],
  perSubscription: RunSubscriptionCounts[],
  providers?: Map<string, ConnectionProvider>,
  projectNames?: ReadonlyMap<string, string>,
): FlowView {
  const entries = new Map(catalog.map((e) => [e.templateId, e]));
  const counts = new Map(perSubscription.map((c) => [c.subscriptionId, c]));
  {
    const entry = entries.get(sub.templateId);
    const c = counts.get(sub.id);
    const isDraft = sub.status === 'draft';
    return {
      key: sub.id,
      templateId: sub.templateId,
      projectId: sub.projectId ?? null,
      removed: sub.status === 'archived',
      ...(sub.status === 'archived' ? { removedOn: calendarDate(sub.updatedAt) } : {}),
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
        id: providerId,
        icon: iconFor(providerId),
        name: providers?.get(providerId)?.displayName ?? providerId,
        sub: 'Required before publishing',
        tone: 'neutral' as const,
        status: 'Not connected',
      })),
      ...(projectNames ? { scope: scopeLabel(sub.projectId, projectNames) } : {}),
    };
  }
}
