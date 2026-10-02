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
