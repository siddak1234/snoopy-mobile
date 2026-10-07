# Mobile contract — Round 6, amended in Round 7.5M and Round 16

Verified against the sibling master plan, Round 6 playbook, BUILD-PLAN 8.5–8.7,
ADR-0017, and the regenerated platform/automations/connections declarations on
2026-08-17; re-verified against the regenerated declarations on 2026-09-03 and
on 2026-09-29 for Round 16 (`npm run verify:platform-contracts`: current). The published API owns business
truth. This file records how the client consumes it; it does not extend it.

## Completion state

Round 6 closed on 2026-08-18 after two fresh audits (`DESIGN-GAPS.md`). Round
7.5M (2026-09-03) added the workspace switcher, the browser-leg base, the
browserless refusal and the pinned release values; everything is **ready for
the Round 7F fresh audit**, not a declaration that any gate is closed.
`ROUND-7.5-OBSERVATIONS.md` lists what is observed and what is not.

Round 16 (ADR-0032, BUILD-PLAN Phase 24) makes the app offer every signed-in
web feature on the same operations; its findings are in `DESIGN-GAPS.md`'s
Round 16 section. Nothing here is closed by this repository.

## Transport and credential boundary

- Three generated OpenAPI clients are created only in
  `lib/platform/client.ts` with `openapi-fetch`.
- Every operation is typed by its generated path and body. The facade supplies
  bearer middleware, `Cache-Control: no-store`, abort timeout, response parsing,
  and RFC problem mapping.
- Runtime source is forbidden from using raw/indirect fetch, XMLHttpRequest,
  WebSocket, EventSource, axios-like clients, or importing `openapi-fetch`
  elsewhere.
- Two credential-less requests leave the Edge, both in `lib/platform/client.ts`
  and each budgeted to one call by `audit:platform`: the PUT of a run's file to
  the URL the platform signed (`putFileToSignedUrl`, 24.3.4), and since 24.12
  the native download of the complete export's signed link into the app's cache
  (`downloadSignedFile`), for the share sheet.
- Access and refresh tokens are stored as separate SecureStore values with
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; no backup, URL, log, or AsyncStorage copy is
  permitted.

## Authentication and session

The app is not a Google/Microsoft/Apple OAuth client. For a provider login it:

1. generates a device PKCE verifier/challenge;
2. opens the system authentication session at
   `/v1/auth/native/{provider}/start` with the exact claimed HTTPS return URI —
   on the configured browser-leg base (`EXPO_PUBLIC_NATIVE_AUTH_BASE_URL`,
   the origin the deployed `AUTH_CALLBACK_URL` shares, since the Edge's
   transaction cookie is host-only), falling back to the API origin only when
   no base is configured;
3. receives only the backend's sealed, one-use code in that URI;
4. exchanges the code and device verifier at `/v1/auth/native/token`;
5. stores only the Autom8x session returned by the Edge;
6. resolves `/v1/session` before entering protected routes.

Refresh uses `/v1/auth/native/refresh`, at two moments: at launch when the
stored expiry is within the skew, and from the transport when any non-credential
request answers 401. The second is what keeps a session that expires *while the
app is open* from dead-ending every screen; it renews once, retries the request
once, and gives up rather than looping. Renewal is single-flight, so a screen
mounting parallel reads produces one refresh and not three racing ones. The
three credential routes are exempt by name — retrying `/v1/auth/native/refresh`
after a refresh would ask a dead token to renew itself.

Only 401 proves a credential dead and clears it; 502/503/unreachable preserve
it. When renewal does prove it dead the transport announces it, and the session
moves to `signed-out` so the route guard fails closed on a session that expired
mid-use, not only on one that was already gone at launch.

Logout sends the refresh token to `/v1/auth/logout`. Only 400 and 401 are
terminal answers about that token — the platform read it and will not or need
not revoke it — and only those clear the local copy. Every other outcome (502,
500, 503, a timeout, an unreachable platform) leaves the credential in place and
the UI signed in, because the platform never got to say and deleting the entry
would strand a session that is still live upstream.

