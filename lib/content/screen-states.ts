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
  | 'archived'
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
  archived: "Couldn't load your archived flows",
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
/**
 * Archived flows (24.11.8; "Archive flow" / "Archived flows" since the owner's
 * decision 4 of 2026-10-02, 24.12): kept with their history, addable again.
 */
export const ARCHIVED_FLOWS_TITLE = 'Archived flows';
export const ARCHIVED_FLOWS_NOTE = 'An archived flow keeps its history here. Add it again any time.';
export const ARCHIVED_FLOWS_EMPTY_TITLE = 'No archived flows';
export const ARCHIVED_FLOWS_EMPTY_BODY = 'A flow you archive keeps its history here, and you can add it again.';
export function archivedFlowBody(archivedOn?: string): string {
  return `This flow was archived${archivedOn ? ` on ${archivedOn}` : ''}. Its runs stay in Activity, and you can add it again — its setup starts fresh.`;
}
export const ADD_AGAIN_LABEL = 'Add it again';
/**
 * The archived flow has a live twin — added again in the same scope (build 11,
 * D3): no "Add it again"; the twin's page is one tap away.
 */
export function archivedFlowAddedAgainBody(archivedOn?: string): string {
  return `This flow was archived${archivedOn ? ` on ${archivedOn}` : ''}. Its runs stay in Activity. It has been added again, and the new copy is in Flows.`;
}
export const OPEN_LIVE_FLOW_LABEL = 'Open the live flow';
/** A run row whose flow was archived says so (24.11.8). */
export const RUN_FLOW_ARCHIVED = 'Flow archived';

/**
 * The whole-screen empties (24.12, the owner's decision 6 of 2026-10-02): a
 * screen with nothing on it is the centred standard — icon, title, one line,
 * and an action where there is one — and a section with nothing in it keeps its
 * own line.
 */
export const TEAMS_EMPTY_TITLE = 'No teams yet';
export const TEAMS_EMPTY_BODY = 'A team has its own flows and its own people.';
export const ORGANIZATION_EMPTY_TITLE = 'No organization yet';
export const ORGANIZATION_EMPTY_BODY =
  'No organization is registered to your email domain. An owner can send you a join link.';
export const CATALOG_EMPTY_TITLE = 'No flows to add yet';
export const CATALOG_EMPTY_BODY = 'More are on the way.';
export const CONNECTIONS_EMPTY_TITLE = 'No integrations yet';

/** The workspace has flows; the chosen team has none (24.9.2; teams since 24.11.7). */
export const FLOWS_SCOPE_EMPTY_TITLE = 'No flows in this team yet';
export const FLOWS_SCOPE_EMPTY_BODY = 'Add one here, or pick All teams above to see every flow.';
export const ACTIVITY_EMPTY_TITLE = 'No activity yet';
export const ACTIVITY_EMPTY_BODY = 'Every run lands here the moment your first agent goes live.';
export const ACTIVITY_SCOPE_EMPTY = 'No runs in this team yet.';
/** The one way in, named for what it does (24.9.3): "Flows will be the name". */
export const ADD_FLOW_LABEL = 'Add a flow';
/** Under the first-run empty when archived flows exist in the scope (build 11, D6): the way to them. */
export const ARCHIVED_FLOWS_LABEL = 'Archived flows';

/**
 * Setup's team (build 11, D4; the owner's build 10 item 7: "Each flow has to
 * be in a team"): a flow is added to a team, never to the whole workspace, in
 * both clients. With no team to add to, an owner or admin makes one first; a
 * plain member asks to join one where the organization has a team they are not
 * on — the team directory lists one — with See teams (F84: found by the
 * website's change audit, 2026-10-03, where the member line was false), and
 * otherwise waits for an owner or admin to make the first.
 */
export const SETUP_PICK_A_TEAM = 'Pick a team.';
export const SETUP_CREATE_A_TEAM_FIRST = 'Create a team first.';
export const SETUP_CREATE_A_TEAM = 'Create a team';
export const SETUP_ASK_TO_JOIN_A_TEAM_FIRST = 'Ask to join a team first.';
export const SETUP_SEE_TEAMS = 'See teams';
export const SETUP_FIRST_TEAM_IS_AN_ADMINS = 'An owner or admin creates the first team.';

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
 * The Notifications card: the ask for device push (build 11, D8 — BUILD-PLAN
 * 24.13.6, ADR-0035). It replaces "This build shows held runs and failures in
 * this in-app inbox. Device push delivery is not configured.", the sentence the
 * owner's build 10 item 13 asked about ("What do we need to do here?").
 *
 * The card is the only ask, and never a prompt at launch: iOS asks at the "Turn
 * on" tap, the Face ID rule, and "Not now" holds for the session. A platform
 * from before the devices route says so in words, never a problem title — the
 * Unlink precedent (24.12).
 */
export const PUSH_CARD_TITLE = 'Know the moment something needs you';
export const PUSH_CARD_BODY = 'Get a notification on this phone when a run is held or fails.';
export const PUSH_TURN_ON_LABEL = 'Turn on';
export const PUSH_NOT_NOW_LABEL = 'Not now';
/** iOS will not ask again: only its Settings can turn notifications on. */
export const PUSH_DENIED_BODY = 'Notifications for Autom8x are off in iOS Settings.';
export const PUSH_OPEN_SETTINGS_LABEL = 'Open Settings';
/** Android, or a simulator: build 11 registers nothing there (no FCM credential; backend §12.1 #211). */
export const PUSH_LATER_BUILD_BODY = 'Notifications on this phone are coming in a later build.';
/** The platform answered 404 or 503 for its devices route: it is from before the route. */
export const PUSH_NOT_YET_BODY = "Notifications aren't available yet.";
/** No push token on this build: no push entitlement, or the token service refused it. */
export const PUSH_NOT_ON_BUILD_BODY = "Notifications aren't available on this build.";
/** Any other failed registration, under the ask, which is offered again. */
export const PUSH_FAILED = "Notifications couldn't be turned on. Try again.";

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
