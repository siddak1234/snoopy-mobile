import type { components } from '@/lib/generated/platform-contracts/platform';

export type WorkspaceRole = components['schemas']['WorkspaceSummary']['role'];

/**
 * Owner or admin — who the platform lets connect or disconnect an account,
 * export a workspace, set a webhook address, or see and change its billing.
 *
 * The Edge enforces it on every call and refuses a member (403). A screen asks
 * only so it does not offer what would be refused (BUILD-PLAN 24.3.6, 22.8.1).
 * Ported by name from `snoopy/lib/tenancy.ts` `administers`, so both clients
 * draw the same line.
 */
export function administers(role: WorkspaceRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