`expo-web-browser.openAuthSessionAsync` is the correct system user-agent for
this custom handoff. When it cannot open a browser at all — Android's
`NoMatchingActivityException`, or no Custom Tabs provider — login and connect
both report a `failed` outcome with a fixed sentence rather than propagating
the rejection. `expo-auth-session.AuthRequest` is not used: it models an
app-owned OAuth authorization request and requires a client ID. Adding one
would contradict ADR-0017. The minimum iOS deployment is 17.4, the first
version where `ASWebAuthenticationSession.Callback.https(host:path:)` performs
the exact associated-domain match ADR-0017 requires; the installed Expo module
uses that API at this floor. The login and signup screens draw NO password
surface — no email or password field, no “Stay logged in” control, no
“Forgot?” link, no reset screen — since 2026-09-08 on the owner's direction
(platform manifest §12.1 #90): the Edge refuses password login and the website
shows providers only, and a form that existed to refuse taught the opposite.
Persistence is fixed by ADR-0017 and needs no control to say so.

Session states are `restoring`, `signed-in`, `signed-out`, `unconfigured`, and
`unavailable`. **The boundary is the root layout's guard** (the owner's build 12
item 6): `Stack.Protected` admits the tabs only for `signed-in` and unlocked (below),
and otherwise removes them and lands on the root stack's anchor, the cover — by name,
never by address. The tab layout draws nothing until then and redirects nowhere.
**Nothing inside the tabs navigates to "/"**: there it names Home, not the cover, and
build 8–12's Sign out, aimed at it, was dropped while the tab layout's redirect to it
looped. An enabled Face ID preference gates an existing session through
`expo-local-authentication`, and **the guard enforces it** (the build 13 review): a cold
start locks a stored session whose owner turned Face ID on — `locked`, in the session
provider, decided before the session is signed in and true until it is known — and the
session opens only when the lock's own check passes, on a sign-in (its own proof), or
when Face ID is turned off; only the next cold start locks it again. While it is locked
the tabs are not in the root stack, so a link that arrives then — snoopymobile:///settings
from Safari — opens nothing (until the review such a link opened the tab without Face ID,
since before build 12); a push tap's screen waits for the lock as it waits for a
sign-in; and the Face ID question, guarded the same way in the auth stack, cannot be
reached to answer "Not now". A check that passes opens Home; a link dropped while locked
is not replayed. Biometrics never create a
session and no timer counts as success. **The choice is the session's** (2026-10-02):
it is asked once after a remembered sign-in, on the screen where "Use Face ID" runs
the first check, and it is cleared with the tokens on sign-out — never inherited by
a later sign-in or a reinstall. The lock's "Use identity provider" is Settings › Sign
out's sign-out, then the cover — it leaves only once the session is revoked, keeps the
lock and says so when it could not be, and goes straight to the cover when no signed-in
session is there to unlock (the owner's build 12 item 7). Remember me off ends the
session at the next cold start, with nothing left in the enclave.

The active workspace is `session.user.activeWorkspaceId`, falling back only to
the first server-supplied membership. A route/form value never selects tenancy.
Switching it is a published mutation, `PATCH /v1/session/active-workspace`
with an idempotency key, followed by a re-read of `/v1/session`
(`useSession().reload()`); the app holds no workspace state of its own. The
switcher lists `GET /v1/workspaces` rather than the session's bounded
`workspaces` page, and Settings' WORKSPACE row (on the index again since build
11, D1, after a page of its own in 24.12) shows it
only with two or more workspaces or when `workspacesTruncated` says the list is
incomplete — the same rule the web switcher (snoopy PR #6) applies over the
same operation.

**The scope control** (24.9.2, 2026-10-02; teams since 24.11.7) sits at the top
of Flows and Activity: the workspace — the switcher, reached there as well
as from Settings — and "All teams" or one team. **On Home it is two icons beside
the bell** (the owner's build 13 decision 2, 2026-10-06; build 14), the labelled
pills gone from Home only: the workspace is Phosphor `User` for a personal one and
`Buildings` for an organization; the team is its kind's icon — `TEAM_TYPE_ICONS`,
beside the kinds in `lib/content/team-types.ts`, compared ignoring case as the
platform compares kinds — `UsersThree` for Other or a kind in a person's own words,
and `SquaresFour` for All teams. Each is a button, drawn and ticking as the bell
does, that opens the card the pills open — the switcher, Show — where the words
are, so a choice is made there exactly as from the pills. An icon cannot show
which workspace or team is chosen, so each is read aloud as what it is and what is
chosen ("Workspace: Acme", "Team: Legal", "Team: All teams"). The workspace icon
opens the switcher with one workspace too, since only the card can name it; the
pills keep the switcher's rule (two or more, or a cut list). A team is a project in the
platform's contract (backend 24.11.5) and a visibility scope on a subscription
(backend 18.6.2); runs and approvals carry no team and follow their flow's, and
one whose flow is unknown is kept rather than hidden. The team pill is always
there; its list ends with "Create a team" for an owner or admin (24.12), and a
team made from it is the scope at once. A team is named by its kind (24.12). The
choice is kept per workspace on the device (`lib/platform/scope-store.ts`) and
never selects tenancy. The website has no team selector: a deliberate mobile
difference under FR-25, as the snapshot's windows are. The app's copy says team
and flow, never project or automation; `audit:vocabulary` fails the build on
either word in copy, and the code keeps the contract's names (24.11.7).

**Signed out is the cover** (24.11.6): launch, sign-out, an ended session and a
deleted account all land on the cover, which waits; "Get started" is the one way
on, to Sign in. Signed in, the same screen is the splash and moves on by itself.
Sign out, an ended session and Delete account's "Sign in again" only end the session,
and the root guard shows the cover; a sign-out not revoked stays where it is and says
so. The Face ID lock and Account deleted sit in `(auth)`, which the guard does not
move, and leave for "/" themselves — from there "/" is the cover (build 13).

## Screen reads

| Surface | Published operations / mapping |
| --- | --- |
| Sign in | `GET /v1/auth/providers`; providers only — no password or reset surface is drawn (owner, 2026-09-08). **One screen since 2026-10-02**: the website's words ("Sign in with …"), a Remember me toggle, and the Face ID question once after a remembered sign-in; Welcome, Sign up and the Onboarding tour are gone. Reached from the cover's "Get started" (24.11.6) |
| Home | session + catalog + `run-stats?since=<local midnight>` + runs + pending approvals, and the inbox's `unreadCount` for the bell — lit while it is above 0, the platform's read state and the whole workspace's as the inbox is; a refused read of it costs the dot, never the dashboard (the owner's build 13 decision 3A; build 14; ~~lit for any held or failed run~~). The header is the mark and four buttons — the scope's two icons, the bell, the avatar (build 14, above) — and the loading skeleton draws a circle for each. The three tiles are today's and say so once, TODAY over the row — Runs, Successes, Failures — and each opens Activity with its outcome and today, so its number is the rows it opens (the owner's build 12 item 1). Every stat tile, Home's and a flow page's, looks like the button it is: a caret and, pressed, the review banner's tint, drawn around the frozen StatCard (`components/stat-tile-button.tsx`). **With no flow set up, ever** (the catalog's `subscribed`, archived ones counted), Home is the same dashboard (the owner's build 13 decision 5; build 14): the header's four buttons, the greeting, TODAY at the read's counts — 0, since nothing has run — no review banner, and in place of the quick actions and RECENT RUNS the design's first run, "Nothing automated. Yet." with its line and Add a flow; no quick actions, whose Add a flow would sit over it (~~a screen of its own, design sHomeEmpty laid out whole, whose bell and avatar were drawn but were not buttons~~ until build 14) |
| Flows | subscriptions (with `flowAllowance`) + catalog + run stats + projects + the archived ones. Over the plan's flow allowance — `allowed` known and `live` over it (the owner's build 13 decision 7a3; build 14) — a warning above the list, in every scope, says the allowance, the count and how many to archive, in the website's words (`overPlanSentence`: "Your plan allows 2 flows; this workspace has 4. No flow can start a run until you archive 2. Paused and draft flows count."); unlimited (`allowed: null`) and unknown (no allowance) are not over. A run start refused for it (403 `over_plan_limit`) says the same sentence with the platform's numbers, `entitlements_not_configured` its own line |
| Flows/add (the catalog, "New") | workspace automation catalog and its server-supplied categories, plus subscriptions and projects — a flow the workspace holds, in any team or the whole workspace, is Added ✓ with its team and opens it, whatever the scope looked at; Add for the rest, to the team the scope control chose (24.9.3; one flow per workspace since the owner's build 12 item 9 — ~~Added ✓ or Add per the scope looked at~~) |
| Setup/configure | catalog `setup[]` and the matching subscription config |
| Flows/detail | subscriptions + catalog + run stats; identity is subscription ID/template ID. Detail keeps the subscription (`runInput`, `triggerKind`, `templateVersion`) and its catalog entry for its actions; the webhook address is read when its dialog opens. An archived flow is read with the archived list and drawn read-only, with "Unarchive" (24.11.8; "Archived" since 24.12; "Add it again" until the owner's build 12 item 4 — the same action, renamed: Setup for its flow, in the team it had, a fresh setup) — or, once a non-archived subscription with the same template exists in any team or the whole workspace (`addedAgainAs`; ~~the same scope only, the platform's one-per-template-and-scope rule~~ until the owner's build 12 item 9: a workspace holds a flow once), the sentence that it has been added again and "Open the live flow", which opens the twin in the same stack (build 11, D3). Every flow page says its team, or "Whole workspace", under its name (D4). The Runs, Successes and Failures tiles open Activity for this flow and outcome (24.11.9) |
| Flows/archived | `GET …/subscriptions?status=archived` (backend §12.1 #203), only the archived rows kept, within the scope, each with the day it was archived (its `updatedAt`), and every row with its team or "Whole workspace" in every scope, a picked team's included (D4; the build 11 review); Flows reaches them through "Archived", a secondary button left of New in its header, always drawn, with no count (build 11, D5 — ~~one row with a count, 24.11.8~~), and from the empty standard's "Archived flows" button when any exist in the scope (D6). Settings has a copy in the Settings stack, whose flows open in Settings too, so Back stays there (24.12) |
| ~~Builder~~ | **Removed 2026-10-02** with Templates and Configure, on the owner's direction: the website has no builder, and FR-25 is parity with the website. Flow detail draws `pipeline[]` itself |
| Activity/run detail | runs/list/detail joined to catalog/subscription identity. Activity takes a flow and an outcome from a flow page's tile (24.11.9), and an outcome and today from Home's (the owner's build 12 item 1): the flow is a chip that clears itself, on a row of its own above the four outcome chips. **The day is the time range's** (the owner's build 13 decision 4; build 14): a button beside the title, drawn as the scope's pills are, says the range — All time, Today, Week, Month — and opens the four in a card, each with what it spans; All time, every run, is what Activity opens on; Today is since local midnight (`localMidnight()`, the tiles' today), Week the last 7 days and Month the last 30, back from that moment on the local calendar (`rangeStart`, `lib/platform/runs.ts`); the range and the outcome select together; a range holding none says so — "No runs today." / "No failed runs in the last 7 days." / "No runs in the last 30 days." (~~"Today ✕", a chip on that row, which could only clear~~ until build 14). The runs list takes no window, so the ranges select among the newest 100 runs it answers. A Home tile arrives with Today, a flow page's with All time; every arrival from a tile applies its selection, the same tile pressed again included — Activity takes it once and clears it from its route (build 13); the tab bar arrives with nothing and changes nothing, the range included. A run of an archived flow says so. Run detail reads in the workspace it was opened in and leaves when the active one changes. **A run's page reads the run again every 2 s until it has ended** (the owner's build 14 feedback #3), one read at a time — the next once the last has settled, either way — and only while it is the screen in front, each in place (`refresh`); once it has ended, **a declared step it never reported reads "Not run"** with what it would have done, not pending, and Steps done counts the steps that finished, a failed or held one not among them (#4, #5, #8). A held run's remaining steps stay drawn as waiting |
| Approvals | pending approvals joined through subscription → template → pipeline step |
| Notifications | the platform's inbox, `GET …/notifications` (the owner's build 13 decision 3A; build 14): held runs and failed runs, newest first, each read or unread for this person, nothing they dismissed; the words drawn from the catalog (`inboxRows`). Mark all read names the unread rows on screen by id, so an item that arrives after the inbox was drawn stays unread; opening an unread row reads it; each row has its own Dismiss, beside it rather than inside it so a screen reader reaches it; a save re-reads in place, never a skeleton, and a refused one says so under the push card (~~pending approvals plus failed runs; explicitly an in-app composition~~). Settings › Notifications is the same inbox, a copy in the Settings stack whose failed runs open in Settings too, so Back stays there (24.12). **Dismiss takes its row away at the tap** and puts it back with the reason if the platform refuses (the owner's build 14 feedback #10), on a 44-point target that reaches no further than itself |
| Settings | **only the plan, quietly** (build 11, D1): for an owner or admin, the workspace's billing through the shared snapshot — one request per workspace per settled window, ~~shared with the Billing page~~ refreshed by the Billing page's own read, which is a real request at every visit (the build 11 review) — drawn as Billing's value, the plan's name on the title's line before the arrow ("Free", "Plus", "Pro", by the one enrolled-plan rule in `lib/view/billing.ts`; under the title until the owner's build 12 item 2), once it is known, nothing while loading and nothing on a failure or offline (no error screen: a quiet line, the first of its kind); a member's is never read, and their line under the title says "Managed by owners and admins". Everything else is the session's, the organization's name included (the owner's build 12 item 3): Organization's value is the active organization's name, for any role; in a personal workspace the one organization's name, "{n} organizations" for several, "None" for none, and nothing when the session's list is cut off (`workspacesTruncated`) without one — one rule, `organizationValue` (`lib/view/organization.ts`). A value is drawn on its title's line and moves under the title when the two do not fit, never cut (SettingsRow's `value`). ONE grouped page — Account (its email under it) → page · SECURITY: the Face ID row · Connections → page · Billing → page · WORKSPACE: the switcher row, Your role, Organization, Teams, Archived flows, Export my data · Notifications → page · APPEARANCE: Auto, Dark, Light · Help → page · Sign out · the version — in place of 24.12's eight pages (the owner's build 10 items 1, 2 and 4). The plan's totals left with the Solutions tab (24.9.5) |
| Settings › Connections | the provider registry and the workspace's connections: third-party integrations only (24.12, decision 9); sign-in accounts are Account's |
| ~~Settings › Workspace~~, ~~Settings › Security~~, ~~Settings › Appearance~~ | **gone in build 11 (D1)**: their rows and controls are on the index; the workspace switcher still reads the workspace collection only when it opens |
| Organization | the workspace collection; for an owner or admin of the active organization, its members, domains and join requests — each request named by its requester's `displayName` and `email`, the id only when neither is sent (24.12) — and its join link — the website's `/onboarding/join-org?w=` on the browser leg's origin, its line following the joining policy of the first verified domain shown for matching emails, in the website's words (`joinLinkLine`; 24.12, decision 5); for someone in no organization, `organization-discovery`; for an owner or admin, **Verified domains only** under the domains (`PATCH /v1/workspaces/{id}` `domainOnly`; the owner's build 13 decision 8B; build 14) — the toggle moves at the press and back if refused, its refusals in words: no verified domain, or members signing in from outside one, with their count (nobody is removed; a member not seen since the setting arrived counts until they sign in again) — and joining or approving someone outside them said by reason (`outside_org_domain`) |
| Teams / team (24.11.7) | the workspace collection, each workspace's teams (`…/projects`), and each organization's directory (`…/project-directory`, backend 24.11.4); one team read in its own workspace; in an organization its memberships, and for its owner or admin — or the organization's — the workspace's members and the requests to join (`…/access-requests`) |
| Home, Flows, add, setup, Activity | also the active workspace's teams — the scope control (24.9.2), the scope a flow is added to, and the label each flow carries |
| Billing | the workspace collection for the role; `/v1/plans`, which anyone signed in may read; for an owner or admin, the workspace's billing — a real request at every visit, never the snapshot's answer, which it replaces for the Settings line (the build 11 review: a plan read before Stripe's webhook landed was otherwise shown here for up to the 120 s window after a checkout); read again when the app returns to the foreground on iOS. **A plan that ends says so, and what follows**: "Ends {date}, then Free", and the Free card drops "To move to Free, cancel …" once the plan is cancelled (the owner's build 14 feedback #11); the platform reports a portal cancellation as ending from backend §12.1 #233 |
| Account | the linked sign-in identities and the login providers, under a lead that says what linking does: "Any account linked here signs you in to this same account, in the app and on the website. Signing in with Google, Microsoft or Apple at the same email address as this account joins this account too. To use one with a different email address, link it before you first sign in with it." and then the credentials sentence (the owner's build 13 decision 9A, build 14; ~~"Link an account before you first sign in with it."~~, build 12 item 8) — a linked identity shows the address its provider reports (`email`, 24.12), none when absent; Unlink is `POST /v1/auth/native/identities/{provider}/unlink` with the device's refresh token (backend 24.11.1), its refusals said by reason (24.12); a link refused says why, one sentence per callback reason and nothing raw — an account already linked is never merged, and its sentence says to unlink it from the other account first, covering one already linked here (the platform sends one token for both; the owner's build 13 decision 10A, TestFlight #19) — and a link a domain-only organization refuses (403 `outside_org_domain`) says so and keeps the device's session |
| Data export | the workspace collection for the role; the bounded export on request; a complete export started, followed every 2 s (doubling after a failed read, three allowed), and its link read again at the moment of the download — on iOS saved into the app and handed to the share sheet (24.12) |
| Support | nothing read; the contact request is sent on the public operation; Privacy and Terms open on the website |

Every fetching surface has loading, offline, platform-error, **unavailable**, and
applicable empty behavior, **with one carve-out the design owns**: Home draws a
single combined failure state (`sHomeErr`), so a platform refusal and an
unresolved workspace both render its connectivity wording. That is the design's
own `Screen.dc.html`, not a client shortcut, and it is recorded here rather than
asserted away — the sentence used to claim uniformity the code never had.
Resource errors never reveal raw upstream bodies.

`unavailable` is separate from `error` because Retry distinguishes them. A
`PlatformNotConfiguredError` — no backend origin, or no workspace resolved —
cannot succeed on a second attempt, so offering "Retry now or come back in a
moment" invites a person to press a button that can never work.
`ScreenUnavailable` says what is actually wrong and offers no retry.

An empty queue is not an accomplishment. Approvals renders a first-run empty
state when nothing is pending, and keeps its "all caught up — decisions synced"
line for the case it describes: this person decided something.

**Whole screens only** (24.12, the owner's decision 6): a screen with nothing on
it draws the centred empty standard (`ScreenEmpty` — icon, title, one line, an
action where there is one, and Back on a pushed screen): Teams, Archived flows,
the empty inbox, Organization with nothing found and nothing to set up, an empty
catalog, Connections with no integrations, alongside Flows, Activity and
Approvals. A section with nothing in it, on a screen that has other things,
keeps its own line.

`AutomationCatalogEntry.available` is reachability evidence and is rendered, not
dropped: an automation that failed its probe says so and its Add / Activate /
create actions are refused. The completed web client refuses the same actions on
the same field, which is what keeps the two clients' §1 journeys the same
journey.

The Activity chips select on the published run status, never on a display tone.
A tone is a treatment shared by several statuses, so filtering by it made "Needs
review" — the held queue — also list running, queued and cancelled runs.

## Mutations

- Solution activation: create a subscription with an idempotency key, then
  patch its manifest-declared configuration.
- Solution pause and flow pause/resume: patch the real subscription status.
- Approval decision: post approved/rejected to the approval's stable ID with an
  idempotency key; retry reuses the intent key.
- API-key connection: generated credential fields → connection mutation with an
  idempotency key.
- OAuth connection: authorize → system browser → sealed native complete. A
  sheet that comes back without a handoff (`cancelled`) closes the dialog and
  re-reads the workspace's connections, because a system browser sharing a
  logged-in website session completes the connect at the website and skips the
  app handoff (manifest §12.1 #79); the re-read is how the app shows the truth
  without claiming a success it never received.
- Workspace switch: patch the session's active workspace with an idempotency
  key, then re-read the session; on a failed re-read the loaded screen stays
  and the dialog offers the read again.
- Disconnect: delete the stable connection ID.
- Sign out: unregister this phone's push device first, with the still-valid
  bearer and never blocking on it (build 11, D8) — once a registration still in
  flight has answered, waited for up to five seconds, so the id it answers is
  the one sent; one answering later keeps no id (the build 11 review); then
  revoke, and clear locally only on a terminal/successful answer.
- Round 16 (24.4), each the website's operation, words and gating:
  - Run: `createRun` with exactly what the pinned version's `runInput`
    declares, offered only on a live, available subscription that declares
    some. Its key is new on each opening and on any changed value, so only a
    resubmission of the same values reuses it. A file field uploads when
    chosen: `openUpload` for the file's size on disk, then the bytes are read
    and must be exactly that many, then the credential-less `PUT` to the signed
    URL with the type it was opened for, and `completeUpload`; the run's input
    carries only the file's id.
  - Set up: patch `config` only; going live stays its own action.
  - Go live: offered only with no unmet connection and an available
    automation. Detail shows the status as read; the Flows list shows the
    answer to detail's change only until the list reads again.
  - Move to vN: patch `templateVersion`, confirmed first, when the catalog's
    version is newer than the one pinned.
  - Archive flow ("Remove flow" until 24.12, the owner's decision 4): patch
    `status: archived` behind its one-way confirmation — the last thing on the
    flow page, in red (24.9.4). It moves to Archived flows, keeps its runs in
    Activity, and the flow can be unarchived ("added again" until the owner's
    build 12 item 4); Pause keeps it listed.
  - Red (the owner's build 12 item 5): an action that removes or ends something
    and cannot be undone with a tap is drawn in `palette.danger` — dark #f87171
    (`status.err`), light #dc2626 (the website's light `--error-text`) — on its
    page and in the button that confirms it. On the page, Delete Account, Delete
    team / Leave team and Cancel run are PillButton's `danger` variant, the
    design's red pill (Screen.dc.html:450); Unlink's text, Sign out and Archive
    flow are drawn in it. Confirming, every `DialogButton` of tone `danger`:
    Delete account, Delete team, Leave team, Leave, Remove member, Archive, Cancel
    run, Disconnect, Unlink, Revoke. Not red: Pause (Resume undoes it), Reject
    and Deny (an answer, not a removal), Withdraw and Cancel request (the person
    can ask again — Withdraw's confirm is accent), Make a new secret, and every
    Cancel, Close and Not now.
  - Webhook address: owner or admin, webhook-started only. The address is read
    on each opening; a secret is issued with no idempotency key, shown once in
    the dialog and kept nowhere else.
  - Cancel run: pending or running only, confirmed first.
  - Replace account: the OAuth connect with the connection it replaces; a
    `reused` answer is said as nothing replaced.
- Every action acts on the workspace its screen loaded (`workspaceIfShown`);
  after a switch it is refused with `WORKSPACE_CHANGED` and not sent.
- Round 16 (24.5), each the website's operation, words and gating:
  - Organization: rename; claim, update, verify and revoke a domain, its DNS
    verification value shown once; remove a member, never an owner or oneself,
    after a confirmation; approve or reject a join request. Someone in no
    organization joins or asks to join one discovery found, and can cancel that
    request; on a company domain they can set one up — created once, then its
    domain claimed, a failed claim retried alone. An owner or admin shares the
    join link through the share sheet (24.12); the platform accepts a request
    through it only from someone at a verified email domain the organization
    shows for matching emails, and that domain's joining policy decides what
    follows, as the line under the link says.
  - Teams (24.11.7; projects in the contract): create (24.12, the owner's
    decisions 1–3) — in the workspace the person is in when the dialog opens,
    personal included, and refused with `WORKSPACE_CHANGED` if another is active
    by Create; of a kind from the list or the person's own words, 2 to 60
    characters, the kind sent as both its name and its type, with no name,
    picker or description; one team per kind, a second refused in words (409
    `team_kind_taken`); in an organization its owners and admins only, so a
    plain member is not offered it. A team's title is its kind. Delete
    (archive) by its owner, which leaves its flows running; leave — typing
    DELETE, or confirming from one's own row; add
    members, change a role (an admin only a member's), remove; ask to join a
    team in the directory and withdraw the request; approve or deny a request,
    by the team's owner or admin or the organization's. Each acts on the team's
    own workspace, which can be other than the active one.
  - A flow is added to a team, always (build 11, D4; the owner's build 10 item
    7: "Each flow has to be in a team") — there is no whole-workspace choice in
    either client, and `projectId` is always sent. A team not chosen on Setup is
    refused in words ("Pick a team."), and nothing is sent. With no team yet an
    owner or admin is told "Create a team first." and makes one from Setup,
    which is then the team chosen; a plain member, where the organization has
    a team they could ask onto (the team directory, read only in that state,
    lists one they are not on; a platform without it, 404, lists none — F84,
    the website's rule), is told "Ask to join a team first." with "See teams",
    which opens Teams, and otherwise "An owner or admin creates the first
    team."; neither has Activate. Existing whole-workspace flows
    stay, labelled "Whole workspace", under All teams; the platform is unchanged
    (`projectId` null is still a visibility scope it accepts). A workspace
    holds a flow once — Personal is one workspace, each organization one (the
    owner's build 12 item 9: "One flow per account type. Personal or org not
    multiple of the same") — so a flow it holds, live, paused or draft, in any
    team or the whole workspace (`heldAs`), is not added again: Add reads
    "Added ✓" with its team and opens it, whatever the scope looked at, and
    Setup, reached for it, shows "Added to" and its team — no team choice and
    none of the lines above — and Activate configures that subscription. A flow
    Setup has just added — a draft still owed an account, or one whose
    activation failed — is held from that moment and drawn the same way, so
    Activate configures it and never adds a second (the build 13 review). A
    duplicate added before the rule stays, listed. The rule is the clients'
    until the platform's own guard lands; the platform still accepts one copy
    per team (18.6.2). Every flow card,
    archived row and flow page says "Team: {kind}" or "Whole workspace", the
    website's words, in every scope — inside a picked team too (the build 11
    review: ~~a card under All teams only; inside a picked team the card does
    not repeat the label~~, an exception D4 never made).
- Round 16 (24.6), each the website's operation, words and gating:
  - Billing (ADR-0032 option B; the cards since 24.12, the owner's decisions 7
    and 8): every platform shows the plans as cards — Free, then the
    platform's plans by price — each its name and price (the provider's minor
    units, formatted only for a currency whose exponent is known), and the
    workspace's card says "Enrolled" with its status. On iOS only, not paying,
    a paid card opens the hosted checkout for that plan; paying, any other card
    opens Manage billing, the hosted portal — so does a checkout refused with
    409 `plan_exists` — each in the system browser, https only; a portal 409
    sends the person to a plan. Android shows no purchase control or call to
    action. The workspace's billing is an owner's or admin's; a member sees the
    plans without actions and is told who manages billing. A 503 is
    "unavailable", never a false plan.
  - Account: linking another sign-in account is 24.2.1's native flow — a
    sealed ticket asked for with the bearer and refresh token (in a body, read
    inside the request), opened once in the system browser, then login's code
    exchange against the claimed callback. Unlink's refusals are sentences by
    reason, never the problem's title (24.12). Deleting the account is ADR-0028's,
    in its words, and reads every answer the contract gives a bearer caller: a
    partial deletion keeps the account; a lost answer reads the session before
    saying either way; `SESSION_REVOCATION_FAILED` revokes through sign-out
    before this device lets go; an ended session offers sign-in. Deleted, the
    device clears its session and shows the signed-out screen.
  - Data export: the bounded summary shared as a JSON file (iOS) or text
    (Android); the complete export read afresh from its signed link and, on iOS,
    saved into the app and handed to the share sheet (24.12) — on Android the
    link opens in the browser.
  - Support: the contact form's fields and words; Privacy and Terms on the
    website's origin, the one the browser leg shares.
- After a change, a screen re-reads from `loading`: what it showed is out of
  date and is not left to act on. A return to a screen re-reads it and keeps its
  rows until the answer lands (24.4.4) — through the shared workspace snapshot
  since 2026-10-02 (24.9.1, `lib/platform/snapshot.ts`): one in-flight request
  per resource; a resource younger than its window is answered from the snapshot
  (15 s for runs, approvals, subscriptions, counts and connections; 120 s for
  the catalog, projects, providers and workspaces); an action invalidates what
  it changed — a rename, a new organization and a join drop the workspace list
  (24.12) — and `reload()` drops the workspace's whole snapshot. The whole
  snapshot is emptied when a session ends or begins (24.12). The website reads
  per navigation and caches nothing on the client: the windows are a deliberate
  mobile difference under FR-25.

UI state changes occur only after a successful mutation. Failed actions remain
on the loaded screen and show the shared inline failure callout.

An idempotency key is the identity of one intent, not of one screen. It is
re-minted when the intent's body changes and again once the intent has
succeeded — a key held across a success would replay the stored response
instead of performing the next action, and a key held across a changed body is
a 409 by contract rather than a replay.

Client-held overrides (`hooks/use-solutions.tsx`, `hooks/use-workflows.tsx`) are
scoped to one person in one workspace and are cleared when either changes. Both
providers are mounted above the route tree, so without that they would outlive a
sign-out and layer one account's local state over the next account's catalog.

## Refusal map: what is rendered instead

These are published refusals or absent operations, not invitations to create a
mobile-only shape.

- Full run output is not public: render `resultSummary` on success and
  `failureReason` on failure; never invent extracted fields.
- A human run number is not public: use stable request/run identity where
  appropriate and do not synthesize `#4821`.
- Approval has no display title: join its subscription and `stepId` to the
  catalog pipeline title.
- ~~There is no notifications endpoint and no read state (backend §12.1 #71
  stands): compose pending approvals and failed runs in app, every row unread.~~
  The inbox is the platform's since build 14 (the owner's build 13 decision 3A
  reverses §12.1 #71): read and dismissed per person, the same on every device.
  Device push (build 11, D8; BUILD-PLAN 24.13.6, ADR-0035) is registered
  through `PUT /v1/session/devices` — on iOS phones only, the push token in its
  body and only the answered device id kept, in SecureStore with the session —
  and unregistered by `DELETE /v1/session/devices/{deviceId}` before the
  logout. It is asked for on the inbox's card, never at launch — above the rows,
  and above the empty standard when there are none (the owner, 2026-10-03) — iOS
  asks at the "Turn on" tap, "Not now" holds for the session; Android and a simulator
  register nothing and the card says so (§12.1 #211); a platform without the
  route (404/503) is "Notifications aren't available yet." in words. A tap
  opens a failed run's page, or Activity for a held one, in the workspace the
  push names (`data.workspaceId`, sent from the NINETEENTH promotion): another
  of the person's workspaces — a UUID on the session's list — is switched to
  first as the switcher does (`PATCH /v1/session/active-workspace`, then
  `/v1/session` read again), and the screen opens once that session is drawn;
  a switch or a read that fails opens nothing. No workspace named, the active
  one, an id of another shape or one not theirs: it opens in the active
  workspace. No web push.
- Confidence is unpublished: render the design's unavailable value.
- `homeStats` is not an operation: derive the three tiles from windowed
  `run-stats` exactly as the refusal directs.
- Cross-tenant “used by teams” is not public: omit/inform with static product
  copy; use only `Connection.usedByCount` for this workspace.
- There is no retry operation preserving `rootRunId`: omit Retry rather than
  starting an unrelated run and calling it a retry. This is historical Finding
  9.
- Billing is ADR-0025's four operations and ADR-0032's rule (24.6.1 above):
  no card field, no in-app purchase, no price the platform did not state —
  but Free's $0.00 per month, which the app draws by the owner's decision 7
  (24.12), and, since build 11 (D2, the owner's build 10 item 3: "I said free
  plus and pro"), Pro's $10.00 per month, the price the owner set, drawn while
  `/v1/plans` does not list a plan with id `pro` — an inert card on every
  platform and for every role (no checkout, which would answer 404; no portal,
  which has no Pro), replaced by the platform's Pro once it is listed.
  `/v1/plans` lists only what can be bought. The cards are compact, at their
  natural height (D2).
  Billing states the plan; the solutions total left Settings with the Solutions
  tab (24.9.5).
- An archived subscription is absent everywhere but Archived flows: not a
  flow, not Added, not paused, not reused by Add (`withoutArchived`, the website's
  rule); Archived flows reads it by name (`status=archived`, 24.11.8) and shows it
  read-only. The
  catalog's `subscribed` is not used for Added, because it still counts an
  archived row (`DESIGN-GAPS.md`, Round 16). Home alone keeps it, to ask whether
  the workspace has set anything up at all.
- Refusals a person can act on are said in the website's words
  (`lib/content/refusals.ts`): moving a version, issuing a webhook address,
  starting a run, uploading its file, and Add's two plan reasons (on a 403
  only); since 24.12 creating a team (a kind already taken, and a member's
  403) and unlinking a sign-in account — by reason, and "Unlinking isn't
  available yet." for a platform without the route.

## Remaining contract ceilings (not Round 6 substitutions)

- Historical Finding 3: pipeline `kicker` is closed to `TRIGGER`, `AI STEP`, and
  `ACTION`; backend manifest validation currently prevents branch/delay/human
  review kickers from reaching a client.
- Historical Finding 4: a declared pipeline step has no icon. The client uses a
  documented, lossy kicker-to-icon mapping and otherwise preserves its text.
- Historical Finding 5 is resolved: configure and flow detail pass `template`,
  New routes through Templates, and an identity-free/unknown Builder link is
  refused.
- Historical Finding 6 remains: a subscription publishes only
  `unmetConnections`, so flow detail can name missing providers but cannot
  invent already-satisfied provider rows.
- Manifest setup resource fields carry a string value but no public resource
  enumeration. Matching the completed web client, the generated control edits
  that opaque string without inventing a picker data source.

Builder was deliberately read-only in BUILD-PLAN 8.7, rendering the published
pipeline with Save, Test run, insertion and drag visibly disabled. **Removed
2026-10-02** with Templates and Configure (24.7.3 attempt 2 feedback): the website
has no builder, so a read-only one on mobile offered nothing the website offers.
"New" and Home's button lead to the catalog inside Flows (`app/(tabs)/flows/add.tsx`,
24.9.3); the Solutions tab itself went on 2026-10-02, on the owner's word — four
tabs: Home, Flows, Activity, Settings. The Settings SECURITY card keeps the
Face ID unlock only (a page of its own in 24.12, on the index again since build
11, D1); its Passkeys and Stay signed in rows were static design copy the website
never had, and went the same day.

**The type is the app's own scale** (24.12, the owner's decision 11 of
2026-10-02: bigger type, "whole app — easy to read"). Every font size, line
height and tracked size comes from `typeScale` in `constants/theme.ts` — about
2 pt over the design's text sizes and 3 over its titles, 12 at the smallest —
no longer the design's values carried over 1:1. `audit:type` fails a size
written anywhere else, and the Nocturne snapshots were re-pinned once for it.

**The Home mark fills its row** (build 11, D9; the owner's build 10 item 12:
"should fill up that empty space top left"). The design drew it at 17 in a row
its two buttons make 38 tall; it is 38 — the row's height — in every Home
state, through BrandMark's own `height`, so the row and everything below stay
where they were. The primitive and its snapshots are unchanged. Since build 14
the row holds four 38-pt buttons (the scope's two icons beside the bell and the
avatar), and the mark still leaves them their room at 320 pt.

**Every press ticks** (build 11, D7; the owner's build 10 item 10: "Ensure any
button clicked does haptic feedback like the others"). The tab bar's selection
haptic — the one the app had — is the app's rule: every press passes through
`components/pressable.tsx`, whose `Pressable` is react-native's with its press
wrapped, and whose `pressed()` wraps the handler of a host element (the three
`Text` handlers: See all, Mark all read, a callout's retry). One selection tick,
before the handler, on iOS only; Android is as it was. A press that does
nothing gives none: no handler (the unswitchable workspace pill, the signed-out
cover, whose tap has no handler at all), or a disabled control. The toggle
ticks like every other press. A behaviour wrapper, not a Nocturne primitive —
the host tree is unchanged and the 18 components' snapshots with it.
`audit:haptics` holds it: a Pressable, Touchable or Button imported from
react-native outside the helper, a default or namespace import of react-native,
expo-haptics imported anywhere else, or a Text/View/Image/ScrollView/Animated
onPress that is not `pressed(…)` fails the build.

## Identity and key rules

React lists use server IDs or stable declared IDs: template ID, subscription ID,
run ID, approval ID, provider/connection ID, setup field key, and pipeline step
ID. Array position is never business identity. No route falls back to “the
first” catalog/subscription item when a requested identity is absent.
