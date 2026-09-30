import type { components } from '@/lib/generated/platform-contracts/platform';
import { platformOperation } from './client';

/**
 * A workspace's data, out (BUILD-PLAN 24.6.3) — `snoopy/lib/exports.ts`'s three
 * operations. Owner or admin: an export holds every member's email, every
 * project and every run, and the Edge refuses anyone else.
 */

type Schema = components['schemas'];
export type WorkspaceExport = Schema['WorkspaceExportResponse'];
export type ExportJob = Schema['WorkspaceExportJob'];

/** A quick summary, each part bounded to its most recent entries. */
export function readBoundedExport(workspaceId: string): Promise<WorkspaceExport> {
  return platformOperation(`/v1/workspaces/${workspaceId}/export`, ({ platform }, signal) =>
    platform.GET('/v1/workspaces/{workspaceId}/export', { params: { path: { workspaceId } }, signal }),
  );
}

/** Everything as one file, staged (backend §12.1 #39). Asking again while one runs answers that one. */
export async function startCompleteExport(workspaceId: string, idempotencyKey: string): Promise<ExportJob> {
  const started = await platformOperation(`/v1/workspaces/${workspaceId}/exports`, ({ platform }, signal) =>
    platform.POST('/v1/workspaces/{workspaceId}/exports', {
      params: { path: { workspaceId }, header: { 'Idempotency-Key': idempotencyKey } },
      signal,
    }),
  );
  return started.export;
}

/** Its state, with a freshly signed link to the file once it is ready. */
export async function readCompleteExport(workspaceId: string, exportId: string): Promise<ExportJob> {
  const found = await platformOperation(`/v1/workspaces/${workspaceId}/exports/${exportId}`, ({ platform }, signal) =>
    platform.GET('/v1/workspaces/{workspaceId}/exports/{exportId}', {
      params: { path: { workspaceId, exportId } },
      signal,
    }),
  );
  return found.export;
}

/** The website's rule: partial when the platform says so, or when a part it included was bounded. */
export function isPartialExport(response: WorkspaceExport): boolean {
  return !response.complete || response.services.some((section) => section.ok && section.data.truncated === true);
}
