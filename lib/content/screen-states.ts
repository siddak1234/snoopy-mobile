import { tryAgainIn } from '@/lib/platform/retry-after';

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
  | 'data'
  | 'vendor';

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
  teams: "Couldn't load your departments",
  team: "Couldn't load this department",
  billing: "Couldn't load billing",
  account: "Couldn't load your account",
  data: "Couldn't load data export",
  vendor: "Couldn't load this flow's integrations",
};

/** The design's own fallback for a screen not in the map. */
export const FALLBACK_ERROR_TITLE = "Couldn't load this";

export function errorTitleFor(screen: ScreenKey | string | undefined): string {
  if (!screen) return FALLBACK_ERROR_TITLE;
  return ERROR_TITLES[screen as ScreenKey] ?? FALLBACK_ERROR_TITLE;
}

/**
 * Shared body copy — identical on every screen, so it is written once.
 *
 * The website's words since Gate 24 (`snoopy/components/dashboard/
 * PlatformUnavailable.tsx`): a load that failed is never a sign-out, and says
 * so. Only a 401 ends a session (`hooks/use-session.tsx`), and that shows the
 * cover, not a failed load — so a person reading one is still signed in. Until
 * Gate 24 the design's "Nothing was lost — it's safe in the cloud. Retry now or
 * come back in a moment.", which never said it.
 */
export const SESSION_KEPT = 'You have not been signed out, and nothing was lost.';

/** The website's body: kept, then "Try again in 30 seconds." for a stated wait, or "in a moment". */
export function sessionKeptBody(retryAfterSeconds?: number): string {
  return `${SESSION_KEPT} ${tryAgainIn(retryAfterSeconds)}`;
}

export const ERROR_BODY = sessionKeptBody();

/** The website's two titles for the platform refusing or failing (`PlatformUnavailable`). */
export const PLATFORM_BUSY_TITLE = 'The platform is busy right now';
export const PLATFORM_FAILED_TITLE = 'The platform could not answer just now';

/**
 * A failed load's body after a 429 (`busyBody`, BUILD-PLAN 24.3.3). The shared
 * state keeps its screen's own title ("Couldn't load approvals"), so the
 * website's busy title leads the body, then its body with the wait.
 */
export function busyLoadBody(retryAfterSeconds?: number): string {
  return `${PLATFORM_BUSY_TITLE}. ${sessionKeptBody(retryAfterSeconds)}`;
}

/**
 * Home's own failure (design sHomeErr), drawn only when nothing on Home could
 * be read, and worded by what happened (Gate 24 parity, G3): offline, the
 * design's connectivity words; busy or failed, the website's titles over
 * `sessionKeptBody`; no backend or no workspace, `UNAVAILABLE_BODY`. Until
 * Gate 24 every failure — a 429, a refusal, an unresolved workspace — said
 * "Check your connection".
 */
export const HOME_OFFLINE_TITLE = "Can't reach Autom8x";
export const HOME_OFFLINE_BODY =
  "Check your connection. Your agents keep running in the cloud and will sync when you're back.";

/**
 * A figure on Home the platform refused or could not answer (Gate 24 parity,
 * G6): it says so on its own and the rest still show, as the website's
 * dashboard does (`readOverview`: "Unavailable"; "Recent activity could not be
 * read just now."). ~~The teams line~~ went with Home's TEAMS (Build 21; the
 * owner's AM5).
 */
export const FIGURE_UNAVAILABLE = 'Unavailable';
export const RECENT_RUNS_UNAVAILABLE = 'Recent activity could not be read just now.';

/**
 * The cover after a session ended while it was in use (Gate 24 parity, G4), in
 * the website's words (`SessionEnded`): why, and that signing in again carries
 * on where the person was.
 */
export const SESSION_ENDED_TITLE = 'Your session has ended';
export const SESSION_ENDED_BODY = 'Sign in again to carry on where you were.';

export const OFFLINE_TITLE = "You're offline";
export const OFFLINE_BODY =
  "Your agents keep running in the cloud. This screen will sync as soon as you're back.";

