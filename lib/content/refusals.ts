import { ITEM_NOT_UPLOADED, SETUP_ADD_FAILED, SETUP_TURN_ON_FAILED } from '@/lib/content/screen-states';
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

/**
 * The rest of the website's Connections page (`ConnectionsPanel.tsx`): a
 * connection with an `errorCode`; and a pasted key answered 409 — the key
 * reused with other values, or its first request still verifying — where
 * retrying with the same key is the way on. (~~"Only providers configured for
 * this deployment are shown."~~ — gone from both clients with the Invoice
 * Processing update, spec §3.I.)
 */
export const CONNECTION_NEEDS_ATTENTION = 'This connection needs attention before it can be used.';
export const KEY_REQUEST_IN_PROGRESS =
  'This request may still be in progress. Retry with the same details or refresh the connection list; a new connection request was not created.';

/** A connect that came back from the provider with the connection (the website's `status=connected`). */
export const CONNECTION_COMPLETED = 'Connection completed successfully.';

/**
 * Connect or Reconnect answered `reused`: the live connection already holds
 * every permission the provider asks for, so nothing was asked of anyone.
 */
export function alreadyConnected(provider: string, account: string): string {
  return `${provider} is already connected as ${account}, with everything it needs — there is nothing to authorize.`;
}

/**
 * A connect that came back from the provider without the connection (the
 * website's `status=error`): nothing changed, and a live connection, when the
 * provider has one, still works.
 */
export function connectionIncomplete(stillConnected: boolean): string {
  return stillConnected
    ? "The new authorization didn't complete, so nothing changed — your existing connection is still active. Try again or contact an owner."
    : 'The connection could not be completed. Try again or contact an owner.';
}

/**
 * ~~`MOVE_REFUSALS`, moving a subscription to another version (backend §12.1
 * #126)~~ until Build 22: no client moves a flow — the platform moves every
 * flow to the newest version (backend ADR-0041; the owner's build 21 item 7).
 */

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

/**
 * A run refused 429 because its flow is at capacity AND the flow's queue is
 * full (backend BUILD-PLAN 25.2.10, `details.reason` `max_concurrent_runs`): as
 * many runs are going as the flow runs at once, and as many again are waiting
 * their turn — a run that waits is created and drawn Queued. Nothing was
 * created and the person did nothing wrong. The website's sentence, verbatim
 * (`snoopy/app/account/flows/actions.ts`, its `FLOW_QUEUE_FULL`): the run was
 * not started, and only a run of this flow ending makes room, which the
 * platform's "busy right now" does not say. `creation_contended` (the count not
 * taken in time, so the queue is not known to be full) keeps the busy words, as
 * on the website.
 */
export const FLOW_QUEUE_FULL =
  'This flow is busy and its queue is full, so the run was not started. Try again once one of its runs has ended.';

/**
 * A file for a run (FR-14): opening the upload, and completing it. Since the
 * platform measures a file when its upload is sealed (backend BUILD-PLAN 25.2.28),
 * a flow that declares page or pixel limits refuses one that breaks them, or one
 * that is not what it says, before any run exists: the five reasons from
 * `file_too_many_pages` to `file_unreadable`. The website's sentences, verbatim
 * (`snoopy/app/account/flows/upload-refusals.ts`).
 *
 * `measurement_busy` is not a refusal (backend BUILD-PLAN 25.2.39, SYSTEM-MANIFEST
 * §12.1 #272): files are measured in turn, a workspace's one at a time, and a
 * completion that finds no place yet is answered 429 at once, nothing measured
 * and nothing lost. `sendRunFile` completes the same upload again by itself, at
 * most four more times; only a file still waiting after the last is said, in
 * the website's sentence, never the transport's busy words. The field is then
 * emptied as after any refusal, so the sentence asks for the file again.
 */
