# Design gaps and behavior plan — Autom8x iOS App

This is the current design backlog for the prototype. It records behavior that
is visible in the UI but is missing, incomplete, or only represented by local
fixture state. It does not claim that backend, authentication, billing, or
provider integrations exist yet.

The audit is based on the current source and tests in this repository. Evidence
is listed for every open item so design decisions can be made before the
behavior is implemented.

Last audited against commit `c80c61d` (design source parity and auth/connection
contract audit). Gates at this audit: 109 tests passing across 11 suites,
`tsc --noEmit` clean, and ESLint clean. The Face ID test still emits the
existing asynchronous `act()` warning.

## Contract documents

- [`DESIGN-CONTRACT.md`](DESIGN-CONTRACT.md) is the canonical draft for login,
  session, and workspace-connection behavior.
- `design-source/autom8x-ios-app-design/` is the imported visual source and is
  not the location for application or integration contracts.
- This document remains the backlog and ownership record; it links to the
  contract rather than duplicating it.

## Current prototype boundary

- Expo Router provides the splash, auth stack, five-tab shell, and nested
  detail stacks: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`.
- Screen content is fixture-driven. The canonical data is in `lib/fixtures.ts`;
  there are no API, database, auth-session, storage, OAuth, billing, or
  push-notification modules in the dependency or source tree.
- Theme mode, active solutions, workflow status, approvals, form values, setup
  values, and toggles are held in React state. The providers are
  `hooks/use-theme.tsx:27`, `hooks/use-solutions.tsx:21`, and
  `hooks/use-workflows.tsx:16`.
- Designed data states that have no data source yet are reachable through
  explicit demo query params: Home `?state=loading|empty|error`
  (`app/(tabs)/(home)/index.tsx:158-160`), Login `?state=error`, run detail
  `?variant=held|success|failed`, workflow detail `?flow=invoice|email|kpi|lead`,
  solution setup `?index=N`.

## Resolved items removed from the open backlog

These were open in earlier versions of this document and are now implemented in
the prototype and covered by tests.

- Activity status filters, held-run filtering, and empty date-section handling:
  `app/(tabs)/activity/index.tsx:98`.
- Solutions category filters and no-match rendering:
  `app/(tabs)/solutions/index.tsx:108`.
- Home loading, first-run empty, and connection-error screens:
  `app/(tabs)/(home)/index.tsx:158-160`.
- Held, successful, failed, and retried run-detail fixtures: `lib/fixtures.ts`.
- QuickBooks-gated solution setup wizard: `app/(tabs)/solutions/setup.tsx:39-43`.
- Solution-removal confirmation dialog and plan-total update:
  `app/(tabs)/solutions/index.tsx:147`.
- **Workflow identity and per-workflow content** — detail is parameterized by
  `?flow=`, with per-workflow connections, steps, and run counts:
  `app/(tabs)/flows/detail.tsx`, `lib/fixtures.ts` (`flowDefs`).
- **Workflow status transitions** — Pause / Resume / Publish, shared between the
  list and detail: `hooks/use-workflows.tsx`, `app/(tabs)/flows/detail.tsx`.
- **Workflow search** with a no-match state: `app/(tabs)/flows/index.tsx:107`.
- **Template category filters** and filtered-empty state:
  `app/(tabs)/flows/templates.tsx`.
- **Template-to-builder handoff** — the "New from template" configure screen:
  `app/(tabs)/flows/configure.tsx`.
- **Run retry** — idle → retrying → retried run: `app/(tabs)/(home)/run.tsx`.
- **Approval pending count and all-decided banner**:
  `app/(tabs)/activity/approvals.tsx`.
- **Notifications inbox** and push-priming card, reached from the Home bell:
  `app/(tabs)/(home)/notifications.tsx`.
- **Password reset** flow, reached from Login's Forgot? link: `app/(auth)/reset.tsx`.

## Ownership routing — who takes each item

Every open item is routed to one of two places. "Claude Design" means the item
is blocked until the design defines it. "Engineering" means the decision is
already made and only implementation remains — this is the tech-debt column.
"New surfaces" counts screens or sheets that do not exist in the design today;
items with 0 are new *states* on screens that already exist.

| # | Item | Owner | New surfaces |
| --- | --- | --- | --- |
| 1 | Authentication and session states | Claude Design | 0 |
| 2 | Loading/empty/error outside Home | Claude Design | 0 |
| 3 | Entity identity — remaining cases | Claude Design + Engineering | 0 |
| 4 | Prototype persistence boundary | **Engineering** | 0 |
| 5 | Builder editing model | Claude Design | ~3 |
| 6 | Solution activation and removal consequences | Claude Design | 0 |
| 7 | Notification depth | Claude Design | 1 |
| 8 | Account and security destinations | Claude Design | ~2 |
| 9 | Connections, workspace, billing destinations | Claude Design | ~5 |
| 10 | Responsive and accessibility behavior | Claude Design + Engineering | 0 |
| 11 | Reduced-motion and light-mode coverage | Claude Design + Engineering | 0 |

Roughly **11 new surfaces** total, concentrated in Builder (5) and the account
and billing destinations (8, 9). Everything else is states, dialogs, and
variants on existing screens.

Notes on the three split items:

- **Item 3** — the plumbing (passing a template or solution id through a route)
  is engineering. The content is design: the wizard was only ever drawn for
  Invoice triage, so there is nothing to render for the other five solutions.
  Defining one data-driven pattern unblocks all twelve screens without drawing
  them individually, which is how `flowDefs` already serves four workflows from
  one detail screen.
- **Item 10** — accessible names and `supportsTablet` are engineering; the
  Dynamic Type and iPad layout policies are design decisions.
- **Item 11** — the Reduce Motion implementation is engineering once the design
  confirms "static alternative" means holding the end state; the light/Auto
  visual review is design.

## Engineering tech debt — no design input needed

These four can proceed immediately and in parallel with any design work. They
are listed again in item form below with their evidence.

1. **Persistence boundary** (item 4) — pick what survives relaunch and wire the
   three providers to storage. Zero storage references exist today.
2. **Accessibility names and roles** (item 10) — only five files declare them.
3. **Reduce Motion** (item 11) — zero `AccessibilityInfo` references; four
   animated surfaces loop unconditionally.
4. **`supportsTablet: false`** (item 10) — one line in `app.json:12`, unless an
   iPad layout is planned.

## Open gaps

### P0 — define the state and entity contract before wiring behavior

1. **Authentication and session states** — _owner: Claude Design_

   Contract: [`DESIGN-CONTRACT.md#login-contract`](DESIGN-CONTRACT.md#login-contract).

   Login routes directly to Home without validation or a session
   (`app/(auth)/login.tsx:94`); Signup routes to onboarding regardless of field
   contents (`app/(auth)/signup.tsx:75`). The error callout is only reachable
   through the manual `?state=error` param. All four OAuth buttons render
   without handlers (`app/(auth)/login.tsx:110-112`), and a repository-wide
   search finds **zero** references to validation or credential storage.
   Password reset now exists but is presentation-only.

   Design states needed: field validation, failed login, provider-auth
   loading/success/failure, account creation failure, and the
   authenticated/unauthenticated route boundary. Every tab route is currently
   reachable without signing in.