/**
 * What an unconfigured build or an unresolved workspace says.
 *
 * Deliberately offers nothing to retry. `ERROR_BODY` says "Try again in a
 * moment", which is true of a platform that refused and false of
 * a build with no backend origin — a second attempt runs the same impossible
 * request. Naming the two conditions is what lets a person tell whether to wait
 * or to go and fix something.
 */
export const UNAVAILABLE_BODY =
  'This build has no workspace to read from yet. Sign in again, or check that the app is pointed at your Autom8x workspace.';

export const RETRY_LABEL = 'Retry';
export const BACK_LABEL = 'Go back';

/**
 * The boundary around the Setup dialog and the run's form (BUILD-PLAN 25.8.1,
 * the owner's requirement 1 of 2026-10-08: no app change per automation). A
 * form the app could not draw says so in the failed-load grammar — the thing
 * that failed in the title, `ERROR_BODY`'s kept session — and offers "Try
 * again", the app's word for repeating a failed action (`ActionFailure`),
 * beside Cancel in a dialog; never a white screen. The Setup dialog's title is
 * `errorTitleFor('setup')`; a run's form is no fetching screen, so its title is
 * named here, the thing and not the mechanism. Since 25.8.3 the run's form is
 * the flow page's start controls, drawn on the page, and the same words take
 * its place there (`InlineBoundary`).
 */
export const RUN_FORM_ERROR_TITLE = "Couldn't load this run's form";
export const TRY_AGAIN_LABEL = 'Try again';

/**
 * A field whose control this build does not know (25.8.1): a platform newer
 * than this build may publish a control the closed union here has no row for.
 * The row is the website's — a text input
 * (`snoopy/app/account/flows/ManifestFields.tsx`) — and this line says why, so
 * a person is not left guessing at a box with no explanation. One sentence for
 * a setting and a run's input alike; never the wire token.
 */
export const NEWER_CONTROL_NOTE = 'This field is newer than this build of the app. Enter it as text.';

/**
 * A run's file field (BUILD-PLAN 25.8.3, the flow page's start controls): Take
 * photo beside Upload. The camera is asked for at the press; a person who has
 * turned it off is told where it is turned on again, and that Upload still
 * works — a sentence in the field, never a crash. The words are this app's: the
 * website has no camera of its own until 25.8.5.
 */
export const TAKE_PHOTO_LABEL = 'Take photo';
export const UPLOAD_LABEL = 'Upload';
export const CAMERA_OFF = 'Camera access for Autom8x is off in Settings. Turn it on there, or use Upload.';
export const CAMERA_NOT_OPENED = 'The camera could not be opened. Try again.';

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
 * decision 4 of 2026-10-02, 24.12): kept with their history. "Unarchive" since
 * the owner's build 12 item 4 ("Rather than add it again what if we say
 * unarchive") — a new word for what "Add it again" did, a fresh setup of the
 * flow; the platform's archive stays one-way.
 */
export const ARCHIVED_FLOWS_TITLE = 'Archived flows';
export const ARCHIVED_FLOWS_NOTE = 'An archived flow keeps its history here. Unarchive it any time.';
export const ARCHIVED_FLOWS_EMPTY_TITLE = 'No archived flows';
export const ARCHIVED_FLOWS_EMPTY_BODY = 'A flow you archive keeps its history here, and you can unarchive it.';
export function archivedFlowBody(archivedOn?: string): string {
  return `This flow was archived${archivedOn ? ` on ${archivedOn}` : ''}. Its runs stay in Activity, and you can unarchive it — its setup starts fresh.`;
}
export const UNARCHIVE_LABEL = 'Unarchive';
/**
 * The archived flow has a live twin — the workspace holds it again, in any
 * team (build 11, D3; any team since the owner's build 12 item 9): no
 * "Unarchive"; the twin's page is one tap away.
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
export const TEAMS_EMPTY_TITLE = 'No departments yet';
export const TEAMS_EMPTY_BODY = 'A department has its own flows and its own people.';
export const ORGANIZATION_EMPTY_TITLE = 'No organization yet';
export const ORGANIZATION_EMPTY_BODY =
  'No organization is registered to your email domain. An owner can send you a join link.';
export const CATALOG_EMPTY_TITLE = 'No flows to add yet';
export const CATALOG_EMPTY_BODY = 'More are on the way.';
export const CONNECTIONS_EMPTY_TITLE = 'No integrations yet';

/** The workspace has flows; the chosen department has none (24.9.2; departments since 24.11.7). */
export const FLOWS_SCOPE_EMPTY_TITLE = 'No flows in this department yet';
export const FLOWS_SCOPE_EMPTY_BODY = 'Add one here, or pick All departments above to see every flow.';
export const ACTIVITY_EMPTY_TITLE = 'No activity yet';
export const ACTIVITY_EMPTY_BODY = 'Every run lands here the moment your first agent goes live.';
export const ACTIVITY_SCOPE_EMPTY = 'No runs in this department yet.';
/** The one way in, named for what it does (24.9.3): "Flows will be the name". */
export const ADD_FLOW_LABEL = 'Add a flow';
/** Under the first-run empty when archived flows exist in the scope (build 11, D6): the way to them. */
export const ARCHIVED_FLOWS_LABEL = 'Archived flows';

