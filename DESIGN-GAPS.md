# Design gaps — the current record (Round 17 on; closed rounds in [`DESIGN-GAPS.archive.md`](DESIGN-GAPS.archive.md))

Round 6 — fresh-audit record (2026-08-18): moved verbatim to [`DESIGN-GAPS.archive.md`](DESIGN-GAPS.archive.md#round-6--fresh-audit-record) on 2026-10-18.

Round 16 — findings and observations (ADR-0032), closed 2026-10-07: moved verbatim to [`DESIGN-GAPS.archive.md`](DESIGN-GAPS.archive.md#round-16--findings-and-observations-adr-0032) on 2026-10-18.

## Carried open from earlier rounds

Found on 2026-10-18 by grepping the moved sections for open, NOT OBSERVED, still open and deferred, and reading each hit; one line each, as the archive records it, not re-checked on a device. Closed items stay in the archive only.

- **The Expo SDK major.** The high advisories that only an Expo SDK major clears (`image-size`, `uuid`, and query-string 7 under expo-router) stay a documented migration; `braces`, `node-forge` and `sprintf-js` are the owner's to decide — [Dependency boundary](DESIGN-GAPS.archive.md#dependency-boundary), [the backlog](DESIGN-GAPS.archive.md#the-backlog-manifest-122-20-and-21-and-the-part-of-121-195-that-needs-no-owner-decision-2026-10-07).
- **An iCloud-synced checkout** makes conflict copies, evicts files and fails `npm ci` with `ENOTEMPTY`; it recurs, so work only in a scratch clone (`CLAUDE.md`, Gates and push) — [Still open, recorded rather than fixed](DESIGN-GAPS.archive.md#still-open-recorded-rather-than-fixed).
- **Round 6's out-of-scope list** (Builder authoring, a run retry that keeps its continuation identity, profile editing, reduced-motion alternatives, small-phone and tablet approval, and the rest): Round 7.5M and Round 16 built some; the others were not re-checked when this moved — [Deliberate non-Round-6 gaps](DESIGN-GAPS.archive.md#deliberate-non-round-6-gaps).
- **The join link in production** works only once an organization has a verified, discoverable domain, and production had none (2026-10-02) — [the sixth signed-in session](DESIGN-GAPS.archive.md#the-sixth-signed-in-session-build-9-2026-10-02-2220z2235z).
- **NOT OBSERVED on a device, build 9:** the floating list's touch where it overhangs the dialog on Android; Save to Files for the export's file type — [the sixth signed-in session](DESIGN-GAPS.archive.md#the-sixth-signed-in-session-build-9-2026-10-02-2220z2235z).
- **NOT OBSERVED on a device, build 10:** the header's fit at the bigger type, the index's rows, the longer labelled line on a narrow phone, the empty screen's second button, the selection tick, and Setup's "Ask to join a team first." — [the seventh signed-in session](DESIGN-GAPS.archive.md#the-seventh-signed-in-session-build-10-2026-10-03-0257z0314z).
- **NOT OBSERVED on a device, build 11:** Back from "See teams" crossing tabs; the follow-up, if wanted, is a copy of Teams in the Flows stack — [Guards proved to bite, build 11](DESIGN-GAPS.archive.md#guards-proved-to-bite-build-11).
- **NOT OBSERVED on a device, build 13:** a Home or flow tile pressed again changes Activity each time — [Build 13, part 2](DESIGN-GAPS.archive.md#build-13-part-2-items-6-and-8-and-a-tile-pressed-again).
- **NOT OBSERVED on a device, Gate 24 parity:** Home's overview, shortcuts and teams block, the failure words, the kept appearance and the ended session's return (the owner's build 16 pass covered the list it names) — [Gate 24 parity: Home](DESIGN-GAPS.archive.md#gate-24-parity-home-the-appearance-the-busy-words-an-ended-session-2026-10-07).
- **The owner's calls, left open:** holding the 48 test answers still off the contract's shape (a runtime check needs a new dependency) — [Release configuration, 24.7](DESIGN-GAPS.archive.md#release-configuration-247); removing the update key's re-mint when another team is chosen (then `setup.tsx:350`; the team picker is gone since 2026-10-14) — [the backlog](DESIGN-GAPS.archive.md#the-backlog-manifest-122-20-and-21-and-the-part-of-121-195-that-needs-no-owner-decision-2026-10-07).
- **Not covered by Round 16's close:** the database read-back of each outcome 24.7.3 and 24.14.13 ask for, and 24.14.6's `pg_stat_activity` re-read (production reads are the owner's) — [Build 16 and Round 16's close](DESIGN-GAPS.archive.md#build-16-the-owners-device-pass-and-round-16s-close-2026-10-07).

## Round 17 — the app, once (BUILD-PLAN 25.8; the owner's requirement 1 of 2026-10-08)

Round 16 closed 2026-10-07 and Round 17 opened the next morning in `snoopy-backend` (BUILD-PLAN
Phase 25, `a9e13ae`, on the owner's four requirements for automations and "lets go with the
recommended"). Its 25.8 is this repository's one change, made once so that no change here is
needed per automation — requirement 1: "app stays the same, no new build or update randomly per
automation. we update automations repo and that updates the app." A re-entry on the owner's
approval of the round plan (MASTER-PLAN §4; the order of attack 25.1 → 25.8 → 25.2 → …), recorded
in the backend's Phase 25 intro and §0.1 ("with one app change (25.8)"). Nothing else in the app
changes.

### 25.8.1 — the control the app does not know (2026-10-08)

**What was read, by command, before the change** (`main` `1ea6875`):

- `components/setup-field.tsx:186` looked `field.control` up in a five-key map (`CONTROL_ICON`,
  `:78-85`) and drew the result as an element at `:239`. A control the map did not hold was an
  `undefined` element type: React threw while drawing the row, and with no boundary in the
  app's own code (`grep -rn "getDerivedStateFromError\|componentDidCatch\|ErrorBoundary" app
  components lib hooks` → nothing) the Setup and Run dialogs crashed, taking their screen.
  `resource-picker` fell through to the plain `TextInput` branch (`:250-271`); the Run dialog
  routed every non-file field to the row (~~`components/automations/run-dialog.tsx:124`~~, `field
  as FieldRowSpec`).
- The website falls back (`snoopy/app/account/flows/ManifestFields.tsx:122-176`): `toggle` is a
  checkbox, `money` a number input, **every other control a text input**, with no note. Its
  comment at `:182-184`: "The contract provides no resource-list endpoint, so a `resource-picker`
  accepts the supplied opaque value as text without inventing a provider-specific list."
- The contract (`snoopy-backend/packages/contracts/src/index.ts`): `AutomationSetupField.control`
  is `'toggle' | 'money' | 'text' | 'email' | 'resource-picker'` (`:1175`);
  `AutomationRunInputField.control` is `'toggle' | 'money' | 'text' | 'email' | 'artifact'`
  (`:1131`) — "no `notifies` or `resource-picker`, because neither means anything for a single
  run" (`:1118-1120`). The validator holds a `resource-picker` value to a string
  (`manifest-validation.ts:380`, `:770`); ADR-0030 §1: "It has no `resource-picker`, because no
  contract lists resources for one run"; the fixtures name an inbox label and a Slack channel
  (`snoopy-backend/test/automation-manifest.test.ts:68`, `:94`, `:162`); no registered manifest under
  `manifests/` uses it (`grep -rn resource-picker manifests/` → nothing). No published operation
  lists resources.

**What changed** — this PR, and nothing else in the app:

1. **A control the app does not know draws as the website does, with a note.** `FieldRowSpec.control`
   is a string (`components/setup-field.tsx:24-26`), not the generated union, so the row accepts
   what a newer platform publishes. `isKnownControl` (`:113`) answers for the contract's five by
   the own keys of `CONTROL_ICON` (`:100`), which is typed `Record<KnownControl, Icon>` over the
   generated union — a control the contract adds fails `typecheck` at the next regeneration, so
   a session gives it a row, rather than reaching a phone unnamed. The glyph falls back to the
   text glyph (`:229`), the control to the text input, and `controlNote` (`:125`) puts one
   sentence under the description (`:294`): `NEWER_CONTROL_NOTE`, "This field is newer than
   this build of the app. Enter it as text." (`lib/content/screen-states.ts:175`;
   `audit:vocabulary` scans it). The value reaches the platform as the string the website sends
   (`declaredValues`, unchanged) and the platform stays the validator. The Run dialog's cast is
   gone (`run-dialog.tsx:126`, `field={field}`).
2. **`resource-picker` gets its control — the reading.** The contract gives the picker a string
   value and nothing to pick from (above), so "gets its control" is read as: the control the
   contract defines — a string naming a resource at the connected service — drawn as the website
   draws it, a text input, and now a control the app NAMES (`KnownControl`,
   `CONTROL_ICON['resource-picker']`, `setup-field.tsx:98-107`) rather than the fall-through it
   was, so the newer-than-this-build note never fires for it and a test holds that
   (`setup-field:308`). No picker, no list, no resource kind is invented (rule 7;
   `DESIGN-CONTRACT.md`'s ceiling bullet says so). A later contract that lists resources gives the
   picker a list then; that is a contract change, not this box.
3. **An error boundary around the Setup and Run dialogs.** `components/dialog-boundary.tsx`:
   `DialogBoundary` (`:27`) wraps `Catch` (`:70`), the class React requires of a boundary
   (`getDerivedStateFromError`, `:73`), which draws `FailedDialog` (`:49`) once a child has
   thrown — the shared `Dialog` in the failed-load grammar: the thing that failed in its title,
   `ERROR_BODY` ("You have not been signed out, and nothing was lost. Try again in a moment."),
   Cancel (the dialog's own close) and Try again (`TRY_AGAIN_LABEL`, `screen-states.ts:165`;
   `retry`, `:40`, keys a new `Catch`, so the children are drawn again). Each dialog is wrapped
   whole, its hooks included: `RunDialog` (`run-dialog.tsx:39-45`, title `RUN_FORM_ERROR_TITLE`
   "Couldn't load this run's form", `screen-states.ts:164` — a run's form is no fetching screen,
   so it has no `ScreenKey`) and `SetupDialog` (`setup-dialog.tsx:47-53`, title
   `errorTitleFor('setup')`, "Couldn't load this setup"). Not a Nocturne primitive — it composes
   `Dialog`; the 18 and their 80 snapshots are unchanged. No log of a value (rule 6), no
   analytics; React reports the caught error in development as it does any.
4. **Tests** — `__tests__/setup-field.test.tsx:276-322` (5) and `__tests__/dialog-boundary.test.tsx`
   (8): the unknown control renders the fallback and reports the typed string (`setup-field:280`);
   the note is one sentence, never the wire token (`:296`); the five known controls and nothing
   else, prototype names and `artifact` included (`:303`); `resource-picker` is known, no note
   (`:308`); `declaredValues` sends the string and leaves an empty one out (`:317`); the boundary
   catches a throwing child and offers Cancel and Try again (`dialog-boundary:88`), Try again
   draws the children again (`:107`) or fails to the same words (`:121`), and the children are
   untouched while nothing throws (`:134`); the Run dialog draws the fallback and POSTs
   `{ subscriptionId, input: { window: 'last week' } }` (`:177`) and is inside its boundary
   (`:205`, its file field made to throw); the Setup dialog draws the fallback beside the picker
   and PATCHes `{ config: { window, inbox } }` (`:230`) and is inside its boundary, Try again
   drawing it again once it can (`:258`, a section label made to throw). The dialogs are made to
   throw by mocking a child they draw, never by changing their code. `audit:presses`: the
   boundary's Try again (`dialog-boundary.tsx:60` → `retry`) and Cancel (`:59`, the caller's
   `onClose`) are run by those tests; the register above has their rows, and the Start run and
   Save setup rows cite their moved lines (`run-dialog.tsx:115`, `setup-dialog.tsx:75`).

**The narrowest reading, said so.** The box names "the Setup and Run dialogs"; the boundary is
around those two. Two other surfaces draw the same rows and are covered by (1), the fallback, not
by a boundary: the Setup screen (`app/(tabs)/flows/setup.tsx:429`) and the Move dialog
(~~`components/automations/move-version.tsx:182`~~, `SetupFields` for the version a flow moves to —
where a newer control is likeliest to appear first). With (1) neither can throw on a control;
wrapping them is a separate decision, not taken here ("Nothing else in the app changes"). A
`section` the app does not know is not a crash — `sectionLabel` reads `SECTION_NAME[section]` and
would print "1 · undefined" — and is left as found: the contract closes sections at four with "UI
is frozen" (BUILD-PLAN 4.5.3), and the box speaks of controls. The words are the app's: "field"
and "build" for both a setting and a run's input, "Try again" for repeating a failed action
(`ActionFailure`'s word; Retry is a failed load's).

**The gate**, on this tree: `CI=1 npm run verify` exit 0 — 87 suites / 1195 tests / 80 snapshots
across the two jest projects, the audits and the press audit green, the facts file emitted;
`npm run audit:dependencies` exit 0. Nothing regenerated: the platform contract is unchanged, and
no dependency was added.

**Findings for other repositories** (for a `snoopy-backend` session to file):

- BUILD-PLAN 25.8.1, the box text: "BUILT 2026-10-08 in `snoopy-mobile` #‹n› ‹sha›; closes with
  25.8.2's build" — the PR carries the number and sha.
- A contract observation, no change asked: `AutomationSetupField.control` and
  `AutomationRunInputField.control` are closed unions, so a client generated from them cannot
  type a control it does not know; this app's row takes a string for that reason. When the
  platform means a new control to reach shipped apps, `CONTROLS` / `RUN_INPUT_CONTROLS`
  (`snoopy-backend/packages/contracts/src/manifest-validation.ts:80`, `:86`) is where it widens, and this
  fallback is what draws it until a build names it.
- 25.8.2 OWNER: this change is what that one TestFlight build carries.

### Guards proved to bite, 25.8.1

Eight runs by one script (`bites-25.8.1/bites.py` in the session's scratchpad, its `results.md`
and the eight jest JSON reports beside it) on this branch's tree: each one exact edit to the
source, `jest --selectProjects unit --testPathPattern 'dialog-boundary|setup-field'` with
`--json`, each named test's status read from the report, the file restored from a copy saved
before the edit and its SHA-256 compared equal, `git status --porcelain` identical to the intended
changes after every restore. Every break failed the tests named and nothing else; the clean tree
passes both files (34 tests).

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| B1 · An unknown control draws the website's text input, not an undefined element (`components/setup-field.tsx:229`) | the direct `CONTROL_ICON[field.control]` lookup restored — the shipped code | `setup-field` "renders as the website does — a text input — with the note that it is newer than this build…"; `dialog-boundary` the Run and the Setup dialog's "draws a control newer than this build…" |
| B2 · The note under an unknown control (`controlNote`, `:125`) | `controlNote` answering null for every control | `setup-field` "…with the note…", "never draws the wire token…"; `dialog-boundary` the two "draws a control newer than this build…" |
| B3 · `resource-picker` is a control the app knows: its text input, no note (`isKnownControl`, `:113`) | `resource-picker` dropped from the known controls | `setup-field` "knows the contract's five controls and nothing else…", "draws a resource-picker as a control it knows…"; `dialog-boundary` the Setup dialog's "…beside the resource-picker it knows…" |
| B4 · The boundary catches a throwing child (`components/dialog-boundary.tsx:73`) | the caught error no longer marks the boundary failed | `dialog-boundary` "catches a child that throws…", "Try again draws the children again…", "Try again on a child that still throws…", the Run and the Setup dialog's "is inside its boundary…" |
| B5 · Try again draws the children again (`retry`, `:40`) | Try again doing nothing | `dialog-boundary` "Try again draws the children again…", the Setup dialog's "…Try again draws the dialog again once it can" |
| B6 · The Run dialog is inside its boundary (`run-dialog.tsx:39-45`) | the boundary removed from around the dialog | `dialog-boundary` the Run dialog's "is inside its boundary…" |
| B7 · The Setup dialog is inside its boundary (`setup-dialog.tsx:47-53`) | the boundary removed from around the dialog | `dialog-boundary` the Setup dialog's "is inside its boundary…" |
| B8 · An unknown control's value is sent as the string the website sends (`declaredValues`) | the string branch limited to controls this build knows | `setup-field` "sends an unknown control's value as the string the website sends…"; `dialog-boundary` the two "…sends / saves the typed string as declared" |

### 25.2.12 and 25.2.10, the app's halves, with the contract they came in (2026-10-08)

**Why a second change in a round with one app change.** 25.2.12 as the owner approved it at
Round 17's open (backend `949dc8d`, "lets go with the recommended") ends "Both clients change with
the platform where the words do", and its built line (`ccc10e4`) names the clients' half of §12.1
#240 — "sending a fresh key per press and the same key on each retry" — as a finding for `snoopy`
and this repository. 25.2.10's built line publishes `createRun`'s 429 and the run that waits as
`pending`. Both reached the platform's contract at `ccc10e4`, so this is the app's side of them: a
re-entry inside the approved round plan (MASTER-PLAN §4), beside 25.8.1. MASTER-PLAN §0.1 names
this repository for 25.8; the clients' halves are 25.2.12's own words. Nothing else in the app
changes.

**What was read, by command** (`snoopy-mobile` `main` `f2f19c1`; `snoopy-backend` `main`
`ccc10e4`; the deployed platform `c731492`, the TWENTY-SECOND promotion):

- **The contract.** Between `c731492` and `ccc10e4` only `snoopy-backend/docs/openapi/automations.yaml` changed
  (sha256 `6584ffe4…` → `150d8654…`; `openapi.yaml` `93fd335c…` and `connections.yaml`
  `ab70cb0f…` unchanged). `issueWebhookEndpoint` takes an OPTIONAL `Idempotency-Key` header,
  16-128 characters of the `IdempotencyKey` shape. `createRun`'s 201 says a run at a busy
  automation is created `pending` and HELD BACK, and a 429 is documented: `details.reason`
  `max_concurrent_runs`, `details.limit` a string, and `creation_contended` beside it with "the
  same advice". `RunStatus` and the run event's `payload` gain descriptions (`run-created` may
  carry `queued: max_concurrent_runs`), the callback enum gains `mail`, and the callback's 403 and
  422 gain descriptions. No type a screen reads changed shape.
- **The key at the Edge.** It is validated when present by `idempotencyKeyFrom`, against
  `/^[A-Za-z0-9._~:-]{16,128}$/` (`snoopy-backend/packages/http/src/index.ts:7`), and carried to Runs
  (`snoopy-backend/apps/api/src/modules/automations/routes.ts:360-377`). The deployed Edge at `c731492` reads no
  key on this route (`routes.ts:360-369` there): until the TWENTY-THIRD promotion a keyed issue
  rotates as an unkeyed one does.
- **The app's key.** `newIdempotencyKey('webhook')` is `webhook-` and a UUID: 44 characters of
  `[a-z0-9-]` (`lib/platform/client.ts:249-251`).
- **Where a run that waits is worded.** `pending` draws **Queued** (`lib/view/status.ts:120`, held by
  `__tests__/view-mapping.test.ts:35`) on Home's recent runs, in Activity, and in the run page's
  pill and second line (`metaFor`, `lib/view/runs.ts:60`). The run page's Started is the em dash
  until the platform dispatches the run (`toRunFacts`, `:493`; the backend sets `started_at` at
  dispatch, `snoopy-backend/apps/runs/src/postgres-dispatch.ts:96`), and its timeline says "No steps reported
  yet." (`:393`) above the declared steps, still to come. The Run dialog closes on its 201 and
  opens that page (~~`components/automations/run-dialog.tsx:84-86`~~,
  `components/automations/automation-actions.tsx:194-197`), so its post-create state is that
  page. No screen reads a run's events or a payload (`grep -rn "\.events\|payload" app components
  lib hooks` finds comments only), so `queued` has nothing to draw.
- **A 429 in the transport.** Every 429 became `PlatformRateLimitedError` with the busy words and
  no details (`lib/platform/client.ts:152-155` at `main`), and `runRefusal` had no 429 branch: a
  full flow's 429 would have read "The platform is busy right now. Try again in a moment."
- **Billing.** A card is its plan's name and price (`planCards`, `app/(tabs)/settings/billing.tsx:60-71`);
  no app code reads `capabilities` (the grep finds comments only). The platform lists only plans
  with a provider price, and keeps only numeric capabilities
  (`snoopy-backend/apps/entitlements/src/postgres-customer-billing.ts:96-118`). So Free's
  `model.calls` 25 never reaches the app, and Plus's 250 and Pro's 2,500 arrive in a map that no
  card draws.
- **§12.1 #239.** ~~`components/automations/move-version.tsx`~~ is unchanged since `dea844a` (sha256
  `4bd63595…`). The move sends `{ templateVersion }` alone (`:98`) and offers the new version's
  settings only on `invalid_config` with `targetSetup.length > 0` (`:105`). Catalog now drops the
  carried settings when the target declares none (backend 25.2.12), so the move the app already
  sends succeeds and needs no words.

**What changed** — this PR:

1. **The contract, regenerated.** `npm run generate:platform-contracts` with `SNOOPY_BACKEND_ROOT`
   at the backend's `ccc10e4` changed `lib/generated/platform-contracts/automations.d.ts` only,
   header `150d8654…`. `verify:platform-contracts` passes against that root.
2. **§12.1 #240, the app's half.** `issueWebhookAddress` takes the key and sends it as the
   `Idempotency-Key` header (`lib/platform/automations.ts:147-163`). The dialog's key belongs to the
   intent (`useIntentKeys('webhook')`, `components/automations/webhook-address-dialog.tsx:53`),
   scoped to its subscription. It is minted at the press (`:91`) and kept through a refusal or a
   lost answer, so pressing again after "The platform is unreachable" sends the same key and the
   platform answers with the secret the lost answer carried. It is spent once a secret is shown
   (`:93`), so the next press makes a new secret under a new key. The re-entry guard is unchanged
   (`:82`). **Corrected after the review of #56 (below):** the key is now held by the dialog's
   opener, `AutomationActions`, scoped to the flow in its workspace, so it is kept through the
   dialog closing too, as the website keeps it.
3. **25.2.10's words.** The transport keeps a 429's public details (`lib/platform/client.ts:149-158`,
   `lib/platform/problem.ts:58-67`), and every screen still shows the busy words with the wait.
   `runRefusal` says a 429 naming `max_concurrent_runs` in the flow's words — `FLOW_QUEUE_FULL`,
   ~~"This flow is busy and its queue is full. Try again once a run has ended."~~ (**corrected
   after the review of #56, below:** the website's sentence, verbatim)
   (`lib/content/refusals.ts:161`, `:221`); `audit:vocabulary` scans it. Nothing changed for a run
   that waits: Queued, Started's em dash and "No steps reported yet." already describe it.
4. **`model.calls`: nothing drawn, nothing changed.** `billing-screen`'s plans now carry it (Plus 250,
   Pro 2500). The test that says a card is its name and price only now also checks that no key or
   figure of it is drawn (`__tests__/billing-screen.test.tsx:90-92`).
5. **§12.1 #239: nothing changed**, recorded above.
6. **Tests.** `__tests__/automation-actions.test.tsx:431`: a press sends a key of the contract's
   shape (the real `newIdempotencyKey`), its retry after a lost answer sends the same key and shows
   the secret, and the next press sends a new key. `:396`: the secret test's key line now expects
   the press's key ("no key" until now). `:224`: the Run dialog says a full flow in the flow's
   words, and an over-quota 429 keeps the platform's. `__tests__/platform-request.test.ts:172`: the
   real transport keeps the 429's details from `createRun`, and `runRefusal` turns them into the
   words. The press register's row for Create address / Make a new secret now names the key and
   cites these tests at their current lines.

**The narrowest readings, said so.**

- "A fresh key per press, the same key on every retry": a retry is pressing again ~~in the same
  opening of the dialog~~ after a refusal or a lost answer; a press after a secret is shown is a new
  press. ~~The dialog is mounted only while open, so closing it ends the intent, and a press after
  reopening makes a new rotation, as every press did before #240.~~ **Corrected after the review
  of #56 (below):** that reading was narrower than the website, whose key outlives its dialog
  (`snoopy` #44, `WebhookAddressButton.tsx:45`, `:91-95`); the app's opener now holds the key, so
  a press after closing and reopening the dialog is the same retry. The app now always sends a key,
  and a platform started without `RUNS_WEBHOOK_SECRET_KEY` refuses a keyed issue 503
  (`webhook_secret_key`). No promoted platform can be in that state: production cannot start
  without the key (`snoopy-backend/deploy/compose.prod.yml:899`, `${WORKER_CALLER_SECRET:?}`), and local Compose
  carries a fixture (`compose.yml:476`).
- `creation_contended` is documented beside `max_concurrent_runs` with "the same advice", but keeps
  the platform's busy words ("… Try again in a moment."). Its cause is a capacity count that could
  not be taken within three seconds, not a full queue, so the full-queue sentence would not be true
  of it. Both tell the person to try again.
- The Run dialog's lead, "It starts as soon as you submit, and its page shows each step as it
  happens" (`run-dialog.tsx:108`), ~~is also the website's sentence
  (`snoopy/app/account/flows/AutomationActions.tsx:319`)~~ was the website's sentence at `7accdba`.
  It is no longer true of a run at a busy flow, which waits its turn. ~~It is not changed here,
  because it is the website's sentence and the box speaks of where pending is worded; it is
  recorded as the owner's question for both clients.~~ **Corrected after the review of #56
  (below):** `snoopy` #44, merged beside this PR, changed the website's sentence
  (`AutomationActions.tsx:319-321` at `ec9a757`), so the two clients said different things; the
  app now says the website's.
- The run page reads the run again every 2 s until it ends (`RUN_REREAD_MS`, `lib/view/runs.ts:396`,
  the owner's build 14 feedback #3), a queued run included. A run that waits minutes now keeps an
  open page there. That costs about 34 requests a minute: the run every 2 s, plus approvals at most
  every 15 s and the catalog every 120 s from the snapshot. Every plan's `workspace.rate` is 120 a
  minute (backend `snoopy-backend/scripts/seed-team-plan.sql:50`, `snoopy-backend/scripts/seed-pro-plan.sql:38`,
  `snoopy-backend/apps/entitlements/migrations/0001_entitlements_baseline.sql:273`). Not changed — a cadence, not
  words — and recorded as an observation for the owner.

**CI, red by design.** The Deployed-contract job compares each generated file's header with what
`https://api.autom8x.ai/health/live` reports. The deployed platform is the TWENTY-SECOND promotion
(`c731492`), whose `automations.yaml` is `6584ffe4…`, and this tree names `150d8654…`. So the job,
and `all-green` with it, is red until the TWENTY-THIRD promotion is read back.
`platform-requirement.json` stays `{"aheadOfDeployed": false}`: the escape is not used. The PR is
mergeable after that read-back, and rides 25.8.2's build.

**The gate**, on the committed tree: `CI=1 npm run verify` exit 0 — 87 suites / 1198 tests / 80
snapshots across the two jest projects (1195 at `main`; three tests added), lint, typecheck, the
seven audits, the contract check against the backend's `ccc10e4` and the press audit green (292
presses, every one run by a test), the facts file emitted; `npm run audit:dependencies` exit 0
(61 advisories, 19 moderate and 42 high, none critical; no dependency changed). The 80 snapshots
did not move.

**Findings for other repositories** (for a `snoopy-backend` session to file):

- BUILD-PLAN 25.2.12 and 25.2.10, the app's halves: "BUILT 2026-10-08 in `snoopy-mobile` #‹n›
  ‹sha›; mergeable after the TWENTY-THIRD promotion's read-back; rides 25.8.2's build". The PR
  carries the number and sha.
- **`createRun`'s documented 429 never reaches a client.** `snoopy-backend/apps/api/src/modules/upstream.ts`'s
  `upstreamError` keeps 400, 403, 404, 409, 422 and 503, and turns every other status into a 502
  `DEPENDENCY_FAILURE` "An upstream service failed" with no details. This was shown by command at
  `ccc10e4`: a stub hop answering Runs' own 429 (`{ reason: 'max_concurrent_runs', templateId,
  limit: '2' }`, `snoopy-backend/apps/runs/src/postgres-runs.ts:185`) through `callService`, with `createRun`'s
  allowlists, gave `{ status: 502, code: DEPENDENCY_FAILURE, details: null }`. No Edge test sends an
  upstream 429. The app's words (and the website's) wait on a 429 branch there that allowlists
  `max_concurrent_runs` (and `creation_contended`) and `limit`. Until then a person at a full flow
  reads the 502's title. **Filed as §12.1 #241; `snoopy-backend` #181 fixes it (open at `fda96d5`,
  its record naming the TWENTY-FOURTH promotion).**
- ~~For `snoopy`: #240's web half (a fresh key per press, the same key on each retry, in
  `WebhookAddressButton.tsx`); the same full-queue sentence for the 429 on a run's start; and the
  Run dialog's lead sentence, the owner's question for both clients.~~ **Corrected after the review
  of #56 (below):** `snoopy` #44 (`ec9a757`), merged beside this PR, made all three in its own
  words; the app now ports its full-queue sentence, its Run dialog lead and its key's lifetime, so
  nothing remains for `snoopy` here.

### Guards proved to bite, 25.2.12 and 25.2.10 (the app's halves)

Seven runs by one script (`mobile-d/bites/bites.py` in the session's scratchpad, with its
`results.json` and the seven jest JSON reports beside it) on this branch's tree. Each run made one
exact edit to the source and ran `jest --selectProjects unit --testPathPattern <suite>` with
`--json`. The failed tests were read from the report, the file was restored from a copy saved
before the edit and its SHA-256 compared equal, and `git status --porcelain` matched the intended
changes after every restore. Every break failed the tests named and nothing else.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| K1 · The issue carries the press's key as `Idempotency-Key` (`lib/platform/automations.ts:158`) | the header dropped from the request | `automation-actions` "sends a press an Idempotency-Key of the published shape…", "shows the secret once, in the dialog, and stores it nowhere" |
| K2 · A retry keeps its press's key (`components/automations/webhook-address-dialog.tsx:93`, spent only once a secret is shown) | the key spent on a refusal too (`keys.settle` in the catch) | `automation-actions` "sends a press an Idempotency-Key…" |
| K3 · The next press gets a new key (`:93`) | the key never spent | `automation-actions` "sends a press an Idempotency-Key…" |
| K4 · The key has the contract's shape (`:53`, `useIntentKeys('webhook')`) | a prefix the Edge refuses, `'webhook secret'` | `automation-actions` "sends a press an Idempotency-Key…", "shows the secret once…" |
| Q1 · A run refused because its flow and its queue are full says so (`lib/content/refusals.ts:221`) | the branch removed | `automation-actions` "says a run refused because the flow and its queue are full…"; `platform-request` "keeps a 429's public details…" |
| Q2 · The transport keeps a 429's public details (`lib/platform/client.ts:157`) | the details left off the error | `platform-request` "keeps a 429's public details…" |
| P1 · No plan capability is drawn unlabelled (the cards, `app/(tabs)/settings/billing.tsx:60-71`) | each card drawing its plan's capabilities as `key value` lines | `billing-screen` "shows Free, Plus and Pro in that order, each its name and price only…", at the new `model.calls` assertion |

### The app's words and the webhook key, as the website has them (Round 17, after the review of #56; 2026-10-08)

**Why.** `snoopy` #44 (`11ef3a7`, merged as `ec9a757`) and this repository's #56 (`230fc52`,
merged as `4fc5ddd`) merged within a minute of each other on 2026-10-08, after the TWENTY-THIRD
promotion's read-back. A review of #56 after both merged found the two clients saying different
things for the same platform answer, while this app's rule is that refusals are the website's
words, ported verbatim (`lib/content/refusals.ts:3-10`), and the owner's requirement is mobile =
web parity. A re-entry (MASTER-PLAN §4) on that finding, riding 25.8.2's build. Nothing else in
the app changes: no contract change, no new dependency.

**What was read, by command** (`snoopy-mobile` `main` `4fc5ddd`; `snoopy` `main` `ec9a757`, read
only):

- **The full-queue refusal.** The website says "This flow is busy and its queue is full, so the run
  was not started. Try again once one of its runs has ended." (`FLOW_QUEUE_FULL`,
  `snoopy/app/account/flows/actions.ts:217-218`; said on a 429 naming `max_concurrent_runs`,
  `:276-278`; held by `snoopy/e2e/public-edge-fixture.spec.ts:454`). The app said "This flow is busy and
  its queue is full. Try again once a run has ended." (`lib/content/refusals.ts:161` at `4fc5ddd`).
- **`creation_contended` keeps the busy words in both clients.** The website's branch names
  `max_concurrent_runs` only (`actions.ts:276`); any other 429 returns the error's message
  (`:301`), which is `busyMessage` (`snoopy/lib/platform-server.ts:131-138`, `snoopy/lib/retry-after.ts:30`).
  The app's branch names it only (`lib/content/refusals.ts:226`); any other 429 is the transport's
  `busyMessage` (`lib/platform/client.ts:155-157`, `lib/platform/retry-after.ts:28`). With no wait
  stated, as `snoopy-backend` #181 relays none, both read "The platform is busy right now. Try
  again in a moment." Nothing to change; a test now holds it here.
- **The Run dialog's lead.** The website says "Enter what this run needs. It starts when you
  submit, or waits its turn if this flow is busy, and its page shows each step as it happens."
  (`AutomationActions.tsx:319-321`; held by `snoopy/e2e/public-edge-fixture.spec.ts:444`). The app said
  "… It starts as soon as you submit, and its page shows each step as it happens."
  (~~`components/automations/run-dialog.tsx:108`~~ at `4fc5ddd`).
- **The webhook key's lifetime.** The website's key is a ref, `issueKey`, of
  `WebhookAddressButton` (`WebhookAddressButton.tsx:45`) — the component that draws the button
  and its dialog, one per flow on the Flows page (`page.tsx:389-396`, in the rows keyed by
  subscription id, `:336-339`). A press makes it unless a press before it is unanswered (`:69`),
  a secret shown spends it (`:81`), and closing the dialog leaves it (`close`, `:91-95`). Its
  browser test presses after a lost answer, a close and a reopen, and is answered with the lost
  answer's secret under the same key (`snoopy/e2e/public-edge-fixture.spec.ts:958-1015`; `keys[4]` equals
  `keys[3]` at `:1013`). The app's key was the dialog's own (`useIntentKeys('webhook')`,
  `webhook-address-dialog.tsx:53` at `4fc5ddd`), and the dialog is mounted only while open
  (`automation-actions.tsx:213-215` at `4fc5ddd`), so closing it ended the key.
- **What a person at a full flow sees today.** Neither client's sentence: the deployed Edge
  (`ccc10e4`) turns `createRun`'s 429 into 502 `DEPENDENCY_FAILURE`
  (`snoopy-backend/apps/api/src/modules/upstream.ts:199`), whose problem title is "Dependency
  Failure" (`snoopy-backend/packages/http/src/index.ts:360`), and the app shows a problem's title
  (`lib/platform/client.ts:159-164`). `snoopy-backend` #181 (open at `fda96d5`; §12.1 #241) relays
  the 429 with its reason; its record names the TWENTY-FOURTH promotion.

**What changed** — this PR:

1. **The full-queue refusal is the website's sentence**, verbatim: `FLOW_QUEUE_FULL`
   (`lib/content/refusals.ts:165-166`), compared byte for byte with `actions.ts:218`.
   `audit:vocabulary` scans it.
2. **The Run dialog's lead is the website's sentence**, verbatim (`run-dialog.tsx:110`), compared
   byte for byte with `AutomationActions.tsx:319-321` as JSX joins them.
3. **The webhook key outlives its dialog, as the website's does.** `AutomationActions`, the
   dialog's opener, holds the issue's keys (`useIntentKeys('webhook')`,
   `automation-actions.tsx:78`) and hands them to the dialog (`:221`). The dialog scopes the key to
   the flow in the workspace the press acts on (`` `${workspaceId}/${subscriptionId}` ``,
   `webhook-address-dialog.tsx:98`): minted at the press (`:100`), kept through a refusal, a lost
   answer and the dialog closing, spent once a secret is shown (`:102`). In memory only — a React
   ref, never the Keychain. The re-entry guard is unchanged (`:89`).
4. **Tests.** `__tests__/automation-actions.test.tsx`: the full-queue words, now the website's
   (`:226`); `creation_contended` keeps the busy words and never the full-queue sentence (`:255`);
   the Run dialog says the website's lead (`:270`); a lost answer, the dialog closed and opened
   again, then the next press sends the same key and shows the lost answer's secret, and nothing is
   written to the Keychain (`:554`); a secret shown spends the key across a close and a reopen
   (`:578`); the actions showing another flow, or the same flow's id in another workspace, make
   that one its own key, and the first flow's press still carries its own (`:596`, its harness
   `ActionsInTurn` at `:438`). The fake client now records a request's path ids (`:37`, `:49`).
   `__tests__/platform-request.test.ts:196-198`: the constant, now the website's sentence. The
   press register's rows this change moved cite their lines again (they had drifted since #49),
   and its Create address / Make a new secret row names the close and reopen and the new tests.

**How the app's key differs from the website's, said exactly.** Both are in memory, per flow, and
outlive the dialog. The website's is a client component's ref on the Flows page, so it lives as
long as that component: a revalidation of the page after an action keeps it (the row is keyed by
subscription id, `page.tsx:336-339`), and leaving or reloading the page ends it. The app's lives as
long as the flow's own page draws its actions — the Webhook address row is on the flow's page, not
on the list. Leaving the flow's page ends it. So does that page reading again from `loading` —
after Set up is saved, after a move (`onChanged`, `app/(tabs)/flows/detail.tsx:366`), or after a
workspace switch — which redraws the actions (`hooks/use-resource.tsx:31-36`), where the website's
page keeps its controls through a save or a move. Signing out ends both, and in the app the Face ID
lock does too, since it removes the tabs (`app/_layout.tsx:96`). After any of these, a press makes
a new key and a new rotation, as every press did before #240; the lost answer's secret was never
shown. The app also scopes the key by the workspace the press acts on; the website's button never
changes workspace, and a press there after a switch is refused before its key is sent. The prefixes
differ (`webhook-` here, `webhook-secret-` there); both keys are the contract's shape and name
nothing.

**The gate**, on the committed tree, after `npm ci`: `CI=1 npm run verify` exit 0 — 87 suites /
1203 tests / 80 snapshots across the two jest projects (1198 at `main`; five tests added), lint,
typecheck, the seven audits, the contract check against the backend's `68e1be4` (whose
`docs/openapi` is `ccc10e4`'s, `automations.yaml` `150d8654…`) and the press audit green (292
presses, every one run by a test), the facts file emitted; `npm run audit:dependencies` exit 0 (61
advisories, 19 moderate and 42 high, none critical; no dependency changed). The 80 snapshots did
not move, and nothing was regenerated.

**Findings for other repositories** (for a `snoopy-backend` session to file):

- BUILD-PLAN 25.2.10 and 25.2.12: "the app's words and key lifetime aligned with the website in
  `snoopy-mobile` #‹n› ‹sha›; rides 25.8.2's build". The PR carries the number and sha.

### Guards proved to bite, the app's words and the webhook key (Round 17)

Eight runs by one script (`bites-web-parity/bites.py` in the session's scratchpad, with its
`results.json` and the nine jest JSON reports beside it) on this branch's tree. The clean tree
first: eight suites, 244 tests, all passing (`automation-actions`, `platform-request`,
`presses-flows`, `presses-patterns-dialog-close`, `build14-over-plan`, `tab-screens`,
`dialog-boundary`, `presses-home-activity` — every suite that drives the Run or the webhook
dialog). Then each run made one exact edit to the source and ran the same eight suites with
`--json`. The failed tests were read from the report, the file was restored from a copy saved
before the edit and its SHA-256 compared equal, and `git status --porcelain` matched the intended
changes after every restore. Every break failed the tests named and nothing else.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| Q1 · The full-queue refusal is the website's sentence (`lib/content/refusals.ts:165-166`) | the sentence #56 shipped restored | `automation-actions` "says a run refused because the flow and its queue are full in the flow's words…"; `platform-request` "keeps a 429's public details…" |
| C1 · `creation_contended` keeps the busy words (`lib/content/refusals.ts:226`, the branch names `max_concurrent_runs` only) | the branch widened to `creation_contended` | `automation-actions` "keeps the platform's busy words for a run refused because the flow's runs could not be counted in time…" |
| L1 · The Run dialog's lead is the website's sentence (~~`components/automations/run-dialog.tsx:110`~~) | the lead #56 shipped restored | `automation-actions` "says, before a run starts, that it may wait its turn at a busy flow…" |
| W1 · The key outlives the dialog (held by the opener, `automation-actions.tsx:78`, `:221`) | the key ended when the dialog closes, as #56 shipped it (an unmount effect settling it) | `automation-actions` "keeps a press's key through the dialog closing…", "never sends one flow's key for another…" |
| W2 · A secret shown spends the key (`webhook-address-dialog.tsx:102`) | the key never spent | `automation-actions` "spends a key once its secret is shown, though the dialog is closed and opened again…", "sends a press an Idempotency-Key…" |
| W3 · The key is the flow's (`webhook-address-dialog.tsx:98`, the scope names `subscriptionId`) | the scope without the flow | `automation-actions` "never sends one flow's key for another…" |
| W4 · …in its workspace (`:98`, the scope names `workspaceId`) | the scope without the workspace | `automation-actions` "never sends one flow's key for another…" |
| W5 · The key is held in memory only (`:100`, nothing stored) | the key written to the Keychain at the press | `automation-actions` "keeps a press's key through the dialog closing…", "shows the secret once, in the dialog, and stores it nowhere" |

### The local release build (Round 17, for 25.8.2; 2026-10-08)

EAS's free plan builds 15 iOS releases a month, and build 16 (2026-10-07) used the last of
October's; the next cloud build waits for 2026-11-01 or a paid plan. The owner chose the free
path: build on the owner's Mac. `npm run release:ios -- --local` keeps every gate of the cloud
path — `origin/main`, a clean tree, `all-green` on HEAD, the live association file naming the
app in `applinks` and `webcredentials`, the deployed contract — and refuses a Mac without
Xcode, CocoaPods or fastlane before anything is built, so `--local --dry-run` proves the
toolchain too. It then runs `eas build --local`, which fetches the project's credentials and
its EAS `production` environment as the cloud build does and bumps the same remote build
number. Nothing is registered as an EAS build, so the cloud path's check that the build's
`gitCommitHash` is HEAD has no record to read; in its place, the gates' clean HEAD ==
`origin/main`, `eas.json`'s `cli.requireCommit`, and a check that HEAD and the tree did not
move during the build. The ipa's entitlements are read and refused exactly as the cloud
build's (`applinks` and `webcredentials` on `app.autom8x.ai`, Sign in with Apple, push in
production), and it is submitted with `eas submit --path`.

Measured first by hand, on `main` `4fc5ddd`, 16:30–16:36Z: fastlane 2.240.1 installed with
Homebrew (the one tool missing; Xcode 26.1.1 and CocoaPods 1.17.0 were present), the build
exited 0 in 5.5 minutes, the EAS `production` environment's three `EXPO_PUBLIC_*` values
loaded, the entitlements read `ENTITLEMENTS_OK`, CFBundleVersion 17, and the ipa's
`EXConstants.bundle/app.config` carried the same `backendApiOrigin`, `nativeRedirectUri` and
`nativeAuthBaseUrl` as cloud build 16's. That ipa was not uploaded; the build number it used
is spent, so the next release is 18.


### The contract from `1e5ab5b`, live with the TWENTY-EIGHTH promotion (Round 17; 2026-10-09)

The platform's AI path (BUILD-PLAN 25.2.14–25.2.16, `snoopy-backend` #190 at `1e5ab5b`) reached
production with the TWENTY-EIGHTH promotion, read back 2026-10-09 16:36:44Z. Run against
`a7965e8`, whose `snoopy-backend/docs/openapi/automations.yaml` is `1e5ab5b`'s,
`npm run generate:platform-contracts` changed `lib/generated/platform-contracts/automations.d.ts`
only: sha256 `69a65b05…`, was `150d8654…`, and one description, the model callback's — an
automation may name `models`, one to three model ids. No path, schema or status the app reads
changed; `platform.d.ts` and `connections.d.ts` stay `93fd335c…` and `ab70cb0f…`.
`scripts/release-ios.sh` refuses a build whose contract differs from production's, so this lands
before 25.8.4's build.

### 25.8.3 — the flow page's start controls, and Take photo (Round 17; 2026-10-10)

BUILD-PLAN 25.8.3 (added 2026-10-09 for the first automation, Invoice Processing, 25.7.2; approved
by the owner 2026-10-10): "The flow page's start controls at its top: the run's fields and Start
run, in place of the Run button at the bottom, and a file field offering Take photo beside Upload;
the rest of the page as it is. Drawn from the manifest's run fields, so no automation needs an app
change." The placement is the owner's "i like the suggested lets do that". The owner's decision 1
of 2026-10-10: "Take photo through `expo-image-picker`'s camera, with its camera permission text;
every image the field takes, from the camera or the library, re-encoded once with
`expo-image-manipulator` — upright, JPEG, its long side at most 2,576 px; the pickers limited to
PDF, JPEG and PNG in code, because a run-input field carries no list of types." A re-entry the
owner approved (MASTER-PLAN §4); it rides 25.8.4's build.

**What was read, by command, before the change** (`main` `dffb0bc`):

- The flow page drew the run's controls at its bottom: `AutomationActions` offered a Run button
  (`components/automations/automation-actions.tsx:127-137`) where `canRun` held — live, run input
  declared, the catalog entry available (`:84`) — opening `RunDialog`
  (~~`components/automations/run-dialog.tsx`~~, its form `RunDialogBody`: the declared defaults, the
  key renewed on every change, the upload-busy set, `createRun`, `runRefusal` with `fileGone`,
  `WORKSPACE_CHANGED`; inside `DialogBoundary` since 25.8.1). Nothing else imported `run-dialog`.
- The file field had one action, "Choose file": `DocumentPicker.getDocumentAsync({
  copyToCacheDirectory: true, multiple: false })` with no type (`run-file-field.tsx:75`), any file
  sent as picked.
- A run's input field carries no list of types: `AutomationRunInputField` is a key, title,
  description, control, `required` and an optional `defaultValue`
  (`lib/generated/platform-contracts/automations.d.ts`). The platform checks a file's type against
  the flow's manifest only when its upload opens (backend `snoopy-backend/apps/artifacts/src/routes.ts:248-255`,
  `content_type_not_accepted`).
- SDK 54's pins (`node_modules/expo/bundledNativeModules.json:51-52`): `expo-image-manipulator`
  `~14.0.8`, `expo-image-picker` `~17.0.11`; `npx expo install` added exactly those (14.0.8 and
  17.0.11, with `expo-image-loader` 6.0.0 under both), and `npx expo install --check` answers
  "Dependencies are up to date".
- `expo-image-picker`'s config plugin (plugin/build/withImagePicker.js, 17.0.11) takes
  `photosPermission`, `cameraPermission` and `microphonePermission`: a string is the iOS usage
  sentence, `false` deletes the key and, for the camera and the microphone, blocks the Android
  permission (`tools:node="remove"`). Installed, the library is one Expo's prebuild configures on
  its own: `npx expo config --type introspect` on this tree with `main`'s `app.json` gives
  `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` and `NSPhotoLibraryUsageDescription`
  in Expo's generic words ("Allow $(PRODUCT_NAME) to access your camera") and Android
  `RECORD_AUDIO`. The library's own Android manifest declares `CAMERA` and
  `READ`/`WRITE_EXTERNAL_STORAGE`, and `launchCameraAsync` asks `WRITE_EXTERNAL_STORAGE` with the
  camera below Android 10 (`android/.../ImagePickerModule.kt:271-294`), so those are left as
  declared.
- How each library makes an image upright, read in SDK 54's source — **not observed on a
  device**: `expo-image-picker`'s iOS camera result is drawn upright before it is written
  (`ios/ImageUtils.swift:50-52`, `fixOrientation()`), and its Android camera result is the file the
  camera app wrote, its EXIF orientation kept (`exporters/RawImageExporter.kt`).
  `expo-image-manipulator` 14.0.8 makes every image it loads upright: on iOS `manipulate` adds
  `ImageFixOrientationTransformer` before anything else (`ios/ImageManipulatorModule.swift:27-28`;
  the transformer redraws the pixels as displayed and drops the flag), and on Android the bitmap is
  decoded by Glide through `expo-image-loader` (`ImageLoaderModule.kt`,
  `loadImageForManipulationFromURL`), which applies the EXIF orientation, and `Bitmap.compress`
  writes none. So the app reads no EXIF and rotates nothing: a rotation by the tag on top of that
  would turn the image twice.

**What changed** — this PR:

1. **The start controls, at the top of the flow page.** `components/automations/start-run.tsx`
   (new): `StartRun` draws them under the label NEW RUN, the website's lead sentence under it
   (unchanged, `snoopy/app/account/flows/AutomationActions.tsx`), the fields in a `SurfaceCard` (the
   page's CONNECTIONS and PIPELINE grammar), a refusal in red under the card, and Start run, the
   primary pill the Run button was. Its form, `StartRunForm`, is `RunDialogBody` moved whole — the
   declared defaults, the key renewed on every change, the upload-busy set, `createRun`,
   `runRefusal` with `fileGone`, `WORKSPACE_CHANGED` — less the dialog. `canStartRun` is `canRun`,
   moved: live, run input declared, the entry available. `app/(tabs)/flows/detail.tsx` draws the box
   directly under the header row and above the tiles, where `canStartRun` holds and the flow is not
   archived (the actions were never drawn for an archived flow either); after a start it opens the
   run's page as before (`onStarted` → `/(tabs)/(home)/run`). Nothing else on the page moved.
2. **Fresh after each start.** `StartRun` draws its form anew after a start (`key={started}`), so
   the next run starts from the declared defaults, empty file fields and a new key — what opening
   the dialog again gave. The page keys the box by the flow and its pinned version, so a flow moved
   to a version with other fields draws those.
3. **25.8.1's guarantee, kept.** The form sits inside `InlineBoundary`
   (`components/dialog-boundary.tsx`), `DialogBoundary`'s sibling on the same `Catch`: a row that
   cannot be drawn is replaced, in the box, by a card in the same words — `RUN_FORM_ERROR_TITLE`
   ("Couldn't load this run's form"), `ERROR_BODY` — with Try again, which draws the form again; no
   Cancel, as nothing was opened that could be closed. The rest of the page is drawn as ever.
4. **Run leaves `AutomationActions`.** The Run button, `RunDialog`, `live` and `onRunStarted` are
   gone from it; ~~`components/automations/run-dialog.tsx`~~ is deleted (nothing else used it). The
   Go live / Pause row now comes first in the actions.
5. **Take photo beside Upload.** `components/automations/run-file-field.tsx`: two outlined pills
   under the field's description, Take photo and Upload, each named for its field to a screen
   reader ("Take a photo for Invoice"), both held while an upload is in flight. Take photo asks
   `requestCameraPermissionsAsync()` at the press; refused, the field says `CAMERA_OFF`, "Camera
   access for Autom8x is off in Settings. Turn it on there, or use Upload.", and opens nothing;
   then `launchCameraAsync({ mediaTypes: ['images'], quality: 1 })` — full quality, so the one lossy
   encode is the re-encode — and a camera that cannot open says `CAMERA_NOT_OPENED`, "The camera
   could not be opened. Try again." Upload is the document picker held to `RUN_FILE_TYPES`,
   `['application/pdf', 'image/jpeg', 'image/png']`. Closing either keeps what the field held. The
   upload itself is unchanged: abort when the field goes, busy reported under its key, refusals in
   the website's words.
6. **Every image re-encoded once.** `lib/platform/run-image.ts` (new): an image — a photo, or a JPEG
   or PNG from Upload (`isImage`: by the type the picker names, by the name when it names none) — goes
   through `reencodeImage`: `ImageManipulator.manipulate(uri)`, rendered once to measure the upright
   image, resized only when its long side is over 2,576 px — to 2,576 on that side, the other kept in
   proportion, never enlarged (`boundedResize`) — rendered, and saved once as a JPEG at 0.9; every
   native image and the context are released, and a failure is one sentence, `IMAGE_NOT_READ`
   ("The image could not be read. Try another." — the website's sentence, 25.8.5), nothing sent. It is sent as `image/jpeg`: a photo as
   `photo.jpg` (never the field's title, which may hold a separator the platform refuses — "A label,
   not a path"), an upload under its own name with `.jpg`. A PDF is sent as it is, its own name and
   type, never re-encoded.
7. **The camera's sentence, and nothing else.** `app.json` lists `expo-image-picker` with
   `cameraPermission` "Autom8x uses the camera to photograph a document a flow should read, such as
   an invoice.", `microphonePermission: false` and `photosPermission: false` (Upload is the document
   picker, which needs no photo-library access). Read back with `npx expo config --type
   introspect`: the Info.plist carries `NSCameraUsageDescription` with that sentence and neither
   `NSMicrophoneUsageDescription` nor `NSPhotoLibraryUsageDescription`; the Android manifest marks
   `RECORD_AUDIO` `tools:node="remove"`. Two native modules and an Info.plist key: this ships in a
   native build only (25.8.4), not an update.
8. **Words.** `lib/content/screen-states.ts`: `TAKE_PHOTO_LABEL`, `UPLOAD_LABEL`, `CAMERA_OFF`,
   `CAMERA_NOT_OPENED`; the boundary's note names the start controls. `audit:vocabulary` scans them.
   The app's own words: the website has no camera until 25.8.5.
9. **Tests.** `__tests__/start-run.test.tsx` (new, 45): on the flow page, the box drawn first under
   the name, above the tiles, the rest in its order, no Run button and no dialog (`:243`); offered
   exactly where Run was — six cases (`:266`), not on an archived flow (`:286`); Start run POSTs the
   declared values, opens the run's page, and the box is fresh — the note empty, the amount its
   default, the same values next time under a new key (`:292`). The form as the dialog was: the
   website's lead (`:334`), the key kept for a resubmission and renewed by a change (`:339`), a 422 /
   409 (`:366`), over the plan (`:384`), the full queue and other 429s (`:397`), `creation_contended`
   (`:421`), a file uploaded at once with Start run held, only its id sent, and emptied by
   `artifact_unavailable` with a new key (`:434`), the box fresh after a start, the file emptied
   (`:471`), and `WORKSPACE_CHANGED` for Start run, Take photo and Upload, nothing sent (`:495`). The
   file field: both actions, named (`:512`); Upload asks for exactly the three types (`:523`); a PDF
   not re-encoded (`:538`); a PNG, a JPEG and an untyped image by name re-encoded — never enlarged, a
   JPEG at 0.9 — and sent as `image/jpeg` under a `.jpg` name (`:553`), a large one bounded at 2,576
   (`:579`); a photo, sideways and upright, bounded on its long side and sent as `image/jpeg`, the
   run carrying only its id (`:596`); a refused camera says the sentence and opens nothing (`:634`);
   a closed camera keeps the field, one that cannot open says so (`:651`); an image that cannot be
   re-encoded is not sent (`:669`); `boundedResize`, `jpegName`, `isImage` and the releases
   (`:686`–`:718`). `__tests__/dialog-boundary.test.tsx`: `InlineBoundary`'s card, no Cancel, Try
   again (`:150`); the start controls draw a newer control as the website does (`:203`), are inside
   their boundary with Try again (`:224`), and on the flow page cost only the box (`:246`) — the Run
   dialog's two tests became these. `__tests__/app-config.test.js`: the plugin entry, through the
   factory, and its result through Expo's own mod compiler, introspecting — the camera's sentence,
   no microphone or photo-library key, `RECORD_AUDIO` removed (`:276`). Moved or changed:
   `automation-actions` (the Run block moved to `start-run`; one test that no Run is offered there,
   `:143`), `presses-flows` (Start run from the box, `:431`; Upload refused
   `content_type_not_accepted`, a PDF, `:599`), `presses-patterns-dialog-close` (the Run dialog's
   Cancel case gone), `tab-screens` (no start controls for a flow that declares no input, `:451`).
   The 80 snapshots did not move.

**The gate**, on the committed tree: `CI=1 npm run verify` exit 0 — lint, typecheck, the seven
audits, the contract check against `snoopy-backend` `a7965e8`'s `docs/openapi` (whose
`automations.yaml` is `69a65b05…`, what production serves; `SNOOPY_BACKEND_ROOT`), 88 suites / 1,243
tests (1,242 passed; one skipped, `repo-facts`' schema check, the backend not checked out beside this
worktree) / 80 snapshots across the two jest projects — 1,203 at `main`: 45 added in `start-run`,
two in `dialog-boundary`, one in `app-config`, the Run dialog's eight in `automation-actions` become
one and its Cancel case in `presses-patterns-dialog-close` gone — and the press audit green (292
presses, every one run by a test; 42 passthroughs audited at their callers), the facts file
emitted. `npm run audit:dependencies` exit 0 (61 advisories, 19 moderate and 42 high, none critical
and none in the new packages — the counts at `main`); `npx expo install --check`: "Dependencies are
up to date". The 80 snapshots did not move; nothing was regenerated. No native build was made.

**Not done, said so.** Android's `getPendingResultAsync` — a photo lost if the system ends the
app's activity while the camera is open — is not handled; Android ships no build. A PNG's
transparent area has no JPEG equivalent; invoices are opaque (read, not run). The camera's file,
the picked copy and the re-encoded copy stay in the app's cache, as a picked file's copy always
has; the system clears it.

**Findings for other repositories** (for a `snoopy-backend` session to file):

- BUILD-PLAN 25.8.3, the box text: "BUILT 2026-10-10 in `snoopy-mobile` #‹n› ‹sha›; rides 25.8.4's
  build" — the PR carries the number and sha.
- 25.8.4 OWNER: two native modules and an Info.plist key — a native build, as planned. Before the
  next App Store submission, App Store Connect's App Privacy gains User Content › Photos or Videos
  (README's table, "owner's call"): Take photo uploads a camera photo.
- 25.8.5 (`snoopy`): the app's words are "Take photo" and "Upload"; the website's file input takes
  any type (`snoopy/app/account/flows/RunFileField.tsx:137-144`, no `accept`) and sends it as
  picked. Whether the website also holds the picker to PDF, JPEG and PNG and re-encodes is 25.8.5's
  parity question.
- 25.8.6: `snoopy-backend` `main` `49c9fac` (#193) moved `snoopy-backend/docs/openapi/automations.yaml` to
  `fb8e574e…` from `69a65b05…`; production serves `69a65b05…` since the TWENTY-EIGHTH, and this
  gate checked the app's contract against `a7965e8`'s documents. The app regenerates when a
  promotion serves `fb8e574e…`, before 25.8.4's build if that comes first.

### Guards proved to bite, 25.8.3

Twenty-three runs by one script (`bites-25.8.3/bites.py` in the session's scratchpad, with its
`results.json`, `run.log` and the twenty-four jest JSON reports beside it) on this branch's tree. The
clean tree first: seven suites, 254 tests, all passing (`start-run`, `dialog-boundary`,
`app-config`, `presses-flows`, `automation-actions`, `tab-screens`, `presses-patterns-dialog-close`
— every suite that draws the flow page, the run's form or the app config). Then each run made one
exact edit to the source (B2 two: the box cut from its place and pasted after the tiles) and ran
the same seven suites with `--json`. The failed tests were read from the report, the file was
restored from a copy saved before the edit and its SHA-256 compared equal, and `git status
--porcelain` matched the intended changes after every restore. Every break failed the tests named
and nothing else. Upright is not among them: it is the libraries' own loading (above), which no
jest run executes.

| Guard | Broken by | Test that failed |
| --- | --- | --- |
| B1 · The start controls are offered where Run was, and only there (`canStartRun`, `components/automations/start-run.tsx:36`) | `live` dropped from the rule | `start-run` "are offered only where the Run button was — paused", "— a draft" |
| B2 · Drawn first under the flow's name, above the tiles (`app/(tabs)/flows/detail.tsx:227-238`) | the box moved after the tiles | `start-run` "are drawn first under the flow's name — above the tiles, the rest of the page in its order…" |
| B3 · Fresh after each start: the form drawn anew (`start-run.tsx:69`, `key={started}`) | the key removed | `start-run` "Start run starts this flow's run with the declared values, opens the run's page, and leaves the box fresh…", "leave the box fresh after a start…"; `presses-flows` "Start run starts this flow's run with what was entered, opens the run's page, and leaves the box empty for the next" |
| B4 · The form inside its boundary (`start-run.tsx:67-78`) | `InlineBoundary` removed from around the form | `dialog-boundary` the start controls' "is inside its boundary…", "on the flow page, a form that cannot be drawn costs the box alone…" |
| B5 · Try again on the failed card draws the form again (`retry`, `components/dialog-boundary.tsx:84`) | Try again doing nothing | `dialog-boundary` "InlineBoundary … catches a child that throws and draws the failed card…", the start controls' "is inside its boundary… Try again draws the form again once it can" |
| B6 · Upload offers a PDF, a JPEG or a PNG only (`components/automations/run-file-field.tsx:117`, `RUN_FILE_TYPES`, `lib/platform/run-image.ts:9`) | the picker offered any file | `start-run` "Upload asks the picker for a PDF, a JPEG or a PNG — exactly those three…" |
| B7 · An image from Upload is re-encoded (`run-file-field.tsx:127`, `isImage`) | an image sent as it is | `start-run` "re-encodes a PNG / a JPEG / an image … the picker could not type…", "re-encodes a large image chosen by Upload…", "sends nothing for an image that cannot be re-encoded…" |
| B8 · A photo is re-encoded (`run-file-field.tsx:109`) | the photo sent as the camera wrote it | `start-run` "takes a photo held sideways…", "takes a photo held upright…" |
| B9 · Never enlarged (`run-image.ts:44`) | every image resized to the bound | `start-run` the three "re-encodes … never enlarged…", "bounds 2576 × 1932 / 1932 × 2576 / 800 × 600 to null…" |
| B10 · The long side is bounded, either way up (`run-image.ts:45`) | the width bound whichever side is long | `start-run` "takes a photo held upright…", "bounds 3024 × 4032 to {"height": 2576}…" |
| B11 · Saved as a JPEG at 0.9, once (`run-image.ts:77`) | saved as a PNG | `start-run` the three "re-encodes … a JPEG at 0.9…", "re-encodes a large image…", the two "takes a photo…" |
| B12 · Sent as `image/jpeg` (`run-file-field.tsx:246`) | the re-encoded image sent without its type | `start-run` the three "re-encodes … sends it as image/jpeg…", the two "takes a photo…" |
| B13 · Under a `.jpg` name (`run-file-field.tsx:128`, `jpegName`) | an uploaded image sent under its own name | `start-run` the three "re-encodes … under a .jpg name" |
| B14 · The camera asked for first; refused, a sentence and nothing opened (`run-file-field.tsx:96-99`) | the camera opened whatever the permission answered | `start-run` "asks for the camera at the press; refused, the field says where to turn it on…" |
| B15 · A camera that cannot open says so in the app's words (`run-file-field.tsx:103`) | the native message said instead | `start-run` "keeps what the field held when the camera is closed, and says so when the camera cannot open" |
| B16 · A failed re-encode is one sentence, nothing sent (`run-image.ts:80`) | the native module's message thrown on | `start-run` "sends nothing for an image that cannot be re-encoded…", "releases the context and every native image, and answers only its own sentence…" |
| B17 · Every native image and the context released (`run-image.ts:82-83`) | the images never released | `start-run` the three "re-encodes …", the two "takes a photo…", "releases the context and every native image…" |
| B18 · Take photo and Upload act only on the workspace the page loaded (`run-file-field.tsx:84-86`) | the shown workspace used without asking whether it is still active | `start-run` "are refused in words, and send nothing, once another workspace is active — Start run, Take photo and Upload alike" |
| B19 · A file the platform no longer takes is emptied (`start-run.tsx:136`) | the file kept in its field | `start-run` "upload a file at once, hold Start run while it uploads… and empty it when the platform no longer takes it…" |
| B20 · The microphone off (`app.json:53`) | the line removed (Expo's default) | `app-config` "applies the expo-image-picker plugin with the camera's own sentence, and the microphone and the photo library off (25.8.3)" |
| B21 · The photo library off (`app.json:54`) | the line removed (Expo's default) | `app-config` the same |
| B22 · The camera's own sentence (`app.json:52`) | the line removed (Expo's generic words) | `app-config` the same |
| B23 · Take photo is offered beside Upload (`run-file-field.tsx:182-189`) | Take photo not drawn | `start-run` "offers both…", the two "takes a photo…", "asks for the camera…", "keeps what the field held…", "are refused in words…"; `dialog-boundary` the start controls' "is inside its boundary…" |

### The contract from `bf06166`, live with the TWENTY-NINTH promotion, and the five upload refusals in words (Round 17; 2026-10-12)

Bills & Receipts' platform half (backend BUILD-PLAN 25.2.17–25.2.33, `snoopy-backend` #197–#200 at
`bf06166`) reached production with the TWENTY-NINTH promotion, read back 2026-10-12 06:20:31Z. Run
against `c721984`, whose `snoopy-backend/docs/openapi/automations.yaml` is `bf06166`'s,
`npm run generate:platform-contracts` changed `lib/generated/platform-contracts/automations.d.ts`
only: sha256 `62201275…`, was `69a65b05…`, and descriptions alone — the upload's completion
measures a file at seal and names five refusals, the two measured ones with their numbers in
`details`; the model callback sends the run's own file, asks one model per attempt and may leave
out a model's maker (`excludeModelAuthors`, `no_model_left`); the `artifact` callback's answer
carries the file's measurements. No path, schema or status the app reads changed; `platform.d.ts`
and `connections.d.ts` stay `93fd335c…` and `ab70cb0f…`. `scripts/release-ios.sh` refuses a build
whose contract differs from production's, so this lands before 25.8.4's build.

**The five refusals in words** (backend 25.2.28, its finding for this repository: "each shows its
problem's title, 'Bad Request'"). A flow that limits a PDF's pages or an image's sides refuses,
at the upload's completion, a file over either, unlike its declared type, password-protected or
unreadable: `file_too_many_pages`, `file_image_too_large`, `file_content_mismatch`,
`file_encrypted` and `file_unreadable`. `UPLOAD_REFUSALS` (`lib/content/refusals.ts`) names
them in the website's sentences, verbatim (`snoopy/app/account/flows/upload-refusals.ts`), and
`uploadRefusalMessage` says the two measured ones with their numbers when the platform sends
them as whole numbers — a value that is not one is never shown, and the sentence without
numbers is said instead, the website's rule. The file field says every refused upload through
it (`components/automations/run-file-field.tsx`). Tests: `__tests__/upload-refusals.test.ts`
(the sentences, the numbers, the rule, every named reason, the list), and six cases in
`__tests__/start-run.test.tsx` — each refusal at the upload's completion, its sentence drawn and
no file held.

### Guards proved to bite, the five upload refusals

Five runs by one script (`c29/bites.py` in the session's scratchpad, with its rows and results
beside it) on this branch's tree: the clean tree first — `__tests__/upload-refusals.test.ts` and
`__tests__/start-run.test.tsx`, 62 tests, all passing — then each run made one exact edit, ran
the same two suites, restored the file from a copy saved before the edit and compared its
SHA-256 equal. Every break failed the tests named and nothing else; `git status --porcelain`
matched the intended changes after the last restore.

| Guard | Broken by | Tests that failed |
| --- | --- | --- |
| U1 · The measured reasons are named (`UPLOAD_REFUSALS`, `lib/content/refusals.ts`) | `file_too_many_pages` removed | `upload-refusals` "never shows a page count that is not a whole number" (all seven values), "names the five reasons…"; `start-run` "says a PDF over the page limit with a count that is not a whole number…" |
| U2 · A PDF's page numbers are said (`uploadRefusalMessage`) | the numbered sentence skipped | `upload-refusals` "names a measured file's numbers…"; `start-run` "says a PDF over the flow's page limit, in its numbers…" |
| U3 · An image's numbers are said (`uploadRefusalMessage`) | the numbered sentence skipped | `upload-refusals` "names a measured file's numbers…"; `start-run` "says an image over the flow's pixel limit, in its numbers…" |
| U4 · A number that is not whole is never shown (`wholeNumber`) | any text taken as a number | `upload-refusals` "never shows a page count that is not a whole number" ("14 pages", "-3", "1e3", "<b>14</b>", …) |
| U5 · The file field says the upload's words (`components/automations/run-file-field.tsx`) | the error's own message shown | `start-run` the six "says … refused when its upload is sealed…" |

### The account-deleted words (Round 17; 2026-10-13)

`app/(auth)/account-deleted.tsx` said "Your account and data have been permanently removed" and "You
can come back anytime — your first sign-in creates a new account". Neither held: backups, each deleted
file's record and the Supabase sign-in record outlive a deletion (the Privacy Policy's limits,
`snoopy` `b749b84`), and deletion signs out only the device that asked, so another signed-in device's
next `/v1/session` makes a new account without a sign-in (`snoopy-backend`
`snoopy-backend/apps/api/src/app.ts:504-507`, `snoopy-backend/apps/api/src/modules/auth/identity.ts:898-900`). The screen now says
the website's `/account-deleted` words (`b749b84`): "Sorry to see you go. Your account, your personal
workspace and every organization you alone owned have been deleted. Our Privacy Policy says what
deletion does not remove." and "You can come back anytime with a new account." — "Privacy Policy"
opening the website's `/privacy` when the app knows its origin, plain words when it does not.
`__tests__/account-deleted.test.tsx` holds the words, the link and Continue; bites (`c6574ef`'s
message): the old "permanently removed" back → RED; the link pointed at `/terms` → RED; restored →
GREEN. Its press reaches the haptics audit through `pressed()` since the consent's commit.

**Re-entry (MASTER-PLAN §4).** CLAUDE.md holds Round 17 here to five changes, any further one a
re-entry the owner approves. This change and the consent below were put to the owner on 2026-10-13
(the session's message: the app's deletion screen overstated, and "Apple requires a one-time consent
before a document goes to the AI … I'll add it to the mobile PR"); the owner's approval is the merge
of their pull request, and nothing here records them as approved before it.

### The consent before AI reads a run's file (Round 17; 2026-10-13)

Apple's App Review Guideline 5.1.2(i): "You must clearly disclose where personal data will be
shared with third parties, including with third-party AI, and obtain explicit permission before
doing so." Bills & Receipts sends the file given to its run to OpenRouter, which passes it to an AI
model's provider (the Privacy Policy's "Documents read by AI",
`snoopy/app/(marketing)/privacy/page.tsx:129` at `b749b84`). The website's privacy re-check
recorded this app's half as its item 7 — "A one-time consent before a document first goes to AI,
naming OpenRouter and its model providers and linking this policy" — due with the OpenRouter key
(backend 25.7.1), since this app already starts a run with a file for any flow in the catalog
(`snoopy/docs/audits/2026-08-11-round-5-phase-1-status.md:2732-2744`, `b749b84`). The words, the
gate and the store below were set for this change; nothing here records them as the owner's.

**What was read, by command, before the change** (this branch at `c6574ef`):

- One place starts a run: `StartRunForm`'s `start` (`components/automations/start-run.tsx:116-142`)
  POSTs `declaredValues(runInput, values)`, and a file field's value is the id of the file uploaded
  to the platform's store when it was given (`components/automations/run-file-field.tsx:133-157`).
  The file reaches a model only when a run of a flow that has AI read it runs.
- The catalog does not say which flows have AI read a file: `AutomationCatalogEntry`
  (`lib/generated/platform-contracts/automations.d.ts:448-473`) carries no required capabilities,
  and a declared step's `kicker` ("AI STEP") is the manifest's label for drawing the step, not where
  a file goes. So the gate is a run whose input carries a file.
- A question before an action is the shared `Dialog` (`components/dialog.tsx`): Sign out asks
  through `ConfirmDialog` (`app/(tabs)/settings/index.tsx:324-335`), whose body is one string
  (`components/confirm-dialog.tsx:29`); Delete account through `Dialog` itself, its second
  paragraph a `DialogText` under the body (`app/(tabs)/settings/account.tsx:298-321`) — Cancel
  first, the way on last. A line holding a link needs the second form.
- The Keychain is the app's one store: `lib/platform/appearance-store.ts` keeps the appearance with
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, a read that fails answering the default and a write that fails
  swallowed. The person is `session.user.userId`, a UUID
  (`lib/generated/platform-contracts/platform.d.ts:1539-1540`), as `app/_layout.tsx:139` and
  `app/(tabs)/settings/team.tsx:59` read it; a SecureStore key takes letters, digits, `.`, `-` and
  `_` (`node_modules/expo-secure-store/build/SecureStore.js:151-153`), which a UUID is.
- `npm run audit:haptics` failed on this branch as committed — "app/(auth)/account-deleted.tsx:39:
  onPress on <Text> is not pressed(…)", `c6574ef`'s Privacy Policy link — so `npm run verify`
  failed at `c6574ef`.

**What changed:**

1. **The words, in one module** — ~~`lib/content/ai-consent.ts`~~, for the website to say byte for
   byte: `AI_CONSENT_TITLE` "AI reads this file"; `AI_CONSENT_BODY` "To read the file you give this
   run, Autom8x sends it to OpenRouter, which passes it to AI model providers in the United
   States, using only endpoints that OpenRouter lists as zero data retention."; `AI_CONSENT_POLICY`,
   the second line around its link, "Our Privacy Policy names the providers and explains what may
   be kept."; `AI_CONSENT_AGREE` "Agree and start" and `AI_CONSENT_CANCEL` "Cancel"; and
   `AI_CONSENT_VERSION`, 1, which names them. `audit:vocabulary` scans them.
2. **Kept once per person on this phone, per version** — ~~`lib/platform/ai-consent-store.ts`~~, as
   `appearance-store` keeps the appearance: `expo-secure-store`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
   (`:19-21`), the value `agreed` under `autom8x.ai-consent.v{version}.{userId}` (`aiConsentKey`,
   `:26-28`). Another person on this phone, or words of a new version, find no key and are asked. A
   read that fails is no consent (`readAiConsent`, `:30-37`); a write that fails is swallowed
   (`writeAiConsent`, `:39-46`), so the run it was given for starts and the next run asks again.
   Nothing clears it: it is the person's on this phone, so a sign-out leaves it.
3. **The dialog** — ~~`components/automations/ai-consent-dialog.tsx`~~, `AiConsentDialog`: the shared
   `Dialog` as Delete account draws it — the title, the body, the second line a `DialogText`, then
   Cancel and "Agree and start" in the accent (agreeing removes nothing, so not red). "Privacy
   Policy" opens `${websiteOrigin()}/privacy` through `pressed()` (`:48`) where the origin is known,
   and is plain words where it is not, as Account deleted's link is. Closing it any other way
   (Android's back) is Cancel. Mounted only while open; not a Nocturne primitive.
4. **Asked by Start run** — `components/automations/start-run.tsx`: `start` (`:158-170`) reads the
   consent only when `carriesFile` (`:237-240`) — a file field holding an id in what
   `declaredValues` sends — and, none kept, opens the dialog and starts nothing (`asking`, `:107`).
   Start run is held while it is open (`:159`, `:227`). Cancel (`:231`) closes it: no run, nothing
   kept, the form as it was. "Agree and start" (`agree`, `:176-185`) keeps the consent, then
   `begin` (`:127-150`) — the request Start run sent before, unchanged: the workspace check,
   `createRun` with the form's key, the refusals. A run without a file never reads the Keychain.
5. **Account deleted's link ticks** — `app/(auth)/account-deleted.tsx:40`: its press goes through
   `pressed()`, as every host `Text` press does (build 11, D7), which `audit:haptics` requires.
   Nothing else on that screen moved.
6. **Tests** — `__tests__/start-run.test.tsx`, eleven new (`:851-1059`): asked on the first Start
   run with a file, in its words, the Keychain read for this person and version, Start run held
   behind it (`:908`); never asked, nor the Keychain read, for a run with no file field or with its
   file field left empty (`:929`, two cases); Agree and start keeps `agreed` under the key,
   this-device-only, before the run is sent, starts it once, and the next run with a file is not
   asked (`:943`); Cancel starts and keeps nothing, the note and the file as they were, and the
   next Start run asks again (`:972`); another person on the phone is asked (`:991`); a consent to
   the words before these is none (`:1006`); a Keychain that cannot be read asks (`:1015`); a
   consent that cannot be kept still starts the run, and the next asks (`:1027`); Privacy Policy
   opens the website's `/privacy`, the dialog staying (`:1041`), and is plain words without the
   origin (`:1051`). The words are written out in the test, not imported, so a change to them
   fails it. The file's keychain mock keeps this person's consent from each test's start, so its
   three tests that start a run with a file — `:479`, `:516`, `:704` — run as before; the
   consent's own tests start with none. The 80 snapshots did not move.
7. **Records** — the press register above: Start run's row says the consent; rows for Agree and
   start, Cancel (held in the feature file, as Keep it running is) and the two Privacy Policy
   links, the consent's and Account deleted's; Start run's, Take photo's and Upload's tests and
   Account deleted's Continue at today's lines (the test file's new mocks moved every line of it).
   `DESIGN-CONTRACT.md`'s Run bullet says the consent.

**The gate**, on this tree, inside the session's gate lock: `CI=1 npm run verify` exit 0 — lint,
typecheck, the seven audits, the contract check against `snoopy-backend` `62284de`'s documents
(`SNOOPY_BACKEND_ROOT`; "Generated platform types are current."), 90 suites / 1,274 tests (1,273
passed; one skipped, `repo-facts`' schema check, the backend not checked out beside this worktree)
/ 80 snapshots across the two jest projects, eleven of the tests added here — and the press audit
green: 296 presses, every one run by a test, 44 passthroughs audited at their callers (the
dialog's Cancel and Agree and start, audited where `start-run.tsx:231` gives them). `npm run
audit:dependencies` exit 0 (61 advisories, 19 moderate and 42 high, none critical; `package.json`
and the lockfile untouched). Nothing regenerated, no native build made.

**Not done, said so.**

- The upload is not gated: a file goes to the platform's store when it is given, as before, and the
  consent is asked when the run that hands it to AI starts — the gate set for this change.
- Every run with a file asks, a flow whose file no AI reads included: the catalog cannot say which.
- The consent lives on the phone only: each phone asks once, the platform keeps no record of it,
  and the website asks for itself (below). The app has no control to withdraw it.
- After an account deletion the item stays in the Keychain under the deleted account's id; nothing
  reads it.

**Findings for other repositories** (for a `snoopy-backend` session to file):

- `snoopy`: the website's Run window asks nothing before a file goes to AI (item 7 above). Its
  words, byte for byte, are ~~`lib/content/ai-consent.ts`~~'s.
- 25.7.1, the OpenRouter key: the consent reaches a phone only in a build made from this change —
  the app has no over-the-air update (`expo-updates` is not among `package.json`'s dependencies)
  — and a phone on an earlier build starts a run with a file without being asked. Item 7 dates the
  consent with the key, so the key waits for a build carrying this change.
- OWNER: README's App Store review notes could say that a run given a file asks first; the
  listing's text is the owner's.

### Guards proved to bite, the consent before AI reads a run's file

Twenty-one runs by one script (`bites-ai-consent/bites.py` in the session's scratchpad, with its
`results.json`, `run.log`, the twenty jest JSON reports and the three `audit:haptics` outputs
beside it) on this branch's tree. The clean tree first: five suites, 118 tests, all passing
(`start-run`, `account-deleted`, `dialog-boundary`, `presses-flows`,
`presses-patterns-dialog-close` — every suite that draws the start controls or Account deleted),
and `audit:haptics` passing. Then each run made one exact edit to the source (C4 two, C14 three)
and ran the same five suites with `--json` — C20 and C21 ran `audit:haptics` instead — the failed
tests read from the report, the file restored from a copy saved before the edit and its SHA-256
compared equal, and `git status --porcelain` matched the intended changes after every restore.
Every break failed the tests named and nothing else. C22 is the review's (below), run after them
by a second script in the same way.

| Guard | Broken by | Tests that failed |
| --- | --- | --- |
| C1 · Asked before a run that carries a file (`components/automations/start-run.tsx:162`) | the consent never read: a run with a file started at once | `start-run` the nine that open the consent: "is asked on the first Start run with a file…", "Agree and start keeps…", "Cancel starts nothing…", "is asked again of another person…", "…once its words are a new version…", "…when the Keychain cannot be read…", "starts the run when the consent cannot be kept…", "opens the website's Privacy Policy…", "says "Privacy Policy" in plain words…" |
| C2 · Only a run that carries a file is asked (`carriesFile`, `start-run.tsx:237-240`) | every run asked, a file or none | `start-run` "is never asked for a run that carries no file — no file field…", "— its file field left empty…"; `presses-flows` "Start run starts this flow's run with what was entered…"; `dialog-boundary` "draws a control newer than this build as the website does…" (neither file keeps a consent, so the dialog opened and no run started) |
| C3 · A file field left empty carries no file (`start-run.tsx:239`) | the field counted, empty or not | `start-run` "is never asked for a run that carries no file — its file field left empty…" |
| C4 · Start run held while the consent is open (`start-run.tsx:159`, `:227`) | `asking` dropped from the guard and from `disabled` | `start-run` "is asked on the first Start run with a file… — Start run held behind it" |
| C5 · Agree keeps the consent (`start-run.tsx:180`) | the write removed | `start-run` "Agree and start keeps the consent…", "is asked again of another person…" |
| C6 · Kept before the run is sent (`start-run.tsx:180-181`) | the run first, then the write | `start-run` "Agree and start keeps the consent… then starts the run once…" |
| C7 · Agree starts the run (`start-run.tsx:181`) | `begin` removed from `agree` | `start-run` "Agree and start keeps the consent…", "is asked again of another person…", "starts the run when the consent cannot be kept…" |
| C8 · Cancel starts and keeps nothing (`start-run.tsx:231`) | Cancel doing Agree's work | `start-run` "Cancel starts nothing and keeps nothing…" |
| C9 · Cancel leaves the form as it was (`start-run.tsx:231`) | Cancel emptying the note and the file | `start-run` "Cancel starts nothing and keeps nothing…" |
| C10 · The key names the person (~~`lib/platform/ai-consent-store.ts:27`~~) | the person left out of the key | `start-run` "is asked on the first Start run with a file…", "Agree and start keeps the consent…", "is asked again of another person…" |
| C11 · The key names the version (`ai-consent-store.ts:27`) | the version left out of the key | `start-run` "is asked on the first Start run with a file…", "Agree and start keeps the consent…", "is asked again once its words are a new version…" |
| C12 · A read that fails asks (`ai-consent-store.ts:35`) | a failed read taken as agreed | `start-run` "is asked when the Keychain cannot be read…" |
| C13 · A write that fails still starts the run (`ai-consent-store.ts:44`) | the failure thrown on | `start-run` "starts the run when the consent cannot be kept…" |
| C14 · Asked again after a write that failed: the Keychain the only memory (`ai-consent-store.ts:30-46`) | the consent remembered in the app's memory as well | `start-run` "starts the run when the consent cannot be kept, and asks again…", and the six later tests a consent remembered from an earlier one answered ("Cancel starts nothing…", "…another person…", "…a new version…", "…cannot be read…", "opens the website's Privacy Policy…", "…in plain words…") |
| C15 · This-device-only (`ai-consent-store.ts:20`) | `AFTER_FIRST_UNLOCK` | `start-run` "is asked on the first Start run with a file…", "Agree and start keeps the consent… this-device-only…", "is asked again of another person…", "is asked when the Keychain cannot be read…" |
| C16 · The body, word for word (~~`lib/content/ai-consent.ts:17-18`~~) | "zero data retention" made "zero retention" | `start-run` "is asked on the first Start run with a file, in its words…" |
| C17 · The second line, word for word (`ai-consent.ts:24`) | "names the providers and" dropped | `start-run` "is asked on the first Start run with a file, in its words…", "says "Privacy Policy" in plain words…" |
| C18 · Privacy Policy opens `/privacy` (~~`components/automations/ai-consent-dialog.tsx:48`~~) | it opened `/terms` | `start-run` "opens the website's Privacy Policy…" |
| C19 · Plain words where the website's origin is not known (`ai-consent-dialog.tsx:43`) | the link drawn whatever the origin | `start-run` "says "Privacy Policy" in plain words where the app does not know the website" |
| C20 · The consent's link ticks (`ai-consent-dialog.tsx:48`) | its press not through `pressed()` | `audit:haptics` "components/automations/ai-consent-dialog.tsx:48: onPress on <Text> is not pressed(…)" |
| C21 · Account deleted's link ticks (`app/(auth)/account-deleted.tsx:40`) | `c6574ef`'s bare press restored | `audit:haptics` "app/(auth)/account-deleted.tsx:40: onPress on <Text> is not pressed(…)" |
| C22 · Android's back is Cancel (`ai-consent-dialog.tsx:32`) | `onRequestClose={onAgree}`: the back keeping the consent and starting the run | `start-run` "is closed by Android's back as by Cancel…" |

### The consent's review (Round 17; 2026-10-13)

The review of this branch at `0c621a5`, before it was pushed, reported one finding, should-fix. It
was verified against the code here before anything moved, and fixed.

| Finding | Disposition |
| --- | --- |
| The record says closing the consent any other way — Android's back — is Cancel (item 3 above), and no test held it: no test in `__tests__/` or `test/` fired a dialog's `onRequestClose`. With `ai-consent-dialog.tsx:32` made `onRequestClose={onAgree}`, Android's back keeps the consent and starts the run, the file going to AI unasked, and every test passed | **fixed**: `start-run` "is closed by Android's back as by Cancel: nothing started, nothing kept, the file as it was" (`__tests__/start-run.test.tsx:1060`) fires `requestClose` at the open consent — React Native Testing Library hands it up from the dialog's card to the `Modal`'s `onRequestClose` — and holds that the consent closes, no run is sent, nothing is kept and the file is still given; C22 above |

Verified by command, by `bites-ai-consent-review/bites.py` in the session's scratchpad (its two
logs, `results-before.json`, `results-after.json` and the four jest JSON reports beside it). On
`0c621a5` as committed, the five suites the bites above run passed, 118 tests, and with the edit
the same 118 passed: the gap. On this tree, with the test, 119 passed, and with the edit the new
test alone failed — the run POSTed with the file, `{ subscriptionId: 'sub-1', input: { receipt:
'artifact-1' } }`. After each edit the file was restored from its saved copy, its SHA-256 equal,
and `git status --porcelain` was as before.

Only Android reaches it today. React Native calls a `Modal`'s `onRequestClose` for Android's back
and, on iOS, only when a sheet is swiped to dismiss (`node_modules/react-native/Libraries/Modal/Modal.js:89`;
the New Architecture's `React/Fabric/Mounting/ComponentViews/Modal/RCTModalHostViewComponentView.mm:306-322`,
on by `app.json:10`). `Dialog`'s modal is `transparent` (`components/dialog.tsx:47`), so it is
presented `overFullScreen` (`Modal.js:300-305`), which no swipe dismisses.

**The gate**, on this tree, inside the session's gate lock: `CI=1 npm run verify` exit 0 — lint,
typecheck, the seven audits, the contract check against `snoopy-backend` `62284de`'s documents
(`SNOOPY_BACKEND_ROOT`; "Generated platform types are current."), 90 suites / 1,275 tests (1,274
passed; one skipped, `repo-facts`' schema check, as before) / 80 snapshots across the two jest
projects, the test added here among them — and the press audit green: 296 presses, every one run
by a test. `npm run audit:dependencies` exit 0 (61 advisories, 19 moderate and 42 high, none
critical). Only the test file and this record changed; the record's gate line was written after
the gate, which reads no record.

**Not done, said so.** No other dialog's `onRequestClose` is run by a test either: the other 22 in
`app/` and `components/`. That is outside this change.

### The contract of backend #207, and a file with no place yet to be measured in words (Round 17; 2026-10-13)

Backend BUILD-PLAN 25.8.8: `snoopy-backend` #207 moves `snoopy-backend/docs/openapi/automations.yaml` from
`62201275…`, the contract production serves (`bf06166`'s), to `cceee630…` at its head `41917a3`, so
both clients regenerate against it, the app's before 25.8.4's build. Run with `SNOOPY_BACKEND_ROOT`
at a read-only extract of `41917a3`'s `snoopy-backend/docs/openapi.yaml` and `docs/openapi/`,
`npm run generate:platform-contracts` changed `lib/generated/platform-contracts/automations.d.ts`
only: sha256 `cceee630…`, was `62201275…`. `completeUpload` gains a 429 (`:1177-1185`): the file has
no place yet to be measured (backend 25.2.39), `details.reason` `measurement_busy`, "nothing was
refused and nothing was lost — the upload stays open, and completing it again shortly measures it".
The rest is descriptions, backend 25.2.41's first in, first out: `createRun`'s 201 and 429,
`RunStatus` and the `run-created` payload. `platform.d.ts` and `connections.d.ts` stay `93fd335c…`
and `ab70cb0f…`. `npm run verify:platform-contracts` against the same extract: "Generated platform
types are current." Production serves `62201275…` until the promotion that carries #207, and the
Deployed contract check compares this file with production's, so this lands after that promotion's
read-back, not before.

**`measurement_busy` in words** (backend SYSTEM-MANIFEST §12.1 #272, with 25.8.8). Until now the app
said the platform's busy words for it, as for every 429 (`lib/platform/client.ts:155-157`): "The
platform is busy right now. Try again in a moment." — not the problem's title, as #272 has it for
both clients. Nothing here completes an upload again: `sendRunFile` completes it once
(`lib/platform/run-file.ts:53`), and the file field empties itself after any failure and says why
(`components/automations/run-file-field.tsx:147-150`). So there was no retry to reuse, and none was
added. `UPLOAD_REFUSALS` (`lib/content/refusals.ts:184-198`) names it after the five reasons of the
refresh before (25.8.6), the same way, in the website's sentence: "Files are checked one at a time.
Nothing was lost. Choose the file again in a moment." (`snoopy/app/account/flows/upload-refusals.ts`,
its builder's change of the same day, read on its branch before it was committed; the two must land
word for word alike). Choosing the file again opens a new upload, whose completion is
measured; the first stays pending with its bytes until the platform lets it expire.
`FLOW_QUEUE_FULL`, the website's sentence for a full queue, is unchanged: 25.2.41 changes when a run
waits, not the advice the contract gives ("try again once a run has ended").

**Since then, the same day:** the app completes the same upload again by itself while its file
waits, at most four more times, and says these words only when it still waits after the last; a
person no longer chooses the file again for this answer unless it does ("A file waiting to be
measured, completed again by itself", below).

Tests: `__tests__/upload-refusals.test.ts:55` and `:67` (the sentence for a 429 that names it, any
other 429 keeping the busy words and its wait; the list), `__tests__/start-run.test.tsx:661` (the
field says it and holds no file, and the same press a moment later sends a new upload that
completes), `__tests__/platform-request.test.ts:202` (the transport keeps the completion's 429
details, and the words follow from them). Each file run alone: 12, 17 and 64 tests, all passing.
The full gate was not run in this step; it runs before the push.

**Since then:** `start-run.test.tsx:661` is replaced by the block at `:662`, whose "says the
website's words only when the file still waits at the fifth completion…" holds the words in the
field; M1–M3 below, made again against it, still fail it ("Guards proved to bite, completed again
by itself", below).

### Guards proved to bite, the busy measurement

Four runs by one script (`bites-b5b6/bites.py` in the session's scratchpad, with `spec-b5.json`,
`run-b5.log` and the jest JSON reports in `out-b5/` beside it) on this branch's tree. The clean tree
first — `upload-refusals`, `platform-request` and `start-run`, 93 tests, all passing — then each run
made one exact edit, ran the suites named, each alone, restored the file from a copy saved before
the edit and compared its SHA-256 equal; `git status --porcelain` matched the intended changes after
every restore. Every break failed the tests named and nothing else.

| Guard | Broken by | Tests that failed |
| --- | --- | --- |
| M1 · `measurement_busy` is named (`lib/content/refusals.ts:197`) | the entry removed | `upload-refusals` "says a file with no place yet to be measured…", "names the five reasons… and the busy measurement after them"; `platform-request` "keeps an upload completion's 429 details…"; `start-run` "says a file with no place yet to be measured…" |
| M2 · Its words, word for word (`refusals.ts:197`) | "Nothing was lost." made "Nothing was refused." | `upload-refusals` "says a file with no place yet to be measured…"; `platform-request` "keeps an upload completion's 429 details…"; `start-run` "says a file with no place yet to be measured…" |
| M3 · The file field says the upload's words (`components/automations/run-file-field.tsx:150`) | the error's own message shown | `start-run` "says a file with no place yet to be measured…" and the six "says … refused when its upload is sealed…" |
| M4 · The transport keeps a 429's details (`lib/platform/client.ts:157`) | the details dropped | `platform-request` "keeps an upload completion's 429 details…", "keeps a 429's public details, so a run refused at a flow whose queue is full…" |

### The line under the sign-in buttons (Round 17; 2026-10-13)

The owner's decision of 2026-10-13, 18:07Z: "by continuing you agree is better … we want it to be
easy for users to sign up and access flows not make it complicated for no absolute reason. we do
want to stay compliant but that does not mean make it harder" — one line directly under the sign-in
buttons, the same words in both clients, "By continuing, you agree to our Terms of Service and
Privacy Policy.", "Terms of Service" opening the website's `/terms` and "Privacy Policy" its
`/privacy`: no checkbox, no extra screen, no extra tap, nothing else on the screen changed. The
owner approved the round's plan that carries it with "go" the same day.

`app/(auth)/login.tsx:204-235` draws it between the providers' column and Remember me, in this
screen's secondary text as Remember me's own line is drawn — `typeScale.small`,
`palette.neutral[400]`, the regular face — and the two pages as links that look like links:
underlined, in the accent the app's other links in a sentence take (`palette.accentRamp[300]`, as
`app/(tabs)/flows/detail.tsx:306`), `accessibilityRole="link"`. Each opens the website through
`websiteOrigin()` (`lib/platform/native-auth.ts:74-83`), as Account deleted's Privacy Policy does
(`app/(auth)/account-deleted.tsx:35-45`), and presses through `pressed()`, so it ticks; where the
app does not know the website's origin the words are plain, as there. The website's line is the
same words, under its buttons in its muted text with its links in the accent, underlined
(`snoopy/app/(auth)/login/LoginForm.tsx`, its builder's change of the same day, read on its branch
before it was committed). Signing in is as it was: a provider's button signs in at one press, and
Remember me is still the screen's one switch.

Tests, in `__tests__/auth-screens.test.tsx`, which now mocks `expo-constants` for the website's
origin as `account-deleted.test.tsx` does: `:137` (the words; the providers, the line and Remember
me in that order; the line's size and colour Remember me's line's; the links underlined and named
links; one switch; a provider still one press), `:173` (the two pages, in order), `:182` (plain
words without the website's origin). Run alone: 9 tests, all passing. `audit:presses`, read
against coverage from that file alone (`--collectCoverageFrom` the screen, in the scratchpad):
the two presses resolve to their arrows (`login.tsx:216`, `:228`) and run; the register's rows
above. No real-router test: the links open the system browser and move no route (CLAUDE.md rule
11 is where a screen goes). Not run in this step, read instead: the other suites that draw this
screen — `sign-out`, `cover-haptics`, `splash-tap`, and the real-router `sign-out` and
`session-ended` — none of which asks for words the line could now answer. The full gate was not
run in this step; it runs before the push.

### Guards proved to bite, the line under the sign-in buttons

Nine runs by the same script (`spec-b6.json`, `run-b6.log` and `out-b6/` beside it). The clean tree
first — `auth-screens`, 9 tests, all passing, and `audit:haptics` passing — then each run made one
exact edit to `app/(auth)/login.tsx`, ran `auth-screens` alone (S8 `audit:haptics` instead),
restored the file from its saved copy, its SHA-256 equal, and `git status --porcelain` was as
before. Every break failed the tests named and nothing else.

| Guard | Broken by | Tests that failed |
| --- | --- | --- |
| S1 · The line is drawn (`app/(auth)/login.tsx:204-235`) | the line removed | `auth-screens` the three "the line under the sign-in buttons" tests |
| S2 · Terms of Service opens `/terms` (`login.tsx:216`) | it opened `/privacy` | `auth-screens` "opens the website's Terms of Service and Privacy Policy" |
| S3 · Privacy Policy opens `/privacy` (`login.tsx:228`) | it opened `/terms` | the same |
| S4 · Plain words where the website's origin is not known (`login.tsx:211`) | the link drawn whatever the origin | `auth-screens` "says the same words, plain, where the app does not know the website" |
| S5 · Never smaller (`login.tsx:294-298`, `agreement`) | `typeScale.caption` | `auth-screens` "says the website's words under the buttons…" (14 expected, 13 drawn) |
| S6 · Never fainter (`login.tsx:209`) | `palette.neutral[500]` | the same (Remember me's line's colour expected) |
| S7 · Under the buttons, above Remember me | the line moved below Remember me | the same (the order) |
| S8 · The links tick (`login.tsx:216`) | Terms of Service's press not through `pressed()` | `audit:haptics` "app/(auth)/login.tsx:216: onPress on <Text> is not pressed(…)" |
| S9 · Links that look like links (`login.tsx:299`, `link`) | the underline removed | `auth-screens` "says the website's words under the buttons…" |

### A file waiting to be measured, completed again by itself (Round 17; 2026-10-13)

The owner's rule of 2026-10-13 — about 17:50Z, "dont start adding blockers, see how we can work
around them", and 18:07Z, "we want it to be easy for users to sign up and access flows not make it
complicated for no absolute reason" — applied by this session, not a decision the owner took on it,
to "The contract of backend #207, and a file with no place yet to be measured in words" above: that
entry made a person choose the file again for an answer that refuses nothing. The contract's 429 on
`completeUpload` says "nothing was refused and nothing was lost — the upload stays open, and
completing it again shortly measures it" (`lib/generated/platform-contracts/automations.d.ts:1177`),
and backend 25.2.39 seals the bytes before it measures them, its `finalize` idempotent, so
completing the same upload again is safe. Its queue has two places a process and one a workspace, so
two runs started at once in one workspace, as the owner's test at the round's close does, meet it.

`lib/platform/run-file.ts` now completes the same upload again by itself (`completeWhenMeasured`,
`:87-104`). When a completion answers 429 with `details.reason` `measurement_busy` — that reason on
a `PlatformRateLimitedError`, and nothing else (`:108`) — it waits the seconds the answer's
`retry-after` states, or 1.5 s when it states none (`:109`), and completes it again, at most four
more times (`:28`, `:97`): five completions in all. Meanwhile the field keeps the state it had while
uploading — "Uploading <the file's name>…", Start run held as "Uploading…" — and says nothing new.
Only a file still waiting at the fifth completion reaches the words that entry added, unchanged
(`lib/content/refusals.ts:197`); the field is then emptied as after any refusal, and choosing the
file again sends it afresh. A refusal, any other 429 — the Edge's flood limit, a plan's request
limit — and an outage are said at once, as before. A wait ends when the upload is stopped — the
field going (`components/automations/run-file-field.tsx:70-79`) — and nothing more is sent
(`run-file.ts:100-101`, `:114-128`). `refusals.ts`'s comment on the words says so in the same seven
lines, so the words stay at `:197`.

**The 5 s bound, this session's choice** (`run-file.ts:37`, `:110`): a stated wait over 5 s is not
waited out and not cut short — that answer is said at once — so a person is never held longer and
the platform never asked sooner than it said. The platform states no wait for this answer today
(backend `41917a3`: `snoopy-backend/apps/artifacts/src/errors.ts:28-31` sets no `retry-after`, and
`snoopy-backend/apps/runs/src/artifacts-answers.ts:57-63` relays the reason alone; only the Edge's two limits send
one, `snoopy-backend/apps/api/src/app.ts:219` and `:1107`, and neither names `measurement_busy`), so the waits come
to 6 s, and to 20 s at most.

**The budgets checked against it.** The transport's 10 s for one request (`lib/platform/client.ts:29`,
`:131`): each completion is a request of its own under it, and every wait falls between requests,
never inside one. The PUT's 15 minutes (`client.ts:176`, `:199`): the waits come after it. The
upload's own life, 15 minutes from its opening — the ticket's `expiresAt` (backend
`snoopy-backend/apps/artifacts/src/routes-upload.ts:136`, with `DEFAULT_UPLOAD_TTL_SECONDS` and
`DEFAULT_S3_UPLOAD_TTL_SECONDS`, 15 × 60, at `41917a3`): at most 20 s of waiting and five requests
of at most 10 s each, 70 s in all, well inside it; an upload that ends anyway is refused
`session_expired` and said as it always was ("The upload took too long. Choose the file again.").
The session: `platformOperation` renews a credential on a 401 for each request it sends
(`client.ts:99-121`), so a wait across an access token's expiry costs nothing. Nothing else times
this path: Start run has no clock, and is held while the field uploads.

**The website.** Its builder makes the same change on its branch the same day, with the same five
completions, the same 1.5 s and the same 5 s bound (`snoopy/app/account/flows/upload-completion.ts`,
read on its branch before it was committed); the two must land alike. One difference is accepted
(the independent review of #63): the website re-checks the active workspace at every completion
(`completeRunUpload`, `snoopy/app/account/flows/upload-actions.ts:83-84`, on its branch), and the
app does not — it checks it once, when the file is chosen
(`components/automations/run-file-field.tsx:84-86`), and completes in that workspace — so a switch
during the waits ends 'Ready', Start run then refuses in `WORKSPACE_CHANGED`'s words
(`components/automations/start-run.tsx:128-130`), and nothing crosses workspaces.

Tests, with fake timers: `__tests__/start-run.test.tsx:662`, a block of ten in place of the test
that held the opposite (that the app never completes an upload again by itself) — the same upload
completed again at 1.5 s and not at 1,499 ms, the field uploading and saying nothing new meanwhile,
and the run started with the file, the words never shown (`:711`); the words only at the fifth
completion, 1.5 s apart, the same upload, no sixth a minute later, and choosing the file again
sending a new upload that completes (`:739`); no completion again for the Edge's flood limit, a
plan's request limit, a 429 that names nothing, or a refusal — each said at once, one completion a
minute later (`:769`); a stated 3 s and 5 s waited to the millisecond (`:808`); a stated 6 s said at
once (`:821`); nothing more once the field goes (`:832`). `__tests__/platform-request.test.ts:233`,
through the real transport: a 429 stating `retry-after: 3`, the same upload completed again at 3 s
and not at 2,999 ms; the test above it (`:203`) still holds the transport to asking once, its
comment corrected. Each file run alone: `start-run` 73, `platform-request` 18, `upload-refusals` 12
and `run-file` 5 tests, all passing. `audit:presses`, read against coverage from `start-run` alone
(`--collectCoverageFrom` `app/` and `components/`, in the scratchpad): Upload
(`run-file-field.tsx:196`), Take photo (`:188`), Start run (`start-run.tsx:229`) and the consent's
presses (`start-run.tsx:231`, `ai-consent-dialog.tsx:48`) resolve and run; no file in `app/` or
`components/` changed, and no press was added. The press register's rows that cite `start-run` were
re-pointed by each test's title: that entry moved them 38 lines without saying so, and
this one moves them again; Upload's and Start run's rows gain the tests above. Light checks only:
audit:vocabulary, :type, :tokens, :haptics, :credentials, :fixtures, :platform exit 0; eslint on
the changed files 0 errors (one more `import/first` warning, the test file's own pattern after its
`jest.mock` calls); tsc --noEmit exit 0. The full gate was not run in this step; it runs before the
push.

### Guards proved to bite, completed again by itself

Ten runs by the same script (`bites-b5b6/bites.py`, with `spec-b5r.json` and `spec-b5r-m.json`,
`run-b5r.log` and `run-b5r-m.log`, and the jest JSON reports in `out-b5r/` and `out-b5r-m/`, in
`bites-b5-retry/` in the session's scratchpad). The clean tree first — `start-run`, 73 tests, and
`platform-request`, 18, all passing — then each run made one exact edit, R1–R7 to
`lib/platform/run-file.ts` and M1r–M3r the edits of M1–M3 above, ran the suites named, each alone,
restored the file from its saved copy, its SHA-256 equal, and `git status --porcelain` was as
before. Every break failed the tests named and nothing else.

| Guard | Broken by | Tests that failed |
| --- | --- | --- |
| R1 · The same upload completed again (`lib/platform/run-file.ts:76`) | completed once, as before | `start-run` "completes the same upload again 1.5 s later…", "says the website's words only when the file still waits at the fifth completion…", the two "waits the %i s the answer states…"; `platform-request` "completes the same upload again after the wait its 429 states…" |
| R2 · At most four more times (`run-file.ts:97`) | no limit | `start-run` "says the website's words only when the file still waits at the fifth completion…" |
| R3 · For `measurement_busy` alone (`run-file.ts:108`) | any 429 | `start-run` "never completes again for any other answer —" the Edge's flood limit, the plan's request limit, a 429 that names no reason |
| R4 · The wait the answer states (`run-file.ts:109`) | always 1.5 s | `start-run` the two "waits the %i s the answer states…", "never waits out a stated wait over 5 s…"; `platform-request` "completes the same upload again after the wait its 429 states…" |
| R5 · Never more than 5 s (`run-file.ts:110`) | any stated wait waited out | `start-run` "never waits out a stated wait over 5 s…" |
| R6 · The wait ends when the field goes (`run-file.ts:100-101`) | the wait not stopped, nothing checked after it | `start-run` "sends nothing more once the field goes while its file waits" |
| R7 · 1.5 s when none is stated (`run-file.ts:29`) | no wait | `start-run` "completes the same upload again 1.5 s later…", "says the website's words only when the file still waits at the fifth completion…", "sends nothing more once the field goes…" |
| M1r · `measurement_busy` is named (`lib/content/refusals.ts:197`), against the new block | the entry removed | `start-run` "says the website's words only when the file still waits at the fifth completion…", "never waits out a stated wait over 5 s…" |
| M2r · Its words, word for word (`refusals.ts:197`) | "Nothing was lost." made "Nothing was refused." | the same two |
| M3r · The file field says the upload's words (`components/automations/run-file-field.tsx:150`) | the error's own message shown | `start-run` the same two, the six "says … refused when its upload is sealed…", and "never completes again for any other answer — a refusal when the upload is sealed…" |

**Since then** (the independent review of #63, approved with no blockers): the block at
`start-run.test.tsx:769` gains a fifth row, a 400 naming `measurement_busy` — the reason on another
status, said at once in its words (`refusals.ts:197`), after one completion — so the block holds eleven tests,
`start-run` 74, and the three after it sit at `:813`, `:826` and `:837`. Bitten as R3 was:
`run-file.ts:108` widened to any `PlatformError` failed that row alone (`start-run` 73 of 74;
`platform-request` 18, `upload-refusals` 12 and `run-file` 5, all passing), and restored, its
SHA-256 equal, all 74 pass.

### The Invoice Processing update's shared screens (Round 17; 2026-10-14)

**Why.** The owner's nine TestFlight items on build 19 (2026-10-14 16:08–16:16Z, read by the ASC
API; the session's memory `build-19-feedback-2026-10-14`), among them, verbatim: "All our
automations are assigned to a team. Not randomly we select. … Quickbooks is optional. There should
be a connect vendor button and takes it to a page specific for this flows vendors. If already
connected you can choose which vendor or just a none." (1); "Why is this notification here.
Shouldnt this happen at the time of signing up for the account on autom8x." (4); "Look at this no
one would want to use this at all" (6, a timeline of "Not run" lookups); "So much ai slop wording.
Small icons. No numbered category steps." (8); "Add the quickbooks logo. Every connection should
have a logo for the vendor. Then there should be an option for none" (9). The owner then:
"continue and complete. U2 is going to be in accounting. … theres no choose a team. there will be
pre existing teams depending on which flows are added." (~16:40Z), "approve. complete" (~16:35Z,
given before the plan, as approval to build it with each decision's recommended answer — recorded
as the session's recommendations, never as the owner's own choices), "ensure web is also updated
accordingly" (~16:42Z), and "go" (~18:15Z: stage B, ONE app and website update for the shared
screens). This is a re-entry here, approved by those words (MASTER-PLAN §4); backend 25.4.13 records
it in Round 17. Every word drawn is the spec's §3 (ip-update/spec.md, the session's), the
website's byte for byte; where §3 is silent, the owner's plain-words rule decided, and those lines are
listed below as this session's.

**The contract** is backend `57eac70` (#210, merged 2026-10-14 19:05:21Z), regenerated from a
read-only `git archive` of its `docs/` (`automations.yaml` sha256 `ca1fd0eb…`, `openapi.yaml`
`ab30738d…`, `connections.yaml` `bf50b980…`): `AutomationCatalogEntry.category` a closed list of
team kinds, `usesAi`, `groups`, `requiredConnections[].optional`; `AutomationDeclaredStep.group`;
the `connection` setup control; `RunDetail.details`; `SessionResponse.user.aiDocumentReading` and
`PUT /v1/session/ai-document-reading`; `createSubscription`'s `projectId` deprecated and ignored.
The Deployed contract check (CI's `contract-deployed`) is red until the promotion serves it — by
design; `platform-requirement.json` is unchanged.

**What changed** (each with its tests; the register above has every new press):

1. **U2 — a flow goes to its category's team; no picker, no Create a team.** Add opens Setup with
   the template only; Setup says "Team: {category}" (a held flow its own team) and sends no
   `projectId`; Create a team is gone from Teams, its empty state, the scope control, Home and Setup
   (~~`components/teams/create-team-dialog.tsx`~~, `teamCreateRefusal` and `createProject` deleted).
   `TEAM_TYPES` is typed against the generated category union both ways
   (`lib/content/team-types.ts`), so a kind the platform changes fails typecheck.
2. **U4/U5 — Connect vendor.** `app/(tabs)/flows/vendor.tsx` (registered in the Flows stack): the
   flow's optional connections as logos, then None; the choice is the flow's `connection` setting —
   Done carries it back to Setup (`router.dismissTo`, the one Setup, its params updated, proved under
   the real router), Save patches an added flow. QuickBooks is drawn by Intuit's own files
   (`assets/vendors/`, each sha256 held by `__tests__/vendor-logos.test.tsx`; registry
   `lib/view/brand-logos.ts`, component ~~`components/vendor-logo.tsx`~~, snapshot-pinned in both
   palettes): the full logo at 24 pt, the reversed one on dark, Intuit's Connect to QuickBooks button
   at 274 × 48, and "Disconnect from QuickBooks" — on the vendor page, Setup's and the flow page's
   CONNECT, and Settings › Connections (where the button connects at once and no text Connect or
   Reconnect stands in for it). The flow page's owed account is drawn by the provider's own icon
   (~~`iconFor(providerId)`~~, the blank of build 19).
3. **U8 — the account's AI answer.** ~~`components/ai-reading-card.tsx`~~ on Home while
   `aiDocumentReading` is null; ~~`components/settings/ai-reading-row.tsx`~~ in Settings › SECURITY;
   ~~`hooks/use-ai-reading.tsx`~~ the one answer every screen reads (the session's, or what this app
   saved over the session read in hand — until the next read, the account's word — per person);
   Start run gates a run with a file on a `usesAi` flow by it. In the same
   change the per-run dialog went: ~~`components/automations/ai-consent-dialog.tsx`~~,
   ~~`lib/platform/ai-consent-store.ts`~~ and ~~`lib/content/ai-consent.ts`~~ deleted (a Keychain entry
   `autom8x.ai-consent.v1.{userId}` already on a phone is now read by nothing).
4. **U9 — a run's progress by groups.** `toProgress` (`lib/view/runs.ts`) in place of `toTimeline`:
   one row per group with a reported step, never "Not run", never a step id, "Working…" last while
   going; Steps done is rows done over rows shown; Confidence gone; the result on its own line. The
   catalog's groups only for a run of the version they were declared for, and a reported step no
   group holds after them, never dropped, as the website draws it; the header its flow's name alone
   (the review of the Invoice Processing screens, below).
5. **U3 — a run's saved details.** DETAILS draws `RunDetail.details`, label and value.
6. **U11 — the design contract on these screens.** Numbered section headings at the label size in
   the text colour (`NumberedSectionLabel`), CONNECT/SOURCE/SETTINGS/EMAIL; `iconSize`
   (`constants/theme.ts`) — 24 for a row's label (Settings rows, setup fields, the file field,
   vendors, progress rows), 20 in buttons; "Turn on" for Activate/Publish/Resume/Go live; one-line
   leads; "Only providers configured for this deployment are shown." removed; `audit:vocabulary`
   retires "solution(s)" and "pipeline(s)".

**Lines §3 does not name, this session's** (the plain-words rule): the vendor page's disconnect
confirm, "Disconnect from QuickBooks?" (a non-brand vendor "Disconnect {name}?") with "You can
connect it again any time." and Cancel / Disconnect / Disconnecting…; the flow page's line for an
account it cannot run without, "Connect {names} first." (~~"Connect … before going live."~~), and
Setup's refusal of the same; a draft flow's count line "Not turned on yet" (~~"Not yet
published"~~); the upload refusal "Turn it on first; a paused flow takes no files." (~~"Go live
first; …"~~); a failed vendor page load "Couldn't load this flow's vendors"; the vendor page's
member line and checks as the spec draws them; M keeps Add as a link to Setup, so "Adding…" (§3.A,
the website's button) has no M state; a brand vendor's chosen-vendor row draws the logo alone, as
§3.C says a logo carries the name.

### Guards proved to bite, the Invoice Processing update

Eleven runs by one script (`ip-app-gate/bites.py`, its jest logs and `bites.json` in the
session's scratchpad), inside the gate lock, Node 22.23.2, on the final tree: each made one exact
edit, ran the tests named, restored the file from its saved copy — its SHA-256 equal every time —
and `git status --porcelain` was as before. Every break failed the tests named.

| Guard | Broken by | What failed |
| --- | --- | --- |
| M1 · `audit:vocabulary` retires "solution" and "pipeline" (`scripts/audit-vocabulary.mjs`) | `RETIRED` back to project and automation | `audit-gates` "fails copy that says project or automation…" (its three new rows) |
| M2 · Intuit's files, byte for byte (`assets/vendors/quickbooks-logo.png`) | one byte appended | `vendor-logos` "quickbooks-logo.png is the file Intuit provides, byte for byte" |
| M3 · The card only while never answered (~~`components/ai-reading-card.tsx`~~) | drawn whatever the answer | `ai-reading`: Allow / Not now hide it, a failed save, never drawn for allowed or declined (5) |
| M3 · The run gate only on a flow that uses AI (`components/automations/start-run.tsx`) | every file gated | `start-run` "is never asked for a flow that does not use AI, with a file" |
| M4 · "Working…" only while the run goes on (`lib/view/runs.ts`) | drawn on every run | `invoice-processing-screens` (2), `build14-feedback` (3) |
| M4 · A row per group, not per step (`lib/view/runs.ts`) | groups ignored | `invoice-processing-screens` PROGRESS, the second read, running, the view (4) |
| U2 · No team sent on an add (`app/(tabs)/flows/setup.tsx`) | `projectId` sent | `tab-screens` (2), `parity-flows` G10, `presses-flows` Turn on |
| U4 · Done carries the choice back to Setup (`app/(tabs)/flows/vendor.tsx`) | `vendor` dropped | `vendor-page` "chooses with a tap…", `real-router/connect-vendor` |
| U2 · Team kinds typed against the platform's categories (`lib/content/team-types.ts`) | "Other" added to `TEAM_TYPES` | `tsc --noEmit`: four errors, the first at `team-types.ts` |
| U5 · Intuit's button where QuickBooks is not connected (`components/settings/connections-card.tsx`) | never drawn | `connections-quickbooks` (6) |
| U11 · Icons 24 on a row (`constants/theme.ts`) | `iconSize.row` 20 | `vendor-logos` (4), `invoice-processing-screens` (4), `ai-reading` the sparkle |

### The review of the Invoice Processing screens (Round 17; 2026-10-14)

An independent single-pass review of `4532a42` (the screens above, not pushed) found 1 blocker, 6
should-fix and 7 nits. Each was checked against the code before anything changed; all held. Fixed
in one commit on the same branch, each with a test that fails without it (the table below):

1. **Blocker — the first add of a category's flow said "Team: a team".** An add can make the
   category's team and put the adder on it (backend ADR-0036), but `createSubscription` re-read only
   the flows and the catalog, so the teams read seconds before (kept 120 s) named no Accounting team:
   the flow page said "Team: a team", and Home's teams and the team picker missed it.
   `lib/platform/automations.ts`: an add reads the teams again; its input no longer takes a
   `projectId`.
2. **The AI card could not be closed on iOS while its save failed** (offline, a 5xx, a platform
   without the route): the dialog has no back gesture there. ~~`components/ai-reading-card.tsx`~~: after
   a failed save, Not now closes it without saving — the account still unasked, so Home asks again
   next time and a run with a file still asks first.
3. **A saved AI answer outlived the account's.** ~~`hooks/use-ai-reading.tsx`~~ kept what the app saved
   over every later session read, so an answer turned off on the website was not followed until the
   app restarted. What was saved now stands only over the session read it was saved against; the
   next read — the one behind the save, any later one, a sign-in — is the account's word.
4. **VoiceOver could not reach Connect to QuickBooks or Disconnect from QuickBooks**: both sat
   inside the vendor's radio, one accessible element. `app/(tabs)/flows/vendor.tsx`: the radio is
   the vendor's mark and the check; what to do about the vendor sits under it, outside it.
5. **The QuickBooks logo's clear space** (Intuit: half the symbol's height; 12 pt here) was 6 pt on
   Setup's and the flow page's CONNECT row and none in Settings › Connections: 12 pt in all three
   (`setup.tsx`, `detail.tsx`, `components/settings/settings-row.tsx`).
6. **A flow or run on an older version was drawn by the newest one** (Invoice Processing v1, live
   until the owner retires it): the flow page took QuickBooks as optional from v2's catalog entry,
   so a v1 flow owed it lost its CONNECT row and Turn on was greyed out with no reason; STEPS and
   PROGRESS used v2's groups, dropping v1's `find-payer`; Setup sent v2's `vendor` key to a held v1
   flow, which the platform refuses. Now a connection is optional only where the flow's own version
   has the choice; groups are drawn only for their own version (a flow or run of another version by
   its steps, as an ungrouped manifest is drawn); a reported step no group holds is drawn after the
   groups, never dropped (`lib/view/runs.ts`, as the website's `snoopy/lib/run-progress.ts`); "No steps
   reported yet." follows the rows drawn; and Setup sets up a held flow on another version with that
   version's own settings (`Subscription.setup`).
7. **An add whose answer was lost could not be tried again**: Try again re-read the flows, found
   its own copy and said "This flow is already in this workspace." Now an add that went unanswered
   (offline, a 5xx) is replayed by Try again with the same key — the platform answers with the flow
   it made — and any other answer leaves the next press to read the flows afresh.

Nits fixed: a `vendor` the link brings is taken only when it is None or one of the flow's vendors
(Setup and the vendor page); Intuit's Connect button is never dimmed, pressed or busy ("Do not
modify the appearance of any button graphics"); the vendor page says nothing of a vendor this
deployment does not list, and sends a vendor that takes a pasted key to Settings › Connections; a
test named for the old lead renamed. **This session's choice**: the run page's header says its
flow's name alone (~~"Invoice Processing · v2"~~) — the website's run page no longer says the
version either, and S9 took it off the catalog card; Activity's rows keep "· v{N}", as the
website's runs list does.

Not changed: Add stays a link to Setup and a brand vendor's chosen row draws the logo alone (the
review accepted both as this session's choices, recorded above); a 502 or offline add says "Could
not add this flow. Try again." as §3.A asks; the per-run consent's old Keychain entries
(`autom8x.ai-consent.v1.{userId}`, "agreed" only) stay unread rather than gaining a launch-time
delete; "Turn on" under "AI reading is off." keeps its visible words as its label — `PillButton` is
a frozen Nocturne primitive with no label prop, and VoiceOver reads the line before it.

### Guards proved to bite, the review of the Invoice Processing screens

Nineteen runs by one script (`ip-app-fix/bite.py`, its specs and jest logs in the session's
scratchpad), inside the gate lock, Node 22.23.2, on the final tree: each made one exact edit, ran
the tests named, restored the file from its saved copy — its SHA-256 equal every time — and the
working tree's diff hash and `git status --porcelain` were as before. Every break failed the tests
named; with the file restored, all pass.

| Guard | Broken by | What failed |
| --- | --- | --- |
| 1 · An add reads the teams again (`lib/platform/automations.ts`) | `'projects'` dropped from the add's re-read | `invoice-processing-screens` "reads the teams again once the add made the team…" |
| 2 · Not now closes the card after a failed save (~~`components/ai-reading-card.tsx`~~) | the branch removed | `ai-reading` and `start-run` "after a failed save, Not now closes the card…" (2) |
| 3 · A saved answer only over its own session read (~~`hooks/use-ai-reading.tsx`~~) | the saved answer over any read | `ai-reading` "Allow, then turned off on the website…" |
| 4 · The vendor's actions outside its radio (`app/(tabs)/flows/vendor.tsx`) | the row made one accessible element | `vendor-page` "VoiceOver reaches Connect to QuickBooks…" |
| 5 · Clear space on Setup's CONNECT (`setup.tsx`) | gap 6 | `invoice-processing-screens` "CONNECT keeps the logo's clear space…" (Setup) |
| 5 · Clear space on the flow page's CONNECT (`detail.tsx`) | gap 6 | the same, the flow page |
| 5 · Clear space in Settings › Connections (`settings-row.tsx`) | no margin | `connections-quickbooks` "keeps the logo's clear space…" |
| 6 · Optional only where the version has the choice (`detail.tsx`) | the catalog's optional for every version | `invoice-processing-screens` "still needs QuickBooks…" |
| 6 · STEPS' groups only for their version (`detail.tsx`) | the catalog's groups for every version | `invoice-processing-screens` "STEPS: its steps by title…" |
| 6 · PROGRESS' groups only for their version (`run.tsx`) | the catalog's groups for every run | `invoice-processing-screens` "a run of an older version is drawn step by step…" |
| 6 · A reported step never dropped (`lib/view/runs.ts`) | the ungrouped steps not drawn | `invoice-processing-screens` "never drops a reported step…" |
| 6 · Setup with a held older version's own settings (`setup.tsx`) | the catalog's settings always | `invoice-processing-screens` "draws and sends that version's own settings…" |
| 7 · An unanswered add replayed (`setup.tsx`) | the fresh read always | `parity-flows` "an add whose answer was lost…" |
| nit · The link's vendor checked, Setup (`setup.tsx`) | taken as given | `vendor-page` "a choice brought by the link…" |
| nit · The link's vendor checked, the vendor page (`vendor.tsx`) | taken as given | the same |
| nit · Intuit's button never dimmed (~~`components/vendor-logo.tsx`~~) | opacity 0.7 pressed or busy | `vendor-logos` "Intuit's Connect button is never dimmed…" (2) |
| nit · The run's header without the version (`run.tsx`) | "· v{N}" back | `invoice-processing-screens` "names its flow…" |
| nit · Nothing said of a vendor not offered (`vendor.tsx`) | "Ask an owner or admin…" for it | `vendor-page` "a vendor this deployment does not offer…" |
| nit · A pasted-key vendor to Settings › Connections (`vendor.tsx`) | the browser sign-in for it | `vendor-page` "a vendor that takes a pasted key…" |

### Build 21 (Round 17; 2026-10-15)

A re-entry on the owner's words after build 20 (his thirteen TestFlight items of 2026-10-15
01:38–01:58Z, read through the ASC API; his decisions D1–D4; the quick-run ask; the Intuit
decision; and his "go with all", ~04:15Z, which approved the A/B/C list given in the message it
answered — A1–A9 here — **not** the session's choices), corrected by him the same evening (AM1–AM8,
~22:15Z and ~22:35Z, which override the spec where they differ). The spec is the session's
b21/spec.md; the contract the session's `b21-contract` (backend `docs/` + `schemas/` with this
round's changes: `RunDocument`, `RunDetail.documents`, `GET …/runs/{runId}/documents`,
`AutomationSetupField.providers` and `.group`). The generated types name the bytes they came from:
`automations.yaml` sha256 `8b6b6f78…` (the backend lane's AM2 file-name words and its formatter,
2026-10-16 23:05Z), `openapi.yaml` `0f20ff23…`, `connections.yaml` `bf50b980…`. They are
regenerated from backend `main` once Release 1 is read back (spec §5, #7); until then the
Deployed contract check fails by design (it reads production, and was not run).

The owner's words this answers (verbatim):

- Item 1 / D1: "we dont need to say this at all: including AI reading of documents you add. the
  terms and privacy policy includes that information. that is jargon not needed and unnecessarily
  added." → **A1**: the account's AI answer is gone from the app — the Home card, the Settings row,
  the Start-run gate, ~~`hooks/use-ai-reading.tsx`~~, ~~`lib/platform/ai-reading.ts`~~,
  ~~`lib/content/ai-reading.ts`~~ and their test. A run with a file starts at the press. The sign-in
  line is unchanged, byte for byte.
- Item 2: "When i click one of the choices like none i shouldnt need to press done or the back
  arrow. It should just take me back to the set up page aabd be saved. If i need to connect then
  after i click and connection happens then it shoukd take me back" → **A2**: Connect vendor saves
  at the tap and goes back (`components/flows/vendor-choice.tsx`, `app/(tabs)/flows/vendor.tsx`).
- Items 4, 5: "It says connected but not connected on the main flow page" / "Why does it say
  connect when it was connected" → **A3**: the vendor row says its state; "Connect vendor ›" is
  deleted, and `audit:vocabulary` now fails it.
- Items 6, 7, 8: "Logo then to the right name then below the account email" / "Standard format and
  size for each connection component on the list not random buttons and such" / "Rather than keys
  ok the left as icons i want the logos of the company's" → **A4**, **A5**:
  `components/connection-row.tsx`, the one row everywhere; Account's glyphs.
- Item 9: "Why is there a paragraph. It should be short not an essay" → Account's one line;
  descriptions off the connection rows; no help line under any setting.
- Items 10, 11: "It shoukd show all the steps and a live tracker of which ones are done… We have
  pre determined steps and it should ahow where we are. Dashboard items should be updated too" /
  "What is the checked issue?" → **A7**'s tracker (`toTracker`), never a step's own summary — "34
  accounts read" under Received is gone — and **A6**'s live DASHBOARD.
- Item 12 and D3: "steps, then in there we have upload photo. Then show the rest of the steps.
  Then in one of the steps where data is uploaded to quickbooks it shows connected to quickbooks.
  In the bottom we can have a connections section" / "lets test this flow page order first then we
  can agree if it should be the standard" → **A6**, the TEST VERSION of his order.
- D4: "run number is the run ID. each id is unique … like a case number or uuid", and AM2: "s15 runs
  should have the full ID." → **A8**: `runLabel` is "Run {full id}" — the run page's title,
  Activity's and Home's rows, an approval's card; the facts' Run ID; the JSON file
  `run-{full id}.json`. The request id is never shown; `audit:vocabulary` now fails a `.requestId`
  read where a screen is made.
- The quick-run ask: "when a user wants to run a random flow. they shouldnt have to do a bunch of
  work in the app" → **A9**: Home's RUN A FLOW, three presses to a started run.
- ~04:05Z: "it was 3 receipts in one picture. that should work … we should get a json out that
  clearly seperates accordingly … cu price, location, and more should be there", and AM7: "ensure
  invoice number, bill number, or another standard practice from vendors is part of the json
  schema output" → the run page's DOCUMENTS (`lib/view/documents.ts`,
  `components/runs/document-card.tsx`) and Download JSON (`readRunDocuments`, the app's side of
  C1/C2).
- ~04:15Z: "we will list on apples app store not intuits. so we do not need that" → no Intuit
  button image, no "Disconnect from QuickBooks"; the two `connect-to-quickbooks*.png` files are
  deleted.
- AM4: "set up page is initial, after that flow page is the run page. set up should be made simple
  … they can have a edit settings/flow/setup thing in the bottom of the flow page" → Set up stays,
  one simple page (the vendor and None drawn right on it), and Edit setup at the flow page's bottom
  (~~the spec's S10, Set up folded into the flow page~~).
- AM5: "remove lsit teams on bottom of home page, it is useless." → Home's TEAMS is gone.

**The session's choices** (none is the owner's; listed for him with the checklist). From the
spec, as built: S11 (no help line), S12 (the row's marks: QuickBooks' symbol is the preferred
logo's top-left **536 × 536**, the round symbol's own square, measured — its pixels span columns
and rows 0–535 and the wordmark starts at column 610 — not the spec's 600 box, which sits it 32 px
off-centre; checked pixel for pixel against `quickbooks-logo.png` with PIL when it was cut, the
file's sha256 `616e1f16…` held by `vendor-logos.test.tsx`), S13, S14, S16, S21, S24, S25, S30.
This lane's own:

| # | Choice |
| --- | --- |
| M1 | The run page's title is "Run {full id}" at the title size, selectable, wrapping at its hyphens; its flow and status pill on the line under it — the full id beside a pill does not fit a phone's width. |
| M2 | Set up's one button is Turn on for a flow not added or a draft, Save for one on or paused (its status kept, then Back). Save asks only about a vendor the page changed, and never for the accounts a flow needs: turning on stays the flow page's. |
| M3 | The flow page's steps show the vendor only (AM4: "the vendor step shows its vendor"); the Approval limit and any other setting are edited on Set up through Edit setup — the spec's in-step setting rows and their dialog (A6, S10) are not built. |
| M4 | The flow page's bottom status button is drawn only while the flow is on (Pause); while it is off, Turn on is Step 1's alone — never two Turn on buttons. |
| M5 | A document's numbers are label and value rows: its own under its printed label ("Invoice #" · "INV-7"), "No." when none is printed, then each reference by its label; the date and time on their own line. |
| M6 | A step done says "Done · 2:32 PM" (the time of day); a failed step whose run gave no reason says "Failed"; a run of another version still going ends in "Step {n}" Working…. |
| M7 | A version whose vendor field names no step (Invoice Processing v2) draws its vendor row under the steps. |
| M8 | CONNECTIONS also draws any account the platform says the flow is owed that the catalog does not name, when this deployment lists it; one it does not list is named in Step 1 only. |
| M9 | Download JSON keeps its words while it works (the spec names no busy word). |
| M10 | A connection that needs attention but holds an email says the email (A4's order); its button says Reconnect. |
| M11 | What a connect came back with ("Connection completed successfully.", "… already connected …") goes when any row's button is pressed next. |
| M12 | A vendor row that is no choice (a member, a vendor this deployment does not list) still announces itself as a radio, disabled, chosen or not. |
| M13 | Edit setup is offered when the version the flow runs declares settings or accounts. |

**Found, for the backend lane (not changed here):** `RunDetail.documents` in the contract still
says `maxItems: 10` (`automations.yaml`, the `RunDetail` schema) while AM1 says no cap anywhere;
the generated types carry no bound, so the app is unaffected.

**NOT OBSERVED** in this lane: the app on a simulator or a device (nothing here was launched); a
real v3 run with three receipts; the Deployed contract check (production); the website's parity
for these screens (its own lane).

### Guards proved to bite, Build 21

Thirty-one runs of one script (b21-bites/bite.sh, its jest logs beside it in the session's
scratchpad), Node 22.23.2, each on the final tree: one exact edit, the test named run (red), the
file restored from its saved copy — its SHA-256 equal every time — and the test run again (green).

| Guard | Broken by | What failed |
| --- | --- | --- |
| A1 · no AI consent in any runtime file | `// usesAi` added to `lib/content/screen-states.ts` | `build21-screens` "no runtime file says or wires the AI consent…" |
| A1 · a run with a file starts at the press | Start run made to stop on a file and say "AI reads this file" | `start-run` "uploads the file, starts the run once…" |
| A2 · a tap saves and goes back | `router.back()` after the save removed | `vendor-page` "tapping None on a QuickBooks flow saves None once…" |
| A2 · a member's vendor not connected is no choice | the row tappable for anyone | `vendor-page` "not connected, a member is told who connects it…" |
| A3 · the vendor row says its state | always "Not connected" | `invoice-processing-screens` "A3: QuickBooks chosen and connected says Connected…" |
| A4 · one least height | 56 for 64 | `connection-row` "…the same least height…" (both palettes) |
| A5 · Account's one line | the old lead back | `account-screen` "says one line — Sign in with any of these. …" |
| A6 · Step 1 holds the document and Start run | Step 1's controls not drawn | `invoice-processing-screens` "reads top to bottom…" |
| A6 · no description under the name | the description drawn | `tab-screens` "a flow's page says it under the name…" |
| A6 · the DASHBOARD reads again while a run goes on | the timer's condition inverted | `invoice-processing-screens` "DASHBOARD is live…" |
| A6 · Edit setup opens Set up for this flow | `flow` dropped from its params | `automation-actions` "opens Set up — the one page Add opened — for this flow…" |
| AM4 · Save keeps the flow's status | `status: 'live'` sent with Save | `invoice-processing-screens` "Edit setup on a live flow: Save keeps its status…" |
| AM4 · a connected vendor is chosen on Set up | only None chosen at a tap | `tab-screens` "turns on with QuickBooks once it is connected…" |
| A7 · a group's precedence | failed before held | `build21-views` "a group is working over held over failed…" |
| A7 · a step passed over is Skipped | Waiting for it | `build21-views` "each step on its own…" |
| A7 · Steps done counts skipped groups | done only | `build21-views` "Steps done counts…" |
| A7 · never a step's own summary | a done group says its last step's summary | `invoice-processing-screens` "run 793eef82 as it was…" |
| A7 · "{quantity} × {unit price}" | never drawn | `build21-views` "every line…" |
| A7 · a document's own number under its label | always "No." | `build21-views` "its numbers…" |
| A7 · Download JSON is `run-{full id}.json` | the first eight | `invoice-processing-screens` "Download JSON hands the platform's file…" |
| A7 · Not approved | never | `invoice-processing-screens` "a waiting document reads Not approved…" |
| A8 · "Run {full id}" | the first eight | `flows-view` "is Run and the whole id…" |
| A8 · Home's rows by the full id | "· v{N}" back | `parity-home` "names each recent run by its full id…" |
| A8 · an approval's run by its full id | the first eight | `gate24-parity-activity` "draws each one's Pending pill…" |
| A9 · RUN A FLOW lists live flows only | every flow not archived | `parity-home` "lists every live flow under the greeting…" |
| AM5 · no Teams list on Home | TEAMS drawn | `parity-home` "draws no Teams list…" |
| vocabulary · "Connect vendor ›" banned | the ban emptied | `audit-gates` "Build 21" |
| vocabulary · `.requestId` read where a screen is made | another name matched | `audit-gates` "Build 21" |

(Twenty-eight guards. Three first runs stayed green — A7's group precedence, A7's skipped step and
A8's approval card: no test asserted them yet — so their tests were strengthened (`build21-views`'
precedence and per-step cases; the approval card's `approval-run-*` line) and each was run again,
red, then green.)

### The review of Build 21's screens (Round 17; 2026-10-17)

One independent pass over `round-17/b21-screens` at `651ab72` (base `main` `bd15802`), by a session
that wrote none of it, against the spec's AM1–AM8 and A1–A9 (the app's side of C1/C2), the owner's
build 20 words and screenshots (fb01–fb13, each looked at), the website's branch for the same
screens (`round-17/b21-screens` at `aa4e482`: the same tracker rules, words, money and file name)
and the contract `b21-contract` (`automations.yaml` `8b6b6f78…`). Fixed on the same branch, each
with a test proved to bite (below).

| Severity | Finding | Fixed |
| --- | --- | --- |
| should-fix | A flow page's CONNECTIONS and Set up's account rows re-read with `refresh`, which keeps the shared snapshot (15 s for connections), and `ConnectionsCard` dropped nothing after a Disconnect, a pasted key or a sign-in that came back without a handoff: a Disconnect on the flow page still drew "Disconnect", the email and the step's "Connected" until the window ran out (`main` re-read with `reload`). | `components/settings/connections-card.tsx` `reread()`: the workspace's connections and flows leave the snapshot before every re-read it asks for. |
| nit | Step 1's form was drawn anew at Turn on (a second key), so a file given while the flow was off was gone — the comment said it was kept, and the website's form keeps it. | `app/(tabs)/flows/detail.tsx`: one key on or off. |
| nit | Set up's one button (Turn on / Save) was no button to a screen reader (from before Build 21). | `app/(tabs)/flows/setup.tsx`: `accessibilityRole="button"`, busy while it sends. |
| nit | The connection row's own button is about 35 pt tall — under Apple's 44. | `components/connection-row.tsx`: `hitSlop` 8 (`CONNECTION_BUTTON_REACH`, Back's reach); the row's snapshot re-pinned for that prop alone (4 lines, both palettes). |

**The review's choices** (the session's, not the owner's): the reach is Back's 8 pt rather than a
taller button, so nothing on screen moves; Step 1 keeps a file across Turn on, as the website does.

**Seen and left, for the owner or another lane** (not changed here):

- A held run whose approval was decided still says "Waiting for approval: {reason}" on its
  approval step, under the result line's "Approved — continued in a new run" or "Rejected": the
  spec's S14 has no state for a decided hold, and the website draws the same — a change belongs to
  both clients together.
- After Release 2, a flow still on v2 draws the catalog's v3 steps by title (22 rows) on its page:
  the platform publishes one pipeline per automation, its newest (as before Build 21); the owner's
  test moves the flow to v3 first (spec §5, #9).
- On Set up, a vendor's row says "Saving…" while its sign-in sheet is open, though Set up saves
  nothing until Turn on (the sheet covers the page meanwhile).
- For the backend lane: `RunDetail.documents` still says `maxItems: 10` in the contract, and
  `RunDocumentAmount`'s pattern allows at most 12 digits before the point — both limits other than
  size, which AM1 and AM7 remove. The generated types carry neither, so the app is unaffected.

**NOT OBSERVED**: the app on a simulator or a phone (nothing launched); a real v3 run; the Deployed
contract check (it reads production).

| Guard | Broken by | What failed |
| --- | --- | --- |
| Connections read again past the snapshot | `invalidateShared` removed from `reread()` | `invoice-processing-screens` "Disconnect on CONNECTIONS: the row and its step say Not connected at once…" |
| Step 1 keeps a file across Turn on | the off form's key back to `…:off` | `build21-screens` "a paused flow: the file given first is still there after Turn on…" |
| Set up's button is a button | `accessibilityRole` removed | `invoice-processing-screens` "Add: the vendor and None right on the page…" |
| The row's button reaches 44 | `hitSlop` removed | `connection-row` "its padding, its border, its words and its reach add to 44 or more…" |

(Each run by b21-app-review/bite.sh in the session's scratchpad, Node 22.23.2: red, the file
restored sha256-equal, green.)

### Build 22 (Round 17; 2026-10-17)

A re-entry on the owner's words after build 21: his seven TestFlight items of 2026-10-17
14:30–14:39Z (read through the ASC API, each with its screenshot, `fb01`–`fb07`, looked at), and
his **"continue and complete. parallel if you can"** (21:12Z), which approved the plan given with
it — H1–H4 · F1–F3 · P1–P5 · W1–W3 — and **the session's suggestions D1–D6** shown beside it. D1–D6
are the session's, approved by the owner, never his own words: D1 the workspace's owners and admins
and the person who started a run always get its email, and the step 5 screen adds more addresses;
D2 step 3 is "AI processing"; D3 step 4 is "Details saved" with None, "QuickBooks updated"
otherwise; D4 "overflow" is OVERVIEW; D5 the website gets W1 and W2, matching the app; D6 Home's
approvals banner stays, right after TODAY. The spec is the session's b22/spec.md; the contract the
session's `b22-contract` (backend `docs/` + `schemas/` with this round's changes: no client version
move, `…/subscriptions/{id}/email-recipients`, `AutomationStepGroup.titleByConnection` and
`.platform`, `RunDetail.email`). The generated types name the bytes they came from:
`automations.yaml` sha256 `8f780521…`, `openapi.yaml` `52a5ca8d…`, `connections.yaml` `bf50b980…`
(unchanged). They are regenerated from backend `main` once the release is read back (spec §6, #10);
until then the Deployed contract check fails by design (it reads production, and was not run).

The owner's words this answers (verbatim):

- Item 1, Home: "Remove run a flow section. We did not add thus. / Remove overflow, it should be the
  3 icons for today with the run types / Then add a flow and flow buttons / Then recent runs. / I
  dont want want flows integrations, connect integrations, view teams, or run a flow. / Recent runs
  is fine" → **H1–H4**: Home is the header, the greeting, TODAY, the review banner while something
  waits (D6), Add a flow + Flows, RECENT RUNS. RUN A FLOW, OVERVIEW (D4), and the Connect
  integration and View teams rows are gone, with `quickRunRows`, `flowsFigure`,
  `integrationsFigure`, `RUN_A_FLOW_LABEL`, and the reads only they used — the connections and the
  teams (the session's S31). The first run keeps its own Add a flow.
- Items 2–4, Flows and Activity: "Flows and activity ahould have the headed buttons on top circle
  icons like home instead. / This looks odd. It should be the logos same as home for organization
  and team then to its right the box for archived and then +new can stay as is." / "Same as the
  change for flows make the organization and teams circle icons then calendar all time can stay as
  is." / "Ensure icons for activity and flows after change are in the same height on the page next
  to the section name. / In this case its Activity then to its right the icons as deacribed.
  Symmetry and standard" → **F1–F3**: `components/title-row.tsx` on both — the title, Home's two
  circles (`ScopeIcons`, unchanged look) 8 pt right of it and 8 apart, flexible space, the page's
  controls — 38 tall, every item centred, first under the same top padding; `ScopeControl`'s pills
  deleted (`ScopePill` stays for the time range).
- Items 5–7, the flow page: "Step 1 is upload invoice. / Why do we have so many steps the user
  doesnt care about. It should be / 1. Upooad Invoice / 2. Connect integration - shows either none
  or quickbooks or any other integration like quickbooks. It should show the integration type, then
  if i click that button it should take me to the choices I have like none or quickbooks. / 3. Then
  something about AI Processing / 4. Quickbooks updated / 5. Email sent- this should show the email
  the automation sends to. … When i select this step it should take me to the page where i can edit
  in a screen the email it should send to. / We need ti discuss where the email goes. It should go
  to the owner/admin and the person that uploaded the document." / "Im on v3 now. But make sure it
  still has the steps the way i described in my comments" / "After step 4 i dont want to see
  quickbooks, remember i integrated it into the step. Remove the connections in the bottom as well .
  I also dont want a move to vx number in the flows. The user always gets the latest version. They
  dont get to oick when to update" → **P1–P4**: the five steps from Invoice Processing v4's groups,
  titles only (`flowStepPlan`'s kinds), the integration row in step 2, step 4 by
  `titleByConnection` (D2, D3), step 5's row of who gets the email; no CONNECTIONS; no move —
  ~~`components/automations/move-version.tsx`~~ and `setup-dialog.tsx` deleted, `MOVE_REFUSALS` gone,
  `templateVersion` sent by no write (`setup.tsx`'s Add, `lib/platform/automations.ts`); the
  choices page titled "Connect integration" (S21); **P5**'s screen, Who gets the email
  (`app/(tabs)/flows/email.tsx`, D1); and the run page's setting step, step 4's title and step 5
  (S23–S25), the version gate at `run.tsx:182` gone. `audit:vocabulary` now fails "Move to v" and
  "Connect vendor" in copy.

**The session's choices** (none is the owner's; listed for him with the checklist). From the spec, as
built: S12, S13, S20, S21, S22, S23, S24, S25, S26, S30, S31. This lane's own:

| # | Choice |
| --- | --- |
| M1 | A setting step draws its connection fields, as the integration row; any other kind of field a setting step names is edited on Set up, not drawn on the flow page (the app has no in-step editor; Build 21's M3). |
| M2 | Step 5 says the design's em dash while its read is in flight, and "The person who starts the run" when nobody is listed (a member who may not read the workspace's people, and no extra address). It is read again on every return to the page, so a change on the email screen shows at once. |
| M3 | The title row's rule is measured, not guessed: the title's and the controls' widths by `onLayout`, the least space before the controls 8 pt; the controls' full width is kept while Archived is a circle, so the word comes back when the row widens. The Archived circle is the scope circles' own (`CircleButton`, glyph 19), so every circle in the row is one. |
| M4 | On Flows and Activity the workspace circle opens the switcher with any number of workspaces, as Home's always did; the pill's rule (two or more, or a cut list) went with the pills. |
| M5 | The flow page keeps drawing the catalog's groups only for the version they were declared for (the run page's gate is the one the spec drops); every flow is moved to the newest, so the two differ only for a flow the platform could not move. A v3 vendor, which names a step with work, is not drawn on the page (Set up has it). |
| M6 | The run page reads the flow's live row, and the archived list only when the run's flow is not live; a flow that cannot be read makes a setting step say "Done" and step 4 its own title. |
| M7 | A `platform` this build does not know is, on the run page, its title with no line, CircleDashed in the muted colour, and not counted in Steps done ("a step with no state"). |
| M8 | The email screen: Add also from the keyboard's Done; the field clears after a saved add; typing clears the line under the section; one write at a time (X and Add wait while one is sent); the X is a 38-pt circle with an 8-pt reach. Its rows are the one connection row (mark 24 · address · line), its None the Prohibit mark. A failed load says "Couldn't load this flow" — the flow page's words, no new title. |
| M9 | `setup-dialog.tsx` is deleted whole: its only user was the move dialog. |
| M10 | The Build 21 review's Disconnect guard (connections read again past the snapshot) is held where Disconnect now is, Settings › Connections. |

**Found, for the backend lane (not changed here):** `FlowEmailAddress`'s pattern is not in the
generated types (openapi-typescript drops `pattern`), so `lib/view/flow-email.ts` restates it, cited;
a change to the contract's pattern needs the same change there.

**NOT OBSERVED** in this lane: the app on a simulator or a device (nothing here was launched); a real
v4 flow, run or email; the release's automatic move; the Deployed contract check (production); the
website's lane (its own).

**Presses** (the register "Every press, its test (build 13)" and its later rows stay as written;
these are this change's):

| Press | Configured to | Held by |
| --- | --- | --- |
| `app/(tabs)/flows/index.tsx` — Archived as its icon (`CircleButton`) | opens Archived flows | `build22-screens` "Archived keeps its word where it fits … the same press" |
| `scope-control.tsx` — the scope circles on Flows and Activity (`CircleButton`, through `ScopeIcons`) | the switcher, with any number of workspaces; Show | `presses-home-activity` (the scope tables), `scope-control` |
| `app/(tabs)/flows/detail.tsx` — step 5's row | Who gets the email, `{ flow }`; unread too | `build22-screens` "step 5: the first address …", "step 5 unread says Unavailable …"; real-router `connect-vendor` "step 5 opens Who gets the email …" |
| `app/(tabs)/flows/email.tsx` — Back | goes back | `build22-screens` "Back goes back"; `presses-patterns-back-circle` "Who gets the email" |
| `app/(tabs)/flows/email.tsx` — X | PUT the list without it, "Removing…" meanwhile; refused, the words and the list kept | `build22-screens` "X removes the address at once …", "a refusal or a failure …" |
| `app/(tabs)/flows/email.tsx` — Add | checks, then PUT the whole list; shows the answer | `build22-screens` "Add sends the whole list once …", the Add table, "a refusal or a failure …" |
| `app/(tabs)/flows/email.tsx` — its failed load's Retry and Back | as every fetching screen | `presses-patterns-failure-states` "Who gets the email" (3 rows) |
| ~~Home — RUN A FLOW's rows, Connect integration, View teams~~ | gone (item 1) | `parity-home` "draws no RUN A FLOW …" |
| ~~`scope-control.tsx` — the workspace pill, the team pill~~ | gone (items 2–3) | `build22-screens` "Flows: …", "Activity: …" |
| ~~`move-version.tsx` — Move to vN, its confirm, its Cancel; `setup-dialog.tsx` — Save and move~~ | gone (item 7) | `automation-actions` "offers no Move …" |
| ~~`app/(tabs)/flows/detail.tsx` — CONNECTIONS' Connect / Reconnect / Disconnect~~ | gone from the flow page (item 7); Settings › Connections keeps them | `build22-screens` "no CONNECTIONS …"; `invoice-processing-screens` "P3: no CONNECTIONS …", "Disconnect on Settings › Connections …" |

Tests: `__tests__/build22-screens.test.tsx` (27) and `__tests__/build22-views.test.ts`; Home's,
the title rows', the flow page's, the run page's and the move's existing tests moved to the new
rules (`parity-home` — Gate 24's G5 and G6 notes struck there — `build14-home-scope-icons-and-first-run`,
`build14-activity-range`, `scope-control`, `presses-home-activity`, `invoice-processing-screens`,
`automation-actions`, `parity-flows`, `tab-screens`, `vendor-page`, real-router `home-links` and
`connect-vendor`); `test/platform.tsx` gains `invoiceProcessingV4Entry()` and `recipientsPayload()`
(example.com addresses only), and routes the recipients read.

### Guards proved to bite, Build 22

Thirty-one runs of one script (`b22-app-bites/bite.py`, its jest logs beside it in the session's
scratchpad), Node 22.23.2, each on the final tree: one exact edit, the test named run (red: a test
failed), the file restored from its saved copy — its SHA-256 equal every time — and the test run again
(green: it passed).

| Guard | Broken by | What failed |
| --- | --- | --- |
| H4 · Home top to bottom: the banner right after TODAY | the banner never drawn (`approvalCount < 0`) (`app/(tabs)/(home)/index.tsx`) | `parity-home` "the header, the greeting, TODAY, the banner…" |
| H2 · no OVERVIEW on Home | OVERVIEW drawn again over TODAY (`app/(tabs)/(home)/index.tsx`) | `parity-home` "draws no RUN A FLOW…" |
| S31 · Home reads no connections | the connections read again beside the six (`app/(tabs)/(home)/index.tsx`) | `parity-home` "reads only what it draws…" |
| F1 · the circles beside the title | `ScopeIcons` taken out of the row (`components/title-row.tsx`) | `build22-screens` "Flows: the title, the two circles…" |
| S26 · Archived its icon alone when the row is too narrow | the rule 100 pt looser (`components/title-row.tsx`) | `build22-screens` "Archived keeps its word where it fits…" |
| F3 · the row 38 tall, centred | `height` 38 made `minHeight` (`components/title-row.tsx`) | `build22-screens` "the circles sit at the same height…" |
| F3 · the same top padding on both pages | Activity's top padding 4 pt more (`app/(tabs)/activity/index.tsx`) | `build22-screens` "the circles sit at the same height…" |
| P1 · step 4 titled by the connection chosen | the step's own title, never by connection (`lib/view/pipeline.ts`) | `build22-screens` "QuickBooks: 1 · Upload invoice…" |
| P2 · nothing between step 4 and step 5 | the email row under every step with work (`app/(tabs)/flows/detail.tsx`) | `build22-screens` "nothing between step 4…" |
| P3 · no CONNECTIONS | CONNECTIONS drawn under STEPS (`app/(tabs)/flows/detail.tsx`) | `build22-screens` "no CONNECTIONS and no move…" |
| P4 · no Move | "Move to v2" drawn in the actions (`components/automations/automation-actions.tsx`) | `automation-actions` "offers no Move…" |
| P4 · no version sent at create | `templateVersion` sent with Add (`app/(tabs)/flows/setup.tsx`) | `parity-flows` "with nothing added since…" |
| S22 · step 5: the first address and "and {n} more" | "and {all} more" (`lib/view/flow-email.ts`) | `build22-screens` "step 5: the first address…" |
| S22 · step 5 unread says Unavailable | the em dash for a failed read (`app/(tabs)/flows/detail.tsx`) | `build22-screens` "step 5 unread says Unavailable…" |
| archived · no addresses read | an archived flow's addresses read (`app/(tabs)/flows/detail.tsx`) | `build22-screens` "an archived flow…" |
| S21 · the choices page is Connect integration | the title "Choose integration" (`lib/content/screen-states.ts`) | `vendor-page` "says what it is and for which flow…" |
| S12 · a member: no X, no field | the field drawn for anyone (`app/(tabs)/flows/email.tsx`) | `build22-screens` "a member sees the list…" |
| S30 · Already on the list, without case | compared with case (`lib/view/flow-email.ts`) | `build22-screens` "Add "Owner@Example.com"…" |
| S30 · Enter an email address | any text taken as an address (`lib/view/flow-email.ts`) | `build22-screens` "Add "bookkeeper"…" |
| S13 · You can add up to 10. | the limit 11 (`lib/content/screen-states.ts`) | `build22-screens` "at ten the field gives way…" |
| S30 · X: one PUT without it | the PUT keeps the address (`app/(tabs)/flows/email.tsx`) | `build22-screens` "X removes the address at once…" |
| S30 · X says Removing… meanwhile | no "Removing…" (`app/(tabs)/flows/email.tsx`) | `build22-screens` "X removes the address at once…" |
| S30 · Could not save. Try again. | a failed save says nothing (`app/(tabs)/flows/email.tsx`) | `build22-screens` "a refusal or a failure says…" |
| S23 · a setting step says the integration | a setting step always "Done" (`lib/view/runs.ts`) | `build22-screens` "succeeded and emailed…" |
| S23 · the run page's step 4 by the flow's choice | the flow's settings read as none (~~`app/(tabs)/(home)/run.tsx`~~ (`app/(tabs)/activity/run.tsx` since round 24)) | `build22-screens` "succeeded and emailed…" |
| S24 · Sending… while owed | "Waiting" for an owed email (`lib/view/runs.ts`) | `build22-screens` "its email owed…" |
| S24 · a cancelled run: Stopped | a cancelled run's email by its email state (`lib/view/runs.ts`) | `build22-screens` "running: 5 Waiting; cancelled: 5 Stopped…" |
| S25 · no version gate on the run page | the version gate back on the groups (~~`app/(tabs)/(home)/run.tsx`~~ (`app/(tabs)/activity/run.tsx` since round 24)) | `build22-screens` "is drawn by the five steps…" |
| a step with no state is not counted | a step with no state counted (`lib/view/runs.ts`) | `build22-views` "a platform step this build does not know: its title…" |
| vocabulary · "Move to v" banned | "Move to v" taken off the ban (`scripts/audit-vocabulary.mjs`) | `audit-gates` "Build 22…" |
| vocabulary · "Connect vendor" in any form | the ban back to "Connect vendor ›" (`scripts/audit-vocabulary.mjs`) | `audit-gates` "Build 22…" |

(Thirty-one guards. Three first runs proved nothing — two failures whose message held a screen
element jest could not send between its workers (`expect([word, queryByText(word)])`), now asserted
as a boolean, and one whose test name was read as a pattern ("(…)") so no test ran — so the script
now counts a red only when a test failed and a green only when one passed, and those three were run
again: red, then green.)

### The review of Build 22's screens (Round 17; 2026-10-17)

One independent pass over `round-17/b22-screens` at `32de6cf` (base `main` `903f461`), by a session
that wrote none of it, against the spec's "Done means" for H1–H4, F1–F3, P1–P4, the email screen and
the run page, the owner's seven build 21 items and their screenshots (fb01–fb07, each looked at), the
website's branch for the same screens (`round-17/b22-screens` at `0e15368`: the same words, the same
step plan and tracker rules, the same flow-page gate) and the contract `b22-contract`
(`automations.yaml` `8f780521…`). Widths below are Inter's own advance widths at the app's sizes
(the 500 weight's font file in `node_modules`), which match the owner's fb02 screenshot (Archived
113 pt and New 82 pt at 14 a side). Fixed on the same branch, each with a test proved to bite (below).

| Severity | Finding | Fixed |
| --- | --- | --- |
| should-fix | The title rows ran off a 320-pt screen (iPhone SE 1st generation; Display Zoom on an SE or a mini), which leaves 280 inside the margins: Flows, with Archived already a circle, needs 303 (79 + 8 + 84 + 8 + 38 + 8 + 78), so New ran 23 pt past the margin; Activity needs 320 (102 + 8 + 84 + 8 + 118), so All time ran 40 pt past it, 20 past the screen's edge. Both the title and the controls are `flexShrink: 0`, and Archived was the only narrower form. | `components/title-row.tsx`: `titleRowLevel`, a measured ladder — each narrower form of the page's controls drawn only when the one before it does not fit, each form's width kept, the words back when the row widens; Flows' second form draws New as its Plus in a 38-pt accent circle ("New"), Activity's first its calendar in a 38-pt circle ("Time range: {range}", the same card). 375 pt and wider are unchanged: the owner's 420-pt phone draws every word. |
| should-fix | The email screen's Email address field sits under its lists, and the screen did not make room for the keyboard: with two people, the starter and one extra address the field ends about 485 pt down, under a keyboard that opens at about 407 on a 667-pt-tall phone, so what is typed is hidden. | `app/(tabs)/flows/email.tsx`: the scroll view's `automaticallyAdjustKeyboardInsets` (iOS: room for the keyboard, the focused field brought into view). |
| nit | The field was said aloud by its placeholder only, so once it held an address VoiceOver read the address with no name; the website's field has its label. | `accessibilityLabel` "Email address" (the spec's word). |

**The review's choices** (the session's, not the owner's; also in the spec, §8.M): M11 — on a row too
narrow for every word, Flows' New becomes its accent circle after Archived, and Activity's time range
its calendar circle, rather than letting the row run off the screen or wrap; the owner's "+new can stay
as is" and "calendar all time can stay as is" hold on every phone 343 pt wide or more (Flows) and 360
or more (Activity). M12 — the email screen makes room for the keyboard with the scroll view's own
inset rather than a keyboard-avoiding wrapper, so nothing on the page moves until the field is focused.

**Seen and left, for the session or another lane** (not changed here) — both FIXED by the session on 2026-10-18 before the push: an archived flow from before v4 shows no steps (the session's S34, `olderArchived` in `app/(tabs)/flows/detail.tsx`; the website's flow page already refuses archived flows, `page.tsx:147-151`), and the row is read aloud "{name}: change the integration" and the choices page's failed load says "Couldn't load this flow's integrations" (the website's `aria-label` the same); tests in `build22-screens`:

- An archived flow from before v4 — never moved (spec §5) — still draws the catalog's 22 steps by
  title on its read-only page, the list the owner's item 5 objected to, because the flow page draws
  the catalog's groups only for the version they were declared for (M5; the website the same,
  `snoopy/app/account/flows/[subscriptionId]/page.tsx:196`). The spec's "an archived flow's page draws step
  2's row and step 5's title" holds for a flow archived on v4. Drawing v4's five steps for an older
  flow needs a rule for its settings (v3's `vendor` names a step v4 does not have; v1 has none) in
  both clients at once.
- The integration row is still read aloud "{name}: change the vendor" (`app/(tabs)/flows/detail.tsx:338`),
  and the choices page's failed load says "Couldn't load this flow's vendors"
  (`lib/content/screen-states.ts:61`), beside the title "Connect integration" (S21: one word for one
  thing). The website's row says the same (`page.tsx:216`); the spec fixes every word, so a change
  belongs to both clients together.

Checked and found as the spec says: Home's order and its reads (H1–H4, S31); both title rows' circles,
height and top padding (F1–F3); the flow page's five titles for QuickBooks and None, nothing under
steps 3 and 4, no CONNECTIONS, no Move, no version sent (P1–P4); step 5's line, Unavailable and the
archived flow; the email screen's words, member view, duplicate and invalid checks, the limit, X and
Add each one PUT of the whole list, the failure line; the run page's setting step, step 4 by the
flow's choice, step 5 by `RunDetail.email` and the version gate gone; colours from the palette in
both themes; the X's 38-pt circle with an 8-pt reach.

**NOT OBSERVED**: the app on a simulator or a phone (nothing launched); a real v4 flow, run or email;
the Deployed contract check (it reads production).

### Guards proved to bite, the review of Build 22

| Guard | Broken by | What failed |
| --- | --- | --- |
| M11 · Flows at 320 pt: New its accent icon | Flows' `levels` 2 made 1 (`app/(tabs)/flows/index.tsx`) | `build22-screens` "a 320-pt phone (280 inside the margins)…" |
| M11 · Activity at 320 pt: the range its icon | the circle drawn only from level 9 (`app/(tabs)/activity/index.tsx`) | `build22-screens` "Activity on a 320-pt phone…" |
| M11 · the ladder's last form drawn whatever it measures | the last level capped at 1 (`components/title-row.tsx`) | `build22-views` "row 280, title 79, …" |
| S26 · Archived its icon alone when the row is too narrow (held again, by the ladder) | the room 100 pt looser (`components/title-row.tsx`) | `build22-screens` "Archived keeps its word where it fits…" |
| M11 · New's circle in its accent | the circle's ring always neutral (`components/scope-control.tsx`) | `build22-screens` "a 320-pt phone (280 inside the margins)…" |
| the email field seen over the keyboard | `automaticallyAdjustKeyboardInsets` removed (`app/(tabs)/flows/email.tsx`) | `build22-screens` "the field is seen when the keyboard opens…" |
| the email field said aloud | its `accessibilityLabel` removed (`app/(tabs)/flows/email.tsx`) | `build22-screens` "the field is seen when the keyboard opens…" |

(Each run by `b22-app-review-bites/bite.py` in the session's scratchpad, Node 22.23.2: red — a test
failed — the file restored sha256-equal, green — a test passed. The Build 22 table's S26 row named
`titleRowCompact`, which the ladder replaced; its guard is the fourth row here.)

### Round 23 — build 22's feedback (Round 17; 2026-10-19)

The owner's build 22 items (memory `build-22-feedback-2026-10-18`; the round's plan, its "S" the
session's): the title rows, one drop-down, Liquid Glass, the running step that spins, step 5 "Run
completed", email and push links that open the app, "Department", and a member's integration
read-only.

- **A1 title rows** (`components/title-row.tsx`): the title left, flexible space, then on the right
  the two scope circles and the page's controls. Flows: Archived its circle at every width (no pill
  form), New its accent pill or its circle at 320 pt (`levels={1}`); Activity: the circles, then All
  time or its circle. `titleRowLevel` keeps measuring the page's controls (`title-row-controls`).
- **A2 one drop-down** (`components/dropdown.tsx`, `placeDropdown`): measured on the press
  (`measureInWindow`), under its trigger 6 pt down or above when under 240 pt are left and more are
  above, on the trigger's nearer edge, 16-pt gutters, at least 232 wide, at most 380 tall then
  scrolling; a transparent Modal whose invisible backdrop ("Close") and Android's back close it unless
  `locked`; rows are presses (44 tall, the chosen one's check, `menuitem`). It replaces the time range's
  card, the four outcome chips (All runs · Success · Needs review · Failed, `ACTIVITY_FILTER_LABEL`; S4),
  Add a flow's category chips (All categories, then each; S5), Show (title Department, All departments
  then each, its load error in it) and the workspace switcher (controlled; title Workspace; Switching…
  and `locked`; Reload session at its foot when owed, "Working…" and disabled while it re-reads, as
  the dialog's button was). S3: the two cards' explanatory sentences are
  gone. `picker-dialog`, `select-field`, `choice-chips` and the confirm dialogs are unchanged.
- **A3 Liquid Glass** (`components/glass-surface.tsx`, `glassTint`; `expo-glass-effect` ~0.1.10, the
  SDK 54 pin): the system's glass on iOS 26 (`regular`, tinted, the palette's scheme, interactive on a
  button), a blur under the card at 55% in a hairline ring below it, the card at 92% on Android. On the
  tab bar — a capsule 16 pt in on the page colour, ~62 tall, the focused tab in an accent lens that
  springs to it (`LinearTransition`, the system's Reduce Motion) — the header circles (`CircleButton`,
  Home's bell, `BackCircle`; New's circle keeps its accent) and the drop-down panels. S1: the custom
  bar stays in the layout (native tabs are beta in SDK 54 and swap the icons for SF Symbols; an overlay
  re-pads ~20 screens). S2: the avatar badge is unchanged. **The re-pin of the tab bar's and the back
  circle's snapshots in both palettes (and the screen states, which draw the back circle) is
  authorised by the owner's build 22 items 5–6**; `GlassSurface` is pinned in both palettes and both
  iOS forms.
- **A4**: a working step's icon turns 360° every 900 ms (`run-step-spinner`), still under Reduce
  Motion (`hooks/use-reduced-motion.ts`: the router's test mock of Reanimated has no
  `useReducedMotion`).
- **A7 step 5** (`emailRow`): any title; waiting while pending, running or held; failed; stopped;
  done once succeeded — "Email sent · {time}", "Sending email…", "Done" — the website's words
  (`EMAIL_OWED`, `emailSentLine`). 5 / 5 only on success.
- **A5 links**: `app/+native-intent.tsx` sends `/runs/<id>` and `/approvals/<id>` (any query) to
  `/`, the splash, when the link starts the app, and nowhere (an empty path, which expo-router drops)
  when the app is already open — `/` from an open screen is the cover, above Sign in or the tabs
  (the review of round 23); `linkTargetOf` and the signed-in tree's link listener open the run's page or Approvals in the
  workspace the link names (the push tap's `switchFor` and owed-open; the link the app opened with,
  once). `app.config.js` adds Android's `/runs/` and `/approvals/` prefixes on the callback's host.
- **A8**: a `run-succeeded` tap opens the run's page. The generated contract is regenerated from the
  backend's openapi of this round; the Deployed-contract check is red by design until the release.
- **B1**: `audit:vocabulary` retires "team"; every word a person reads says department ("All
  departments", "Department: Legal", "in a department", "Your industry and department", "Create an
  organization workspace for your company."). Identifiers, routes and test ids stay.
- **B3**: `VendorChoice` `readOnly` — Connect integration for a member, and Set up for a member
  changing a flow already on (S: adding a flow stays any member's, ADR-0036, so a member's first
  choice on Set up is untouched); the line "Only an owner or admin can change the integration."; a
  403 in the platform's words. Settings › Connections was already read-only for a member
  (`app/(tabs)/settings/connections.tsx:87`, `canManage`).

**NOT OBSERVED**: the app on a simulator or a phone (nothing launched) — Liquid Glass itself, the
lens's spring and the drop-down's grow are seen only on a device; a real email or push link; the
Deployed contract check (it reads production).

### Guards proved to bite, round 23

| Guard | Broken by | What failed |
| --- | --- | --- |
| A3 · the system glass on iOS 26 | the availability check made false (`components/glass-surface.tsx`) | `round23` "iOS with Liquid Glass…" |
| A3 · Android keeps the opaque card | the blur branch taken on every platform | `round23` "Android: today's look…" |
| A3 · the lens under the focused tab, moving with it | its `left` pinned to the first tab (`components/nocturne/tab-bar.tsx`) | `tab-bar` "sits the lens under the focused tab…" |
| A2 · above a low trigger | the above branch removed (`components/dropdown.tsx`) | `round23` "…opens above it when it sits low…" |
| A2 · a tap outside closes | the backdrop's press a no-op | `round23` "a tap outside closes it…" |
| A2 · locked holds it open | `if (locked) return` removed | `round23` "…unless it is locked" |
| A2 · choosing closes | the close after `onChange` removed | `round23` "…choosing applies and closes" |
| A2 · category filters | its `onChange` a no-op (`app/(tabs)/flows/add.tsx`) | `tab-screens` "filters the catalog by category" |
| A2 · Department sets the scope | its `onChange` a no-op (`components/scope-control.tsx`) | `presses-home-activity` "the Department drop-down…" |
| A1 · the circles in the right group | the circles moved back beside the title (`components/title-row.tsx`) | `build22-screens` "Flows: the title first…" |
| A1 · Archived its circle at every width | Archived drawn as its pill (`app/(tabs)/flows/index.tsx`) | `build22-screens` "Archived is its circle at every width…" |
| A4 · only a working step turns | the spinner on every row but a skipped one (~~`app/(tabs)/(home)/run.tsx`~~ (`app/(tabs)/activity/run.tsx` since round 24)) | `invoice-processing-screens` "at the start…", "while running…" |
| A7 · held waits | Waiting only for pending/running (`lib/view/runs.ts`) | `build22-views` "held: … step 5 waits too…" |
| A7 · failed is Failed | the failed line removed | `build22-views` "a run failed…" |
| A5 · run/approval paths to the splash | `redirectSystemPath` returns the path (`app/+native-intent.tsx`) | `round23` the native-intent table |
| A5 · a link while the app is open keeps the open screen | `/` returned when not `initial` | `round23` "while the app is open…", `real-router/app-links` "a link that arrives on Sign in…" |
| A5 · a link opens, switched first | the link's open removed (`hooks/use-push-registration.tsx`) | `push-registration` the three link cases |
| A5 · the opening link once | the once-check removed | `push-registration` "…opens once signed in, and only once" |
| A5 · a link heard on Sign in opens once signed in | `useLinkHolder` not mounted (`app/_layout.tsx`) | `real-router/app-links` all four, "…and opens the run once signed in" among them |
| A5 · Android's path prefixes | `/runs/` removed (`app.config.js`) | `app-config` "derives both native link claims…" |
| A8 · a completed run's tap | `run-succeeded` dropped from `targetOf` | `push-registration` "a \"Run completed\" push…" |
| B1 · "team" is not copy | `teams?` out of `RETIRED` (`scripts/audit-vocabulary.mjs`) | `audit-gates` "the vocabulary audit: round 23" |
| B3 · a member's rows inert | `readOnly` ignored (`components/flows/vendor-choice.tsx`) | `vendor-page` "a member (round 23, B3)…" |
| B3 · Set up read-only for a member on a live flow | `readOnly={false}` (`app/(tabs)/flows/setup.tsx`) | `invoice-processing-screens` "a member on a live flow…" |
| B3 · a member adding a flow still chooses | `readOnly={!canManage}` | `invoice-processing-screens` "a member adding a flow…" |
| A4 · still under Reduce Motion | `if (reduceMotion) return` removed (~~`app/(tabs)/(home)/run.tsx`~~ (`app/(tabs)/activity/run.tsx` since round 24)) | `invoice-processing-screens` "…Reduce Motion true…" |
| A2 · only a fade under Reduce Motion | the scale kept under Reduce Motion (`components/dropdown.tsx`) | `round23` "opening it, Reduce Motion true…" |
| A2 · Reload session busy | its label kept, or `disabled` dropped (`components/settings/workspace-switcher.tsx`) | `workspace-switcher` "Reload session says \"Working…\"…" |
| B3 · a 403 in its words | the 403 check never true (`app/(tabs)/flows/vendor.tsx`) | `vendor-page` "a 403 from the platform…" |

(Each run by `app-bites/bite.py` in the round's scratchpad, Node 22.23.2: red — a test failed — the
file restored sha256-equal, green — a test passed. The locked guard's row is `round23`'s: the
switcher's own `close` also refuses while switching, so `workspace-switcher` stays green without it. The rows the review of round 23 added — the open-app link, Set up's two, Reduce Motion's two and Reload
session's — were run the same way by hand: broken, red, restored sha256-equal, green.)

### Round 24 — build 23's feedback (Round 17; 2026-10-20)

The owner's build 23 items F1–F16 (memory `build-23-feedback-2026-10-20`; the round's plan, its "S" the
session's): one drop-down standard, the tab lens, iOS text size, runs in Activity, Approve / Deny in
step 4, Needs review, Clear all and the notifications offer, one run id per job, each invoice a
drop-down, the status-bar strip, and the A8X run package.

- **The contract**: the generated types come from the backend's round 24 contract (`snoopy-backend`
  `3b5ac97`, amended `84ed9bc`; regenerated at `f122361`, whose package description says 25 MiB): the job's runs by its first run's id, `continuesRunId`,
  `continuationRunId` and the decision's `continuation` deprecated; `POST …/runs/{runId}/package`
  (a signed link); `POST …/notifications/clear`; `RunDetail.files`, `RunDocument.source`,
  `recordedIn.accountName`. CI's Deployed-contract job is red by design until the platform release.
- **P1 one drop-down standard** (F1, F13, F14): `GlassSurface` gains `backing` (`panel` the card
  colour, `page` the page colour) at `GLASS_BACKING_ALPHA` 0.94 (S3) under its children in all three
  forms; `Dropdown` passes `backing="panel"` to its one surface — the workspace and department
  drop-downs, Activity's two and Add a flow's category, fixed in one place. The website's switcher panel
  is already opaque (`bg-[var(--surface)]`): verified, no change.
- **P2 the tab lens** (F2, F3): `LinearTransition.springify()` (a spring that overshot and animated
  its first layout too) is gone; the lens's `translateX` is a shared value, set on the first layout
  and on a new row width, `withTiming` 240 ms `Easing.out(cubic)` on a focus change, set at once under
  Reduce Motion; hidden until first set, so it never shows at the row's start. `lensOffset(slot,
  rowWidth, count)` = the pad plus whole tab widths, the sum the tabs' `flex: 1` lays out.
- **P3 iOS text size** (F14): before, no `allowFontScaling`/`maxFontSizeMultiplier` anywhere, so text
  followed iOS's size without a limit and fixed heights clipped. Now `components/text.tsx` (`Text`,
  `TextInput`, React 19 has no `defaultProps` for a function component) defaults
  `maxFontSizeMultiplier` to `fontScaleLimit.content` 2; chrome 1.35 (S4) on the tab labels,
  `StatusPill` (one line), `PillButton`'s label, `ScopePill`'s label (one line), the Needs-review count
  and the title row's title (one line, a fixed bar beside its circles). A codemod moved 61 files'
  imports; `audit:type` fails `Text`/`TextInput` from react-native outside the wrapper. `minHeight` for
  the tab row 62, `PillButton`, the title row 38, `ScopePill` 34, the badge 26, the text and select
  fields 50, the OAuth button 48, Flows' search and the email input 44, Settings' segments and Add a
  flow's button 34. **The second authorised re-pin** (F14; the counts are README's re-pin fact) — props
  only. Phone size: the A4 captures on iPhone SE (3rd
  generation) and 17 Pro Max at the default and the largest size.
- **P5 runs live in Activity** (F4, F5): ~~`app/(tabs)/(home)/run.tsx`~~ → `app/(tabs)/activity/run.tsx`,
  ~~`app/(tabs)/settings/run.tsx`~~ deleted, `run` registered in Activity's stack only; every push names
  `/(tabs)/activity/run`. From another tab — Home's recent runs (`home`), the two inboxes (`home`,
  `settings`, the `Inbox` prop that replaced `runPath`), a flow's Run now (`flows`) — with `returnTo`
  (`RUN_ORIGIN_TAB`, `runOrigin`, `lib/view/runs.ts`) and `withAnchor` (Activity's layout
  `unstable_settings = { anchor: 'index' }`), as a notification's and a link's tap now are too. The
  run page's `beforeRemove` listener, on a `GO_BACK` or `POP` (never `POP_TO_TOP`), lets the pop go on
  (a swipe has already gone natively) and navigates the tab navigator to the origin, which keeps that
  tab's stack. S5: the swipe returns to the origin too. The website: `/account/runs/[runId]` already
  highlights Activity and its Back is `/account/runs` — verified, no change.
- **P6 Approve / Deny in step 4** (F7–F10): `hooks/use-approval-decision.ts` (the decision logic,
  extracted from Approvals: workspace bound, an intent key per approval and decision, busy, error) and
  `components/runs/decision-buttons.tsx` (the one pair on `PillButton`, Approve primary, Deny danger,
  "Approving…"/"Denying…"; pinned in both palettes) serve the run page's held step and the Needs-review
  card. The run page reads the role from the workspace collection (fail-open: none, no buttons), the
  approvals fail-open, the newest approval for the job (`jobApproval`, also P9's rule); saved →
  `refresh`. S6: Deny/Denied everywhere a person reads it (`HELD_DECISION_LINE`, step 4, the pills);
  the API value stays `rejected`. Website: its lane (`RunLive` step 4, `ApprovalDecision` Deny danger).
- **P7 Needs review** (F11): a decided card's pill turns Approved/Denied (`StatusPill` gains both
  tones), then the card leaves — `SlideOutLeft.duration(220)`, the rest `LinearTransition`, none under
  Reduce Motion — and the count counts down; the last one decided `dismissTo('/(tabs)/activity')`. The
  banner and the done notes went (`APPROVAL_DONE_TEXT` deleted). The callout icon's `marginTop` is
  `(lineHeight − 16) / 2`. Website: its lane.
- **P8 Clear all and the notifications offer** (F6): `clearInbox()` (`lib/platform/notifications.ts`,
  key prefix `notifications-clear`) behind the inbox header's **Clear all** (~~Mark all read~~): the
  rows on screen leave at the tap (the dismissed set), back with the reason if refused; S7 the platform
  clears past the 50 listed. `app/(auth)/notifications-offer.tsx`: guarded with the Face ID offer,
  `usePushAsk().turnOn`/`notNow`, then `nextAfterSignIn` (`lib/view/return-to.ts`; login asks for
  both offers, the Face ID offer for the second); `offersPushAsk()` (an iPhone, iOS not asked, no Not
  now). The Face ID offer's layout is extracted to `components/offer-screen.tsx` (`OfferScreen`), so
  both offers draw one layout — the reason for the new file; pinned in both palettes. The real-router
  project's default iOS answer is "no" so a sign-in test meets no offer unless it asks for one. Parity:
  the website has no inbox, nothing to match.
- **P9 one run id per job, the client half** (F12): `metaFor` drops "After approval ·", the approved
  line is "Approved" (~~"Approved — continued in a new run"~~), `stepStates` drops the continuation
  branch and counts a held step done once the job runs on (the job's steps are its runs' together,
  backend ADR-0044) — the fallback rows too; `jobApproval` (P6) picks the newest approval; the run
  page's `run-continues` link and `isContinuation` (unused) are gone. `runOriginLabel` keeps its
  words. The deprecated `continuesRunId`/`continuationRunId` stay in the generated types, unread.
- **P10 each invoice a closed drop-down** (F15): `DocumentCard` — a `Pressable` header (button,
  `expanded`, 44 pt) with "Invoice i of n" (`documentOf`), the chip (one line, chrome limit), a caret
  and `{vendor} · {total}` (S9); the body only when open (`FadeIn`, the card `LinearTransition`, none
  under Reduce Motion), starting with Document type and Format (`kind`); `formatFor(document, files)`
  and ~~`formatLabel(contentType)`~~ (deleted in the review below) in `lib/view/documents.ts`. Website: its lane (`<details>`).
- **P12 the A8X run package, the app half** (F16; the main session's correction 1 overrides S16): the run
  page's View package / Download PDF / Download Excel replace Download JSON (`readRunDocuments`,
  `DOWNLOAD_JSON_LABEL`, `documentsFileName`, `downloadJson` deleted; the endpoint stays). New:
  `createRunPackageFile` + `requestRunPackageFile` (`lib/platform/runs.ts`), `PlatformBusyError`
  (`lib/platform/problem.ts`, mapped in `client.ts` for a 503 with `retry-after`; ~~capped at 15 s~~, the website's rule since the review below),
  `hooks/use-run-package.tsx` (the one download path, for the run page and the package page — the
  reason for the new file), `app/(tabs)/activity/package.tsx` (the PDF in a WebView from the cache,
  `view-` prefixed so a header share never removes it; deleted on close). No `readRunPackage` and no
  package view model (correction 1). `react-native-webview` 13.15.0 (MIT) added by `npx expo install`;
  jest mocks it as a view (`test/jest-setup.js`). **Finding**: Android's WebView does not draw a PDF;
  the app ships to iOS, so the Android package page is NOT OBSERVED and left as it draws.
- **A4 the simulator visual audit — built, run, failed, taken out of this lane** (the main session's
  stop order): the lane's script (`6b62e60`, fixed in `aa3bbbc`; reverted here, kept in history) created
  three iOS 26.1 simulators (iPhone 17 Pro, SE 3rd generation, 17 Pro Max) and booted them at once,
  built the Debug app (`expo prebuild`, `pod install`, `xcodebuild`, `CODE_SIGNING_ALLOWED=NO`), and
  drove Maestro against a fixture Edge with a Metro-time swap of the session and appearance stores. Run
  1 reached Home (the session swap and the fixture Edge worked) but Maestro 2.11 refused the screenshot
  paths; SpringBoard crashed on one simulator (00:38). Run 2's build launched and died: dyld "Library not
  loaded: @rpath/ReactNativeDependencies.framework" (the Debug simulator build did not embed React
  Native's prebuilt dependencies framework). No screenshot was taken: every surface is **NOT
  OBSERVED** on a simulator. The main session runs the audit itself, on one simulator, headless, with a
  working build.
- **P11 the status-bar strip** (seen in fb09, fb10, fb15, fb16): `components/status-bar-strip.tsx`, a
  `GlassSurface radius={0} backing="page"` as tall as the top inset, absolute, `pointerEvents="none"`,
  rendered once after `<Tabs>` in `app/(tabs)/_layout.tsx` and once after the auth `Stack` (Sign in
  scrolls). Both new surfaces are pinned in both palettes and both iOS forms (`nocturne-visual`).

**Parity** (app/CLAUDE.md): the website's lane matches P6 (Approve / Deny in its run page's step 4,
Deny danger), P7 (a decided row leaves; none left → `/account/runs`), P9 (one id per job) and P10
(`<details>` "Invoice n of m"), and P12 (View package, Download PDF and Excel); P1 and P5 are verified
there with no change; the website has no inbox, so P8 has nothing to match. P2, P3 and P11 are the app's
own (its tab bar, its text sizes, its status bar).

### Guards proved to bite, round 24

| Guard | Broken by | What failed |
| --- | --- | --- |
| P1 · every drop-down on a 94% backing | `backing="panel"` removed (`components/dropdown.tsx`) | `dropdown-backing` all three forms |
| P11 · the strip over the tabs | `<StatusBarStrip />` removed (`app/(tabs)/_layout.tsx`) | `tab-layout` "draws the status-bar strip 59 tall…" |
| P2 · a timing, never a spring | `withTiming` swapped for `withSpring` (`components/nocturne/tab-bar.tsx`) | `tab-bar` "a new focus slides it with a 240-ms timing…" and the slide test |
| P2 · the first layout latches | the first set animated too | `tab-bar` "the first layout sets the lens…", "a new row width…" |
| P2 · Reduce Motion moves it at once | `!reduceMotion` removed | `tab-bar` "under Reduce Motion…" |
| P2 · centred under its tab | `lensOffset` without the pad | `tab-bar` the three `lensOffset` rows and the lens tests |
| P3 · the content limit by default | the default dropped (`components/text.tsx`) | `text` "Text follows the phone up to the content limit…" |
| P3 · the caller's limit wins | the default spread after the props | `text` "the caller's limit wins" |
| P3 · react-native's Text only in the wrapper | the import check not run (`scripts/audit-type.mjs`) | `audit-gates` "round 24 P3: Text or TextInput from react-native…" |
| P5 · Back returns to the origin tab | the tab navigator's `navigate` removed (`app/(tabs)/activity/run.tsx`) | `real-router/run-in-activity` Home's run, the bell's and Settings' |
| P5 · Activity's page under a run from elsewhere | `withAnchor` dropped (`components/notifications/inbox.tsx`) | `real-router/run-in-activity` "Settings › Notifications…" |
| P5 · Home's run says where it came from | `returnTo: 'home'` dropped (`app/(tabs)/(home)/index.tsx`) | `real-router/run-in-activity` Home's run, `tab-screens` "opens Run detail…" |
| P5 · re-tapping Activity stays | `POP_TO_TOP` returns to the origin too | `real-router/run-in-activity` "re-tapping Activity's tab…" |
| P6 · the pair inside step 4 | the held step drawn without it (`app/(tabs)/activity/run.tsx`) | `invoice-processing-screens` the three P6 cases with buttons |
| P6 · Deny is the danger pill | `variant="secondary"` (`components/runs/decision-buttons.tsx`) | `invoice-processing-screens` "…Deny the danger pill…", `tab-screens` "approves and denies…" |
| P6 · the page reads again once saved | `detail.refresh()` dropped | `invoice-processing-screens` "…then reads the run again" |
| P6 · the newest approval decides | the oldest kept (`jobApproval`, `lib/view/runs.ts`) | `invoice-processing-screens` "the newest pending approval…" |
| P6 · a role not named is told who decides | the role check skipped | `invoice-processing-screens` "a role the approval does not name…" |
| P7 · a decided card leaves | the removal never made (`app/(tabs)/activity/approvals.tsx`) | `presses-home-activity` P7 and decision cases, `tab-screens` approvals cases |
| P7 · the last one decided → Activity | `dismissTo` dropped | `presses-home-activity` "deciding the only card…", `tab-screens` "counts down…" |
| P7 · the pill follows the decision | the pill kept as listed | `presses-home-activity` "…never says Pending…", "a decided pill…" |
| P7 · the callout icon centred | `marginTop: 1` | `presses-home-activity` "the warning callout's icon…" |
| P8 · Clear all empties the inbox | `markInboxRead` sent in its place (`components/notifications/inbox.tsx`) | `presses-home-activity` the three Clear all cases |
| P8 · refused, the rows come back | the restore dropped | `presses-home-activity` "Clear all refused…" |
| P8 · the offer after the Face ID offer | `notifications: false` (`app/(auth)/faceid-offer.tsx`) | `faceid-offer` "then the notifications offer", `real-router/notifications-offer` "after the Face ID offer…" |
| P8 · only where iOS can still ask | `!== 'denied'` for `=== 'ask'` (`hooks/use-push-registration.tsx`) | `notifications-offer` "iOS allows already", `real-router/notifications-offer` "iOS already allows…" |
| P8 · Not now is kept | the offer's Not now a no-op (`app/(auth)/notifications-offer.tsx`) | `notifications-offer` "Not now is kept…", `real-router/notifications-offer` the first case |
| P8 · a sign-in routes to the offer | the notifications step dropped (`lib/view/return-to.ts`) | `notifications-offer` the `nextAfterSignIn` table, `real-router/notifications-offer` |
| P9 · no "After approval ·" | the prefix put back (`lib/view/runs.ts`) | `flows-view` "a row is a job…", `gate24-parity-activity` "a job held again…" |
| P9 · approved says "Approved" | the old line put back | `flows-view` "is pending, approved…", `tab-screens` "leaves a decided held run…" |
| P9 · a held step done once the job runs on | the held state kept | `build21-views` "an approved job…" (two), `invoice-processing-screens` "an approved job…" |
| P10 · "Invoice i of n" | `documentOf` says Document (`lib/content/screen-states.ts`) | `build21-views` headings, `invoice-processing-screens` the document cases |
| P10 · closed at first | `useState(true)` (`components/runs/document-card.tsx`) | `invoice-processing-screens` "each invoice is a closed drop-down…" |
| P10 · Format from the file its source names | the first file taken (`formatFor`) | `build21-views` "opens with Document type and Format…", `invoice-processing-screens` the drop-down case |
| P10 · `{vendor} · {total}` while closed | the type alone | `build21-views` "closed, a card says…", the drop-down case |
| P12 · View package opens the package page | pushed to the run page (`app/(tabs)/activity/run.tsx`) | `invoice-processing-screens` "the run package replaces Download JSON…" |
| P12 · Download PDF asks for the PDF | `xlsx` asked | `invoice-processing-screens` "run-download-pdf asks the platform…" |
| P12 · the WebView draws the cached file | the signed link drawn (`app/(tabs)/activity/package.tsx`) | `package-screen` "prepares, asks for the PDF…" |
| P12 · the cache is emptied on close | `forget()` dropped from the cleanup | `package-screen` "deletes the cached file…" |
| P12 · busy twice says so | the busy state never chosen | `package-screen` "busy after the wait…" |
| P12 · asked once more after a busy wait | the retry dropped (`lib/platform/runs.ts`) | `platform-request` "busy once…", `package-screen` "busy after the wait…" |
| P12 · a 503 with its wait is busy | the 503 mapping off (`lib/platform/client.ts`) | `platform-request` "a 503 that states its wait…", "busy once…" |

(Each run by the lane's bite script in the round's scratchpad, Node 22.23.2: broken, red — a test failed —
the file restored sha256-equal, green.)

### Round 24 — the review's ten findings (Round 17; 2026-10-20)

The app lane's one review pass (FAIL, ten findings). The website's branch of the round is the reference
for every rule the two clients share; the main session's decisions bind each fix.

- **Step 4's words** (finding 1): `trackerSub` says "Denied" for a denied approval and "Waiting for
  approval: {reason}" otherwise, as `web lib/run-progress.ts` does — ~~`HELD_DECISION_LINE`'s
  "Approved" and "No longer awaiting approval" on the held step~~ (the list's line keeps them); the
  fallback rows of a run of another version now get the decision too. Once the job runs on, the step
  is done (P9, unchanged).
- **Two approvals at one moment** (finding 6): `jobApproval`'s strict `>` — the first listed wins — is
  now held by a test.
- **The package's bound and format** (finding 2): `RUN_PACKAGE_MAXIMUM_BYTES` (25 MiB, 26,214,400
  bytes — the platform's bound, the website's constant) and the format asked for, checked by
  `requestRunPackageFile` before anything is saved (`RunPackageFileRefusedError`): View package then
  says "Could not open the package. Try again." (the website's route's words for that case), each
  download "Could not download. Try again.".
- **The busy retry** (finding 3): `packageRetryWaitMs` ported rule for rule — any 503 is asked once
  more, after its `retry-after` up to 10 s or 2 s when it names none; a longer wait is said at once
  (~~only a 503 with `retry-after`, capped at 15 s~~). The package page says "Could not open the
  package. Try again." for any 503 left (`packageNotOpened`; `PACKAGE_BUSY` renamed
  `PACKAGE_NOT_OPENED`); the website's route now says the same words.
- **One way to hand on a signed file** (finding 8): `lib/platform/signed-file.ts`, beside the
  download it calls — `signedLink` (https only; ~~`usableLink`~~ and Data's own check folded in) and
  `shareSignedFile` (iOS saves, shares, removes; Android opens) — used by `hooks/use-run-package.tsx`
  and `app/(tabs)/settings/data.tsx`. A non-https export link now says "The link to the file cannot be
  used." (~~"The export answered an unusable address."~~).
- **Out-of-date words** (finding 9, in part): `invoice-processing-screens`' header strikes Download
  JSON.
- **The invoice card's three rules** (finding 4), now the website's (`snoopy/lib/run-documents.ts`): Format is
  the platform's `RunFile.format` word shown as given (`formatLabel`, the app's content-type mapping,
  deleted — it said JPEG and HEIC where the platform says JPG and HEIF); a `source.file` not among
  the job's files falls back to the job's only file; with no seller the closed line is the total alone,
  with neither no line (`summary` may be null; `DocumentCard` then draws the heading alone).
- **Tests the review found missing** (findings 5 and 7): Clear all pressed again after a refusal sends
  a new key (`notifications-clear-1`, then `-2`); the sign-in stack's strip is held by a
  `tab-layout` case (59 tall, last, the page-colour backing; the router mock gains
  `Stack.Protected`).
- **Out-of-date words** (finding 9): a `presses-home-activity` title says Activity's stack (~~the
  Home stack~~); DESIGN-CONTRACT's Notifications row strikes Mark all read's sentence and gains its
  missing full stop.

### Guards proved to bite, the review's findings

(Run as the round's table above: broken, red, restored sha256-equal, green.)

| Guard | Broken by | What failed |
| --- | --- | --- |
| Step 4 says only "Denied" or why it waits | the old `HELD_DECISION_LINE` line put back (`lib/view/runs.ts`) | `build21-views` step 4 approved, expired |
| The fallback rows say "Denied" | the decision not passed to `reportedRows` | `build21-views` "the fallback rows…" |
| The first listed of two at one moment | `>=` for `>` in `jobApproval` | `build21-views` "of two approvals asked at the same moment…" |
| A package file within 25 MiB | the size check dropped (`lib/platform/runs.ts`) | `platform-request` "refuses a file over 25 MiB…", `package-screen` 26,214,401 bytes and the two download cases, `invoice-processing-screens` "Download Excel answered…" |
| The format asked for | the format check dropped | `platform-request`, `package-screen` "not a PDF" and the three download cases, `invoice-processing-screens` |
| A refused file says the website's words | `packageNotOpened` without the refusal | `package-screen` the two refused-file cases |
| 2 s when no wait is named | no retry without `retry-after` | `platform-request` the table and "a 503 naming no wait…" |
| No retry past 10 s | a 15 s cap | `platform-request` the table and "…one of 11 s is not" |
| Any 503 is asked again | only `PlatformBusyError` retried | `platform-request` "a 503 naming no wait…" |
| Any 503 left says so on the page | only `PlatformBusyError` mapped | `package-screen` "busy, then a 503 naming no wait…" |
| https only | the check skipped (`lib/platform/signed-file.ts`) | `signed-file` both platforms and `signedLink` |
| Removed once shared | the delete dropped | `signed-file`, `data-support-screens`, `package-screen`, `invoice-processing-screens` |
| Android opens the link | iOS's path on Android | `signed-file` "on Android…", `data-support-screens` "on Android…" |
| Data's export takes the helper | the call replaced (`app/(tabs)/settings/data.tsx`) | `data-support-screens` the three download cases |
| The package's downloads take the helper | the call replaced (`hooks/use-run-package.tsx`) | `package-screen`, `invoice-processing-screens` the download cases |
| Format falls back to the only file | the fallback kept for a document with no source only (`lib/view/documents.ts`) | `build21-views` "opens with Document type and Format…" |
| Format is the platform's word | the content type's subtype shown in its place | `build21-views` "Format is the platform's word as given…" |
| No seller: the total alone | the type put back before the total | `build21-views` "closed, a card says…", `invoice-processing-screens` "a closed invoice with no seller…" and "three receipts…" |
| Neither: no closed line | the summary line always drawn (`components/runs/document-card.tsx`) | `invoice-processing-screens` "a closed invoice with no seller…" |
| Clear all: a new key per press | a fixed `'notifications-clear-1'` (`components/notifications/inbox.tsx`) | `presses-home-activity` "Clear all pressed again after a refusal…" |
| The strip over the sign-in stack | `<StatusBarStrip />` removed (`app/(auth)/_layout.tsx`) | `tab-layout` "the sign-in stack's layout…" |