export const UPLOAD_REFUSALS: Readonly<Record<string, string>> = {
  content_type_not_accepted: 'This flow does not accept that type of file.',
  file_too_large: 'The file is larger than this flow accepts.',
  subscription_not_live: 'Turn it on first; a paused flow takes no files.',
  no_file_input: 'This flow does not take a file.',
  session_expired: 'The upload took too long. Choose the file again.',
  no_object: 'The file did not arrive. Choose it again.',
  too_large: 'The file is larger than this flow accepts.',
  file_too_many_pages: 'This PDF has more pages than this flow reads.',
  file_image_too_large: 'This image is larger than this flow takes.',
  file_content_mismatch: "This file's contents don't match its type. Choose the original file again.",
  file_encrypted: 'This PDF is password-protected. Remove the password and upload it again.',
  file_unreadable: 'This file could not be read. Choose it again, or try another copy.',
  measurement_busy: 'Files are checked one at a time. Nothing was lost. Choose the file again in a moment.',
};

/** A whole number from a refusal's details — the platform sends each as a string of digits — or nothing. */
function wholeNumber(details: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = details?.[key];
  if (typeof value === 'string' && /^[0-9]{1,9}$/u.test(value)) return String(Number(value));
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return undefined;
}

/**
 * The words for a refused upload. The two measured refusals say their numbers
 * when the platform sends them as whole numbers; a value that is not one is
 * never shown, and the sentence without numbers is said instead, as on the
 * website. A reason not named here keeps the platform's own words.
 */
export function uploadRefusalMessage(error: unknown, fallback: string): string {
  if (error instanceof PlatformError) {
    const details = error.details;
    if (details?.reason === 'file_too_many_pages') {
      const pages = wholeNumber(details, 'pageCount');
      const most = wholeNumber(details, 'maximumPdfPages');
      if (pages && most) return `This PDF has ${pages} pages. This flow reads at most ${most}.`;
    }
    if (details?.reason === 'file_image_too_large') {
      const width = wholeNumber(details, 'widthPixels');
      const height = wholeNumber(details, 'heightPixels');
      const most = wholeNumber(details, 'maximumImageSidePixels');
      if (width && height && most) {
        return `This image is ${width} × ${height} pixels. This flow takes images up to ${most} pixels on a side.`;
      }
    }
  }
  return refusalMessage(error, UPLOAD_REFUSALS, fallback);
}

/**
 * Activate, for a flow the workspace came to hold since Setup read its flows —
 * a second copy, which a workspace never holds (the owner's build 12 item 9).
 */
export const ALREADY_IN_WORKSPACE = 'This flow is already in this workspace.';

/** The words for a refused Add. */
export function addRefusalMessage(error: unknown, fallback: string): string {
  const pricing = error instanceof PlatformError && error.status === 403 ? SUBSCRIPTION_REFUSALS : {};
  return refusalMessage(error, pricing, fallback);
}

/**
 * Set up's Turn on, refused (the Invoice Processing update, spec §3.B): the
 * plan's own words where the platform names a plan reason; an add it could not
 * make — the workspace or the flow's team not found (404), or the team service
 * not answering (502) — "Could not add this flow. Try again."; anything else
 * "Could not turn it on. Try again." Plain words, never the platform's own
 * sentence (the owner's build 19 item 8).
 */
export function turnOnRefusal(error: unknown, adding: boolean): string {
  if (error instanceof PlatformError) {
    const reason = error.details?.reason;
    if (
      error.status === 403 &&
      typeof reason === 'string' &&
      Object.prototype.hasOwnProperty.call(SUBSCRIPTION_REFUSALS, reason)
    ) {
      return SUBSCRIPTION_REFUSALS[reason]!;
    }
    if (adding && (error.status === 404 || error.status === 502)) return SETUP_ADD_FAILED;
  }
  return SETUP_TURN_ON_FAILED;
}

