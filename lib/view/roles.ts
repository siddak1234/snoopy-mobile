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

/**
 * Whether this person may decide an approval: their role in its workspace is
 * one the approval names (`eligibleRoles`, "Which workspace roles may decide.
 * Checked server-side."). The Edge checks it again and refuses a 403; Approvals
 * asks only so it does not offer Approve and Reject to someone certain to be
 * refused. Ported from the website's Approvals
 * (`role && approval.eligibleRoles.includes(role)`), so both clients draw the
 * same line (Gate 24's parity pass, G20).
 */
export function decides(role: WorkspaceRole | null | undefined, eligibleRoles: readonly WorkspaceRole[]): boolean {
  return Boolean(role && eligibleRoles.includes(role));
}

/** What someone an approval does not name is told instead, in the website's words. */
export function decidersLine(eligibleRoles: readonly WorkspaceRole[]): string {
  return `Only ${eligibleRoles.join(' or ')} can decide this.`;
}
