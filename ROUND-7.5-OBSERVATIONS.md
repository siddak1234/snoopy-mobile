# Round 7.5 — the three transferred observations

Round 7.5 opened in the master plan's §0 under §5's re-entry rule, repo
`snoopy-mobile`, scoped to exactly the three Gate 8 observations Round 6
transferred (manifest §12.2 #19; Gate 10 lines 6–8; Round 7 card acceptance
criteria). Session date: 2026-08-27. Everything below is recorded the way the
Gate 8 lines were recorded: the command, and what it answered. A line that
could not be observed says so and why; nothing here converts NOT OBSERVED
into PASS.

Governing wordings, verified in place before any work:

- Master plan §0: "ROUND 7.5 IS OPEN, repo `snoopy-mobile` … EXACTLY the three
  Gate 8 observations transferred by Round 6 … nothing else", and
  "`EXPO_PUBLIC_NATIVE_REDIRECT_URI` must equal
  `https://app.autom8x.ai/auth/native/callback` byte-for-byte (ADR-0017)".
- Manifest §12.2 #19 (SYSTEM-MANIFEST.md:870): observe (a) on an Android
  runner, (b) against a linked EAS account, (c) against the deployed Edge.
- Round 7 card exit gate: 19a "Android native launch OBSERVED on a runner with
  the Android SDK/emulator"; 19b "EAS preview/production cloud build OBSERVED
  against a linked EAS project"; 19c "Authenticated §1 journey OBSERVED from
  the native client against the deployed Edge".

## What changed in this repository, and why

Round 7.5 changes configuration only — no application source, no test, no
Nocturne surface, no gate.

