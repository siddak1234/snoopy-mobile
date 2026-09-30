import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';
import { collectPages } from './paging';

/**
 * Teams in an organization (backend ADR-0010, BUILD-PLAN 24.5.3) — the
 * operations `snoopy/lib/tenancy.ts` drives for the website's teams pages. An
 * owner or admin creates teams and sees every one; anyone else sees the teams
 * they are on. An owner, an admin or the team's manager reads and changes who is
 * on it. The Edge enforces all of it.
 */

type Schema = components['schemas'];
export type Team = Schema['TeamSummary'];
export type TeamMembership = Schema['TeamMembershipSummary'];
export type TeamRole = TeamMembership['role'];

export function readTeams(workspaceId: string): Promise<Team[]> {
  return collectPages(async (cursor) => {
    const page = await platformOperation(`/v1/workspaces/${workspaceId}/teams`, ({ platform }, signal) =>
      platform.GET('/v1/workspaces/{workspaceId}/teams', {
        params: { path: { workspaceId }, query: cursor ? { cursor } : {} },
        signal,
      }),
    );
    return { items: page.teams, nextCursor: page.nextCursor };
  });
}

export function createTeam(
  workspaceId: string,
  body: { name: string; description?: string },
  idempotencyKey: string,
) {
  return platformOperation(`/v1/workspaces/${workspaceId}/teams`, ({ platform }, signal) =>
    platform.POST('/v1/workspaces/{workspaceId}/teams', {
      params: { path: { workspaceId }, header: { 'Idempotency-Key': idempotencyKey } },
      body,
      signal,
    }),
  );
}

/** Carries ids only: names are joined from the workspace's members. */
export function readTeamMembers(workspaceId: string, teamId: string): Promise<TeamMembership[]> {
  return collectPages(async (cursor) => {
    const page = await platformOperation(
      `/v1/workspaces/${workspaceId}/teams/${teamId}/memberships`,
      ({ platform }, signal) =>
        platform.GET('/v1/workspaces/{workspaceId}/teams/{teamId}/memberships', {
          params: { path: { workspaceId, teamId }, query: cursor ? { cursor } : {} },
          signal,
        }),
    );
    return { items: page.memberships, nextCursor: page.nextCursor };
  });
}

/** Adds a workspace member to the team, or changes their team role — one operation. */
export function setTeamMember(
  workspaceId: string,
  teamId: string,
  body: { userId: string; role: TeamRole },
  idempotencyKey: string,
) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/teams/${teamId}/memberships`,
    ({ platform }, signal) =>
      platform.POST('/v1/workspaces/{workspaceId}/teams/{teamId}/memberships', {
        params: { path: { workspaceId, teamId }, header: { 'Idempotency-Key': idempotencyKey } },
        body,
        signal,
      }),
  );
}

export function removeTeamMember(workspaceId: string, teamId: string, userId: string, idempotencyKey: string) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/teams/${teamId}/memberships/${userId}`,
    ({ platform }, signal) =>
      platform.DELETE('/v1/workspaces/{workspaceId}/teams/{teamId}/memberships/{userId}', {
        params: { path: { workspaceId, teamId, userId }, header: { 'Idempotency-Key': idempotencyKey } },
        signal,
      }),
  );
}
