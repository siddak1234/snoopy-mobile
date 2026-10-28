# Mobile contract — Round 6, amended in Round 7.5M and Round 16

Verified against the sibling master plan, Round 6 playbook, BUILD-PLAN 8.5–8.7,
ADR-0017, and the regenerated platform/automations/connections declarations on
2026-08-17; re-verified against the regenerated declarations on 2026-09-03 and
on 2026-09-29 for Round 16 (`npm run verify:platform-contracts`: current). The published API owns business
truth. This file records how the client consumes it; it does not extend it.

## Completion state

Round 6 closed on 2026-08-18 after two fresh audits (`DESIGN-GAPS.archive.md`). Round
7.5M (2026-09-03) added the workspace switcher, the browser-leg base, the
browserless refusal and the pinned release values; everything is **ready for
the Round 7F fresh audit**, not a declaration that any gate is closed.
`ROUND-7.5-OBSERVATIONS.md` lists what is observed and what is not.

Round 16 (ADR-0032, BUILD-PLAN Phase 24) makes the app offer every signed-in
web feature on the same operations; its findings are in `DESIGN-GAPS.archive.md`'s
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
  the native download of a signed file's link into the app's cache
  (`downloadSignedFile`: the complete export; the run package's PDF and Excel
  since round 24; since build 28 a run's or an item's own file, `readRunFile` and
  `readItemFile`'s link, drawn — in a folder made for that one view, `freshFolder` —
  and handed on by `components/files/file-view.tsx`).
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
reached to answer "Not now". A check that passes opens Home, or first the notifications
offer where it is owed (`nextAfterColdStart`; when, the Device push paragraph of the
[refusal map](#refusal-map-what-is-rendered-instead)); a link dropped while locked
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
does, that opens the drop-down the pills open (~~the card the pills open — the
switcher, Show —~~ until round 23) where the words
are, so a choice is made there exactly as from the pills. An icon cannot show
which workspace or team is chosen, so each is read aloud as what it is and what is
chosen ("Workspace: Acme", "Department: Legal", "Department: All departments"; ~~"Team: …"~~ until round 23). The workspace icon
opens the switcher with one workspace too, since only its drop-down can name it
(~~only the card~~ until round 23); the
pills keep the switcher's rule (two or more, or a cut list). A team is a project in the
platform's contract (backend 24.11.5) and a visibility scope on a subscription
(backend 18.6.2); runs and approvals carry no team and follow their flow's, and
one whose flow is unknown is kept rather than hidden — but Home's review banner
counts every pending approval in the workspace whatever team is chosen, the number
Approvals lists, as the website's Approvals counts (Gate 24 parity, G1). The team pill is always
there; its list is All teams and every team this person can see (~~ending with
"Create a team" for an owner or admin, 24.12~~ until the Invoice Processing
update: the platform makes a flow's team, of its category, when the first flow of
that kind is added — backend ADR-0036). A team is named by its kind (24.12). The
choice is kept per workspace on the device (`lib/platform/scope-store.ts`) and
never selects tenancy. The website has no team selector: a deliberate mobile
difference under FR-25, as the snapshot's windows are. **Since Build 22** (F1–F3; the
owner's build 21 items 2–4) Flows and Activity draw the scope as Home does — its two circles,
8 pt right of the title in one title row (`components/title-row.tsx`), the same height on both
pages — and the workspace circle opens the switcher with any number of workspaces, as Home's
does; ~~the labelled pills above the title, the workspace pill a button only with two or more
or a cut list~~ until Build 22 (`ScopeControl` deleted; `ScopePill` stays for Activity's range). **Since round 23**
(the owner's build 22 feedback): the title row is the title on the left and, on the right, the two
circles then the page's own controls — Flows' Archived always its circle, New its accent pill or, at
320 pt, its circle; Activity's All time pill or its circle (A1; ~~the circles 8 pt right of the
title~~). Every picker that was a card is one drop-down on its trigger (`components/dropdown.tsx`,
A2): the workspace switcher (title Workspace; rows name and Personal or Organization; Switching… and
nothing closes it until done; Reload session at its foot when owed, "Working…" and not pressable
while it re-reads), Department (All departments,
then each; its load error in it — the card's sentence gone, S3), Activity's time range and its
outcome (All runs, Success, Needs review, Failed — one drop-down where four chips were), and Add a
flow's category (All categories, then each). Its panel, the tab bar's capsule and the header circles
are Liquid Glass (`components/glass-surface.tsx`, A3). **Since round 24** (the owner's build 23 F1,
F13, F14) the panel lays the card colour, opaque, under its rows (~~at 94%~~ until the round's simulator audit; `GlassSurface backing="panel"`,
`GLASS_BACKING_ALPHA`), so every drop-down reads over a busy page as Add a flow's does over an empty one
— fixed in the one component; and one strip behind the status bar (`components/status-bar-strip.tsx`,
the page colour, opaque, on the same glass, as tall as the top safe area, no touch), drawn once by the
tabs' layout and once by the sign-in stack's, keeps content from scrolling under the clock (P11).
The tab bar's lens latches under its tab on the first layout (nothing animates) and slides to a new
tab in 240 ms, eased out — never a spring, so it cannot overshoot and shake — and moves at once under
Reduce Motion (F2, F3, P2; `lensOffset`). **The words are department, never team**
(B1): "All departments", "Department: Legal", "in a department". The app's copy says department
and flow, never team, project or automation; `audit:vocabulary` fails the build on
any of those words in copy, and the code keeps the contract's names (24.11.7; `teams`, routes and
test ids stay).

**Signed out is the cover** (24.11.6): launch, sign-out, an ended session and a
deleted account all land on the cover, which waits; "Get started" is the one way
on, to Sign in. Signed in, the same screen is the splash and moves on by itself.
Sign out, an ended session and Delete account's "Sign in again" only end the session,
and the root guard shows the cover; a sign-out not revoked stays where it is and says
so. The Face ID lock and Account deleted sit in `(auth)`, which the guard does not
move, and leave for "/" themselves — from there "/" is the cover (build 13). **A
session that ended while it was in use** — on a tab screen — says so on the cover, in
the website's words (`SessionEnded`): "Your session has ended" and "Sign in again to
carry on where you were.", over Get started, still the one way on; the sign-in that
follows — through the Face ID question when it is asked — returns to the screen that
was open, its params with it, once and for the same person only
(`lib/view/return-to.ts`; Gate 24 parity, G4), drawn as it was opened: its tab's first
screen beneath it (`RETURN_OPTIONS`, `withAnchor`), so its Back and its tab come home. A
sign-out — a 401 landing during it included — and a cold start say nothing of it and open
Home (a kept session's cold start through the notifications offer where it is owed: the
Device push paragraph of the [refusal map](#refusal-map-what-is-rendered-instead)); a sign-in that fails keeps the return for the next one that completes, as the
website's link keeps the page across a failed attempt (`loginHref`'s `callbackUrl`).

### Two documented variances

The playbook names `expo-auth-session`. ADR-0017 subsequently made the backend,
not the app, the OAuth client. Expo documents `AuthRequest` as an OAuth §4.1.1
request requiring a client ID; applying it here would invent an app OAuth
client. The implementation uses the lower-level Expo system auth session,
`expo-web-browser.openAuthSessionAsync`, and retains device-generated PKCE for
the sealed handoff.

ADR-0017 §1 assumes the start request and the provider's callback land on one
origin. In the deployed topology that origin is the public web origin, not the
API origin, so the browser-leg base above exists. The published route and its
parameters are unchanged; only the origin the browser is pointed at differs.
Both variances are explicit and are judged by the fresh auditor.

## Screen reads

| Surface | Published operations / mapping |
| --- | --- |
| Sign in | `GET /v1/auth/providers`; providers only — no password or reset surface is drawn (owner, 2026-09-08). **One screen since 2026-10-02**: the website's words ("Sign in with …"), a Remember me toggle, and the Face ID question once after a remembered sign-in; Welcome, Sign up and the Onboarding tour are gone. Reached from the cover's "Get started" (24.11.6). **Under the buttons, one line since 2026-10-13** (the owner's decision): "By continuing, you agree to our Terms of Service and Privacy Policy.", the website's words, in this screen's secondary text, each page a link opening the website's `/terms` and `/privacy` (plain words where the app does not know the website); nothing to tick, no step added |
| Home | session + catalog + `run-stats?since=<local midnight>` + runs + every approval (the run rows) and the pending ones (`?status=pending`: the review banner, every pending approval in the workspace whatever team is chosen — what Approvals lists and the website's Approvals counts; until Gate 24 the chosen team's, from the newest hundred of every status; none drawn when that read is refused; G1) + subscriptions + connections + every workspace's teams, and the inbox's `unreadCount` for the bell — lit while it is above 0, the platform's read state and the whole workspace's as the inbox is; a refused read of it costs the dot, never the dashboard (the owner's build 13 decision 3A; build 14; ~~lit for any held or failed run~~). The header is the mark and four buttons — the scope's two icons, the bell, the avatar (build 14, above) — and the loading skeleton draws a circle for each. The three tiles are today's and say so once, TODAY over the row — Runs, Successes, Failures — and each opens Activity with its outcome and today, so its number is the rows it opens (the owner's build 12 item 1). Every stat tile, Home's and a flow page's, looks like the button it is: a caret and, pressed, the review banner's tint, drawn around the frozen StatCard (`components/stat-tile-button.tsx`). **With no flow set up, ever** (the catalog's `subscribed`, archived ones counted), Home is the same dashboard (the owner's build 13 decision 5; build 14): the header's four buttons, the greeting, TODAY at the read's counts — 0, since nothing has run — no review banner, and in place of the quick actions and RECENT RUNS the design's first run, "Nothing automated. Yet." with its line and Add a flow; no quick actions' pills, whose Add a flow would sit over it (~~a screen of its own, design sHomeEmpty laid out whole, whose bell and avatar were drawn but were not buttons~~ until build 14). **The website's dashboard, beside the design's** (Gate 24 parity): OVERVIEW under TODAY — Flows, the subscriptions not archived (the website's count) in the team chosen, and Integrations, the connections that are connected — figures, not buttons (G6); Connect integration and View teams, flows or none, rows under the quick actions' pills, opening Settings › Connections and Settings › Teams (G5); TEAMS last — the first three teams this person can see across their workspaces, the deleted left out, each its kind, its status ("Active", "Paused", "Draft") and its workspace's name when they span several, opening its team page in its workspace, View all teams beside the label, and with none "No teams yet." and, for an owner or admin, Create a team, opening Teams (G7). **Each read is a figure of its own** (G6): a refused one says so in its place — TODAY "Unavailable" and no "Your agents ran …", a figure "Unavailable", RECENT RUNS "Recent activity could not be read just now.", TEAMS "Your teams could not be read just now.", no review banner, a held run's row "Held" without every approval, no first run claimed without the catalog, and with a team chosen and no subscriptions its figures unavailable — and the rest still show; Home's own failure only when none of the workspace's reads answered (below) **Since Build 21** (Round 17, 2026-10-15/16; the owner's build 20 items 1–13, D1–D4, "go with all" ~04:15Z and his corrections AM1–AM8 of ~22:15Z and ~22:35Z; spec b21/spec.md; DESIGN-GAPS "Build 21"): RUN A FLOW right under the greeting, before TODAY — every live flow in the team chosen (`quickRunRows`), its icon at 24, its name and "Team: {kind}", opening its flow page, whose Step 1 holds the document and Start run: three presses from Home to a started run (A9; the session's S16); none live, no section. The workspace's teams are read (`readProjects`) only to name each flow's team, and a refused read costs the name, never the list. ~~TEAMS, the first three teams across the workspaces, and View all teams~~ (the owner's AM5: "remove lsit teams on bottom of home page, it is useless"); View teams under the quick actions still opens Settings › Teams. Each recent run row says when and the run by its FULL id under its line ("Oct 7, 2026, 9:05 PM · Run 793eef82-…", A8, AM2). ~~The AI reading card~~ (D1). **Since Build 22** (Round 17, 2026-10-17; the owner's build 21 item 1: "Remove run a flow section. We did not add thus. / Remove overflow, it should be the 3 icons for today with the run types / Then add a flow and flow buttons / Then recent runs. / I dont want want flows integrations, connect integrations, view teams, or run a flow. / Recent runs is fine"; "overflow" is OVERVIEW and the banner stays right after TODAY — the session's D4 and D6, approved by the owner 21:12Z; DESIGN-GAPS "Build 22"): top to bottom the header, the greeting, TODAY, the review banner while something waits, Add a flow + Flows, RECENT RUNS · See all; with no flow ever, the first run in RECENT RUNS' place and no pills. Its reads are the run stats, the runs, the catalog, every approval and the pending ones, the subscriptions and the inbox's count — ~~the connections (OVERVIEW's Integrations) and the teams (RUN A FLOW's labels)~~ (the session's S31); the scope's teams are read by its circles from the shared snapshot. ~~RUN A FLOW (Build 21, A9)~~, ~~OVERVIEW (G6)~~, ~~Connect integration and View teams (G5)~~ until Build 22; every remaining read still a figure of its own (G6). |
| Flows | subscriptions (with `flowAllowance`) + catalog + run stats + projects + the archived ones. Over the plan's flow allowance — `allowed` known and `live` over it (the owner's build 13 decision 7a3; build 14) — a warning above the list, in every scope, says the allowance, the count and how many to archive, in the website's words (`overPlanSentence`: "Your plan allows 2 flows; this workspace has 4. No flow can start a run until you archive 2. Paused and draft flows count."); unlimited (`allowed: null`) and unknown (no allowance) are not over. A run start refused for it (403 `over_plan_limit`) says the same sentence with the platform's numbers, `entitlements_not_configured` its own line **Since Build 22** (F1–F3; the owner's build 21 items 2 and 4: "the logos same as home for organization and team then to its right the box for archived and then +new can stay as is" / "Symmetry and standard"): the first row is `components/title-row.tsx` — "Flows", Home's two scope circles 8 pt right of it and 8 apart, flexible space, Archived and New (both pills 12 a side, 8 apart; New unchanged) — 38 tall, every item centred, first under the safe area; when the row is measured too narrow for all of it (`onLayout`, `titleRowCompact`), Archived is its icon alone in a 38-pt circle read aloud "Archived" (the session's S26: the word fits the owner's 420-pt phone, the circle a 375-pt one); narrower still — a 320-pt phone — New is its Plus alone in a 38-pt circle in its accent, read aloud "New", so the title, the circles, Archived and New stay on the one line (`titleRowLevel`, each form measured; the Build 22 review's M11; ~~Archived the one narrower form, the row running 23 pt past a 320-pt screen's margin~~). ~~The scope control's labelled pills above the title~~ until Build 22. **Since build 28** (the owner's item F1: "sections in the flow page … A-Z by department type"): under the search, the flows by department — each department's kind over its cards as a section label, the departments A–Z, then the whole workspace's under "Whole workspace", then any whose department was not read, under no name; each group's flows in their catalog entries' order (the website's; ~~in the order read~~ until the build 28 parity review), and each card still says its department (D4) (`groupFlows`, `lib/view/catalog.ts`). A search keeps the groups of what it finds. |
| Flows/add (the catalog, "New") | workspace automation catalog and its server-supplied categories, plus subscriptions and projects — a flow the workspace holds, in any team or the whole workspace, is Added ✓ with its team and opens it, whatever the scope looked at; Add for the rest, to the team the scope control chose (24.9.3; one flow per workspace since the owner's build 12 item 9 — ~~Added ✓ or Add per the scope looked at~~). Each card says its category, the version Add pins and its price in the website's words — "Finance · v1 · $39/mo", "Included" for a flow at $0 (Gate 24 parity, G8; ~~"Finance · $39/mo"~~) **Since the Invoice Processing update** (Round 17, 2026-10-14; the owner's build 19 feedback; spec §3): the subtitle is "Ready-made flows for your teams."; a card says its category — a team kind, the team the flow goes to — and its price, "Accounting · Included", with no version (the spec's S9; ~~"Finance · v1 · $39/mo"~~); Add opens Setup for its template, and no team is chosen anywhere: the platform puts the flow in its category's team and the person adding it on that team (backend ADR-0036). A held flow still reads Added ✓ with its team. |
| Setup/configure | catalog `setup[]` and the matching subscription config. Fields are drawn under their sections in the manifest's own order, as the website groups them — a section the manifest comes back to is a section again — and a toggle that switches a notification (`notifies`) says which: "Controls the notification sent when a run fails." (Gate 24 parity, G11; ~~the design's fixed order: connections, source, rules, notifications~~). The flow page's Set up draws the same way. A control this build does not know is drawn as the website draws it — a text input, with "This field is newer than this build of the app. Enter it as text." under the description — never a crash; `resource-picker` is the same text input, a control the app names; the Setup dialog and the run's form — the flow page's start controls since 25.8.3, the Run dialog until then — sit inside an error boundary that fails to the failed-load words with Try again (Round 17, 25.8.1) **Since the Invoice Processing update** (Round 17, 2026-10-14; the owner's build 19 feedback; spec §3): no team picker and no Create a team — under the title "Team: {category}", or a held flow's own team; the sections are numbered steps at the label size in the text colour — 1 · CONNECT, then SOURCE, SETTINGS, EMAIL in the manifest's order (~~CONNECTIONS, REVIEW RULES, NOTIFICATIONS~~); CONNECT draws the flow's vendor choice (the setup field with `control: connection`, backend ADR-0037) as the chosen vendor's logo, or its icon and name, or None, with "Not connected" in the warning colour when it is not, and "Connect vendor ›" to the flow's vendor page, then each account it cannot run without, its logo or icon and name, Connected ✓ or Connect › (Settings › Connections), no purpose line; the vendor field is never a row; icons 24. "Turn on" / "Turning on…" (~~Activate solution~~) adds the flow — POST with no `projectId` — then patches its settings and the choice with `status: live`; what it cannot send is said and nothing is sent: "Connect {name} first, or choose None.", "Connect {names} first.", "Fill in: {titles}.", "Enter an amount for {title}."; a refused add (404, 502) "Could not add this flow. Try again.", anything else "Could not turn it on. Try again." (a plan reason keeps the website's words). The flow page's Set up dialog is "Set up {name}" over its team, its sections numbered, Save / Saving…, "Could not save. Try again." A flow the workspace holds is set up with the settings of the version it runs (`Subscription.setup`), never the catalog's newest, whose keys it would refuse. An add that went unanswered (offline, a 5xx) is replayed by Try again with the same key — never refused as "already in this workspace" for its own copy; any other answer, and the next press reads the flows afresh. An add reads the teams again: it can make the category's team and put this person on it (the review of the Invoice Processing screens). **Since Build 21** (Round 17, 2026-10-15/16; the owner's build 20 items 1–13, D1–D4, "go with all" ~04:15Z and his corrections AM1–AM8 of ~22:15Z and ~22:35Z; spec b21/spec.md; DESIGN-GAPS "Build 21"): ONE simple page, once, with everything on it (AM4: "set up page is initial, after that flow page is the run page. set up should be made simple") — Add opens it for a flow not added, the flow page's Edit setup for an added one (`flow`). 1 · CONNECT draws each step's vendor choice right on the page (one `connection` field per step, `providers`, backend ADR-0040): each vendor the field names as the one connection row, then None, the chosen one checked (24); a tap chooses — a vendor not connected is connected first, for an owner or admin, through its provider at once; for a member it says "Ask an owner or admin to connect it." — and each account the flow cannot run without as the one row with its Connect (~~Connected ✓ / Connect ›~~, ~~"Connect vendor ›" to a page of its own and its `vendor` param~~). The settings by their titles alone: no help line (S11). One button: Turn on for a flow not added or a draft (create, then PATCH with `status: live`), Save for a flow on or paused (PATCH `config` only, its status kept, then Back); Save asks only for a vendor this page changed and never for the accounts. A held flow draws the settings of the version it runs (`Subscription.setup`) whatever version the catalog lists. The form sits inside `InlineBoundary` (25.8.1's guarantee, kept from the Set up dialog): "Couldn't load this setup" with Try again. **Since the review of Build 21's screens:** its one button (Turn on or Save) is a button to a screen reader, busy while it sends. |
| Flows/detail | subscriptions + catalog + run stats; identity is subscription ID/template ID. Detail keeps the subscription (`runInput`, `triggerKind`, `templateVersion`) and its catalog entry for its actions; the webhook address is read when its dialog opens. An archived flow is read with the archived list and drawn read-only, with "Unarchive" (24.11.8; "Archived" since 24.12; "Add it again" until the owner's build 12 item 4 — the same action, renamed: Setup for its flow, in the team it had, a fresh setup) — or, once a non-archived subscription with the same template exists in any team or the whole workspace (`addedAgainAs`; ~~the same scope only, the platform's one-per-template-and-scope rule~~ until the owner's build 12 item 9: a workspace holds a flow once), the sentence that it has been added again and "Open the live flow", which opens the twin in the same stack (build 11, D3). Every flow page says its team, or "Whole workspace", under its name (D4). The Runs, Successes and Failures tiles open Activity for this flow and outcome (24.11.9). **The run's fields and Start run are the page's start controls, at its top** (BUILD-PLAN 25.8.3; the owner's "i like the suggested lets do that"; ~~a Run button at the bottom opening them in a dialog~~): first under the flow's name, above the tiles, offered where Run was — live, its pinned version declaring input, its automation available — and drawn anew after each start; the rest of the page is as it was. **Set up draws the settings of the version the flow runs** (`Subscription.setup`, backend §12.1 #185), not the catalog's newest, which the platform does not check a save against once a version changes a field; none declared, no Set up. **A move refused `invalid_config` offers the new version's settings** ("Set them for v{N}"), seeded from what the flow holds, and saving sends the settings and the move in one change. **A flow owed an account says so under CONNECTIONS** — "Connect HubSpot before going live." — and the words open Settings › Connections, as the website links a card's unmet connections to its Connections page (Gate 24 parity, G9); an archived flow is owed nothing. Setup's Connect › and its Activate with an account owed open Settings › Connections too (~~Settings~~) **Since the Invoice Processing update** (Round 17, 2026-10-14; the owner's build 19 feedback; spec §3): its team on a line of its own under the name, then the description; CONNECT (~~CONNECTIONS~~) holds the vendor choice — logo, icon and name, or None, "Not connected" under a chosen vendor not connected, and "Connect vendor ›" to its vendor page — and each account it cannot run without that is not connected, by the provider's own icon (~~`iconFor(providerId)`, a blank~~) and "Not connected" (~~"Required before publishing"~~); under it "Connect {name} first, or choose None." opens the vendor page and "Connect {names} first." Settings › Connections (~~"Connect … before going live."~~). STEPS (~~PIPELINE~~) is numbered rows, "1 · Received", one per declared group with its description (backend ADR-0037), or one per step without groups — no kickers, no step cards; the groups only for a flow on the version they were declared for, a flow on another version by its steps. A connection is the flow's to choose only where the version it runs has the choice: a flow on an older version without it (Invoice Processing v1) is owed QuickBooks and says so (the review of the Invoice Processing screens). The status button is "Turn on" for a draft or paused flow (~~Publish, Resume~~), "Working…" while it saves. The start controls' lead is "Fill this in, then start the run." (~~the 28-word sentence~~); a file field has no "(optional)"; button icons 20. **Since Build 21** (Round 17, 2026-10-15/16; the owner's build 20 items 1–13, D1–D4, "go with all" ~04:15Z and his corrections AM1–AM8 of ~22:15Z and ~22:35Z; spec b21/spec.md; DESIGN-GAPS "Build 21"): the run page for the flow, the TEST VERSION of the owner's order (A6; D3): its name, status pill and team (no description, S24); DASHBOARD — Runs, Successes, Failures, read again on every return and every 5 s while a run of the flow is pending or running (`readRunStatsNow`, `FLOW_STATS_REREAD_MS`; S30); STEPS — numbered, one per group (or step), each with its description, Step 1 (the trigger's group) holding the run's fields by title, Take photo · Upload and Start run, or Turn on in Start run's place while the flow is off, then what it is owed ("Connect {name} first, or choose None." to Connect vendor; "Connect {names} first." to Settings › Connections); the step a vendor field names (`group`, ADR-0040) shows the vendor chosen as the one row — its mark, its name, "Connected" (ok) or "Not connected" (warn), None "Save the details only." — the whole row opening Connect vendor with `flow` and `field` (A3; ~~"Connect vendor ›" drawn whatever the connection's state~~, build 20 items 4–5); a version's vendor field that names no step (v2) is drawn under the steps; CONNECTIONS — every account the flow uses, the one connection row with its button; at the bottom Pause (while on), the move, MANAGE's **Edit setup** (opens Set up, AM4; ~~Set up, a dialog~~) and the webhook address, Archive flow. ~~CONNECT~~, ~~the start controls above the tiles~~. **Since the review of Build 21's screens:** Step 1 is one form whether the flow is on or off, so Turn on keeps a file given first, as the website's form does (~~a second form, drawn anew at Turn on~~). **Since Build 22** (P1–P4; the owner's build 21 items 5–7: "It should be / 1. Upooad Invoice / 2. Connect integration … / 3. Then something about AI Processing / 4. Quickbooks updated / 5. Email sent …", "Im on v3 now. But make sure it still has the steps the way i described", "After step 4 i dont want to see quickbooks … Remove the connections in the bottom as well . I also dont want a move to vx number in the flows. The user always gets the latest version"; D2/D3 the session's, approved): STEPS is the manifest's groups by kind (`flowStepPlan`, `lib/view/pipeline.ts`; backend ADR-0041), **titles only** — no description line (the session's S20): a group pipeline steps name draws nothing under it but Step 1's document and Start run on the trigger's row; a group no step names and with no `platform` (a setting step) draws the setup fields that name it — a connection field as the integration row (mark · name · Connected / Not connected, or None · "Save the details only." · caret, opening the choices page); a `platform: email` group draws who gets the run's email — EnvelopeSimple 24 · the first address (owners, admins, then the extra ones) · "and {n} more" · caret, opening Who gets the email, read with `readFlowEmailRecipients` and again on each return; unread "Unavailable", still a press (S22); nobody listed, "The person who starts the run"; an unknown `platform` its title only. A title follows `titleByConnection` and the flow's `config` (Invoice Processing v4's step 4: "QuickBooks updated" while QuickBooks is chosen, else "Details saved"). A setup field naming no group, or a group with steps, is not drawn here — it is on Set up. An archived flow draws step 2's row and step 5's title, neither a press, and reads no addresses. ~~CONNECTIONS~~ (Disconnect stays in Settings › Connections) and ~~Move to vN and "Set them for vN"~~ until Build 22: the platform moves every flow to the newest version (backend ADR-0041), and Add sends no `templateVersion`. |
| Flows/detail, a flow with items (Round 19; backend ADR-0046, plan §5.1) | the pinned version's `Subscription.items` and `GET …/subscriptions/{s}/items` (`listItems`): the flow's word for many over its list ("POLICIES" for a flow whose `items.words` says "Policies"), "Upload {one}" beside it for an owner or admin (`administers()`), then the items grouped by `groupField`'s value — the values A–Z, then the items without one, each group's items A–Z by `title` (`groupItems`; ~~groups in its `options`' order, then the names typed for it A–Z; rows newest first~~ until build 28) — each row its `title` and "{runCount} {runWords} · Top {topScore}" (the count alone while no run has a score), "Reading…" or "Couldn't read" (`lib/view/items.ts`); a row opens its item. None yet: "No {many} yet." Read again every `RUN_REREAD_MS` while one reads "Reading…" and the page is in front, one read at a time; a refused read costs the list its rows ("Unavailable"), never the page. **Since build 28** (the owner's items F2–F3: "Just the jobs and upload job"; the owner's decision of 2026-10-24): no DASHBOARD and no STEPS — a run of such a flow names an item — so Step 1's controls stand alone on a card under the name while there is one: Turn on while it is off, what it is owed (~~Turn on in Step 1~~); then the list, and under its head, for a flow that declares `groupField` and lists items, **the filter**: a drop-down (`components/dropdown.tsx`, its trigger the catalog's pill, read aloud "{field title}: {choice}") titled the field's `title`, "All {values}" first — the field's `title` made many (`allOf`: "Region" "All regions", "Category" "All categories"), the manifest naming it in the singular alone — then each value the listed items hold, A–Z (`itemGroupChoices`); All shows every group under its value's name, a value its items alone, A–Z, under no heading; a value no longer listed reads as All (`shownGroup`). Every word for the flow's things is the manifest's (`items.words`, `items.runWords`, each field's `title` and `options`), lower-case inside a sentence unless written as an abbreviation (`inSentence`) **Since Round 21** (backend ADR-0048): the flow page draws its parts in `Subscription.pages.flow`'s order — the pinned manifest's `display.pages`, else today's: a flow with items its items, any other DASHBOARD then STEPS — with today's code for each (`flowParts`, `app/(tabs)/flows/detail.tsx`); Turn on stands alone only where no STEPS hold it; a part this build does not know draws "This part can't be shown here yet." |
| Flows/item (one of a flow's items; Round 19, plan §5.3) | `GET …/items/{itemId}` (`readItem`) + subscriptions (an archived flow's when it is not among the live ones) + catalog: the item's `title`; its `groupField` value and where it is — "Ready", "Reading…", "Couldn't read: {failureReason}"; **since build 28** its tiles — Total (`runCount`), then `positiveCount` and `negativeCount` under the flow's `items.verdictWords` ("Advance", "Decline" for one flow), green and red (~~`itemTiles`~~; the owner's item F6), none for a flow that names no verdicts — then the "{File title}" row (`items.file.title`, F4: "Rather than saying what AI Read, at the top make a section that is named Job Description"; `OpenRow`), which opens "Flows/item file"; for an owner or admin, "Add {one run}" — the flow's `runInput` and Start (`StartRun` with `itemId`), offered while the item is `ready`, not archived and its flow can run (`canStartRun`) — the page staying, the new run joining the list; its runs exactly as `readItem` ranks them, numbered 1…n, each **a row the height of a drop-down's** (the owner's build 28 item F5: "the size of the must haves drop down. 1 then name of candidate and score then the arrow"; `components/open-row.tsx`, `RunSections`' 44-pt row, 11 above and below, 14 a side, the label type) — its rank, its `title` (or "Reading…" while it goes), its `score` and the arrow; a failed or cancelled one its status in the muted tone, title and score (never faded, which would take it below AA) — each opening its run in Activity's stack (`returnTo: flows`); ~~its result or failure line under it~~ and ~~"What AI read", the item's `sections`, each closed~~ until build 28 (F4: the sections go to the page of the item's file); and, for an owner or admin, "Archive {one}", red and last, behind the confirmation the flow's own archive asks ("It leaves the list and takes no new {runs}. Its {runs} stay.", the website's words) — archived, the page goes back. None yet: "No {runs} yet." Read again every `RUN_REREAD_MS` while the item reads or a run goes on. Loading, offline, error and unavailable as every fetching screen; an item whose flow no longer declares `items` is the error state, since its words cannot be drawn **Since Round 21** (backend ADR-0048) `readItem` sends `shape=blocks`: the page draws its header (title, group and state), then the answer's `blocks` as sent (`components/blocks/block-list.tsx`) — the tiles, the file row, its run form (`questions{run}`, drawn by `StartRun` under the gates above, with its title "Add {run}" as the section label, else nothing — no title either), the ranked runs (each score read "Score" first by a screen reader, NEW on the app) — then Archive; it reads again while the answer's `going` says so. The tiles, the rows and their words are the platform's (`runs` comes as `[]`); an answer with no `blocks` draws "This part can't be shown here yet." |
| Flows/item file (the file an item was made from; build 28, the owner's item F4) | `item` in the Flows stack (`/(tabs)/flows/item-file`): `readItem` and the subscriptions (an archived flow's when it is not among the live ones) for the flow's words, and `GET …/items/{itemId}/file` (`readItemFile`; any member). Back, the flow's `items.file.title` and the item's title; then, top to bottom, the original drawn in place, 440 pt tall, its name and line (`fileLine`: "PDF · 2 pages · 24 KB"), Download, and ~~the item's `sections`, each a closed drop-down (`RunSections`)~~ since Round 21 its reading, `item.blocks` from `readItem`'s `shape=blocks`, drawn as sent (each section closed), the viewer and the reading in the flow's `pages.file` order — a part this build does not know draws "This part can't be shown here yet.". `components/files/file-view.tsx` draws in place only a PDF, a JPEG or a PNG by its `contentType` (`viewName`), never by its name: the link checked https only, the file saved as "view.{pdf|jpg|png}" in a folder made for that one view (`downloadSignedFile`'s `freshFolder`) and drawn in a WebView with no JavaScript that reads that folder alone, the folder removed when the page closes; any other type "Download it to open it.", not saved. ~~Download takes a fresh link each press to `shareSignedFile`, the share sheet to save or share, as the package's downloads.~~ Since Round 21 Download, then Share (`FileActions`, below), each with a fresh link. "Opening the file…" while it comes; the file's refusals are the refusal map's. Loading, offline, error and unavailable as every fetching screen; an item whose flow no longer declares `items` is the error state |
| Flows/vendor (Connect integration; ~~Connect vendor~~) | **New with the Invoice Processing update** (the owner's build 19 item 1; backend ADR-0037; spec §3.C): `template`, and `flow` for an added flow. The catalog entry's optional connections in the manifest's order, each its logo (or icon and name), "Connected" in the ok colour, Intuit's Connect to QuickBooks button (other vendors "Connect") for an owner or admin while not connected — the vendor chosen once its connect returns — or "Ask an owner or admin to connect it." for a member, and for an owner or admin "Disconnect from QuickBooks" (others "Disconnect"), confirmed first; then None, "Save the details only.", last. A tap chooses a connected vendor or None, a check (24) marks it. A vendor's radio is its mark and the check alone; Connected, its Connect button, the member's line and Disconnect sit under it, outside it, so VoiceOver reaches each (the review of the Invoice Processing screens). A vendor this deployment does not list is drawn with nothing to do; one that takes a pasted key is connected in Settings › Connections. A `vendor` the link brings that is not None or one of the flow's vendors is ignored, here and on Set up. A flow not added yet: Done returns to Set up with `vendor` (`router.dismissTo`, the one Setup, its params updated). An added flow: Save / Saving… patches `config` with the choice, the rest of its settings kept, then Back; unchanged, nothing is sent; refused, "Could not save. Try again." **Since Build 21** (Round 17, 2026-10-15/16; the owner's build 20 items 1–13, D1–D4, "go with all" ~04:15Z and his corrections AM1–AM8 of ~22:15Z and ~22:35Z; spec b21/spec.md; DESIGN-GAPS "Build 21"): `flow` and `field` (the step's connection setting, ADR-0040); ~~`template`, `vendor`, Done, Save~~. **A tap is the choice, saved, and Back** (A2; the owner's build 20 item 2): a connected vendor or None → PATCH `config[field]` (the rest kept) → Back; the one already chosen → Back, nothing sent; a vendor not connected, for an owner or admin → its sign-in through the provider at once, then PATCH → Back; cancelled, failed or incomplete → stays, said under its row, the connections read again; a key provider → Settings › Connections; a member: "Ask an owner or admin to connect it.", the row no choice. While it saves the tapped row says "Saving…" and the rest wait; a refused save "Could not save. Try again." under the card. Each vendor is the one connection row (mark · name · email or state) with the check (24) on the chosen one. ~~Intuit's Connect to QuickBooks button and "Disconnect from QuickBooks"~~ (the owner ~04:15Z: "we will list on apples app store not intuits. so we do not need that"); disconnecting is Connections' (S13). **Since Build 22** (the session's S21; the owner's build 21 item 5: "2. Connect integration … if i click that button it should take me to the choices I have like none or quickbooks"): titled "Connect integration" (~~Connect vendor~~), "For {flow}" under it, opened from the flow page's step 2; rows and tap-to-save unchanged. `audit:vocabulary` fails "Connect vendor" in copy in any form. **Since round 23** (B3; backend ADR-0043: only an organization's owners and admins change a flow's integration): for a member no row is a choice — None and a connected vendor too — nothing is saved, and the list ends "Only an owner or admin can change the integration."; a vendor not connected still says "Ask an owner or admin to connect it.". Set up draws the same for a member changing a flow already on; adding a flow stays any member's (ADR-0036). A save refused 403 says the platform's own words (`refusalMessage`), any other refusal "Could not save. Try again.". Settings › Connections was already read-only for a member (`canManage`). |
| Flows/email (Who gets the email) | **New with Build 22** (P5; the owner's build 21 item 5: "5. Email sent- this should show the email the automation sends to … When i select this step it should take me to the page where i can edit in a screen the email it should send to"; who always gets it is the session's D1, approved by the owner 21:12Z): `flow`. Reads `GET …/subscriptions/{id}/email-recipients` (`readFlowEmailRecipients`; any member who can see the flow) with the subscriptions and the catalog for the flow's name. Back · "Who gets the email" · "For {flow}"; ALWAYS — each of `people` (the workspace's owners, then admins) as UserCircle 24 · the address · "Owner" / "Admin", then "The person who starts the run"; ALSO SEND TO — each of `extra` as EnvelopeSimple 24 · the address, for an owner or admin (`canEdit`) with an X read aloud "Remove {address}", or a None row; under it, for an owner or admin, the address field ("Email address", the email keyboard, no capitals, read aloud "Email address" once it holds one; the page makes room for the keyboard and brings the field into view, the Build 22 review) and Add / Adding…, or at ten "You can add up to 10."; for a member "Ask an owner or admin to change this." **Each add and remove is saved at once** (the session's S30): Add checks the address first — the contract's `FlowEmailAddress` pattern, 3–254 characters, else "Enter an email address."; equal without case to any address listed, "Already on the list." — then PUTs the whole list (`updateFlowEmailRecipients`, no `Idempotency-Key`: the body is the whole list) and shows the answer; X PUTs the list without it, no question, its row saying "Removing…" meanwhile; a refusal or a failure says "Could not save. Try again." under the section, the list unchanged. A failed load is the shared failed load with Retry ("Couldn't load this flow"). |
| Flows/archived | `GET …/subscriptions?status=archived` (backend §12.1 #203), only the archived rows kept, within the scope, each with the day it was archived (its `updatedAt`), and every row with its team or "Whole workspace" in every scope, a picked team's included (D4; the build 11 review); Flows reaches them through "Archived", a secondary button left of New in its header, always drawn, with no count (build 11, D5 — ~~one row with a count, 24.11.8~~), and from the empty standard's "Archived flows" button when any exist in the scope (D6). Settings has a copy in the Settings stack, whose flows open in Settings too, so Back stays there (24.12) |
| ~~Builder~~ | **Removed 2026-10-02** with Templates and Configure, on the owner's direction: the website has no builder, and FR-25 is parity with the website. Flow detail draws `pipeline[]` itself |
| Activity/run detail | runs/list/detail joined to catalog/subscription identity. Activity takes a flow and an outcome from a flow page's tile (24.11.9), and an outcome and today from Home's (the owner's build 12 item 1): the flow is a chip that clears itself, on a row of its own above the outcome (~~the four outcome chips~~ until round 23). **The day is the time range's** (the owner's build 13 decision 4; build 14): a button beside the title, drawn as the scope's pills are (since Build 22 right of the title row's two circles, and on a row too narrow for its words — a 320-pt phone — its calendar alone in a 38-pt circle, read aloud "Time range: {range}", the Build 22 review's M11), says the range — All time, Today, Week, Month — and opens the four in a drop-down (~~a card~~ until round 23), each with what it spans; All time, every run, is what Activity opens on; Today is since local midnight (`localMidnight()`, the tiles' today), Week the last 7 days and Month the last 30, back from that moment on the local calendar (`rangeStart`, `lib/platform/runs.ts`); the range and the outcome select together; a range holding none says so — "No runs today." / "No failed runs in the last 7 days." / "No runs in the last 30 days." (~~"Today ✕", a chip on that row, which could only clear~~ until build 14). ~~The runs list takes no window, so the ranges select among the newest 100 runs it answers.~~ Since Round 21 the platform selects: the range goes as `since`, the outcome as `status` or `needsReview`, with the search, the order and the page ("Block set v2 and the spacing table", below). A Home tile arrives with Today, a flow page's with All time; every arrival from a tile applies its selection, the same tile pressed again included — Activity takes it once and clears it from its route (build 13); the tab bar arrives with nothing and changes nothing, the range included. A run of an archived flow says so. Each row also says the website's line under its own: the date and time the run was made and the version it ran ("Oct 7, 2026, 9:05 PM · v3"; `dateTime`, in the phone's zone as the day sections are), ~~and a continuation says "After approval", held again or not (Gate 24's parity pass, G17)~~ — since round 24 a row is a job, listed by its first run's id at its newest status, and no row is a continuation (P9). Run detail reads in the workspace it was opened in and leaves when the active one changes. **It says what the website's run page says** (G18): ~~the version it ran beside its flow's name~~ (its flow's name alone since the Invoice Processing update, as the website's); Started, Ended and Trigger, in the website's words (Triggered, Manual, After approval, After retry; the em dash for a moment not reached); ~~"Continues the run that was held.", opening that run in the stack the page is in~~ (gone in round 24, P9: one id per job); a held step's summary with its reason beside it; each step's date and time; and "No steps reported yet." while none is, the flow's declared steps after it. **A run's page reads the run again every 2 s until it has ended** (the owner's build 14 feedback #3), one read at a time — the next once the last has settled, either way — and only while it is the screen in front, each in place (`refresh`); once it has ended, **a declared step it never reported reads "Not run"** with what it would have done, not pending, and Steps done counts the steps that finished, a failed or held one not among them (#4, #5, #8). A held run's remaining steps stay drawn as waiting. **Activity carries the permanent way into Approvals** (the owner's decision at Gate 24's close, G1): a row above the runs, "Approvals · N waiting", N the workspace's pending approvals (`?status=pending`, what Approvals lists and the website's sidebar counts), drawn at 0 too — Home's banner shows only while something waits — and it opens Approvals **Since the Invoice Processing update** (Round 17, 2026-10-14; the owner's build 19 feedback; spec §3): a run's page says how it went on a line of its own — `resultSummary`, `failureReason`, or "Waiting for approval." — under its flow's name (~~"{flow} · v{N}"~~: the website's run page no longer says the version, nor the catalog card, S9; the review of the Invoice Processing screens); PROGRESS (~~TIMELINE~~) is one row per declared group that has a reported step, in the groups' order — the catalog's groups only for a run of the version they were declared for, and a reported step no group holds after them, never dropped, as the website draws it — the group's title, the latest reported step's summary in it, its outcome's icon at 24 (CheckCircle, HandPalm, WarningCircle), its time — or, without groups, each reported step titled from the pipeline, never by its id; **no row for a step that did not run** (~~"Not run" and the waiting rows of every declared step~~, the owner's build 19 item 6), and "Working…" last while the run goes on. Steps done is the rows done over the rows shown; Confidence is gone. DETAILS draws `RunDetail.details` — label and value — when a succeeded run saved any (backend ADR-0037, §12.1 #67 as amended). **Since Build 21** (Round 17, 2026-10-15/16; the owner's build 20 items 1–13, D1–D4, "go with all" ~04:15Z and his corrections AM1–AM8 of ~22:15Z and ~22:35Z; spec b21/spec.md; DESIGN-GAPS "Build 21"): Activity's rows say when and the run by its FULL id under their line ("Sep 30, 2026, 9:05 PM · Run {id}", A8, AM2; ~~· v{N}~~). A run's page is titled "Run {full id}" (selectable, wrapping at its hyphens), its flow and status pill under it — never the request id (D4); STEPS (~~PROGRESS~~) draws every group (or step) from the start, each "{n} · {title}" with its state's icon at 24 and one line: Waiting · Working… · Done and the time · "Waiting for approval: {reason}" · the run's failure · Skipped · Stopped — never a step's own summary, never a step id (`toTracker`, S14; build 20 items 10, 11; ~~"No steps reported yet.", rows only for what ran~~); a run of another version by what it reported, titled from the catalog or "Step n". Steps done is the groups done or skipped over every group ("0 / 4" at the start, never "1 / 1"). DOCUMENTS (the run's `documents`, backend ADR-0039): one card each — "Document i of n" (~~until round 24~~; "Invoice i of n" and a closed drop-down since, below) and its chip (Recorded, Saved, Not recorded, Not confirmed, Compared, Waiting; Not approved when the held run's approval was rejected or ran out, S21), "{Type} · {seller}", where, when, its numbers (its own under its printed label, else "No.", then every reference, AM7), its lines with "{quantity} × {unit price}", "More lines on the document.", the totals as printed (decimal strings, never rounded), how it was paid, the result line and the automation's own lines; DETAILS only for a run with no documents. The facts add Run ID (the full id). ~~Download JSON (`readRunDocuments`) hands `run-{full id}.json` to the share sheet (iOS the file, Android the text), "Could not download. Try again." when it cannot (S25).~~ (until round 24: the A8X run package below). **Since Build 22** (the session's S23–S25; backend ADR-0041): the run's STEPS are drawn by the catalog's — the newest version's — groups for any run whose every reported step they still declare (a v3 run by v4's five steps; ~~only a run of the catalog's own version~~), else by the steps it reported. A setting step is done from the start, CheckCircle, its line the integration the flow has chosen now ("QuickBooks Online") or "None" ("Done" when the flow cannot be read — a run does not record its choice, §12.1 #290); a title follows the flow's current choice (step 4 "QuickBooks updated" / "Details saved"); the email step is `RunDetail.email` with the run's status — step 5's states are round 23's below (~~Waiting while the run is pending or running; "Sending…" (CircleNotch) once it ended or held and the email is owed, or the platform sent no `email`; "Sent · {time}"; "Not sent"; Stopped for a cancelled run~~ until round 23); an unknown `platform` its title, no state, not counted in Steps done. The run page reads the flow (the live list, then the archived) beside the run; one that cannot be read costs those words only. **Since round 23** (the owner's build 22 feedback): the time range and the outcome are drop-downs on their pills (`components/dropdown.tsx`; the outcome All runs · Success · Needs review · Failed, one pill where four chips were); a working step's icon turns, a full turn every 900 ms, still under Reduce Motion (A4); **step 5 is "Run completed"** (A7), whatever the group's title: Waiting while the run is pending, running or held (an approval's email never checks it off); Failed for a failed run; Stopped for a cancelled one; done once it succeeded — "Email sent · {time}", "Sending email…" while the email is owed (or no `email`), "Done" when it was not sent — the website's words byte for byte (~~held "Sending…", "Sent · {time}", "Not sent" Skipped~~); Steps done reaches 5 / 5 only for a succeeded run. A push for a completed run (`run-succeeded`) opens the run's page as a failed run's does (A8), and an email's or a push's link — `/runs/<id>?workspace=<id>` the run's page, `/approvals/<id>?workspace=<id>` Approvals — opens in the workspace it names, switched to first as a tap is (A5; `linkTargetOf`, `app/+native-intent.tsx`). **Since round 24** (the owner's build 23 F4, F5: "Shouldnt it be in activity"): **runs live in Activity** — the one run page is `app/(tabs)/activity/run.tsx` (~~Home's stack, and Settings' copy for its inbox~~), so the Activity tab is selected on it from anywhere. Home's recent runs, Home's and Settings' Notifications and a flow's Run now open it with `returnTo` (home, settings, flows) and over Activity's own page (`withAnchor`, Activity's `unstable_settings` anchor); Back — the circle or the swipe — pops it off Activity's stack and returns to that tab as it was (Home › Notifications stays open); re-tapping Activity's tab stays in Activity. A push, a link and Activity's and Needs review's own rows open it with nothing to return to: Back is Activity. **Approve / Deny in step 4** (round 24 P6; the owner's build 23 F7–F10: "It should be step 4 approve or deny", "not many clicks"): a held job whose newest approval (`jobApproval`) is pending shows, inside the held step under "Waiting for approval: …", **Approve** (primary) and **Deny** (danger) — `DecisionButtons`, one tap each, no confirm — to a role the approval names (the workspace collection's role, as Approvals reads it); anyone else is told "Only {roles} can decide this."; with the approvals or the role unread, neither (the approvals read no longer fails the page). While one saves both wait and it says "Approving…"/"Denying…"; refused, its words ("The decision was not saved." by default) and both again; saved, the page reads the run at once — approved, the job runs on under the same id; denied, the step and the result line say "Denied" (S6: ~~Rejected~~), its waiting documents "Not approved". The held step says "Waiting for approval: {reason}" until its approval is denied, whatever else it says — never "Approved" or "No longer awaiting approval" on the step (~~until the round's review~~; the website's words, `toTracker`, the fallback rows too) — and of two approvals asked at one moment the first listed decides. **One run id per job** (round 24 P9; the owner's build 23 F12: "Why do i have 2 run ids for one job"; backend ADR-0044): the platform answers a job by its first run's id — the list one row at its newest status, the page its runs' steps, events and documents together — so the page reads one id from first step to last: a held step is held while the job is and done once it runs on (~~a continuation's earlier groups, done~~), an approved job says "Approved" while it starts again (~~"Approved — continued in a new run"~~), and the newest approval for the job decides (`jobApproval`). **Each document is a closed drop-down** (P10; the owner's build 23 F15: "each one should be a drop down. It should also be invoice not document"): "Invoice i of n", its chip, a caret and `{vendor} · {total}` (S9) on a 44-pt header, a button that says whether it is open; all closed at first, each opening on its own in place (Reanimated `FadeIn` and `LinearTransition`, none under Reduce Motion), its content starting with Document type and Format — the platform's word for the file its `source` names (`RunFile.format`: PDF, JPEG, PNG or HEIC, else the subtype in capitals, shown as given; ~~the app's own reading of the content type, `formatLabel`~~ until the round's review), else — no source, or one not among the job's files — the job's only file (`RunDetail.files`), else no row (`formatFor`, the website's rule). Without a seller the closed line is the total alone, and without either it is left out (the website's; ~~the type before the total~~). **The A8X run package** (round 24 P12; the owner's build 23 F16: "No more download json"; backend ADR-0045): once the job has documents and is no longer pending or running, **View package** (secondary, `FileText`), **Download PDF** and **Download Excel** (`DownloadSimple`) replace Download JSON. A download asks the platform to build the file for the job (`POST …/runs/{runId}/package`, `createRunPackageFile`: `pdf` or `xlsx`, a key per press `run-package-<format>`, the phone's zone), answered as a short-lived signed link; asked once more when the platform is busy, and a file that is not the format asked for or is too large is refused before anything is saved (`requestRunPackageFile`; the wait and the bound are README "Runtime architecture"'s; ~~only a 503 with `Retry-After`, capped at 15 s~~ until the round's review); then it is handed on by the helpers Settings › Data's export uses too (~~`shareSignedFile`: the link https only, iOS saves it into the cache, hands it to the share sheet and removes it, Android opens it~~; since Round 21 `FileActions`' Download — `saveSignedFile` — and Share — `shareSignedFile`, the PDF — below); any failure is "Could not download. Try again." — one path for both screens (`hooks/use-run-package.tsx`). View package opens **Run package** (`app/(tabs)/activity/package.tsx`, Activity's stack, `?runId=`): **the PDF itself** (the main session's correction, ~~S16, the package's sections as a page~~), built as above, saved into the cache under a name of its own and drawn from that file in a WebView (`react-native-webview`; the file only); the header holds Back, Download PDF and Download Excel (and Share since Round 21); "Preparing the package…" while it is made; still busy, a file that is not a PDF or is too large, a link that is not https, or a file not saved, "Could not open the package. Try again." — the website's words for each (`packageNotOpened`; ~~the platform's words for the last two~~ until the second review) — with Retry; any other refusal, "Couldn't open the run package" and the platform's words; the cached file is deleted when the page closes. **Since Round 18** (backend BUILD-PLAN 27.5.1; the owner, 2026-10-21: "invoice is invoice processing specific"): a document's heading is its flow's own word, the catalog entry's `documentWords` — "Invoice i of n" for Invoice Processing — else "Document i of n" (`documentOf`, `lib/content/screen-states.ts`); no screen holds code for one flow (`__tests__/no-flow-code.test.ts`). **Since build 28** the tiles, STEPS and the facts are its Run details' ("Activity/run details", below), a row away; the result line, for a run that read no sections, and the held job's Approve and Deny stay on its page, under its name. **Since Round 21** (backend ADR-0048) `readRun` sends `shape=blocks` (`useRunDetail`): the page draws its header, then the answer's `blocks` as sent (`components/blocks/block-list.tsx`), in the flow's `pages.run` order — the "View {file}" rows, the result line toned by its status (an alert when the run failed; left out on a succeeded run with sections or blocks), the approval form while the job's approval waits (`questions{approval}`: Approve and Deny, `DecisionButtons`, to a role among its `eligibleRoles`, else "Only {roles} can decide this.", the role unread neither), then what the run read (each document a closed section on a card of its own: "Invoice n of N", "{seller} · {total}", its chip, toned as sent) — then its footer: View package, Download PDF and Download Excel while the answer's `packageAvailable`, Run details, Cancel run, View flow. ~~The documents' cards, DETAILS and the result line drawn here (`toDocumentCards`, `runResultLine`)~~: the platform's blocks now. A held run whose blocks hold no form yet is read again, at most `HELD_APPROVAL_REREADS` times (`rereadForApproval`). An answer with no `blocks` draws "This part can't be shown here yet." |
| Activity/run detail, a run with a title, a score or sections (Round 19; backend ADR-0046, plan §5.4) | `Run.title` and `Run.score` together head the page — the name, and the score beside it at the heading size ~~in the text colour~~ (in its verdict's tone with the verdict's chip since Round 21, "Block set v2 and the spacing table") — in place of the run's id, which stays in its facts; **since build 28** under them, for a run of an item (`Run.itemId`), a "View {file}" row (`OpenRow`) for each of `RunDetail.files`, in upload order, named by the flow's `artifact` fields of `runInput` in order — "View resume" for one flow (`runFileRows`; the owner's item F7: "the first section should be the view resume button"), "File" when none names it, "{…} 1 of 2" for files that share a word — each opening "Activity/run file"; `RunDetail.sections` follow under "{Run word} details" — the flow's `items.runWords.singular` ("CONTRACT DETAILS"; "DETAILS" for a flow that names no runs; the owner's build 28 item F8) — before the documents and the details, as collapsible rows (~~`components/runs/run-sections.tsx`~~), the first open: each entry its title in bold, its subtitle muted, its text, and its `url` as a link opened outside the app, `http:` and `https:` only. ~~After the result line, before the steps~~ until build 28: where "{Run word} details" heads the sections, the result line is not drawn (F8: "Instead of strong match 6 of 6") **Since Round 21** the file rows, "{Run word} details" and the sections are the platform's blocks (backend ADR-0048), drawn as sent: each section on a card of its own, the first open as sent, each opening on its own; an address a link only when it is https, checked again when drawn and opened in the system browser (~~`http:`~~) |
| Activity/run details (Run details; build 28, the owner's item F9; the standard for every run, Invoice Processing's included) | **The run's page since build 28**, top to bottom: its name (or title and score), its flow and status; for a run that read no sections, its result line (`runResultLine`), and under a held line the job's Approve and Deny (`DecisionButtons`, as round 24 P6 guards them; ~~in the held step of Run details~~ until the build 28 parity review); for a run of an item, its "View {file}" rows; "{Run word} details" over its sections; its DOCUMENTS and the run package, or a v1/v2 run's DETAILS; the **Run details row** — `components/open-row.tsx`, "Run details" and the arrow on a card, the drop-down's row height — then Cancel run while it goes, and View flow. The row opens `/(tabs)/activity/run-details` (`runId`), in Activity's stack: the same reads as the run's page (`hooks/use-run-detail.ts`: bound to the workspace it was opened in and leaving on a switch, read again every 2 s while it goes, a held run's approvals past the snapshot), drawn as Back, "Run details", the run's name and status pill; Duration and Steps done; STEPS, every step, live, a held step saying where it stands (no buttons, and no result line, on this page); then Started, Ended, Trigger and Run ID — each as the "Activity/run detail" row above says it (~~on the run's page~~ until build 28: F9, "Rather than showing 54s and all the info there"). Loading, offline, error and unavailable as every fetching screen; Back pops to the run, whose own Back still returns where it came from **Since Round 21** the run's page body is its blocks (the "Activity/run detail" row); Run details is unchanged, its steps drawn by `components/runs/tracker-step.tsx` (moved out of this page) |
| Activity/run file (one file a run's job uploaded; build 28, the owner's item F7) | `runId` and `fileId` in Activity's stack (`/(tabs)/activity/run-file`): the run as its page reads it (`useRunDetail`) and `GET …/runs/{runId}/files/{fileId}` (`readRunFile`; anyone who may read the run). Back, the file's word as `runFileRows` names it and the run's title (else "Run {id}"); then the file drawn in place over the rest of the page, its name and line, and Download (`components/files/file-view.tsx`, as "Flows/item file" says). Loading, offline, error and unavailable as every fetching screen; no `fileId` is the unavailable state **Since Round 21** the run is read as its page body (`readRun`'s `shape=blocks`, `useRunDetail`); this page's title and file are unchanged |
| Approvals | pending approvals joined through subscription → template → pipeline step, and the workspace collection for the person's role there, as the website reads it (`roleInWorkspace`), not the session's bounded list (Gate 24's parity pass, G19, G20). Each card says the approval's status (Pending), when it expires ("Expires in 3h", the website's `formatExpiry`) and "View the run", which opens the run it holds; Approve and Reject only for a role its `eligibleRoles` names, anyone else told "Only {roles} can decide this." **Since Build 21** (Round 17, 2026-10-15/16; the owner's build 20 items 1–13, D1–D4, "go with all" ~04:15Z and his corrections AM1–AM8 of ~22:15Z and ~22:35Z; spec b21/spec.md; DESIGN-GAPS "Build 21"): each card says the run it holds by its full id beside View the run (A8). **Since round 24** (P6, P7; the owner's build 23 F8, F11): Approve and **Deny** (danger; S6, ~~Reject~~) are `DecisionButtons`, the decision logic `hooks/use-approval-decision.ts` — both shared with the run's step 4. A decided card's pill says Approved or Denied (never "Pending" beside a decision) while it slides out left in 220 ms and the rest close up (`SlideOutLeft`, `LinearTransition`; none under Reduce Motion); the count counts down; the last one decided returns to Activity's main page (`dismissTo('/(tabs)/activity')`: back when it is beneath, else in place). ~~The "All caught up — decisions synced to your workflows." banner and "Approved ✓ — agent resuming" / "Rejected — sent back to sender"~~ until round 24. The callout's warning icon is centred on its first line. |
| Notifications | the platform's inbox, `GET …/notifications` (the owner's build 13 decision 3A; build 14): held runs and failed runs, newest first, each read or unread for this person, nothing they dismissed; the words drawn from the catalog (`inboxRows`). ~~Mark all read names the unread rows on screen by id, so an item that arrives after the inbox was drawn stays unread~~ (Clear all since round 24, below); opening an unread row reads it; each row has its own Dismiss, beside it rather than inside it so a screen reader reaches it; a save re-reads in place, never a skeleton, and a refused one says so under the push card (~~pending approvals plus failed runs; explicitly an in-app composition~~). Settings › Notifications is the same inbox, a copy in the Settings stack (24.12). **Dismiss takes its row away at the tap** and puts it back with the reason if the platform refuses (the owner's build 14 feedback #10), on a 44-point target that reaches no further than itself. **Since round 24** (P8; the owner's build 23 F6: "The mark all as read does not clear. Rename it to clear all and it should wipe the notifications"): **Clear all** (~~Mark all read~~) empties the inbox — every item the platform holds for this person, past the ones listed (S7; `POST …/notifications/clear`, `clearInbox`, an idempotency key) — its rows leaving at the tap as a dismissal's do and coming back with the reason if refused; each press its own key, so a press after a refusal is a new intent; an item that arrives after the tap is listed. Its run rows open Activity's run page and Back returns to the inbox's tab (P5). The website has no inbox. |
| Settings | **only the plan, quietly** (build 11, D1): for an owner or admin, the workspace's billing through the shared snapshot — one request per workspace per settled window, ~~shared with the Billing page~~ refreshed by the Billing page's own read, which is a real request at every visit (the build 11 review) — drawn as Billing's value, the plan's name on the title's line before the arrow ("Free", "Plus", "Pro", by the one enrolled-plan rule in `lib/view/billing.ts`; under the title until the owner's build 12 item 2), once it is known, nothing while loading and nothing on a failure or offline (no error screen: a quiet line, the first of its kind); a member's is never read, and their line under the title says "Managed by owners and admins". Everything else is the session's, the organization's name included (the owner's build 12 item 3): Organization's value is the active organization's name, for any role; in a personal workspace the one organization's name, "{n} organizations" for several, "None" for none, and nothing when the session's list is cut off (`workspacesTruncated`) without one — one rule, `organizationValue` (`lib/view/organization.ts`). A value is drawn on its title's line and moves under the title when the two do not fit, never cut (SettingsRow's `value`). ONE grouped page — Account (its email under it) → page · SECURITY: the Face ID row · Connections → page · Billing → page · WORKSPACE: the switcher row, Your role, Organization, Teams, Archived flows, Export my data · Notifications → page · APPEARANCE: Auto, Dark, Light — kept on the device, this-device-only, and the next launch's from its first frame (`lib/platform/appearance-store.ts`; Gate 24 parity, G2) · Help → page · Sign out · the version — in place of 24.12's eight pages (the owner's build 10 items 1, 2 and 4). The plan's totals left with the Solutions tab (24.9.5) **Since Build 21** (Round 17, 2026-10-15/16; the owner's build 20 items 1–13, D1–D4, "go with all" ~04:15Z and his corrections AM1–AM8 of ~22:15Z and ~22:35Z; spec b21/spec.md; DESIGN-GAPS "Build 21"): ~~AI reads documents~~ under SECURITY is gone with the owner's D1 (A1). |
| Settings › Connections | the provider registry and the workspace's connections: third-party integrations only (24.12, decision 9); sign-in accounts are Account's. A row is a provider and says what the website's two lists say (Gate 24 parity, G12 and G13): what connecting it lets flows do (its `description`, to everyone), then the account its connection acts as, its state and the live flows that use it ("alex@acme.co · Connected · used by 2 live flows", `usedByCount` — ~~"Connected · used by 2 flows"~~), and "This connection needs attention before it can be used." for one with an `errorCode`. ~~Under the rows, for everyone: "Only providers configured for this deployment are shown."~~ — gone with the Invoice Processing update (spec §3.I). **A provider whose icon names a brand mark** (`QuickBooksLogo`, backend 25.4.18) is drawn by the vendor's own logo in place of the icon and name — the full logo, 24 pt tall, the reversed one on dark, unaltered (`lib/view/brand-logos.ts`, each file's sha256 held by a test) — and, for an owner or admin, by the vendor's own Connect button while not connected (Intuit's "Connect to QuickBooks", 274 × 48, connecting at once, no dialog, what it came back with under its row) and "Disconnect from QuickBooks" in its place once connected, opening the connection's actions, where Disconnect says the same words and no text Reconnect stands in for Intuit's button (Intuit's technical requirements 1.1 and 1.3). **Since Build 21** (Round 17, 2026-10-15/16; the owner's build 20 items 1–13, D1–D4, "go with all" ~04:15Z and his corrections AM1–AM8 of ~22:15Z and ~22:35Z; spec b21/spec.md; DESIGN-GAPS "Build 21"): every provider is the one connection row (A4; build 20 items 6, 7, 9): its mark at 24 × 24 — QuickBooks' round symbol cut square from Intuit's preferred logo, Google the design's own glyph, any other the icon set's — its name, and under it the account's email when the platform holds one, else Connected, Not connected or Needs attention (warning colour); for an owner or admin one button of ours — Connect (through the provider at once), Reconnect (needs attention), Disconnect (asks first: "Disconnect {name}?" and what it stops by `usedByCount`); a key provider's Connect or Reconnect opens its key form. ~~Descriptions, "used by N live flows", the CONNECTIONS label, the connection's actions dialog, Replace account, Intuit's button and "Disconnect from QuickBooks"~~ (the platform's replace route stays, unused). The same row on a flow page's CONNECTIONS and Set up. **Since the review of Build 21's screens (2026-10-17):** every change a row makes — Disconnect, a pasted key, a sign-in that came back without a handoff — drops the workspace's connections and flows from the shared snapshot before its screen reads again, so a screen that re-reads keeping its rows (a flow page, Set up) is never answered from it (~~a Disconnect still drawn as Disconnect for up to 15 s~~); the row's button answers a finger 8 pt past its edge (`CONNECTION_BUTTON_REACH`, Back's reach), 44 or more. |
| ~~Settings › Workspace~~, ~~Settings › Security~~, ~~Settings › Appearance~~ | **gone in build 11 (D1)**: their rows and controls are on the index; the workspace switcher still reads the workspace collection only when it opens |
| Organization | the workspace collection; for an owner or admin of the active organization, its members, domains and join requests — each request named by its requester's `displayName` and `email`, the id only when neither is sent (24.12) — and its join link — the website's `/onboarding/join-org?w=` on the browser leg's origin, its line following the joining policy of the first verified domain shown for matching emails, in the website's words (`joinLinkLine`; 24.12, decision 5); for someone in no organization, `organization-discovery`; for an owner or admin, **Verified domains only** under the domains (`PATCH /v1/workspaces/{id}` `domainOnly`; the owner's build 13 decision 8B; build 14) — the toggle moves at the press and back if refused, its refusals in words: no verified domain, or members signing in from outside one, with their count (nobody is removed; a member not seen since the setting arrived counts until they sign in again) — and joining or approving someone outside them said by reason (`outside_org_domain`). Each member's row says the day they joined (Gate 24's parity pass, G24) |
| Teams / team (24.11.7) | the workspace collection, each workspace's teams (`…/projects`), and each organization's directory (`…/project-directory`, backend 24.11.4); one team read in its own workspace; in an organization its memberships, and for its owner or admin — or the organization's — the workspace's members and the requests to join (`…/access-requests`). Teams draws each team's status in the website's pill (Active, Paused, Draft); a team's members say the day they joined, and a request to join says the address under a name (Gate 24's parity pass, G21–G23) |
| Home, Flows, add, setup, Activity | also the active workspace's teams — the scope control (24.9.2), the scope a flow is added to, and the label each flow carries |
| Billing | the workspace collection for the role; `/v1/plans`, which anyone signed in may read; for an owner or admin, the workspace's billing — a real request at every visit, never the snapshot's answer, which it replaces for the Settings line (the build 11 review: a plan read before Stripe's webhook landed was otherwise shown here for up to the 120 s window after a checkout); read again when the app returns to the foreground on iOS. **A plan that ends says so, and what follows**: "Ends {date}, then Free", and the Free card drops "To move to Free, cancel …" once the plan is cancelled (the owner's build 14 feedback #11); the platform reports a portal cancellation as ending from backend §12.1 #233. **The status is the website's pill, every one while the plan lasts** — Active, Trialing, Past due, Incomplete; none for the two that end access — and **an unpaid plan's Free card has Manage billing** (Gate 24's parity pass, G25; ~~"Status: past due", and nothing for an active plan~~ until then) |
| Account | the linked sign-in identities and the login providers, under a lead that says what linking does: "Any account linked here signs you in to this same account, in the app and on the website. Signing in with Google, Microsoft or Apple at the same email address as this account joins this account too. To use one with a different email address, link it before you first sign in with it." and then the credentials sentence (the owner's build 13 decision 9A, build 14; ~~"Link an account before you first sign in with it."~~, build 12 item 8) — a linked identity shows the address its provider reports (`email`, 24.12), none when absent; Unlink is `POST /v1/auth/native/identities/{provider}/unlink` with the device's refresh token (backend 24.11.1), its refusals said by reason (24.12); a link refused says why, one sentence per callback reason and nothing raw — an account already linked is never merged, and its sentence says to unlink it from the other account first, covering one already linked here (the platform sends one token for both; the owner's build 13 decision 10A, TestFlight #19) — and a link a domain-only organization refuses (403 `outside_org_domain`) says so and keeps the device's session **Since Build 21** (Round 17, 2026-10-15/16; the owner's build 20 items 1–13, D1–D4, "go with all" ~04:15Z and his corrections AM1–AM8 of ~22:15Z and ~22:35Z; spec b21/spec.md; DESIGN-GAPS "Build 21"): the lead is one line, "Sign in with any of these." (A5; build 20 item 9: "Why is there a paragraph"), and each sign-in provider is drawn by the design's own glyph at 24 (Google, Microsoft, Apple; ~~Key~~, build 20 item 8). |
| Data export | the workspace collection for the role; the bounded export on request; a complete export started, followed every 2 s (doubling after a failed read, three allowed), and its link read again at the moment of the download — on iOS ~~saved into the app and handed to the share sheet (24.12)~~ Download, then Share since Round 21 (`FileActions`, below) |
| Support | nothing read; the contact request is sent on the public operation; Privacy and Terms open on the website |

Every fetching surface has loading, offline, platform-error, **unavailable**, and
applicable empty behavior. Home draws its own (`sHomeErr`), and only when none of its
reads answered — each is a figure of its own (Gate 24 parity, G6) — worded by what
happened (G3): offline, the design's "Can't reach Autom8x" and its connectivity line;
a 429, the website's "The platform is busy right now", and any other failure, "The
platform could not answer just now", each over the website's "You have not been
signed out, and nothing was lost. Try again in …" with a 429's stated wait; no
backend or no workspace, the unavailable body and no Retry. ~~One combined failure state, a refusal
and an unresolved workspace both in its connectivity wording — the design's
carve-out~~ until Gate 24. A failed load anywhere says the person was not signed
out, in the website's words (`ERROR_BODY`; after a 429, `busyLoadBody`, with the
wait). Resource errors never reveal raw upstream bodies.

`unavailable` is separate from `error` because Retry distinguishes them. A
`PlatformNotConfiguredError` — no backend origin, or no workspace resolved —
cannot succeed on a second attempt, so offering Retry and "Try again in a
moment" invites a person to press a button that can never work.
`ScreenUnavailable` says what is actually wrong and offers no retry.

An empty queue is not an accomplishment. Approvals renders a first-run empty
state when nothing is pending on arrival; a queue this person cleared returns to
Activity instead (round 24 P7; ~~its "all caught up — decisions synced" line~~).

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
review" — the held queue — also list running, queued and cancelled runs. Since
Round 21 the platform selects: Success is `status=succeeded`, Failed
`status=failed`, and Needs review `needsReview=true` — held jobs nobody has
decided — never `status=held`, which lists a held run long after its approval.

## Block set v2 and the spacing table (Round 21)

Backend ADR-0048 amendment 1 (`BLOCK_SET_VERSION` 2) and the owner's build 30
notes F1–F6 with his decisions Q1–Q8 of 2026-10-26. The platform publishes the
contract, the fixtures and `fixtures/block-rules/`; the generator copies the
rules into `lib/generated/platform-contracts/block-rules.ts` (`BLOCK_WORDS`,
`BLOCK_SPACING`, `BLOCK_LIST_RULES` and the search and sort cases), headed by
one sha256 as the fixtures are, and `verify:platform-contracts` holds it.

**The spacing table** (`BLOCK_SPACING`, the owner's Q8; `space` in
`constants/theme.ts`), in points. The numbers are the platform's, in
`lib/generated/platform-contracts/block-rules.ts` (`BLOCK_SPACING`); this lists
only the names and what each spaces:

| Name | What it spaces |
| --- | --- |
| `edge` | the page's left and right edge |
| `group` | between groups: block to block, a header to the first block, the last block to a footer button |
| `title` | a title to what it heads |
| `inner` | between things inside one card or one row |
| `rowY` / `rowX` | a row's padding, at least `rowMinHeight` tall |
| `card` | inside a card |
| `bottom` | below the page's last thing |

(`edgeWide` and `cardWide` are the website's wide screen.) The rules: a title
sits `title` above what it heads and `group` below whatever comes before it — a
form's title ("ADD CANDIDATE"), a label before a list ("CANDIDATES") and a text
box's label alike (F3); a group of related rows is one card with dividers, and
things inside one card are `inner` apart; no gap above the first group, `bottom`
below the last; no screen types its own spacing. Below the table's smallest
step, the inside of one control — a chip's own padding, an icon beside its
word, a line under the line above in one row — uses `inset`, the app's alone
(the website has no step below the table's), never between rows, cards, a title
and what it heads, or groups; `audit:spacing`'s `INSET` list holds each file
that uses it and how many times. `layout.cardPad`, `rowPadV` and `rowPadH` read
from the table; every row is `rowY`/`rowX`, the Settings index's too
(~~`rowY` and a control's step more~~ until Round 21's review: a roomier
Settings row is the owner's question). `audit:spacing` fails a typed number in
a padding, a margin or a gap under app/ and components/ (README
"Verification").

**The shared parts** — every screen is made of them:
- `Page` (`components/page.tsx`): the scroll, the safe area and the design's
  top, `edge`, `group` between parts and `bottom`; `fill` for a page that does
  not scroll (a file over the page).
- `PageHeader` (`components/page-header.tsx`): Back, the title at one size, 24
  (`typeScale.heading`; ~~21 on the run's pages~~, plan Open 11), its muted
  line or the page's own (`below`), and a slot on the right (`right`: the run's
  score).
- `SectionTitle` (`components/nocturne/section-label.tsx`): the tracked
  capitals, a header, `title` below it, a line height of one em, so the label's
  descent adds no room of its own (the 3 pt measured on fb03).
- `Group` and `DividedCard` (`components/group.tsx`): a title over its card; one
  card of parts with a divider between each (a flow's item groups, a flow's
  steps, a group block's sections).
- `SurfaceCard padded`: `card` inside, `inner` between.
- `OpenRow` and every row: `rowY`/`rowX`, at least 44 tall.
- `PillButton`: one height, 44 (`PILL_HEIGHT`; ~~36 to 68~~); Archive on an
  item's page is its `danger` pill, as Cancel run is.

**The blocks** (`RENDERERS`, thirteen types):
- **image** (`components/blocks/image.tsx`): its file read only for its typed
  target (`readRunFile` or `readItemFile`, in the page's workspace —
  `BlockContext.workspaceId`), its link checked (`signedLink`), saved in a
  folder of its own (`downloadSignedFile`'s `freshFolder`); a JPEG or PNG is
  React Native's `Image`, contained, the page's width and at most
  `PICTURE_HEIGHT` tall (the number is in `image.tsx`), one image read as its
  `alt`, a press opens the file's page; a PDF is the file page's frame
  (`components/files/file-frame.tsx`: no JavaScript, its own folder only),
  `PICTURE_HEIGHT` tall; the folder is removed when the page closes. Its words are
  the file page's constants (`FILE_OPENING`, `FILE_GONE`, `FILE_NOT_OPENED`,
  `TRY_AGAIN_LABEL`); a file of another type is today's file row.
- **chart** (`components/blocks/chart.tsx`): react-native-svg, no library; a bar
  per point, its width `value / max` of its track; a line across the width
  `onLayout` gives, a dot at each of 24 points or fewer; the theme's accent and
  ring; no animation; one image read as the platform's `alt`.
- **group** (`components/blocks/group.tsx`, `GroupCard`): its title as a
  `SectionTitle`, then one card of its sections as drop-downs with dividers, the
  first open as sent and several open at once (Q6, F6).
- **list**: a row's score toned by its `valueTone` — the positive verdict
  green, the negative red, the tiles' tokens — its chip the verdict's word (Q5,
  F2); a failed row stays muted.

**Search, sort and pages** (`components/blocks/paged.tsx`: `SearchBox`,
`SortControl`, `Pager`, `ListTools`, `usePaged`; the rules
`lib/view/block-sort.ts`). One page size and one threshold,
`BLOCK_LIST_RULES.pageSize`. Every word is a `BLOCK_WORDS` key (owner-words.md
rows 1–16), never typed where a list is drawn; the words and the numbers are in
[`block-rules.ts`](lib/generated/platform-contracts/block-rules.ts), generated.
- A list or table block: the search box when `searchable` (an item's runs)
  or longer than `pageSize`; then the sort (`defaultOrder`, then `aToZ` and
  `highToLow` on a list, `columnAToZ` or `columnHighToLow` on a table) and the
  pager (`previous`, `pageOf`, `next`).
- A flow's items (`components/items/flow-items.tsx`): the search box always
  (`searchItems`, by title); longer than `pageSize`, `aToZ` (today's) or
  `newestFirst`, and the pages.
- Activity: the search box always (`searchRuns`), sent as `q` once typing
  rests; `status`, `needsReview`, `since`, the flow (`subscriptionId`), `sort`
  and `page` sent with it (`readRunsPage`); more than `pageSize` that match
  (`total`), the sort (`newestFirst`, `oldestFirst`, the oldest day first) and
  the pager; an answer without `total` is one page. The team scope still
  narrows the page shown, on the phone.
- A miss says `noMatch` in place of the list.

**The run's score** (Q5, F1): on the right of its name, in its verdict's tone,
the verdict's word after it as a chip — named by its flow's own words
(`Subscription.items.verdictWords`, `runVerdict`, joined by `useRunDetail`);
with no verdict, or no words to name it, plain and alone.

**Download, then Share, on every document** (Q7, F4; `FileActions`,
`components/files/file-actions.tsx`): a run's file and an item's file
(`FileView`), the run package's PDF and Excel (the run page and the package
page: Download PDF, Download Excel, then Share — the PDF), and Settings › Data's
complete export (Download file) and workspace summary (Download JSON).
- **Download** (`saveSignedFile`, `lib/platform/signed-file.ts`): on iOS the
  file saved into the cache, then into the folder the person picks in Files —
  expo-file-system's `Directory.pickDirectoryAsync()` (its
  build/ExpoFileSystem.types.d.ts:126-134: "On iOS, the selected directory
  grants temporary read and write access for the current app session only";
  ios/FilePickingUtils.swift:105-108), no share sheet — under its own name,
  without any folder it carries (" 2", " 3" after it when the name is taken); a picker closed saves nothing
  and says nothing. On Android the link opens, as before.
- **Share** (`shareSignedFile`): iOS only (`sharesFiles`): the file itself to
  the share sheet (`Share.share({ url })`, its local address), never the
  5-minute signed link; removed once shared. Android's share sheet carries text
  only without a module the app does not add (plan Open 8), so Share is not
  drawn there.
- A refusal is said under the buttons in the place's words — "Could not
  download. Try again.", "Could not share. Try again." (the website's), the
  export's own ("The file could not be saved.", "The export could not be
  shared.").

## Mutations

- Solution activation: create a subscription with an idempotency key, then
  patch its manifest-declared configuration.
- Solution pause and flow pause/resume: patch the real subscription status.
- Approval decision: post approved/rejected to the approval's stable ID with an
  idempotency key; retry reuses the intent key — one hook for Approvals and the
  run's step 4 (`hooks/use-approval-decision.ts`, round 24 P6).
- API-key connection: generated credential fields → connection mutation with an
  idempotency key, the button "Verify and connect" (Gate 24 parity, G15). A 409
  — the key reused with other values, or its first request still verifying —
  says "This request may still be in progress. Retry with the same details or
  refresh the connection list; a new connection request was not created.",
  with "Retry verification", which sends it again under the same key, and
  "Refresh connections", which closes the dialog and reads the rows again.
- OAuth connection: authorize → system browser → sealed native complete. A
  sheet that comes back without a handoff (`cancelled`) closes the dialog and
  re-reads the workspace's connections, because a system browser sharing a
  logged-in website session completes the connect at the website and skips the
  app handoff (manifest §12.1 #79); the re-read is how the app shows the truth
  without claiming a success it never received. **Connect and Reconnect are
  this one call** (Gate 24 parity, G14), each **the row's one button since
  Build 21** (spec A4): Connect for a provider not connected, Reconnect for a
  connection that needs attention (no `replaceConnectionId`, so the account is
  kept), Disconnect for one connected — asked first, "Disconnect {name}?" and
  what it stops (`usedByCount`); a key provider's Connect or Reconnect opens
  its key form. ~~A held connection opened its actions under its name:
  Reconnect, Replace account for OAuth, and Disconnect~~ until Build 21. **What it came back with is said,
  in the website's words** (G16): "Connection completed successfully." above
  the rows, or, answered `reused`, "Gmail is already connected as
  alex@acme.co, with everything it needs — there is nothing to authorize."
  (~~the dialog closed and nothing was said~~); back without the connection —
  the callback's `status=error`, or no code — the dialog says "The new
  authorization didn't complete, so nothing changed — your existing connection
  is still active. Try again or contact an owner." when the provider was
  connected, and "The connection could not be completed. Try again or contact
  an owner." when it was not. The reason is not read, as the website reads
  only the status (~~"Connection permission was declined."~~). The screen
  keeps the notice across the re-read, which draws the loading state in the
  card's place.
- Workspace switch: patch the session's active workspace with an idempotency
  key, then re-read the session; on a failed re-read the loaded screen stays
  and the dialog offers the read again.
- Disconnect: delete the stable connection ID — offered for a connection the
  workspace holds, connected or needing reauthorization, as the website offers
  it on each row (Gate 24 parity; ~~connected only~~).
- Sign out: unregister this phone's push device first, with the still-valid
  bearer and never blocking on it (build 11, D8) — once a registration still in
  flight has answered, waited for up to five seconds, so the id it answers is
  the one sent; one answering later keeps no id (the build 11 review); then
  revoke, and clear locally only on a terminal/successful answer.
- Round 16 (24.4), each the website's operation, words and gating:
  - Run: `createRun` with exactly what the pinned version's `runInput`
    declares, offered only on a live, available subscription that declares
    some — from the flow page's start controls since 25.8.3 (~~the Run
    dialog~~). Its key is new after each start, when the form is drawn anew
    (~~on each opening~~), and on any changed value, so only a resubmission of
    the same values reuses it. A file field offers Take photo beside Upload
    (25.8.3; the owner's decision 1 of 2026-10-10): the camera through
    `expo-image-picker`, its permission asked at the press and a refusal said
    in the field; the document picker held to a PDF, a JPEG or a PNG where the
    field names no types (a field that names them: Round 19, below). Every image — a photo, or a JPEG
    or PNG uploaded — is re-encoded once with `expo-image-manipulator`
    (upright, its long side at most 2,576 px, never enlarged, a JPEG at 0.9)
    and sent as `image/jpeg` under a `.jpg` name; a PDF goes as it is. A file
    uploads when given: `openUpload` for the file's size on disk, then the
    bytes are read and must be exactly that many, then the credential-less
    `PUT` to the signed URL with the type it was opened for, and
    `completeUpload`; the run's input carries only the file's id. **Since
    Build 21 a run with a file starts at the press** (the owner's D1 of
    2026-10-15: "we dont need to say this at all … the terms and privacy
    policy includes that information"; spec A1): the card, the Settings
    switch, the gate and their words are gone, and the platform's
    `aiDocumentReading` field and route stay, unused (the spec's S9). ~~**A run
    that carries a file, on a flow that uses AI, follows the account's answer**
    to "AI reads your documents" (backend ADR-0038, the Invoice Processing
    update; Apple's App Review Guideline 5.1.2(i)): `GET /v1/session`'s
    `user.aiDocumentReading`, saved with `PUT /v1/session/ai-document-reading`.
    Home asks it once, as a card, while it is null — a new sign-in and an
    existing account alike — "AI reads your documents", "Some flows send a
    document you add to AI models, through OpenRouter, to read it. They don't
    keep it.", "See our Privacy Policy." (the website's `/privacy`), Allow and
    Not now; a save that fails says "Could not save your choice. Try again."
    and the card stays — Allow tries again, and Not now then closes it
    without saving, the account still unasked (iOS gives this dialog no back
    gesture; the review of the Invoice Processing screens). What the app saved
    is the answer only until the session is read again: the next read — the
    one behind the save, or any later one — is the account's word, so an
    answer changed on the website or another device is followed here. Settings
    › SECURITY has the switch, "AI reads documents", below Face ID ("Could not
    save. Try again."). A run with a
    file on a flow whose catalog entry `usesAi`: allowed, it starts; never
    asked, the card asks first and Allow starts it; declined, it does not
    start, and "AI reading is off." with Turn on is drawn under Start run.
    The words are in lib/content/ai-reading.ts, the website's byte for byte.
    The per-run "AI reads this file" dialog, kept per person on the phone in
    the Keychain (lib/content/ai-consent.ts,
    lib/platform/ai-consent-store.ts) — removed in the same change, the
    owner's build 19 item 4.~~
  - Set up: patch `config` only; going live stays its own action — since
    Build 21 Set up's Save for a flow on or paused (the owner's AM4), Turn on
    for a flow not added or a draft.
  - Turn on (~~Go live~~, ~~Publish~~, ~~Resume~~ until the Invoice Processing update): offered only with no unmet connection and an available
    automation. Detail shows the status as read; the Flows list shows the
    answer to detail's change only until the list reads again.
  - ~~Move to vN: patch `templateVersion`, confirmed first, when the catalog's
    version is newer than the one pinned~~ until Build 22 (the owner's build 21
    item 7; backend ADR-0041): no client chooses a version — the platform moves
    every flow to the newest, the PATCH refuses `templateVersion`, and Add sends
    none.
  - Who gets the email (Build 22, P5): `PUT …/subscriptions/{id}/email-recipients`
    `{extra}`, the whole list, owner or admin only (a member is 403), no
    `Idempotency-Key`; each add and each remove at once.
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
    run, Disconnect, Unlink, Revoke. Since round 24 an approval's **Deny** is
    the danger pill too (the owner's build 23 F8: "Deny should be red layout
    color"; it ends the run). Not red: Pause (Resume undoes it), a join
    request's Reject and Deny (an answer, not a removal), Withdraw and Cancel request (the person
    can ask again — Withdraw's confirm is accent), Make a new secret, and every
    Cancel, Close and Not now.
  - Webhook address: owner or admin, webhook-started only. The address is read
    on each opening; a secret is issued with an idempotency key — a new one per
    press, the same one on each retry of that press until a secret is shown,
    the dialog closed and opened again included (the website's lifetime: held in
    memory by the flow's actions, scoped to the flow and its workspace, never
    stored), so a lost answer is answered again rather than rotated twice
    (backend §12.1 #240, Round 17; ~~with no idempotency key~~ until then) —
    shown once in the dialog and kept nowhere else.
  - Cancel run: pending or running only, confirmed first.
  - ~~Replace account: the OAuth connect with the connection it replaces; a
    `reused` answer is said as nothing replaced. Completed, it says
    "Connection completed successfully."; back without the connection, that
    the existing connection is still active (Gate 24 parity, G16).~~ Off the
    row since Build 21 (spec A4; the session's S12); `connectOAuthProvider`'s
    `replaceConnectionId` stays, unused.
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
  - **A flow goes to the team of its category, made by the platform when
    first needed** (the Invoice Processing update, 2026-10-14; backend
    ADR-0036; the owner: "theres no choose a team. there will be pre existing
    teams depending on which flows are added"). No client chooses a team or
    creates one: Create a team is gone from Teams, its empty state, the scope
    control and Home, and Setup's team picker and its lines with it. What
    follows, until "~~A flow is added to a team, always~~", is the record of
    the rule it replaces.
  - Teams (24.11.7; projects in the contract): ~~create~~ (24.12, the owner's
    decisions 1–3; removed with the Invoice Processing update) — in the workspace the person is in when the dialog opens,
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
    per team (18.6.2). **Activate reads the workspace's flows afresh before it
    adds one** — never the snapshot's answer, which can be 15 s old — and a flow
    held since, in any team or the whole workspace, is refused in the website's
    words, "This flow is already in this workspace.", and nothing is sent
    (Gate 24 parity, G10; the website's `subscribeToAutomation`); a copy in a
    team hidden from the person is the platform's to refuse. Every flow card,
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
    sends the person to a plan. Manage billing is on the enrolled card while
    the provider holds a subscription — the Free card too while a plan is
    unpaid (Gate 24's parity pass, G25). Android shows no purchase control or
    call to action. The workspace's billing is an owner's or admin's; a
    member sees the plans without actions and is told who manages billing. A
    503 is "unavailable", never a false plan.
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
  - Data export: the bounded summary as a JSON file — Download JSON, then Share
    on iOS; on Android Download JSON shares its text (~~Share JSON~~ until Round
    21); the complete export read afresh from its signed link — Download file,
    then Share on iOS (~~saved into the app and handed to the share sheet,
    24.12~~ until Round 21); on Android Download opens the link in the browser
    and there is no Share (`FileActions`, "Block set v2 and the spacing table").
  - Support: the contact form's fields and words; Privacy and Terms on the
    website's origin, the one the browser leg shares.
- Round 19 (backend ADR-0046, plan §5), a flow's items, the website's operations and words:
  - Upload {one} (the upload card, `components/items/item-upload-dialog.tsx`, an owner's or
    an admin's): each of `items.fields` in order — a `select` as the app's drop-down
    (`components/dropdown.tsx`; the owner's decision 7 of build 28, ~~the app's chips~~):
    its `title` over a pill saying the choice ("Choose" while there is none), read aloud
    "{title}: {choice}", which opens its `options`, then the values typed for it before (`listItems`' `choices`), then "Other"
    where it takes one (`allowOther`), which shows a text box held to 40 characters; a
    `text` field a box held to its `maxLength` (80 absent) — then `items.file` through the
    run's file field and upload path, then Upload, offered once each required field holds a
    value (or has a default) and the file has arrived. `createItem` with `{ fields, file }`,
    each value trimmed and an empty one left out, under one key per set of values (a retry
    after a lost answer makes the item once); made, the card closes and the list shows the
    new item, "Reading…", until a read lists it — then only as the reads list it.
  - Add {one run}: `createRun` with `itemId` and the flow's `runInput`, its key as every run's.
  - Archive {one}: `archiveItem` under its own key, behind the confirmation; one-way.
  - A file field that names its types (`acceptedContentTypes`, on a run-input field and on
    `items.file`): the document picker offers those; on the upload card and the item page a
    line under its title says them in words ("PDF, Word file or photo") — never in Step 1 of a
    flow page, titles only (Build 21, A6), though the platform names the types of every file
    field of a manifest with an `artifacts` block; a file of another type the picker let through is
    refused in those words ("Choose a PDF or Word file.") before anything is sent; a Word
    file goes as it is; Take photo, and the re-encode, only where a JPEG is taken.
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

- A flow's items (Round 19; backend ADR-0046), `itemRefusal` and `runRefusal`: a
  `createItem` 422 `artifact_unavailable` is the run's "That file can no longer be
  used. Choose it again." and empties the file; any other 422 is "Nothing was
  uploaded. Check each value and try again." under the form and "Check this
  value." under each field its `details.problems` names (at most 16 `{ path,
  message }`, a `path` read as `fields.<key>` against the item's fields:
  `refusedFields`), the website's words; 409 `subscription_not_live` is
  the upload's "Turn it on first; a paused flow takes no files.", and
  `items_not_declared` "This flow has changed. Go back and open it again."; 403
  over the plan the run's sentence; 429 `max_concurrent_runs` the run's
  full-queue sentence (`FLOW_QUEUE_FULL`), any other 429 the platform's busy words. A run naming an item refused 409
  `item_not_ready` says "Try again in a moment.",
  and `item_archived` "It was archived, so it takes no new runs." A refused
  archive keeps the dialog and says why, else "It was not archived."
- A run's or an item's own file (build 28; `readRunFile`, `readItemFile`, each a
  `RunFileLink`, never bytes): a 404 — another workspace's, another job's, a file
  the store no longer keeps — is "This file is no longer kept." with no Download
  and no Try again; a type not drawn in place (anything but a PDF, a JPEG or a PNG) is
  "Download it to open it." with Download; any other refusal (502, 503), a link that is not https
  (`signedLink`) or a file not saved is "Could not open the file. Try again." with
  Try again; Download refused is "Could not download. Try again." (`DOWNLOAD_FAILED`,
  the package's words); the page's own read (the item, or the run) fails as every
  fetching screen's.

- Full run output is not public: render `resultSummary` on success and
  `failureReason` on failure; never invent extracted fields. Since the Invoice
  Processing update a succeeded run's `details` (label and value lines its
  automation wrote for people, on the one-run read; backend ADR-0037) are
  drawn as DETAILS — never the raw output.
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
  logout. It is asked for on the inbox's card — above the rows,
  and above the empty standard when there are none (the owner, 2026-10-03) — and,
  since round 24 (P8; the owner's build 23 F6: "Just like that it should be
  notifications allow"), once after a sign-in on its own screen,
  `app/(auth)/notifications-offer.tsx` — after the Face ID offer where that is
  asked (`nextAfterSignIn`) — and, since Round 18, at a kept session's cold start,
  past the cover or the Face ID lock (`nextAfterColdStart`; backend §12.1 #301, the
  owner's build 25 feedback, superseding ~~never at launch~~ of 2026-10-03), only on
  an iPhone iOS has not asked yet and with no Not now kept (`offersPushAsk`), in the Face ID offer's layout (`OfferScreen`):
  the bell, "Turn on notifications", "Know when a run needs your approval or
  something goes wrong.", Turn on and Not now, then where the sign-in goes (Home, after a
  cold start). iOS
  asks at the "Turn on" tap, "Not now" holds for the session; Android and a simulator
  register nothing and the card says so (§12.1 #211); a platform without the
  route (404/503) is "Notifications aren't available yet." in words. A tap
  opens a failed run's page, or Approvals for a held one (Gate 24's parity
  pass; ~~Activity~~ until then), as its row in the inbox does, in the
  workspace the push names (`data.workspaceId`, sent from the NINETEENTH
  promotion): another of the person's workspaces — a UUID on the session's
  list — is switched to first as the switcher does
  (`PATCH /v1/session/active-workspace`, then
  `/v1/session` read again), and the screen opens once that session is drawn;
  a switch or a read that fails opens nothing. No workspace named, the active
  one, an id of another shape or one not theirs: it opens in the active
  workspace. No web push.
- Confidence is unpublished: ~~render the design's unavailable value~~ — not
  drawn since the Invoice Processing update (the spec's U11).
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
  archived row (`DESIGN-GAPS.archive.md`, Round 16). Home alone keeps it, to ask whether
  the workspace has set anything up at all.
- Refusals a person can act on are said in the website's words
  (`lib/content/refusals.ts`): moving a version, issuing a webhook address,
  starting a run, uploading its file, and Add's two plan reasons (on a 403
  only); since 24.12 creating a team (a kind already taken, and a member's
  403) and unlinking a sign-in account — by reason, and "Unlinking isn't
  available yet." for a platform without the route; since Gate 24's parity
  pass, a second copy of a flow the workspace holds, and what a connect or a
  pasted key comes back with. Since Round 17 a run refused because its flow and
  the flow's queue are full (429 `max_concurrent_runs`, backend 25.2.10) says
  the website's sentence, "This flow is busy and its queue is full, so the run
  was not started. Try again once one of its runs has ended."; any other 429,
  `creation_contended` included, keeps the platform's busy words and its wait,
  as on the website. A person reads that sentence only once the Edge relays
  `createRun`'s 429 (backend §12.1 #241, `snoopy-backend` #181): until that is
  promoted the Edge answers a full queue 502 `DEPENDENCY_FAILURE`, and the
  start controls show that problem's title, "Dependency Failure" (the Run
  dialog did until 25.8.3). Since the contract of backend #207 (25.2.39,
  25.8.8) a run's file whose upload is completed while the platform has no
  place yet to measure it (429 `measurement_busy`) is not a refusal: nothing
  was lost and the upload stays open, so the app completes the same upload
  again by itself (`lib/platform/run-file.ts`; `DESIGN-GAPS.md`, "A file
  waiting to be measured, completed again by itself") — after the wait the
  answer states, or 1.5 s when it states none, at most four more times, the
  field saying only that it is uploading meanwhile. Only a file still waiting
  after the fifth completion says the website's sentence, "Files are checked
  one at a time. Nothing was lost. Choose the file again in a moment.", never
  the platform's busy words; the field is emptied as after any refusal, and
  choosing the file again sends it afresh. A stated wait over 5 s is never
  waited out nor cut short: the sentence is said at once. Every other answer —
  a refusal, any other 429, an outage — is said at once, as before.
- A manifest control this build does not know (Round 17, 25.8.1 — the owner's
  requirement 1 of 2026-10-08, no app change per automation) is not a crash and
  not a guess: the row is the website's text input (`ManifestFields.tsx` draws
  every control but `toggle` and `money` as one) with one sentence under it,
  "This field is newer than this build of the app. Enter it as text.", and its
  value goes to the platform as a string for the platform to validate.
  `resource-picker` is that text input by the contract's own terms — a string
  naming a resource at the connected service, which no published operation
  lists (backend ADR-0030 §1) — and a control the app names, so it never
  carries the note. The Setup dialog sits inside `DialogBoundary` and the flow
  page's start controls inside `InlineBoundary`
  (`components/dialog-boundary.tsx`; the Run dialog sat inside `DialogBoundary`
  until 25.8.3): a row that cannot be drawn fails to the failed-load words
  ("Couldn't load this setup" / "Couldn't load this run's form", `ERROR_BODY`)
  with Cancel and Try again in the dialog, and Try again in the start
  controls' place on the page, never a white screen.
- A block that cannot be drawn, and a screen that throws, are not a crash
  (round 21, design D2.6). Before a renderer runs, `missingField`
  (`components/blocks/drawable.ts`) checks the block's required fields and
  their basic types against `block-required.ts`, generated from the contract's
  `Block` schema: a table with no `rows` is `FALLBACK` in its place, and the
  next block still draws. Each block is also inside `Catch`
  (`components/dialog-boundary.tsx`, exported, with `onError`), so a renderer
  that throws is `FALLBACK` too. A screen that throws reaches the root
  layout's `ErrorBoundary` (Expo Router's; `RootBoundary`,
  `components/root-boundary.tsx`, exported by `app/_layout.tsx`): "Couldn't load
  this", `ERROR_BODY` and Retry, which draws the screens again. Each of these,
  and `DialogBoundary` and `InlineBoundary` through `Catch`, logs one line,
  `notDrawn` (`components/blocks/not-drawn.ts`): `console.error('block not
  drawn', { type, error })`, the block's type or `unknown`, and the missing
  field's name or the caught error, never a block's words or values. It is
  read in the phone's system log (Xcode › Devices, or Console.app with the
  phone attached); no reporting service. A type this build does not know is
  `FALLBACK` too, logged with its type and `unknown type`; a page body with
  no blocks is `FALLBACK` alone, logged as `unknown` and `no blocks` (`not a
  list` when it is something else) — every fallback is logged (~~a type this
  build does not know is `FALLBACK` unlogged~~ until the PR 4 review). Each
  block's `Catch` is reset by its content (`resetKey`): a re-read that sends a
  different block in that place draws it, and the same block stays
  `FALLBACK` without a second line.

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
  that opaque string without inventing a picker data source. Since 25.8.1 the
  app names `resource-picker` as a control it knows (`KnownControl`,
  `components/setup-field.tsx`), drawn as that text input: "gets its control"
  read as the control the contract defines, and nothing more until a contract
  lists resources.

Builder was deliberately read-only in BUILD-PLAN 8.7, rendering the published
pipeline with Save, Test run, insertion and drag visibly disabled. **Removed
2026-10-02** with Templates and Configure (24.7.3 attempt 2 feedback): the website
has no builder, so a read-only one on mobile offered nothing the website offers.
"New" and Home's button lead to the catalog inside Flows (`app/(tabs)/flows/add.tsx`,
24.9.3); the Solutions tab itself went on 2026-10-02, on the owner's word — four
tabs: Home, Flows, Activity, Settings. The Settings SECURITY card keeps the
Face ID unlock (a page of its own in 24.12, on the index again since build
11, D1) and, from the Invoice Processing update until Build 21 (the owner's D1), "AI reads documents" below it; its Passkeys and Stay signed in rows were static design copy the website
never had, and went the same day.

**The type is the app's own scale** (24.12, the owner's decision 11 of
2026-10-02: bigger type, "whole app — easy to read"). Every font size, line
height and tracked size comes from `typeScale` in `constants/theme.ts` — about
2 pt over the design's text sizes and 3 over its titles, 12 at the smallest —
no longer the design's values carried over 1:1. `audit:type` fails a size
written anywhere else, and the Nocturne snapshots were re-pinned once for it.
**Since round 24** (the owner's build 23 F14: "based on the users phone size and
font size from their native ios system") text follows the phone's text size within
limits: every `Text` and `TextInput` is `components/text.tsx`'s, which defaults
`maxFontSizeMultiplier` to `fontScaleLimit.content` (2×, iOS AX2); text in a fixed
bar — the tab labels, `StatusPill`, `PillButton`'s label, `ScopePill`'s, the
Needs-review count and a title row's title — passes `fontScaleLimit.chrome` (1.35×)
and a chip keeps one line; a fixed height that holds text is a least height
(`minHeight`: the tab capsule's row, `PillButton`, the title row, the pills, the
badge, the fields), so a large size grows a row rather than clipping it. `audit:type`
fails `Text` or `TextInput` imported from react-native anywhere else. **The second
authorised re-pin** (props only: `maxFontSizeMultiplier`, `numberOfLines`,
`minHeight`) is README's re-pin fact. **No word breaks inside itself** (round 24's
simulator audit, the largest size: "Succe/sses", "Failure/s", "QuickBoo/ks.",
"Notificat/ions", "38m ago" pushed off a card, "Harbor…" and "All categ…" cut short):
from iOS's first accessibility size (Accessibility Medium, ×1.786,
`ACCESSIBILITY_TEXT_SCALE`) what sits side by side stacks (`useAccessibilityTextSize`)
— Home's and a flow's tiles one under another sooner, once a tile would be narrower than
100 pt × the text size (`StatTileRow`, `tilesStack`: from xxxLarge on an iPhone 17 Pro, from
xLarge on an iPhone SE, measured on the audit), Add a flow's card its
icon, words and Add, the inbox's Clear all under its title, whose title stops at the
chrome limit as a title row's does; a drop-down's least width follows the text size
(232 × the size, up to the content limit, never past the screen's gutters) and its rows
wrap a long name rather than cut it; a Needs-review card's flow name wraps and its
time keeps its place.

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
`Text` handlers: See all, Clear all — ~~Mark all read~~ until round 24 — a callout's retry). One selection tick,
before the handler, on iOS only; Android is as it was. A press that does
nothing gives none: no handler (the unswitchable workspace pill, the signed-out
cover, whose tap has no handler at all), or a disabled control. The toggle
ticks like every other press. A behaviour wrapper, not a Nocturne primitive —
the host tree is unchanged and the Nocturne components' snapshots with it.
`audit:haptics` holds it: a Pressable, Touchable or Button imported from
react-native outside the helper, a default or namespace import of react-native,
expo-haptics imported anywhere else, or a Text/View/Image/ScrollView/Animated
onPress that is not `pressed(…)` fails the build.

## Identity and key rules

React lists use server IDs or stable declared IDs: template ID, subscription ID,
run ID, approval ID, provider/connection ID, setup field key, and pipeline step
ID. Array position is never business identity. No route falls back to “the
first” catalog/subscription item when a requested identity is absent.
