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
property of the code, not of this laptop. The PR is deliberately left open:
merging is Phase E of the round, after the 19c journey lands on the branch,
and must be a merge commit — a squash would leave `034b269`, the hash the
EAS evidence build's record names, off `main`'s history.

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
