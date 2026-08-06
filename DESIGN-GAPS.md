# Design gaps and behavior plan — Autom8x iOS App

This is the current design backlog for the prototype. It records behavior that
is visible in the UI but is missing, incomplete, or only represented by local
fixture state. It does not claim that backend, authentication, billing, or
provider integrations exist yet.

The audit is based on the current source and tests in this repository. Evidence
is listed for every open item so design decisions can be made before the
behavior is implemented.

## Current prototype boundary

- Expo Router provides the splash, auth stack, five-tab shell, and nested detail
  stacks: `app/_layout.tsx:59-92`, `app/(tabs)/_layout.tsx:6-16`.
- Screen content is fixture-driven. The canonical data is in
  `lib/fixtures.ts:1-292`; there are no API, database, auth-session, storage,
  OAuth, billing, or push-notification modules in the dependency or source
  tree.
- Theme mode, active solutions, approvals, form values, setup values, and
  toggles are held in React state. The theme and solution providers are
  `hooks/use-theme.tsx:25-35` and `hooks/use-solutions.tsx:20-40`.
- The current tests verify the implemented prototype behavior, including
  filters, setup gating, Home states, run variants, and solution removal:
  `__tests__/tab-screens.test.tsx:19-410`.

## Resolved items removed from the open backlog

These were present in the previous version of this document but are now
implemented in the prototype and covered by tests.

- Activity status filters and empty date-section handling:
  `app/(tabs)/activity/index.tsx:56-104` and
  `__tests__/tab-screens.test.tsx:205-241`.
- Solutions category filters and no-match rendering:
  `app/(tabs)/solutions/index.tsx:20-114`.
- Home loading, first-run empty, and connection-error screens:
  `app/(tabs)/(home)/index.tsx:23-160` and
  `__tests__/tab-screens.test.tsx:348-380`.
- Held, successful, and failed run-detail fixtures:
  `lib/fixtures.ts:197-268` and
  `__tests__/tab-screens.test.tsx:323-345`.
- QuickBooks-gated solution setup wizard:
  `app/(tabs)/solutions/setup.tsx:30-43` and
  `__tests__/tab-screens.test.tsx:384-410`.
- Solution-removal confirmation dialog and plan-total update:
  `app/(tabs)/solutions/index.tsx:117-160` and
  `__tests__/tab-screens.test.tsx:77-120`.

## Open gaps

### P0 — define the state and entity contract before wiring behavior

These decisions affect several screens and should be settled first.

1. **Authentication and session states**

   The Login button routes directly to Home without validation or a session;
   Signup routes to onboarding regardless of field contents. The error callout
   is only reachable through the manual `?state=error` query parameter, and the
   Forgot? label plus all OAuth buttons have no handlers:
   `app/(auth)/login.tsx:80-107`, `app/(auth)/signup.tsx:75-83`.

   Design states needed: field validation, failed login, password reset,
   provider-auth loading/success/failure, account creation failure, and the
   authenticated/unauthenticated route boundary.

2. **Loading, empty, and error coverage outside Home**

   Home has explicit demo states, but Flows, Activity, Approvals, Solutions,
   Settings, workflow detail, run detail, and setup render fixture content
   directly. Approvals has no post-decision empty state. The existing error
   handling is limited to Home and the manually selected Login callout:
   `app/(tabs)/(home)/index.tsx:149-160`,
   `app/(tabs)/activity/approvals.tsx:66-95`,
   `app/(auth)/login.tsx:27-60`.

   Design states needed: initial loading, first-run empty, filtered empty where
   applicable, failed load, offline/retry, and failed action. Each state should
   identify its retry or next action.

3. **Entity identity and state propagation**

   Every workflow card routes to the same unparameterized detail screen, whose
   content is hardcoded to Invoice triage / Live. Run detail already accepts a
   variant, but workflow identity does not. Solution setup accepts an index yet
   still renders hardcoded QuickBooks/Gmail setup content and always routes to
   the same workflow detail:
   `app/(tabs)/flows/index.tsx:66-79`,
   `app/(tabs)/flows/detail.tsx:31-42`,
   `app/(tabs)/solutions/setup.tsx:31-43,63-175`.

   Design states needed: the selected workflow/solution identity, Live/Paused/
   Draft detail variants, solution-specific setup content, and the destination
   after activation.

