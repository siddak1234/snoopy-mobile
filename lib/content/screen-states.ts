/**
 * The words the shared data states render, transcribed from the design.
 *
 * One grammar covers every fetching screen (`gLoad` / `gErr` / `gOff` in
 * `Screen.dc.html`): a skeleton in the screen's own layout, a failed load with
 * Retry and Go back, and an offline hero. Only the failed-load *title* differs
 * per screen, so only that is a map.
 *
 * The design ratified the boundary between the two kinds of failure, and it is
 * worth restating because it decides which treatment a screen reaches for:
 * `gErr` and `gOff` are **load** states, shown when there is nothing on screen
 * yet. A failure of an *action* on data that did load is **always inline** — a
 * callout naming what did not happen, with the data left in place. Nothing the
 * person was reading is destroyed in order to report an error.
 */

/** Screens that fetch, keyed as the design keys them. */
export type ScreenKey =
  | 'run'
  | 'detail'
  | 'approvals'
  | 'notifications'
  | 'settings'
  | 'flows'
  | 'activity'
  | 'add'
  | 'templates'
  | 'setup'
  | 'configure'
  | 'organization'
  | 'removed'
  | 'teams'
  | 'team'
  | 'billing'
  | 'account'
  | 'data';

/** `gErrTitle` — the design names the thing that failed, never the mechanism. */
const ERROR_TITLES: Record<ScreenKey, string> = {
  run: "Couldn't load this run",
  detail: "Couldn't load this flow",
  approvals: "Couldn't load approvals",
  notifications: "Couldn't load notifications",
  settings: "Couldn't load settings",
  flows: "Couldn't load your flows",
  activity: "Couldn't load activity",
  add: "Couldn't load the flow catalog",
  templates: "Couldn't load templates",
  setup: "Couldn't load this setup",
  configure: "Couldn't load this template",
  organization: "Couldn't load your organization",
  removed: "Couldn't load your removed flows",
  teams: "Couldn't load your teams",
  team: "Couldn't load this team",
  billing: "Couldn't load billing",
  account: "Couldn't load your account",
  data: "Couldn't load data export",
};

/** The design's own fallback for a screen not in the map. */
export const FALLBACK_ERROR_TITLE = "Couldn't load this";

export function errorTitleFor(screen: ScreenKey | string | undefined): string {
  if (!screen) return FALLBACK_ERROR_TITLE;
  return ERROR_TITLES[screen as ScreenKey] ?? FALLBACK_ERROR_TITLE;
}

/** Shared body copy — identical on every screen, so it is written once. */
export const ERROR_BODY =
  "Nothing was lost — it's safe in the cloud. Retry now or come back in a moment.";

export const OFFLINE_TITLE = "You're offline";
export const OFFLINE_BODY =
  "Your agents keep running in the cloud. This screen will sync as soon as you're back.";

/**
 * What an unconfigured build or an unresolved workspace says.
 *
 * Deliberately offers nothing to retry. `ERROR_BODY` promises "Retry now or
 * come back in a moment", which is true of a platform that refused and false of
 * a build with no backend origin — a second attempt runs the same impossible
 * request. Naming the two conditions is what lets a person tell whether to wait
 * or to go and fix something.
 */
export const UNAVAILABLE_BODY =
  'This build has no workspace to read from yet. Sign in again, or check that the app is pointed at your Autom8x workspace.';

export const RETRY_LABEL = 'Retry';
export const BACK_LABEL = 'Go back';

/**
 * What an unreachable automation says, in one sentence.
 *
 * `AutomationCatalogEntry.available` is "evidence from a reachability probe,
 * never an assumption". The completed web client refuses Add and Go live on it
 * and prints this line; the mobile client says the same thing so the two
 * clients refuse the same journey for the same reason.
 */
export const UNAVAILABLE_NOTE = 'Not responding — it cannot run yet.';

/**
 * The first-run empties.
 *
 * These are not the filtered-empty lines the screens already had. Flows read
 * *"No workflows match {{q}}"* and Activity *"No … runs in the last two days"* —
 * both assume a search or a filter, so a workspace that simply has nothing yet
 * got copy that made no sense. The design added a genuine first-run state for
 * each, in Home's grammar: an invitation with somewhere to go, never a dead end.
 */
export const FLOWS_EMPTY_TITLE = 'No flows yet';
export const FLOWS_EMPTY_BODY = 'Add a prebuilt flow — your first one can be live in minutes.';
/** Removed flows (24.11.8): archived, kept with their history, addable again. */
export const REMOVED_FLOWS_TITLE = 'Removed flows';
export const REMOVED_FLOWS_NOTE = 'A removed flow keeps its history here. Add it again any time.';
export const REMOVED_FLOWS_EMPTY = 'Nothing removed here.';
export const REMOVED_FLOW_BODY =
  'This flow was removed. Its runs stay in Activity, and you can add it again — its setup starts fresh.';
