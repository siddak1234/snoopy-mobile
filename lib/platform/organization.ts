import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';
import { websiteOrigin } from './native-auth';
import { collectPages } from './paging';
import { changedWorkspaces } from './workspaces';

/**
 * An organization: its name, members, domains and join requests, and finding
 * or setting one up (BUILD-PLAN 24.5.1) — the operations `snoopy/lib/tenancy.ts`
 * drives for the website's organization and onboarding pages. Owners and admins
 * only, except discovery and joining; the Edge enforces it on every call.
 */

type Schema = components['schemas'];
export type WorkspaceMember = Schema['WorkspaceMember'];
export type OrganizationDomain = Schema['OrganizationDomain'];
export type JoinPolicy = OrganizationDomain['joinPolicy'];
export type JoinRequest = Schema['OrganizationJoinRequest'];
export type DiscoverableOrganization = Schema['DiscoverableOrganization'];

export function readWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  return collectPages(async (cursor) => {
    const page = await platformOperation(`/v1/workspaces/${workspaceId}/members`, ({ platform }, signal) =>
      platform.GET('/v1/workspaces/{workspaceId}/members', {
        params: { path: { workspaceId }, query: cursor ? { cursor } : {} },
        signal,
      }),
    );
    return { items: page.members, nextCursor: page.nextCursor };
  });
}

export function renameWorkspace(workspaceId: string, name: string, idempotencyKey: string) {
  return platformOperation(`/v1/workspaces/${workspaceId}`, ({ platform }, signal) =>
    platform.PATCH('/v1/workspaces/{workspaceId}', {
      params: { path: { workspaceId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { name },
      signal,
    }),
  ).then(changedWorkspaces);
}

export function removeWorkspaceMember(workspaceId: string, userId: string, idempotencyKey: string) {
  return platformOperation(`/v1/workspaces/${workspaceId}/members/${userId}`, ({ platform }, signal) =>
    platform.DELETE('/v1/workspaces/{workspaceId}/members/{userId}', {
      params: { path: { workspaceId, userId }, header: { 'Idempotency-Key': idempotencyKey } },
      signal,
    }),
  );
}

export function readDomains(workspaceId: string): Promise<OrganizationDomain[]> {
  return collectPages(async (cursor) => {
    const page = await platformOperation(`/v1/workspaces/${workspaceId}/domains`, ({ platform }, signal) =>
      platform.GET('/v1/workspaces/{workspaceId}/domains', {
        params: { path: { workspaceId }, query: cursor ? { cursor } : {} },
        signal,
      }),
    );
    return { items: page.domains, nextCursor: page.nextCursor };
  });
}

/** `verificationRecordValue` is in the first answer only, never a replay. */
export function claimDomain(
  workspaceId: string,
  body: { domain: string; joinPolicy: JoinPolicy },
  idempotencyKey: string,
) {
  return platformOperation(`/v1/workspaces/${workspaceId}/domains`, ({ platform }, signal) =>
    platform.POST('/v1/workspaces/{workspaceId}/domains', {
      params: { path: { workspaceId }, header: { 'Idempotency-Key': idempotencyKey } },
      body,
      signal,
    }),
  );
}

export function updateDomain(
  workspaceId: string,
  domainId: string,
  body: { joinPolicy: JoinPolicy; discoveryEnabled: boolean },
  idempotencyKey: string,
) {
  return platformOperation(`/v1/workspaces/${workspaceId}/domains/${domainId}`, ({ platform }, signal) =>
    platform.PATCH('/v1/workspaces/{workspaceId}/domains/{domainId}', {
      params: { path: { workspaceId, domainId }, header: { 'Idempotency-Key': idempotencyKey } },
      body,
      signal,
    }),
  );
}

export function verifyDomain(workspaceId: string, domainId: string, idempotencyKey: string) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/domains/${domainId}/verification`,
    ({ platform }, signal) =>
      platform.POST('/v1/workspaces/{workspaceId}/domains/{domainId}/verification', {
        params: { path: { workspaceId, domainId }, header: { 'Idempotency-Key': idempotencyKey } },
        signal,
      }),
  );
}

export function revokeDomain(workspaceId: string, domainId: string, idempotencyKey: string) {
  return platformOperation(`/v1/workspaces/${workspaceId}/domains/${domainId}`, ({ platform }, signal) =>
    platform.DELETE('/v1/workspaces/{workspaceId}/domains/{domainId}', {
      params: { path: { workspaceId, domainId }, header: { 'Idempotency-Key': idempotencyKey } },
      signal,
    }),
  );
}

export function readJoinRequests(workspaceId: string): Promise<JoinRequest[]> {
  return collectPages(async (cursor) => {
    const page = await platformOperation(`/v1/workspaces/${workspaceId}/join-requests`, ({ platform }, signal) =>
      platform.GET('/v1/workspaces/{workspaceId}/join-requests', {
        params: { path: { workspaceId }, query: cursor ? { cursor } : {} },
        signal,
      }),
    );
    return { items: page.requests, nextCursor: page.nextCursor };
  });
}

export function decideJoinRequest(
  workspaceId: string,
  joinRequestId: string,
  decision: 'approve' | 'reject',
  idempotencyKey: string,
) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/join-requests/${joinRequestId}`,
    ({ platform }, signal) =>
      platform.PATCH('/v1/workspaces/{workspaceId}/join-requests/{joinRequestId}', {
        params: { path: { workspaceId, joinRequestId }, header: { 'Idempotency-Key': idempotencyKey } },
        body: { decision },
        signal,
      }),
  );
}

