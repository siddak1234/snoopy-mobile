# Round 6 — fresh-audit record

A session that wrote none of the implementation re-ran Gate 8 on 2026-08-18,
against the working tree rather than against `HEAD`, and did not inherit a PASS
from any earlier document. This file replaces the handoff it was written as: it
now records what that audit observed, what it found, what was repaired in
response, and what is still **NOT OBSERVED**.

## Verdict

Gate 8's commands all pass and the native build, boot and route boundary were
observed directly. Two gate lines failed on inspection and were repaired; the
authenticated §1 journey remains unobservable in this environment and is
recorded as NOT OBSERVED, not as a PASS.

**Second fresh audit, 2026-08-18.** A further session that wrote none of this
code re-ran every line above from scratch and did not inherit any PASS from this
file. It reproduced every headline number (1109 packages; 32 / 397 / 78; 12 high
/ 10 moderate / 0 critical; 21 operations; 12 SecureStore call sites; 21 non-ASCII
fixture strings absent from both shipped bundles in **both** encodings), proved
the visual gate and 26 of 30 injected architecture violations bite, and pushed
the branch so **CI ran green against a Round 6 commit for the first time**. It
found three things this file had wrong, each corrected in place below and none
of them a failed gate line: repair #5 has no test behind it, four gate blind
spots are open, and the "0 unreachable objects" figure was vacuous. It also
found the four tracked files this file called unreadable are readable again.

## What the audit ran, and what it saw

| Line | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | exit 0, 1109 packages |
| `npm run verify` | PASS | exit 0 — **32 suites / 397 tests / 78 snapshots**. (The audit itself first ran 33/401; deleting `lib/fixtures.ts` took `__tests__/fixtures.test.ts` — which only asserted that data against itself — with it, and the repairs added suites of their own.) |
| `npm run audit:dependencies` | PASS | exit 0; 22 production advisories (12 high, 10 moderate, **0 critical**) |
| `npm run export:ios` / `:android` | PASS | exit 0 each, ~11.1 MB `.hbc` per platform. Re-run after the repairs with the output redirected out of the iCloud-synced tree — the gate's own `dist/` could not complete while iCloud wrote conflict copies into it (see below). The fresh iOS bundle was grepped in **both ASCII and UTF-16**: all ten fixture-only strings absent, every new string present. Hermes stores non-ASCII strings as UTF-16, so an ASCII-only grep would have missed anything containing `·` or `—`. |
| 0 runtime `lib/fixtures` imports | PASS | the gate reports 0, **and the shipped Hermes bundle contains none of the fixture-only strings** (`Beacon Supply Co`, `4821`, `Invoice triage`, `ap@acme.co`, `solutionDefs`) while control strings are present |
| `audit:credentials` | PASS | allowlist empty |
| Nocturne visual unchanged | PASS | 78 snapshots unchanged across the repair; the gate was proved to bite — a one-digit accent change fails 10 snapshots, +1pt padding 8, +1pt radius 6, a font-family change 14 |
| No hand-written fetch | PASS | 21 operations, all through the generated clients; 0 raw `fetch`/XHR/WebSocket/axios in runtime source |
| Tokens in the enclave | PASS | 12 SecureStore call sites, all `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; no AsyncStorage, no `console.*`, no `process.env` in app source |
| Gates fail on violation | PASS | 19 representative violations injected into an isolated copy; all 19 caught |
| iOS 17.4 floor | PASS | app-target `IPHONEOS_DEPLOYMENT_TARGET = 17.4`, shipped `Info.plist MinimumOSVersion 17.4`, compiler `-target arm64-apple-ios17.4-simulator`; `expo-web-browser@15.0.11` uses `ASWebAuthenticationSession(callback: .https(host:path:))` |
| Fail-closed route guard | PASS | observed at runtime: four protected deep links each land on the auth stack, while a control deep link to `/(auth)/login` navigates, so the bounce is the guard and not a dead link |
| Both clients, same journey | **repaired** | mobile discarded `available`; see below |
| Status vocabulary mapped, not redefined | **repaired** | Activity collapsed five tones into three; see below |
| Android native launch | **NOT OBSERVED** | this host has no `adb`, no `emulator`, and no Android SDK |
| EAS preview/production cloud build | **NOT OBSERVED** | `eas` CLI is not installed and no EAS project is linked |
| Authenticated §1 journey | **NOT OBSERVED** | native login answers 503 |

The three NOT OBSERVED rows above are the Round 6 record and stand unedited.
Round 7.5 (2026-08-27) exists to observe exactly those three lines; its
evidence, and the current state of each, is in `ROUND-7.5-OBSERVATIONS.md` —
this table is no longer the live register for them.

## What the audit found, and what was repaired

Each of these failed a line this repository asserts. Six of the seven are
covered by a test that fails against the previous code — **verified by a second
fresh audit on 2026-08-18, which reverted each repair in an isolated copy and
watched the suite go red.** The seventh, #5, is **not** covered; see the
correction under it.

1. **`AutomationCatalogEntry.available` was dropped.** The published probe result
   never reached a view, so mobile offered Add and Activate for automations the
   platform had already found unreachable — while the web client refuses both on
   the same field. That is two clients driving different journeys against one
   Edge. Now carried through `lib/view/catalog.ts` and enforced at all three
   action sites.
2. **Activity redefined the run-status vocabulary.** Five tones were narrowed
   into three by mapping `accent` and `neutral` onto `warn`, and `warn` *is* the
   "Needs review" chip — so running, queued and cancelled runs were listed as
   awaiting a human decision. The chips now select on the published run status.
3. **A session that expired while the app was open dead-ended.** Refresh ran
   only at launch and no 401 was handled anywhere in the transport, so every
   screen read "Sign in is required" until the app was killed. The transport now
   renews once and retries once, single-flight, with the three credential routes
   exempt; a renewal that proves the token dead moves the session to
   `signed-out` so the guard fails closed.
4. **Client-side overrides outlived sign-out.** `use-solutions` and
   `use-workflows` are mounted above the route tree and had no clear site, so one
   account's local state was layered over the next account's catalog in the same
   process. Both are now scoped to person + workspace.
5. **Two idempotency keys were reused across changed intents.** `flows/configure`
   never re-minted after a success (a second create replayed the first), and
   `solutions/setup` reused one key across bodies computed from different
   sources (an inescapable 409). Both re-mint on the boundary that changed.

   **Correction, 2026-08-18 (second fresh audit).** This repair alone has no
   test behind it. Deleting every `Key.current = newIdempotencyKey(...)` re-mint
   from `app/(tabs)/flows/configure.tsx` and `app/(tabs)/solutions/setup.tsx`
   leaves the whole suite green — 32 suites / 397 tests / 78 snapshots. The
   idempotency assertions in `__tests__/platform-mutations.test.ts` only check
   that the transport forwards the key it is handed (`'intent-1'`, `'intent-2'`);
   nothing exercises the screen-level re-mint, which is where the defect lived
   and where the fix went. The fix is real in source and correct on inspection;
   the claim that a test held it was not. Filed as a manifest §12.2 row rather
   than repaired here, because writing the missing test is implementation work
   and this was an audit.
6. **Sign-out cleared the credential on non-terminal failures.** A 500 or 503
   deleted the keychain entry for a session still live upstream. Only 400 and
   401 clear now.
7. **CI and `verify` ran the suite differently.** CI omitted `--runInBand`, so a
   flake could appear in exactly one of the two places. Both now use it, and both
   pass `--ci` so a missing snapshot fails instead of being written.

## Closed after the audit, in the same round

The audit's own "still open" list was worked down rather than carried forward:

- **`lib/fixtures.ts` is gone.** 410 lines of prototype data sat in a runtime
  root with zero runtime importers, and the fixture gate passed because the
  script exempted that one path *by name* — the rule held by exemption rather
  than by the tree. The eight symbols the suites actually use moved to
  `test/design-data.ts`; the other eleven exports had a single consumer,
  `__tests__/fixtures.test.ts`, which asserted the data against itself. The gate
  now fails on prototype fixture data merely **existing** in a runtime root, so
  the count cannot drift back.
- **`unconfigured` is its own state.** `components/screen-state.tsx` gains
  `ScreenUnavailable`, and the eight workspace-scoped screens no longer fold it
  into a load error whose Retry can never succeed.
- **Login and Signup show a pending state** while the provider policy resolves,
  and neither draws an "or" divider above an empty provider column.
- **Approvals has a real empty state**, and its "all caught up — decisions
  synced" line now fires only when this person actually decided something.
- **The `space` scale is deleted** — zero product call sites; its only reference
  was a test pinning its own value.
- **The gate blind spots are closed** and pinned by
  `__tests__/audit-gates.test.js`: a hex hoisted to a const, a template-literal
  hex, a `const DEMO_PASSWORD`, a credential in an object literal, an aliased
  `globalThis.fetch`, a fixture import from a `.js` file, and the fixtures
  module existing at all. Two counter-cases assert the credential gate does
  **not** fire on a keychain key name or a UI label, because a gate that cries
  wolf earns an allowlist and then gets ignored.
- **`eas.json` no longer describes capabilities that do not exist.** Both
  `channel` keys were inert (`expo-updates` is not installed and `app.json` has
  no `updates`/`runtimeVersion`), and `submit.production` was an empty object
  that read as configured-and-ready. Both are gone. Their reasons were
  recorded in the file itself until Round 7.5 (2026-08-27), when eas-cli 22's
  strict schema validation forced the `$comment` out — it refuses the whole
  file over an unknown key. Both absences still hold; the living rationale
  now sits in README's build section, and the move itself is recorded in
  `ROUND-7.5-OBSERVATIONS.md`.

## Still open, recorded rather than fixed

- **Four gate blind spots remain, found by the second fresh audit on
  2026-08-18.** They are *latent, not live*: no tracked `.js`/`.jsx` file exists
  in any runtime root, and `constants/` contains only `theme.ts`, so nothing
  evades a gate today. But the ratchets do not cover what they claim to, and a
  future commit walks straight through them. Proved by injection in an isolated
  copy — 26 of 30 violations caught, these 4 missed:

  | Gate | Blind spot | Why |
  | --- | --- | --- |
  | `audit:tokens` | a hex in `constants/` outside `theme.ts` | `sourceRoots` is `app, components, hooks, lib` — `constants` is absent |
  | `audit:tokens` | a hex in any `.js`/`.jsx` runtime file | its `walk()` accepts only `.ts`/`.tsx` |
  | `audit:credentials` | a `const DEMO_PASSWORD` in `constants/` | same missing root |
  | `audit:credentials` | a `const DEMO_PASSWORD` in a `.js` file | same extension filter |

  The asymmetry is the tell: `audit:fixtures` and `audit:platform` *do* scan
  `constants/` and *do* accept `.js`, and the previous round deliberately closed
  "a fixture import from a `.js` file". The same fix was never carried across to
  the other two scripts. Two counter-cases were also re-proved: the credential
  gate correctly does **not** fire on `ACCESS_TOKEN_KEY = 'autom8x.access-token'`
  or on a `'Show password'` label.

- **`npm ci` is not idempotent in this checkout.** Run against an existing
  `node_modules`, it fails `ENOTEMPTY … rmdir node_modules/@react-native/
  debugger-frontend/dist` (exit 254). `rm -rf node_modules && npm ci` then
  succeeds, exit 0, 1109 packages in 18 s. This is the iCloud tree, not the
  lockfile — but Gate 8's first command does not pass from a dirty tree without
  a manual clean, and that belongs in the record rather than in a rerun nobody
  saw fail.


- **Home's failure state is one state, not three.** The design (`Screen.dc.html`,
  `sHomeErr`) draws a single connectivity-worded failure for Home, so a platform
  refusal and an unresolved workspace both read "Check your connection". The
  client is faithful to the design; splitting it is a design decision, not a
  client one. `DESIGN-CONTRACT.md` states the carve-out instead of claiming
  uniformity.
- **The appearance preference is not persisted**; Settings → Appearance returns
  to Dark on every cold launch. No published contract covers it and the design
  does not say it should survive a launch, so it is recorded rather than decided
  here.
- **`eas.json` could not build until an EAS project was linked — resolved in
  Round 7.5, 2026-08-27, no longer open.** `appVersionSource: "remote"`
  requires a linked project, and through Round 6 there was deliberately no
  `extra.eas.projectId` anywhere; that needed an account, which was Round 7's
  to provision. `eas init` against the owner's account has since created
  `@autom8x.ai/snoopy-mobile`, `app.json` carries the link and owner, and the
  id is real, not a placeholder — the evidence, including a cloud build whose
  EAS record names this repository's commit hash, is in
  `ROUND-7.5-OBSERVATIONS.md`.
- **A stray 4-object pack from May 4 was *evicted*, not corrupt.** The earlier
  record called it unreadable and reported "0 unreachable objects from HEAD";
  that number was **vacuous** — `git rev-list --objects HEAD` was itself failing
  (`error reading from .git/objects/pack/pack-5e2474d2….pack: Operation timed
  out`) and its empty output was counted as a zero. The pack is an iCloud
  dataless stub; `brctl download` materialised it on the first attempt, after
  which the same command returns **862 objects with no error**, and `HEAD`,
  `main` and `round-6-client` are each fully traversable (50 / 15 / 50 commits).
  `git fsck` still times out against the evicted object store, so `git gc`
  remains a bad idea here — but the object store is intact, not damaged.
- **This checkout sits under iCloud Drive, and it is not a cosmetic problem.**
  iCloud creates numbered conflict copies inside the tree while tools write to
  it. Measured on 2026-08-18: **6,159** such copies under
  `snoopy-mobile/node_modules`, 21 of them empty `@types/* 2` directories —
  and TypeScript treats every directory under `@types/` as an implicit type
  library, so `tsc` failed outright on all 21 until they were removed. The
  performance cost is the larger half: with the copies present `tsc --noEmit`
  used **4.5 s of CPU spread over 9 min 47 s of wall clock at 1% CPU**; with
  them removed, **3.0 s wall at 162% CPU**. One test suite reported 578 s that
  runs in 4.1 s clean. `expo export` could not finish at all while writing into
  the synced `dist/`, where iCloud had produced `_expo 3`, `assets 2` and
  `metadata 2.json`; redirecting the same command to a non-synced output
  directory completed both platforms with exit 0. **Re-measured 2026-08-18 by the
  second fresh audit: with the conflict copies cleared, the gate commands run
  unmodified into the synced `dist/` and both exit 0** — iOS 13 s, Android 11 s,
  ~11.1 MB `.hbc` each; `tsc` is 3 s and the full suite 21 s. So the failure is a
  function of accumulated conflict copies, not a standing property of the path:
  the honest statement is that it recurs, not that it always holds.

  The four tracked files this record listed as unreadable in the working tree —
  two Android icon PNGs, `Autom8x iOS App.dc.html` and a `_ds/*/styles.css` —
  **are all readable again as of 2026-08-18**, materialised by iCloud without any
  `git checkout --`. The governance documents went the other way and had to be
  forced: `AUTOM8X-MASTER-PLAN.md` and `AUTOM8X-ROUND-PLAYBOOK.md` were both
  unreadable at the start of the second audit and took **24 `brctl download`
  attempts** to materialise. Eviction here is bidirectional and unpredictable,
  which is the operational point.

  **No tracked file in any of the four repositories is affected** — verified by
  `git ls-files` across all four. The damage is confined to ignored build and
  dependency trees, plus two untracked strays in the sibling web repo
  (`snoopy/compose 2.yml`, `snoopy/test/session-contract.test 2.mjs`), which a
  `snoopy` session should clear.

  This is the same iCloud conflict-copy failure the master plan's §2.1 item 15
  screens the repositories for. It will recur here, and Round 7's container
  builds will meet it on a volume that is already 95% full.

## Live environment, re-probed

Re-run 2026-08-18, not inherited:

- `GET /health/ready` → **503** `not-ready`; identity, connections and object
  storage all `adapter_not_configured`.
- `GET /v1/session` → **401** `UNAUTHENTICATED`.
- A schema-valid `GET /v1/auth/native/google/start` (43-character S256
  challenge) → **503**, `details.component: native_app_redirect_uris`.
- `GET /v1/auth/providers` → **200**. This is the one live read the app
  exercises, and the login screen renders its refusal honestly when it fails.

A real authenticated §1 journey is therefore not observable here. Round 7 owns
deployed identity, a claimed HTTPS domain, build credentials and secret
injection. A Release build additionally refuses cleartext by design, so it
cannot reach a local `http://localhost:8080` Edge at all; observing one would
need a TLS front end, which this audit was not permitted to start.

## Native build and boot, observed

- A direct Release build from this checkout **fails**, exit 65, at the Expo
  Constants CocoaPods phase: `bash: /Users/siddaksingh/Desktop/Business: No such
  file or directory`. The upstream script splits the path at the space in
  `Business Infra`. No source or generated native file was patched around it.
- An exact copy at a path without spaces — proved byte-identical first, 150
  tracked files with an identical SHA-256 manifest — **BUILD SUCCEEDED**, exit 0,
  0 errors and 0 app-target warnings (~2,700 warnings, all in `ios/Pods`).
- Installed as `ai.autom8x.snoopy` and cold-launched on simulator
  `2F8CA2CB-2A74-4B4E-A1B8-583D63560E1C` (iPhone 16 Pro / iOS 18.6), **PID
  49039**, process alive, real onboarding screen rendered.

This is local native-build and boot evidence. It is not a cloud build and not an
authenticated journey.

## Deliberate non-Round-6 gaps

Unchanged, and not unfinished 8.5–8.7 work: Builder authoring, saving,
reordering, branch editing and client-triggered test runs; a run retry
preserving continuation identity; notification push permission, delivery and
cross-device read state; billing, payment methods, invoices and a plan base
price; profile editing, workspace switching and member management; full
satisfied-provider detail, per-step manifest icons, and branch/delay/human-review
kickers; reduced-motion alternatives and exhaustive small-phone/tablet approval.
Workspace switching was on this list until Round 7.5M (2026-09-03) added it over
the published active-workspace operation; profile editing and member management
remain out.

## Dependency boundary

`npm audit fix` was applied only within compatible ranges and `postcss` is
overridden to a patched release. The 12 high advisories all reduce to two roots
— `image-size` (two DoS parsers, reached through `metro`) and `uuid` (reached
through `xcode`) — both build-time tooling that npm classifies as production
because `expo` and `react-native` are runtime dependencies. npm's fix is an Expo
SDK major. That is an SDK migration, not permission to force a major upgrade
inside Round 6. The CI gate fails on critical advisories; there are none.

## What must still happen before Round 6 closes

1. ~~Push `round-6-client` and let CI run.~~ ✅ **Done 2026-08-18 by the second
   fresh audit.** `origin/round-6-client` exists and tracks. Pushing alone did
   **not** run CI: `.github/workflows/ci.yml` triggers on `pull_request` and
   `push: [main]` only, and there is no `workflow_dispatch`, so a PR was the one
   mechanism that could satisfy this line — PR #5. **CI is green on run
   `32187060170`, all five jobs**: Lint 39 s, Typecheck 39 s, Architecture gates
   40 s, Test 1 m 33 s, Native bundle export 2 m 4 s. The Test job reproduces the
   local counts exactly — 32 suites / 397 tests / 78 snapshots — on an Ubuntu
   runner with no iCloud, which is what makes those counts a property of the code
   rather than of this laptop. All four architecture gates report their zero.
2. Close the round in the governing master plan. That file lives in the sibling
   `snoopy-backend` repository, which a mobile session may read and must never
   edit; it belongs to a separately authorized backend/governance session.

## Round 16 — findings and observations (ADR-0032)

Recorded by the session building BUILD-PLAN Phase 24 on 2026-09-29. None of
this closes a line of Gate 24; a fresh session re-runs every one.

### Findings, 24.4

- **Backend: the catalog's `subscribed` counts an archived subscription.**
  `apps/catalog/src/postgres-automations.ts` answers `subscribed` from any
  `catalog.subscriptions` row for the template, with no `status <> 'archived'`,
  while the same service leaves archived rows out of the subscription list, the
  plan counts and the one-per-template check (`postgres-subscriptions.ts`). The
  contract says `subscribed` "drives Add versus Added", so after an Archive it
  would still say Added. The app no longer uses the flag for that: Solutions'
  Added and Settings' totals answer from the subscription list, and drop any
  archived row it holds, as the website does — the list's contract does not
  promise to omit them (`withoutArchived`). Home keeps the flag on purpose: it
  asks whether the workspace has set anything up at all, and the list shows only
  what the person can see. For a `snoopy-backend` session to file in manifest
  §12.1.
- **Backend contract: Set up cannot show the pinned version's settings.** A
  `config` change is validated against the version the subscription PINNED,
  but the only published `setup` is the catalog's, which is the newest
  version's. Both clients therefore draw the newest version's fields; when the
  two versions' settings differ, a save can be refused as undeclared, and a move
  refused `invalid_config` can have no way out ("Open Set up, fix them, then
  move" edits the old version's fields). The website has the same gap. For a
  `snoopy-backend` session: publish the pinned version's `setup` on
  `Subscription`, as `runInput` already is.
- **Carried to 24.5.2: Add to a project, and each workflow's scope.** The
  website adds an automation to the whole workspace or to one project, and
  labels each subscription with its scope. Both need the workspace's projects,
  which 24.5.2 reads. Until then the app adds workspace-wide, as it always has,
  and lists every subscription the platform shows it.
- **24.3.6's binding, completed in 24.4.** Five actions that predate the rule —
  the approval decision, Solutions' pause, setup's activate, configure's create
  and Flow detail's status — read the active workspace at the moment of the
  press. Each now acts on its screen's `loadedFor` through `workspaceIfShown`.
- **Known limit, for the refinement pass: a large file for a run.** The upload
  reads the whole file into JavaScript, and React Native's `fetch` copies and
  base64-encodes it on the JS thread. The code review measured about 2.5 s of
  frozen UI and about 215 MB at peak for a 25 MiB file on an M1 Pro; a phone is
  slower. The streaming path is expo-file-system's native upload, placed inside
  `lib/platform/client.ts` beside the one `fetch` the transport audit admits.
  Not done in 24.4: it reworks 24.3.4's upload and its audit, and the owner's
  direction is a working baseline first, tuning after.
- **Known limit, for the refinement pass: a return re-reads everything.**
  24.4.4 re-reads a screen each time it regains focus, with no staleness window
  and no abort, and each read counts against the Edge's per-person limit. A 429
  keeps the rows and says the wait (24.3.3).

### What `/code-review` found in 24.4, and what became of it

Fifteen findings and a further list cut by its cap. Fixed, each with a test:

- `reload()` after a change now starts from `loading`. Only a RETURN to a
  screen keeps its rows. Kept rows had let Set up re-seed from the settings it
  had just replaced, so the next save undid the one before, and a failed reload
  hid behind them.
- Flow detail shows the platform's status. The list shows what detail
  recorded only until the list reads again (`record`/`settle`). Run is offered
  on the status as read, never on what this device changed last.
- A status change is keyed by its target, and a move by its version, so a
  Resume after a lost Pause answer is a new intent and not a 409.
- Archive forgets this device's plan statement for its template, and returns to
  the Flows list with `dismissTo`: a cross-tab replace from Setup leaves nothing
  to go back to.
- Setup renews its create key once the create succeeds, as configure does.
- Connections: Connect/Disconnect and Replace are one dialog in two modes,
  because iOS will not present a second modal while the first is dismissing.
  Closing after a stale 409 re-reads the rows.
- The dialog rises above the iOS keyboard, and its actions wrap on a narrow
  phone.
- The upload `PUT` carries the type it was opened for; Android refuses a body
  with none, and the store signs only its length and host.
- A money field reads "12,50" from a comma-decimal keyboard as 12.5.
- Approvals counts only decisions on approvals still listed.
- Notifications marks read the rows "Mark all read" covered, not rows a later
  re-read brings in.
- The webhook dialog is held open only while a secret is being made.
- Login's unlock button uses the device's biometric wording.

Not changed:

- Home's first-run test is left as it was (see the first finding).
- A non-platform error's own words may reach a refusal line, as
  `refusalMessage` was built to allow in 24.3.6.

### Guards proved to bite, 24.4

Each guard was broken by hand in the working tree, its test run and seen to
fail, and the file restored and checked byte-identical by SHA-256:

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| Webhook address for owner or admin only | dropping `canAdminister` | `automation-actions` "to no one else" |
| The webhook secret stored nowhere | a `SecureStore.setItemAsync` of it | `automation-actions` "stores it nowhere" |
| The upload's exact size | sending bytes of another length | `run-file` "sends nothing when…" |
| The platform asked before the file is read | reading first | `run-file` "asks before reading" |
| The upload's type | no `Content-Type` | `platform-request` "no credential" |
| Workspace binding (Archive and Move) | the active workspace used directly | `automation-actions` "once another workspace is active" |
| Archived is absent | `withoutArchived` returning every row | `flows-view`, Solutions, Setup |
| Run key renewed on a changed value | no renewal | `automation-actions` "a change is a new run" |
| Run key kept for a resubmission | a new key each press | the same test |
| Status key per target | one key for both | `tab-screens` "own key" |
| Go live held back with an unmet connection | both its guards removed | `tab-screens` "holds Publish back" |
| Move offered only for a newer version | `<` made `<=` | `automation-actions` "newer version" |
| Run offered only with declared input | the `runInput` check dropped | `automation-actions` "declares input" |
| Cancel only for a pending or running run | always cancellable | `tab-screens` "offers no Cancel" |
| Pause never sent to an archived subscription | the filter dropped | `tab-screens` "never an archived one" |
| Archive forgets the plan statement | no `forget` | `automation-actions` "answer Added again" |
| Archive returns to the list | `router.back()` | `tab-screens` "however detail was reached" |
| A reload starts from `loading` | rows kept | `use-resource` "starts a reload" |
| The list settles what detail recorded | no `settle` | `return-reread` "Flows list reads again" |
| Approvals counts what is still listed | every decision counted | `return-reread` "still pending" |
| A stale Replace re-reads when closed | no re-read | `settings-connections` "re-reads when closed" |
| A comma decimal | no normalising | `setup-field` "comma-decimal" |

### Findings, 24.5

- **The website's join page is reached only by a link that names the
  organization** (`/onboarding/join-org?w=`), and neither the website nor the
  backend makes that link. The app's Organization screen lists what
  `organization-discovery` returns instead — the same operation, which takes no
  parameter and answers only for the person's verified email domain.
- **Website: a retry after a failed domain claim creates a second
  organization.** `createOrgWorkspaceAction` creates the workspace and then
  claims the email domain; each create mints a new key
  (`snoopy/lib/tenancy.ts`), so pressing Create again after the claim failed
  makes another organization. The app keeps the one it made and retries the
  claim alone. For a `snoopy` session to file.
- **Not carried over, on purpose.** Onboarding's "create a personal account
  instead": every signed-in person already has a personal workspace (backend
  `ensurePersonalWorkspace`), and the app has no onboarding step. Delete on the
  projects list: it is on the project's own screen, with the same operation and
  the same confirmation.