4. **Prototype persistence boundary**

   Theme mode, active solutions, approval decisions, setup toggles, and settings
   toggles are React state only. There is no persistence or session store:
   `hooks/use-theme.tsx:25-35`, `hooks/use-solutions.tsx:20-40`,
   `app/(tabs)/activity/approvals.tsx:69-70`,
   `app/(tabs)/settings.tsx:81-83`.

   Design decision needed: which changes should survive navigation, app restart,
   sign-out, and account/workspace changes in the design prototype. The later
   implementation can replace the chosen local boundary with real services.

### P1 — core workflow creation and operation

5. **Builder editing model**

   The builder renders fixture steps, palette chips, plus connectors, drag
   handles, Save, and Test run, but none of those controls has behavior:
   `app/(tabs)/flows/builder.tsx:44-128`.

   Design decisions needed: add-step sheet or inline insertion, step editing and
   deletion, reorder interaction, branch representation, unsaved-change state,
   save feedback, validation, and the Test run result/loading/error states.

6. **Workflow search and template filtering**

   Flows shows a non-editable “Search workflows” text block. Templates renders
   category chips with a permanently active All state and no filter state; every
   template opens the generic Builder:
   `app/(tabs)/flows/index.tsx:54-64`,
   `app/(tabs)/flows/templates.tsx:33-42`.

   Design states needed: focused/typing search, filtered results, no results,
   active template category, filtered template results, and filtered empty.

7. **Template-to-builder handoff**

   The current Use → action navigates directly to Builder without carrying the
   selected template or showing a configuration step:
   `app/(tabs)/flows/templates.tsx:38-42`.

   Design decisions needed: workflow naming, template preview, required
   connections/fields, confirmation, and which steps are preloaded in Builder.

8. **Workflow pause and status transitions**

   Workflow detail displays a Live status and a Pause button, but the button has
   no `onPress` handler and cannot change the status:
   `app/(tabs)/flows/detail.tsx:97-106`.

   Design states needed: pause confirmation or immediate pause, Paused detail,
   resume action, in-flight/error feedback, and Draft actions/stat tiles.

9. **Run action outcomes**

   Held runs route Review & approve to Approvals. Failed runs display Retry run
   without a handler, while successful runs have no primary action:
   `app/(tabs)/(home)/run.tsx:117-143`.

   Design states needed: retry confirmation or immediate retry, retrying,
   retry-success navigation/update, retry failure, and the post-approval run
   transition.

### P1 — review, notifications, and lifecycle consequences

10. **Approval lifecycle and empty state**

    Approve and Reject only replace each card’s buttons with local text. The
    header count remains 3 and the cards remain in the list after all decisions:
    `app/(tabs)/activity/approvals.tsx:36-95`.

    Design states needed: pending count updates, decided-item treatment,
    all-items-decided empty state, action failure/retry, and the resulting run or
    workflow status.

11. **Notifications destination and permission moment**

    The Home bell routes to Activity, Settings only flips a local Notifications
    toggle, and setup’s Slack notification row has no handler. There is no
    notifications inbox or permission flow:
    `app/(tabs)/(home)/index.tsx:174-183`,
    `app/(tabs)/settings.tsx:223-227`,
    `app/(tabs)/solutions/setup.tsx:161-174`.

    Design states needed: notification list, unread/read state, empty state,
    notification preferences, iOS permission-priming moment, denied state, and
    the relationship between the Home bell and Activity.

12. **Solution activation and removal consequences**

    Removal now has a confirmation dialog, but the implementation only toggles
    the solution in the shared local map. It does not render dependent workflow
    pausing or a billing confirmation. Activation toggles the solution after a
    local QuickBooks “Connect” press and immediately routes to the generic
    workflow detail:
    `app/(tabs)/solutions/index.tsx:117-160`,
    `app/(tabs)/solutions/setup.tsx:35-43`.

    Design states needed: activation confirmation, price/proration/next-invoice
    treatment, connection failure, entitlement pending/success/failure,
    dependent-workflow consequences, and removal success/failure.

