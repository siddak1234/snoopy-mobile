import { PlatformError, PlatformRateLimitedError } from '@/lib/platform/problem';

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
  subscription_archived: 'An archived flow cannot move.',
  // Answered with that version's fields in the move dialog (backend §12.1 #185):
  // Set up draws the version the flow runs, so it could not fix a mismatch.
  invalid_config: 'Its settings do not fit that version. Set them for it to move.',
  unmet_connections:
    'That version needs an account this workspace has not connected. Connect it first, or pause the flow and move.',
  setup_incomplete:
    'That version needs a setting this flow does not have yet. Pause it, move, then finish Set up.',
};

/** Issuing or rotating a webhook address (backend §12.1 #91, #109). */
export const WEBHOOK_ISSUE_REFUSALS: Readonly<Record<string, string>> = {
  trigger_kind_mismatch: 'This flow is not started by a webhook.',
  subscription_archived: 'An archived flow has no address.',
};

/**
 * Unlinking a sign-in account (backend 24.11.1), by the reason the platform
 * names. Its sentence is the problem's `detail`, which the transport does not
 * keep — the error's message is the problem's TITLE ("Bad Request", "Not
 * Found"), and the owner's build 9 showed exactly that (24.12).
 */
export const UNLINK_REFUSALS: Readonly<Record<string, string>> = {
  primary: 'The account you signed up with stays linked.',
  last: 'The last sign-in account stays linked.',
  refused: 'This sign-in account cannot be unlinked.',
};

/**
 * The words for a refused unlink — never a bare problem title. A 404 that names
 * its method and path is the Edge's own "no such route": a platform from before
 * the unlink route was promoted, so not available yet. Any other 404 is an
 * account that is not linked. A 429 keeps its wait.
 */
export function unlinkRefusal(error: unknown): string {
  if (error instanceof PlatformRateLimitedError) return error.message;
  if (error instanceof PlatformError) {
    if (error.status === 404) {
      const route = typeof error.details?.method === 'string' && typeof error.details?.path === 'string';
      return route ? "Unlinking isn't available yet." : 'That sign-in account is not linked.';
    }
    const reason = error.details?.reason;
    if (typeof reason === 'string' && Object.prototype.hasOwnProperty.call(UNLINK_REFUSALS, reason)) {
      return UNLINK_REFUSALS[reason]!;
    }
  }
  return 'The account could not be unlinked.';
}

/**
 * Creating a team (24.12): one team of each kind in a workspace (409, reason
 * `team_kind_taken`), and in an organization only its owners and admins (403).
 */
export function teamCreateRefusal(error: unknown, kind: string): string {
  if (error instanceof PlatformError && error.status === 409 && error.details?.reason === 'team_kind_taken') {
    return `This workspace already has a team for ${kind}.`;
  }
  if (error instanceof PlatformError && error.status === 403) return 'Only an owner or admin can create a team here.';
  return refusalMessage(error, {}, 'The team could not be created.');
}

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

/**
 * Over the plan's flow allowance (decision 7a3), in the website's words: what
 * the plan allows, what the workspace holds, and how many to archive. Paused and
 * draft flows count, so the sentence says archive.
 */
export function overPlanSentence(allowed: number, live: number): string {
  const flows = allowed === 1 ? 'flow' : 'flows';
  return `Your plan allows ${allowed} ${flows}; this workspace has ${live}. No flow can start a run until you archive ${live - allowed}. Paused and draft flows count.`;
}

/** A run refused because billing entitlements are not configured: every start is, until they are. */
export const RUNS_UNCONFIGURED = 'Runs are unavailable while billing entitlements are not configured.';

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
  // Over the plan (decision 7a3): its numbers when the platform gave them; every
  // other 403 is authorization and carries no reason.
  if (error instanceof PlatformError && error.status === 403) {
    const { reason, limit, live } = error.details ?? {};
    if (reason === 'over_plan_limit') {
      const counted = Number.isSafeInteger(limit) && Number.isSafeInteger(live) && (live as number) > (limit as number);
      return {
        message: counted ? overPlanSentence(limit as number, live as number) : SUBSCRIPTION_REFUSALS.over_plan_limit!,
        fileGone: false,
      };
    }
    if (reason === 'entitlements_not_configured') return { message: RUNS_UNCONFIGURED, fileGone: false };
  }
  return { message: refusalMessage(error, {}, 'The run was not started.'), fileGone: false };
}

/**
 * The organization's domain-only setting (the owner's build 13 decision 8B): its
 * name, what it does, and its refusals — the same words on the website.
 */
export const DOMAIN_ONLY_TITLE = 'Verified domains only';
export const DOMAIN_ONLY_SUB =
  "Only people who sign in with addresses at your verified domains can join, and members can't link an account outside them.";

/**
 * A refused change to the setting. Turning it on needs a verified domain and
 * every member's sign-ins inside one; nobody is removed, and a member the
 * platform has not seen since the setting arrived counts as outside until they
 * sign in again (the platform cannot know their accounts before then).
 */
export function domainOnlyRefusal(error: unknown): string {
  if (error instanceof PlatformError && error.status === 409) {
    const { reason, count } = error.details ?? {};
    if (reason === 'no_verified_domain') return 'Verify a domain before limiting the organization to it.';
    if (reason === 'members_outside_domain') {
      const counted = Number.isSafeInteger(count) && (count as number) > 0;
      const who = !counted ? 'Some members sign' : count === 1 ? '1 member signs' : `${count} members sign`;
      return `${who} in with an address outside your verified domains, so this can't be turned on yet. Nobody is removed. A member who hasn't signed in since this setting arrived counts until they sign in again.`;
    }
  }
  return refusalMessage(error, {}, 'The setting could not be saved.');
}

/** Asking to join an organization that admits only its verified domains (8B). */
export const JOIN_REFUSALS: Readonly<Record<string, string>> = {
  outside_org_domain: 'This organization admits only people who sign in with addresses at its verified domains.',
};

/** Approving someone who signs in from outside them while the setting is on (8B). */
export const DECISION_REFUSALS: Readonly<Record<string, string>> = {
  outside_org_domain:
    "This person signs in with an address outside your verified domains, so they can't join while Verified domains only is on.",
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