- **A project action acts on the project's own workspace**, which the screen
  read it from and which can be other than the active one — as the website's
  `findAccessibleProject` resolves it.
- **An automation added to a project alone can still be added to the whole
  workspace**, projects or not — the website's Add offers every scope not taken.
  The app's "Add to…" follows that.

### Guards proved to bite, 24.5

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| Organization managed by its owners and admins | the role check dropped | `organization-screen` "reads nothing it would be refused" |
| Never an owner, never oneself, removed | every row removable | `organization-screen` "never an owner" |
| Set up only on a company domain | the mailbox-provider check dropped | `organization-screen` "company domain" |
| One organization, however often Create is pressed | the made one forgotten | `organization-screen` "creates the organization once" |
| Member removal bound to the loaded workspace | the active workspace used directly | `organization-screen` "once another workspace is active" |
| The DNS value seen before the re-read | re-read at once | `organization-screen` "DNS verification value" |
| A project deleted in its own workspace | the active workspace used | `projects-screens` "own workspace" |
| Leave only after typing DELETE | no word asked | `projects-screens` "typing DELETE" |
| A team project only in the loaded organization | the binding dropped | `projects-screens` "no longer the active workspace" |
| An owner's row not changed | both its guards removed | `projects-screens` "owner's row is not changed" |
| Teams created by owners and admins | anyone offered Create | `teams-screens` "offered no Create" |
| Team members read by its managers, owners and admins | anyone reading | `teams-screens` "read only by its managers" |
| A team name of two characters at least | one allowed | `teams-screens` "two-letter name" |
| The Teams row only in an organization | shown in any workspace | `teams-screens` "Teams only in an organization" |
| Add to… wherever a scope remains | hidden without projects | `tab-screens` "Add to…" |
| The chosen project sent with the create | dropped | `tab-screens` "project chosen" |
| No scope drawn without projects | always drawn | `tab-screens` "no scope where" |

### Findings, 24.6

- **The website's linking is cookie-bound and web-only** (`LinkedAccountsSection`
  navigates to `/v1/auth/identities/{provider}/start`). The app links through
  24.2.1's ticket flow, which exists for exactly this reason (ADR-0017 §6).
- **A bearer caller can meet one deletion answer the website never does**:
  502 `SESSION_REVOCATION_FAILED`, the account gone but the refresh token it
  sent still live. The app revokes it through sign-out before letting go, and
  keeps the session if that fails, as the contract asks. A `DEPENDENCY_FAILURE`
  502, or no answer, reads `GET /v1/session` before saying either way.
- **Android and Apple's "call to action".** "Price shown at checkout" invites a
  purchase, so Android draws it only where the price itself is known; iOS says
  it. Android has no Choose plan, Manage billing or portal note (ADR-0032).
- **The website's Support page is a placeholder** that links to the marketing
  contact page. The app draws that form on the same public operation, with the
  website's two required fields; the platform requires only the email.
- **Privacy and Terms are not published by the platform**; the app opens the
  website's pages, at the origin the browser leg shares. A build without that
  base says so instead of linking nowhere.
- **The bounded export is shared, not saved**: a phone has no download folder
  the app can write to without another permission, so the JSON goes to the
  system share sheet — as a file on iOS, as text on Android, which is what its
  share intent carries. The complete export's file opens in the browser from the
  signed link.
- **24.7.1 waited on 24.8.6, and landed the same day** — see "Release
  configuration, 24.7" below.

### Release configuration, 24.7

Written 2026-09-30, once the owner had completed 24.8.1, 24.8.2 and 24.8.6.

