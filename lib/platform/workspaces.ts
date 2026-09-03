import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';

/**
 * The two published workspace operations the switcher is built on.
 *
 * `PATCH /v1/session/active-workspace` existed in the contract with zero mobile
 * callers until Round 7.5M; the completed web client drives it from its
 * workspace switcher (snoopy PR #6). The active workspace lives in the backend
 * session, so switching is a mutation plus a re-read of `/v1/session` — the
 * client keeps no workspace state of its own, and a form value never selects
 * tenancy.
 *
 * The collection read exists alongside the session's own `workspaces` because
 * that list is bounded: `SessionResponse.workspacesTruncated` says "page the
 * documented workspace collection; do not infer non-membership from this
 * abbreviated session list", and the web layout reads the collection for the
 * same reason.
 */

export type WorkspaceSummary = components['schemas']['WorkspaceSummary'];
export type WorkspaceListResponse = components['schemas']['WorkspaceListResponse'];
export type ActiveWorkspaceResponse = components['schemas']['ActiveWorkspaceResponse'];

/** Every workspace available to the signed-in person, with the server's active one. */
export function readWorkspaces(): Promise<WorkspaceListResponse> {
  return platformOperation('/v1/workspaces', ({ platform }, signal) =>
    platform.GET('/v1/workspaces', { signal }),
  );
}

/** Make one workspace the session's active workspace. Owned by the backend session. */
export function selectActiveWorkspace(
  workspaceId: string,
  idempotencyKey: string,
): Promise<ActiveWorkspaceResponse> {
  return platformOperation('/v1/session/active-workspace', ({ platform }, signal) =>
    platform.PATCH('/v1/session/active-workspace', {
      params: { header: { 'Idempotency-Key': idempotencyKey } },
      body: { workspaceId },
      signal,
    }),
  );
}