/**
 * The Invoice Processing update's words (2026-10-14; the spec's §3 — final, and
 * the website's too). A flow goes to the team of its category, made by the
 * platform when first needed (backend ADR-0036; the owner: "theres no choose a
 * team"), so ~~"Add to", "Choose a team", "Pick a team.", "Create a team
 * first.", "Create a team", "Ask to join a team first.", "See teams" and "An
 * owner or admin creates the first team."~~ are gone with the team picker.
 */
/** The catalog's line under "Add a flow" (§3.A). */
export const CATALOG_SUBTITLE = 'Ready-made flows for your departments.';
/** Where a flow is, or will be: its department, by its kind (§3.A, §3.B, §3.D; "Department" since round 23). */
export function teamLine(kind: string): string {
  return `Department: ${kind}`;
}
/** Turn on, where a flow is not live (§3.B; since Build 21 in its Step 1 and at the bottom of its page). */
export const SETUP_TURN_ON = 'Turn on';
export const SETUP_TURNING_ON = 'Turning on…';
/** A chosen vendor not connected (§3.B, §3.D; Build 21's A3 vendor row, in the warning colour). */
export const VENDOR_NOT_CONNECTED = 'Not connected';
/** Refusals, nothing sent (§3.B; since Build 21 Step 1's owed line and Add's). */
export function connectFirstOrNone(displayName: string): string {
  return `Connect ${displayName} first, or choose None.`;
}
export function connectFirst(names: string): string {
  return `Connect ${names} first.`;
}
export function fillIn(titles: string): string {
  return `Fill in: ${titles}.`;
}
export function enterAnAmount(titles: string): string {
  return `Enter an amount for ${titles}.`;
}
export const SETUP_ADD_FAILED = 'Could not add this flow. Try again.';
export const SETUP_TURN_ON_FAILED = 'Could not turn it on. Try again.';
/** Set up's button for a flow already on or paused, which keeps its status (Build 21; the owner's AM4). */
export const SETUP_SAVE = 'Save';
export const SETUP_SAVING = 'Saving…';
export const SETUP_SAVE_FAILED = 'Could not save. Try again.';

/**
 * The choices page (§3.C; Build 21's A2: a tap saves and goes back). ~~"Connect
 * vendor ›", "Done", "Save", "Saving…" as buttons, and "Disconnect from
 * QuickBooks"~~ are gone (the owner's build 20 items 2, 4, 5 and his ~04:15Z
 * "we will list on apples app store not intuits. so we do not need that").
 * Titled as the flow page's step 2 since Build 22 (the session's S21: one word
 * for one thing; the owner's build 21 item 5: "2. Connect integration … if i
 * click that button it should take me to the choices I have like none or
 * quickbooks"); ~~"Connect vendor"~~ until Build 22.
 */
export const VENDOR_TITLE = 'Connect integration';
export function vendorFor(flowName: string): string {
  return `For ${flowName}`;
}
export const VENDOR_CONNECTED = 'Connected';
export const VENDOR_ASK_ADMIN = 'Ask an owner or admin to connect it.';
/** Under a member's integration choices (round 23, B3; backend ADR-0043): none is theirs to change. */
export const VENDOR_ADMIN_ONLY = 'Only an owner or admin can change the integration.';
export const VENDOR_NONE_SUB = 'Save the details only.';
/** The tapped row's line while its choice is saved. */
export const VENDOR_SAVING = 'Saving…';
export const VENDOR_SAVE_FAILED = 'Could not save. Try again.';