- **`submit.production`** carries the App Store Connect record's Apple ID
  (`6817885416`) and the Team ID (`6WBHARQXCQ`). Both are public identifiers —
  the Team ID is served to the world in the AASA file. No `appleId` (the
  account's email) is written: EAS Submit authenticates with the App Store
  Connect API key the owner created through `eas credentials --platform ios`
  (role APP_MANAGER, the least that can upload), which EAS holds and this
  repository never sees.
- **The Sign in with Apple entitlement is declared directly (`ios.entitlements`),
  for the capability sync, not for a native sign-in.** The app signs in through
  the browser leg (ADR-0017) and calls no `AuthenticationServices` sign-in API.
  But EAS synchronises the App ID's capabilities on the Apple Developer portal
  from the app's entitlements on every build, and the owner's first
  `eas credentials` run — before any entitlement existed — tried to switch Sign
  in with Apple and Associated Domains OFF on the App ID (`Failed to patch
  capabilities: APPLE_ID_AUTH OFF, ASSOCIATED_DOMAINS OFF`; Apple refused
  because the App Store record already existed). Switching it off would break
  the web sign-in too: the Services ID Supabase uses is grouped under this App
  ID as its primary. **The first attempt, `ios.usesAppleSignIn: true` (#23),
  added NOTHING**: without `expo-apple-authentication` installed that key only
  logs a prebuild warning (`@expo/prebuild-config`'s legacy plugin), and the
  shipped TestFlight binary carries no `com.apple.developer.applesignin` — read
  from the ipa with `codesign -d --entitlements :-` on 2026-10-01. Declared as
  the entitlement itself since #24; `npx expo config --type introspect` under
  the production values resolves it beside the two associated domains. The
  alternative, `EXPO_NO_CAPABILITY_SYNC=1` in the EAS environment, is dashboard
  state nothing versions.
- **`ITSAppUsesNonExemptEncryption: false`.** The app uses only the encryption
  the OS provides — TLS, the Keychain and SHA-256 for PKCE — which is the exempt
  case. Declaring it stops App Store Connect asking the export-compliance
  question on every upload. The declaration is the owner's; recorded here so a
  later session that adds its own cryptography knows to revisit it.
- **`name: "Autom8x"`** is the name on the phone, matching the App Store Connect
  record. The `slug` stays `snoopy-mobile`: it names the EAS project.
- Not done here: 24.2.2 (the Team ID into the AASA file) is `snoopy-backend`'s,
  and its deployment waits on production (§12.1 #156).
- **The release gate, committed (CI plan Wave 1, branch `ci-wave-1`,
  2026-10-03).** `scripts/release-ios.sh` (`npm run release:ios`; `--dry-run`
  runs every refusal and stops before `eas build`) is build 13's script with
  the scratchpad and nvm paths removed. It refuses unless HEAD is
  `origin/main`, the tree is clean, the `all-green` check run from GitHub
  Actions (app 15368, selected by check name — a Dependabot check run on the
  same commit is not CI) on HEAD concluded success, and the live
  `https://app.autom8x.ai/.well-known/apple-app-site-association` lists
  `6WBHARQXCQ.ai.autom8x.snoopy` in both `applinks` and `webcredentials`.
  After `eas build` the build's `gitCommitHash` must be HEAD and the ipa's
  entitlements the release's (aps-environment production, applesignin, both
  associated domains) before `eas submit`. `eas.json` `cli.requireCommit:
  true` makes eas-cli itself refuse an uncommitted tree. In CI `all-green`
  needs every job — the native export included, which was never a required
  check — and is red on any failure, cancellation or skip; the runners are
  pinned to `ubuntu-24.04` (`ubuntu-latest` moves to Ubuntu 26 on
  2026-10-19) and `actions/checkout`, `actions/setup-node` are on v7. The
  generated platform types carry `// From snoopy-backend <path>, sha256
  <hash>.` as `snoopy` writes it, and `verify:platform-contracts` compares
  those hashes with the source documents; generator and verifier read
  `SNOOPY_BACKEND_ROOT` (default `../snoopy-backend`). A skipped contract
  check is recorded beside the facts (`.autom8x/repo-facts/platform-contracts.json`),
  `repo-facts` then emits NO facts and says why (exit code unchanged), and the
  facts-schema test skips visibly instead of passing. Rehearsed on the branch:
  `--dry-run` answered `REFUSED: the tree is not clean` with edits pending and
  `REFUSED: HEAD … is not origin/main` once committed; the deliberate failure
  (a lint error) turned Lint and `all-green` red, and its revert green — run
  ids in the PR.

### The sign-in sheet that would not open (24.7.3, attempt 1, 2026-10-01)

**Observed by the owner on the first TestFlight build** (1.0.0 (1), from
`d15c79c`, iPhone on iOS 26): tapping Continue with Google made the buttons
flash and nothing else — no browser sheet, no message. Production's proxy logs
for those minutes hold the app's six `GET /v1/auth/providers` (200, three
providers) and **no** `/v1/auth/native/*/start` from the phone; no session,
identity or auth audit row was created. The failure is on the device, before
any request leaves it.

**Cause, read rather than guessed.** The app opens the start leg with
`expo-web-browser`'s `openAuthSessionAsync(url,
'https://app.autom8x.ai/auth/native/callback')`. On iOS 17.4+ the module builds
`ASWebAuthenticationSession(url:callback: .https(host:path:))`
(`node_modules/expo-web-browser/ios/WebAuthSession.swift`). Apple's header for
that callback (iOS 26.1 SDK, `ASWebAuthenticationSessionCallback.h`): *"The
host must be associated with the app using associated web credentials
domains."* The shipped binary's entitlements, read from the ipa with
`codesign -d --entitlements :-`, carry
`com.apple.developer.associated-domains = ['applinks:app.autom8x.ai']` and
nothing else — `applinks` is the universal-link service that lets the callback
re-enter the app; `webcredentials` is the service the sheet needs in order to be
created at all. iOS therefore ended every session at once with an error. The
module reports every error as `{ type: 'cancel', error: <description> }` —
`error` is absent from its TypeScript types — and `openSystemAuthSession`
treated any non-success as a person's cancel, which the login screen renders as
nothing, by design, for a real cancel. Two defects, one symptom.

**Fixed in #24.** `app.config.js` derives `webcredentials:<host>` beside
`applinks:<host>`; `openSystemAuthSession` reads the undeclared `error` and
reports a refusal as a failure in the system's words, keeping
`ASWebAuthenticationSessionErrorCodeCanceledLogin` (code 1) as a cancel. The
association file on the servers gains a `webcredentials` section
(`snoopy-backend` §12.1 #192). What a device checks is Apple's CDN copy of that
file, fetched on install and on update, so the fix is observed only on a build
installed after the CDN has re-fetched it.

**Why it was never seen.** Round 7.5's start-leg observations were on Android
(Custom Tabs), and the iOS precedent was a simulator build; no iPhone had opened
the sheet with the HTTPS callback before this build. The 17.4 floor and
`.https(host:path:)` were verified in the module's source, never against a
device with the production association.

### The first signed-in session (24.7.3, attempt 2, 2026-10-01 21:53Z–21:59Z)

Build 2 signed in with Google on the owner's iPhone at 21:53:55Z (session row,
`last_sign_in_at`), then read Home, Flows, Solutions, Activity, Settings,
Billing and the connections card — 186 requests, every one `200`/`201`; the
five `PATCH …/subscriptions/{id}` were the owner pausing and resuming both
automations, and the `POST …/billing/portal` was Manage billing. The owner sent
ten TestFlight feedback items, read through App Store Connect's API (the
`betaFeedbackScreenshotSubmissions` resource) with their screenshots. Triage:

| # | Feedback | What it is | Disposition |
| --- | --- | --- | --- |
| 10, 9, 8 | no providers / nothing happened / failed login | production down (#156); the `webcredentials` defect above; build 2 before the servers' file | fixed earlier, observed fixed at 21:53Z |
| 7 | "dummy data or live?" | live production records: the runs are September's gate proofs | expected; said so |
| 6 | pause/resume "goes blank" | `flows/detail` re-read with `reload()`, which starts from `loading` and draws the tiled skeleton over the page | **fixed**: `refresh()` keeps the page |
| 5 | "pause or remove, and billing stops?" | billing is per plan, not per automation; pausing changes nothing; archiving frees a plan slot; cancelling is Manage billing | expected; a copy addition is the owner's call (both platforms) |
| 4 | Manage billing → Stripe's portal, "sandbox" | ADR-0032's hosted portal, in test mode until Stripe goes live | expected; the badge leaves with 24.8.5 |
| 3 | Activity empty "but we had runs" | the screen kept TODAY and YESTERDAY only and showed the first-run empty for 13 older runs, while Home listed them | **fixed**: EARLIER section; first-run empty only with no runs |
| 2 | three dialog buttons wrapped | `Dialog` actions in a wrapping row | **fixed**: `actionsLayout="stack"` for three |
| 1 | "What is this?" (workspace switcher) | two workspaces: Personal, and "Gate 18 L6 Proof", an organization Round 11's proof created on 2026-09-21 | expected; deleting the proof organization is the owner's call |

What the simulator proved the same evening, without credentials: tapping each
of Google, Microsoft and Apple opens iOS's consent, then the provider's own
sign-in page through the web origin (`…/native/{provider}/start` 302 on the
hosts), so 24.8.2 and 24.8.3 are configured end to end; the credential entry
is the owner's.

### Guards proved to bite, 24.7.3 attempt 1

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| `webcredentials` derived beside `applinks` | `applinks` alone again | `app-config` "derives both native link claims from the exact release redirect" |
| A refused session is a failure, not a cancel | the `error` field ignored | `native-auth` "reports a session iOS refused to start as a failure" |
| A person's cancel stays a cancel | every `error` read as a refusal | `native-auth` "keeps a person's own cancel as a cancel" |

### Guards proved to bite, 24.7.3 attempt 2

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| Older runs under EARLIER | the EARLIER section left out | `tab-screens` "lists runs older than two days under EARLIER" |
| Thirteen old runs are not "no activity yet" | `hasNoRuns` ignoring `earlier` | `tab-screens` "lists runs older than two days under EARLIER" |
| The first-run empty for a workspace with no runs | `hasNoRuns` never true | `tab-screens` "shows the first-run empty only to a workspace with no runs" |
| A status change re-reads keeping the page | `reload()` again | `tab-screens` "keeps the page while re-reading after Pause" |
| `refresh()` keeps the rows | `refresh()` starting from `loading` like `reload()` | `use-resource` "re-reads on refresh() after a change, keeping the rows" |
| Three actions stack | `actionsLayout` ignored | `settings-connections` "stacks the three actions" |

### The second signed-in session (24.7.3, attempt 3, 2026-10-02 02:38Z–03:00Z)

Build 3 on the owner's iPhone: the three fixes of attempt 2 confirmed, the Google
connection re-consented on the device (02:38Z), Face ID unlock exercised, and
twelve TestFlight feedback items sent (02:50Z–03:00Z), read through App Store
Connect's API with their screenshots. The owner also asked three things in chat.
Verified against the code at `238a926`, the database, both hosts' proxy logs and
the website at `2b729e3` (FR-25 parity):

| # | Feedback | What it is | Disposition |
| --- | --- | --- | --- |
| chat | "If an invoice is held, why not under Needs review on Home?" | Home counts pending approvals (none); every held run's approval was decided in September. A run stays `held` after its approval because the approval starts a new run (FR-15); Activity's "Needs review" keyed on that status | **fixed**: every approval is read beside the runs; a held row says how it was decided; "Needs review" means a pending decision; a continuation reads "After approval ·", as the website labels it |
| chat | Pause "switches back, then to the right state" | the detail showed the status as last read; the re-read is five requests | **fixed**: the recorded answer shows at once and settles when this screen's re-read lands |
| chat | "Remove Edit in Builder and the page" | Builder, Templates and Configure were Round 6's read-only design path; the website has no builder | **removed**, with "New" and the Home button leading to Solutions |
| 1, 2 | the setup screen; "look up how text fields are entered on iOS" | the notify-email field is a `text` control; the vocabulary knows no address | **fixed** on the device: a field named for email gets the email keyboard; the vocabulary gains `email` (backend) |
| 3 | after Activate, Back shows Setup again | a cross-tab `replace` left Setup in Solutions' history | **fixed**: Solutions is left at its root first |
| 4 | deleting the 5 re-enters 500 | `??` read a cleared field as untouched and put the default back | **fixed**: cleared stays cleared; Activate asks for a number |
| 5, 7 | "I see held runs but can't approve them" | nothing was pending; see the first row | **fixed** by the first row; the test path is a run above the threshold on the v4 subscription |
| 6 | "why does it say invoice rejected" | the string is not in this app; the one rejected approval is from 2026-09-12 | **open — ask which screen**; the pipeline-components idea is recorded for Round 17 |
| 8, 9 | Passkeys, Stay signed in | two static rows the website never had; the session is always kept in the enclave (ADR-0017) | **removed** |
| 10, 12 | Face ID offered before any sign-in | the login screen always drew the unlock | **fixed**: offered only when this device holds a session |
| 11 | Face ID unlock works | — | — |

### Guards proved to bite, 24.7.3 attempt 3

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| A decided held run leaves Needs review | `needsReview` ignoring the decision | `tab-screens` "leaves a decided held run out of Needs review" |
| A held row says how it was decided | the approvals branch of `metaFor` removed | `flows-view` "lets a held row carry its decision" |
| The recorded status shows at once | the status as last read again | `tab-screens` "keeps the page while re-reading after Pause" |
| A cleared amount stays cleared | `??` fallback restored | `tab-screens` "keeps a cleared amount cleared" |
| Setup leaves Solutions' history | `dismissTo` removed | `tab-screens` "adds an archived automation afresh" |
| Face ID offered only with a session | the unlock drawn unconditionally | `auth-screens` "offers no Face ID unlock when this device holds no session" |
| An address field gets the email keyboard | `isEmailField` always false | `setup-field` "reads an `email` control" |
| The banner counts pending approvals | every approval counted | `tab-screens` "counts pending approvals only" |

### The third signed-in session (24.7.3, attempt 4, 2026-10-02 05:09Z–05:23Z)

Build 4 on the owner's iPhone: the Google connection re-consented (05:09Z), Invoice
check paused from the Solutions dialog (05:19Z), five TestFlight feedback items, and the
owner's own account in chat of a Face ID prompt at relaunch. Verified against the code at
`212d7fb`, the database and the website at `2b729e3`:

| # | Feedback | What it is | Disposition |
| --- | --- | --- | --- |
| chat | after a fresh OAuth sign-in, a relaunch asked to allow Face ID and opened without OAuth | the Face ID choice lived in the Keychain, which outlives a sign-out and a reinstall; `clearSession` never deleted it; the first biometric check — and so iOS's permission alert — ran at launch (platform §12.1 #198) | **fixed**: the choice and Remember me are cleared with the tokens; the question is asked once, after a remembered sign-in, on a screen where "Use Face ID" is what triggers the system alert; Settings keeps the toggle |
| chat, 1 | two names for one action; "why an or and a bar on top" | Welcome, Log in, Sign up and an Onboarding tour for the one action the website offers on one page; the divider was left behind when the unlock button was hidden | **fixed**: one "Sign in" screen with the website's words and a Remember me toggle (on by default; off ends the session at the next cold start); no divider without an unlock |
| 2 | the Solutions plan card opened the Settings tab | the design's banner | **fixed**: it opens Billing |
| 3 | "pause, unadd, stop, or remove?" | "Added ✓" opened a pause dialog; the platform's words are Pause and Archive, and both live on the workflow page as on the website | **fixed**: "Added ✓" opens the workflow; the dialog is gone |
| 4 | the amount should format as currency, start at 0.00, number pad only; fields too small, the email cut off; "Optional" somewhere | a plain decimal box beside the words | **fixed**: digits fill from the right as currency with thousands separators, number pad; every field full width under its words; Optional named |
| 5 | "where is 1 and 2" — every step 1…N, connections included | the design's four fixed section numbers, empty ones skipped; the catalog entry did not say which accounts an automation needs (platform §12.1 #197) | **fixed**: sections numbered as they appear, and a Connections step from the entry's new `requiredConnections` with Connected / Connect per account. Every pipeline step as a numbered item with its own input or account is Round 17's (Phase 25.3), recorded there |

**Addendum, before build 6**: production still runs the image pinned before #134, so its
catalog entry carries no `requiredConnections`, and the first build 5 Setup screen would have
failed on the missing list. The screen now reads the field as absent-means-none — no step
drawn, `unmetConnections` still refusing an activation without its account — until the
SEVENTEENTH promotion serves it (mobile #29).

### Guards proved to bite, 24.7.3 attempt 4

Nine breaks, each run against its own suite and the file restored by SHA-256. The
first break of the cold-start check left every `session-provider` test green — the rule
had no test — so its test was written and the break run again before anything was
committed.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| Sign-out clears the Face ID choice | `FACE_ID_ENABLED_KEY` left out of `clearSession` | `session-store` "sign-out clears the Face ID choice and "remember me" with the tokens" (and the five-deletion count) |
| Remember me off ends the session at cold start | the cold-start check removed | `session-provider` "ends a session the person chose not to remember at the next cold start" |
| The Face ID question after a remembered sign-in | sign-in always going home | `auth-screens` "asks the Face ID question once, after a remembered sign-in" |
| "Use Face ID" records the choice | `writeFaceIdEnabled(true)` removed | `faceid-offer` ""Use Face ID" runs the check now, records the choice, and opens the app" |
| Added opens the workflow | the push aimed at the Flows list | `tab-screens` "Added opens the workflow" and "opens the correct workflow from a filtered list" |
| The plan card opens Billing | the push aimed at Settings | `tab-screens` "opens Billing from the plan banner" |
| A Connections step shifts the numbering | `sectionOffset` fixed at 0 | `tab-screens` "numbers the accounts an automation needs as step 1" |
| Currency with thousands separators | the separator insertion removed | `setup-field` "formats cents with thousands separators" and "fills cents first as digits arrive" |
| The Optional marker | "Optional" reworded | `setup-field` "marks a field that is not required as Optional" |
| An entry without `requiredConnections` draws no step | the absent-means-none read removed | `tab-screens` "draws no Connections step when the platform predates `requiredConnections`" |

### The fourth signed-in session (24.9, build 6, 2026-10-02 15:48Z–16:07Z)

Build 6 on the owner's iPhone: a fresh sign-in at 14:39Z and the remembered cold start at
15:47Z worked by the logs; five feedback items followed, and the owner's decisions the same
day ("Flows will be the name we use from now on"). Verified against the code at `5cddcab`,
the production logs and the website at `2b729e3`:

| # | Feedback | What it is | Disposition |
| --- | --- | --- | --- |
| 1 | "Cannot link an account" | Supabase's "Allow manual linking" switch is off: three link starts answered 502 and Supabase's auth log says `404 manual_linking_disabled` for each (backend §12.1 #200); the app showed the problem's title, "Dependency Failure" | **the platform says so as a 503** (backend #136); **fixed here**: link failures are sentences by code, never a title (24.9.6). The switch is the owner's (24.10.5) |
| 2 | projects should be chosen from Home, not Settings | the switcher and Projects lived under Settings → Workspace; Home read workspace-wide | **fixed**: the scope control on Home, Flows and Activity — the workspace, then All projects or one — kept per workspace on the device (24.9.2); Settings keeps project admin |
| 3 | "How does data export work… what are we downloading, why in settings" | the website's Data export, in its words | **fixed**: "Export my data" says what the file holds; a project's activity log and a per-flow export are platform work (backend Phase 26) |
| 4 | Workflows vs Solutions: consolidate; "Flows" | tab "Flows", title "Workflows", "Templates" and "New" both opening the Solutions tab; the plan card twice in Settings | **fixed**: four tabs and one vocabulary; the catalog is "New" inside Flows, Added ✓ or Add per scope (24.9.3); the plan rows and the Solutions tab went |
| 5 | "How do I unadd or remove it… specific to a project" | "Added ✓" opened the flow, where the platform's word was Archive | **fixed**: "Remove flow" last on the flow page, in red — it archives, keeps the runs in Activity and says so (24.9.4); Pause keeps it listed; once added, the catalog shows no button |
| — | the first real burst (backend §12.1 #199) | each screen 3–5 reads, re-run on every tab return, shared by nothing: 65 and 77 requests in a minute from one phone | **fixed**: the shared workspace snapshot (24.9.1) — one in-flight read per resource, 15 s / 120 s windows on a return, an action invalidating what it changed; a five-tab pass is 18 requests once, then about 4 |

### Guards proved to bite, 24.9

Eight breaks, each run against its own suite and the file restored by SHA-256. The
four-tab bar is held by the layout and the tab bar's visual snapshot, not by a guard
a break can reach, and is not claimed here.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| One request per resource, and a window on a return | the snapshot answering nothing | `snapshot` "answers two readers of one resource with one request", "serves a return within the window", "drops only what an action names" |
| A subscription change drops what it changed | `updateSubscription` invalidating nothing | `snapshot-invalidation` "a subscription change drops the subscriptions and the catalog, not the runs" |
| `reload()` drops the workspace snapshot | the invalidation removed from `useWorkspaceResource` | `settings-connections` "closes the dialog and re-reads the workspace connections" (and the 409 case) |
| A project scope selects a flow by its own project | `inScope` always true | `scope` — all three |
| The scope control narrows Flows | the filter removed from the list | `scope-control` "narrows Flows to the chosen project", "restores the kept choice" |
| Remove flow archives | the patch sending `paused` | `automation-actions` "is reached only through its one-way confirmation" |
| Settings reads only what it draws | the catalog read put back | `tab-screens` "shows Billing without the plan totals, and reads only what it draws" (and three Settings tests with it) |
| A link failure is a sentence, never a title | the problem's title returned for a 503 | `identity-link` "says in a sentence when the platform's manual-linking switch is off" |

### The fifth signed-in session (24.11, build 7, 2026-10-02 18:33Z–18:44Z)

Build 7 on the owner's iPhone: eleven feedback items, then the owner's decisions — a
team is the sub-organization with its own flows (a project in the platform's contract);
a person asks to join one, is on it or leaves it; an organization owner or admin sees
every team; the old Teams (people groups granted onto projects) go; Unlink now; the cover
page whenever signed out. Verified against the code at `9ae164f`, the production logs and
the platform at `ef91ecd`:

| # | Feedback | What it is | Disposition |
| --- | --- | --- | --- |
| 1 | "Remove the continue to autom8x… bring back the get started cover page… logo and sign in bigger… controls lower" | the splash advanced to Sign in by itself; the Sign in screen led with a small mark and a subtitle | **fixed (24.11.6)**: signed out — launch, sign-out, an ended session, a deleted account — is the cover, waiting, with "Get started" the one way on to Sign in; every route that left for Sign in leaves for the cover. Sign in: the subtitle gone, the mark 124 and the title 34, the providers lower |
| 2 | "I removed a flow then added it back. Where is the archive of the old one?" | the list holds no archived row by design (backend §12.1 #92), so a removed flow had nowhere to be read | **fixed (24.11.8)**: Removed flows — a row with a count in Flows, within the scope, a Settings entry, a read-only page with its history and "Add it again", each saying the day it was removed; read with `status=archived` (backend §12.1 #203, #140). The day is the row's `updatedAt`: nothing in the app changes a removed flow, so it is the removal (a rename through the API would move it) |
| 3 | "What is this webhook address for?" | the dialog opened on how to use it, not what it is | **fixed (24.11.9)**: its first sentence says what it is — where a service sends the events that start the flow |
| 4, 8 | "what about projects or teams… hr, development, accounting… Org Team Project Flows — is this a good hierarchy?" | projects lived under Settings; Teams were people groups; one name too many | **fixed (24.11.7)**: Teams replace Projects everywhere — the scope pill always there with "Create a team"; Settings › Teams; a team's page with members and requests to join; the old Teams screens gone. The hierarchy is organization → team → flows |
| 5 | "How do I unlink an account?" | linking had no inverse anywhere | **fixed (24.11.9)**: Unlink on a linked account, never the primary, confirmed first; ~~the platform's sentence shown as it is~~ (backend #138). **Corrected in build 10 (24.12):** the app showed the problem's TITLE — "Bad Request", "Not Found" — never its sentence: the transport keeps a problem's title, code and details, not its `detail`, and the test passed only because it built the error with the sentence as its message. Unlink now says each refusal by its reason; see the sixth session, item 10 |
| 6 | "Why is sign out here but delete account somewhere else" | sign-out ends a session; deletion ends the account | **kept as is**, the owner's decision of 2026-10-02 |
| 7 | "Should we not make this drop downs instead?" | Create project took the kind as free text | **fixed (24.11.7)**: Create a team takes the organization and the kind from dropdowns; "Other" opens a field. The kinds are `lib/content/team-types.ts` |
| 9 | "Error page or look is fine. But why am i getting this?" | a run row of a removed flow opened the flow page, which matched nothing: "Couldn't load this flow", with no failed request | **fixed (24.11.8)**: a removed flow's page opens, read-only; its run rows say "Flow removed" |
| 10 | "Nothing held how do i test approve" | no flow had held anything yet | **a test step, not a defect**: move Invoice triage to v4 and Run above its threshold; the run is held and the decision is the owner's (24.11.13) |
| 11 | "I should be able to click runs and the other headers to check the history" | the stat tiles were not pressable | **fixed (24.11.9)**: Home's tiles open Activity for that outcome; a flow page's Runs, Successes and Failures open Activity for that flow and outcome, the flow a chip that clears it |
| — | three `404` on `runs/{id}` after a workspace switch | the run page re-read its run id in whichever workspace was active | **fixed (24.11.9)**: the page reads in the workspace it was opened in, and leaves when the active one changes |
| — | Delete project: "You can restore it later by creating a project of the same type — your data will reattach" | nothing in the platform reattaches anything: creating makes a new team, and archiving leaves its flows running | **corrected**: "It leaves every team list. Its flows keep running until you remove them in Flows." |

Two things degrade rather than fail against a platform from before the SEVENTEENTH
promotion, which carries backend #138–#140: the team directory and a team's requests
answer 404 there, so Teams lists the teams a person is on without the asking section, and
a team's page draws no requests; the removed-flows read is answered with the live list,
which the client discards (only archived rows are kept). Unlink and Request are refused
upstream until then, ~~in the platform's words~~. **Corrected in build 10 (24.12):** not in
words — both showed the Edge's problem title, "Not Found" (the sixth session, item 10).
Unlink now says "Unlinking isn't available yet." for a route the platform does not have;
Request still shows the title, which build 10 does not change.

The words: the app's copy says team and flow (24.11.7, and "Flows will be the name we use
from now on", 24.9). Nineteen strings still said "automation" — the webhook dialog's "This
automation has no address yet.", Setup's title, the move and file refusals, Billing's
capability label and the connection note — and now say "flow"; an archived one is "a removed
flow", as Flows calls it. `audit:vocabulary` parses the copy and fails the build on either
word; the brand line "AUTOMATION × AI" is the one exact string allowed.

The screens, from this commit in the iOS simulator (iPhone 16 Pro, iOS 18.6, Expo Go 54.0.7,
2026-10-02), signed out: the cover, waiting on "Get started", and Sign in with the subtitle
gone, the mark 124 and the title 34, the providers lower.

![The cover, signed out](design-gaps/24.11-cover.png) ![Sign in](design-gaps/24.11-sign-in.png)

### Guards proved to bite, 24.11

Fifteen breaks, each run against its own suite and the file restored by SHA-256.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| Signed out is the cover | the tab guard redirecting to Sign in | `auth-boundary` — the three closed states |
| The cover waits for Get started | Get started not drawn | `splash-tap` "waits when signed out" |
| Unlink never on the primary | the primary drawn with Unlink | `account-screen` "offers Unlink… never on the primary" (and "shows what is linked") |
| Unlink sends the device's refresh token | an empty token | `account-screen` "offers Unlink… sends the refresh token" |
| Removed flows are the archived ones only | the status filter dropped | `removed-flows` "asks with status=archived and keeps only rows that are archived" |
| A removed flow's page offers no actions | the actions drawn for it | `tab-screens` "a removed flow's page opens instead of Couldn't load" |
| A run stays in the workspace it was opened in | the switch ignored | `run-workspace` "reads the run in the workspace it was opened in, and leaves" |
| A flow's history is that flow's | the flow filter dropped | `tab-screens` "a flow nobody ran reads as its own empty" |
| A team made from the pill is the scope | not selected | `scope-control` "Create a team makes one and makes it the scope" |
| No directory yet is not a failure | a 404 thrown | `teams-screens` "lists the teams it is on when the platform has no directory yet" |
| A manager's decision is the one chosen | Deny sending approve | `teams-screens` "approves or denies them" |
| Settings › Teams opens Teams | the row opening Organization | `teams-screens` "always offers Organization and Teams" |
| No copy says project or automation | the audit's pattern matching nothing | `audit-gates` "fails copy that says project or automation" |
| The webhook dialog says what the address is for | the sentence replaced | `automation-actions` "shows the secret once, in the dialog" |
| A removed flow says the day it was removed | the day dropped | `tab-screens` "the Removed page lists them" and "a removed flow's page opens" |

### The sixth signed-in session (build 9, 2026-10-02 22:20Z–22:35Z)

Build 9 on the owner's iPhone (iOS 26.6.2): fourteen TestFlight feedback items in fifteen
minutes, read with their screenshots, then the owner's decisions the same day — (1) a team
is its kind, with no separate name: one team per kind in a workspace, an archived team
freeing its kind; (2) teams in the personal workspace too, made in the workspace the person
is in, with no picker, and in an organization by its owners and admins only; (3) no
description on create; (4) "Archive flow" / "Archived flows"; (5) a join link, which an
organization accepts only from someone at its verified email domain (today's platform rule),
while a personal workspace stays private; (6) the centred empty state on whole empty screens
only; (7) Free, Plus (the `team` plan renamed, its id kept) and Pro once its price exists,
as cards with the name and price only; (8) a plan picked opens Stripe's hosted checkout for
it, and once paying a change goes through Manage billing; (9) Connections is third-party
integrations only; (10) Settings by category; (11) bigger type; (12) "Other" kinds of 2 to
60 characters. Verified against the code at `6fc52f5`; the platform's half is backend 24.12,
and the contract names this app reads (409 `team_kind_taken`, the 403 for a plain member,
409 `plan_exists`, Plus as `team`'s display name) are the build's shared wording:

| # | Feedback | What it is | Disposition |
| --- | --- | --- | --- |
| 1 | "The drop down should not extend the card… bring the drop down to the front… remove the team name thing… Just 2 things to click max… we shouldnt have to select [the organization] either" | the kind list opened in the card's flow and pushed the fields down; Create a team asked for a workspace, a name, a kind and a description | **fixed (24.12)**: the list floats in front of the card; Create a team is the kind alone — "Other" opens a field of 2 to 60 characters — sent as the team's name and its type, in the workspace the person is in, which one line names; no picker, name or description. A second team of a kind is refused in words (409 `team_kind_taken`), and a plain member of an organization is not offered Create (the platform's 403 is said in words too). A team's title is its kind, said once — on Teams, the pill, a team's page and a flow's label |
| 2, 6 | "I removed the flow but where are the archives?" · "I literally asked for archives. Not removed flows. Archived flows" | the page existed (24.11.8) under the name Removed flows | **fixed (24.12)**: "Archive flow" and "Archived flows" everywhere — the button and its confirmation, the list and its row in Flows, the badge, the run rows, the refusals; the route is `flows/archived` |
| 3, 9 | "I changed the org name and it did not save… how i can invite team members to teams now if they are in the organization" · "Now it changed to the new name. Something is going on regarding the name" | the rename saved; the screen read the workspace list again from the shared snapshot, whose 120 s window nothing dropped (24.9.1) — item 9 is that window running out. There was no link to send anyone | **fixed (24.12)**: a rename, a new organization and a join drop the workspace list, so the next read is real. An owner or admin shares a join link (decision 5); the line under it names the organization's verified domain, the only one the platform accepts a request from, or says to verify one first — made exact below: the domain must also be shown for matching emails, and the line follows its joining policy |
| 4 | "Make a not when a screen is empty i dont want component cards like this. Look at flows when no flows are there…" | Teams drew a card, "No teams yet.", under its Create button; other whole screens had lines of their own | **fixed (24.12)**: the centred standard — icon, title, line, an action where there is one, Back on a pushed screen — on Teams, Archived flows (both copies), the empty inbox, Organization with nothing found, an empty catalog, and Connections with no integrations; a section keeps its own line (decision 6) |
| 5 | "Isnt it easier from app to either share or download to files like apple native rather than go to safari" | Download file opened the export's signed link in Safari | **fixed (24.12)**: on iOS the file is saved into the app — a credential-less native download in the transport, budgeted to one call by `audit:platform` — and handed to the share sheet (Save to Files, AirDrop, Mail), then removed; Android, whose share sheet carries text, still opens the link |
| 7 | "When i press back it takes me here from archived flows in settings. Shouldnt it take me back to settings…" | Settings' row pushed the Flows tab's page — a push across tabs — so Back landed in Flows | **fixed (24.12)**: Settings › Workspace › Archived flows is a copy in the Settings stack, and its flows open there too |
| 8 | "Why is choosing a plan taking me to stripe? I thought per flow we charge users." | billing is per plan: Choose plan opened Stripe's hosted checkout (ADR-0032); the price on each flow in the catalog is a list price | **answered by decisions 7 and 8 (24.12)**: picking a plan opens Stripe's checkout for that plan; once paying, Manage billing |
| 10 | "Linked microsoft then trued unlinking apple and it said not found. See why and is that error message good and descriptive to the user?" | production runs an image from before the unlink route (backend #138), so the Edge answered its own 404 for a route it does not have, and the app showed that problem's title, "Not Found" | **fixed (24.12)**: an unlink refusal is a sentence by its reason — "Unlinking isn't available yet." for a route the platform does not have; the not-linked, primary, last and refused sentences; otherwise "The account could not be unlinked." — never a title. The route goes live with the SEVENTEENTH promotion. This corrects the fifth session's row 5 |
| 11 | "Also which account is linked i dont even know from here whT accounts are there." | `LoginIdentitySummary` is `{provider, primary}`: the contract names no account | ~~**waits for the backend contract** (24.12: an optional `email`); the row shows it once the contract carries it~~ **fixed (24.12)**, once backend #142 (`866a557`) put the optional `email` in the contract: each linked account shows the address its provider reports, a muted line under its name — none when it reports none, never on an account that is not linked. Production sends it from the SEVENTEENTH promotion, which carries 24.12 |
| 12 | "I dont see the linked accounts on connections. Also shouldnt connections basically take me to a page… third party integrations the user connects to" | Settings drew the integrations card inline; the sign-in accounts are Account's | **fixed (24.12)**: Settings › Connections is a page of its own, third-party integrations only (decision 9) |
| 13 | "This needs to be revamped. Think of free, plus, pro plans. Monthly in component cards." | a CURRENT PLAN card and a PLANS list with capability lines | **fixed (24.12)**: ~~tall cards~~ **Corrected in build 11 (D2):** compact cards at their natural height — the tallness was the implementer's reading (the draft checklist's "filling the screen"), not the owner's words, which said only "Monthly in component cards"; and Pro is drawn at the owner's $10.00 per month until the platform lists it (the seventh session, item 3). The rest stands: Free (the app's, $0.00 per month, since the platform lists only what can be bought), then the platform's plans by price, today Plus and Pro once it is listed — each its name and price; the workspace's own says "Enrolled" with its renewal or past-due line. On iOS, not paying, a card opens the checkout for its plan; paying, another card opens Manage billing, as does a checkout refused with 409 `plan_exists`; a member sees the cards without actions; Android shows the prices only |
| 14 | "Why is everything so small and why is everything listed in settings…" | one long Settings screen; the design's sizes | **fixed (24.12)** — the categories read again in build 11 as one grouped page, the seventh session's items 1, 2 and 4: Settings is eight categories — Account, Security, Connections, Billing, Workspace, Notifications, Appearance, Help — each its own page, then Sign out and the version (decision 10). And the bigger type (decision 11, "whole app — easy to read"): every font size, line height and tracked size is a step of the app's type scale, `typeScale` in `constants/theme.ts` — about 2 pt over the design's text sizes and 3 over its titles, 12 at the smallest, where the tab labels were 10 — and `audit:type` fails a size written anywhere else; the scope pills wrap rather than cut a name short. The Nocturne and screen-state snapshots were re-pinned once for it: 58 of their 78 entries, the other 20 setting no font size. NOT OBSERVED on a device yet, the largest text sizes included |
| — | the shared snapshot outlived a session | its global entries — the workspace list, the providers — could answer the next account on this device for up to 120 s | **fixed (24.12)**: emptied when a session ends and when one begins |
| — | Settings › Notifications was one row, "Open inbox", that pushed Home's inbox | a push across tabs — item 7's defect again — so Back returned to Home | **fixed (24.12, the owner's default: "Settings › Notifications shows the inbox itself, so Back returns to Settings")**: the page is the inbox itself, a copy in the Settings stack as Archived flows is; a failed run opens there too (`settings/run`, the Home tab's run page), so Back returns to Settings; a held run still opens Activity, as from Home |
| — | Create a team read the active workspace at every render | the scope control keeps the dialog open across a workspace switch, so the switch would have moved the team, and the line naming the workspace, to the new one (CLAUDE.md rule 10) | **fixed (24.12)**: the dialog keeps the workspace it was opened in and names it; once another is active, Create is refused in words (`WORKSPACE_CHANGED`) and nothing is sent, as the run dialog does |
| — | the join link's line said "can ask to join" whatever the domain's joining policy, and named the first verified domain whether or not it is shown for matching emails | the platform takes a request through the link only at a verified domain the organization shows for matching emails (`requireEligibleDomain` needs both), and the policy decides what follows: automatic joins at once, invite only lets no one in | **fixed (24.12)**: the line follows the first verified domain shown for matching emails — approval, automatic or invite only — in the website's words (`joinLinkLine`, as `snoopy/lib/join-link.ts`); a verified domain not shown says "Show for matching verified email domains" must be on; none verified says to verify one first |
| — | copy told people to do something "in Settings" | Settings is eight pages since decision 10 | **fixed (24.12)**: it names the page — "Settings › Workspace" on Organization, "Settings › Connections" on Setup's button and its refusal, "Settings › Security" in the Face ID offer. Setup's button still opens Settings itself, one tap from Connections: a push from another tab straight into a Settings page is not made anywhere yet, and where Back lands from one is NOT OBSERVED. **Since build 11 one is (F84):** Setup's "See teams" opens Settings › Teams, for a plain member only — the build 11 review's fifth finding, recorded with the seventh session below, NOT OBSERVED as well |
| — | a join request named its requester by user id | the contract carried no name until backend #142 (`866a557`, 24.12.4) | **fixed (24.12)**: a request is titled by the person's name — or address — with the address under a name, and the decision names them too; the id only when the platform sends neither, as production does until the SEVENTEENTH promotion |
| — | the empty Notifications, Approvals and Flows screens drew their icon black | Phosphor's default colour is `#000`, and those three set none — near invisible on the dark theme | **fixed (24.12)**: each draws its icon in its siblings' colour — the accent's 300 for Notifications and Flows, as Add a flow and the new empty screens do; `status.ok` for Approvals, as Activity's empty screen does |

What waits on the platform (backend 24.12, for the `snoopy-backend` session): the duplicate-kind
409 and the 403 for a plain member — until they land, a second team of a kind is still made,
and the app's hiding of Create is the only check; the requester's name and email on a join
request, without which an owner approves a user id; `LoginIdentitySummary.email` (item 11);
409 `plan_exists` on a checkout while paying, without which a Plus subscriber who checks out
Pro is billed twice; and the `team` plan's display name, Plus. The join link cannot work in
production yet: a request needs a verified, discoverable domain of the organization, and
production has none. NOT OBSERVED, for a device: whether the floating list takes a touch where
it overhangs the dialog on Android, and Save to Files for the export's file type. ~~Settings ›
Notifications' "Open inbox" opens Home's inbox, a push across tabs, so Back returns to Home.~~
**Corrected in build 10 (24.12):** that was item 7's defect again, so it did not stay: Settings ›
Notifications is the inbox itself, a copy in the Settings stack, and a failed run opened there
opens in Settings too, so Back returns to Settings (the owner's default).

**Since then, in build 10:** backend #142 (`866a557`, 24.12.1–24.12.4) landed all of it — in
the contract the duplicate-kind 409 and the member's 403, `LoginIdentitySummary.email`, the
requester's `displayName` and `email` and 409 `plan_exists`, and in the plans it seeds Plus as
`team`'s display name — and the app's generated types were regenerated from it. Production
sends them from the SEVENTEENTH promotion, which carries 24.12; until then a join request
shows its user id and a linked account no address, as before.

### Guards proved to bite, build 10

Sixty-seven breaks, each run against its own suite and the file restored by SHA-256. The
first break of the category order left its test green — the test found each row by its key,
so it checked the titles and not their order — so the test was made to read the rows as drawn
and the break run again before anything was committed. The last eleven guard what build 10
finished with: the inbox in Settings, the dialog's workspace, the join link's line, the pages
named, a linked account's address and a requester's name. The empty screens' icon colour is a
style no test reads, so no break was run for it. One earlier guard went with what it guarded:
Settings › Notifications no longer opens the inbox, it is the inbox.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| A team is its kind: the kind is sent as its name and its type | the name sent as "Team" | `teams-screens` "creates a team in the workspace the person is in: the kind only, sent as its name and its type (24.12)" |
| A team is made in the workspace the person is in, personal included | the first organization taken instead of the active workspace | `teams-screens` "creates one in the personal workspace when that is the one the person is in" |
| Other is 2 to 60 characters | the old 1-to-120 limit | `teams-screens` "refuses an empty Other and words outside 2 to 60 characters, sending nothing" |
| A second team of a kind, and a member refused, are said in words | the error's own message shown | `teams-screens` "says a second team of a kind in words — never "Conflict" — and a refusal to a member as the rule" |
| A plain organization member is not offered Create a team (Teams) | Create always offered | `teams-screens` "does not offer Create a team to a plain member of the organization (24.12)" |
| A plain organization member is not offered Create a team (the team pill) | Create always offered | `scope-control` "lists a team by its kind, once, and offers a plain member no Create a team (24.12)" |
| The dropdown floats in front of the card | the list put back in normal flow | `select-field` "opens a list that floats under the box, opaque and in front, and picking an option closes it" |
| A team's title is its kind (Teams) | the name as the title | `teams-screens` "titles a team by its kind and says the kind once — a team named before 24.12 too (24.12)" |
| A team's title is its kind (the team pill) | the name as the title | `scope-control` "lists a team by its kind, once, and offers a plain member no Create a team (24.12)" |
| A team page says its kind once | the kind put back in the subtitle | `teams-screens` "deletes its owner's team in the team's own workspace, saying what becomes of its flows" |
| A flow's team label is the team's kind | the name as the label | `flows-view` "labels a flow by its team's kind — a team named before 24.12 too" |
| Archive wording: the confirmation | the old "leaves your flows" body | `automation-actions` "is reached only through its one-way confirmation" |
| Archive wording: an archived flow's page | "removed" put back | `tab-screens` "an archived flow's page opens instead of "Couldn't load": no actions, its history, and Add it again" |
| Archive wording: the refusals | "A removed flow cannot move." put back | `shared-rules` "says an archived flow is archived, not removed (24.12)" |
| Settings › Workspace › Archived flows stays in Settings | the row pushing the Flows tab's page | `tab-screens` "Settings › Workspace offers the Archived flows page, in Settings' own stack" |
| An archived flow opened from Settings opens in Settings | the Settings copy opening the Flows detail | `tab-screens` "the Settings copy opens an archived flow in the Settings stack, so Back returns to Settings" |
| A rename shows the new name | renameWorkspace invalidating nothing | `organization-screen` "reads the workspace list again after a rename, so the new name shows" |
| A rename, a new organization and a join drop the workspace list | changedWorkspaces dropping nothing | `snapshot-invalidation` "a rename, a new organization and a join drop the workspace list (24.12)" |
| The snapshot is emptied when a session ends | signedOut() not resetting | `session-provider` "is emptied by a sign-out the platform revoked" |
| The snapshot is emptied when a new session begins | sign-in's reset removed | `session-provider` "is emptied when a new session begins" |
| The join link is shared as a link on iOS | text shared on iOS too | `organization-screen` "lets an owner share it on iOS as a link, saying who at the verified domain can ask to join" |
| The join link line names a verified domain, or says verify first | the first domain taken, verified or not | `organization-screen` "says a domain must be verified first when none is" |
| No join link without a website origin | a link built on an empty origin | `organization-screen` "is not offered to a member, nor without a website to link to" |
| The empty standard draws Back only for a pushed screen | Back always drawn | `screen-state` "draws a way back only for a pushed screen that asks for one (24.12)" |
| Teams with nothing to list is the empty standard | the empty branch never taken | `teams-screens` "is the empty-state standard with nothing to list: Create a team opens the dialog, and Back leaves (24.12)" |
| Archived flows with none is the empty standard | the empty branch never taken | `tab-screens` "the Archived page lists them, read-only, and is the empty standard when there are none" |
| An empty inbox has its way back | onBack removed | `tab-screens` "is the empty standard with its way back, since the inbox is a pushed screen" |
| Organization with nothing found is the empty standard | the empty branch never taken | `organization-screen` "offers setting one up only on a company domain, not a mailbox provider" |
| An empty catalog is the empty standard | the empty branch never taken | `tab-screens` "is the whole-screen empty standard, with its way back" |
| Connections with no providers is the empty standard | the empty branch never taken | `settings-connections` "lists the third-party integrations, and is the empty-state standard with none" |
| Settings is the eight categories in the owner's order | Workspace moved above Billing | `tab-screens` "is eight categories in the owner's order, then Sign out and the version — and reads nothing (24.12)" |
| Each category opens its own page | Security opening Account | `tab-screens` "opens each category on its own page" |
| ~~Settings › Notifications opens the inbox~~ | ~~the row going back instead~~ | ~~`tab-screens` "says what notifications are on the Notifications page, and opens the inbox"~~ — the row and its test went when the page became the inbox itself (below) |
| Billing: Free, then the plans by price | the platform order kept | `billing-screen` "shows Free, Plus and Pro in that order, each its name and price only — the workspace's own "Enrolled" with its status" |
| Billing: Free is $0.00 per month | the free price changed | `billing-screen` "shows Free, Plus and Pro in that order, each its name and price only — the workspace's own "Enrolled" with its status" |
| Billing: the workspace's plan says "Enrolled" | "Enrolled" not drawn | `billing-screen` "shows Free, Plus and Pro in that order, each its name and price only — the workspace's own "Enrolled" with its status" |
| Billing: not paying, a card opens the checkout for THAT plan | every card checking out Plus | `billing-screen` "on iOS, not paying: a paid plan's card opens the hosted checkout for THAT plan, and nothing but https" |
| Billing: paying, another card opens the portal, never a second checkout | the portal branch removed | `billing-screen` "on iOS, paying: another card opens Manage billing — the portal — never a second checkout" |
| Billing: 409 plan_exists opens Manage billing | the refusal shown instead | `billing-screen` "on iOS, a checkout refused because the workspace already has a plan (409 plan_exists) opens Manage billing" |
| Billing: a member sees the cards without actions | the cards acting for a member | `billing-screen` "shows a member the cards without actions and who manages billing; this workspace's billing is not read" |
| Billing: Android shows prices only | purchasing on every platform | `billing-screen` "on Android offers no purchase control or call to action: a card does nothing" |
| Export: on iOS the file is saved into the app and shared, not opened in Safari | the link opened on iOS too | `data-support-screens` "on iOS saves the complete export into the app, read afresh, and hands it to the share sheet — not Safari (24.12)" |
| Export: the saved file is removed once shared | the delete removed | `data-support-screens` "on iOS saves the complete export into the app, read afresh, and hands it to the share sheet — not Safari (24.12)" |
| Export: the download keeps only the file's own name | the name taken whole | `platform-request` "keeps only the last step of the name the platform gave, never a way out of the cache" |
| audit:platform admits one native download, in the transport only | the budget raised to two | `audit-gates` "allows the transport ONE native download, the signed export, and nothing more (24.12)" |
| Unlink: a route the platform does not have is "not available yet" | every 404 read as not linked | `account-screen` "says unlinking isn't available yet where the platform has no such route — build 9's "Not Found"" |
| Unlink: a refusal is said by its reason, never the title | the error's message (the title) shown | `account-screen` "says a refused unlink in words by its reason, never the problem title (24.12)" |
| The type scale's smallest step is 12 or more | `micro` put back to the design's 10 | `theme` "ascends the type scale from a smallest step of 12 or more, each line clear of its glyphs (24.12)" |
| The type scale ascends | `title` set to 16, under `lead` | `theme` "ascends the type scale from a smallest step of 12 or more, each line clear of its glyphs (24.12)" |
| Each step's line clears Inter's 1.21 em | `hero`'s line height cut to 40 | `theme` "ascends the type scale from a smallest step of 12 or more, each line clear of its glyphs (24.12)" |
| audit:type fails a size written as a number | the audit's number test finding nothing | `audit-gates` "fails a font size written outside the type scale, in each form a number becomes a size, and passes the scale" |
| audit:type follows a name to the number it was given — a const, a default, a local table | the name lookup finding nothing | `audit-gates` "fails a font size written outside the type scale, in each form a number becomes a size, and passes the scale" |
| audit:type reads no size in a comparison | the comparison rule removed | `audit-gates` "fails a font size written outside the type scale, in each form a number becomes a size, and passes the scale" |
| The scope pills wrap rather than run off the screen | the row's wrap removed | `scope-control` "keeps a long name whole: the row wraps and a pill may take all of it, so neither is cut short nor runs off the screen" |
| A scope pill may take the whole row | the 60% cap put back | `scope-control` "keeps a long name whole: the row wraps and a pill may take all of it, so neither is cut short nor runs off the screen" |
| The Nocturne set is drawn at the scale (the re-pin) | PillButton's default put back to the design's 16 | `nocturne-visual` "PillButton/… renders unchanged", the four variants in both palettes |
| Settings › Notifications is the inbox, and its runs open in Settings | the Settings copy given Home's run path | `tab-screens` "is the inbox itself on the Notifications page, in Settings' own stack: its rows, its Back, and its runs (24.12)" |
| Create a team keeps the workspace it was opened in | the workspace read at every render again | `teams-screens` "keeps naming that workspace, and refuses Create in words — sending nothing — once another is active" |
| Create a team is refused once another workspace is active | the opened workspace sent without `workspaceIfShown` | `teams-screens` "keeps naming that workspace, and refuses Create in words — sending nothing — once another is active" |
| The join link's line follows the joining policy | automatic worded as approval | `organization-screen` "words the line by the joining policy — automatic (joinLinkLine, 24.12)" |
| The join link's line takes a domain shown for matching emails | the first verified domain taken, shown or not | `organization-screen` "takes a domain shown for matching emails over a hidden one, whatever the order" (and the "verified, not shown for matching emails" case) |
| Setup's button names Settings › Connections | "in Settings" put back | `tab-screens` "names the page an account is connected on — Settings › Connections — while one is missing (24.12)" |
| Setup's refusal names Settings › Connections | "in Settings" put back | `tab-screens` "names that page when the flow it just added still needs an account (24.12)" |
| Organization names Settings › Workspace | "Settings' workspace row" put back | `organization-screen` "names the page to switch to an organization from — Settings › Workspace (24.12)" |
| The Face ID offer names Settings › Security | "in Settings" put back | `faceid-screen` "names the page the setting is on — Settings › Security (24.12)" |
| A linked account shows the address its provider reports | the line dropped | `account-screen` "shows the address a linked account reports, muted under its name — none when it reports none, none when not linked (24.12)" |
| A join request names the person asking | the user id as its title again | `organization-screen` "names the person asking to join — their name and address, the id only when the platform sends neither (24.12)" |

### The seventh signed-in session (build 10, 2026-10-03 02:57Z–03:14Z)

Build 10 on the owner's iPhone (iOS 26.6.2): thirteen TestFlight feedback items in
seventeen minutes, read with their screenshots, then the owner's decisions the same day
("do all recommended except" push and the logo, which go further) — (D1) Settings is ONE
grouped page, the large areas behind rows and the small things inline, roomier; (D2) the
billing cards compact, and Pro drawn at $10.00 per month until the platform lists it; (D3)
an archived flow that is live again in the same scope offers no "Add it again" but the live
flow; (D4) every flow says its team, and a flow is added to a team, in both clients; (D5)
"Archived" is a header button left of New; (D6) Flows is the empty standard whenever the
workspace has no live flow; (D7) every press ticks, through one shared pressable; (D8) device
push, built now, not later ("i said to add it"); (D9) the Home mark fills the header's free
space. Verified against the code at `daef007`; the platform is unchanged by this pass — a
whole-workspace flow is still a scope it accepts, and Pro's real plan waits on its Stripe price
(E4, A1):

| # | Feedback | What it is | Disposition |
| --- | --- | --- | --- |
| 1 | "I didnt want all to be like this. Also they look swished together. It should be vertically more roomy. Maybe what we can do is add a bit of meta data on this page per category. For example account can have the email. Billing can have the plan type (free,plus or pro) Appearance does not need a special section it can be displayed here. Its just auto, dark, or light. Workspace can also be a drop down right unless theres a lot more." | build 10 read decision 10 as EVERY category becoming a page: eight title-only rows in one card at ~47 pt pitch, no section label, no sub line, the profile card gone — the three things that gave the build 9 screen its rhythm | **fixed (build 11, D1)**: one grouped page in the build's order — Account with the session's email under it → page · SECURITY: the Face ID row · Connections → page · Billing with the plan's name under it → page · WORKSPACE: the switcher row (the existing Switch workspace dialog, mounted on the index), Your role, Organization, Teams, Archived flows (the Settings copy), Export my data · Notifications → page · APPEARANCE: Auto, Dark, Light · Help → page · Sign out · the version. The rows are roomier on this page only (`SettingsRow size="roomy"`: 17 pt of vertical padding and the scale's line heights; every other list keeps its row). The plan line is a new, quiet kind of read: an owner's or admin's billing through the shared snapshot — one request per workspace per 120 s window, ~~shared with the Billing page~~ refreshed by the Billing page's own read, which is a real request at every visit (**corrected by the build 11 review**: shared, it kept a plan read before Stripe's webhook landed on the page for up to two minutes), and dropped when a checkout or the portal opens — said once it is known as "Free", "Plus" or "Pro" by the one enrolled-plan rule (`lib/view/billing.ts`, the Billing page's too), nothing while loading, nothing on a failure or offline, no error screen; a member's is never read and their line says "Managed by owners and admins" |
| 2 | "Security does not need its own page it can be in the main settings page like before." | decision 10 gave a one-row category a page | **fixed (D1)**: the Face ID row is on the index under SECURITY, its toggle and its failure under it (`components/settings/face-id-row.tsx`, the handler the build 9 screen and the build 10 page had); the page and its route went, and the Face ID offer says "You can change this later in Settings." |
| 3 | "I said free plus and pro. Also the components dont need to be that big. Visually it looks unpleasing" | three nested `flex: 1` split the leftover screen between the two cards, each about 2.4× its content; and no `pro` plan is seeded — `/v1/plans` lists only a priced plan — so Pro could not appear from data | **fixed (D2)**: compact cards at their natural height — name, price at the scale's `title`, the status line — no stretching. Pro is drawn after Plus at "$10.00 per month", the owner's price, while the platform lists no plan with id `pro`: an inert card on every platform and for every role (a checkout for it would answer 404 and show "Not Found"; the portal has no Pro), replaced by the platform's Pro once its Stripe price exists and A1 seeds it (E4). This corrects the sixth session's row 13 |
| 4 | "This can also be in the main settings page. Just like this" (the Workspace page) | decision 10 made Workspace a page; the owner's #1 read its switcher row as "a drop down" | **fixed (D1)**: the six rows are the index's WORKSPACE group, the switcher row opening the existing Switch workspace dialog (a list to pick from — the caret and read-on-open rule unchanged); the page and its route went, and Organization's sentence says "Switch to it in Settings; its owners and admins manage it there." |
| 5, 6, 11 | "I added the archived and went back in to archived. I shouldnt be able to add it again right. What is the best way to ensure it stays in archived but cant add it again if it is already active" · "I already added it back I shouldnt see add it again then" · "I was able to add the archived back even though there was an existing on flows page" | the archived page branched on its own status alone, never on whether the live list held the same template in the same scope; and Setup edits the one non-archived row per template and scope, so "Add it again" silently re-configured the LIVE flow while saying it was adding one | **fixed (D3)**: the live twin is the platform's own uniqueness — a non-archived subscription (live, paused or draft) with the same template AND the same scope, the whole workspace matching the whole workspace only (`addedAgainAs`, `lib/view/catalog.ts`), read from the live list the page already holds. With one: no "Add it again"; "This flow was archived on {day}. Its runs stay in Activity. It has been added again, and the new copy is in Flows." and "Open the live flow", which opens the twin in the same stack (Flows, or Settings' copy). The archived row stays as it is — archiving is one-way on the platform, and the row never leaves the list |
| 7 | "What team is that flow part of? Each flow has to be in a team" | the label was drawn only once the workspace had a team (a 24.9 choice so the rows read as they always had), so a workspace with none could not answer the question; and both clients offered the whole workspace first | **fixed (D4)**: every card under All teams, every archived row and every flow page says "Team: {kind}" or "Whole workspace", the website's words (`scopeLabels` labels whatever the workspace holds; ~~inside a picked team the card still does not repeat it~~ — **corrected by the build 11 review:** an exception D4 never made, so the card and the archived row say it in every scope now, as the flow page always did). Adding requires a team: Setup has no whole-workspace chip, chips whenever teams exist, nothing chosen for the person under All teams or for a whole-workspace flow added again, "Pick a team." refused with nothing sent, `projectId` always sent; with no team yet an owner or admin sees "Create a team first." and a "Create a team" button opening the Create a team dialog, and the team made is the chip chosen; a plain member sees "An owner or admin creates the first team." and no Activate. The two existing whole-workspace flows stay, labelled, under All teams; the platform is unchanged (`projectId` null is still a scope it accepts, and a member on no team still sees nothing scoped — its visibility rule, not the app's) |
| 8 | "Archived should be a button to the left of new . It should have that icon too. We dont need a component on the page. The screen will be treated as empty if there are no flows even if there are archived. So it should follow the format similar to activity when empty on the page." | 24.11.8 placed the archived entry as a counted row after the list, so it was a component on the page in every state, the search's no-match state included | **fixed (D5, D6)**: the title row's right side is [Archived][New] — Archived a secondary pill with the Archive icon and the word, no count, always drawn, opening the archived page; the row is gone (`PillButton` took an optional `testID` for it; the Nocturne snapshots did not move). The whole-screen empty is Activity's format whenever the workspace has no live flow |
| 9 | "Flows should have it like this when no flows even if archive." (Activity's empty screen) | the whole-screen empty needed zero archived flows too, so with only archived ones the screen fell through to the list and drew the in-team line — "No flows in this team yet" under All teams | **fixed (D6)**: the condition is live flows only (`live.length === 0`), whatever is archived — the archived read stays only to know whether to offer them: a plain "Archived flows" button under "Add a flow" when any exist in the scope, so the person who just archived their last flow has a way to it (the build 9 complaint). A chosen team with none while the workspace has some keeps its inline line, so the scope control stays |
| 10 | "Clicking the name icon ln the top should give haptic feedback. Ensure any button clicked does haptic feedback like the others" | exactly one haptic existed — the tab bar's `selectionAsync` on iOS, inside the component — and nothing made it the rule: 27 files drew react-native's Pressable (37 sites, and through the primitives some 140 more presses), 3 presses were `Text` handlers, all silent; the avatar and the bell among them | **fixed (D7)**: `components/pressable.tsx` — `Pressable`, react-native's with its press wrapped, and `pressed()` for a host element's handler — one selection tick before the handler, iOS only, the native call's rejection swallowed; every file's import moved (no JSX changed), the three Text handlers wrapped (See all, Mark all read, a callout's retry), the tab bar on the helper, the toggle included; a press with no handler (the unswitchable workspace pill, the signed-out cover, which now has no handler at all) or a disabled control gives none. `audit:haptics` (verify and CI) fails a Pressable/Touchable/Button from react-native outside the helper, a default or namespace import of react-native, expo-haptics elsewhere, and a Text/View/Image/ScrollView/Animated press handler that is not `pressed(…)`; its negative tests are in `audit-gates`. The Nocturne and screen-state snapshots are byte-identical (the host tree did not change) — no re-pin |
| 12 | "Also make the logo on the top left bigger" | the Home mark was the design's 17 pt (Screen.dc.html sHome) in a row the bell and the avatar make 38 tall — 10.5 pt of air above and below it (the owner's screenshot measured: 34.0 × 16.3 pt) | **fixed (build 11, D9 — "should fill up that empty space top left … just the logo")**: the mark is 38 pt, the row's height, in all four Home states (`HOME_MARK_HEIGHT` through BrandMark's own `height`), 77.8 × 38 pt; the row, the bell, the avatar and the 18-pt gap to the pills are unchanged, so nothing below moves, and at 320 pt the mark and the two buttons still leave 116 pt between them. It draws only the PNG's glyphs — white on a transparent ground, no tile, border or shadow — which the header test holds in both palettes; BrandMark gained only an optional `testID`, and its two Nocturne snapshots are byte-identical. **NOT OBSERVED** on a device until the owner's build 11 screenshot |
| 13 | "What do we need to do here?" (the push card on Notifications: "Device push delivery is not configured.") | the platform had no push contract (the refusal map), so the inbox was an in-app composition and the card said so | **fixed (build 11, D8, "i said to add it"; BUILD-PLAN 24.13.6, ADR-0035)**: device push for held and failed runs. `expo-notifications` and `expo-device` at the SDK 54 pins, and the plugin in `app.json`, which writes `aps-environment` at prebuild — never hand-written, which `app-config` holds (`npx expo config --type introspect` shows `development`, the plugin's default; build 11's ipa is read for `production`, 24.13.8). `lib/platform/devices.ts`: `PUT /v1/session/devices` with `{ platform: 'ios', token, appBuild }`, only the answered device id kept, in SecureStore with the session. `hooks/use-push-registration.tsx`, in the signed-in tree: an iPhone that iOS already lets notify registers on every sign-in and cold start, and again when its token changes (the first token heard is a registration's own echo); a push shows its banner in the foreground while someone is signed in; a tap opens a failed run's page (`run-failed`) or Activity (`approval-requested`), while the app runs or as the tap that opened it, once signed in. The card is the only ask, never a prompt at launch: "Get a notification on this phone when a run is held or fails." with "Turn on" (iOS asks at the tap) and "Not now" (held for the session, the Face ID offer's rule); off in iOS Settings, "Notifications for Autom8x are off in iOS Settings." with "Open Settings", read again on the return; registered, no card; Android or a simulator, "Notifications on this phone are coming in a later build." with no Turn on (backend §12.1 #211); a platform from before the route (404/503), "Notifications aren't available yet."; no token on the build, "Notifications aren't available on this build."; any other failure, "Notifications couldn't be turned on. Try again." under the ask. Sign-out DELETEs the device with the still-valid bearer BEFORE the logout, never blocking and logging nothing; a session ended any other way — a 401, or "remember me" off at the next cold start — cannot, and the phone stays registered until it registers again or the prune (backend §12.1 #210). No web push. **NOT OBSERVED** until a push arrives on the owner's phone (24.13.8): the EIGHTEENTH promotion, the APNs key through `eas credentials` and build 11's entitlement come first |

Not in the first pass of this build, and why: D8 and D9 above — each since done in a later
pass (rows 12 and 13). The catalog's subtitle under All teams still reads
"Adding to your workspace." (a sentence the build's shared wording does not give; under D4 the
flow is added to a team picked on Setup) — for the next pass, with its words. NOT OBSERVED, for
a device: the header's fit with "Flows", Archived and New at the bigger type; the roomier index
and its thirteen rows; the longer labelled line ("Whole workspace · 1,284 runs…") on a narrow
phone; the empty screen with its second button; whether the selection tick from a list row or a
card feels as the tabs' did (the simulator has none). Two decided flips of pinned behaviour,
each named in its test: "draws no scope where the workspace has no project" became "says Whole
workspace where the workspace has no team at all" (D4), and a flow page's subtitle is "Whole
workspace · Sheets → Slack digest" where it was the description alone; "adds an automation to
the project chosen" lost its "Whole workspace" step and gained the "Pick a team." refusal (D4);
the Face ID offer and Organization's sentence no longer name a page (D1); the archived page's
"Add it again" test was split in two, with and without a live twin (D3).

Left by the D8 pass (row 13), each for the owner's word: an empty inbox was the 24.12 empty
standard with no card, so a person with nothing held or failed could not turn push on anywhere,
Settings › Notifications included — **decided by the owner 2026-10-03 ("Also on empty
(Recommended)") and done**: the ask is drawn above the empty standard on both inboxes, as the
design draws `pushAsk` above `notifsEmpty` (`ScreenEmpty`'s `above`, under the way back; every
other empty screen renders as before and both snapshot files are unchanged); Home's bell is not re-read
when a push arrives in the foreground, only on its next read; and a sign-out whose logout then
fails (502, still signed in) has already unregistered the phone, which gets no push until the
next sign-in or cold start registers it again. Its decided flips, each named in its test: the
inbox card's `tab-screens` test holds the ask ("Turn on", "Not now") where it held "Device
push delivery is not configured." with "Got it" and "Dismiss"; and `session-store`'s sign-out
clears seven keys where it cleared five, push's device id and "Not now" joining them. One more
item the pass left — a push named its run but not its workspace, so a tap on one from a
workspace other than the active one opened a run page that read in the active one and said it
could not load it — is handled in the app since: a push naming another of the person's
workspaces (`data.workspaceId`, a UUID on the session's list) switches to it as the switcher
does — `PATCH /v1/session/active-workspace` with a `workspace-activate` key, then `/v1/session`
read again — and opens the run's page or Activity only once the switched session is drawn, so
the run's page binds to that workspace (24.11.9); a refused switch, or a session read that fails
or leaves another workspace active, opens nothing and leaves the person where they are; the
active workspace, no workspace, an id of another shape or one not theirs opens in the active
workspace, as before. Each notification still opens once, by its identifier, and the tap that
opened the app still waits for sign-in. It is live once the platform names the workspace in
every push (`data = { event, workspaceId, runId?, approvalId? }`, snoopy-backend's change, in
production with the NINETEENTH promotion); until then no push names one, a tap opens in the
active workspace, and another workspace's run still says it could not load it. **NOT
OBSERVED** on a device until a push from a second workspace is tapped there.

**F84** (the website's register — found by its change audit of the build 10 decisions,
2026-10-03, and fixed on `snoopy`'s round-16-build-11 in c2e25da; fixed here for parity): a
plain member on no team, in an organization that has a team they could ask to join, read "An
owner or admin creates the first team." on Setup (row 7's member line) — false there, while
Teams offered that very team under ASK TO JOIN. Now, in the website's rule and words: where the
workspace has no open team to add to, Setup reads the team directory — only in that state, one
read where there is no team at all; an owner or admin, who sees every team, reads none to ask
onto, and their "Create a team first." is drawn first anyway — and a plain member for whom it
lists a team they are not on (access `none` or `requested`) reads "Ask to join a team first."
with a secondary "See teams" button that opens Teams, and no Activate; otherwise "An owner or
admin creates the first team.", as before. The directory's tolerant read is one helper,
`teamDirectoryIfThere` (`lib/platform/projects.ts`), moved out of the Teams screen unchanged: a
platform from before the SEVENTEENTH promotion answers 404 and lists nothing, so Setup draws
the owner-or-admin line, and every other failure is the screen's. Setup's loader does not read
the role — it is keyed on the template, and its closure would keep a stale one. The test
transport's default directory lists nothing (`test/platform.tsx`), as its default teams do.
**NOT OBSERVED** on a device.

**The single-pass review of build 11** (2026-10-03, over the whole uncommitted build at
`daef007`; one pass, the owner's rule) found five things, each verified against the tree
before it was acted on:

1. **Sign-out against a push registration still in flight (security) — fixed.** Sign-out
   read only the device id already kept, so a `PUT` still out when Sign out was pressed —
   the tree's at sign-in or a cold start, Turn on's, a changed token's — was not waited
   for: no `DELETE`, and its answer then wrote the id after the keychain was cleared, the
   phone left registered to the person who had signed out, their pushes still arriving.
   `lib/platform/devices.ts` now tracks every registration in flight, each for its `PUT`
   and the write of its id (a set: the token listener registers outside the hook's single
   flight), and sign-out waits for them — `settleDeviceRegistration`, bounded at 5 s,
   never throwing — BEFORE it reads the id to send back; it then ends the epoch
   (`endDeviceEpoch`), and a registration started before that point that answers after
   it keeps no id. That late one cannot be unregistered — the `DELETE` needs the bearer
   the logout revokes — so the phone stays registered to the person who signed out until
   it registers again or the platform's prune: the accepted residual of backend §12.1
   #210, as for a session that ends without a sign-out (said in the code where it
   happens, too).
   `lib` still imports nothing from `hooks`; the hook's generation counter and its single
   flight between the tree and the card are unchanged.
2. **A token service failure read as "not on this build" (correctness) — fixed.**
   `register()` answered `no-build` for every `getExpoPushTokenAsync` failure, so a phone
   offline at Turn on, or Expo's token service failing, read "Notifications aren't
   available on this build." with no Turn on. The installed expo-notifications (0.32.17,
   `build/getExpoPushTokenAsync.js`) throws those two as `CodedError`s, by `code`:
   `ERR_NOTIFICATIONS_NETWORK_ERROR` (its fetch rejected) and
   `ERR_NOTIFICATIONS_SERVER_ERROR` (an answer not OK, or not the token's shape). Both
   are `failed` now — "Notifications couldn't be turned on. Try again." under the ask,
   with Turn on; every other failure is still `no-build`.
3. **The Billing page read through the snapshot (regression) — fixed.** D1 put
   `readBilling` through the shared snapshot's 120 s settled window for the Settings
   index's plan line, and with it the Billing page, which at `daef007` read afresh at
   every visit: a read made before Stripe's webhook landed kept the old plan on the page
   for up to two minutes after a checkout. The page reads `fresh` now — a real request at
   every visit, whose answer replaces the snapshot's — and the index's line keeps the
   snapshot, as D1 decided.
4. **The team label only under All teams (D4) — fixed.** Flows' cards and the archived
   rows (both copies) said "Team: {kind}" or "Whole workspace" only with the scope on All
   teams; D4 — "every flow card, archived row and flow page" — makes no such exception.
   They say it in every scope now; the flow page always did. One decided flip of pinned
   behaviour, named in its test: `scope-control` "narrows Flows to the chosen team, and
   keeps the choice" holds the label inside the team where it held its absence; row 7
   above and DESIGN-CONTRACT are corrected.
5. **"See teams" crosses tabs (records only) — not changed.** F84's "See teams" on Setup
   (`router.push('/(tabs)/settings/teams')`) is a push from the Flows tab straight into a
   Settings page, the first since the sixth session's row that said none was made (now
   annotated). Teams opens in the Settings stack, so Back from it goes back in that stack —
   to Settings' index, or whatever page that stack was left on — and never to Setup; with
   Settings not yet opened in this run of the app, the stack holds Teams alone and Back
   leaves it for Home, the first tab (expo-router puts the pushed page alone in a stack
   not yet mounted, and the tabs go back to their first route). That is the code's
   reading: **NOT OBSERVED** on a device. A plain member's path only — an owner or admin
   never sees "See teams". The follow-up, if wanted: a copy of Teams in the Flows stack,
   as Archived flows has a copy in the Settings stack — which needs the team page it
   opens copied too.

### Guards proved to bite, build 11

A hundred and fourteen breaks, each run against its own suite with the test's name as the filter —
the named test confirmed failed from jest's own record — and the file restored byte for
byte, its SHA-256 checked before and after. The thirty-four of device push (D8) were run by
one script, and the whole working tree's hashes were checked again after its last restore;
the twenty-three of F84 and of a tap's own workspace were run the same way by a second, which
also ran the D8 pass's five tap guards again against the reworked tap handler — each failed
its test again — and the working tree's hashes matched after its last restore. The three of
the ask on an empty inbox were run the same way by the main session, each file restored by
SHA-256. The fourteen of the single-pass review (the last rows) were run the same way by a
third script, which also ran six of the earlier guards again on the code the review
reworked — sign-out's four, the kept device id and "not available on this build" — each
failing its test again; every failure read was the assertion meant, and the working
tree's hashes matched after its last restore.
The three breaks of the repository's own presses are run against the gate, `audit:haptics`,
which names the broken file. Compact cards are a style no test reads, as the empty screens'
icon colour was in build 10, so no break was run for the card's height.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| Settings is the groups in the build's order, as drawn | the Notifications card moved above WORKSPACE | `tab-screens` "is the groups in the build's order, as drawn — the labels, the rows, the control — then Sign out and the version" |
| The appearance control is Auto, Dark, Light | Dark put first | `tab-screens` "switches the live theme from the control on the index — Auto, Dark, Light, in that order" |
| The index reads only the plan | a second read made beside it | `tab-screens` "reads only the plan, quietly: one billing read for an owner, said as the plan name under Billing; the email under Account" |
| A member's billing is never read | read for a member too | `tab-screens` "never reads billing for a member, whose line says who manages it" |
| The enrolled plan is one rule: canceled is the free floor | canceled no longer ending access | `tab-screens` "says Free on the free floor and for a subscription whose access has ended — the Billing page's own rule" |
| A hosted page opened drops the workspace's billing | the portal invalidating nothing | `snapshot-invalidation` "a checkout or the portal opened drops the workspace's billing, which is otherwise shared (build 11)" |
| The roomier row is the index's only | the roomy padding dropped from the row | `components` "is roomier only where the Settings index asks (build 11, D1)" |
| A failed Face ID enable is said under its row | the failure never drawn | `tab-screens` "says a failed Face ID enable right under its row, and keeps the page" |
| Archived flows opens in Settings' own stack | the row pushing the Flows tab's page | `tab-screens` "opens each page row on its page — Archived flows in Settings' own stack (the owner's build 9)" |
| The Face ID offer says "in Settings" | "Settings › Security" put back | `faceid-screen` "says where the setting is — Settings, since the Face ID row is on the index again (build 11, D1)" |
| Organization says "Switch to it in Settings" | "Settings › Workspace" put back | `organization-screen` "names where to switch to an organization — Settings, whose workspace row is on the index again (build 11, D1)" |
| The drawn Pro is inert | the drawn card acting like a listed one | `billing-screen` "draws Pro at $10.00 per month after Plus when the platform does not list it, and that card does nothing on iOS — not paying, it opens no checkout (build 11, D2)" |
| A listed Pro replaces the drawn one | the drawn card always appended | `billing-screen` "a Pro the platform lists replaces the drawn one: three cards, the listed price, a real checkout" |
| Nothing listed says so, the drawn Pro notwithstanding | the line keyed on the card count again | `billing-screen` "with nothing listed: Free and the drawn Pro, and the line that nothing can be bought right now" |
| A live twin has the same template AND the same scope: null matches null only | any scope matching | `flows-view` "is none for another template, another team's copy, or an archived row — null matches null only" |
| No Add it again with a live twin | Add it again drawn for every archived flow | `tab-screens` "offers no Add it again once the flow is live again in the same scope: it says so and opens the live flow (build 11, D3; the owner's build 10 items 5, 6 and 11)" |
| Open the live flow opens in the same stack | the Flows path used from Settings too | `tab-screens` "the Settings copy opens the live flow in the Settings stack, so Back returns to Settings" |
| Every flow says its team, or Whole workspace | the label gated on a team existing again | `tab-screens` "says Whole workspace where the workspace has no team at all (the owner's build 10 item 7)" |
| Nothing is sent without a team | the refusal removed | `tab-screens` "adds a flow to the team chosen — there is no whole-workspace choice, and nothing is sent until one is picked (D4)" |
| projectId is always sent | the team left out of the create | `tab-screens` "adds a flow to the team chosen — there is no whole-workspace choice, and nothing is sent until one is picked (D4)" |
| A plain member with no team is told who creates one, with no Activate | Create offered to everyone | `tab-screens` "with no team yet, a plain member is told an owner or admin creates the first one, and has no Activate" |
| A team made from Setup is the team chosen | the team made not chosen | `tab-screens` "with no team yet, an owner or admin creates one first — from Setup — and it is the team chosen (D4)" |
| Archived sits left of New | New put first | `tab-screens` "Flows offers Archived as a header button, left of New, which opens the page — no row on the page, under a no-match search either (build 11, D5)" |
| Flows is empty whatever is archived | the archived count put back in the condition | `tab-screens` "is the empty standard whatever is archived — Activity's format — with the way to the archived ones under Add a flow (the owner's build 10 items 8 and 9)" |
| The Archived flows button only when any exist | the button always drawn | `tab-screens` "offers no Archived flows button when nothing is archived" |
| A press ticks | the tick removed from the helper | `pressable` "ticks once, then calls the handler with its event" |
| No handler, no tick | a tick with no handler | `pressable` "gives no tick with no handler: a press that does nothing" |
| iOS only | the platform guard removed | `pressable` "is silent on Android, as the tab bar always was" |
| The signed-out cover is silent | the cover given its handler whatever the session | `cover-haptics` "gives no tick to a tap that does nothing — the signed-out cover — and one to Get started" |
| The tabs tick through the helper | react-native's Pressable put back in the tab bar | `tab-bar` "ticks on a tab press — the selection haptic, through the shared pressable now (build 11, D7)" |
| The avatar and the bell tick | react-native's Pressable put back on Home | `tab-screens` "ticks when the avatar, the bell or See all is tapped, then opens its page (the owner's build 10 item 10; D7)" |
| See all ticks | its Text handler unwrapped | `tab-screens` "ticks when the avatar, the bell or See all is tapped, then opens its page (the owner's build 10 item 10; D7)" |
| audit:haptics fails a Pressable from react-native | the import rule disabled | `audit-gates` "fails a press that bypasses the shared pressable, in each form it is written, and passes the helper and what uses it" |
| audit:haptics fails a host element's own onPress | the host-handler rule disabled | `audit-gates` "fails a press that bypasses the shared pressable, in each form it is written, and passes the helper and what uses it" |
| audit:haptics fails expo-haptics outside the helper | the haptics-import rule disabled | `audit-gates` "fails a press that bypasses the shared pressable, in each form it is written, and passes the helper and what uses it" |
| The repository's own presses go through the helper: ActionFailure's retry | its Text handler unwrapped | `npm run audit:haptics` — the gate itself, naming the file |
| The repository's own presses go through the helper: Mark all read | its Text handler unwrapped | `npm run audit:haptics` — the gate itself, naming the file |
| The repository's own presses go through the helper: NocToggle | react-native's Pressable put back in the toggle | `npm run audit:haptics` — the gate itself, naming the file |
| The Home mark fills its 38-pt row | the height put back to 17 | `tab-screens` "fills the 38-pt row on the dashboard, beside the bell and the avatar it leaves untouched" |
| The Home mark draws nothing but itself | a tile drawn behind it (`backgroundColor`) | `tab-screens` "fills the 38-pt row on the dashboard, beside the bell and the avatar it leaves untouched" |
| Nothing is asked or registered at launch | the tree asking iOS at sign-in (requestPermissionsAsync in place of the read) | `push-registration` "asks nothing and registers nothing at launch: signed in, the tree only reads what iOS already allows" |
| Turn on is where iOS asks | Turn on reading the permission instead of requesting it | `push-registration` "Turn on asks iOS at the tap, then registers this phone — PUT { platform, token, appBuild } — keeps only the device id, and the card goes" |
| The PUT is { platform, token, appBuild } | appBuild left out of the body | `push-registration` "Turn on asks iOS at the tap, then registers this phone — PUT { platform, token, appBuild } — keeps only the device id, and the card goes" |
| The device id is kept, beside the session | the answered id not written | `push-registration` "Turn on asks iOS at the tap, then registers this phone — PUT { platform, token, appBuild } — keeps only the device id, and the card goes" |
| Allowed already: one registration between the tree and the card | the tree registering outside the shared single flight | `push-registration` "already allowed: no card, and the signed-in tree and the card register once between them" |
| Off in iOS Settings is said, with Open Settings | a "no" on record read as askable | `push-registration` "off in iOS Settings: the card says so and opens Settings, and back with notifications on it registers and goes" |
| Open Settings opens iOS Settings | the button doing nothing | `push-registration` "off in iOS Settings: the card says so and opens Settings, and back with notifications on it registers and goes" |
| Back from iOS Settings, allowed: registered, no card | the return to the app not read again | `push-registration` "off in iOS Settings: the card says so and opens Settings, and back with notifications on it registers and goes" |
| "Not now" is kept for the session | the answer not written to the keychain | `push-registration` ""Not now" holds for the session: gone from both inboxes, still gone at the next launch, and nothing asked" |
| "Not now" holds at the next launch | the kept answer not read | `push-registration` ""Not now" holds for the session: gone from both inboxes, still gone at the next launch, and nothing asked" |
| Not now hides the ask | Not now not hiding the card | `tab-screens` "asks for notifications on this phone, asks iOS nothing until Turn on, and Not now hides the ask (build 11, D8; the owner's build 10 item 13)" |
| A simulator registers nothing, and is told why | the phone check (Device.isDevice) dropped | `push-registration` "Android and a simulator register nothing, and the card says why — with nothing to turn on" |
| Android registers nothing, and is told why | the iOS check dropped | `push-registration` "Android and a simulator register nothing, and the card says why — with nothing to turn on" |
| An older platform (404/503) is "not available yet" in words | 503 no longer read as not yet | `push-registration` "a platform from before the devices route — 404 or 503 — is "not available yet", in words, never a problem title" |
| No push token is "not available on this build" | a refused token read as a failed registration | `push-registration` "a build with no push token says so, and sends nothing" |
| Any other failure asks again, in words | every other failure read as not yet | `push-registration` "any other failed registration asks again, in words, and a second Turn on registers" |
| A changed token registers again | the listener ignoring every token | `push-registration` "registers again when the token changes — the first token heard is a registration’s own echo" |
| The first token heard is an echo, not a change | the baseline taken as a change | `push-registration` "registers again when the token changes — the first token heard is a registration’s own echo" |
| A run id from a push is an id | the run id pattern dropped | `push-registration` "a tap while the app runs opens what it names: a failed run’s page, or Activity for a held one" |
| One tap opens one screen | the tap not remembered | `push-registration` "a tap while the app runs opens what it names: a failed run’s page, or Activity for a held one" |
| A failed run opens its page in the Home stack | the run opened in the Settings stack | `push-registration` "a tap while the app runs opens what it names: a failed run’s page, or Activity for a held one" |
| The tap that opened the app opens its screen | the last response never read | `push-registration` "the tap that opened the app opens its screen once signed in, and not before" |
| …and not before the session is signed in | the signed-in gate dropped from the tap effect | `push-registration` "the tap that opened the app opens its screen once signed in, and not before" |
| The banner shows in the foreground | the banner turned off | `push-registration` "shows a push’s banner while the app is open, and only while someone is signed in" |
| …only while someone is signed in | the handler left in place at sign-out | `push-registration` "shows a push’s banner while the app is open, and only while someone is signed in" |
| Sign-out DELETEs the device BEFORE the logout | the DELETE moved after the logout | `sign-out` "sends DELETE for the device with the still-valid bearer BEFORE the logout, then clears it with the session" |
| A failed DELETE never blocks sign-out | the failure rethrown | `sign-out` "never lets a failed DELETE block the sign-out, and logs nothing about it" |
| A failed DELETE logs nothing | the failure logged | `sign-out` "never lets a failed DELETE block the sign-out, and logs nothing about it" |
| No registered device, no DELETE | a DELETE sent without a device id | `sign-out` "sends only the logout when this phone never registered" |
| The device id is this-device-only | the keychain option dropped | `session-store` "keeps push's device id and "Not now" this-device-only, beside the session (build 11, D8)" |
| The device id is cleared with the session | its key dropped from clearSession | `session-store` "sign-out clears the Face ID choice and "remember me" with the tokens" |
| "Not now" is cleared with the session | its key dropped from clearSession | `session-store` "sign-out clears the Face ID choice and "remember me" with the tokens" |
| aps-environment is the plugin's, never hand-written | aps-environment written into app.json | `app-config` "applies the expo-notifications plugin, which owns aps-environment — never hand-written (build 11, D8)" |
| The expo-notifications plugin is applied | the plugin removed from app.json | `app-config` "applies the expo-notifications plugin, which owns aps-environment — never hand-written (build 11, D8)" |
| A plain member on no team, where the organization has a team to ask onto, is told to ask to join one (F84) | the ask branch never taken | `tab-screens` "with no team yet, a plain member whose organization has a team to ask onto is told to ask to join one, with See teams — and has no Activate (F84)" |
| A team they have asked onto still counts (`requested`) | only access `none` counted | `tab-screens` "with no team yet, a plain member whose organization has a team to ask onto is told to ask to join one, with See teams — and has no Activate (F84)" |
| See teams opens Teams | See teams opening the Settings index | `tab-screens` "with no team yet, a plain member whose organization has a team to ask onto is told to ask to join one, with See teams — and has no Activate (F84)" |
| Asking to join has no Activate | Activate drawn for the ask line too | `tab-screens` "with no team yet, a plain member whose organization has a team to ask onto is told to ask to join one, with See teams — and has no Activate (F84)" |
| A team they can already see is not one to ask onto (`member`) | the access filter dropped | `tab-screens` "with no team yet, a plain member whose directory lists nothing to ask onto is still told an owner or admin creates the first one (F84)" |
| An owner's or admin's own line comes first | the ask line drawn before "Create a team first." | `tab-screens` "an owner or admin with no team is offered Create a team first, whatever the directory lists — their line comes first (F84)" |
| The directory is read only where there is no team to add to | the directory read whatever the teams | `tab-screens` "reads the directory only where there is no team to add to: with a team, the chips and no directory read (F84)" |
| No directory yet (404): Setup draws, with the owner-or-admin line | the shared helper's 404 tolerance dropped | `tab-screens` "a platform with no directory yet (404) leaves a plain member the owner-or-admin line, and Setup still draws (F84)" |
| Teams tolerates 404 through the shared helper | the shared helper's 404 tolerance dropped | `teams-screens` "lists the teams it is on when the platform has no directory yet, and offers nothing to ask for" |
| Any other failure of the directory is the screen's | every refusal read as an empty directory | `teams-screens` "reads the directory through the one helper Setup shares: a 404 is nothing to list, any other failure is the screen's (F84)" |
| Teams lists the directory through the shared helper | the helper answering nothing | `teams-screens` "lists the teams the person is on, by workspace and not a deleted one, and the ones they can ask to join" |
| A push from another of the person's workspaces switches to it | the named workspace never switched to | `push-registration` "switches to another of the person’s workspaces as the switcher does — the switch, then the session read — and opens the run there once that session is drawn" |
| Switched as the switcher does: the `workspace-activate` key | another key prefix | `push-registration` "switches to another of the person’s workspaces as the switcher does — the switch, then the session read — and opens the run there once that session is drawn" |
| The session is read after the switch, not before | the read moved before the switch | `push-registration` "switches to another of the person’s workspaces as the switcher does — the switch, then the session read — and opens the run there once that session is drawn" |
| A switched tap opens once the switched session is drawn | the target opened as soon as the read returned | `push-registration` "switches to another of the person’s workspaces as the switcher does — the switch, then the session read — and opens the run there once that session is drawn" |
| A held run from another workspace switches too, then opens Activity | the switch made for a failed run only | `push-registration` "switches the same way for a held run, then opens Activity" |
| The active workspace named: opened at once, no switch | the active-workspace check dropped | `push-registration` "opens at once, with no switch, when the push names the active workspace" |
| A workspace id from a push is a UUID | the shape check dropped | `push-registration` "opens in the active workspace, as before, when the push names none, one not theirs, or an id of another shape" |
| Only one of the person's own workspaces is switched to | the session's list not consulted | `push-registration` "opens in the active workspace, as before, when the push names none, one not theirs, or an id of another shape" |
| A refused switch opens nothing | the target opened where the person is when the switch fails | `push-registration` "opens nothing when the platform refuses the switch, or the session cannot be read again — the person stays where they are" |
| A failed session read opens nothing | the drawn session's workspace not checked before opening | `push-registration` "opens nothing when the platform refuses the switch, or the session cannot be read again — the person stays where they are" |
| One tap, one switch, one screen | the tap not remembered | `push-registration` "switches and opens once for one tap, though it is heard twice — as it arrives and as the tap that opened the app" |
| The tap that opened the app switches only once signed in | the signed-in gate dropped from the tap effect | `push-registration` "the tap that opened the app switches to its workspace once signed in, and not before" |
| The empty inbox asks too | the ask not passed to the empty standard | `push-registration` "asks above "Quiet, as designed" on both inboxes, and Turn on registers there — else push could not be turned on at all" |
| The ask is above the empty standard | the ask drawn below the centred block | `push-registration` "asks above "Quiet, as designed" on both inboxes, and Turn on registers there — else push could not be turned on at all" |
| Not now leaves the empty standard whole | the empty standard's sentence dropped under an ask | `push-registration` ""Not now" on an empty inbox takes the ask away and leaves the empty standard whole" |
| Sign-out waits for a registration in flight, then DELETEs the id it answers before the logout | the wait removed from `signOut` | `sign-out` "waits for a registration in flight when Sign out is pressed: the DELETE sends the id it answers, BEFORE the logout, then the keychain is cleared" |
| The wait sees every registration in flight | a registration not tracked while in flight | `sign-out` "waits for a registration in flight when Sign out is pressed: the DELETE sends the id it answers, BEFORE the logout, then the keychain is cleared" |
| The epoch ends after the wait, not before it | the epoch ended before the wait | `sign-out` "waits for a registration in flight when Sign out is pressed: the DELETE sends the id it answers, BEFORE the logout, then the keychain is cleared" |
| The wait is bounded: five seconds, then sign-out goes on | the timer removed, so the wait is unbounded | `sign-out` "goes on after five seconds without a registration that has not answered: the logout is sent, and when it answers later no device id is kept" |
| A registration that answers after the wait keeps no id | the epoch check removed from the registration | `sign-out` "goes on after five seconds without a registration that has not answered: the logout is sent, and when it answers later no device id is kept" |
| Sign-out ends the epoch | `endDeviceEpoch()` removed from `signOut` | `sign-out` "goes on after five seconds without a registration that has not answered: the logout is sent, and when it answers later no device id is kept" |
| A token service offline asks again, with Turn on | `ERR_NOTIFICATIONS_NETWORK_ERROR` dropped from the codes that ask again | `push-registration` "a token service that is offline or failing asks again, in words, with Turn on — never "not on this build" — and a second Turn on registers (the build 11 review)" |
| A token service failing asks again, with Turn on | `ERR_NOTIFICATIONS_SERVER_ERROR` dropped from the codes that ask again | `push-registration` "a token service that is offline or failing asks again, in words, with Turn on — never "not on this build" — and a second Turn on registers (the build 11 review)" |
| The Billing page reads afresh at every visit | the page's read without `fresh` — through the snapshot again | `billing-screen` "reads the workspace's billing afresh at every visit — twice inside the 120 s window is two GETs — while the Settings index's plan line reads once through the snapshot (the build 11 review)" |
| A fresh read is a real request | `fresh` ignored by `readBilling` | `billing-screen` "reads the workspace's billing afresh at every visit — twice inside the 120 s window is two GETs — while the Settings index's plan line reads once through the snapshot (the build 11 review)" |
| A fresh read's answer serves the Settings line | the page's answer not kept in the snapshot | `billing-screen` "reads the workspace's billing afresh at every visit — twice inside the 120 s window is two GETs — while the Settings index's plan line reads once through the snapshot (the build 11 review)" |
| The Settings index's plan line keeps the snapshot (D1) | the index line reading `fresh` too | `billing-screen` "reads the workspace's billing afresh at every visit — twice inside the 120 s window is two GETs — while the Settings index's plan line reads once through the snapshot (the build 11 review)" |
| Every card says its team inside a picked team too | the card's label gated on All teams again | `scope-control` "says the team on every card and every archived row inside a picked team too — D4 has no All-teams exception (the build 11 review)" |
| Every archived row says its team inside a picked team too | the archived row's label gated on All teams again | `scope-control` "says the team on every card and every archived row inside a picked team too — D4 has no All-teams exception (the build 11 review)" |

### The eighth signed-in session (build 12, 2026-10-03 15:39Z–16:05Z)

Build 12 on the owner's iPhone (iOS 26.6.2): nine TestFlight feedback items in
twenty-six minutes, read with their screenshots, then the owner's word the same day —
"Continue and complete these items" — every decision its recommended option and the
listed defaults. Verified against the code at `d77dd3a`; the platform and the website
are unchanged by this pass. Build 13 takes them in two parts: this first one is items
7, 2 and 3, 1 and 5 (the app's half), in that order; items 4, 6, 8 and 9 are the
second:

| # | Feedback | What it is | Disposition |
| --- | --- | --- | --- |
| 1 | "Why do i see 0 numbers for the runs if we have activities? Also i thought i said they should be buttons to see the actual numbers" | nothing was miscounted: Home counts today — `run-stats?since=<local midnight>` (backend §12.1 #73) — and the newest run on the screen was 18 days old, so 0 was right for today. But only the first tile of three said so ("Runs today" beside "Successes" and "Failures", the words a flow page uses for all time); the tiles had been buttons since 24.11.9 but were drawn as the design's static cards, with no caret and no pressed look, unlike the review banner beside them; and a tile opened Activity over every run, not the runs it counted. The earlier ask was the fifth session's row 11, half delivered | **fixed (build 13, option A)**: TODAY over the row, as RECENT RUNS heads its card, and the tiles read Runs, Successes, Failures; the read stays `run-stats?since=<local midnight>`. Every stat tile — Home's and a flow page's — draws a caret and, while pressed, the review banner's accent tint, around the frozen StatCard (`components/stat-tile-button.tsx`; StatCard's render and its snapshots unchanged). A Home tile opens Activity with its outcome AND today: "Today ✕" on a row of its own above the four outcome chips (the flow chip moved to that row too — a fifth chip beside the four ran off a phone's width), only today's runs while it is on, "No runs today." / "No successful runs today." / "No failed runs today." when there are none; the chip clears back to every run, and the tab bar changes nothing. Each Home tile's number is the rows it opens (All teams). Two edges stay, from the code: under a team, Home counts that team's live flows while Activity also keeps runs of flows it cannot place; and a day of more than 100 runs lists the newest 100 (the runs contract's page). **NOT OBSERVED** on a device |
| 2 | "Rather than free billow billing can we move the plan type name closer to the arrow on the right side" | where build 11 (D1) drew it: the plan's name was Billing's `sub`, and SettingsRow draws `sub` only under the title — the row grew 20 pt when the plan arrived; the values on the right ("organization", "owner") were the index's own text in `right`, which nothing kept from squeezing the title | **fixed (build 13, option A)**: SettingsRow has an optional `value`, on the title's line at its right end, before the arrow, in the index's value style (Inter regular, the scale's small step, neutral-500). Title and value share one wrapping line, so a value that does not fit moves under the title, as an iOS value cell stacks — never cut, never squeezing the title — and a row without one draws as before. Billing's plan is its value for an owner or admin (the row stays 57 pt), nothing while loading, on a refusal or offline; a member keeps "Managed by owners and admins" under the title. Still one request, the plan. **NOT OBSERVED** on a device |
| 3 | "Just like how owner is written in organization on the right hand side can we put the organization name. That way the user knows as well before clicking. " | the index never worked out an organization value, though the session it already reads holds every workspace's name and type; the row passed only the arrow | **fixed (build 13, option A)**: Organization's value, from the session alone — one pure rule, `organizationValue` (`lib/view/organization.ts`): in an organization, its name, for any role; in a personal workspace, the one organization's name, "{n} organizations" for several, "None" for none, and nothing when the session's list is cut off (`workspacesTruncated`) without one. No request: the index still reads only the plan. Shown inside an organization too, though the switcher row above names it. Under a cut-off list that does show organizations, the name or the count is of those the session lists (its first 50). **NOT OBSERVED** on a device |
| 4 | "Rather than add it again what if we say unarchive" | the platform cannot bring an archived subscription back: archiving is one-way on purpose (BUILD-PLAN 18.5.3, §12.1 #92 — a status change out of `archived` is 409, "subscribe again instead"), so both clients can only add a new subscription — a new id, empty settings, the newest version — while the archived row stays under Archived | **fixed (build 13, part 2 — the owner's decision of 2026-10-03: a rename, client-only)**: the archived flow's "Add it again" is "Unarchive" and does what it did — Setup for that flow, in the team it had, a fresh setup — so it still adds a new subscription and the archived row stays under Archived; the platform is unchanged and its archive stays one-way. Every line that said "add it again" says "unarchive": the page with no twin, "This flow was archived on {day}. Its runs stay in Activity, and you can unarchive it — its setup starts fresh."; Settings' Archived flows, "Kept with their history; unarchive any"; the archive confirmation, "…and you can unarchive it later."; the Archived list's note, "An archived flow keeps its history here. Unarchive it any time.", and its empty line, "A flow you archive keeps its history here, and you can unarchive it." With a live twin, D3 as it was — "It has been added again, and the new copy is in Flows." and "Open the live flow", no Unarchive — the twin now in any team (item 9). The website's words are `snoopy`'s. **NOT OBSERVED** on a device |
| 5 | "Could delete account be in red. Things like remove, sign out, stop, and such should be in red right" | PillButton had no red style (primary, secondary, plain, accent-ghost), so Delete Account was drawn `secondary` (`account.tsx:184`), as were Delete team / Leave team and Cancel run, while the buttons confirming them were red; red existed only where drawn by hand (Sign out, Archive flow) and in DialogButton's `danger`; and it was one value, #f87171, for both themes — 2.77:1 on a white card | **fixed (build 13, option A — the app's half)**: one rule — red marks an action that removes or ends something and cannot be undone with a tap. `palette.danger`, dark #f87171 (`status.err`, unchanged), light #dc2626 (the website's light `--error-text`, 4.83:1 on a card); PillButton's `danger` variant, the design's red pill (Screen.dc.html:450) — a 1-pt outline, label and icon in red, a tenth-strength tint pressed — on Delete Account, Delete team / Leave team and Cancel run; Unlink's text, Sign out, Archive flow and every DialogButton `danger` read `palette.danger` (dark as before). Withdraw's confirm is accent: asking again undoes it. Pause, Reject, Deny, Cancel request and Make a new secret are as they were. The four existing PillButton variants and the default render did not move; nocturne-visual gained `PillButton/danger` in both palettes, two snapshots added and the 64 byte-identical. In light, #dc2626 is 4.44:1 on the bare page background, where Cancel run, Delete/Leave team and Archive flow sit — a hair under 4.5:1, as the website's is. The website's half — the same list in `snoopy`, on its existing `danger` variant and `--error-text` — is that repository's. **NOT OBSERVED** on a device |
| 6 | "Sign out was clicked and it hung on this screen untill i closed the app then it took me to get started. Sign out should sign out the user and take them to the get started page." | the sign-out worked and the move to the cover did not. The proxies' logs show build 12's four logouts (15:52:47Z–16:01:55Z) each answered `204` in 0.18–0.31 s, and the app sent nothing more until a session read with no bearer — a relaunch. `"/"` named two screens, the cover (`app/index.tsx`) and Home (`app/(tabs)/(home)/index.tsx`): a group adds nothing to an address, and expo-router reads one from where the person is and prefers a screen in the same group, so from inside the tabs `"/"` meant Home. Settings' `router.replace('/')` became a replace sent to the tab bar, which cannot take one — dropped without a word in a release build — and once the session read signed out, the tab layout's `<Redirect href="/" />` replaced the tabs with a copy of themselves, which redirected again, without end. The keychain was already empty, so the next launch opened on the cover: what the owner saw. The same loop met a session that ended mid-use, and Delete account's "Sign in again" sent the same dropped `"/"`. Since `bda1136` (24.11.6, build 8's code), unchanged through build 12; unseen because the tests used a mocked router (`test/mocks/expo-router.tsx`), which records an href and runs no navigator | **fixed (build 13, option A; decision 2 yes)**: the root stack guards the tabs — `<Stack.Protected guard={session.status === 'signed-in'}>`, expo-router 6.0.24's protected routes, in `app/_layout.tsx` — and in any other state removes them and lands on its anchor, the cover, by name. The tab layout draws nothing until signed in and redirects nowhere; Settings' Sign out only signs out (a 502 still stays and says `SIGN_OUT_FAILED`); Delete account's "Sign in again" signs this phone out through the session (one not revoked keeps the dialog and says `SIGN_OUT_FAILED`, and the button tries again). No `router.replace('/')` or `href="/"` is left under `app/(tabs)/`; the Face ID lock and Account deleted, in `(auth)`, still leave for `"/"`, which from there is the cover. A second jest project runs the real expo-router (below): Sign out, an ended session, the owner's loop twice, a 502, Sign in again, a deleted account, the lock's fallback and the guard failing closed — each fails on `d77dd3a` but the 502's and the deleted account's, paths that were right there and are kept. **NOT OBSERVED** on a device |
| 7 | "I clicked use identity provider when face id failed and it kept bringing up face id. It should allow the user to log back in using their account right" | "Use identity provider" (`faceid.tsx:151`) only replaced to `/`, which for a person still signed in is the splash — and the splash, the Face ID choice still on, replaced itself with the lock 2400 ms later: Face ID again, in a loop. `bda1136` (24.11.6, build 8's batch) applied "every route that left for Sign in leaves for the cover" (the fifth session's row 1) to a screen where the person is still signed in; build 7 had sent it to Sign in. It shipped in builds 9–12, unseen: no test returned a failed Face ID or pressed the fallback, and no session recorded one | **fixed (build 13, option A)**: the fallback is Settings › Sign out's. With a signed-in session it awaits `signOut()` and replaces to the cover only on `revoked: true` — this phone's session revoked (the web's stays), its push registration let go, the tokens and the Face ID choice cleared, so the next sign-in asks the Face ID question again; on `revoked: false` the lock stays and says `SIGN_OUT_FAILED`, nothing cleared, and the button tries again; with no signed-in session to unlock (an outage, nothing stored) it goes to the cover without a sign-out, as before. **NOT OBSERVED** on the phone: Face ID on, relaunch, cancel Face ID, Use identity provider — the cover, Get started, Sign in, the Face ID question, Home |
| 8 | "Lets say i link microsoft and apple then log out the app. If i log back in will it let me use apple? " | a question, not a defect, and the page did not answer it. Yes: a linked account signs in to this same account — one Supabase user, matched by the provider's own id for the person, not by email, so the same Access user, workspaces, teams and flows, in the app and on the website. The lead spoke of "sign-in options" and credentials; only the Unlink confirmation said a linked account signs in; nothing warned that a first sign-in with a provider not yet linked can start a separate account | **answered; fixed (build 13, option A — the app's half)**: the lead's first sentence is "Any account linked here signs you in to this same account, in the app and on the website. Link an account before you first sign in with it."; the credentials sentence stays. The website's half, the same sentence, is `snoopy`'s. **NOT OBSERVED**: the fact-finding asked for it to ship after the owner's Apple sign-in is seen (link Microsoft and Apple, sign out, sign in with Apple, the same account) — not yet run, and Apple has never completed a sign-in in production |
| 9 | "Why do i have two of the same automations across teams. Teams cannot have the same flows. One flow per account type. Personal or org not multiple of the same in account type. This is a bug" | build 11 (D4) adds every flow to a team, and the platform's uniqueness — the one `addedAgainAs` reads — is one non-archived subscription per workspace, template and team, so one workspace can hold the same flow once in each of its teams (the seventh session's rows 5, 6, 11 and 7) | **fixed (build 13, part 2 — client-only; the platform's own guard is a later follow-up)**: a workspace holds a flow once — Personal is one workspace, each organization one — and a flow is held while any subscription of its template that is not archived exists there, in any team or the whole workspace (`heldAs`, `lib/view/catalog.ts`). Add: a held flow reads "Added ✓" with where it is, "Team: {kind}" or "Whole workspace", and the card opens it, whatever the scope control shows — no Add and no "Added in …". Setup: for a held flow, "Added to" and its team, no team choice, and Activate configures that subscription — nothing is created; a flow not held keeps D4's team chips. D3's live twin is the same template in any team, so an archived flow whose template the workspace holds in another team shows the twin's sentence and "Open the live flow", no Unarchive. Existing duplicates stay, listed — production's one pair is the owner's two Invoice checks in Personal — and Add names both places and opens the first the platform lists (its newest). Until the platform's guard lands it still accepts one copy per team (18.6.2), so a second copy can still come from the API, from build 12, from the website (its Add offers each team the flow is not in, F21), or from a plain member who cannot see the team holding it: the list they read holds only the teams they can see (`snoopy-backend` `apps/catalog/src/postgres-subscriptions.ts:601-609` @765ef5c). **NOT OBSERVED** on a device |

Decided flips of pinned behaviour, each named in its test: `run-stats` "draws total,
succeeded and failed — the three §12.1 #73b names" holds "Runs" where it held "Runs
today"; `tab-screens` "a Home stat tile opens Activity for that outcome" holds the push
with `period: 'today'`; and the Settings test that held the plan as a line under
Billing is `tab-screens` "reads only the plan, quietly: one billing read for an owner,
shown as Billing's value on its right; the email under Account" — the build 11 guard
"The index reads only the plan" names it by its old title. Not in this part, and why:
items 4, 6, 8 and 9 (part 2); the website's half of item 5 (`snoopy`); and the
platform's records the fact-finding names — a BUILD-PLAN item and a §12.1 row for item
7, BUILD-PLAN lines for items 1 and 5 — which are `snoopy-backend`'s, read-only from a
mobile session.

Part 2's items 4 and 9, on the owner's decisions of 2026-10-03 — no platform change in
this build — flipped these pinned behaviours, each named in its test: `tab-screens`
"names where a flow is held — Added ✓ with its team, the card opens it — and offers no
Add for another team (…)", until now "says where a flow is already added, and offers Add
for the scope it is not in yet (18.6.2)"; `tab-screens` "offers no Unarchive when the
live copy is another team's: that copy is the twin, and it opens (…)", until now "still
offers Add it again when the live copy is another team's: the whole workspace matches the
whole workspace only"; and `flows-view` "is none for another template or an archived row
— another team's copy IS the twin (…)", until now "is none for another template, another
team's copy, or an archived row — null matches null only", the test the build 11 guard "A
live twin has the same template AND the same scope" names: item 9 reverses that guard.
Five tests that held the words "add it again" hold "unarchive", each title naming item 4;
earlier guard rows name them by their old titles (24.9's "Remove flow archives", build
10's two "Archive wording" rows and "Archived flows with none is the empty standard",
build 11's "No Add it again with a live twin"). Not in this part, and why: a real
unarchive that brings the same row back, paused, with its settings and runs (the
fact-finding's option b), and the platform's one-per-workspace guard with a refusal the
app would put in words — the platform's, later; the website's half of both items
(`snoopy` at 24f737d: its Archived note and archive confirmation say "add it again", and
its Add offers each team a flow is not in); and `CLAUDE.md`'s `addedAgainAs` line,
which still says "the same template in the same scope" and "no "Add it again"" — not
edited by this session.

### Guards proved to bite, build 13

Forty-six breaks, each run against its own suite with the test's name as the filter —
the named test confirmed failed from jest's own record — and the file restored byte for
byte, its SHA-256 checked before and after, by one script; the working tree's hashes
matched after its last restore. The first three rows are item 7's tests run against the
lock as it is at `d77dd3a`: each fails there. The fourth Face ID test, "with no
signed-in session to unlock, the fallback goes to the cover without signing out", passes
there, as it should — it pins the outage path the fix keeps, the cover with no sign-out —
and bites instead on the break that signs out without a session (its row below). One
guard did not bite at first: with the name kept from a member, the member's case still
read "Acme Operations", because its session listed no other organization and the
Personal rule found the same one; the case now lists a second organization, and that
break and the no-request one were run again against it, each failing its test. The look
of a tile — the caret's place, the tint's strength — the row heights, and the lock's
message centred inside the screen's side margin (for `SIGN_OUT_FAILED`, a long sentence)
are styles no test reads, so no break was run for them.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| The fallback signs out, and only then leaves | `faceid.tsx` as it is at `d77dd3a` (builds 11 and 12) | `faceid-screen` "a failed Face ID, then Use identity provider, signs this phone out and only then leaves for the cover" |
| A sign-out not revoked keeps the lock | `faceid.tsx` as it is at `d77dd3a` (builds 11 and 12) | `faceid-screen` "a sign-out that could not be revoked keeps the lock and says so; the button tries again" |
| Face ID not available signs out too | `faceid.tsx` as it is at `d77dd3a` (builds 11 and 12) | `faceid-screen` "when Face ID is not available, the fallback signs out too" |
| The fallback signs this phone out | the sign-out skipped (taken as revoked) | `faceid-screen` "a failed Face ID, then Use identity provider, signs this phone out and only then leaves for the cover" |
| It leaves only once the sign-out has answered | the cover replaced to before the sign-out is awaited | `faceid-screen` "a failed Face ID, then Use identity provider, signs this phone out and only then leaves for the cover" |
| It leaves only on revoked: true | the revoked: false branch removed | `faceid-screen` "a sign-out that could not be revoked keeps the lock and says so; the button tries again" |
| A sign-out not revoked is said in SIGN_OUT_FAILED | the lock saying "did not unlock" again instead | `faceid-screen` "a sign-out that could not be revoked keeps the lock and says so; the button tries again" |
| Keyed on the session, not the message | the sign-out keyed on the "did not unlock" message | `faceid-screen` "when Face ID is not available, the fallback signs out too" |
| No signed-in session: no sign-out | the session check removed (always sign out) | `faceid-screen` "with no signed-in session to unlock, the fallback goes to the cover without signing out" |
| SettingsRow: title and value share one wrapping line | flexWrap removed from the title line | `components` "draws a value on the title's line, before the arrow, and lets it move under the title rather than squeeze it" |
| Billing's plan is its value, not a line under it | the plan put back as sub | `tab-screens` "reads only the plan, quietly: one billing read for an owner, shown as Billing's value on its right; the email under Account" |
| A member's line stays under the title | the member's line moved into the value | `tab-screens` "never reads billing for a member, whose line says who manages it" |
| The organization's name is the session's: no request | the value read with readWorkspaces() beside the plan | `tab-screens` "names the active organization on the Organization row, for an owner and for a member, with no request" |
| The active organization by name, for any role | the name kept from a member | `tab-screens` "names the active organization on the Organization row, for an owner and for a member, with no request" |
| Cut off with no organization shown: nothing, not None | the cut-off check removed | `tab-screens` "in a personal workspace, names the organization the session lists: one by name, several as a count, none as None, and nothing when the list is cut off without one" |
| Cut off with no organization shown: nothing, not None (the rule) | the cut-off check removed | `view-mapping` "says nothing when the list is cut off and shows no organization — one may lie past the cut" |
| Several organizations are a count | the count dropped | `view-mapping` "from a personal workspace, counts several" |
| TODAY sits over the tiles | the TODAY label removed | `tab-screens` "says its window once, over the row: TODAY, then Runs, Successes, Failures — the greeting as it was" |
| The first tile reads Runs | "Runs today" put back | `run-stats` "draws total, succeeded and failed — the three §12.1 #73b names" |
| Every stat tile draws a caret | the caret removed from the tile button | `tab-screens` "every stat tile looks like the button it is, on Home and on a flow page: a caret on each, and the tint while pressed" |
| A pressed tile draws the tint | the tint never drawn | `tab-screens` "every stat tile looks like the button it is, on Home and on a flow page: a caret on each, and the tint while pressed" |
| A Home tile opens today | the period removed from the push | `tab-screens` "each Home tile's number is the rows it opens: today's runs by outcome, the older ones left out (All teams)" |
| A Home tile opens today (the push) | the period removed from the push | `tab-screens` "a Home stat tile opens Activity for that outcome" |
| Today lists no earlier run | EARLIER drawn under Today | `tab-screens` "each Home tile's number is the rows it opens: today's runs by outcome, the older ones left out (All teams)" |
| Today lists no yesterday's run | YESTERDAY drawn under Today | `tab-screens` "Activity arriving with today and Failed lists only today's failed runs; Today ✕ sits on its own row above the outcomes, and clears back to every run" |
| Today ✕ is on its own row, above the outcomes | the Today chip put back in the outcome row | `tab-screens` "Activity arriving with today and Failed lists only today's failed runs; Today ✕ sits on its own row above the outcomes, and clears back to every run" |
| Today ✕ clears back to every run | the chip's press doing nothing | `tab-screens` "Activity arriving with today and Failed lists only today's failed runs; Today ✕ sits on its own row above the outcomes, and clears back to every run" |
| The flow chip is on the selection row too | the flow chip put back in the outcome row | `tab-screens` "a flow page's chip sits on the same row, above the outcomes, and its tiles bring no day: they count all time" |
| An empty Today says the day | " today" dropped from the empty line | `tab-screens` "with no run today but older ones, each tile's list says so: No runs today. / No successful runs today. / No failed runs today." |
| The tab bar changes nothing | the param-less arrival's early return removed | `tab-screens` "opening Activity from the tab bar after a tile visit leaves Today as it was" |
| A flow page's tiles bring no day: they count all time | today added to a flow tile's push | `tab-screens` "a flow page's three tiles open Activity for this flow and that outcome" |
| Light's red reads at AA on its surface | light set back to #f87171 | `theme` "reads at 4.5:1 or more on its own palette's surface, where the design's red on white does not" |
| Dark's red is the design's, status.err | dark given another red | `theme` "is the design's red in dark — status.err itself — and the website's light red in light" |
| PillButton danger: label and icon in palette.danger | the danger label drawn in the text colour | `components` "draws the danger variant in the theme's red — label, icon and a 1-pt outline — and tints it a tenth while pressed (dark)" |
| PillButton danger: a 1-pt outline in palette.danger | the outline dropped | `components` "draws the danger variant in the theme's red — label, icon and a 1-pt outline — and tints it a tenth while pressed (light)" |
| PillButton danger: a tenth-strength tint while pressed | the pressed tint at 7% | `components` "draws the danger variant in the theme's red — label, icon and a 1-pt outline — and tints it a tenth while pressed (dark)" |
| DialogButton danger reads palette.danger | status.err put back | `components` "draws a danger button — what cannot be undone — in the theme's red (light)" |
| Delete Account is the red pill | variant="secondary" put back | `account-screen` "draws Delete Account, Unlink and Unlink's confirm in the theme's red (the owner's build 12 item 5; dark)" |
| Unlink's text is red | neutral-400 put back | `account-screen` "draws Delete Account, Unlink and Unlink's confirm in the theme's red (the owner's build 12 item 5; dark)" |
| Delete team / Leave team are the red pill | variant="secondary" put back | `teams-screens` "draws Delete team for its owner and Leave team for a member in red, as their confirms are (the owner's build 12 item 5)" |
| Cancel run is the red pill | variant="secondary" put back | `tab-screens` "draws Cancel run in red and View flow as it was (the owner's build 12 item 5: "stop")" |
| Sign out reads palette.danger | the design's fixed red put back on the label | `tab-screens` "says Sign out in the theme's red — light, #dc2626 (the owner's build 12 item 5)" |
| Archive flow reads palette.danger | the design's fixed red put back on the label | `automation-actions` "draws Archive flow and its confirm in the theme's red (light)" |
| Withdraw's confirm is accent, not red | tone="accent" removed (red by default) | `teams-screens` "asks to join a team and reads the directory again; withdraws a request it made" |
| Pause stays plain | Pause drawn as the red pill | `tab-screens` "keeps Pause plain — Resume undoes it in one tap — while Archive flow, last, is red (the owner's build 12 item 5)" |
| Reject stays plain | Reject drawn in red | `tab-screens` "approves and rejects independently, matching the design done-states" |

### Build 13, part 2: items 6 and 8, and a tile pressed again

Items 6 and 8 as their rows above say, and one finding of the first part. Items 4 and 9
wait on the platform (the unarchive route and one flow per workspace, `snoopy-backend`).

**A tile pressed again** (found in the first part, fixed in this one): Activity applied a
tile's selection only when the route's params changed, and the same tile sends the same
params to the same mounted screen — clear "Today ✕", go back, press the same Home tile,
and Activity stayed as it was left. A flow page's tile did the same with its flow since
24.11.9: `d77dd3a` fails that test at the second press. Activity now takes a selection
once and clears it from its own route — `navigation.setParams`, on the screen's own
navigation object; `router.setParams` goes to the focused route, which on the first
arrival is still the tab, and left the params in place — so every press is a change,
from any tile, and the tab bar still changes nothing. **NOT OBSERVED** on a device.

**The real-router project.** `package.json` runs two jest projects, and `npm test` — so
`npm run verify` and CI's Test job — runs both: `unit`, which keeps
`test/mocks/expo-router.tsx`, and `real-router` (`__tests__/real-router/`; its fakes in
`test/real-router-setup.ts`, its harness in `test/real-router.tsx`), which runs the
app's own tree under expo-router 6.0.24 with only the transport, the keychain and the
provider's browser leg faked. Ported from the fact-finding's reproduction, with its
harness rules: await the render and every press (overlapping act scopes gave false
failures); a press runs as development, where a command no navigator handles is logged —
a release build drops it, a test build throws; a redirect loop is cut off after a dozen
replaces. Its thirteen tests, run on `d77dd3a`'s tree (`git archive d77dd3a`, with the
project's tests, harness and config copied in): every sign-out test fails there but two,
which pass, as they should — the 502's and the deleted account's (Account deleted sits
in `(auth)`, where "/" was always the cover): those paths were right and are kept; the
Face ID test fails there too, since `d77dd3a`'s fallback never signed out (item 7, fixed
in part 1); the Home-tile and tab-bar tests fail there at their first press, before a
Home tile carried today:

| Test | On `d77dd3a` |
| --- | --- |
| real-router `sign-out` "Settings › Sign out: one logout, the keychain empty, and the cover at "/" with Get started — no command dropped, no loop" | failed |
| real-router `sign-out` "a session that ends inside the tabs — a 401 the refresh cannot recover — reaches the cover" | failed |
| real-router `sign-out` "the owner's loop, twice: the cover, Get started, Sign in with Google, Home, Settings, Sign out, the cover" | failed |
| real-router `sign-out` "a logout that answers 502 keeps the session: Settings stays and says so, with Retry sign out, and nothing navigates" | passed |
| real-router `sign-out` "Delete account's Sign in again, after an attempt the session's end stopped, signs out and reaches the cover" | failed |
| real-router `sign-out` "a deleted account: Account deleted, signed out, and its Continue reaches the cover" | passed |
| real-router `sign-out` "Use identity provider with a signed-in session signs out to the cover, and signing in again asks Face ID's question" | failed |
| real-router `sign-out` "signed out (the session read answers 401): a tab address opens the cover, never the tab" | failed |
| real-router `sign-out` "no backend configured: a tab address opens the cover, never the tab" | failed |
| real-router `sign-out` "the platform unreachable: a tab address opens the cover, never the tab" | failed |
| real-router `activity-selection` "the same Home tile pressed again, after its selection was cleared on Activity, opens Activity with it again" | failed |
| real-router `activity-selection` "the same flow page tile pressed again, after its flow was cleared on Activity, opens Activity with it again" | failed |
| real-router `activity-selection` "the tab bar changes nothing: after a tile visit and a clear, Activity opens from its tab as it was left" | failed |

Decided flips of pinned behaviour, part 2, each named in its test — eleven mocked tests
waited on `router.replace('/')` or `mockRedirect('/')`, which the fact-finding counted
as ten (it did not run `tab-screens`): `sign-out` "leaves for the cover only when the
session was actually revoked (24.11.6)" is "signs out and leaves the cover to the root
guard: Settings navigates nowhere (24.11.6; the owner's build 12 item 6)", and its six
other cases keep their names and wait on the sign-out's own answer and the keychain,
every device-unregister, settle, epoch and no-log assertion kept; `auth-boundary`'s
three redirect cases are "draws nothing for a signed-out visitor, and redirects nowhere:
the root guard shows the cover (24.11.6; the owner's build 12 item 6)", "fails closed
when no backend is configured: nothing drawn, no redirect" and "does not expose
protected routes while the backend is unreachable: nothing drawn, no redirect" — where a
closed guard lands is the real-router project's "the root guard fails closed"; and
`tab-screens` "signs out to the cover (24.11.6)" is "signs out, and the root guard — not
Settings — shows the cover (24.11.6; the owner's build 12 item 6)". The router mock
gained `useNavigation` and a record of a drawn tab navigator (`mockTabsDrawn`). The 80
snapshots are byte-identical.

### Guards proved to bite, build 13, part 2

Twenty-eight runs by one script, each against its own suite with the test's name as the
filter — the test's status read from jest's own record — and the file restored byte for
byte, its SHA-256 checked before and after; the working tree's hashes matched after its
last restore. Twenty-six breaks failed their test. The three rows against `6850589` put
back part 1's Activity whole: the two re-apply tests fail there, and the tab-bar test
passes, as it should — the tab bar changed nothing then either. One break did not bite:
the tab layout's `<Redirect href="/" />` put back left the real router's ended-session
test passing — under the root guard the tabs are gone before their layout draws signed
out — so the unit project's two tab-layout tests hold that line.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| The root guard takes the tabs away when signed out | the guard always open (`guard={true}`) | real-router `sign-out` "Settings › Sign out: one logout, the keychain empty, and the cover at "/" with Get started — no command dropped, no loop" |
| An ended session lands on the cover | the guard always open (`guard={true}`) | real-router `sign-out` "a session that ends inside the tabs — a 401 the refresh cannot recover — reaches the cover" |
| Sign in again lands on the cover | the guard always open (`guard={true}`) | real-router `sign-out` "Delete account's Sign in again, after an attempt the session's end stopped, signs out and reaches the cover" |
| Signed out at launch, a tab address opens the cover | the guard always open (`guard={true}`) | real-router `sign-out` "signed out (the session read answers 401): a tab address opens the cover, never the tab" |
| Only signed-in passes: unconfigured fails closed | the guard open for anything but signed out (`status !== 'signed-out'`) | real-router `sign-out` "no backend configured: a tab address opens the cover, never the tab" |
| Only signed-in passes: unreachable fails closed | the guard open for anything but signed out (`status !== 'signed-out'`) | real-router `sign-out` "the platform unreachable: a tab address opens the cover, never the tab" |
| Signing in still reaches Home under the guard | the guard always shut (`guard={false}`) | real-router `sign-out` "the owner's loop, twice: the cover, Get started, Sign in with Google, Home, Settings, Sign out, the cover" |
| Settings navigates nowhere after a sign-out | Settings' `router.replace('/')` put back after a revoked sign-out | `sign-out` "signs out and leaves the cover to the root guard: Settings navigates nowhere (24.11.6; the owner's build 12 item 6)" |
| Settings navigates nowhere after a sign-out (tab-screens) | Settings' `router.replace('/')` put back after a revoked sign-out | `tab-screens` "signs out, and the root guard — not Settings — shows the cover (24.11.6; the owner's build 12 item 6)" |
| Settings navigates nowhere after a sign-out (real router) | Settings' `router.replace('/')` put back after a revoked sign-out | real-router `sign-out` "Settings › Sign out: one logout, the keychain empty, and the cover at "/" with Get started — no command dropped, no loop" |
| The tab layout draws nothing and redirects nowhere when signed out | the tab layout's `<Redirect href="/" />` put back | `auth-boundary` "draws nothing for a signed-out visitor, and redirects nowhere: the root guard shows the cover (24.11.6; the owner's build 12 item 6)" |
| The tab layout draws nothing and redirects nowhere when unconfigured | the tab layout's `<Redirect href="/" />` put back | `auth-boundary` "fails closed when no backend is configured: nothing drawn, no redirect" |
| The tab layout redirects nowhere (real router) | the tab layout's `<Redirect href="/" />` put back | none — real-router `sign-out` "a session that ends inside the tabs — a 401 the refresh cannot recover — reaches the cover" passed |
| Sign in again signs out through the session | the sign-out skipped (taken as revoked) | real-router `sign-out` "Delete account's Sign in again, after an attempt the session's end stopped, signs out and reaches the cover" |
| Sign in again: a sign-out not revoked keeps the dialog and says so | the `revoked: false` branch removed | `account-screen` "Sign in again signs this phone out through the session and navigates nowhere; a sign-out not revoked keeps the dialog and says so, and the button tries again (the owner's build 12 item 6)" |
| A deleted account still reaches Account deleted, then the cover | the replace to Account deleted removed (the guard alone moves the person) | real-router `sign-out` "a deleted account: Account deleted, signed out, and its Continue reaches the cover" |
| A sign-out not revoked keeps the session, so the guard keeps the tabs | the provider's sign-out signing out on any answer | real-router `sign-out` "a logout that answers 502 keeps the session: Settings stays and says so, with Retry sign out, and nothing navigates" |
| A 502 is said on Settings | the failure never said (`setSignOutFailed(false)`) | real-router `sign-out` "a logout that answers 502 keeps the session: Settings stays and says so, with Retry sign out, and nothing navigates" |
| A 502 is said on Settings (unit) | the failure never said (`setSignOutFailed(false)`) | `sign-out` "stays put and says so when revocation failed (502)" |
| The Face ID lock leaves for the cover itself | the lock's replace to the cover after a revoked sign-out removed | real-router `sign-out` "Use identity provider with a signed-in session signs out to the cover, and signing in again asks Face ID's question" |
| Linked accounts' lead says what linking does, and to link first | the old lead put back | `account-screen` "says what a linked account does, and to link one before its first sign-in, over the list; the credentials sentence stays (the owner's build 12 item 8)" |
| The same Home tile pressed again re-applies | `activity/index.tsx` as it is at `6850589` (part 1) | real-router `activity-selection` "the same Home tile pressed again, after its selection was cleared on Activity, opens Activity with it again" |
| The same flow page tile pressed again re-applies | `activity/index.tsx` as it is at `6850589` (part 1) | real-router `activity-selection` "the same flow page tile pressed again, after its flow was cleared on Activity, opens Activity with it again" |
| The tab bar changes nothing (kept) | `activity/index.tsx` as it is at `6850589` (part 1) | none — real-router `activity-selection` "the tab bar changes nothing: after a tile visit and a clear, Activity opens from its tab as it was left" passed |
| A selection is taken once and cleared from the route | the clearing `navigation.setParams` removed | real-router `activity-selection` "the same Home tile pressed again, after its selection was cleared on Activity, opens Activity with it again" |
| A selection is taken once and cleared from the route (flow page) | the clearing `navigation.setParams` removed | real-router `activity-selection` "the same flow page tile pressed again, after its flow was cleared on Activity, opens Activity with it again" |
| Cleared through the screen's own navigation | `router.setParams` (the focused route) in its place | real-router `activity-selection` "the same Home tile pressed again, after its selection was cleared on Activity, opens Activity with it again" |
| The tab bar re-sends its tab's params as they are | the tab bar sending a copy of the tab's params | real-router `activity-selection` "the tab bar changes nothing: after a tile visit and a clear, Activity opens from its tab as it was left" |

Part 2 (items 4 and 9): twenty-two breaks, run the same way by their own script — each
against its own suite with the test's name as the filter, the named test the one test
the filter ran, confirmed failed from jest's own record, and the file restored byte for
byte, its SHA-256 checked before and after; the working tree's hashes matched after the
last restore. A break listed twice bit both tests. The Setup line's look — "Added to" over
the team — is a style no test reads, so no break was run for it.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| The archived page's button says Unarchive | "Add it again" put back as its label | `build13-unarchive-and-one-flow` "an archived flow with no live copy says it can be unarchived, and Unarchive opens Setup for that flow in the team it had — a fresh setup; the page sends nothing" |
| The archived page's button says Unarchive (the flipped test) | "Add it again" put back as its label | `tab-screens` "an archived flow's page opens instead of "Couldn't load": no actions, its history, and Unarchive where no live twin exists — Add it again renamed, still Setup for its flow (the owner's build 12 item 4)" |
| The sentence with no twin says unarchive | its "add it again" put back | `build13-unarchive-and-one-flow` "an archived flow with no live copy says it can be unarchived, and Unarchive opens Setup for that flow in the team it had — a fresh setup; the page sends nothing" |
| Unarchive opens Setup in the team it had, as Add it again did | the team dropped from the push | `build13-unarchive-and-one-flow` "an archived flow with no live copy says it can be unarchived, and Unarchive opens Setup for that flow in the team it had — a fresh setup; the page sends nothing" |
| Settings' Archived flows line says unarchive | "add any again" put back | `build13-unarchive-and-one-flow` "Settings › Archived flows says they are kept with their history and any can be unarchived" |
| The archive confirmation says unarchive | "add it again later" put back | `automation-actions` "is reached only through its one-way confirmation, which says it can be unarchived later (the owner's build 12 item 4)" |
| The archive confirmation says unarchive (the flow page) | "add it again later" put back | `tab-screens` "returns to the Flows list after Archive, however the flow was reached — the confirmation saying it can be unarchived later (the owner's build 12 item 4)" |
| The Archived list's note says unarchive | "Add it again any time." put back | `tab-screens` "the Archived page lists them, read-only, and is the empty standard when there are none — each saying unarchive (the owner's build 12 item 4)" |
| The Archived list's empty line says unarchive | "you can add it again." put back | `tab-screens` "the Archived page lists them, read-only, and is the empty standard when there are none — each saying unarchive (the owner's build 12 item 4)" |
| With a live twin, no Unarchive (D3 as it was) | the twin branch never taken | `tab-screens` "offers no Unarchive once the flow is live again in the same scope: it says so and opens the live flow (build 11, D3; the owner's build 10 items 5, 6 and 11; Unarchive since the owner's build 12 item 4)" |
| Add: a flow held in another team is Added ✓, with no Add (All teams) | the per-scope rule put back: Added only for the scope looked at | `tab-screens` "names where a flow is held — Added ✓ with its team, the card opens it — and offers no Add for another team (the owner's build 12 item 9: one flow per workspace; until build 13 "Added in …" and Add, 18.6.2)" |
| Add: held is held whatever the scope control shows | the per-scope rule put back: Added only for the scope looked at | `build13-unarchive-and-one-flow` "Add reads a flow held for the whole workspace as Added ✓ · Whole workspace inside a picked team too — whatever the scope control shows — with no Add, and the card opens it" |
| Add: a held flow says its team | every place labelled Whole workspace | `tab-screens` "names where a flow is held — Added ✓ with its team, the card opens it — and offers no Add for another team (the owner's build 12 item 9: one flow per workspace; until build 13 "Added in …" and Add, 18.6.2)" |
| Add: both places of a duplicate are named | only the first place named | `build13-unarchive-and-one-flow` "Add names both places of a flow added to two before the rule — the duplicate stays — and offers no Add" |
| Setup: a held flow says where it is, with no team choice | the held branch never taken (the team chips again) | `build13-unarchive-and-one-flow` "Setup, for a flow the workspace holds, says where it is under Added to, offers no team, and Activate configures that subscription — nothing is added" |
| Setup: Activate configures the held subscription, never a second | the held copy not configured (a new one added) | `build13-unarchive-and-one-flow` "Setup, for a flow the workspace holds, says where it is under Added to, offers no team, and Activate configures that subscription — nothing is added" |
| Setup: a held flow needs no team | the team check on every Activate again | `build13-unarchive-and-one-flow` "Setup, for a flow held for the whole workspace, needs no team: a plain member with none to add to still has Activate, and it configures that subscription" |
| Setup: Activate for a held flow with no team to add to | Activate offered only with a team or Create a team | `build13-unarchive-and-one-flow` "Setup, for a flow held for the whole workspace, needs no team: a plain member with none to add to still has Activate, and it configures that subscription" |
| D3's twin is in any team (the rule) | the same scope required again | `flows-view` "is none for another template or an archived row — another team's copy IS the twin (the owner's build 12 item 9: one flow per workspace; until build 13 null matched null only)" |
| D3's twin is in any team (the archived page) | the same scope required again | `tab-screens` "offers no Unarchive when the live copy is another team's: that copy is the twin, and it opens (the owner's build 12 item 9: one flow per workspace; until build 13 the whole workspace matched the whole workspace only)" |
| An archived copy holds nothing (the rule) | archived rows counted as held | `flows-view` "is none for another template or an archived row — another team's copy IS the twin (the owner's build 12 item 9: one flow per workspace; until build 13 null matched null only)" |
| An archived copy holds nothing (Setup adds a new one) | archived rows counted as held | `tab-screens` "adds an archived automation afresh rather than reviving the archived subscription" |

### Every press, its test (build 13)

The owner's build 12 checklist, B9: every press in the app has a test that presses it
and checks what it is configured to do — configured by `DESIGN-CONTRACT.md`, this file
and the owner's recorded decisions. `audit:presses` (`scripts/audit-presses.mjs`, in
`verify` after the coverage pass, and in CI) resolves every `onPress` and `onLongPress`
in `app/` and `components/` to the function it runs, and istanbul's coverage says
whether a test ran it: the gate proves a test ran the press's handler, and the test's
own assertions prove the press did what it is configured to do — the screen and params
it opens, the request it sends (method, path, body), the dialog it opens or closes, what
changes on screen, a refusal in words; never only that a mock was called. A press
repeated across screens is one table-driven test, a row per screen. A press an existing
test already pressed and held by its outcome got no new test; one pressed but not held —
a weak assertion, or another branch of it — did.

**Totals.** 268 presses, and 35 passthroughs audited at their callers. At the merged
build 13 code (`7c5f81d`), before these tests: 141 run by a test, 93 never run, 34
unresolved. Now: all 268 run, 0 never run, 0 unresolved. The 34 were handlers the audit
cannot pin to one button — 33 Retry props given a hook's own function
(`onRetry={x.reload}`, whose count is every screen's) and the inbox's
`onPress={openSettings}` — each now written as an arrow on the same line
(`() => x.reload()`), the behaviour unchanged. 131 tests were added, 117 of them the
cases of 15 tables (`it.each`) and 14 single tests: `presses-patterns-failure-states`
47, `presses-patterns-back-circle` 14, `presses-patterns-dialog-close` 25 and
`presses-patterns-empty-actions` 2, one table each; `presses-home-activity` 13 (8 in
three tables), `presses-flows` 14 (10 in three), `presses-settings` 15 (11 in five) and
`presses-close` 1. All pass: the 15 that failed on purpose — the three defects below — pass
since their fix (build 13). Every single test, and every table through at least one of its
rows, was proved to bite: one exact break of the handler's behaviour, made in an
isolated copy of the tree, failed it — read from jest's own record — and the file was
restored byte for byte, its SHA-256 checked. The 80 snapshots are byte-identical.

Tests are `__tests__/<name>.test.tsx:<line>` (`real-router/…` in the real-router
project); app files are named from `app/(tabs)/`, components by their file name.

**Failure states (table-driven).** Configured: Retry sends the screen's failed read
again and draws the state again; Back and Go back go back once, nothing pushed or
replaced; the unavailable state offers Back and Go back, and no Retry. One table,
`presses-patterns-failure-states:164`, a row per screen and state (`:N` below); D1 and
D2 are rows of it.

| Screen | Presses | Rows: offline, unavailable, error |
| --- | --- | --- |
| Home, its own failure (Retry only) | `(home)/index.tsx:236` Retry | `:92` |
| Run | `(home)/run.tsx:189` Retry, Back · `:198` Back · `:207` Retry · `:208` Back | `:93`, `:94` (D1), `:95` |
| Approvals | `activity/approvals.tsx:174` Retry, Back · `:180` Back · `:189` Retry · `:190` Back | `:96`, `:97` (D1), `:98` |
| Activity, a tab (Retry only) | `activity/index.tsx:251` Retry · `:260` Retry | `:99`, `:100` |
| Add a flow | `flows/add.tsx:71` Retry, Back · `:74` Back · `:80` Retry · `:82` Back | `:101`, `:102` (D1), `:103` |
| Flow page | `flows/detail.tsx:171` Retry, Back · `:180` Back · `:189` Retry · `:190` Back | `:104`, `:105` (D1), `:106` |
| Flows, a tab (Retry only) | `flows/index.tsx:96` Retry · `:103` Retry | `:107`, `:108` |
| Setup | `flows/setup.tsx:140` Retry, Back · `:146` Retry · `:147` Back | `:109`, `:113` (D2), `:110` |
| Account | `settings/account.tsx:92` Retry, Back · `:95` Back · `:101` Retry · `:103` Back | `:114`, `:115` (D1), `:116` |
| Billing | `settings/billing.tsx:194` Retry, Back · `:197` Back · `:203` Retry · `:205` Back | `:117`, `:118` (D1), `:119` |
| Connections | `settings/connections.tsx:42` Retry, Back · `:45` Back · `:51` Retry · `:53` Back | `:120`, `:121` (D1), `:122` |
| Export my data | `settings/data.tsx:192` Retry, Back · `:195` Back · `:199` Retry, Back | `:123`, `:124` (D1), `:125` |
| Organization | `settings/organization.tsx:88` Retry, Back · `:91` Back · `:97` Retry · `:99` Back | `:126`, `:127` (D1), `:128` |
| Team | `settings/team.tsx:78` Retry, Back · `:81` Back · `:87` Retry · `:89` Back | `:129`, `:130` (D1), `:131` |
| Teams | `settings/teams.tsx:97` Retry, Back · `:100` Back · `:106` Retry · `:108` Back | `:132`, `:133` (D1), `:134` |
| Archived flows (both copies) | `archived-flows.tsx:68` Retry, Back · `:71` Back · `:77` Retry · `:79` Back | `:135`, `:136` (D1), `:137` |
| Notifications (both copies) | `inbox.tsx:104` Retry, Back · `:110` Back · `:119` Retry · `:120` Back | `:138`, `:139` (D1), `:140` |

**Back circle on a loaded page, and on the empty standard (table-driven).** Configured:
back once, nothing pushed, replaced or dismissed. One table,
`presses-patterns-back-circle:201`, a row per page (`:N` below); the empty standard's
Back and the inbox's own were already held.

| Press | Test |
| --- | --- |
| `(home)/run.tsx:223` | `:86` |
| `activity/approvals.tsx:217` | `:93` |
| `flows/add.tsx:110` | `:99` |
| `flows/add.tsx:95` — empty catalog | `tab-screens:230` |
| `flows/detail.tsx:210` | `:106` |
| `flows/setup.tsx:298` | `:114` |
| `settings/account.tsx:118` | `:121` |
| `settings/billing.tsx:250` | `:128` |
| `settings/connections.tsx:75` | `:138` |
| `settings/connections.tsx:63` — empty | `settings-connections:232` |
| `settings/data.tsx:213` | `:144` |
| `settings/organization.tsx:135` | `:151` |
| `settings/organization.tsx:116` — empty | `organization-screen:242` |
| `settings/support.tsx:76` | `:158` |
| `settings/team.tsx:109` | `:164` |
| `settings/teams.tsx:156` | `:175` |
| `settings/teams.tsx:142` — empty | `teams-screens:324` |
| `archived-flows.tsx:105` | `:186` |
| `archived-flows.tsx:92` — empty | `tab-screens:1944` |
| `inbox.tsx:176` — the inbox | `tab-screens:1044` |
| `inbox.tsx:138` — empty inbox | `tab-screens:752` |

**A dialog's Cancel or Close (table-driven).** Configured: the dialog closes, nothing is
sent — no change and no read — and nothing navigates; a Cancel on a dialog's second step
returns to its first. One table, `presses-patterns-dialog-close:511`, a row per dialog
(`:N` below); three are held in the feature files.

| Press | Test |
| --- | --- |
| `flows/setup.tsx:435` — Create a team › Cancel | `:231` |
| `settings/account.tsx:176` — Unlink › Cancel | `:243` |
| `settings/account.tsx:195` — Delete account › Cancel | `:253` |
| `settings/organization.tsx:187` — Organization name › Cancel | `:263` |
| `org-domains.tsx:101` — a domain › Close | `:273` |
| `org-domains.tsx:260` — Add domain › Cancel; Done after a claim closes and reads the organization again | `:283`, `organization-screen:115` |
| `org-people.tsx:130` — Remove member › Cancel | `:293` |
| `org-people.tsx:141` — Join request › Cancel | `:303` |
| `settings/team.tsx:170` — Delete team › Cancel | `:313` |
| `settings/team.tsx:189` — Leave team › Cancel | `:323` |
| `team-members.tsx:111` — a member › Close | `:333` |
| `team-members.tsx:192` — Remove from this team? › Cancel: back to the member | `:343` |
| `team-members.tsx:127` — own row, Leave this team? › Cancel | `:356` |
| `team-members.tsx:260` — Add members › Done: reads the team again only if someone was added | `presses-settings:369` |
| `team-requests.tsx:68` — Request to join › Cancel | `:366` |
| `settings/teams.tsx:125` — Create a team › Cancel | `:376` |
| `settings/teams.tsx:262` — Withdraw request › Cancel | `:386` |
| `automation-actions.tsx:187` — Run › Cancel | `:396` |
| `automation-actions.tsx:200` — Set up › Cancel | `:406` |
| `automation-actions.tsx:208` — Webhook address › Close | `:416` |
| `automation-actions.tsx:218` — Archive flow › Cancel | `:428` |
| `move-version.tsx:94` — Move to vN › Cancel | `:438` |
| `(home)/run.tsx:288` — Cancel this run? › Keep it running | `presses-home-activity:107` |
| `connections-card.tsx:228` — Connect › Cancel | `:448` |
| `connections-card.tsx:223` — Replace account? › Cancel | `:459` |
| `workspace-switcher.tsx:140` — Switch workspace › Cancel | `:472` |
| `scope-control.tsx:95` — Show › Done | `presses-home-activity:316` |
| `scope-control.tsx:138` — Show › Create a team › Cancel | `:494` |

**The empty standard's action.**

| Press | Configured outcome | Test |
| --- | --- | --- |
| `(home)/index.tsx:105` — first run: Add a flow | opens Add (`/(tabs)/flows/add`) | `tab-screens:1186` |
| `activity/index.tsx:275` — Add a flow | opens Add | `presses-patterns-empty-actions:37` |
| `activity/approvals.tsx:202` — Go back | back, nothing pushed | `presses-patterns-empty-actions:28` |
| `flows/index.tsx:119` — Add a flow | opens Add | `tab-screens:2057` |
| `flows/index.tsx:122` — Archived flows | opens Archived (`/(tabs)/flows/archived`) | `tab-screens:2059` |
| `settings/teams.tsx:141` — Create a team | opens the Create a team dialog | `teams-screens:326` |

**Home, the run page, Activity, Approvals, the inbox, the scope control, the tab bar.**

| Press | Configured outcome | Test |
| --- | --- | --- |
| `(home)/index.tsx:268` — the bell | opens Notifications | `tab-screens:97` |
| `(home)/index.tsx:280` — the avatar | opens Settings | `tab-screens:94` |
| `(home)/index.tsx:328` — a stat tile | Activity with its outcome and `period: 'today'` | `tab-screens:1621` |
| `(home)/index.tsx:344` — the review banner | opens Approvals | `tab-screens:80` |
| `(home)/index.tsx:379` — Add a flow | opens Add | `tab-screens:82` |
| `(home)/index.tsx:389` — Flows | opens Flows | `tab-screens:84` |
| `(home)/index.tsx:399` — See all | opens Activity | `tab-screens:86` |
| `(home)/index.tsx:413` — a recent run | the run page `{runId}` | `tab-screens:108` |
| `(home)/run.tsx:257` — Cancel run | opens Cancel this run?, only while pending or running | `tab-screens:1102`, `tab-screens:1138` |
| `(home)/run.tsx:293` — Cancel run (confirm) | POST `…/runs/{runId}/cancel` in its workspace; closes; reads the run again; a 404 in words | `presses-home-activity:121`, `tab-screens:1115` |
| `(home)/run.tsx:271` — View flow | the flow page `{flow: subscriptionId}` | `presses-home-activity:142` |
| `activity/index.tsx:54` — a row | the run page with THAT row's `runId` | `presses-home-activity:155` |
| `activity/index.tsx:301` — the flow chip ✕ | clears the flow | `tab-screens:1655`, `real-router/activity-selection:95` |
| `activity/index.tsx:305` — Today ✕ | clears today, back to every run | `tab-screens:1819` |
| `activity/index.tsx:315` — an outcome chip | lists that published status | `tab-screens:555` |
| `activity/approvals.tsx:65, :75` — Approve, Reject | POST `…/approvals/{id}/decision` `{decision}`, keyed — a retry reuses the key — then the done line | `presses-home-activity:183` (2 cases) |
| `inbox.tsx:179` — Mark all read | every dot off, rows kept; a row a later read brings stays unread | `presses-home-activity:232` |
| `inbox.tsx:195` — a row | a failed run's page; a held one, Activity | `tab-screens:728` |
| `inbox.tsx:274` — Turn on | iOS asks; the phone registers | `push-registration:149` |
| `inbox.tsx:284` — Open Settings | opens iOS Settings; read again on return | `push-registration:205` |
| `inbox.tsx:293` — Not now | the ask goes for the session | `tab-screens:723`, `push-registration:221` |
| `scope-control.tsx:64` — the workspace pill | Switch workspace with two or more (or a cut list); with one, not a button | `presses-home-activity:295` (3 cases) |
| `scope-control.tsx:75` — the team pill | opens Show | `scope-control:68` |
| `scope-control.tsx:102` — All teams | scope all, kept as none, closes | `presses-home-activity:316` |
| `scope-control.tsx:115` — a team | scope that team, kept, closes | `presses-home-activity:316`, `scope-control:68` |
| `scope-control.tsx:129` — Create a team | the dialog; the new team is the scope | `scope-control:134` |
| `tab-bar.tsx:80` — a tab | opens that tab, changing nothing on it | `tab-bar:29`, `real-router/activity-selection:107` |

**Flows: the list, Add, Setup, a flow page and its actions.**

| Press | Configured outcome | Test |
| --- | --- | --- |
| `flows/index.tsx:153` — Archived | opens Archived | `tab-screens:1911` |
| `flows/index.tsx:164, :196` — New; a flow card | opens Add; the flow page `{flow}` | `tab-screens:268` |
| `flows/index.tsx:224` — Add a flow (a team with none) | opens Add | `presses-flows:173` |
| `flows/add.tsx:121` — a category | narrows the catalog | `tab-screens:172` |
| `flows/add.tsx:135` — an Added ✓ card | opens that flow's page (the first copy) | `tab-screens:165`, `build13-unarchive-and-one-flow:129` |
| `flows/add.tsx:166` — Add | Setup with the template and the scope's team; refused while not responding | `tab-screens:154`, `presses-flows:275` |
| `flows/setup.tsx:335` — Create a team | the dialog; the new team is chosen | `tab-screens:1424` |
| `flows/setup.tsx:348` — See teams | opens Settings › Teams | `tab-screens:1499` |
| `flows/setup.tsx:378` — Connect › | opens Settings | `tab-screens:1278` |
| `flows/setup.tsx:423` — Activate | POST subscribe `{templateId, templateVersion, projectId}` then PATCH `{config, status: 'live'}`, each keyed, then the flow page; a held flow configured, none added; refusals in words | `presses-flows:190`, `tab-screens:1397`, `build13-unarchive-and-one-flow:169`, `presses-flows:396` |
| `flows/setup.tsx:416` — Try again | the same request, the same key | `presses-flows:355` |
| `choice-chips.tsx:34` — a chip (Setup's team, a team role) | chooses it; the team is sent as `projectId` | `tab-screens:1397`, `teams-screens:463` |
| `flows/detail.tsx:238` — Runs / Successes / Failures | Activity `{flow, flowName, filter}`, no day | `tab-screens:1638` |
| `flows/detail.tsx:314` — Open the live flow | the twin's page, same stack | `tab-screens:1985` |
| `flows/detail.tsx:325` — Unarchive | Setup with the template and the team it had | `build13-unarchive-and-one-flow:56` |
| `flows/detail.tsx:366` — Pause / Resume / Publish | PATCH `{status}`; refused while not responding | `tab-screens:460`, `presses-flows:301` |
| `flows/detail.tsx:340` — Try again | the same change, the same key | `presses-flows:328` |
| `automation-actions.tsx:128` — Run | the Run dialog with the declared fields | `automation-actions:159` |
| `automation-actions.tsx:154` — Set up; Webhook address | their dialogs | `automation-actions:388`, `automation-actions:352` |
| `automation-actions.tsx:168` — Archive flow | the one-way confirmation | `automation-actions:275` |
| `automation-actions.tsx:222` — Archive | PATCH `{status: 'archived'}`, then the Flows list | `automation-actions:275`, `tab-screens:405` |
| `move-version.tsx:81` — Move to vN | its confirmation | `automation-actions:246` |
| `move-version.tsx:98` — Move to vN (confirm) | PATCH `{templateVersion}`; refusals in words | `automation-actions:246`, `automation-actions:260` |
| `run-dialog.tsx:105` — Start run | POST runs `{subscriptionId, input}`; closes; the run's page | `automation-actions:159`, `presses-flows:248` |
| `run-file-field.tsx:142` — Choose file | uploads it; the run carries its id; a refusal in words | `automation-actions:205`, `presses-flows:418` |
| `setup-dialog.tsx:77` — Save setup | PATCH `{config}` only | `automation-actions:388` |
| `webhook-address-dialog.tsx:114` — Create address / Make a new secret | POST, no key; the secret shown once; a refusal in words | `automation-actions:352`, `presses-flows:413` |
| `archived-flows.tsx:116` — an archived row | its page in the same stack | `tab-screens:1928` |
| `select-field.tsx:55, :80` — the box; an option | opens the list in place; selects and closes it | `select-field:21` |

**Settings, Face ID, Account, Billing, Export my data, Help.**

| Press | Configured outcome | Test |
| --- | --- | --- |
| `settings/index.tsx:149, :167, :177, :220, :230, :241, :250, :263, :303` — the page rows | each opens its page | `tab-screens:969` |
| `settings/index.tsx:191` — the workspace row | Switch workspace with two or more; inert with one | `workspace-switcher:91`, `workspace-switcher:80` |
| `settings/index.tsx:279` — Auto / Dark / Light | sets the theme | `tab-screens:1012` |
| `settings/index.tsx:316` — Sign out | signs out; the root guard shows the cover | `real-router/sign-out:48`, `sign-out:93` |
| `settings/index.tsx:312` — Retry sign out | signs out again | `sign-out:119` |
| `face-id-row.tsx:78` — Face ID's Try again | repeats the change that failed | `presses-settings:452` (D3) |
| `noc-toggle.tsx:40` — a toggle | turns it the other way | `components:166` |
| `settings/account.tsx:150` — Unlink | asks first; POST `…/unlink`; refusals by reason | `account-screen:235` |
| `settings/account.tsx:155` — Link | links in the system browser | `account-screen:60` |
| `settings/account.tsx:189, :310` — Delete Account; Yes, delete my account / Try again | the typed-DELETE dialog; `DELETE /v1/account`, every answer in words | `account-screen:111` |
| `settings/account.tsx:305` — Sign in again | signs this phone out; the guard shows the cover | `account-screen:191`, `real-router/sign-out:152` |
| `settings/billing.tsx:271` — a plan card, not paying | the hosted checkout for that plan (iOS) | `billing-screen:104` |
| `settings/billing.tsx:271, :296` — a plan card while paying; Manage billing | the hosted portal | `billing-screen:133` |
| `settings/data.tsx:238` — Prepare export | the bounded export | `data-support-screens:59` |
| `settings/data.tsx:261` — Share JSON | iOS: a JSON file in the cache to the share sheet, then removed; Android: text | `presses-settings:404` (2 cases) |
| `settings/data.tsx:280, :290` — Export everything; Download file | starts the complete export and follows it; its link read again at the download, to the share sheet | `data-support-screens:98` |
| `settings/support.tsx:100` — Send | the contact request | `data-support-screens:138` |
| `settings/support.tsx:111, :112` — Privacy policy; Terms of service | open on the website | `data-support-screens:156` |

**Organization.**

| Press | Configured outcome | Test |
| --- | --- | --- |
| `settings/organization.tsx:154, :264` — Name; Save | the rename dialog; saves the name | `organization-screen:380` |
| `settings/organization.tsx:168` — Share join link | the share sheet with the link | `organization-screen:310` |
| `org-domains.tsx:77` — a domain | its dialog, with only what its state allows | `presses-settings:145` |
| `org-domains.tsx:180, :187, :194` — Revoke; Verify DNS; Save settings | DELETE `…/domains/{id}`; POST `…/verification`; PATCH `{joinPolicy, discoveryEnabled}` — a refusal in the dialog, the key kept, then closes and reads again | `presses-settings:145` (3 cases) |
| `org-domains.tsx:85, :262` — Add domain; its Add domain | the dialog; claims the domain | `organization-screen:115` |
| `org-join.tsx:135, :127` — Join / Request; Cancel request | joins or asks; withdraws | `organization-screen:197` |
| `org-join.tsx:205` — Create organization | creates it | `organization-screen:251` |
| `org-people.tsx:77` — a member | the Remove question | `organization-screen:96` |
| `org-people.tsx:109, :207` — a join request; Approve | its dialog; approves it | `organization-screen:130` |
| `org-people.tsx:201` — Reject | PATCH `…/join-requests/{id}` `{decision: 'reject'}`; closes; reads again | `presses-settings:218` |

**Teams.**

| Press | Configured outcome | Test |
| --- | --- | --- |
| `settings/team.tsx:153` — Delete team / Leave team | its confirmation | `teams-screens:403`, `teams-screens:434` |
| `settings/teams.tsx:172`; `create-team-dialog.tsx:106` — Create a team; Create team | the dialog; creates it, refusals in words | `teams-screens:219` |
| `create-team-dialog.tsx:91` — Done, after a create | opens the new team's page | `teams-screens:242` |
| `settings/teams.tsx:192` — a team | its page `{projectId, workspaceId}` — the team's own workspace | `presses-settings:252` |
| `settings/teams.tsx:220, :227` — Requested; Request | the withdraw question; asks to join | `teams-screens:152` |
| `team-members.tsx:87`; `confirm-dialog.tsx:72` — your own row; the confirm | Leave this team? — DELETE your membership, Leaving… while sent, once, then back | `presses-settings:310` |
| `team-members.tsx:87, :99, :204, :271` — a member; Add members; Save role; Add | their dialog; the add dialog; POST `…/memberships` `{userId, role}` — a new role, or a member added | `teams-screens:454` |
| `team-members.tsx:198, :193` — Remove; Remove (confirm) | asks in the same dialog; DELETE `…/memberships/{userId}`, a refusal there, the key kept, then closes and reads again | `presses-settings:334` |
| `team-requests.tsx:56, :125, :130` — a request; Deny; Approve | its dialog; decides it | `teams-screens:474` |

**Connections and the workspace switcher.**

| Press | Configured outcome | Test |
| --- | --- | --- |
| `connections-card.tsx:176` — a provider | its dialog | `settings-connections:66` |
| `connections-card.tsx:242` — Connect / Disconnect | OAuth in the browser; DELETE `…/connections/{id}`; POST `…/connections/key` `{providerId, credentials}`, trimmed, keyed — then closes and reads again | `presses-settings:525` (2 cases), `settings-connections:66` |
| `connections-card.tsx:233, :224` — Replace account; Replace account (confirm) | asks first; connects again in the browser, replacing that connection (`replaceConnectionId`) | `settings-connections:146`, `settings-connections:173` |
| `workspace-switcher.tsx:165` — a workspace | PATCH `/v1/session/active-workspace`, keyed, then the session read again | `workspace-switcher:140` |
| `workspace-switcher.tsx:146` — Reload session | reads the session again; the dialog closes | `workspace-switcher:203` |

**The cover, sign-in, the lock, and shared controls.**

| Press | Configured outcome | Test |
| --- | --- | --- |
| `app/index.tsx:138` — the cover | signed in, Home; signed out, nothing | `cover-haptics:26`, `splash-tap:18` |
| `app/index.tsx:164` — Get started | opens Sign in, once | `splash-tap:18`, `real-router/sign-out:97` |
| `(auth)/login.tsx:192` — Sign in with … | that provider's sign-in | `auth-screens:45` |
| `(auth)/login.tsx:171` — Unlock with Face ID | opens the lock | `auth-screens:86` |
| `(auth)/faceid-offer.tsx:98, :101` — Use Face ID; Not now | checks Face ID, records yes, opens Home; records no, opens Home | `faceid-offer:27`, `faceid-offer:36` |
| `(auth)/faceid.tsx:181` — Use identity provider | signs this phone out, then the cover | `faceid-screen:70`, `real-router/sign-out:234` |
| `(auth)/account-deleted.tsx:30` — Continue | the cover | `real-router/sign-out:181` |
| `text-field.tsx:76` — Show / Hide password | shows or hides it | `components:223` |
| `picker-dialog.tsx:39` — a row (no screen draws PickerDialog since build 8) | picks that row's value; the picker closes | `presses-close:51` |

**Defects — found by the audit, fixed in build 13.** The audit itself changed no product
line but the 34 arrows above; the fixes followed it, each held by the test that failed:

- **Fixed (build 13), D1 and the tabs' dead way back:** `FailureBody` draws a control only
  with its handler — Retry with an `onRetry`, the back circle and "Go back" with an
  `onBack` — so the unavailable state has no Retry, and the Activity and Flows tabs (roots,
  with nothing to go back to) no back circle or "Go back" (the audit had flagged those
  two for a decision). The design snapshots of `ScreenError` and `ScreenOffline` pass both
  handlers, as every pushed screen does, and stay byte-identical. Held by the 13
  unavailable rows and, for the tabs, the table's no-back branch (`presses-patterns-
  failure-states`; proved: the back circle drawn unconditionally again fails "Activity,
  error").
- **Fixed (build 13), D2:** Setup draws an unconfigured read as the unavailable state.
- **Fixed (build 13), D3:** Face ID's Try again repeats the change that failed (a ref
  holds the last one asked for).


- **D1 — the unavailable state draws a Retry that does nothing.**
  `components/screen-state.tsx:116-126`: `FailureBody` draws the Retry pill whatever its
  `onRetry`, and `ScreenUnavailable` (`:182-203`) passes none, so every unavailable
  state — the 13 pushed screens' (Run, Approvals, Add, the flow page, Account, Billing,
  Connections, Export my data, Organization, Team, Teams, Archived flows, Notifications)
  and the Activity and Flows tabs' — shows "Retry" with no handler: a press that does
  nothing and gives no tick. Configured: "`ScreenUnavailable` says what is actually
  wrong and offers no retry" (`DESIGN-CONTRACT.md:178-182`; Round 6's "`unconfigured` is
  its own state", above; the component's own comment, `screen-state.tsx:175-180`). Since
  `74eee65` (2026-08-18), which built `ScreenUnavailable` on `FailureBody`. Failing: the
  13 unavailable rows of `presses-patterns-failure-states` (`:94`, `:97`, `:102`,
  `:105`, `:115`, `:118`, `:121`, `:124`, `:127`, `:130`, `:133`, `:136`, `:139`), each
  at `:188` — "Retry" is on the screen — after its Back and Go back passed; the table
  has no unavailable row for the two tabs. `ScreenUnavailable` has no snapshot: the
  screen-state snapshots are `ScreenError`'s and `ScreenOffline`'s, drawn with no
  handler, so a fix confined to the unavailable state moves none of the 80.
- **D2 — Setup draws an unconfigured read as the error state, with its Retry.**
  `app/(tabs)/flows/setup.tsx:142-151`: every status but `ready` draws `ScreenError`,
  `unconfigured` included — no backend, no workspace, or no `template` param (the throw
  at `:80`) — so Setup offers a Retry that cannot succeed. Configured: every fetching
  surface has the unavailable state, Home its one carve-out
  (`DESIGN-CONTRACT.md:170-182`). Failing: `presses-patterns-failure-states:113`, at
  `:170` — no `screen-unavailable`; the screen draws `screen-error`.
- **D3 — Face ID's Try again always turns Face ID on.**
  `components/settings/face-id-row.tsx:78`, `onRetry={() => changeFaceId(true)}`: after
  a failed turn-off — the keychain refuses the write, "Face ID preference could not be
  saved on this device." — Try again shows the Face ID prompt and saves `true`, so the
  toggle ends on, the opposite of what was asked. Configured: a failed action stays on
  the loaded screen with the shared inline failure callout
  (`DESIGN-CONTRACT.md:364-365`), whose Try again is that action again. Since `76bfc0b`
  (2026-08-18). Failing: `presses-settings:452`, the case "a failure turning it off …",
  at `:491` — the "Enable Face ID unlock" prompt was shown; the turn-on case passes.

### Build 13 review: four findings, and what became of them

The single review pass of build 13 (`d77dd3a..0f01c0b`; the owner stopped review
fan-out) verified four findings with reproductions. All four are fixed here, on
`round-16-build-13-fix` from `7c5f81d` (build 13 merged, with `audit:presses`):

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | **Security, major — pre-existing since before build 12.** The Face ID lock did not gate the session against a link. The root guard admitted any `signed-in` session, locked or not (`app/_layout.tsx:86`), and so did the tab layout's own check. With Face ID on, the lock showing and its check cancelled, snoopymobile:///settings opened from Safari (the scheme, `app.json:8`) reached expo-router's URL listener (`useLinking.native.js:149-176`), which opened Settings — and every tab behind it, approvals and Delete Account among them — without Face ID. DESIGN-CONTRACT said that an enabled Face ID preference gates an existing session, and for a link it did not. Fixing it found a second way past the same gate, which the review had not reported: a link to the Face ID question (snoopymobile:///faceid-offer) while the lock showed opened the question. Its "Not now" switched Face ID off and opened Home. Run on `7c5f81d`, the route went from `["(auth)","faceid"]` to `["(tabs)","(home)"]` and `autom8x.face-id-enabled` became "false", so the next cold start also opened without Face ID | **fixed with a session-level lock.** The session provider's `locked` is true from the cold start whenever a stored session's owner turned Face ID on. It is decided from the keychain before the session is signed in, and it stays true until that is known. It is cleared when the lock's own check passes (`unlock()`), when someone signs in (a sign-in is its own proof) and when Face ID is turned off on Settings' row. Only the next cold start sets it again; a `refresh()` does not. The root guard is now `session.status === 'signed-in' && !session.locked`, and the tab layout draws nothing and keeps push idle until the same holds. So a link that arrives while the session is locked finds no tab in the root stack, and expo-router drops it. A check that passes opens Home, as it always did, and the dropped link is not replayed. A push tap's screen waits for the lock as it waits for a sign-in, and "Use identity provider" still signs out (part 1). The splash now sends a locked session to the lock by reading `locked` instead of the preference, so within one unlocked session "/" goes on to Home and does not ask for Face ID twice. The Face ID question is guarded in the auth stack as the tabs are (`app/(auth)/_layout.tsx`). A link to it while the lock shows opens nothing. A cold-start link to it now shows Sign in until the splash moves on, where `7c5f81d` drew the question. **NOT OBSERVED** on a device |
| 2 | **Correctness, major — a hole in item 9.** After Setup had added a flow (a draft still owed an account, or a create whose activation failed), it still drew the "Add to" team chips. `held` was read before the create and not again until the screen regained focus. Picking another team reset what Setup had added (`setup.tsx:316-318`), and Activate then sent a second create. That made two copies of one flow in one workspace, which the platform still accepts per team (18.6.2). Row 9's list of ways a duplicate can still arise did not include this one | **fixed**: `const placed = localSubscription ?? held`. What Setup adds is held from that moment: it reads "Added to" its team (`scopeLabel(placed.projectId, …)`) and draws no chips, so no team change can reset it. Activate configures that copy: a draft still owed an account goes to Settings, and a failed activation sends the same PATCH again. The chips' reset of the local copy was removed with them, since with nothing added there is nothing to reset; their reset of the idempotency keys stays. **NOT OBSERVED** on a device |
| 3 | **Test gap, minor.** No test held the guard shut while the session restores, which is what stops a cold-start link from skipping the lock. A guard that also admitted `restoring` passed all thirteen real-router tests | **fixed** by two real-router tests in `face-id-lock`. "a cold start at a tab address with Face ID on draws no tab at any moment, and ends on the lock" samples after the first render and after each wait. "with Face ID off, a cold start reaches Home through the splash, and nothing asks for Face ID" covers the other path. The first test fails on `d77dd3a` (Settings drawn at seven samples, across the splash's 2.4 s) and on `7c5f81d` with the review's mutation. On `7c5f81d` as committed it passes, because build 13's root guard had already closed the cold-start case, as the review found. On this branch no single break of the guard fails it either (below) |
| 4 | **Records, minor.** `CLAUDE.md`'s `addedAgainAs()` line still described build 11's same-scope twin and "Add it again", the opposite of items 4 and 9 | **fixed**: rule 10 in `CLAUDE.md` now lists `heldAs()`: a workspace holds a flow once (any copy not archived, in any team or the whole workspace), and a copy Setup has just added is held. It also lists `addedAgainAs()`: the live twin is the same template in any team or the whole workspace (`heldAs`, item 9), and with one there is no "Unarchive" (D3). Rule 11 says the boundary admits the tabs only past the Face ID lock. `DESIGN-CONTRACT.md` says the guard enforces the lock and that a flow Setup adds is held |

No pinned behaviour changed. The only edits to existing tests are the session fixtures, which now state an open session (`locked: false` and an `unlock`) where they state a session: `test/platform.tsx`'s `signedInSession`, `test/render.tsx`'s default, and `auth-boundary`'s and `override-scope`'s own. The 80 snapshots did not move. `audit:presses` stands where `7c5f81d` left it, failing on both trees with the same inventory row for row: 268 presses, 141 run, 93 not run and 34 unresolved. The files this change touched hold the same fifteen rows with the same statuses, and the change adds no press.

The new tests were run on the code they fix. The new and changed test files were copied into `git archive` trees of `7c5f81d` and `d77dd3a`, with `node_modules` linked and nothing else changed, and each status was read from jest's own record. The unit tests stand on build 13 part 2 and were run on `7c5f81d` only:

| Test | `7c5f81d` | `d77dd3a` |
| --- | --- | --- |
| real-router `face-id-lock` "a link to a tab that arrives while the lock shows opens nothing — Settings never drawn, the lock stays — and Face ID passing opens Home" | failed (Settings drawn) | failed |
| real-router `face-id-lock` "a Face ID check that does not pass keeps the lock: a link to a tab after it opens nothing either" | failed (Settings drawn) | failed |
| real-router `face-id-lock` "a cold start at a tab address with Face ID on draws no tab at any moment, and ends on the lock" | passed; failed with the review's mutation (`guard={session.status === 'signed-in' \|\| session.status === 'restoring'}`) | failed |
| real-router `face-id-lock` "with Face ID off, a cold start reaches Home through the splash, and nothing asks for Face ID" | passed | passed |
| real-router `face-id-lock` "a link to the Face ID question while the lock shows opens nothing: it cannot be answered Not now, and Face ID stays on for the next cold start" | failed (the question drawn) | failed |
| real-router `face-id-lock` "a sign-in opens a session the lock held — it is its own proof: Use identity provider, Get started, Sign in with Google, Not now, Home" | passed | failed (its fallback did not sign out: item 7) |
| real-router `face-id-lock` "a push tap that opened the app waits for the lock: nothing opens while it shows, and the run opens once Face ID passes" | passed | passed |
| `session-provider` "locks a stored session whose owner turned Face ID on from the first render: never once signed in and open" | failed | — |
| `session-provider` "with Face ID off, a stored session is open" | passed | — |
| `session-provider` "the lock's check opens it, a later refresh does not lock it again, and the next cold start does" | failed | — |
| `session-provider` "a sign-in opens a locked session: it is its own proof" | failed | — |
| `session-provider` "a sign-in after a cold start that ended signed out decides the lock: a refresh does not lock it, though Face ID was turned on since" | passed | — |
| `session-provider` "turning Face ID off on Settings' row opens a locked session" | failed | — |
| `auth-boundary` "draws nothing for a signed-in session the Face ID lock still holds, and redirects nowhere (the build 13 review)" | failed | — |
| `push-registration` "the tap that opened the app waits for the Face ID lock: nothing is read or opened while it holds the session, and its screen opens once it lets go (the build 13 review)" | failed | — |
| `build13-unarchive-and-one-flow` "a create still owed an account says where it is under Added to, with no team to pick again — no second copy can be sent" | failed (no "Added to") | — |
| `build13-unarchive-and-one-flow` "a create whose activation failed stays Added to its team, and Activate again activates that copy — never a second" | failed (no "Added to") | — |

The tests that pass on `7c5f81d` hold what the fix must keep: the paths that were already right. Face ID off reaches Home, a sign-in reaches Home, and a push tap waits for a lock that the cold start never got past. The lock's state machine is held where `7c5f81d` had no lock.

### Guards proved to bite, the build 13 review

One script made twenty-five runs. Each run made one exact break (two, in the one row that names two files) and ran the named test on its own with jest's `-t`. The test's status was read from jest's own record, which showed that it was the only test that ran. The file was then restored byte for byte and its SHA-256 checked before and after. After the last restore the working tree's hashes matched those taken before the first break. Twenty-three breaks failed their test. Two did not bite, and both were single breaks of the root guard against the cold-start test. On this branch the tab layout's own check, now `open`, draws nothing for a locked session, and the splash under the tabs moves on to the lock. The guard and that check both have to fall before the cold start shows a tab, and the row that breaks both fails. The guard alone is held by the link tests in the first rows.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| The guard admits the tabs only when unlocked | the guard as it was: `session.status === 'signed-in'` | real-router `face-id-lock` "a link to a tab that arrives while the lock shows opens nothing — Settings never drawn, the lock stays — and Face ID passing opens Home" |
| The guard admits the tabs only when unlocked (after a failed check) | the guard as it was: `session.status === 'signed-in'` | real-router `face-id-lock` "a Face ID check that does not pass keeps the lock: a link to a tab after it opens nothing either" |
| A cold start shows no tab (the guard alone) | the guard loosened to `session.status !== 'signed-out'` | none: real-router `face-id-lock` "a cold start at a tab address with Face ID on draws no tab at any moment, and ends on the lock" passed, held by the tab layout's check |
| A cold start shows no tab (the review's mutation) | the guard admitting `restoring`, with no lock | none: the same test passed, held by the tab layout's check |
| A cold start shows no tab | the review's mutation, and the tab layout's check without the lock | real-router `face-id-lock` "a cold start at a tab address with Face ID on draws no tab at any moment, and ends on the lock" |
| Locked until known | `useState(false)` for `locked` | `session-provider` "locks a stored session whose owner turned Face ID on from the first render: never once signed in and open" |
| The cold start locks only for Face ID on | every stored session locked (`stored !== null`) | real-router `face-id-lock` "with Face ID off, a cold start reaches Home through the splash, and nothing asks for Face ID" |
| The cold start locks only for Face ID on (the provider) | every stored session locked (`stored !== null`) | `session-provider` "with Face ID off, a stored session is open" |
| Only a cold start locks | every restore deciding the lock again | `session-provider` "the lock's check opens it, a later refresh does not lock it again, and the next cold start does" |
| A sign-in opens the lock | the sign-in leaving the lock as it was | `session-provider` "a sign-in opens a locked session: it is its own proof" |
| A sign-in opens the lock (the real router) | the sign-in leaving the lock as it was | real-router `face-id-lock` "a sign-in opens a session the lock held — it is its own proof: Use identity provider, Get started, Sign in with Google, Not now, Home" |
| A sign-in decides the lock | the sign-in opening the lock but leaving it undecided | `session-provider` "a sign-in after a cold start that ended signed out decides the lock: a refresh does not lock it, though Face ID was turned on since" |
| A passed check opens the session, then Home | `unlock()` removed from the lock's success | real-router `face-id-lock` "a link to a tab that arrives while the lock shows opens nothing — Settings never drawn, the lock stays — and Face ID passing opens Home" |
| A push tap's screen opens once the check passes | `unlock()` removed from the lock's success | real-router `face-id-lock` "a push tap that opened the app waits for the lock: nothing opens while it shows, and the run opens once Face ID passes" |
| Only a passed check unlocks | `unlock()` called on any answer | real-router `face-id-lock` "a Face ID check that does not pass keeps the lock: a link to a tab after it opens nothing either" |
| The splash sends a locked session to the lock | the splash replacing to Home whatever the lock | real-router `face-id-lock` "a link to a tab that arrives while the lock shows opens nothing — Settings never drawn, the lock stays — and Face ID passing opens Home" |
| The tab layout draws nothing while locked | its check without the lock (`open = signed-in`) | `auth-boundary` "draws nothing for a signed-in session the Face ID lock still holds, and redirects nowhere (the build 13 review)" |
| Push waits for the lock (the layout) | its check without the lock (`open = signed-in`) | `push-registration` "the tap that opened the app waits for the Face ID lock: nothing is read or opened while it holds the session, and its screen opens once it lets go (the build 13 review)" |
| Push waits for the lock (the hook's argument) | `usePushRegistration(session.status === 'signed-in')` | `push-registration` "the tap that opened the app waits for the Face ID lock: nothing is read or opened while it holds the session, and its screen opens once it lets go (the build 13 review)" |
| The Face ID question is guarded | `faceid-offer` taken out of its `Stack.Protected` | real-router `face-id-lock` "a link to the Face ID question while the lock shows opens nothing: it cannot be answered Not now, and Face ID stays on for the next cold start" |
| Face ID turned off opens the lock | `unlock()` removed from Settings' row | `session-provider` "turning Face ID off on Settings' row opens a locked session" |
| Setup: an added draft is "Added to" its team | the held block for `held` only, as it was | `build13-unarchive-and-one-flow` "a create still owed an account says where it is under Added to, with no team to pick again — no second copy can be sent" |
| Setup: a failed activation keeps its copy | the held block for `held` only, as it was | `build13-unarchive-and-one-flow` "a create whose activation failed stays Added to its team, and Activate again activates that copy — never a second" |
| Setup: what it added is where the flow is | `placed = held` | `build13-unarchive-and-one-flow` "a create still owed an account says where it is under Added to, with no team to pick again — no second copy can be sent" |
| Setup: what it added is activated, never added again | `placed = held` | `build13-unarchive-and-one-flow` "a create whose activation failed stays Added to its team, and Activate again activates that copy — never a second" |

### Guards proved to bite, 24.6

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| The billing link on iOS only | offered on every platform | `billing-screen` "Android no purchase control" |
| Only an https hosted address opened | any address | `billing-screen` "nothing but https" |
| Billing read for an owner or admin only | read for a member | `billing-screen` "member is told" |
| Billing read again on return | no re-read | `billing-screen` "comes back" |
| A partial deletion keeps the account | 409 read as deleted | `deletion`, `account-screen` |
| A lost answer checks the session | 5xx read as deleted | `deletion`, `account-screen` |
| Deleted-not-revoked revokes first | let go at once | `account-screen` "not revoked" |
| A deleted account leaves the keychain | session kept | `account-screen` "lets go of the session" |
| The link ticket's token read inside the request | read before | `identity-link` "inside the request" |
| A link code only from the claimed address | any address | `identity-link` "another address" |
| The export link read at the download | the earlier link opened | `data-support-screens` "moment of the download" |
| Export for an owner or admin only | offered to a member | `data-support-screens` "member is told why" |
| Contact needs the workflow and email | sent empty | `data-support-screens` "contact form" |