/**
 * The words for a refused run, and whether its files must be chosen again. The
 * input is exactly what the pinned version declares, so a 422 is "check the
 * values", not a platform failure; a 409 is a subscription that is not live; a
 * 429 naming `max_concurrent_runs` is a flow whose queue is full (25.2.10), and
 * any other 429 keeps the platform's busy words and its wait.
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
    // A run naming an item (backend ADR-0046): one still being read, or archived.
    const reason = error.details?.reason;
    if (reason === 'item_not_ready') return { message: ITEM_NOT_READY, fileGone: false };
    if (reason === 'item_archived') return { message: ITEM_ARCHIVED, fileGone: false };
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
  if (error instanceof PlatformRateLimitedError && error.details?.reason === 'max_concurrent_runs') {
    return { message: FLOW_QUEUE_FULL, fileGone: false };
  }
  return { message: refusalMessage(error, {}, 'The run was not started.'), fileGone: false };
}

/** A run refused for its item (backend ADR-0046): still being read, or archived since the page was read — the website's words. */
export const ITEM_NOT_READY = 'Try again in a moment.';
export const ITEM_ARCHIVED = 'It was archived, so it takes no new runs.';

/**
 * Making an item (backend ADR-0046), refused: in the words the upload path and
 * the run's start already use — a file gone is "choose it again" and empties
 * the file, a flow not on is "Turn it on first", over the plan is the run's
 * sentence, and a full queue (429 `max_concurrent_runs`) the run's
 * `FLOW_QUEUE_FULL`. A refused value is said under the form, and each field it
 * names under that field (`fields`): `details.problems` is at most 16 `{ path,
 * message }` pairs, each `path` naming a field as `fields.<key>` (`refusedFields`).
 * The words are the website's.
 */
export function itemRefusal(
  error: unknown,
  fieldKeys: readonly string[] = [],
): { message: string; fileGone: boolean; fields: string[] } {
  if (error instanceof PlatformError) {
    const reason = error.details?.reason;
    if (error.status === 422) {
      return reason === 'artifact_unavailable'
        ? { message: RUN_REFUSALS.artifact_unavailable!, fileGone: true, fields: [] }
        : { message: CHECK_EACH_VALUE, fileGone: false, fields: refusedFields(error.details?.problems, fieldKeys) };
    }
    if (error.status === 409) {
      return {
        message: reason === 'subscription_not_live' ? UPLOAD_REFUSALS.subscription_not_live! : FLOW_CHANGED,
        fileGone: false,
        fields: [],
      };
    }
    if (error.status === 403 && (reason === 'over_plan_limit' || reason === 'entitlements_not_configured')) {
      return { ...runRefusal(error), fields: [] };
    }
  }
  if (error instanceof PlatformRateLimitedError && error.details?.reason === 'max_concurrent_runs') {
    return { message: FLOW_QUEUE_FULL, fileGone: false, fields: [] };
  }
  return { message: refusalMessage(error, {}, ITEM_NOT_UPLOADED), fileGone: false, fields: [] };
}

/**
 * The fields a refusal's `details.problems` names, among the item's own: each
 * `path` read as `fields.<key>` (or the key alone), kept only when it is one of
 * `fieldKeys` — anything else names no field. As the website reads them.
 */
export function refusedFields(problems: unknown, fieldKeys: readonly string[]): string[] {
  if (!Array.isArray(problems)) return [];
  const named = new Set<string>();
  for (const problem of problems) {
    const path = problem && typeof problem === 'object' && 'path' in problem ? (problem as { path: unknown }).path : undefined;
    if (typeof path !== 'string') continue;
    const key = path.replace(/^\$?\.?(?:fields\.)?/u, '').split('.')[0]!;
    if (fieldKeys.includes(key)) named.add(key);
  }
  return [...named];
}
/** Under the upload card when a value was refused, and under the field it names (the website's words). */
export const CHECK_EACH_VALUE = 'Nothing was uploaded. Check each value and try again.';
export const CHECK_THIS_VALUE = 'Check this value.';
/** A flow whose version no longer declares items: the page was read before it changed. */
const FLOW_CHANGED = 'This flow has changed. Go back and open it again.';

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