- **`app.json` gains `extra.eas.projectId` and `owner`.** `eas init --account
  autom8x.ai --force --non-interactive` created `@autom8x.ai/snoopy-mobile`
  (id `cb806193-8885-4b5c-b1d6-850da3f162a2`,
  https://expo.dev/accounts/autom8x.ai/projects/snoopy-mobile). The CLI also
  serialized the *evaluated* dynamic config back into the static file —
  `backendApiOrigin: {}`, `nativeRedirectUri: {}`, `router: {}` — which are
  `app.config.js` outputs, not static config; they were removed, and
  `npx expo config` was re-run to prove the resolved config is unchanged.
- **`eas.json` loses its top-level `$comment`.** eas-cli 22 validates the file
  strictly and refuses to run any command with it (`"$comment" is not
  allowed`). Half of that comment described the unlinked state this round
  ends. The two absences it defended remain true and remain deliberate:
  **no `channel` keys** because the app has no update runtime (`expo-updates`
  is not a dependency; `app.json` has no `updates`/`runtimeVersion` — a
  channel would route an OTA update to a build that cannot receive one), and
  **no `submit.production` block** because no Apple team/ASC key or Google
  service account exists (an empty object reads as configured-and-ready; its
  absence reads as what is true).
- **The `preview` profile pins `environment: "preview"` and
  `android.buildType: "apk"`; `production` pins `environment: "production"`.**
  Without the key, eas-cli 22 infers the environment from the profile's
  *shape* (verified in `build/build/evaluateConfigWithEnvVarsAsync.js` of
  eas-cli 22.6.0: `distribution: "store"` → production, `developmentClient` →
  development, else preview) — correct here, but by coincidence of shape;
  naming it removes the inference. The APK pin makes the artifact the 19a
  runner installs explicit rather than the internal-distribution default; if
  this profile ever moves to store distribution the pin must be removed with
  it. The two `EXPO_PUBLIC_*` values live in the EAS-hosted environments on
  the linked project, not in this file, exactly as the deleted comment
  required: the redirect URI must string-match the Edge's
  `NATIVE_APP_REDIRECT_URIS` for the deployment being built.
- **`cli.version` rises from `>= 5.9.0` to `>= 22.0.0`.** The file now uses
  the build-profile `environment` key, which older CLIs reject at schema
  validation; a floor that admits a CLI the file's own keys break is worse
  than none.
- **EAS-hosted environment variables created** (dashboard state, recorded here
  because no file carries it):
  `eas env:create preview --name EXPO_PUBLIC_BACKEND_API_ORIGIN --value
  https://api.autom8x.ai --visibility plaintext --scope project` and the same
  for `EXPO_PUBLIC_NATIVE_REDIRECT_URI` with value
  `https://app.autom8x.ai/auth/native/callback` (byte-for-byte the master
  plan's string), then the identical pair in the `production` environment —
  the same deployed Edge is both profiles' target today, and README's claim
  that both environments supply the values must be true, not aspirational.
  `eas env:list preview` and `eas env:list production` each answer both.
  Visibility is plaintext deliberately: `EXPO_PUBLIC_*` values are baked
  into the shipped JS bundle, and `secret` visibility would hide them from
  config evaluation, where `app.config.js` requires them.

Config-resolution proof, both directions (2026-08-27):

```
EAS_BUILD_PROFILE=preview EXPO_PUBLIC_BACKEND_API_ORIGIN=https://api.autom8x.ai \
  EXPO_PUBLIC_NATIVE_REDIRECT_URI=https://app.autom8x.ai/auth/native/callback \
  npx expo config --json
  → extra.backendApiOrigin https://api.autom8x.ai
    extra.nativeRedirectUri https://app.autom8x.ai/auth/native/callback
    ios.associatedDomains ["applinks:app.autom8x.ai"]
    android.intentFilters [{autoVerify:true, data:[{scheme:"https",
      host:"app.autom8x.ai", pathPrefix:"/auth/native/callback"}]}]

EAS_BUILD_PROFILE=preview npx expo config --json     # no env
  → exit 1, no config emitted (the release-profile guard throws)
```

## 19b — EAS preview cloud build against a linked EAS project: OBSERVED

The link (2026-08-27):

```
npx eas-cli init --account autom8x.ai --force --non-interactive
  ✔ Created @autom8x.ai/snoopy-mobile:
    https://expo.dev/accounts/autom8x.ai/projects/snoopy-mobile
  ✔ Project successfully linked (ID: cb806193-8885-4b5c-b1d6-850da3f162a2)
```

Two builds ran to completion on EAS servers, both profile `preview`, platform
Android. The first (`91669d9b-57b0-4450-8148-d98c50f87611`) is the keystore
mint: launched with `expect` answering the one interactive prompt
("Generate a new Android Keystore?" → yes, "✔ Created keystore"), it
initialized the remote versionCode to 1 and its CLI log carries the
environment proof — "Resolved "preview" environment for the build" and
"Environment variables with visibility "Plain text" and "Sensitive" loaded
from the "preview" environment on EAS: EXPO_PUBLIC_BACKEND_API_ORIGIN,
EXPO_PUBLIC_NATIVE_REDIRECT_URI". It ran from a working tree still carrying
the uncommitted link config, so it is recorded as the mint, not the evidence.

The evidence build ran non-interactively from the committed clean tree
(`git status --short` empty at `034b269`):

```
npx eas-cli build --platform android --profile preview --non-interactive --no-wait
npx eas-cli build:view --json f11432c5-1680-4e64-98f1-072b244eaf44
  status FINISHED, platform ANDROID, profile preview
  appIdentifier ai.autom8x.snoopy, appVersion 1.0.0, buildVersion 1, sdk 54.0.0
  gitCommitHash 034b2699a25b58701ad79b83290f02f5db70fa7b   ← this repo's commit
  ownerAccount autom8x.ai, project snoopy-mobile
  created 2026-08-27T06:15:35Z, completed 2026-08-27T06:35:10Z, APK artifact
```

Build page:
https://expo.dev/accounts/autom8x.ai/projects/snoopy-mobile/builds/f11432c5-1680-4e64-98f1-072b244eaf44

The downloaded artifact hashes to SHA-256
`2f00e52c08f142f8f789da07eacf4c76b7e3ea7922f3da2efdeb76efbb8647db`, and
`apksigner verify --print-certs` names the EAS keystore's certificate as its
signer (finding 1 carries the full fingerprint; every elided form in this
file refers to that register). EAS's own record naming this repository's
commit is what ties the artifact to the audited tree.

Two qualifications, so nothing reads as more than it is:

- **No production build ran, and none is claimed.** The gate line reads
  "preview/production" and the master plan's §0 says an Android profile
  build satisfies it. Both EAS environments now carry the two values
  (`eas env:list production` answers both, created this session), so nothing
  this round controls blocks the production profile's first build; it simply
  has not happened, and this line's OBSERVED covers the preview build only.
- **Reproducing from the evidence commit needs eas-cli ≥ 22 despite that
  commit's own floor.** The `cli.version` rise to `>= 22.0.0` landed one
  commit after `034b269`, so the evidence commit still declares `>= 5.9.0`
  while carrying the 22-era `environment` key; an older CLI satisfying that
  floor rejects the file at schema validation.

## 19a — Android native launch on a runner with the Android SDK/emulator: OBSERVED

The runner is this audit host, provisioned this round: Android
commandline-tools via Homebrew at `/opt/homebrew/share/android-commandlinetools`
with `platform-tools` (adb 37.0.1), `emulator`, `platforms;android-35` and
`system-images;android-35;google_apis;arm64-v8a`; AVD `snoopy` (Pixel 7,
Android 15, arm64). `adb devices` answers `emulator-5554 device`, and the
image ships `com.android.chrome` (the Custom-Tabs user agent 19c needs).

The launch (2026-08-27), using the 19b evidence APK — the cloud artifact
whose EAS record names commit `034b269`, which is what ties this launch to
the audited tree (the iOS precedent in DESIGN-GAPS.md is a local build; no
19a wording requires one, and the cloud artifact carries stronger
provenance):

```
adb install -r snoopy-evidence.apk        → Success
adb shell am force-stop ai.autom8x.snoopy
adb shell am start -W -n ai.autom8x.snoopy/.MainActivity
  Status: ok
  LaunchState: COLD
  Activity: ai.autom8x.snoopy/.MainActivity
  TotalTime: 750
adb shell pidof ai.autom8x.snoopy         → 5027 (alive)
dumpsys package: versionCode=1 versionName=1.0.0 targetSdk=36
emulator: google/sdk_gphone64_arm64 … :userdebug, Android 15
```

The screen was captured and inspected, not inferred: the real onboarding
screen renders — the A8X mark, "Every repetitive task, done by an agent.",
Get started and Log in — in the Nocturne dark palette. `pm get-app-links`
after install reports the installed signature (`52:B8:96:0B:…:5D:74`) and
`app.autom8x.ai: legacy_failure`, which is the deployed placeholder file
failing verification, recorded under findings, not converted into anything.

## 19c — authenticated §1 journey from the native client against the deployed Edge: NOT OBSERVED (start leg observed; blocked by deployment configuration)

The §1 journey is BUILD-PLAN §1's end-to-end path — Login; See the automation;
Subscribe; Connect the accounts; Trigger and dispatch; The automation works;
Hold, approve, complete — not merely a login that reaches a screen. The state
of each step from the native client is recorded below, live blocks included;
per this repository's standing rule an externally-blocked step is NOT
OBSERVED, never PASS.

Preconditions verified live this session (2026-08-27):

- `GET https://api.autom8x.ai/health/live` → 200 over public Let's Encrypt
  TLS.
- `GET https://api.autom8x.ai/v1/auth/providers` → 200, providers
  google/microsoft/apple, `passwordLoginEnabled: false`.
- All three `GET /v1/auth/native/{provider}/start` with
  `redirect_uri=https%3A%2F%2Fapp.autom8x.ai%2Fauth%2Fnative%2Fcallback`, a
  43-char S256 challenge and `code_challenge_method=S256` → **302** into the
  platform's own OAuth authorize URL (the Edge's own transaction PKCE, its
  `redirect_to` pointing at the Edge's server-side callback — the ADR-0017
  shape: the backend is the OAuth client; the device PKCE pair binds only the
  sealed-code exchange). Round 6 recorded 503 `native_app_redirect_uris` on
  this exact probe; the deployed Edge's allowlist now carries the URI.
- Every §1 endpoint the generated clients can call was probed unauthenticated
  and read-only against the deployed Edge: zero 404s on any GET route; every
  workspace-scoped route answers 401 without credentials (auth enforced,
  route live). The four unauthenticated credential POST routes
  (`/v1/auth/native/token`, `/refresh`, `/v1/auth/logout`,
  `/v1/connections/native/complete`) answer 404 to a GET probe, which a
  method-specific router makes ambiguous read-only — they are exercised by
  the journey itself, not by a probe.

**Observed this session, from the shipped native client on the emulator
(2026-08-27):**

- Cold launch renders onboarding; Log in renders the contract's auth screen —
  Email/Password with the policy-fixed "Stay logged in", Face ID entry, and
  Continue with Google / Microsoft / Apple.
- Tapping **Continue with Google** opened the system Custom Tab (Chrome) on
  the Edge's start URL with the device's PKCE challenge and the claimed
  redirect URI; the deployed Edge accepted it and 302'd into the platform's
  Supabase authorize URL — the ADR-0017 start leg, live, from the native
  client, against the deployed Edge.
- The tab then rendered Supabase's answer: **`400 validation_failed —
  "Unsupported provider: provider is not enabled"`** (screenshot captured).
  The journey stops at the platform's own OAuth boundary: the deployed
  Supabase project has no Google provider configured. This is finding 2.
- Dismissing the tab returned the app to the Log in screen with the same pid
  (5027) and no error state — `openAuthSessionAsync` resolving `dismiss` →
  `cancelled`, the contract's non-failure path, observed live.

**NOT OBSERVED, each with its live cause, none converted to PASS:**

- **Step 1 completion, steps 2–4, and the implemented §1 mutations**
  (subscribe/Add, configure/Activate, approval decision): blocked by finding
  2 (no OAuth provider enabled on the platform's Supabase project) and, once
  that is fixed, by finding 1 (the placeholder `assetlinks.json` fingerprint
  keeps the `https` return leg from re-entering the app — the OS already
  reports `legacy_failure` for `app.autom8x.ai`). Both fixes are
  deployment-side; the runner stays staged — evidence APK installed, emulator
  live — and the journey resumes at the Google credential entry, which only
  the account owner may perform.
- **Steps 5–7, artifact-bearing segments**: `GET
  https://api.autom8x.ai/health/ready` → 503 `not-ready`,
  `object_store: adapter_not_configured` (finding 4). Unobservable from any
  client until the deployment configures an object store.

## CI on the round branch

The round's commits were moved onto `round-7.5-observations` (local `main`
was reset to the Round 6 merge `7490231` and never pushed ahead of it), and
PR #6 opened against `main` — the only mechanism that triggers CI
(`.github/workflows/ci.yml` runs on `pull_request` and `push: main` only,
the same lesson Round 6 recorded). All five jobs GREEN on run
`33176482529` (2026-08-28):