export function cancelJoinRequest(workspaceId: string, joinRequestId: string, idempotencyKey: string) {
  return platformOperation(
    `/v1/workspaces/${workspaceId}/join-requests/${joinRequestId}`,
    ({ platform }, signal) =>
      platform.DELETE('/v1/workspaces/{workspaceId}/join-requests/{joinRequestId}', {
        params: { path: { workspaceId, joinRequestId }, header: { 'Idempotency-Key': idempotencyKey } },
        signal,
      }),
  );
}

/** Organizations matching this person's verified email domain — it takes no domain. */
export async function discoverOrganizations(): Promise<DiscoverableOrganization[]> {
  const found = await platformOperation('/v1/organization-discovery', ({ platform }, signal) =>
    platform.GET('/v1/organization-discovery', { signal }),
  );
  return found.organizations;
}

/** Joined at once, or a request an owner or admin decides, by the domain's policy. */
export function requestToJoin(workspaceId: string, idempotencyKey: string) {
  return platformOperation(`/v1/organizations/${workspaceId}/join`, ({ platform }, signal) =>
    platform.POST('/v1/organizations/{workspaceId}/join', {
      params: { path: { workspaceId }, header: { 'Idempotency-Key': idempotencyKey } },
      signal,
    }),
  ).then(changedWorkspaces);
}

/** A new organization workspace, made active (the website's "Create organization"). */
export function createOrganization(name: string, idempotencyKey: string) {
  return platformOperation('/v1/workspaces', ({ platform }, signal) =>
    platform.POST('/v1/workspaces', {
      params: { header: { 'Idempotency-Key': idempotencyKey } },
      body: { name, type: 'organization', activate: true },
      signal,
    }),
  ).then(changedWorkspaces);
}

/**
 * The website's join page for this organization (24.12, the owner's decision 5
 * of 2026-10-02): `/onboarding/join-org?w=`, on the origin the browser leg
 * shares; null in a build with none. The platform accepts a request through it
 * only from someone at the organization's verified email domain — today's rule,
 * unchanged — and an owner or admin approves it here.
 */
export function joinLink(workspaceId: string): string | null {
  const origin = websiteOrigin();
  return origin ? `${origin}/onboarding/join-org?w=${encodeURIComponent(workspaceId)}` : null;
}
