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
npm run verify                    # lint, docs checks, types, all architecture gates, contracts, tests
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
  of sizes (24.12); and no `Text` or `TextInput` imported from react-native
  outside `components/text.tsx`, the text-size limit (round 24 P3).
- `audit:spacing`: no padding, margin or gap typed as a number under app/ or
  components/ — every one is a name from the spacing table the platform
  publishes (`space` in `constants/theme.ts`, `BLOCK_SPACING`; the owner's Q8,
  Round 21), or `inset` inside one control, or 0; followed through a `const`, a
  default or a local table, as `audit:type` follows a size. `inset` is the
  app's alone, so its `INSET` list holds each file that may use it and how many
  times: one more, or one in a file not listed, fails (Round 21's review).
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
  when present, and reject a generated declaration diff — the block fixtures'
  `block-fixtures.ts` too, its header one sha256 over the fixtures' bytes in
  filename order, the website's rule (backend ADR-0048 decision 9).
- `audit:presses` (`scripts/audit-presses.mjs`, coverage-based, in `verify`
  and CI): **every press has a test that presses it and asserts its outcome**
  (build 13, B9) — the screen and params it opens, the request it sends
  (method, path, body), the dialog it opens or closes, what changes on screen,
  or the refusal it says — never only that a mock was called. It resolves
  every `onPress` and `onLongPress` in `app/` and `components/` to the
  function it runs and fails when no test ran it, or when it cannot tell
  which function that is (write a hook's function as `() => x.reload()`). A
  press repeated across screens — Retry, Back, a dialog's Cancel — is one
  table-driven test (`it.each`), not a copy per screen. The register is
  `DESIGN-GAPS.archive.md`, "Every press, its test (build 13)", and each later
  build's presses are in its own `DESIGN-GAPS.md` section.
- `check:docs` (`scripts/kit/check-docs.mjs`), `map -- --check`
  (`scripts/kit/map.mjs`) and `audit:docs`
  (`scripts/audit-doc-references.mjs`), right after lint: a code change
  without the doc `docs/docs-map.json` maps it to, a stale `docs/MAP.md`, or a
  document naming a file that does not exist fails the gate. The rule they
  enforce is the backend's engineering standard, section (e), linked from
  `CLAUDE.md`.

**Where a screen goes is proved under the real router** (build 13, the
owner's build 12 item 6). Jest runs two projects (`package.json`
`jest.projects`), and `npm test`, so `verify` and CI, runs both: `unit` maps
expo-router to `test/mocks/expo-router.tsx`, which records an href and runs
no navigator — how build 8–12's Sign out passed every test while it was
dropped on the phone — and `real-router` (`__tests__/real-router/`, harness
`test/real-router.tsx`) runs the app's own tree under the real expo-router.
A change to sign-in, sign-out, the guard, a redirect, or the params a screen
takes on arrival gets a test there. The auth boundary is the root layout's
`Stack.Protected`, which admits the tabs only signed in and past the Face
ID lock (`locked`, `hooks/use-session.tsx`; the build 13 review); nothing
inside the tabs navigates to "/", which there names Home, not the cover.

The gate suites include negative tests that inject forbidden source and prove
the audits fail. `__tests__/nocturne-visual.test.tsx` snapshots all 17 Nocturne
components in dark and light palettes. Do not update those snapshots unless a
visual change is explicitly authorized. Each authorized re-pin is recorded in
`DESIGN-GAPS.md`: the owner's bigger type (decision 11, 2026-10-02, "whole app —
easy to read"), re-pinned in build 10 (24.12) — 48 of the 64 Nocturne entries and
10 of the 14 in `screen-state.test.tsx`; the other 20 set no font size —
round 23's Liquid Glass (the owner's build 22 items 5–6: the tab bar, the back
circle and the screen states that draw it; "Round 23 — build 22's feedback"),
and round 24's text-size limit (the owner's build 23 F14: every text gains
`maxFontSizeMultiplier`, a fixed height that holds text becomes `minHeight`) —
50 of the 66 Nocturne entries, 10 of the 14 screen states and both connection
rows, props only ("Round 24 — build 23's feedback") — and round 24's opaque
drop-down backing (the owner's build 23 F1, found see-through on the simulator):
8 Nocturne entries, the backed panel and the status-bar strip in both palettes
with and without Liquid Glass, `backgroundColor` alpha 0.94 → 1 only ("Round 24
— the second review") — and round 25's mark tinted in both palettes (the owner's
build 24 item 2): the BrandMark entries, `tintColor` only: dark none → `#ffffff`, light `#383838` →
`#212121`, the design's invert(.87)
("Round 25 — build 24's feedback") — and Round 21's spacing table (the owner's
Q8 and build 30 note F3; plan Open 11, one pill height): 52 of the 90 Nocturne
entries, the 14 screen states and both connection rows, the table's paddings
and gaps, the pill's least height 52 → 44 and its default type 17 → 16 only
("Round 21 — block set v2") — and that round's review: 6 Nocturne entries
(TextField and its secure form, the offer screen, in both palettes) and 2 screen
states (ActionFailure), a label's gap 6 → `title` 8 and a card's 6 → `inner` 8,
the offer glyph's extra 4 dropped, only ("The review's fixes").

