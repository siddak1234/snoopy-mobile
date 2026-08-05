# Design gaps — Autom8x iOS App

Context for the design session: these gaps were found while implementing
`Screen.dc.html` (16 screens, 402×874 canvas) 1:1 in the React Native app.
Every screen and token implemented so far matches the design exactly; the
items below are the places the design is silent and the app either had to
extend it (marked "ratify") or currently does nothing. Please extend the
design on the existing Nocturne tokens — new states/variants can live as
additional `sc-if` blocks or prop-driven states in `Screen.dc.html`.

## A. States the design never draws (highest value)

1. **Loading states** — every screen assumes data is already present.
   *Purpose:* real API calls take time; without a designed skeleton/spinner
   treatment in the Nocturne voice, the app will have to invent one.
2. **Empty states — first run** — a brand-new account has zero workflows,
   runs, approvals, or activity; every screen currently shows a rich
   fixture. *Purpose:* the empty state is the first thing a real user sees;
   it should sell the product (e.g. point at Solutions/Templates).
3. **Empty states — transient** — Approvals after all items are decided;
   Activity/Solutions filtered to no matches. *Purpose:* both are reachable
   today and currently just render blank space.
4. **Error states** — failed data load, offline, failed login (wrong
   password), failed run action. *Purpose:* the app needs a designed
   failure voice; nothing exists for any error anywhere.

## B. Behavior drawn but not wired (ratify or redefine)

5. **Activity "Success"/"Failed" chips** — static in the design; the app now
   filters the run lists by status and hides empty date sections.
   *Purpose:* ratify this in the design (active-chip states per filter) so
   the design↔app contract stays exact.
6. **Solutions category chips** — static in the design; the app now filters
   the marketplace by category. *Purpose:* same ratification.
7. **Builder interactions** — palette chips, the "+" connectors, drag
   handles, Save, and Test run are all drawn but do nothing. *Purpose:*
   this is the core creation flow; define add-step (sheet? inline?),
   reorder, save feedback, and what a test run shows.
8. **Flows search** — drawn as a static placeholder. *Purpose:* define
   typing state, result filtering, and the no-results state.
9. **Pause (workflow detail)** — button exists, no designed consequence.
   *Purpose:* the status pill should presumably flip Live→Paused; confirm
   whether it needs a confirmation step.
10. **Templates "Use →"** — currently just opens the Builder. *Purpose:*
    define the configure/confirm step (name the workflow, preview its
    steps) between choosing a template and landing in the Builder.

## C. Missing destinations (drawn affordances that go nowhere)

11. **"Forgot?"** on Log in — password-reset flow. *Purpose:* auth
    completeness before real accounts exist.
12. **Profile row** (Alex Kim card) — account editing screen.
13. **Passkeys row** — passkey management (add/remove).
14. **Workspace rows** — "Acme Operations" and "Members · 12" destinations.
15. **Payment method / Invoices rows** — card management and invoice
    history. *Purpose:* needed the moment billing is real.
16. **Notifications** — the bell has a badge and Settings has a toggle, but
    there is no notifications inbox, and no iOS permission-priming moment.
    *Purpose:* push implies both; the bell currently borrows Activity.

## D. Entity-state variants (one fixture designed per screen)

17. **Run detail variants** — only the "Held" run is designed. *Purpose:*
    Home lists successful and failed runs too and they all open the same
    held run today; success (completed timeline, no actions?) and failure
    (error row, "Retry"?) need their own states.
18. **Workflow detail variants** — only "Invoice triage · Live". *Purpose:*
    Paused and Draft detail states (a Draft has no runs — what do the
    stat tiles and actions show?).
19. **Solution removal consequence** — removing a solution that powers live
    workflows is currently instant. *Purpose:* define the confirmation and
    what happens to dependent workflows (the DS already has a `.dialog`).
20. **Add-solution purchase moment** — the plan total changes instantly.
    *Purpose:* real billing needs a confirm step (price, proration, next
    invoice) between tap and entitlement.
21. **Sign out** — instant today. *Purpose:* destructive action; likely
    wants the DS dialog as a confirm.

## E. Platform adaptations

22. **Dynamic Type policy** — the design uses fixed px sizes. *Purpose:*
    decide whether text scales with the iOS text-size setting or is capped,
    and what large-text does to dense rows.
23. **Small-width behavior (375pt / SE)** — canvas is 402pt. *Purpose:*
    confirm the 3-up stat row, half-width buttons, and solution cards
    degrade acceptably or specify adaptations.
24. **iPad** — currently unspecified (the app allows tablets). *Purpose:*
    either declare phone-only or design regular-width layouts.
25. **Reduced motion** — splash pulse, Face ID scan, fade-ups. *Purpose:*
    specify static alternatives for the iOS Reduce Motion setting.
26. **Light mode coverage** — only Home and Log in are drawn light; all
    other screens derive from the token overrides (this worked in
    practice). *Purpose:* confirm derivation is intended, or draw the
    exceptions.
