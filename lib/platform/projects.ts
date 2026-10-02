import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';
import { collectPages } from './paging';
import { invalidateShared, shared } from './snapshot';
import { readWorkspaces, type WorkspaceSummary } from './workspaces';

/**
 * Teams — projects, in the platform's contract (backend 24.11.5) — who is on
 * them, and asking to join one (BUILD-PLAN 24.11.7). A team lives in one
 * workspace; every call names it, and the Edge decides who may do what: a
 * member sees the teams they are on, an organization owner or admin sees every
 * team, a team's owner or admin (and an organization owner or admin) manages
 * its people and decides who joins.
 */

type Schema = components['schemas'];
export type Project = Schema['ProjectSummary'];
export type ProjectRole = Project['viewerRole'];
export type ProjectMembership = Schema['ProjectMembership'];
/** A team in the organization's directory, and where this person stands with it. */
export type TeamDirectoryEntry = Schema['ProjectDirectoryEntry'];
export type AccessRequest = Schema['ProjectAccessRequest'];

export function readProjects(workspaceId: string): Promise<Project[]> {
  return shared(workspaceId, 'projects', 'settled', () => readProjectPages(workspaceId));
}

function readProjectPages(workspaceId: string): Promise<Project[]> {
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
 * Every team this person can see, in every workspace they are in — the
 * website's teams page — with the workspaces it read them from.
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

/** One team, in the workspace it belongs to. */
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
  ).then(changedProjects(workspaceId));
}

/**
 * The teams this person can see changed: the next read of the list is a real
 * request, and so is the next read of the flows, which follow what is visible.
 */
function changedProjects<T>(workspaceId: string): (answer: T) => T {
  return (answer) => {
    invalidateShared(workspaceId, ['projects', 'subscriptions']);
    return answer;
  };
}

/**
 * Deleting a team archives it: it leaves every team list. Its flows are not
 * touched — they keep running until they are removed in Flows.
 */
export function archiveProject(workspaceId: string, projectId: string, idempotencyKey: string) {
  return platformOperation(`/v1/workspaces/${workspaceId}/projects/${projectId}`, ({ platform }, signal) =>
    platform.PATCH('/v1/workspaces/{workspaceId}/projects/{projectId}', {
      params: { path: { workspaceId, projectId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { status: 'archived' },
      signal,
    }),
  ).then(changedProjects(workspaceId));
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

/** Adds a workspace member to the team, or changes their role on it. */
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

/**
 * Takes someone off the team — the person themselves, when they leave, which
 * changes what they can see.
 */
export function removeProjectMember(workspaceId: string, projectId: string, userId: string, idempotencyKey: string) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/projects/${projectId}/memberships/${userId}`,
    ({ platform }, signal) =>
      platform.DELETE('/v1/workspaces/{workspaceId}/projects/{projectId}/memberships/{userId}', {
        params: { path: { workspaceId, projectId, userId }, header: { 'Idempotency-Key': idempotencyKey } },
        signal,
      }),
  ).then(changedProjects(workspaceId));
}

/**
 * The organization's team directory (backend 24.11.4): every open team, by name
 * and kind, and whether this person is on it, has asked, or may ask. Not kept in
 * the snapshot: one screen reads it, and an answer to Request is read back at once.
 */
export function readTeamDirectory(workspaceId: string): Promise<TeamDirectoryEntry[]> {
  return collectPages(async (cursor) => {
    const page = await platformOperation(`/v1/workspaces/${workspaceId}/project-directory`, ({ platform }, signal) =>
      platform.GET('/v1/workspaces/{workspaceId}/project-directory', {
        params: { path: { workspaceId }, query: cursor ? { cursor } : {} },
        signal,
      }),
    );
    return { items: page.projects, nextCursor: page.nextCursor };
  });
}

/**
 * A team's requests to join (backend 24.11.2): every one for the team's managers
 * and the organization's owners and admins, and only their own for anyone else.
 */
export function readAccessRequests(workspaceId: string, projectId: string): Promise<AccessRequest[]> {
  return collectPages(async (cursor) => {
    const page = await platformOperation(
      `/v1/workspaces/${workspaceId}/projects/${projectId}/access-requests`,
      ({ platform }, signal) =>
        platform.GET('/v1/workspaces/{workspaceId}/projects/{projectId}/access-requests', {
          params: { path: { workspaceId, projectId }, query: cursor ? { cursor } : {} },
          signal,
        }),
    );
    return { items: page.requests, nextCursor: page.nextCursor };
  });
}

/** Asks to join a team. Asking twice is the same pending request. */
export function requestAccess(workspaceId: string, projectId: string, idempotencyKey: string) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/projects/${projectId}/access-requests`,
    ({ platform }, signal) =>
      platform.POST('/v1/workspaces/{workspaceId}/projects/{projectId}/access-requests', {
        params: { path: { workspaceId, projectId }, header: { 'Idempotency-Key': idempotencyKey } },
        signal,
      }),
  );
}

/** Approves or denies a request; approval puts the person on the team as a member. */
export function decideAccessRequest(
  workspaceId: string,
  projectId: string,
  requestId: string,
  decision: 'approve' | 'deny',
  idempotencyKey: string,
) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/projects/${projectId}/access-requests/${requestId}`,
    ({ platform }, signal) =>
      platform.PATCH('/v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}', {
        params: { path: { workspaceId, projectId, requestId }, header: { 'Idempotency-Key': idempotencyKey } },
        body: { decision },
        signal,
      }),
  );
}

/** Withdraws this person's own pending request. */
export function cancelAccessRequest(workspaceId: string, projectId: string, requestId: string, idempotencyKey: string) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/projects/${projectId}/access-requests/${requestId}`,
    ({ platform }, signal) =>
      platform.DELETE('/v1/workspaces/{workspaceId}/projects/{projectId}/access-requests/{requestId}', {
        params: { path: { workspaceId, projectId, requestId }, header: { 'Idempotency-Key': idempotencyKey } },
        signal,
      }),
  );
}