CI runs lint, typecheck, Jest, all architecture/dependency gates (the docs
checks among them, on the PR's whole range: `fetch-depth: 0` and
`DOCS_BASE`), contract verification, and both platform exports; `all-green` is the one check that
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
2026-10-03); `git push --no-verify` is the bypass for a by-design red push,
the owner's by hand: in a Claude Code session `.claude/hooks/guard.mjs`
refuses it.
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
`ROUND-7.5-OBSERVATIONS.md`. The release's steps are the `testflight` skill
(`.claude/skills/testflight/SKILL.md`).

The fresh audit must also inspect the simulator or device, exercise reachable
refusal and auth states, compare every screen with the website's page list,
validate EAS configuration, and report any live journey that external
configuration makes NOT OBSERVED. It must not convert NOT OBSERVED into PASS.

## Release configuration, pinned

Three values differ between a simulator, a preview build and production, and
`app.config.js` refuses a preview or production build that lacks any of them
or carries a wrong one:

- `EXPO_PUBLIC_BACKEND_API_ORIGIN` — the Edge origin the bearer calls use,
  HTTPS in release.
- `EXPO_PUBLIC_NATIVE_REDIRECT_URI` — must equal
  `https://app.autom8x.ai/auth/native/callback` byte-for-byte (ADR-0017; the
  Edge's `NATIVE_APP_REDIRECT_URIS` compares by exact string). The iOS
  associated domain and the Android verified app link are derived from it.
- `EXPO_PUBLIC_NATIVE_AUTH_BASE_URL` — where the SYSTEM BROWSER opens the
  ADR-0017 start leg; must equal `https://www.autom8x.ai/api/platform`. The
  Edge keeps the OAuth transaction in a `__Host-` cookie, which is host-only,
  and its deployed callback sits on the public web origin behind the website's
  `/api/platform` rewrite (manifest §12.1 #79). A start leg opened on the API
  origin sets a cookie the callback never receives and every native login ends
  at the website with `exchange_failed`. Measured 2026-09-03; the evidence is
  in `ROUND-7.5-OBSERVATIONS.md`.

All three live in the EAS-hosted `preview` and `production` environments of
the linked project `@autom8x.ai/snoopy-mobile` (`extra.eas.projectId` in
`app.json`, pinned by `__tests__/app-config.test.js` through the real config).

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

Invoice check, the demo flow these notes name, leaves production with the backend
release that carries BUILD-PLAN 25.4.5 (the two test automations retired the day
Invoice Processing is live), so these notes are redrafted before submission (24.7.4).

**App Privacy answers.** As published in App Store Connect by the owner on 2026-10-13,
in three publishes, the first and the last from answers a session recommended that day. The
first, at about 16:02Z, gave the Privacy Policy URL https://www.autom8x.ai/privacy, Yes to "Do
you or your third-party partners collect data from this app?", and nine types, each for "App
Functionality" only, "Linked to the user's identity" and not used for tracking. The
second, at about 17:46Z, was an intermediate publish that the owner corrected. The last, at
about 17:53Z, after a review of this record, added Payment Info and Purchase
History on the same terms, and Analytics as a second purpose of Other Diagnostic Data:
the eleven types below. After it, the owner's screenshot of App Store Connect's product
page preview shows six categories under "Data Linked to You" (User Content,
Identifiers, Contact Info, Purchases, Diagnostics, Financial Info) and no "Data Not
Linked to You" column; the preview names categories only, so Payment Info, Purchase
History and the Analytics purpose are on the owner's word. No advertising or analytics
SDK is among `package.json`'s dependencies, and nothing is shared with a data broker.

| Apple's data type                     | Answer        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact Info › Name                   | Collected     | Google, Microsoft or Apple return it at sign-in, to the platform account                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Contact Info › Email Address          | Collected     | Sign-in, and the support form's email, the one field the platform requires (`app/(tabs)/settings/support.tsx`, `lib/platform/support.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Financial Info › Payment Info         | Collected     | Bills & Receipts (`automations/invoice-processing` in `snoopy-automations`) reads from a run's file how a receipt was paid — card, cash, check, bank transfer or other (`paymentMethod`) — and a card's last four digits when they are printed (`cardLast4`), both in `snoopy-automations/automations/invoice-processing/prompts/extract-documents.v1.json`; its setup takes the company card's last four digits (`companyCardLast4`, `snoopy-automations/manifests/invoice-processing.v1.json`): "A receipt that shows another card waits for approval". This app uploads the file (`components/automations/run-file-field.tsx`) and sends the setup (`lib/platform/automations.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Financial Info › Other Financial Info | Collected     | From the same file, Bills & Receipts reads a bill's or receipt's amounts — subtotal, tax, total, amount due — a bill's due date and payment terms, and a supplier statement's balance and the invoices, payments and credits it lists; its setup names the company's QuickBooks accounts, such as Paid from, "The bank or credit card account the company pays receipts from"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| User Content › Photos or Videos       | Collected     | Take photo (25.8.3): a camera photo, re-encoded as a JPEG, is uploaded as a run's file; declaring it is the conservative answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| User Content › Customer Support       | Collected     | The support form's text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| User Content › Other User Content     | Collected     | Files given to a run (`components/automations/run-file-field.tsx`), a flow's setup, approval decisions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Identifiers › User ID                 | Collected     | The Autom8x account every request acts as                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Identifiers › Device ID               | Collected     | The push token, sent to `PUT /v1/session/devices` (`lib/platform/devices.ts`); declaring it is the conservative answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Purchases › Purchase History          | Collected     | Bills & Receipts records the business's purchases in its QuickBooks Online company, "a bill as a bill, a receipt as an expense, a credit note as a vendor credit" (`snoopy-automations/manifests/invoice-processing.v1.json`), each naming its seller, with its date, its amount and a category chosen by what the purchase was for, `spendType` (`snoopy-automations/automations/invoice-processing/src/decide/plan.ts`, `snoopy-automations/automations/invoice-processing/src/writes/bodies.ts`); each run keeps what it recorded with its results                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Diagnostics › Other Diagnostic Data   | Collected     | No crash-reporting or analytics SDK is in `package.json`, but the platform's servers keep operational logs of the requests the app makes — in the Privacy Policy's words, "Standard operational logs (request metadata, IP addresses, timestamps, errors) used to run, secure, and debug the service" — so declaring it is the conservative answer. Its purposes are App Functionality and Analytics, since the policy also says "To improve it: aggregate, de-identified usage analysis."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Every other type                      | Not collected | Phone Number, Physical Address, Health & Fitness, Credit Info, Location, Sensitive Info, Contacts, Emails or Text Messages, Audio Data, Gameplay Content, Browsing History, Search History, Surroundings, Body, Other Data Types: nothing in the app asks for or reads them (no screen and no flow asks for a phone number or a postal address; nothing reads a credit score; Face ID stays on the device, `expo-local-authentication`; Search flows filters on the phone; the camera's microphone is off, `app.json`). Other User Contact Info: the app sends none besides the email address; the push token, which reaches the phone, is declared as Device ID. Usage Data (Product Interaction, Advertising Data, Other Usage Data): no analytics or advertising SDK in `package.json`, and the app shows no ads; the Privacy Policy's "Usage and log data", the platform's request logs, are declared once, under Diagnostics, for App Functionality and Analytics. Crash Data, Performance Data: no crash-reporting SDK in `package.json` |

## Runtime architecture

- `lib/generated/platform-contracts/` is generated from the Edge, automations,
  and connections OpenAPI documents, and `block-fixtures.ts` from the
  backend's `packages/contracts/fixtures/blocks/*.json`. Do not hand-edit it.
- The run, item and file pages draw the platform's page body (backend
  ADR-0048): `readRun` and `readItem` send `shape=blocks`, and
  `components/blocks/block-list.tsx` draws each block by its type's renderer
  — one per type of the generated `Block` union, each made from a component
  the app has — and `FALLBACK` (`lib/content/screen-states.ts`) for a type,
  form or part this build does not know. Blocks are text, never markup
  (`__tests__/no-flow-code.test.ts`). An installed build that predates this
  never sends the parameter and keeps the legacy answer.
- `lib/platform/client.ts` is the sole runtime transport boundary. It uses
  `openapi-fetch`, attaches the current bearer token through middleware,
  applies a timeout and `no-store`, and maps RFC problem responses. A 429 is
  said as "busy, try again in N seconds" from its `retry-after` and never as
  signed out. Its one raw `fetch` is `putFileToSignedUrl`, the credential-less
  PUT of a file's bytes to the URL the platform signed; `audit:platform` admits
  exactly that one. Since 24.12 its one native download is
  `downloadSignedFile`, the credential-less save of a signed file's link into
  the app's cache (the complete export; the run package's PDF and Excel since
  round 24); `audit:platform` admits exactly one `downloadFileAsync(`, there.
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
  tap's run or Approvals — and since round 23 an email's or a push's link,
  `https://<the callback's host>/runs/<id>?workspace=<id>` or
  `/approvals/<id>?workspace=<id>`, in the workspace it names
  (`linkTargetOf`; `app/+native-intent.tsx` sends both paths to the splash when
  they start the app, and leaves the open screen when it is already open;
  `app.config.js` adds the two Android path prefixes, iOS's `applinks` claim
  covers them); the inbox's card and the notifications offer
  (`app/(auth)/notifications-offer.tsx`) — once after a sign-in (round 24 P8), and
  at a kept session's cold start past the cover or the Face ID lock
  (`nextAfterColdStart`, backend §12.1 #301) — are the only asks, each only where
  iOS can still ask and no Not now is kept (`offersPushAsk`).
  `lib/platform/notifications.ts` reads the inbox, marks rows read, dismisses
  one and — since round 24 — empties it (`clearInbox`,
  `POST …/notifications/clear`, Clear all). Android and a simulator register
  nothing. The library's own request to Expo's token service
  (`getExpoPushTokenAsync`, since build 11, D8) is the transport's third
  credential-less exception, in no file of this repository, which
  `audit:platform` does not see because it reads this repository's source. No
  session credential goes with it, and the token it answers reaches the
  platform only through `lib/platform/devices.ts`, in the
  `PUT /v1/session/devices` body — never a log, a URL or the enclave.
- The A8X run package (round 24 P12; backend ADR-0045): `lib/platform/runs.ts`
  `createRunPackageFile` (`POST …/runs/{runId}/package`) answers a signed link,
  never bytes; `requestRunPackageFile` asks once more after any 503, waiting
  `packageRetryWaitMs` — its `retry-after` up to 10 s, 2 s when it names none,
  no retry past 10 s (the website's rule; a 503 with `retry-after` is
  `PlatformBusyError` in the transport, `lib/platform/client.ts`, still a 503) —
  and refuses a file in another format than asked or over
  `RUN_PACKAGE_MAXIMUM_BYTES` (25 MiB, the platform's bound) with
  `RunPackageFileRefusedError`. The file is saved through `downloadSignedFile`.
  A link that is not https (`SignedLinkUnusableError`) or a file not saved
  (`FileNotSavedError`, both `lib/platform/problem.ts`) is said in those words
  on Settings › Data and as the website's "Could not open the package. Try
  again." on the package page (`packageNotOpened`). `lib/platform/signed-file.ts` holds the
  ways a signed file is handed on, for the file pages, the run package and
  Settings › Data's export alike (Round 21, the owner's Q7: Download, then Share,
  `components/files/file-actions.tsx`): `signedLink` (https only);
  `saveSignedFile`, Download — on iOS saved into the cache, then into the folder
  picked in Files (expo-file-system's `Directory.pickDirectoryAsync`, no new
  module, no share sheet) under the file's name without any folder it carries,
  the cache's copy removed; on Android the link
  opened; and `shareSignedFile`, Share — on iOS only (`sharesFiles`) the file
  itself to the share sheet, never the link, then removed (~~iOS saves, shares
  and removes it; Android opens the link~~, Download until Round 21). The package page draws
  the saved PDF in `react-native-webview` (13.15.0, MIT, the SDK 54 pin; a new
  native module, so build 24 is a new build): the cached file only, its folder
  the only one it may read — it loads nothing over the network.
- Liquid Glass (round 23, A3): `expo-glass-effect` at the SDK 54 pin, drawn
  only through `components/glass-surface.tsx` — the system's glass on iOS 26,
  `expo-blur` under a tint below it, the opaque card on Android — on the tab
  bar's capsule, the header circles and the drop-down panels. It makes no
  request.
- A run's file (BUILD-PLAN 25.8.3): `expo-image-picker` and
  `expo-image-manipulator` at the SDK 54 pins. Take photo is the camera, asked
  for at the press; Upload is `expo-document-picker`, held to a PDF, a JPEG or
  a PNG — or, for a field that names its types (`acceptedContentTypes`, backend
  ADR-0046), to those, a Word file sent as it is, and Take photo only where a
  JPEG is taken (`takesPhotos`). Every image is re-encoded once on the phone —
  upright, its long side at most 2,576 px, a JPEG at 0.9
  (`lib/platform/run-image.ts`) — and sent by the same signed upload as any
  file; neither library makes a request. An item's file (Round 19) is sent the
  same way, then named in `createItem` (`lib/platform/automations.ts`: `readItems`,
  `createItem`, `readItem`, `archiveItem`, and `createRun`'s `itemId`). The
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
- `lib/platform/runs.ts`'s `readAllApprovalsNow` reads the approvals past the
  shared snapshot. A run's page or its Run details (`useRunDetail()`, below)
  whose run is held with no approval form in its blocks yet reads the run
  again, and its approvals that way, every 2 s and at most ten times, until the
  form comes or the run leaves held (backend ADR-0048). The read that saw the run turn
  held took the approvals from the 15 s snapshot, from before the approval was
  asked (round 25, the review's R5c 1).
- `lib/platform/automations.ts`'s `readItemFile` and `readRunFile` answer a
  file's short-lived signed link, never its bytes (build 28): an item's own file
  and each file a run's job uploaded. The link downloads the file as an
  attachment, so the app fetches the bytes from it itself to show or share it. `components/files/file-view.tsx` draws a
  PDF, a JPEG or a PNG by its type, saved in a folder made for that one view
  (`downloadSignedFile`'s `freshFolder`) for a WebView with no JavaScript
  (`components/files/file-frame.tsx`, which a picture block's scanned page
  shares), and its Download and Share each take a fresh link (`FileActions`;
  ~~its Download hands a fresh link to `shareSignedFile`~~ until Round 21).
- `lib/platform/runs.ts`'s `readRunsPage` asks the runs list as Activity
  shows it (Round 21, backend ADR-0048 amendment 1): `q`, `status` or
  `needsReview` (never both), `since`, the flow, `sort` and `page`, answered as
  one page of 25 and `total`; `readRuns` keeps today's newest 100 for Home.
- `hooks/use-resource.tsx` and `components/screen-state.tsx` provide explicit
  loading, offline, platform-error, and empty states.
- `lib/view/` performs the published wire-to-Nocturne mapping and owns no
  workspace truth.
- The rules every screen shares (ADR-0032, BUILD-PLAN 24.3.6):
  - `administers()` in `lib/view/roles.ts` decides owner and admin controls.
  - `workspaceIfShown()` in `hooks/use-session.tsx`, with a resource's
    `loadedFor`, binds an action to the workspace its screen loaded, or it is
    refused with `WORKSPACE_CHANGED`.
  - `useIntentKeys()` keeps a resubmission's idempotency key.
  - `refusalMessage()` in `lib/content/refusals.ts` says a refusal in the
    website's words.
  - `withoutArchived()` (`lib/view/catalog.ts`): an archived subscription is
    absent — never a workflow, never Added. The catalog's `subscribed` counts
    one, so it never answers Added.
  - `deletionOutcome()` (`lib/content/deletion.ts`): every answer
    `DELETE /v1/account` gives a bearer caller, in ADR-0028's words. Never
    say "deleted" for a lost answer: read the session first.
  - `hostedAddress()` (`lib/platform/billing.ts`) and `websiteOrigin()`: the
    only addresses the app opens outside itself, https only.
  - `Pressable` and `pressed()` (`components/pressable.tsx`): every press
    ticks, through the one helper; a press with no handler, a disabled
    control and the signed-out cover give none (build 11, D7).
  - `heldAs()` (`lib/view/catalog.ts`): a workspace holds a flow once (the
    owner's build 12 item 9) — any subscription of its template that is not
    archived, in any team or the whole workspace. Add reads a held flow
    "Added ✓" and Setup configures it, never adding a second; a copy Setup
    has just added is held from that moment (the build 13 review).
  - `addedAgainAs()` (`lib/view/catalog.ts`): an archived flow's live twin —
    the same template in any team or the whole workspace (`heldAs`, the
    owner's build 12 item 9) — and with one, no "Unarchive" (D3).
    `scopeLabels()` labels every flow (D4).
  - `OpenRow` (`components/open-row.tsx`): every row that opens a page from a
    run or an item — a list block's rows, a file block, a run's "Run details" —
    the height of a drop-down's row, its arrow on the right (build 28, F5 and
    F9).
  - `useRunDetail()` (`hooks/use-run-detail.ts`): one run as its page and its
    Run details read it, bound to the workspace it was opened in.
- Billing (ADR-0032; the contract's rule, with Free's and Pro's drawn prices,
  is `DESIGN-CONTRACT.md`, Round 16 (24.6), Billing): the app re-reads
  billing when it returns to the foreground. The enrolled plan is one rule,
  `lib/view/billing.ts`, shared with the plan's name on the Settings index —
  Billing's value, before the arrow (the owner's build 12 item 2) — which
  reads the workspace's billing quietly through the shared snapshot for an
  owner or admin (D1). The app is offered in the United States App Store
  storefront only; selling elsewhere needs a storefront check first.
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
[`DESIGN-CONTRACT.md`](DESIGN-CONTRACT.md). The current findings, with the
items carried open from earlier rounds, are in [`DESIGN-GAPS.md`](DESIGN-GAPS.md);
the Round 6 audit record and its deliberate gaps, and Round 16's findings, are
in [`DESIGN-GAPS.archive.md`](DESIGN-GAPS.archive.md); each round's preamble
is in [`docs/records/round-record.md`](docs/records/round-record.md); the
Round 7.5 and 7.5M observations, findings and the state of 19c are in
[`ROUND-7.5-OBSERVATIONS.md`](ROUND-7.5-OBSERVATIONS.md).

The governing master plan and round playbook live in the sibling private
`snoopy-backend` repository. This repository may read them and must never edit
that repository during a mobile session.