2. **Loading, empty, and error coverage outside Home** — ✅ **DELIVERED**
   2026-08-17, in two passes — _owner was: Claude Design_

   The design generalised rather than drawing twelve bespoke sets: `gLoad`,
   `gErr` and `gOff` derive for every app screen except Home, with a
   `gLoadTiles` skeleton for run and workflow detail. The `variant` enum gained
   `offline` and `actionfail`; `run` gained `running`, `pending` and
   `cancelled`. A second pass added the first-run empties this repo found
   missing (`fFirstEmpty`, `actFirstEmpty` — the old copy assumed a search
   query), sign-out failure (`soFail`), and the remaining action failures
   (`dActFail`, `solFail`, `runFail`). 42 → 58 state ids, no token and no
   component added.

   **The intent question is ratified:** `gErr`/`gOff` are *load* states. A
   failed action on data that already loaded is **always inline** — a callout
   naming what did not happen, with the data left on screen.

   Implemented in `components/screen-state.tsx` and `hooks/use-resource.tsx`;
   the status vocabulary in `lib/view/status.ts`. Screens still on fixtures are
   waiting on published contract shapes, not on design — see
   `scripts/audit-fixtures.mjs`, where each remaining file names its blocker.

   _Original finding, kept for the record:_

   Home is the only screen with loading, empty, and error states. Filtered-empty
   states exist on Flows, Activity, and Solutions. **Workflow detail, run
   detail, approvals, setup, configure, notifications, and Settings have no
   loading and no failure state at all.**

   Design states needed: initial loading, failed load, offline/retry, and failed
   action per screen. Each state should identify its retry or next action.