/**
 * The one connection row (Build 21, spec A4; the owner's build 20 items 6 and 7:
 * "Logo then to the right name then below the account email", "Standard format
 * and size for each connection component on the list not random buttons"):
 * line 2 says the account's email, else its state; one button, ours.
 */
export const CONNECTION_CONNECTED = 'Connected';
export const CONNECTION_NOT_CONNECTED = 'Not connected';
export const CONNECTION_ATTENTION = 'Needs attention';
export const CONNECT_LABEL = 'Connect';
export const RECONNECT_LABEL = 'Reconnect';
export const DISCONNECT_LABEL = 'Disconnect';
export const DISCONNECTING_LABEL = 'Disconnecting…';
export function disconnectTitle(name: string): string {
  return `Disconnect ${name}?`;
}
/** What Disconnect stops, by the live flows the platform counts (`usedByCount`). */
export function disconnectBody(liveFlows: number): string {
  if (liveFlows === 1) return '1 live flow uses it. It stops until you connect it again.';
  if (liveFlows > 1) return `${liveFlows} live flows use it. They stop until you connect it again.`;
  return 'You can connect it again any time.';
}

/** Account's lead (Build 21, spec A5; the owner's build 20 item 9: "Why is there a paragraph"). */
export const ACCOUNT_LEAD = 'Sign in with any of these.';

/**
 * The flow page (Build 21, spec A6; Build 22, P1–P4): DASHBOARD, STEPS; steps
 * numbered, labels not. ~~CONNECTIONS~~ until Build 22 (the owner's build 21
 * item 7: "Remove the connections in the bottom as well").
 */
export const DASHBOARD_LABEL = 'DASHBOARD';
export const STEPS_LABEL = 'STEPS';

/**
 * The flow page's step 5 and the screen it opens (Build 22, P1 and P5; spec §4;
 * the owner's build 21 item 5: "5. Email sent- this should show the email the
 * automation sends to … When i select this step it should take me to the page
 * where i can edit in a screen the email it should send to"). Who always gets
 * it is the session's D1, approved by the owner (21:12Z): the workspace's owners
 * and admins and the person who starts the run; the screen adds more.
 */
export function andMore(count: number): string {
  return `and ${count} more`;
}
export const EMAIL_TITLE = 'Who gets the email';
export const EMAIL_ALWAYS_LABEL = 'ALWAYS';
export const EMAIL_ALSO_LABEL = 'ALSO SEND TO';
export const EMAIL_STARTER = 'The person who starts the run';
export const EMAIL_ROLE: Readonly<Record<'owner' | 'admin', string>> = { owner: 'Owner', admin: 'Admin' };
/** No extra address; and a run's step 2 when the flow chose no integration (the session's S23). */
export const NONE_LABEL = 'None';
export const EMAIL_PLACEHOLDER = 'Email address';
export const EMAIL_ADD = 'Add';
export const EMAIL_ADDING = 'Adding…';
export const EMAIL_REMOVING = 'Removing…';
export function removeAddress(address: string): string {
  return `Remove ${address}`;
}
/** How many extra addresses a flow holds at most (backend ADR-0041; the session's S13). */
export const EMAIL_EXTRA_LIMIT = 10;
export const EMAIL_LIMIT_REACHED = 'You can add up to 10.';
export const EMAIL_ASK_ADMIN = 'Ask an owner or admin to change this.';
export const EMAIL_INVALID = 'Enter an email address.';
export const EMAIL_DUPLICATE = 'Already on the list.';
export const EMAIL_SAVE_FAILED = 'Could not save. Try again.';
/**
 * The row at the bottom of the flow page that opens Set up again (the owner's
 * AM4, ~22:15Z: "they can have a edit settings/flow/setup thing in the bottom
 * of the flow page in case they want to change how it was set up"); ~~"Set
 * up", a dialog~~ until Build 21.
 */
export const EDIT_SETUP_LABEL = 'Edit setup';

