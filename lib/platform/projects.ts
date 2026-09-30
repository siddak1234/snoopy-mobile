import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';
import { collectPages } from './paging';
import { readWorkspaces, type WorkspaceSummary } from './workspaces';

/**
 * Projects, who is on them, and which teams have access (BUILD-PLAN 24.5.2) —
 * the operations `snoopy/lib/tenancy.ts` drives for the website's projects
 * pages. A project lives in one workspace; every call names it, and the Edge
 * decides who may do what.
 */

type Schema = components['schemas'];
export type Project = Schema['ProjectSummary'];
export type ProjectRole = Project['viewerRole'];
export type ProjectMembership = Schema['ProjectMembership'];
export type ProjectTeamGrant = Schema['ProjectTeamGrantSummary'];

export function readProjects(workspaceId: string): Promise<Project[]> {
  return collectPages(async (cursor) => {
    const page = await platformOperation(`/v1/workspaces/${workspaceId}/projects`, ({ platform }, signal) =>
      platform.GET('/v1/workspaces/{workspaceId}/projects', {
        params: { path: { workspaceId }, query: cursor ? { cursor } : {} },
        signal,
      }),
    );
    return { items: page.projects, nextCursor: page.nextCursor };
  });
}

/**
 * Every project this person can see, in every workspace they are in — the
 * website's projects page — with the workspaces it read them from.
 */
export async function readAccessibleProjects(): Promise<{
  workspaces: WorkspaceSummary[];
  items: { workspace: WorkspaceSummary; project: Project }[];
}> {
  const { workspaces } = await readWorkspaces();
  const pages = await Promise.all(
    workspaces.map(async (workspace) => ({ workspace, projects: await readProjects(workspace.id) })),
  );
  return {
    workspaces,
    items: pages.flatMap(({ workspace, projects }) => projects.map((project) => ({ workspace, project }))),
  };
}

/** One project, in the workspace it belongs to. */
export async function readProject(workspaceId: string, projectId: string): Promise<Project> {
  const found = await platformOperation(`/v1/workspaces/${workspaceId}/projects/${projectId}`, ({ platform }, signal) =>
    platform.GET('/v1/workspaces/{workspaceId}/projects/{projectId}', {
      params: { path: { workspaceId, projectId } },
      signal,
    }),
  );
  return found.project;
}

export function createProject(
  workspaceId: string,
  body: { name: string; type: string; description?: string },
  idempotencyKey: string,
) {
  return platformOperation(`/v1/workspaces/${workspaceId}/projects`, ({ platform }, signal) =>
    platform.POST('/v1/workspaces/{workspaceId}/projects', {
      params: { path: { workspaceId }, header: { 'Idempotency-Key': idempotencyKey } },
      body,
      signal,
    }),
  );
}

/** Deleting a project archives it — the website's Delete. */
export function archiveProject(workspaceId: string, projectId: string, idempotencyKey: string) {
  return platformOperation(`/v1/workspaces/${workspaceId}/projects/${projectId}`, ({ platform }, signal) =>
    platform.PATCH('/v1/workspaces/{workspaceId}/projects/{projectId}', {
      params: { path: { workspaceId, projectId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { status: 'archived' },
      signal,
    }),
  );
}

export function readProjectMembers(workspaceId: string, projectId: string): Promise<ProjectMembership[]> {
  return collectPages(async (cursor) => {
    const page = await platformOperation(
      `/v1/workspaces/${workspaceId}/projects/${projectId}/memberships`,
      ({ platform }, signal) =>
        platform.GET('/v1/workspaces/{workspaceId}/projects/{projectId}/memberships', {
          params: { path: { workspaceId, projectId }, query: cursor ? { cursor } : {} },
          signal,
        }),
    );
    return { items: page.memberships, nextCursor: page.nextCursor };
  });
}

/** Adds a workspace member to the project, or changes their role on it. */
export function setProjectMember(
  workspaceId: string,
  projectId: string,
  body: { userId: string; role: ProjectRole },
  idempotencyKey: string,
) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/projects/${projectId}/memberships`,
    ({ platform }, signal) =>
      platform.POST('/v1/workspaces/{workspaceId}/projects/{projectId}/memberships', {
        params: { path: { workspaceId, projectId }, header: { 'Idempotency-Key': idempotencyKey } },
        body,
        signal,
      }),
  );
}

/** Takes someone off the project — the person themselves, when they leave. */
export function removeProjectMember(workspaceId: string, projectId: string, userId: string, idempotencyKey: string) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/projects/${projectId}/memberships/${userId}`,
    ({ platform }, signal) =>
      platform.DELETE('/v1/workspaces/{workspaceId}/projects/{projectId}/memberships/{userId}', {
        params: { path: { workspaceId, projectId, userId }, header: { 'Idempotency-Key': idempotencyKey } },
        signal,
      }),
  );
}

export function readTeamGrants(workspaceId: string, projectId: string): Promise<ProjectTeamGrant[]> {
  return collectPages(async (cursor) => {
    const page = await platformOperation(
      `/v1/workspaces/${workspaceId}/projects/${projectId}/team-grants`,
      ({ platform }, signal) =>
        platform.GET('/v1/workspaces/{workspaceId}/projects/{projectId}/team-grants', {
          params: { path: { workspaceId, projectId }, query: cursor ? { cursor } : {} },
          signal,
        }),
    );
    return { items: page.grants, nextCursor: page.nextCursor };
  });
}

/** Gives a team a role on the project, or changes it. Never ownership. */
export function grantTeam(
  workspaceId: string,
  projectId: string,
  body: { teamId: string; role: ProjectTeamGrant['role'] },
  idempotencyKey: string,
) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/projects/${projectId}/team-grants`,
    ({ platform }, signal) =>
      platform.POST('/v1/workspaces/{workspaceId}/projects/{projectId}/team-grants', {
        params: { path: { workspaceId, projectId }, header: { 'Idempotency-Key': idempotencyKey } },
        body,
        signal,
      }),
  );
}

export function revokeTeam(workspaceId: string, projectId: string, teamId: string, idempotencyKey: string) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/projects/${projectId}/team-grants/${teamId}`,
    ({ platform }, signal) =>
      platform.DELETE('/v1/workspaces/{workspaceId}/projects/{projectId}/team-grants/{teamId}', {
        params: { path: { workspaceId, projectId, teamId }, header: { 'Idempotency-Key': idempotencyKey } },
        signal,
      }),
  );
}
