# Design gaps and behavior plan — Autom8x iOS App

This is the current design backlog for the prototype. It records behavior that
is visible in the UI but is missing, incomplete, or only represented by local
fixture state. It does not claim that backend, authentication, billing, or
provider integrations exist yet.

The audit is based on the current source and tests in this repository. Evidence
is listed for every open item so design decisions can be made before the
behavior is implemented.

Last audited against commit `41b2bc7` (design v4 sync). Gates at that commit:
109 tests passing across 11 suites, `tsc --noEmit` clean, ESLint clean.

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

## Open gaps

### P0 — define the state and entity contract before wiring behavior

1. **Authentication and session states**

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

2. **Loading, empty, and error coverage outside Home**

   Home is the only screen with loading, empty, and error states. Filtered-empty
   states exist on Flows, Activity, and Solutions. **Workflow detail, run
   detail, approvals, setup, configure, notifications, and Settings have no
   loading and no failure state at all.**

   Design states needed: initial loading, failed load, offline/retry, and failed
   action per screen. Each state should identify its retry or next action.

3. **Entity identity — remaining cases**

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

4. **Prototype persistence boundary**

   Theme mode, active solutions, workflow status, approval decisions, setup
   toggles, and settings toggles are React state only. A repository-wide search
   finds **zero** storage references; every change is lost on relaunch:
   `hooks/use-theme.tsx:27`, `hooks/use-solutions.tsx:21`,
   `hooks/use-workflows.tsx:16`, `app/(tabs)/activity/approvals.tsx:70`.

   Design decision needed: which changes should survive navigation, app restart,
   sign-out, and account/workspace changes. Implementation can then replace the
   chosen local boundary with real services.

### P1 — core workflow creation and operation

5. **Builder editing model — the largest remaining gap**

   The builder renders fixture steps, palette chips, plus connectors, drag
   handles, Save, and Test run. The file contains **zero `onPress` handlers**:
   `app/(tabs)/flows/builder.tsx` (197 lines, controls at :46, :53, :90, :112).

   Design decisions needed: add-step sheet or inline insertion, step editing and
   deletion, reorder interaction, branch representation, unsaved-change state,
   save feedback, validation, and the Test run result/loading/error states.

6. **Solution activation and removal consequences**

   Removal has a confirmation dialog, but it only toggles the solution in the
   shared local map — no dependent-workflow pausing and no billing confirmation
   (`app/(tabs)/solutions/index.tsx:147`). Activation toggles the solution after
   a local "Connect" press and routes to a generic workflow detail
   (`app/(tabs)/solutions/setup.tsx:39-43`).

   Design states needed: activation confirmation, price/proration/next-invoice
   treatment, connection failure, entitlement pending/success/failure,
   dependent-workflow consequences, and removal success/failure.

7. **Notification depth**

   The inbox exists, but "Mark all read" is local-only, there is no unread badge
   contract with the Home bell, no notification detail, and no empty state. Both
   priming buttons dismiss the card without requesting iOS permission
   (`app/(tabs)/(home)/notifications.tsx:90,98`) — `expo-notifications` is not
   installed, so no permission can be requested yet.

   Design states needed: notification empty state, read/unread persistence,
   notification preferences, the iOS permission-priming outcome (granted and
   denied), and the Home bell's badge rule.

### P2 — account, workspace, and billing destinations

8. **Account and security destinations**

   The profile card has no handler (`app/(tabs)/settings.tsx:95`). Face ID, Stay
   signed in, and sign-out are local prototype controls; Face ID unlock attempts
   local authentication but always navigates Home after its timer
   (`app/(auth)/faceid.tsx:52-79`).

   Design states needed: profile editing, passkey add/remove, biometric
   success/failure/cancel/unavailable, signed-in-device state, and sign-out
   confirmation.

9. **Connections, workspace, and billing destinations**

   **Six rows use empty handlers** — Passkeys, connections, Payment method,
   Invoices, Acme Operations, and Members: `app/(tabs)/settings.tsx:121, 143,
   188, 195, 208, 215`. Only Manage solutions, Appearance, and Sign out have
   real destinations.

   Design states needed: connection detail/reconnect/disconnect/error, workspace
   detail, member list/invite/remove, payment method management, invoice detail,
   and billing error states.

### P3 — platform and quality decisions

10. **Responsive and accessibility behavior**

    The design is measured on a 402×874 canvas. `app.json:12` still declares
    `supportsTablet: true` with no iPad layout, and there are no documented
    375pt/SE or large-text layouts. Accessible names exist in only **five
    files** — `app/(tabs)/(home)/index.tsx`, `components/nocturne/tab-bar.tsx`,
    `back-circle.tsx`, `noc-toggle.tsx`, `text-field.tsx`; every other control
    relies on its visible text alone.

    Design decisions needed: Dynamic Type policy, small-width layout rules, iPad
    layout policy (or dropping tablet support), accessible names/roles for every
    control, and minimum touch-target behavior.

11. **Reduced-motion and light-mode coverage**

    Splash, Face ID, onboarding, and skeleton screens run Reanimated loops with
    **zero** `AccessibilityInfo` / reduce-motion references anywhere in the
    source: `app/index.tsx:57,68`, `app/(auth)/faceid.tsx:86-87`,
    `components/nocturne/skeleton.tsx:33`. Light and Auto modes are covered by
    token-level tests only; there is no screen-by-screen visual approval.

    Design decisions needed: static alternatives under Reduce Motion and visual
    approval of every screen in Light and Auto modes.

## Work that needs no further design

These are implementation decisions rather than design questions and can proceed
independently of the backlog above:

- Respect Reduce Motion in the four animated surfaces (item 11).
- Add accessible names and roles to the remaining controls (item 10).
- Choose and wire a persistence boundary for the three providers (item 4).
- Set `supportsTablet: false` unless an iPad layout is planned (item 10).

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