### P2 — account, workspace, and billing destinations

13. **Account and security destinations**

    The profile card has no handler. Passkeys uses an empty handler. Face ID,
    Stay signed in, and sign-out are local prototype controls; Face ID unlock
    itself attempts local authentication but always navigates Home after its
    timer:
    `app/(tabs)/settings.tsx:93-128`,
    `app/(auth)/faceid.tsx:55-75`.

    Design states needed: profile editing, passkey add/remove, biometric
    success/failure/cancel/unavailable, signed-in-device state, and sign-out
    confirmation/result.

14. **Connections, workspace, and billing destinations**

    Gmail, QuickBooks, Slack, Payment method, Invoices, Acme Operations, and
    Members all render navigation affordances but use empty handlers. Only
    Manage solutions has a destination:
    `app/(tabs)/settings.tsx:133-228`.

    Design states needed: connection detail/reconnect/disconnect/error, workspace
    detail, member list/invite/remove, payment method management, invoice detail,
    and billing error states.

### P3 — platform and quality decisions

15. **Responsive and accessibility behavior**

    The design is measured on a 402×874 canvas. The app declares tablet support
    in `app.json:9-13`, but there are no documented iPad, 375pt/SE, or large-text
    layouts. The Home bell and avatar press targets also do not declare labels;
    most semantics are currently provided only for the custom tab bar, Back, and
    toggles:
    `app/(tabs)/(home)/index.tsx:174-188`,
    `components/nocturne/tab-bar.tsx:74-88`,
    `components/nocturne/back-circle.tsx:12-26`,
    `components/nocturne/noc-toggle.tsx:31-36`.

    Design decisions needed: Dynamic Type policy, small-width layout rules,
    iPad layout policy, accessible names/roles for every control, and minimum
    touch-target behavior.

16. **Reduced-motion and light-mode coverage**

    Splash, onboarding, Face ID, and skeleton screens use Reanimated loops or
    timed transitions, and the theme supports Light/Auto but only token-level
    tests exist. There is no reduced-motion branch or screen-by-screen visual
    coverage:
    `app/index.tsx:45-91`,
    `app/(auth)/faceid.tsx:80-96`,
    `components/nocturne/skeleton.tsx:25-44`,
    `hooks/use-theme.tsx:25-33`.

    Design decisions needed: static alternatives under Reduce Motion and visual
    approval of every screen in Light and Auto modes.

## Proposed implementation order

This ordering follows observed dependencies in the current code. It is a work
plan, not a claim that any backend behavior already exists.

### Phase 0 — freeze the design contract

- Define route parameters and entity identity for workflows, runs, solutions,
  templates, approvals, and notifications.
- Define the prototype persistence boundary and reset behavior.
- Define the state matrix for loading, empty, error, success, pending, and
  destructive actions.
- Resolve the design decisions listed under P0 before changing the screens.

### Phase 1 — make workflow creation coherent

- Design and wire the template handoff.
- Define Builder add/edit/delete/reorder/branch behavior.
- Add unsaved, saved, validation, test-run, and failure states.
- Wire workflow search, template filters, workflow identity, and Live/Paused/
  Draft variants.

### Phase 2 — make operational actions coherent

- Define approval completion, count, empty, and failure states.
- Define run retry and post-approval transitions.
- Define solution activation/removal confirmation and dependent workflow states.
- Design the notification inbox, preferences, and permission flow.

### Phase 3 — complete auth and account surfaces

- Design form validation and auth/provider error states.
- Design password reset, session boundary, Face ID outcomes, and sign-out
  confirmation.
- Design profile, passkeys, connections, workspace, payment, and invoice
  destinations.

### Phase 4 — validate platform behavior

- Review 402pt, 375pt/SE, and iPad layouts.
- Review Dynamic Type and accessibility semantics/touch targets.
- Review reduced-motion alternatives.
- Review every screen in Light and Auto modes.

## Completion criteria for the design phase

The design backlog is ready for implementation when every open item has:

- a named screen or route;
- an explicit initial, loading, success, empty, and failure state where the
  action can fail;
- a defined transition and destination;
- a defined local prototype state or reset rule; and
- a testable acceptance statement.
