import type { CatalogEntry } from '@/lib/platform/catalog';
import { PlatformNotConfiguredError, PlatformRateLimitedError, PlatformUnreachableError } from '@/lib/platform/problem';
import type { Subscription } from '@/lib/platform/runs';

import { byDepartment } from './catalog';
import { inScope } from './scope';

/**
 * Home's reads stand each on its own (Gate 24 parity, G6) — the website's
 * dashboard (`snoopy/app/account/page.tsx`): a figure the platform refused or
 * could not answer reads "Unavailable" and the rest still show, rather than one
 * read taking the whole of Home with it.
 *
 * ~~`flowsFigure` and `integrationsFigure`, OVERVIEW's two figures (G6), and
 * `quickRunRows`, RUN A FLOW's rows (Build 21, spec A9)~~ until Build 22: the
 * owner's build 21 item 1 — "Remove run a flow section. We did not add thus. /
 * Remove overflow … I dont want want flows integrations, connect integrations,
 * view teams, or run a flow." YOUR FLOWS (`yourFlows`) since the owner's build
 * 34 F5, where RECENT RUNS was.
 */

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

/** A flow in YOUR FLOWS: its subscription, as the list Home reads it, and its catalog entry when the catalog names it. */
export type HomeFlow = { subscription: Subscription; entry: CatalogEntry | undefined };

/** A flow's name on Home: its own, else its catalog entry's, else its template's id. */
export function homeFlowName({ subscription, entry }: HomeFlow): string {
  return subscription.name ?? entry?.name ?? subscription.templateId;
}

/**
 * YOUR FLOWS, where RECENT RUNS was (the owner's build 34 F5: "Rather than
 * recent runs from now on we will list the flows the account has … listed in
 * department alphabetical order"): the workspace's live flows in the scope
 * chosen, in sections by department A–Z — its template's catalog `category`,
 * as Add a flow's (`byDepartment`) — each A–Z by name, as the website's; a
 * flow the catalog does not name (it could not be read) last, under no name.
 * Built from the subscriptions and the catalog Home already reads: nothing more.
 */
export function yourFlows(
  subscriptions: readonly Subscription[],
  catalog: readonly CatalogEntry[],
  projectId: string | null,
): { department: string | null; flows: HomeFlow[] }[] {
  const entries = new Map(catalog.map((entry) => [entry.templateId, entry]));
  const live = subscriptions
    .filter((subscription) => subscription.status === 'live' && inScope(subscription, projectId))
    .map((subscription) => ({ subscription, entry: entries.get(subscription.templateId) }))
    .sort((a, b) => homeFlowName(a).localeCompare(homeFlowName(b), 'en-US', { sensitivity: 'base' }));
  const unnamed = live.filter((flow) => flow.entry === undefined);
  return [
    ...byDepartment(
      live.filter((flow) => flow.entry !== undefined),
      (flow) => flow.entry!.category,
    ).map(({ department, entries: flows }) => ({ department, flows })),
    ...(unnamed.length > 0 ? [{ department: null, flows: unnamed }] : []),
  ];
}

/** A department drop-down's value for every department (the owner's build 39 item 8). */
export const ALL_DEPARTMENTS = 'all';
export const ALL_DEPARTMENTS_LABEL = 'All departments';

/**
 * YOUR FLOWS' department drop-down (the owner's build 39 item 8: "Your flows —
 * on the right hand side department select drop down"): "All departments"
 * first, then each department the sections hold, A–Z — the catalog
 * `category` Home groups by (`yourFlows`).
 */
export function homeDepartmentChoices(
  sections: readonly { department: string | null }[],
): { value: string; label: string }[] {
  const named = sections.flatMap((section) => (section.department ? [section.department] : []));
  const sorted = [...new Set(named)].sort((a, b) => a.localeCompare(b, 'en-US', { sensitivity: 'base' }));
  return [{ value: ALL_DEPARTMENTS, label: ALL_DEPARTMENTS_LABEL }, ...sorted.map((name) => ({ value: name, label: name }))];
}

/**
 * The sections YOUR FLOWS draws for a department chosen and a search typed:
 * the chosen department's alone (every one for `ALL_DEPARTMENTS`), each holding
 * only the flows whose name holds the words, any case; a section left with no
 * flow is not drawn.
 */
export function homeFlowsShown<S extends { department: string | null; flows: HomeFlow[] }>(
  sections: readonly S[],
  department: string,
  query: string,
): S[] {
  const words = query.trim().toLocaleLowerCase('en-US');
  return sections
    .filter((section) => department === ALL_DEPARTMENTS || section.department === department)
    .map((section) => ({
      ...section,
      flows: words ? section.flows.filter((flow) => homeFlowName(flow).toLocaleLowerCase('en-US').includes(words)) : section.flows,
    }))
    .filter((section) => section.flows.length > 0);
}

/**
 * The job a Home card starts with (the owner's build 37 item 5: "it should come
 * pre selected with the most recent job the user has uploaded"): the newest
 * item that is ready and not archived — `listItems` answers newest first — or
 * none.
 */
export function newestReadyItem<T extends { status: string; archivedAt: string | null }>(items: readonly T[]): T | null {
  return items.find((item) => item.status === 'ready' && item.archivedAt === null) ?? null;
}