3. **Entity identity — remaining cases** — _owner: Claude Design + Engineering_

   Workflow identity is resolved. Three navigations still target hardcoded
   destinations regardless of the entity acted on:
   - Solution setup always routes to the same workflow detail
     (`app/(tabs)/solutions/setup.tsx:42`), and its connection/source/rules
     content is QuickBooks/Gmail-specific for every solution.
   - Templates always open the same configure screen, which is hardcoded to
     Invoice capture (`app/(tabs)/flows/templates.tsx:47`,
     `app/(tabs)/flows/configure.tsx`).
   - Run detail's "View workflow" always opens the default workflow
     (`app/(tabs)/(home)/run.tsx:153`).

   Design states needed: per-solution setup content, per-template configure
   content, and the run → parent-workflow relationship.

4. **Prototype persistence boundary** — _owner: Engineering_

   Theme mode, active solutions, workflow status, approval decisions, setup
   toggles, and settings toggles are React state only. A repository-wide search
   finds **zero** storage references; every change is lost on relaunch:
   `hooks/use-theme.tsx:27`, `hooks/use-solutions.tsx:21`,
   `hooks/use-workflows.tsx:16`, `app/(tabs)/activity/approvals.tsx:70`.

   Design decision needed: which changes should survive navigation, app restart,
   sign-out, and account/workspace changes. Implementation can then replace the
   chosen local boundary with real services.

### P1 — core workflow creation and operation

5. **Builder editing model — the largest remaining gap** — _owner: Claude Design_

   The builder renders fixture steps, palette chips, plus connectors, drag
   handles, Save, and Test run. The file contains **zero `onPress` handlers**:
   `app/(tabs)/flows/builder.tsx` (197 lines, controls at :46, :53, :90, :112).

   Design decisions needed: add-step sheet or inline insertion, step editing and
   deletion, reorder interaction, branch representation, unsaved-change state,
   save feedback, validation, and the Test run result/loading/error states.

6. **Solution activation and removal consequences** — _owner: Claude Design_

   Removal has a confirmation dialog, but it only toggles the solution in the
   shared local map — no dependent-workflow pausing and no billing confirmation
   (`app/(tabs)/solutions/index.tsx:147`). Activation toggles the solution after
   a local "Connect" press and routes to a generic workflow detail
   (`app/(tabs)/solutions/setup.tsx:39-43`).

   Design states needed: activation confirmation, price/proration/next-invoice
   treatment, connection failure, entitlement pending/success/failure,
   dependent-workflow consequences, and removal success/failure.

7. **Notification depth** — _owner: Claude Design_

   The inbox exists, but "Mark all read" is local-only, there is no unread badge
   contract with the Home bell, no notification detail, and no empty state. Both
   priming buttons dismiss the card without requesting iOS permission
   (`app/(tabs)/(home)/notifications.tsx:90,98`) — `expo-notifications` is not
   installed, so no permission can be requested yet.

   Design states needed: notification empty state, read/unread persistence,
   notification preferences, the iOS permission-priming outcome (granted and
   denied), and the Home bell's badge rule.