```
Typecheck 30s · Architecture gates 34s · Lint 48s · Test 1m8s
Native bundle export 2m1s
```

The Test job reproduces 32 suites / 397 tests / 78 snapshots exactly on the
GitHub runner, matching this session's local runs — the counts are a
property of the code, not of this laptop. PR #6 merges this state — the
19a/19b evidence and the staged 19c record — as a merge commit, never a
squash: a squash would leave `034b269`, the hash the EAS evidence build's
record names, off `main`'s history. The 19c journey evidence, which waits
on two deployment-side fixes recorded in the findings below, lands as its
own branch and PR against this same record when those clear.

## Findings reported for a `snoopy-backend` / deployment session to file

Per the master plan's rule, this session edits `snoopy-mobile` only; each item
below is a report, not an edit.

1. **`https://app.autom8x.ai/.well-known/assetlinks.json` still serves the
   placeholder fingerprint** (`REPLACE:WITH:THE:SHA256:FINGERPRINT:…`). With
   `autoVerify: true`, Android 12+ never shows a disambiguation sheet: an
   unverified `https` callback stays in the browser, the callback answers
   204, the tab dead-ends and the app reports "cancelled" — the 19c return
   leg cannot complete on any device until the real fingerprint is deployed.
   The EAS keystore now exists; the signing certificate's SHA-256 is

   `52:B8:96:0B:D3:FA:FB:08:DD:06:D8:A3:30:24:15:6F:FC:31:1F:F8:AA:36:66:9C:E8:DF:E8:F1:8F:4A:5D:74`

   — this colon-form value is the single register for the fingerprint; every
   elided form elsewhere in this file refers here. It was read from the
   shipped APK with `apksigner verify --print-certs`
   (`52b8960bd3fafb08dd06d8a33024156ffc311ff8aa36669ce8dfe8f18f4a5d74`), and
   confirmed by the OS after install: `adb shell pm get-app-links
   ai.autom8x.snoopy` reports `Signatures: [52:B8:96:0B:…:5D:74]` with
   `app.autom8x.ai: legacy_failure` — the device asking for exactly this
   fingerprint and the deployed file not carrying it. The served
   `sha256_cert_fingerprints` array accepts multiple entries.
2. **The deployed platform's Supabase project has no OAuth provider
   enabled.** Observed live from the native client: the Edge's
   `/v1/auth/native/google/start` 302s into the platform's Supabase
   authorize URL, and Supabase answers `400 validation_failed — "Unsupported
   provider: provider is not enabled"` in the browser. The Edge's allowlist
   and start leg are correct; the OAuth client registration (Google, and
   presumably Microsoft/Apple) and its enablement in the Supabase Auth
   configuration do not exist yet. No client — web included — can complete a
   login until this is configured; it needs the owner's Google Cloud OAuth
   client credentials and is deployment configuration, not repository
   source.
3. **`apple-app-site-association` still carries `TEAMID`** and
   `applinks.apps: []`. Not a 7.5 blocker (the Android profile satisfies
   19b), but iOS native login has the same dead-end until an Apple team
   exists and the file is real.
4. **`GET https://api.autom8x.ai/health/ready` → 503 `not-ready`:
   `object_store: adapter_not_configured`** (identity, access_session,
   automations, connections, entitlements all ok). Artifact-bearing segments
   of §1 steps 5–7 are unobservable from any client until the deployment
   configures an object store; recorded under 19c as NOT OBSERVED with this
   cause.
5. **This repository's `CLAUDE.md` still frames the session rules as Round 6**
   ("This is the one open repository for Round 6…"). The master plan's §0
   overrides it and did direct this session correctly, but the next
   `snoopy-mobile` session inherits a stale first paragraph; refreshing it is
   a governance edit the round's owner should authorize rather than a 7.5
   scope item.

## Findings in this repository, recorded rather than fixed

Round 7.5's scope is the three observations; none of these is one, so they are
recorded for the close audit or a later round.

- **`__tests__/app-config.test.js` asserts the resolved `extra` against a
  synthetic `extra: {}` fixture**, so nothing pins `extra.eas.projectId`
  surviving `app.config.js`'s spread. If the factory ever stops spreading
  `config.extra`, the project link silently vanishes from resolved config and
  the suite stays green.