/**
 * A run's page (§3.E; Build 21's A7: every step from the start, a live tracker).
 * ~~PROGRESS~~ is STEPS; each group's line says its state, never a step's own
 * summary (B6; the owner's build 20 items 10 and 11).
 */
export const DETAILS_LABEL = 'DETAILS';
export const DOCUMENTS_LABEL = 'DOCUMENTS';
export const RUN_WORKING = 'Working…';
export const RUN_WAITING_FOR_APPROVAL = 'Waiting for approval.';
export const STEP_WAITING = 'Waiting';
export const STEP_DONE = 'Done';
export const STEP_SKIPPED = 'Skipped';
export const STEP_STOPPED = 'Stopped';
export const STEP_FAILED = 'Failed';
export function stepHeld(reason: string | undefined): string {
  return reason ? `Waiting for approval: ${reason}` : 'Waiting for approval';
}
/**
 * A run's step 5, "Run completed" (round 23, A7; Build 22's S24): its line once
 * the run succeeded — the email sent and when, or still owed — the website's
 * words, byte for byte. ~~"Sent · {time}", "Sending…", "Not sent"~~ until
 * round 23 (S12: the run completed; "Not sent" read as a fault).
 */
export const EMAIL_OWED = 'Sending email…';
export function emailSentLine(time: string): string {
  return `Email sent · ${time}`;
}
/** "Document 1 of 3" (the owner's ~04:05Z: "a json out that clearly seperates accordingly"). */
export function documentOf(index: number, count: number): string {
  return `Document ${index} of ${count}`;
}
export const DOCUMENT_MORE_LINES = 'More lines on the document.';
export const DOWNLOAD_JSON_LABEL = 'Download JSON';
export const DOWNLOAD_FAILED = 'Could not download. Try again.';
export const RUN_ID_LABEL = 'Run ID';

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
 * exactly this reason. Since round 24 (P7) a cleared queue is not drawn at all:
 * the last decided card leaves and the screen returns to Activity.
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

/**
 * Design-owned chrome that was living in ~~`lib/fixtures.ts`~~.
 *
 * These are not stand-ins for server data and never were — they are the design's
 * own vocabulary and copy, which is why they survive the 2026-08-17 decision to
 * delete the prototype fallbacks. The distinction that matters: a fixture
 * *pretends to be* a workspace's data, and these describe the interface itself.
 * `PLAN_BASE_PRICE` is deliberately NOT moved here — a price is a business fact
 * the platform should own, and relocating it would satisfy the gate's wording
 * while defeating its purpose.
 */

/** Activity's four outcomes, over the closed run-status enum: the choices of its outcome drop-down. */
export const ACTIVITY_FILTERS = ['All', 'Success', 'Needs review', 'Failed'] as const;

/**
 * Each outcome as its drop-down says it (round 23, the owner's build 22 items
 * 3–4; S4: "All" alone does not say what).
 */
export const ACTIVITY_FILTER_LABEL: Record<(typeof ACTIVITY_FILTERS)[number], string> = {
  All: 'All runs',
  Success: 'Success',
  'Needs review': 'Needs review',
  Failed: 'Failed',
};

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
  /** Its date and time and the version it ran, the website's line ("Oct 7, 2026, 9:05 PM · v3"; Gate 24's parity pass). */
  stamp: string;
  /** When the run was made, as published: the time range selects on it (the owner's build 13 decision 4). */
  createdAt: string;
};

/**
 * One decision, in the run's step 4 and on a Needs-review card (round 24 P6,
 * P7; the owner's build 23 F7–F11): Approve, and Deny in the danger colour (S6:
 * the owner says deny; the API's value stays `rejected`), each saying it is
 * saving while it is. ~~"Approved ✓ — agent resuming", "Rejected — sent back to
 * sender"~~ until round 24: a decided card leaves.
 */
export const APPROVE_LABEL = 'Approve';
export const DENY_LABEL = 'Deny';
export const APPROVING_LABEL = 'Approving…';
export const DENYING_LABEL = 'Denying…';
export const DECISION_NOT_SAVED = 'The decision was not saved.';
/** A held step whose approval was denied (round 24 P6, S6). */
export const STEP_DENIED = 'Denied';
