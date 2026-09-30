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

/** Moving a subscription to another version (backend §12.1 #126). */
export const MOVE_REFUSALS: Readonly<Record<string, string>> = {
  approvals_pending:
    'An approval for this automation is still waiting. Decide it first, then move.',
  runs_in_flight: 'A run of this automation is still going. Wait for it to finish, then move.',
  version_unavailable: 'That version is no longer available.',
  subscription_archived: 'An archived automation cannot move.',
  invalid_config: 'Its settings do not fit that version. Open Set up, fix them, then move.',
  unmet_connections:
    'That version needs an account this workspace has not connected. Connect it first, or pause the automation and move.',
  setup_incomplete:
    'That version needs a setting this automation does not have yet. Pause it, move, then finish Set up.',
};

/** Issuing or rotating a webhook address (backend §12.1 #91, #109). */
export const WEBHOOK_ISSUE_REFUSALS: Readonly<Record<string, string>> = {
  trigger_kind_mismatch: 'This automation is not started by a webhook.',
  subscription_archived: 'An archived automation has no address.',
};

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
