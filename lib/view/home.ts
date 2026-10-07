import { FIGURE_UNAVAILABLE } from '@/lib/content/screen-states';
import type { Connection } from '@/lib/platform/catalog';
import { PlatformNotConfiguredError, PlatformRateLimitedError, PlatformUnreachableError } from '@/lib/platform/problem';
import type { Project } from '@/lib/platform/projects';
import type { Subscription } from '@/lib/platform/runs';
import type { WorkspaceSummary } from '@/lib/platform/workspaces';
import { withoutArchived } from './catalog';
import { count } from './format';
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

/** A team on Home: its kind, its status, and its workspace's name when the teams shown span several. */
export type HomeTeam = { id: string; workspaceId: string; kind: string; status: string; workspace: string | null };

/** A team's status in the website's words (its dashboard's Teams). */
const TEAM_STATUS: Record<Project['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  draft: 'Draft',
  archived: 'Archived',
};

/**
 * Home's teams (Gate 24 parity, G7): the first three this person can see that
 * are not deleted, in the order their workspaces and teams come — the website's
 * `listAccessibleProjects()`, archived teams left out, then `.slice(0, 3)`. A
 * team is its kind (24.12), and names its workspace only when the three span
 * more than one, as the website's do.
 */
export function homeTeams(items: readonly { workspace: WorkspaceSummary; project: Project }[]): HomeTeam[] {
  const top = items.filter(({ project }) => project.status !== 'archived').slice(0, 3);
  const several = new Set(top.map(({ project }) => project.workspaceId)).size > 1;
  return top.map(({ workspace, project }) => ({
    id: project.id,
    workspaceId: project.workspaceId,
    kind: project.type,
    status: TEAM_STATUS[project.status],
    workspace: several ? workspace.name : null,
  }));
}