### P2 — account, workspace, and billing destinations

8. **Account and security destinations** — _owner: Claude Design_

   The profile card has no handler (`app/(tabs)/settings.tsx:95`). Face ID, Stay
   signed in, and sign-out are local prototype controls; Face ID unlock attempts
   local authentication but always navigates Home after its timer
   (`app/(auth)/faceid.tsx:52-79`).

   Design states needed: profile editing, passkey add/remove, biometric
   success/failure/cancel/unavailable, signed-in-device state, and sign-out
   confirmation.

9. **Connections, workspace, and billing destinations** — _owner: Claude Design_

   Contract: [`DESIGN-CONTRACT.md#workspace-connection-contract`](DESIGN-CONTRACT.md#workspace-connection-contract).

   **Six rows use empty handlers** — Passkeys, connections, Payment method,
   Invoices, Acme Operations, and Members: `app/(tabs)/settings.tsx:121, 143,
   188, 195, 208, 215`. Only Manage solutions, Appearance, and Sign out have
   real destinations.

   Design states needed: connection detail/reconnect/disconnect/error, workspace
   detail, member list/invite/remove, payment method management, invoice detail,
   and billing error states.

### P3 — platform and quality decisions

10. **Responsive and accessibility behavior** — _owner: Claude Design + Engineering_

    The design is measured on a 402×874 canvas. `app.json:12` still declares
    `supportsTablet: true` with no iPad layout, and there are no documented
    375pt/SE or large-text layouts. Accessible names exist in only **five
    files** — `app/(tabs)/(home)/index.tsx`, `components/nocturne/tab-bar.tsx`,
    `back-circle.tsx`, `noc-toggle.tsx`, `text-field.tsx`; every other control
    relies on its visible text alone.

    Design decisions needed: Dynamic Type policy, small-width layout rules, iPad
    layout policy (or dropping tablet support), accessible names/roles for every
    control, and minimum touch-target behavior.

11. **Reduced-motion and light-mode coverage** — _owner: Claude Design + Engineering_

    Splash, Face ID, onboarding, and skeleton screens run Reanimated loops with
    **zero** `AccessibilityInfo` / reduce-motion references anywhere in the
    source: `app/index.tsx:57,68`, `app/(auth)/faceid.tsx:86-87`,
    `components/nocturne/skeleton.tsx:33`. Light and Auto modes are covered by
    token-level tests only; there is no screen-by-screen visual approval.

    Design decisions needed: static alternatives under Reduce Motion and visual
    approval of every screen in Light and Auto modes.

## Proposed implementation order

This ordering follows observed dependencies in the current code. It is a work
plan, not a claim that any backend behavior already exists.

### Phase 1 — make workflow creation coherent

- Define Builder add/edit/delete/reorder/branch behavior (item 5).
- Add unsaved, saved, validation, test-run, and failure states.
- Carry template and solution identity into configure and setup (item 3).

### Phase 2 — make operational actions coherent

- Define solution activation/removal confirmation and dependent workflow
  states (item 6).
- Complete notification depth: empty state, read state, permission outcomes,
  and the bell badge rule (item 7).
- Add loading and failure states to the screens that lack them (item 2).

### Phase 3 — complete auth and account surfaces

- Design form validation and auth/provider error states (item 1).
- Design the session boundary, Face ID outcomes, and sign-out confirmation.
- Design profile, passkeys, connections, workspace, payment, and invoice
  destinations (items 8, 9).

### Phase 4 — validate platform behavior

- Review 402pt, 375pt/SE, and iPad layouts (item 10).
- Review Dynamic Type and accessibility semantics/touch targets (item 10).
- Review reduced-motion alternatives (item 11).
- Review every screen in Light and Auto modes (item 11).

## Completion criteria for the design phase

The design backlog is ready for implementation when every open item has:

- a named screen or route;
- an explicit initial, loading, success, empty, and failure state where the
  action can fail;
- a defined transition and destination;
- a defined local prototype state or reset rule; and
- a testable acceptance statement.