export const ADD_AGAIN_LABEL = 'Add it again';
/** A run row whose flow was removed says so (24.11.8). */
export const RUN_FLOW_REMOVED = 'Flow removed';

/** The workspace has flows; the chosen team has none (24.9.2; teams since 24.11.7). */
export const FLOWS_SCOPE_EMPTY_TITLE = 'No flows in this team yet';
export const FLOWS_SCOPE_EMPTY_BODY = 'Add one here, or pick All teams above to see every flow.';
export const ACTIVITY_EMPTY_TITLE = 'No activity yet';
export const ACTIVITY_EMPTY_BODY = 'Every run lands here the moment your first agent goes live.';
export const ACTIVITY_SCOPE_EMPTY = 'No runs in this team yet.';
/** The one way in, named for what it does (24.9.3): "Flows will be the name". */
export const ADD_FLOW_LABEL = 'Add a flow';

/**
 * `notifsEmpty` — and note it is not an apology.
 *
 * The design's words explain the product's own rule rather than treating silence
 * as absence: notifications exist for held runs and failures, so an empty inbox
 * is the system working. It carries no action for the same reason.
 */
/**
 * Approvals distinguishes "you decided everything" from "there was nothing".
 *
 * The screen had one line — "All caught up — decisions synced to your
 * workflows" — and showed it whenever nothing was pending, including to a
 * person who arrived with an empty queue and decided nothing. Claiming a
 * synchronisation that never happened is the same class of untruth as a
 * fabricated count; the design splits `apprEmpty` from `apprAllDone` for
 * exactly this reason.
 */
export const APPROVALS_EMPTY_TITLE = 'Nothing needs review';
export const APPROVALS_EMPTY_BODY =
  'When an agent pauses for a human decision, it waits for you here.';

export const NOTIFICATIONS_EMPTY_TITLE = 'Quiet, as designed';
export const NOTIFICATIONS_EMPTY_BODY =
  'We only notify you for held runs and failures. Nothing needs you right now.';

/**
 * `soFail` — sign-out could not revoke the session.
 *
 * The wording is load-bearing rather than decorative. ADR-0017 §4 has the Edge
 * answer 502 instead of 204 when revocation fails, so that a device does not
 * delete a keychain entry for a session that is still live upstream. The screen
 * therefore has to say two true things at once: the sign-out did not happen,
 * and nothing local was thrown away.
 */
export const SIGN_OUT_FAILED =
  "Sign-out didn't complete — this session couldn't be revoked, so you're still signed in on this device. Nothing was cleared.";
export const SIGN_OUT_RETRY = 'Retry sign out';

/**
 * Design-owned chrome that was living in `lib/fixtures.ts`.
 *
 * These are not stand-ins for server data and never were — they are the design's
 * own vocabulary and copy, which is why they survive the 2026-08-17 decision to
 * delete the prototype fallbacks. The distinction that matters: a fixture
 * *pretends to be* a workspace's data, and these describe the interface itself.
 * `PLAN_BASE_PRICE` is deliberately NOT moved here — a price is a business fact
 * the platform should own, and relocating it would satisfy the gate's wording
 * while defeating its purpose.
 */

/** Activity's four filter chips, over the closed run-status enum. */
export const ACTIVITY_FILTERS = ['All', 'Success', 'Needs review', 'Failed'] as const;

/** A row in the activity list, after mapping. */
export type ActivityItem = {
  /** Stable run identity; list position is not identity. */
  id: string;
  /** The flow it ran for — what a project scope selects by (24.9.2). */
  subscriptionId: string;
  icon: import('phosphor-react-native').Icon;
  /**
   * The run's own published status, carried verbatim.
   *
   * Filtering keys off this rather than off `tone`, because a tone is a
   * treatment shared by several statuses and is therefore not an identity.
   * Keying the chips off tone made "Needs review" — which the design defines as
   * the *held* queue — also list `running`, `pending` and `cancelled` runs,
   * which is the redefinition Gate 8 forbids.
   */
  status: string;
  /**
   * Whether someone still has to decide this run: held, and its approval is
   * pending (or unread). A run stays `held` after its approval, because the
   * approval starts a new run — so "Needs review" keys on this, not on `status`.
   */
  needsReview: boolean;
  /** The full published tone; never narrowed, so no status borrows another's colour. */
  tone: import('@/lib/view/status').StatusTone;
  title: string;
  desc: string;
  time: string;
};

/** The approvals card's confirmation copy. */
export const APPROVAL_DONE_TEXT = {
  approved: 'Approved ✓ — agent resuming',
  rejected: 'Rejected — sent back to sender',
} as const;
