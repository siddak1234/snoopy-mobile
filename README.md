# Autom8x Mobile (`snoopy-mobile`)

The Expo SDK 54 native client for Autom8x. It implements the frozen Nocturne
design on iOS and Android and consumes only the Edge's published OpenAPI
surface.

## Local run

```bash
npm ci
EXPO_PUBLIC_BACKEND_API_ORIGIN=http://localhost:8080 npm run ios
```

Use `http://10.0.2.2:8080` for the Android emulator. Native login additionally
requires an app-claimed HTTPS callback, and — whenever the Edge's callback is
served from a different host than the API, which is every deployment behind a
web proxy — the base the system browser opens the start leg on:

```bash
EXPO_PUBLIC_NATIVE_REDIRECT_URI=https://app.example.com/auth/native/callback
EXPO_PUBLIC_NATIVE_AUTH_BASE_URL=https://www.example.com/api/platform
```

The callback must exactly match the Edge's `NATIVE_APP_REDIRECT_URIS` entry.
`app.config.js` derives the iOS associated domains (`applinks`, and `webcredentials`, which is what `ASWebAuthenticationSession`'s HTTPS callback requires) and the Android verified app link
from this value. The auth base must share an origin with the Edge's
`AUTH_CALLBACK_URL`: the OAuth transaction lives in a host-only `__Host-`
cookie, so the start leg and the callback have to land on one host. Unset, the
browser opens the start leg on the API origin, which is right only for a
single-origin stack such as local Compose. `app.config.js` rejects custom
schemes, malformed values, insecure release values, and preview/production
builds missing any of the three — and pins the release redirect URI and auth
base to the deployment's exact strings.
The iOS deployment target is 17.4 because that is the first version whose
`ASWebAuthenticationSession` can match an HTTPS callback by associated host and
path; no supported build can fall back to scheme-only matching.

## Verification

```bash
npm run verify                    # lint, types, all architecture gates, contracts, tests
npm run audit:dependencies        # critical production dependency gate
npm run export:ios                # production JS/native asset bundle
npm run export:android
```

The individual architecture gates are:

- `audit:credentials`: no pinned demo credentials.
- `audit:tokens`: no raw colour literals outside the theme.
- `audit:type`: no font size outside the type scale — every `fontSize`,
  `lineHeight` and `em()` size is a step of `typeScale` in
  `constants/theme.ts`, followed through a `const`, a default or a local table
  of sizes (24.12).
- `audit:vocabulary`: no copy says "project" or "automation" — the app says
  team and flow; the code keeps the contract's names (24.11.7).
- `audit:haptics`: every press ticks through `components/pressable.tsx` (build
  11, D7) — no Pressable, Touchable or Button imported from react-native
  outside it, no default or namespace import of react-native, no expo-haptics
  import elsewhere, and no Text/View/Image/ScrollView/Animated `onPress` (or
  `onLongPress`, `onPressIn`, `onPressOut`) that is not `pressed(…)`.
- `audit:fixtures`: zero prototype fixture data inside the runtime roots — both
  zero imports (static, dynamic, alias, side-effect and CommonJS forms, in every
  extension Metro resolves) and zero occurrences of the module itself. Design
  data that the suites need lives in `test/design-data.ts`, where nothing under
  `app/`, `components/`, `constants/`, `hooks/` or `lib/` can reach it.
- `audit:platform`: no raw network primitive, alternate network library,
  AsyncStorage, runtime console call, or `openapi-fetch` import outside the
  transport boundary; the transport's one signed upload and one native
  download (`downloadFileAsync`, 24.12) are each budgeted to a single call.
- `verify:platform-contracts`: regenerate from the sibling backend checkout,
  when present, and reject a generated declaration diff.

The gate suites include negative tests that inject forbidden source and prove
the audits fail. `__tests__/nocturne-visual.test.tsx` snapshots all 18 Nocturne
components in dark and light palettes. Do not update those snapshots unless a
visual change is explicitly authorized. One has been: the owner's bigger type
(decision 11, 2026-10-02, "whole app — easy to read"), for which the snapshots
were re-pinned once in build 10 (24.12) — 48 of the 64 Nocturne entries and 10
of the 14 in `screen-state.test.tsx`; the other 20 set no font size.

CI runs lint, typecheck, Jest, all architecture/dependency gates, contract
verification, and both platform exports; `all-green` is the one check that
needs every one of them and is red on any failure, cancellation or skip.
`contract-deployed` (`scripts/verify-deployed-contracts.mjs`) compares each
generated file's sha256 header with the hash the live
`https://api.autom8x.ai/health/live` reports for its document and fails closed
— an unreachable host or an answer with no marker is red;
`platform-requirement.json` (`{"aheadOfDeployed": true}`) is the one reviewed
escape for a change that must land before the platform's, and `release:ios`
refuses any mismatch, escape or not.
`npm run hooks:install` (once per clone; `git config core.hooksPath
.githooks`) puts the same gate before every push: `.githooks/pre-push` runs
`CI=1 npm run verify`, `audit:dependencies` and the salvaged-client-data scan
— everything CI runs but the exports — and refuses the push at the first red
gate, naming it (111 s to green, 3 s to refuse a lint error, measured
2026-10-03); `git push --no-verify` is the bypass for a by-design red push.
`npm run release:ios` (`scripts/release-ios.sh`; `--dry-run` rehearses the
refusals) builds and submits only `origin/main`, clean, with `all-green`
concluded success on HEAD and the live AASA naming the app, and only a build
whose `gitCommitHash` is HEAD with the release's entitlements; `eas.json`
`cli.requireCommit` refuses an uncommitted tree.
`npm run release:ios -- --local` (Round 17, 2026-10-08) builds the same release on
this Mac instead of EAS's cloud — `eas build --local`, with Xcode, CocoaPods and
fastlane, which it refuses without — and so uses no EAS build quota; every gate
above still applies, nothing moves HEAD or the tree during the build, the ipa's
entitlements are checked as the cloud build's are, and it is submitted with
`eas submit --path`. `--local --dry-run` proves the Mac's toolchain as well. Preview and production EAS values are
supplied by the build environment; they are intentionally not committed to
`eas.json`. Since Round 7.5 that means the EAS-hosted `preview` and
`production` environments on the linked project (`@autom8x.ai/snoopy-mobile`):
each release profile names its environment in `eas.json`, both environments
carry the three values, and `app.config.js` refuses a release build missing
any one of them at config time, so a misconfigured cloud build fails before
anything ships. Since Round 7.5M the redirect URI and the auth base stored
there are also compared byte-for-byte against the deployment's strings, so a
well-formed value for the wrong host cannot ship either. One `eas.json` absence remains deliberate: no `channel` keys,
because the app has no update runtime (`expo-updates` is not a dependency and
a channel would route an OTA update to a build that cannot receive one). The
`submit.production` block exists since Round 16 (BUILD-PLAN 24.7.1): the App
Store Connect record's Apple ID and the Team ID, both public identifiers. The
upload itself authenticates with the App Store Connect API key EAS holds for
the project, created by the owner through `eas credentials` on 2026-09-30, so
no Apple account name or password is written anywhere. The history is in
`ROUND-7.5-OBSERVATIONS.md`.

## App Store listing (BUILD-PLAN 24.7.4)

The text the owner pastes into App Store Connect, drafted from this repository on
2026-10-05 and approved through its pull request. No tool pushes it: EAS Metadata
has no App Privacy fields, and the demo account is typed into App Store Connect,
never committed. The record already holds the category (Business), United States
availability and a free price (BUILD-PLAN 24.8.6).

| Field                  | Text                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Subtitle (30)          | Run and approve your workflows                                                                                                |
| Promotional text (170) | Start your workflows, approve the ones that wait for you, and see every run, from your phone, on the same account as the web. |
| Keywords (100)         | workflow,automation,approvals,invoices,documents,operations,business,teams,AI                                                 |
| Support URL            | https://www.autom8x.ai/contact                                                                                                |
| Marketing URL          | https://www.autom8x.ai                                                                                                        |
| Privacy Policy URL     | https://www.autom8x.ai/privacy                                                                                                |
| Screenshots            | iPhone and iPad sizes both: `app.json` sets `ios.supportsTablet`                                                              |

**Description**

> Autom8x runs the workflows your business sets up, such as checking invoices against
> your rules, and puts them in your pocket.
>
> - Flows: add one from the catalog, set it up, and run it with its details and a file.
>   Pause or archive it when you need to.
> - Activity: every run and each of its steps. Approve or reject the runs that wait
>   for a person.
> - Notifications: a push when a run needs your approval or fails. Optional.
> - Connections: connect the accounts a flow uses, such as Google.
> - Teams and organization: create teams, approve requests to join, and verify your
>   organization's email domain.
> - Billing: see your plan. Upgrading or managing it opens our billing page in your
>   browser.
> - Account: sign in with Google, Microsoft or Apple and link them; export your data;
>   delete your account.
> - An optional Face ID lock.
>
> The same account works on autom8x.ai.

**Review notes** (the demo Google account goes in Sign-In Information, never here)

> Sign-in is with Google, Microsoft or Apple only; there is no email and password. The
> demo account is a Google account, in Sign-In Information. The app is offered in the
> United States only, and has no in-app purchase: Upgrade and Manage billing open our
> billing page, run by Stripe, in the browser. Account deletion is in Settings ›
> Account. Notifications are optional (Settings › Notifications). The demo workspace
> has the flow Invoice check: run it with a vendor, an amount and a reference; an
> amount above 500 waits for approval in Activity.

**App Privacy answers.** Every answer is "linked to the user", "not used for
tracking", purpose "App Functionality". No advertising or analytics SDK is among
`package.json`'s dependencies, and nothing is shared with a data broker.

| Apple's data type                                                                       | Answer                       | Why, in this code                                                                                                      |
| --------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Contact Info › Name                                                                     | Collected                    | Google, Microsoft or Apple return it at sign-in, to the platform account                                               |
| Contact Info › Email Address                                                            | Collected                    | Sign-in, and the support form's one required field (`app/(tabs)/settings/support.tsx`, `lib/platform/support.ts`)      |
| Identifiers › User ID                                                                   | Collected                    | The Autom8x account every request acts as                                                                              |
| Identifiers › Device ID                                                                 | Collected (owner's call)     | The push token, sent to `PUT /v1/session/devices` (`lib/platform/devices.ts`); declaring it is the conservative answer |
| User Content › Photos or Videos                                                         | Collected (owner's call)     | Take photo (25.8.3): a camera photo, re-encoded as a JPEG, is uploaded as a run's file; declaring it is the conservative answer |
| User Content › Other User Content                                                       | Collected                    | Files given to a run (`components/automations/run-file-field.tsx`), a flow's setup, approval decisions                 |
| User Content › Customer Support                                                         | Collected                    | The support form's text                                                                                                |
| Diagnostics                                                                             | Not collected                | No crash-reporting or analytics SDK in `package.json`                                                                  |
| Purchases                                                                               | Not collected (owner's call) | Stripe's checkout runs in the browser; the app only reads the plan the platform reports                                |
| Location, Contacts, Health, Financial Info, Browsing and Search History, Sensitive Info | Not collected                | Nothing in the app reads them; Face ID stays on the device (`expo-local-authentication`)                               |

## Runtime architecture

- `lib/generated/platform-contracts/` is generated from the Edge, automations,
  and connections OpenAPI documents. Do not hand-edit it.
- `lib/platform/client.ts` is the sole runtime transport boundary. It uses
  `openapi-fetch`, attaches the current bearer token through middleware,
  applies a timeout and `no-store`, and maps RFC problem responses. A 429 is
  said as "busy, try again in N seconds" from its `retry-after` and never as
  signed out. Its one raw `fetch` is `putFileToSignedUrl`, the credential-less
  PUT of a file's bytes to the URL the platform signed; `audit:platform` admits
  exactly that one. Since 24.12 its one native download is
  `downloadSignedFile`, the credential-less save of the complete export's
  signed link into the app's cache, which iOS then hands to the share sheet;
  `audit:platform` admits exactly one `downloadFileAsync(`, there.
- `lib/platform/*.ts` exposes typed reads and mutations. Screens do not call a
  network primitive.
- `lib/platform/session-store.ts` stores access/refresh credentials only in
  `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` — and beside them
  push's device id and its "Not now", cleared with them.
- Device push (build 11, D8; BUILD-PLAN 24.13.6): `expo-notifications` and
  `expo-device` at the SDK 54 pins, and the `expo-notifications` plugin in
  `app.json`, whose prebuild writes the `aps-environment` entitlement — none is
  hand-written, which `__tests__/app-config.test.js` holds.
  `lib/platform/devices.ts` registers the phone with `PUT /v1/session/devices`
  and, on sign-out and before the logout, unregisters it with
  `DELETE /v1/session/devices/{deviceId}`. `hooks/use-push-registration.tsx`
  keeps an iOS phone that already allows notifications registered (every
  sign-in, every token change), shows the banner in the foreground and opens a
  tap's run or Approvals; the inbox's card is the only ask. Android and a
  simulator register nothing. The library's own request to Expo's token service
  is the third credential-less exception of `CLAUDE.md` rule 5.
- A run's file (BUILD-PLAN 25.8.3): `expo-image-picker` and
  `expo-image-manipulator` at the SDK 54 pins. Take photo is the camera, asked
  for at the press; Upload is `expo-document-picker`, held to a PDF, a JPEG or
  a PNG. Every image is re-encoded once on the phone — upright, its long side
  at most 2,576 px, a JPEG at 0.9 (`lib/platform/run-image.ts`) — and sent by
  the same signed upload as any file; neither library makes a request. The
  `expo-image-picker` plugin in `app.json` gives the camera the app's own
  sentence and turns the microphone and the photo library off, which
  `__tests__/app-config.test.js` holds through Expo's own mod compiler.
- `hooks/use-session.tsx` resolves `/v1/session` before routing. Protected tabs
  fail closed unless that response positively establishes `signed-in`. A 401
  clears the local credential; an outage does not.
- `lib/platform/native-auth.ts` implements ADR-0017's backend-mediated sealed
  handoff. `expo-web-browser.openAuthSessionAsync` opens the external system
  user-agent at the configured auth base (falling back to the API origin); the
  app owns only its device PKCE pair and never receives provider tokens. A
  device with no browser gets a `failed` outcome, not an uncaught rejection.
  `expo-auth-session` is deliberately not used because its `AuthRequest`
  models an app-owned OAuth authorization request with a required client ID,
  while this app is not the OAuth client.
- `lib/platform/workspaces.ts` backs the workspace switcher (Settings'
  WORKSPACE row and the scope control) with the two published operations the web
  switcher uses: `GET /v1/workspaces` and `PATCH /v1/session/active-workspace`.
  The backend session owns "active"; the app mutates, then re-reads
  `/v1/session` through `useSession().reload()`. A rename, a new organization
  and a join drop the shared snapshot's copy of the list, and the whole
  snapshot is emptied when a session ends or begins (24.12).
- `hooks/use-resource.tsx` and `components/screen-state.tsx` provide explicit
  loading, offline, platform-error, and empty states.
- `lib/view/` performs the published wire-to-Nocturne mapping and owns no
  workspace truth.
- The rules every screen shares (ADR-0032, BUILD-PLAN 24.3.6):
  - `administers()` in `lib/view/roles.ts` decides owner and admin controls.
  - `workspaceIfShown()` in `hooks/use-session.tsx`, with a resource's
    `loadedFor`, binds an action to the workspace its screen loaded.
  - `useIntentKeys()` keeps a resubmission's idempotency key.
  - `refusalMessage()` in `lib/content/refusals.ts` says a refusal in the
    website's words.
- `npm run verify` ends by emitting `.autom8x/repo-facts/snoopy-mobile.json`
  (gitignored). The backend's round close commits it, so the manifest quotes
  this repository's counts rather than reading its files.

## Platform observations

The Round 6 audit (2026-08-18) ran against a local Compose stack whose public
readiness was 503; Round 7.5 (2026-08-27) observed the Android launch and the
EAS cloud build against the deployed Edge; Round 7.5M (2026-09-03) found and
fixed the start-leg cookie topology and staged the authenticated §1 journey.
The live record for all three, including what remains NOT OBSERVED and why, is
`ROUND-7.5-OBSERVATIONS.md`. The client renders every live refusal it meets and
does not substitute fixtures or bypass the guard.

An exact copy of this checkout produced an iOS Release build with **zero errors
and zero warnings from the app target**. The build emits ~2,700 warnings in
total, every one of them from third-party headers under `ios/Pods/` (React
Native and Expo), and none from any file in this repository. The earlier
"zero errors or warnings" wording overstated that and is corrected here.
That build was installed and launched as
`ai.autom8x.snoopy` on the iPhone 16 Pro / iOS 18.6 simulator, where the real
onboarding screen was observed. The copy used a path without spaces because the
current Expo/React Native CocoaPods scripts split the checkout path at the
space in `Business Infra`; the direct build from this checkout therefore fails
before app code runs. No source or generated native file was patched to hide
that upstream limitation. Both platform exports passed, but an Android native
launch remains unobserved because this host has neither `adb` nor `emulator`;
an EAS cloud build also remains unobserved.

That observation is not a claim about a future environment; the Round 6 audit
rechecked it and Round 7.5 superseded it with the cloud build.

## Scope and handoff

The current contract and screen-to-operation map are in
[`DESIGN-CONTRACT.md`](DESIGN-CONTRACT.md). The Round 6 audit record and its
deliberate gaps are in [`DESIGN-GAPS.md`](DESIGN-GAPS.md); the Round 7.5 and
7.5M observations, findings and the state of 19c are in
[`ROUND-7.5-OBSERVATIONS.md`](ROUND-7.5-OBSERVATIONS.md).

The governing master plan and round playbook live in the sibling private
`snoopy-backend` repository. This repository may read them and must never edit
that repository during a mobile session.