- **`signInWithProvider` does not catch `NoMatchingActivityException`** from
  `expo-web-browser` on a device with no browser at all; it would propagate
  uncaught rather than becoming a `failed` outcome. Unreachable on any normal
  device (and on this round's emulator, which ships Chrome); a robustness
  gap, not a journey blocker.
- **`npx expo-doctor` answers 17/18**: `expo-local-authentication@17.0.8`
  installed vs `~17.0.9` expected by SDK 54 — patch-level drift, no observed
  effect; `npx expo install --check` fixes it when a dependency change is in
  scope.
- **The release env values now live in EAS dashboard state, which nothing
  versions or reviews.** `app.config.js` validates the redirect URI's shape
  (absolute, HTTPS, plain), not its value, so a well-formed wrong URI would
  pass config and derive app-link claims for the wrong host. ADR-0017 fixes
  the value as a constant; a release-profile guard asserting equality with it
  in `app.config.js` — where the other release guards already throw — would
  pin the one unversioned place the value now lives. A source change, so
  recorded here for the close audit rather than made.

---

# Round 7.5M — mobile completion re-entry

Master plan §0.1 audited completion order, step 5, this repository only.
Session date: 2026-09-03. Recorded the way the sections above are recorded:
the command, and what it answered. A line that could not be observed says so
and why; nothing here converts NOT OBSERVED into PASS.

Entry verified by command before any work: `main` = `origin/main` = `cf7b5ed`,
`git status --short` empty; `GET https://api.autom8x.ai/health/ready` → 200
`ready` with five checks (`identity`, `access_session`, `automations`,
`connections`, `entitlements`, all `configured` — the 7.5 finding 4
`object_store` check is gone, not fixed-by-replacement); both `.well-known`
app-claiming files 200; the EAS project linked (19a/19b stand as recorded
above). The Round 7.5 finding 5 — a stale `CLAUDE.md` — is the first thing
this round changed.

Work went through branch `round-7.5m-mobile-completion` → PR #9 → CI → merge.
The implementation commit is `f40cec0`; CI run `33782784151` GREEN on all
five jobs (Architecture gates 38 s · Lint 52 s · Typecheck 38 s · Test 1 m 29 s
· Native bundle export 1 m 33 s), the Test job reproducing 34 suites / 423
tests / 78 snapshots on the GitHub runner. PR #9 merges this state as a merge
commit, never a squash — a squash would leave `f40cec0`, the hash the EAS
evidence build's record names, off `main`'s history. The 19c journey
evidence, which waits on the owner's interactive sign-in, lands as its own
branch and PR against this record when it exists.

## The four recorded findings, dispositioned

1. **`extra.eas.projectId` pinned in a real-config test — done.**
   `__tests__/app-config.test.js` now runs the config factory over the
   committed `app.json` under the production profile — the evaluation a cloud
   build performs — and asserts `extra.eas.projectId ===
   cb806193-8885-4b5c-b1d6-850da3f162a2`, `owner === autom8x.ai`, the bundle
   identifier, the package, and that the derived app-link claims merge into
   the static native config without dropping it. Proved to bite by injection:
   with the `...config.extra` spread deleted from `app.config.js` in place,
   the suite answers 2 failed / 9 passed — exactly the two real-config cases —
   and the file was restored (`git status` clean for it) before anything
   else ran.
2. **Browserless auth failure handled — done.** `expo-web-browser`'s Android
   module throws `NoMatchingActivityException` (code
   `ERR_NO_MATCHING_ACTIVITY`) when nothing can open a Custom Tab and
   `PREFERRED_PACKAGE_NOT_FOUND` when no Custom Tabs provider resolves — read
   from `WebBrowserModule.kt` / `WebBrowserExceptions.kt` in the installed
   package, not inferred. `openSystemAuthSession` in
   `lib/platform/native-auth.ts` wraps the call for login AND connect; both
   codes become `failed` with "No web browser is available on this device to
   continue.", any other rejection becomes a fixed sentence without echoing
   the error, and the sealed exchange is never attempted. Pinned in
   `__tests__/native-auth.test.ts` and `__tests__/platform-mutations.test.ts`.
3. **Expo dependency aligned — done.** `npx expo install
   expo-local-authentication` → `~17.0.9` (lockfile resolves 17.0.9);
   `npx expo-doctor` → **18/18 checks passed**, from 17/18.
4. **Exact release redirect URI enforced — done, and extended.**
   `app.config.js` holds `RELEASE_NATIVE_REDIRECT_URI =
   https://app.autom8x.ai/auth/native/callback` and throws for a preview or
   production build whose value differs byte-for-byte (shape is diagnosed
   first, so a malformed value is still reported as malformed). Four
   well-formed wrong values are refused in the suite, including a trailing
   slash and a case change. The same guard now covers the browser-leg base
   below, for the same reason: both values live only in EAS dashboard state.

## The workspace switcher, over the published active-workspace operation

`PATCH /v1/session/active-workspace` existed in the contract with zero mobile
callers; the completed web client drives it from its top bar (snoopy PR #6,
`68197bf`). The mobile switcher is a UI for the same two operations and
nothing more:

- `lib/platform/workspaces.ts`: `readWorkspaces()` → `GET /v1/workspaces`;
  `selectActiveWorkspace(id, key)` → `PATCH /v1/session/active-workspace` with
  an `Idempotency-Key` minted per selection (`workspace-activate-…`, the web's
  prefix).
- Settings' WORKSPACE row — the design's own row, which already carried a
  caret in `Screen.dc.html` — becomes pressable with two or more workspaces or
  when `SessionResponse.workspacesTruncated` says the session list is
  incomplete; with one workspace it renders exactly as before. The dialog
  (the CONNECTIONS dialog's own styles, no new primitive) reads the collection
  on open, lists name and type, marks the server's `activeWorkspaceId`, and
  refuses to mark a client guess.
- Selecting: the PATCH, then `useSession().reload()` — a re-read of
  `/v1/session` that adopts the platform's answer without passing through
  `restoring`, ends the session only on a 401, and on an outage leaves the
  resolved session in force and says so. `refresh()` was not reused because
  it classifies a failed read as `unavailable`, which the tab guard fails
  closed on: right at launch, an ejection after a switch that landed. A
  failed PATCH stays inline in the dialog; a landed PATCH with a failed
  re-read offers "Reload session" rather than pretending either way.
- Every workspace-scoped read keys on the active workspace id, and the
  client-held overrides are scoped to person + workspace, so the switch
  propagates without any screen holding workspace state.

Pinned by `__tests__/workspace-switcher.test.tsx` (8 cases: inert with one
workspace; opens with two; opens on truncation; collection read failure
inline; PATCH shape and key; re-selecting the active one closes without a
mutation; a 404 stays inline with no re-read; a landed switch with a failed
re-read offers the read again), `__tests__/platform-mutations.test.ts` (the two
operations' exact request shapes) and `__tests__/session-provider.test.tsx`
(`reload()`'s three outcomes). **Live rendering of the switcher on the
emulator is NOT OBSERVED**: it sits behind a signed-in session, which is 19c's
interactive step. The 78 Nocturne snapshots are unchanged in both palettes.

## §12.1 #79's native caveat — what the mobile connect flow does

Read in `apps/api/src/modules/connections/routes.ts` (read-only): the
callback runs `authenticate()` FIRST; only when that throws does
`handleUnauthenticatedCallback` ask Connections for the attempt's native return
target, seal the provider's parameters and redirect to the app. A system
browser that shares a logged-in `www.autom8x.ai` session (Chrome Custom Tabs
share Chrome's cookie jar; `ASWebAuthenticationSession` shares Safari's unless
ephemeral) therefore authenticates, takes the WEB branch, completes the
connection as that web session's user, and `finish()` sends the tab to
`https://www.autom8x.ai/connections?status=connected&provider=…`. The app's
auth session never sees `returnTo`; the person closes the tab; the app receives
`dismiss`/`cancel`.

What the app did with that before this round: `connectOAuthProvider` answered
`cancelled`, `applyConnectionAction` returned, the dialog stayed open and
nothing re-read — a connection that HAD completed stayed "Not connected" until
the screen remounted. What it does now: `cancelled` closes the dialog and
re-reads the workspace's connections (`__tests__/settings-connections.test.tsx`
proves the second read renders "Connected · used by 1 solution" from the
published row while a real `failed` stays inline). The app claims no success
it never received; it re-reads. Two bounds worth stating: (a) if the web
session belongs to a DIFFERENT person than the app's user, the connections
gateway compares the completing actor against the initiator (RFC 9700 §4.7)
and refuses upstream — the app still sees `cancelled`, re-reads, and shows
nothing changed, which is the truth; (b) login is unaffected, because the
login callback chooses its native ending from the transaction cookie, not
from any session. **NOT OBSERVED live**: reproducing it needs a native session
plus a logged-in website session in the emulator's Chrome — both interactive
with the owner's Google account. Reported for the backend: the callback could
consult the attempt's recorded return target BEFORE choosing the web branch,
so a native attempt hands back to the app even from a cookie-sharing browser.

## New finding, found live: the start leg and the callback sit on different hosts

The 7.5 record above says the recorded 19c blocker was the missing OAuth
provider; that is gone (below). Re-probing the start leg from scratch found
the next wall, one hop later, and it is the same topology §12.1 #79 named:

```
GET https://api.autom8x.ai/v1/auth/native/google/start?redirect_uri=…&code_challenge=…&code_challenge_method=S256
  → 302 https://pwpjasbnrfklcteogvmj.supabase.co/auth/v1/authorize?provider=google
        &redirect_to=https%3A%2F%2Fwww.autom8x.ai%2Fapi%2Fplatform%2Fv1%2Fauth%2Foauth%2Fcallback&…
    set-cookie: __Host-autom8x-oauth=<…>; Path=/; SameSite=Lax; HttpOnly; Secure; Max-Age=600
  → 302 https://accounts.google.com/o/oauth2/v2/auth?…      (the account chooser)

GET https://www.autom8x.ai/api/platform/v1/auth/oauth/callback?code=fake-code       (no cookie — what a browser sends)
  → 302 https://www.autom8x.ai/login?error=auth_callback&reason=exchange_failed
GET https://api.autom8x.ai/v1/auth/oauth/callback?code=fake-code  with the api-set cookie
  → 302 https://app.autom8x.ai/auth/native/callback?code=<sealed>                     (the native ending)
GET https://www.autom8x.ai/api/platform/v1/auth/native/google/start?…               (start via the web origin)
    set-cookie: __Host-autom8x-oauth=<…>   on www.autom8x.ai
GET https://www.autom8x.ai/api/platform/v1/auth/oauth/callback?code=fake-code  with that cookie
  → 302 https://app.autom8x.ai/auth/native/callback?code=<sealed>                     (the native ending)
```

`__Host-` cookies are host-only by definition (a `Domain` attribute is
rejected), so a start leg opened on `api.autom8x.ai` — where the app's
`EXPO_PUBLIC_BACKEND_API_ORIGIN` points — sets a cookie the callback on
`www.autom8x.ai` never receives, and every native login ends at the website's
login page with `exchange_failed`. Opened through the web origin's
`/api/platform` rewrite, the cookie lands where the callback is and the Edge
seals the code for the app. ADR-0017 §1's sentence "the start request and the
provider's callback both land on this origin" holds only if the browser is
pointed at the callback's origin; `AUTH_CALLBACK_URL` must share
`PUBLIC_WEB_ORIGIN`'s origin by ADR-0017 §3, so in any deployment where the
Edge and the website are on different hosts the browser leg has to go through
the web origin. Not a contract change: same route, same parameters, same
sealed handoff; only the origin the system browser is pointed at differs. The
bearer API calls stay on `api.autom8x.ai`, where no cookie is needed.

Resolved in this repository as configuration: `EXPO_PUBLIC_NATIVE_AUTH_BASE_URL`
(validated like the other two values; unset falls back to the API origin,
which is right only for a single-origin local Compose stack), pinned to
`https://www.autom8x.ai/api/platform` in preview and production, read by
`nativeAuthBaseUrl()` and used for the start URL only. Created in both EAS
environments this session:

```
eas env:create preview    --name EXPO_PUBLIC_NATIVE_AUTH_BASE_URL --value https://www.autom8x.ai/api/platform --visibility plaintext --scope project
eas env:create production --name EXPO_PUBLIC_NATIVE_AUTH_BASE_URL --value https://www.autom8x.ai/api/platform --visibility plaintext --scope project
eas env:list preview / production → all three EXPO_PUBLIC_* values present in each
```

Reported for a `snoopy-backend` session (below, finding 1): ADR-0017 §1 and
the deployment record should state the browser-facing base as a requirement of
the native contract, or the Edge should carry the native transaction without
a host-bound cookie.

## Gate 8, re-run on this branch at `f40cec0`

| Line | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | `rm -rf node_modules && npm ci` exit 0 in 27.8 s (the recorded iCloud workaround; a plain `npm ci` against the existing tree was not attempted this session). It also cleared **491** iCloud conflict copies under `node_modules` that had made `expo lint` exceed five minutes; on the clean tree lint is 5 s and `tsc` 3.6 s. |
| `npm run verify` | PASS | exit 0 — **34 suites / 423 tests / 78 snapshots** (from 32 / 397 / 78: two new suites, 26 new cases). Four `console.error` lines are `act(...)` warnings from `__tests__/override-scope.test.tsx`, reproduced at the same count on a `main` worktree — pre-existing, not introduced. |
| `npm run audit:dependencies` | PASS | exit 0 — 28 advisories (18 moderate, 10 high, **0 critical**). The count moved from Round 6's 22 with the registry's advisory database, not with the lockfile: the only dependency change this round is `expo-local-authentication` 17.0.8 → 17.0.9. |
| `npx expo-doctor` | PASS | 18/18 |
| `npm run export:ios` / `:android` | PASS | exit 0 each, 18.6 s / 18.1 s; `.hbc` 11,090,703 B (iOS) and 11,086,075 B (Android). Both bundles grepped for the new strings — `Switch workspace`, `/v1/session/active-workspace`, `Reload session`, `nativeAuthBaseUrl`, the no-browser sentence — each present once, ASCII (none are non-ASCII, so no UTF-16 form was expected). |
| `verify:platform-contracts` | PASS | regenerated from the sibling backend checkout: current, no diff — no approved OAuth/scope contract change was waiting to be consumed |
| Nocturne visual unchanged | PASS | 78 snapshots, both palettes, unchanged. Beyond the component gate: the whole Settings screen was rendered with the shared one-workspace test session on a `main` worktree and on this branch and the two react-test-renderer trees diffed — identical except one added `testID` prop on the WORKSPACE row, which is not a visual property. With one workspace the screen draws exactly what it drew before. |
| No hand-written fetch | PASS | `audit:platform` 0 findings; 23 published operations by method and path (21 + `GET /v1/workspaces` + `PATCH /v1/session/active-workspace`) |
| `git status --short` | clean after the commit | — |

## 19c — authenticated §1 journey from the native client against the deployed Edge

### Preconditions, re-observed this session (non-interactive)

- `GET https://api.autom8x.ai/health/ready` → 200 `ready`, five checks, all
  `configured`. The 7.5 finding 4 (`object_store: adapter_not_configured`)
  is gone.
- The 7.5 finding 2 (no OAuth provider enabled) is gone: the native start now
  302s Edge → Supabase authorize → **`https://accounts.google.com/o/oauth2/v2/auth?…`**
  (the account chooser), where on 2026-08-27 Supabase answered
  `400 validation_failed — provider is not enabled`.
- The 7.5 finding 1 (placeholder `assetlinks.json`) is gone:
  `https://app.autom8x.ai/.well-known/assetlinks.json` serves the EAS
  certificate's `52:B8:96:0B:…:5D:74`, and on the emulator
  `adb shell pm verify-app-links --re-verify ai.autom8x.snoopy` followed by
  `pm get-app-links` answers **`app.autom8x.ai: verified`** — where 7.5
  recorded `legacy_failure`. The `https` return leg can re-enter the app.
- The start-leg/callback host split found above is resolved for this build by
  `EXPO_PUBLIC_NATIVE_AUTH_BASE_URL`, and the callback's native ending was
  observed by command with the transaction cookie present (the sealed
  `code=` redirect to `app.autom8x.ai/auth/native/callback`).
- `apple-app-site-association` still carries `TEAMID` and `applinks.apps: []`
  (7.5 finding 3, unchanged): iOS remains dead-ended until an Apple team
  exists. The Android profile is the 19c path, as it was the 19a/19b path.

### The build, and the staged start leg — OBSERVED from the shipped client

The evidence build ran non-interactively on EAS from the committed, pushed
tree at `f40cec0` (`git status --short` empty), profile `preview`, platform
Android, after CI had gone green on the same commit:

```
npx eas-cli build --platform android --profile preview --non-interactive --no-wait
npx eas-cli build:view --json 3ea8a363-0599-4d46-bf39-209cacede498
  status FINISHED, platform ANDROID, profile preview
  appIdentifier ai.autom8x.snoopy, appVersion 1.0.0, buildVersion 1, sdk 54.0.0
  gitCommitHash f40cec08b0ace09f4b28695068ff8f5e606261bf   ← this branch's commit
  created 2026-09-03T17:12:24Z, completed 2026-09-03T17:43:01Z (≈28 min in queue, ≈3 min building)
```

Build page:
https://expo.dev/accounts/autom8x.ai/projects/snoopy-mobile/builds/3ea8a363-0599-4d46-bf39-209cacede498

The artifact (90,170,548 B) hashes to SHA-256
`86115a3cc6eba645e15ca920eabdad079aabb0dfbdfcea9707abea86b32ca3a7`;
`apksigner verify --print-certs` names the same EAS certificate as 19b
(`52b8960b…4a5d74`), so the deployed `assetlinks.json` fingerprint covers it.

Staged on the emulator (`emulator-5554`, AVD `snoopy`, Android 15, the 19a
runner), by script, from the downloaded artifact:

```
adb install -r snoopy-7.5m.apk                    → Success (versionCode 1, versionName 1.0.0, targetSdk 36)
adb shell pm verify-app-links --re-verify ai.autom8x.snoopy
adb shell pm get-app-links ai.autom8x.snoopy      → Signatures: [52:B8:96:0B:…:5D:74]
                                                    app.autom8x.ai: verified
adb shell am start -W -n ai.autom8x.snoopy/.MainActivity
                                                  → Status: ok, LaunchState: COLD, TotalTime: 851
adb shell pidof ai.autom8x.snoopy                 → 4117
```

- Cold launch renders onboarding; **Log in** renders the contract's auth
  screen — the UI dump lists Email, Password, the policy-fixed "Stay logged
  in", Log In, Unlock with Face ID, and Continue with Google / Microsoft /
  Apple (the provider list as `/v1/auth/providers` publishes it).
- Tapping **Continue with Google** made the shipped client fire
  `act=android.intent.action.VIEW dat=https://www.autom8x.ai/…` to
  `com.android.chrome` (`ActivityTaskManager`, twice, 12:44:00 and
  12:45:29) — the browser-leg base in effect in the release bundle, not on
  the API origin — and the foreground became Chrome's `CustomTabActivity`.
- The tab rendered **Google's real sign-in page**: address bar
  `accounts.google.com`, "Sign in with Google", the A8X mark, "Sign in — to
  continue to autom8x", Email or phone, Google's Privacy Policy / Terms of
  Service line for autom8x (screenshot captured and inspected, 12:45). That
  is the ADR-0017 start leg live from the native client through the web
  origin, past the Edge and past Supabase, to the provider's own consent
  surface — where on 2026-08-27 the same tap ended at Supabase's
  `provider is not enabled`.
- Back dismissed the tab; the app was foreground again on the same pid 4117,
  on the Log in screen, with no error callout — `openAuthSessionAsync`
  resolving `dismiss` → `cancelled`, the contract's non-failure path.

This is the start leg, observed. It is not the journey. The credential entry
that follows is the owner's, below.

### The interactive part, for the owner

Everything below the sign-in is staged on the emulator (see the build and
staging record that follows). The Google credential entry is the one step
this session cannot perform. When you are at the machine:

1. The emulator (`emulator-5554`, AVD `snoopy`) shows the app on the **Log
   in** screen. If it does not, run
   `adb shell am start -n ai.autom8x.snoopy/.MainActivity`, tap **Log in**.
2. **Do not** sign in to `www.autom8x.ai` in the emulator's Chrome first: a
   shared website session is exactly the §12.1 #79 caveat, and it is a
   separate observation (step 6).
3. Tap **Continue with Google**. A Chrome Custom Tab opens on
   `www.autom8x.ai/api/platform/v1/auth/native/google/start…` and lands on
   Google's account chooser. Sign in with the account you used for the web
   Gate 4.5 journeys. Consent if asked.
4. Expected: the tab closes by itself and the app lands on **Home** with your
   name and workspace. If instead the tab shows the website's login page with
   `error=auth_callback`, stop and report the URL bar — that is the callback
   refusing, and the reason parameter is the finding.
5. Then, from the app: **Solutions** (step 2, see the automation) → **Add**
   on `invoice-check` (step 3, subscribe) → **Settings → CONNECTIONS → the
   Google provider row (its title is the published `displayName`) →
   Connect** (step 4, consent in the Custom Tab; expected: the tab closes and
   the row reads "Connected · used by N solution(s)" with the server's
   count). If you hold two workspaces, **Settings → WORKSPACE row** now opens
   the switcher; switch and watch every screen follow.
6. Optional, the #79 caveat: sign in to `www.autom8x.ai` in the emulator's
   Chrome, disconnect the Google provider in the app, tap Connect again. Expected: the tab
   finishes on the website's connections page; close it; the app's dialog
   closes and the row re-reads as connected.
7. Steps 5–7 of §1 (trigger, run, hold, approve): the native client has no
   trigger operation (`createRun` has no caller; Run-now is web gate
   scaffolding), so trigger from the web's Run-now, then observe the run in
   the app's **Activity**, approve it in **Approvals**, and watch the
   continuation appear.
8. After step 4, run `19c-after-signin.sh` from the session scratchpad (it
   captures the callback intent the OS delivered — code redacted — the pid,
   and a Home screenshot) and, for each later step, `adb exec-out screencap
   -p > <n>.png`. Hand the screenshots and the callback line to the session
   recording this file.

Until those steps are performed, **19c is NOT OBSERVED**: the start leg is
observed from the shipped client (below), the return leg is observed by
command, and the authenticated journey itself is not. Nothing here is a PASS.

## Findings reported for a `snoopy-backend` / deployment session to file

1. **The native start leg and the OAuth callback sit on different hosts, and
   ADR-0017 §1 does not say so.** Evidence and the mobile-side resolution are
   above. Owed a backend decision: either record the browser-facing base
   (`PUBLIC_WEB_ORIGIN` + the website's `/api/platform` rewrite) as a stated
   requirement of the native session contract and the deployment record, or
   carry the native transaction without a host-bound cookie. Either way the
   README's local-Compose instructions stay valid, because a single-origin
   stack needs no base.
2. **§12.1 #79's native residue can be closed on the callback side.**
   `completeAuthorization` authenticates before it asks the attempt for a
   return target; consulting `readReturnTarget(state)` first would let a
   native attempt hand back to the app even from a cookie-sharing browser. The
   mobile client now re-reads on `cancelled` so the connection is shown, but
   the app-return itself is still skipped.
3. **`apple-app-site-association` still carries `TEAMID`** (7.5 finding 3,
   unchanged; not a 7.5M blocker).
4. **7.5 finding 5 (stale `CLAUDE.md`) is resolved here**, in this
   repository, as §0.1 step 5 directed.
5. **`npm audit --omit=dev` now reports 28 advisories (18 moderate, 10 high,
   0 critical)** against Round 6's 22; the lockfile changed by one patch
   version. The critical gate holds; the drift is the registry's, and the
   documented resolution remains an Expo SDK major.

## Findings in this repository, recorded rather than fixed

- **`__tests__/override-scope.test.tsx` emits four `act(...)` warnings** on
  its rerender path, on `main` and on this branch alike. Cosmetic; a test
  concern, not a product one.
- **iCloud strays**: empty untracked directories `lib/platform 2`,
  `lib/generated 2`, `lib/view 2`, `lib/content 2` and two stale
  `.git/index 2` / `.git/index 3` copies exist in this checkout; 491 conflict
  copies under `node_modules` were cleared by the reinstall. The empty
  directories are inert to git and to every gate (they contain no files) and
  were left alone rather than deleted from inside a round.
- **The four gate blind spots from `DESIGN-GAPS.md` remain** (`audit:tokens`
  and `audit:credentials` skip `constants/` and `.js`). Not in this round's
  scope; still latent, not live.

## 19c, continued — the owner signed in; steps 1–4 verified in the live database

The owner performed the interactive part on the staged emulator on
2026-09-03 between 13:48 and 13:55 local (18:48–18:55Z). Recorded from three
sources, none of them the app's own claim: the emulator's OS log, the
platform's Supabase project (read-only SQL through the Supabase MCP; no token
column was ever selected), and screenshots.

**Step 1 — Login: OBSERVED.**

- `ActivityTaskManager` logged the shipped client firing
  `act=android.intent.action.VIEW dat=https://www.autom8x.ai/…` to Chrome at
  13:48:32 and again at 13:49:23 (the start leg on the web origin — the
  browser-leg base, in the release bundle).
- At 13:53:14 the OS delivered `act=VIEW cat=[BROWSABLE]
  dat=https://app.autom8x.ai/… cmp=ai.autom8x.snoopy/.MainActivity` — the
  verified app link carrying the callback back into the app, which is the
  return leg 7.5 could not get past.
- `auth.sessions` holds a new row for the user, created
  `2026-09-03 18:53:16Z`, `user_agent = node`, `ip = 64.225.8.140`: the
  session was minted by the Edge, server-side, from the sealed code — the app
  never touched Supabase, as ADR-0017 requires. The previous session on that
  user is the web's, created 03:30Z.
- The app rendered Home and every tab behind the fail-closed guard (the
  Settings screenshot shows the session's user, "Personal · personal · owner").

**Step 2 — See the automation: OBSERVED.** Solutions rendered the catalog;
the Set up Invoice check screen rendered the manifest's `setup[]` fields
(Hold above, Email the outcome to) from the published entry.

**Step 3 — Subscribe / activate: OBSERVED.** `catalog.idempotency_records`
holds two keys minted by this client — `pause-…` at 18:53:42Z and
`activate-…` at 18:53:46Z — and `catalog.subscriptions` row
`c40192b6` (`invoice-check` v2, created from the web at 02:12Z) now carries
`config = {holdAboveAmount: 500, notifyEmail: <the owner's address>}`,
`status = live`, `unmet_connections = []`, `updated_at = 18:53:46Z`: the
values typed on the phone, accepted by the platform.

**Step 4 — Connect the accounts: OBSERVED as REUSE, which is the product
goal, and the owner's question about it answered by the data.** The owner
saw Google already "Connected · used by 1 solution" and no Google consent
screen, unlike the web. The database says why:

- `connections.connections` `175ec348` is the workspace's live Google
  connection, created **from the web at 15:31:14Z** by attempt `f39915f5`
  (`redirect_uri` on www, `return_to` null — a web attempt), with
  `granted_scopes` including `gmail.send` and `gmail.readonly`. That web
  connect is where the consent screen was shown, once.
- `connections.audit_events` holds `action = connection.reuse`,
  `outcome = allowed`, `caller_service_id = edge`, actor = the owner, resource
  = that connection, at **18:53:17Z — one second after the native session
  was created**. That is ADR-0019 §3's login-grant adoption path checking
  and §2's rule: the required scopes were already present on the workspace's
  server-owned grant, so the connection was reused and **no authorization
  attempt was created** (the newest attempt is the web's, 15:31Z). No consent
  screen is the correct outcome, not a missing one.
- The connection's `last_validated_at` moved to 18:52:34Z during the login.

**Steps 5–7 (trigger, run, hold, approve): NOT OBSERVED from the native
client at the time of writing.** `runs.runs` and `runs.approvals` hold no row
for this subscription after 18:48Z. The trigger must come from the web
(Run-now) since the client has no trigger operation; the observation of the
run in Activity and the decision in Approvals from the phone is still owed.

**The switcher was correctly hidden**: `access.workspace_memberships` holds
exactly one workspace for this user (`Personal`, owner) and the session is
not truncated, so the WORKSPACE row rendered inert, exactly as the tests say
it must. Its live render remains NOT OBSERVED for want of a second workspace.

## Two defects found on the phone during the journey, fixed in PR #11

The first screen this repository has ever shown in the **light palette on a
device** was the owner's Settings tab, and it was wrong:

1. **Every elevated card drew nothing in light mode.** The section cards
   rendered as empty white rectangles while `uiautomator dump` listed all 36
   of their text nodes at the right bounds — laid out, not composited. The
   two cards on the same screen without `overflow: 'hidden'` (Appearance,
   Sign out) rendered. The light palette's `--shadow-sm` is an Android
   `elevation` where the dark palette's is a hairline border, so every
   dark-mode inspection through Rounds 6–7.5 passed and the defect waited for
   light mode on Android 15 / RN 0.81.5 / the new architecture. Nine sites
   combined elevation with clipping: eight `SurfaceCard` styles (Settings,
   Home runs, Activity, Run, Notifications, Configure, Setup, Flow detail)
   and the Face ID scan box. Fixed by removing the clip from the eight cards
   (nothing inside needed it) and splitting the scan box into a glow wrapper
   and a clipping ring; `__tests__/android-card-overflow.test.js` now refuses
   the combination and fails on `main` naming all nine.
2. **Settings counted "0 active · $0/mo" against a subscription the database
   showed as `live`.** The marketplace's pause (18:53:42Z) set the
   client-held override to false and the setup screen's Activate
   (18:53:46Z) never set it back, so Settings read a stale local override
   over the server's `subscribed: true` until the next cold launch.
   `useSolutions().setActive` states the outcome of an accepted mutation and
   both call sites use it; pinned in `override-scope.test.tsx`.

Both were invisible to the Jest gates by construction — no Jest render can
observe Android compositing, and the override defect needed two screens'
mutations in sequence — and both are the kind of finding the master plan's
"see how a user will interact" line exists for.

### PR #11 verified on the device, and two observations the reinstall produced

EAS build `30f0ea01-13c1-4774-9559-9fc31491430e` (profile `preview`, Android,
`gitCommitHash 16d92db`, completed 2026-09-03T20:04:53Z, artifact SHA-256
`2821d618aa1e955d05b3c16b69581a893d255ba79f0ddeada5d991e74a626401`, same
signer) was installed over the signed-in app with `adb install -r`.

- **Light mode, every affected screen, drawn.** Settings (all six cards with
  their rows), Home (the three stat tiles, the review banner and the RECENT
  RUNS card with four rows), Activity (seven rows under TODAY / YESTERDAY),
  Flows (the Invoice check card, "Live", "7 runs · 3 ok · 2 failed") and
  Solutions — screenshots captured at 15:11 local and inspected. The same
  Settings screen that was six empty rectangles at 14:00 now reads
  "Solutions total · 1 active from the published catalog", which is also the
  override defect's truth on a fresh launch.
- **The session survived the reinstall.** `SecureStore.xml` under the app's
  `shared_prefs` (read as root on the userdebug emulator; key names only,
  never values) still held the three `key_v1-autom8x.*` entries with their
  13:53 mtime after the install.
- **Launch-time renewal, observed live.** The access token minted at 18:53Z
  had expired by the relaunch at 20:10Z; `auth.sessions 6d7ad2bf` now shows
  `refreshed_at 2026-09-03T20:10:25Z`, refresh token 15 `revoked = true` and
  token 16 issued with a parent — `refreshSession()` at launch, through
  `/v1/auth/native/refresh`, from the shipped client, and the app opened on
  Home ("Welcome back, Siddak · Your agents ran 5 tasks today").
- **The FIRST launch after the install landed on Welcome with the credential
  intact.** That launch's `am start` took 13.0 s against 0.85 s for the
  second; Supabase's auth logs show no token call for it, and the enclave
  entries were untouched, which is the `unavailable` branch — the credential
  preserved, the guard failing closed — and not a sign-out. The transport's
  request timeout is 10 s. Whether the renewal call was cut off by the cold
  start or never left the process is NOT DETERMINED from the device (release
  builds emit no client log, by design); recorded as observed, with the
  second launch's renewal as the counter-evidence that the path works.
  A person who sees Welcome once after an update and taps Log in would get
  the provider buttons, not their session; worth a look in Round 7F.

Steps 5–7 remain NOT OBSERVED from the native client at the time of this
commit: the newest run in the platform is still `d81cc20d` (15:42Z) and the
phone's Activity shows that history correctly, held rows included, with the
Home banner reading "0 items need your review" because every approval is
decided.

## 19c — steps 5–7 OBSERVED from the native client; the journey is complete

Performed 2026-09-03 20:28–20:32Z on the same emulator, against the deployed
Edge, with the fixed build (`30f0ea01`, commit `16d92db`). Every row below
was read from the platform's database after the fact; every screen was
captured and inspected.

**Step 5 — Trigger.** The native client has no trigger operation (`createRun`
has no caller; Run-now is web gate scaffolding by owner direction), so the
trigger came from the website. It was performed by this session INSIDE the
emulator's Chrome, not on the owner's desktop: `www.autom8x.ai/login` →
Continue with Google → Google's account chooser already held the session the
native login had created in Chrome's cookie jar → Continue on "You're
signing back in to autom8x" → the dashboard. No password was entered and no
credential left the device. On `/account/automations`, Run now with
`{"vendor":"Acme","amount":750,"reference":"INV-003"}` (typed by key events
after `input text` dropped the quotes) landed on
`/account/runs/ebbad4d8-…`:

```
runs.runs         ebbad4d8  origin manual  created 20:28:10.13Z  status held  ended 20:28:11.85Z
runs.run_steps    ebbad4d8  receive  ok    "Invoice INV-003 from Acme"                      20:28:11.17Z
                  ebbad4d8  validate held  "Amount $750.00 is above the $500.00 threshold"  20:28:11.67Z
runs.approvals    13f95fd1  run ebbad4d8  step validate  pending  20:28:11.85Z
                            reason "Acme — $750.00, above the $500.00 threshold"
runs.audit_events run.create allowed 20:28:10.43Z · run.complete allowed 20:28:11.97Z (caller edge)
```

**Step 6 — The automation works and holds.** Above: `receive` ok, `validate`
held, the run ended held, the approval minted with the automation's own
reason text. The phone's Home banner read "1 items need your review".

**Step 7 — Hold, approve, complete — from the phone.** Home banner →
Approvals rendered "Needs review · 1", the card "INVOICE CHECK · 1m ago ·
Invoice check · Check the amount", the reason, Approve and Reject. Approve
was tapped at 20:30:10Z. The screen then read "Needs review · 0", "All
caught up — decisions synced to your workflows." and "Approved ✓ — agent
resuming" (screenshots `63-approvals.png`, `64-approved.png`).

```
runs.audit_events approval.decide allowed  actor e8fe5f8a (the owner)  caller edge  20:30:11.38Z
runs.approvals    13f95fd1  approved  decided_at 20:30:11.11Z  decided_by e8fe5f8a  continuation 7e826c5c
runs.runs         7e826c5c  origin approval-continuation  continues ebbad4d8  root ebbad4d8
                            created 20:30:11.11Z  succeeded  ended 20:30:13.83Z
                            result_summary "Recorded INV-003 after approval"
                            output {reference INV-003, vendor Acme, amount 750, decidedBy "after approval", notified true}
runs.run_steps    7e826c5c  post    ok  "Recorded INV-003 after approval"   20:30:11.84Z
                  7e826c5c  notify  ok  "Emailed the outcome of INV-003"    20:30:13.61Z
runs.audit_events run.complete allowed 20:30:13.93Z
```

The outcome email went through the workspace's own Google grant — the
connection the phone showed as reused at 18:53Z — from a decision made on the
phone. After a cold relaunch, Activity listed "Recorded INV-003 after
approval · 1m" and "Held · 3m" at the top of TODAY (`66-activity-after-
relaunch.png`), Home read "Your agents ran 7 tasks today" and "0 items need
your review", and the continuation's detail opened from Home's RECENT RUNS as
"Run eb826da8" (the run's `requestId` prefix, the §12.1 #69 substitute for a
human run number), Success, 2 s, "2 / 4 steps done", Confidence "—"
(unpublished, rendered as the design's unavailable value), with `post` and
`notify` done at 15:30 local (`69-run-detail.png`).

**19c disposition: OBSERVED**, with one qualification stated rather than
hidden: the trigger is web-originated by design, executed from the same
device inside Chrome, and the native client observed, held, approved and
completed. §1's seven steps have now each been exercised from the native
client against the deployed Edge, with the database as the witness.

### Findings from the journey, recorded for the owner and Round 7F

1. **Tabs go stale after a mutation made elsewhere.** Every tab reads on
   mount and on the error state's Retry only — no re-read on focus, no pull
   to refresh (`hooks/use-resource.tsx`, and none of the tab screens add
   one). One minute after the run existed, the already-mounted Activity tab
   still showed seven rows; after the approval it still did; a cold relaunch
   was needed to see the continuation. The web's `router.refresh()` after
   each action has no mobile counterpart. A re-read on focus that keeps the
   loaded rows in place (no skeleton) is the natural fix, but the design's
   `gLoad` replaces the screen, so it is a design decision, not made here.
2. **Activity rows do not open a run.** Only Home's RECENT RUNS and the
   notifications inbox navigate to run detail; Activity's rows are inert.
   Check against `Screen.dc.html` before changing.
3. **A continuation's timeline shows the root run's steps as not done.**
   "2 / 4 steps done" is true of run 7e826c5c alone; the web's run page shows
   a continuation "under the same root". Joining the root's steps by
   `rootRunId` is a client mapping decision, recorded here.
4. **The appearance preference is not persisted** (already recorded in
   `DESIGN-GAPS.md`): the relaunch came back in Dark.
5. **Chrome's first run on the emulator** asked about notifications before
   the website loaded; unrelated to the product, noted because the owner
   step list said the tab would open directly.
