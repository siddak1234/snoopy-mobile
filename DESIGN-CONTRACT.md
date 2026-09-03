# Mobile contract — Round 6, amended in Round 7.5M

Verified against the sibling master plan, Round 6 playbook, BUILD-PLAN 8.5–8.7,
ADR-0017, and the regenerated platform/automations/connections declarations on
2026-08-17; re-verified against the regenerated declarations on 2026-09-03
(`npm run verify:platform-contracts`: current). The published API owns business
truth. This file records how the client consumes it; it does not extend it.

## Completion state

Round 6 closed on 2026-08-18 after two fresh audits (`DESIGN-GAPS.md`). Round
7.5M (2026-09-03) added the workspace switcher, the browser-leg base, the
browserless refusal and the pinned release values; everything is **ready for
the Round 7F fresh audit**, not a declaration that any gate is closed.
`ROUND-7.5-OBSERVATIONS.md` lists what is observed and what is not.

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
uses that API at this floor. The login screen's “Stay logged in” control is a
disabled-on policy display because persistence is fixed by ADR-0017; it does
not pretend to offer an uncontracted session-only mode.

Session states are `restoring`, `signed-in`, `signed-out`, `unconfigured`, and
`unavailable`. The tab layout admits only `signed-in`; every other state fails
closed to the auth entry. On launch, an enabled Face ID preference gates an
existing session through `expo-local-authentication`. Biometrics never create a
session and no timer counts as success.

The active workspace is `session.user.activeWorkspaceId`, falling back only to
the first server-supplied membership. A route/form value never selects tenancy.
Switching it is a published mutation, `PATCH /v1/session/active-workspace`
with an idempotency key, followed by a re-read of `/v1/session`
(`useSession().reload()`); the app holds no workspace state of its own. The
switcher lists `GET /v1/workspaces` rather than the session's bounded
`workspaces` page, and Settings shows it only with two or more workspaces or
when `workspacesTruncated` says the list is incomplete — the same rule the web
switcher (snoopy PR #6) applies over the same operation.

## Screen reads

| Surface | Published operations / mapping |
| --- | --- |
| Login/signup | `GET /v1/auth/providers`; OAuth-only policy; password/reset refuse truthfully |
| Home | session + catalog + `run-stats?since=<local midnight>` + runs + pending approvals |
| Solutions/templates | workspace automation catalog and its server-supplied categories |
| Setup/configure | catalog `setup[]` and the matching subscription config |
| Flows/detail | subscriptions + catalog + run stats; identity is subscription ID/template ID |
| Builder | selected catalog entry's required `pipeline[]`, in manifest order |
| Activity/run detail | runs/list/detail joined to catalog/subscription identity |
| Approvals | pending approvals joined through subscription → template → pipeline step |
| Notifications | pending approvals plus failed runs; explicitly an in-app composition |
| Settings | session/workspace, catalog totals, provider registry, and workspace connections; the workspace switcher reads the workspace collection |

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
- Billing/payment/invoice operations are absent and Round 7-owned: Settings
  shows only the sum of published automation prices, never a fake plan base or
  card.

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

Builder is deliberately read-only in BUILD-PLAN 8.7. It renders the published
pipeline; Save, Test run, insertion, and drag affordances are visibly disabled
because no editing/test-run operation is in Round 6.

## Identity and key rules

React lists use server IDs or stable declared IDs: template ID, subscription ID,
run ID, approval ID, provider/connection ID, setup field key, and pipeline step
ID. Array position is never business identity. No route falls back to “the
first” catalog/subscription item when a requested identity is absent.
