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
`unavailable`. The tab layout admits only `signed-in`; every other state fails
closed to the auth entry. On launch, an enabled Face ID preference gates an
existing session through `expo-local-authentication`. Biometrics never create a
session and no timer counts as success. **The choice is the session's** (2026-10-02):
it is asked once after a remembered sign-in, on the screen where "Use Face ID" runs
the first check, and it is cleared with the tokens on sign-out — never inherited by
a later sign-in or a reinstall. Remember me off ends the session at the next cold
start, with nothing left in the enclave.

The active workspace is `session.user.activeWorkspaceId`, falling back only to
the first server-supplied membership. A route/form value never selects tenancy.
Switching it is a published mutation, `PATCH /v1/session/active-workspace`
with an idempotency key, followed by a re-read of `/v1/session`
(`useSession().reload()`); the app holds no workspace state of its own. The
switcher lists `GET /v1/workspaces` rather than the session's bounded
`workspaces` page, and Settings shows it only with two or more workspaces or
when `workspacesTruncated` says the list is incomplete — the same rule the web
switcher (snoopy PR #6) applies over the same operation.

**The scope control** (24.9.2, 2026-10-02) sits at the top of Home, Flows and
Activity: the workspace — the switcher, reached there as well as from Settings —
and "All projects" or one project. A project is a visibility scope on a
subscription (backend 18.6.2); runs and approvals carry no project and follow
their flow's, and one whose flow is unknown is kept rather than hidden. The
choice is kept per workspace on the device (`lib/platform/scope-store.ts`) and
never selects tenancy. The website has no project selector: a deliberate mobile
difference under FR-25, as the snapshot's windows are.

## Screen reads

| Surface | Published operations / mapping |
| --- | --- |
| Sign in | `GET /v1/auth/providers`; providers only — no password or reset surface is drawn (owner, 2026-09-08). **One screen since 2026-10-02**: the website's words ("Sign in with …"), a Remember me toggle, and the Face ID question once after a remembered sign-in; Welcome, Sign up and the Onboarding tour are gone |
| Home | session + catalog + `run-stats?since=<local midnight>` + runs + pending approvals |
| Flows/add (the catalog, "New") | workspace automation catalog and its server-supplied categories, plus subscriptions and projects — Added ✓ or Add per the scope looked at (24.9.3) |
| Setup/configure | catalog `setup[]` and the matching subscription config |
| Flows/detail | subscriptions + catalog + run stats; identity is subscription ID/template ID. Detail keeps the subscription (`runInput`, `triggerKind`, `templateVersion`) and its catalog entry for its actions; the webhook address is read when its dialog opens |
| ~~Builder~~ | **Removed 2026-10-02** with Templates and Configure, on the owner's direction: the website has no builder, and FR-25 is parity with the website. Flow detail draws `pipeline[]` itself |
| Activity/run detail | runs/list/detail joined to catalog/subscription identity |
| Approvals | pending approvals joined through subscription → template → pipeline step |
| Notifications | pending approvals plus failed runs; explicitly an in-app composition |
| Settings | session/workspace, provider registry, and workspace connections; the workspace switcher reads the workspace collection. The plan's totals left with the Solutions tab (24.9.5) |
| Organization | the workspace collection; for an owner or admin of the active organization, its members, domains and join requests; for someone in no organization, `organization-discovery` |
| Projects / project | the workspace collection and each workspace's projects; one project read in its own workspace; for a team project, its memberships, team grants and the visible teams, plus the workspace's members for its owner or admin |
| Teams / team | the workspace collection and the organization's visible teams; for a team's manager or an owner or admin, its memberships and the workspace's members |
| Home, Flows, add, setup, Activity | also the active workspace's projects — the scope control (24.9.2), the scope a flow is added to, and the label each flow carries |
| Billing | the workspace collection for the role; for an owner or admin, `/v1/plans` and the workspace's billing; read again when the app returns to the foreground on iOS |
| Account | the linked sign-in identities and the login providers |
| Data export | the workspace collection for the role; the bounded export on request; a complete export started, followed every 2 s (doubling after a failed read, three allowed), and its link read again at the moment of the download |
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
- Sign out: revoke first, clear locally only on a terminal/successful answer.
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
  - Remove flow: patch `status: archived` behind its one-way confirmation — the
    last thing on the flow page, in red (24.9.4). It leaves the list, keeps its
    runs in Activity, and the flow can be added again; Pause keeps it listed.
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
    domain claimed, a failed claim retried alone.
  - Projects: create — personal in the personal workspace, team only in the
    active organization it was loaded as; delete (archive) by its owner;
    leave — typing DELETE from the project's Leave, or confirming from one's
    own row, as the website does; add members, change a role (an admin only a
    member's), remove; give a team a role, never ownership, and take it away.
    Each acts on the project's own workspace, which can be other than the
    active one.
  - Teams: create (two characters at least), by an owner or admin; add
    someone or change their role, one operation; remove someone — a manager
    who removes themselves leaves the team's screen.
  - An automation is added to the whole workspace or to a project, the scopes
    it is not in yet, as the website's Add offers.
- Round 16 (24.6), each the website's operation, words and gating:
  - Billing (ADR-0032 option B): every platform shows the plan, its price
    (the provider's minor units, formatted only for a currency whose exponent
    is known) and the workspace's status. On iOS only, Choose plan opens the
    hosted checkout and Manage billing the hosted portal, each in the system
    browser, https only; a portal 409 sends the person to a plan. Android shows
    no purchase control or call to action. Owner or admin; a member is told who
    manages it and nothing is read. A 503 is "unavailable", never a false plan.
  - Account: linking another sign-in account is 24.2.1's native flow — a
    sealed ticket asked for with the bearer and refresh token (in a body, read
    inside the request), opened once in the system browser, then login's code
    exchange against the claimed callback. Deleting the account is ADR-0028's,
    in its words, and reads every answer the contract gives a bearer caller: a
    partial deletion keeps the account; a lost answer reads the session before
    saying either way; `SESSION_REVOCATION_FAILED` revokes through sign-out
    before this device lets go; an ended session offers sign-in. Deleted, the
    device clears its session and shows the signed-out screen.
  - Data export: the bounded summary shared as a JSON file (iOS) or text
    (Android); the complete export opened from the signed link, read afresh.
  - Support: the contact form's fields and words; Privacy and Terms on the
    website's origin, the one the browser leg shares.
- After a change, a screen re-reads from `loading`: what it showed is out of
  date and is not left to act on. A return to a screen re-reads it and keeps
  its rows until the answer lands (24.4.4) — through the shared workspace
  snapshot since 2026-10-02 (24.9.1, `lib/platform/snapshot.ts`): one in-flight
  request per resource; a resource younger than its window is answered from the
  snapshot (15 s for runs, approvals, subscriptions, counts and connections;
  120 s for the catalog, projects, providers and workspaces); an action
  invalidates what it changed, and `reload()` drops the workspace's whole
  snapshot. The website reads per navigation and caches nothing on the client:
  the windows are a deliberate mobile difference under FR-25.

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
- There is no notifications endpoint/read state/push contract: compose pending
  approvals and failed runs in app; do not claim OS push permission.
- Confidence is unpublished: render the design's unavailable value.
- `homeStats` is not an operation: derive the three tiles from windowed
  `run-stats` exactly as the refusal directs.
- Cross-tenant “used by teams” is not public: omit/inform with static product
  copy; use only `Connection.usedByCount` for this workspace.
- There is no retry operation preserving `rootRunId`: omit Retry rather than
  starting an unrelated run and calling it a retry. This is historical Finding
  9.
- Billing is ADR-0025's four operations and ADR-0032's rule (24.6.1 above):
  no card field, no in-app purchase, no price the platform did not state.
  Billing states the plan; the solutions total left Settings with the Solutions
  tab (24.9.5).
- A removed (archived) subscription is absent everywhere: not a flow, not Added,
  not paused, not reused by Add (`withoutArchived`, the website's rule). The
  catalog's `subscribed` is not used for Added, because it still counts an
  archived row (`DESIGN-GAPS.md`, Round 16). Home alone keeps it, to ask whether
  the workspace has set anything up at all.
- Refusals a person can act on are said in the website's words
  (`lib/content/refusals.ts`): moving a version, issuing a webhook address,
  starting a run, uploading its file, and Add's two plan reasons (on a 403
  only).

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
Face ID unlock only; its Passkeys and Stay signed in rows were static design
copy the website never had, and went the same day.

## Identity and key rules

React lists use server IDs or stable declared IDs: template ID, subscription ID,
run ID, approval ID, provider/connection ID, setup field key, and pipeline step
ID. Array position is never business identity. No route falls back to “the
first” catalog/subscription item when a requested identity is absent.
