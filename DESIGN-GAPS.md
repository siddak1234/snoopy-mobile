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
  that read as configured-and-ready. Both are gone, with the reasons recorded in
  the file rather than in a commit message nobody re-reads.

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
- **`eas.json` cannot build until an EAS project is linked.**
  `appVersionSource: "remote"` requires one and there is no `extra.eas.projectId`
  anywhere, so no profile builds non-interactively. That needs an account, which
  is Round 7's to provision.
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
