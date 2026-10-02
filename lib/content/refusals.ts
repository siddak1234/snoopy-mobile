import { PlatformError } from '@/lib/platform/problem';

/**
 * Refusals a person can act on, in words — BUILD-PLAN 24.3.6.
 *
 * The platform names the reason in `details.reason` (RFC 9457 `details`); the
 * words are the website's, ported verbatim from `snoopy/app/account/automations`
 * so a refusal reads the same on a phone as in a browser. Anything not listed is
 * the platform's own message, which is already public by construction
 * (`lib/platform/problem.ts`).
 */

export const WORKSPACE_CHANGED =
  'The active workspace changed. Reload this screen before continuing.';

/** Replacing a connection's account that changed since the screen read it (409). */
export const REPLACEMENT_WAS_STALE =
  'This connection changed since this screen loaded, so nothing was replaced. Reload it to see it, then choose again.';

/** Said to a member, who may see connections but not change them (the Edge answers 403). */
export const CONNECTIONS_MANAGED_BY =
  'Only an owner or admin of this workspace can connect or disconnect an account.';

/** Moving a subscription to another version (backend §12.1 #126). */
export const MOVE_REFUSALS: Readonly<Record<string, string>> = {
  approvals_pending:
    'An approval for this flow is still waiting. Decide it first, then move.',
  runs_in_flight: 'A run of this flow is still going. Wait for it to finish, then move.',
  version_unavailable: 'That version is no longer available.',
  subscription_archived: 'A removed flow cannot move.',
  invalid_config: 'Its settings do not fit that version. Open Set up, fix them, then move.',
  unmet_connections:
    'That version needs an account this workspace has not connected. Connect it first, or pause the flow and move.',
  setup_incomplete:
    'That version needs a setting this flow does not have yet. Pause it, move, then finish Set up.',
};

/** Issuing or rotating a webhook address (backend §12.1 #91, #109). */
export const WEBHOOK_ISSUE_REFUSALS: Readonly<Record<string, string>> = {
  trigger_kind_mismatch: 'This flow is not started by a webhook.',
  subscription_archived: 'A removed flow has no address.',
};

/**
 * Adding an automation: the two reasons the subscription operation allowlists,
 * and only on a 403 — every other 403 is authorization, not a pricing signal
 * (`snoopy/lib/subscription-entitlements.ts`).
 */
const SUBSCRIPTION_REFUSALS: Readonly<Record<string, string>> = {
  over_plan_limit: 'This workspace has reached its current plan limit.',
  entitlements_not_configured:
    'Subscriptions are unavailable while billing entitlements are not configured.',
};

/** Starting a run (backend FR-14, ADR-0030). */
export const RUN_REFUSALS: Readonly<Record<string, string>> = {
  artifact_unavailable: 'That file can no longer be used. Choose it again.',
};

/** A file for a run (FR-14): opening the upload, and completing it. */
export const UPLOAD_REFUSALS: Readonly<Record<string, string>> = {
  content_type_not_accepted: 'This flow does not accept that type of file.',
  file_too_large: 'The file is larger than this flow accepts.',
  subscription_not_live: 'Go live first; a paused flow takes no files.',
  no_file_input: 'This flow does not take a file.',
  session_expired: 'The upload took too long. Choose the file again.',
  no_object: 'The file did not arrive. Choose it again.',
  too_large: 'The file is larger than this flow accepts.',
};

/** The words for a refused Add. */
export function addRefusalMessage(error: unknown, fallback: string): string {
  const pricing = error instanceof PlatformError && error.status === 403 ? SUBSCRIPTION_REFUSALS : {};
  return refusalMessage(error, pricing, fallback);
}

/**
 * The words for a refused run, and whether its files must be chosen again. The
 * input is exactly what the pinned version declares, so a 422 is "check the
 * values", not a platform failure; a 409 is a subscription that is not live.
 */
export function runRefusal(error: unknown): { message: string; fileGone: boolean } {
  if (error instanceof PlatformError && error.status === 422) {
    const reason = error.details?.reason;
    const known =
      typeof reason === 'string' && Object.prototype.hasOwnProperty.call(RUN_REFUSALS, reason)
        ? RUN_REFUSALS[reason]
        : undefined;
    return {
      message: known ?? 'The run was not started. Check each value and try again.',
      fileGone: reason === 'artifact_unavailable',
    };
  }
  if (error instanceof PlatformError && error.status === 409) {
    return { message: 'This flow is not live, so it cannot run.', fileGone: false };
  }
  return { message: refusalMessage(error, {}, 'The run was not started.'), fileGone: false };
}

/** The words for a failed action: its listed reason, else the platform's message. */
export function refusalMessage(
  error: unknown,
  refusals: Readonly<Record<string, string>> = {},
  fallback = 'That did not work. Try again.',
): string {
  if (error instanceof PlatformError) {
    const reason = error.details?.reason;
    if (typeof reason === 'string' && Object.prototype.hasOwnProperty.call(refusals, reason)) return refusals[reason]!;
    return error.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
