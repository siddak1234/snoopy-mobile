# Round record — `snoopy-mobile`, each round's preamble moved verbatim out of `CLAUDE.md` (newest first; the findings are `DESIGN-GAPS.md`)

## Round 21 — the platform round's app rows (2026-10-28)

The app's half of the setup dropdown (F1) and the review of each change (F2) in
the round's platform spec, in the words of ICD-10 Code Check's `words.md` section 3
(owner-approved 2026-10-28 ~21:43Z). It reads the contracts regenerated from the backend's PR #255
head (`3fd5cea`); a hand-written an interim hand-written contract module (on the PR branch only, never on main) until that regeneration. Findings and bites: `DESIGN-GAPS.md` "Round 21 — a setup dropdown and a review of each
change".

## Round 17

**Round 17 — five changes here (2026-10-08 to 2026-10-10): 25.8.1; the app's halves of 25.2.12 and 25.2.10;
their words and webhook key made the website's; the release's local build (`release:ios -- --local`,
for 25.8.2); and 25.8.3, the flow page's start controls with Take photo (2026-10-10) — and two more
put to the owner as a re-entry on 2026-10-13 and approved by the owner's merge of #62 (`fa33f61`,
2026-10-13 13:58:48Z): Account deleted in the website's words (backend 25.7.4), and the one-time
consent before AI reads a run's file (Apple 5.1.2(i)); and two more approved by the owner's merge of
#63 (`fcc2f79`, 2026-10-14 05:11:18Z): the "By continuing, you agree…" line under the sign-in buttons
(the owner's decision of 2026-10-13), and the automatic re-complete of an upload answered
`measurement_busy` (applied by the session under the owner's "keep it easy" rule).** Round 17 opened in `snoopy-backend` on
2026-10-08 (BUILD-PLAN Phase 25, `a9e13ae`) on
the owner's four requirements for automations; its 25.8 is this repository's one box — "A control
the app does not know renders as the website does … `resource-picker` gets its control; an error
boundary around the Setup and Run dialogs … Nothing else in the app changes" — made once so that no
app change is needed per automation (requirement 1), then 25.8.2's one TestFlight build, the
owner's. The second is the approved round plan's own: 25.2.12 ends "Both clients change with the
platform where the words do" (backend `949dc8d`), and with the contract of `ccc10e4` the app sends
the webhook issue's `Idempotency-Key` (§12.1 #240) and says a run refused at a full flow in words
(25.2.10) — merged as `4fc5ddd` after the TWENTY-THIRD promotion's read-back, riding 25.8.2's
build. The third is a re-entry for the owner's mobile = web parity: a review of #56, after it and
`snoopy` #44 merged, found the two clients saying different things for the same answer, so the app
now says the website's full-queue sentence and Run dialog lead verbatim and keeps the webhook
issue's key through its dialog closing, as the website does — riding the same build. The fifth is
25.8.3, added 2026-10-09 for the first automation (Invoice Processing, 25.7.2) and approved by the
owner ("i like the suggested lets do that"): the run's fields and Start run at the top of the flow
page in place of the Run button and its dialog, inside the same boundary's words, and a file field
offering Take photo beside Upload — every image re-encoded once with `expo-image-manipulator`
(upright, its long side at most 2,576 px, a JPEG at 0.9), the pickers held to a PDF, a JPEG or a PNG
(the owner's decision 1 of 2026-10-10); it rides 25.8.4's build. The record is DESIGN-GAPS "Round
17 — the app, once"; any further change here in Round 17 is a re-entry the owner approves
(MASTER-PLAN §4), and §0.1 names this repository for 25.8. The two of 2026-10-13 are recorded in
DESIGN-GAPS "The account-deleted words (Round 17; 2026-10-13)" and "The consent before AI reads a
run's file (Round 17; 2026-10-13)"; both were approved by the owner's merge of #62 (`fa33f61`,
2026-10-13 13:58:48Z).

**And the Invoice Processing update's shared screens (2026-10-14), a re-entry on the owner's words
after build 19** — "continue and complete. U2 is going to be in accounting. … theres no choose a
team. there will be pre existing teams depending on which flows are added." (~16:40Z), "approve.
complete" (~16:35Z), "ensure web is also updated accordingly" (~16:42Z) and "go" (~18:15Z): no team
picker and no Create a team (a flow goes to its category's team, backend ADR-0036); the Connect
vendor page, with QuickBooks's own logo and button and None; the account's answer to "AI reads your
documents" in place of the per-run consent (ADR-0038), removed in the same change; a run's progress
by its flow's step groups and its saved details (ADR-0037); and these screens held to the design
contract — numbered sections, icons 24 and 20 in buttons, plain words. Backend 25.4.13–25.4.26; the
record is DESIGN-GAPS "The Invoice Processing update's shared screens (Round 17; 2026-10-14)", and
its independent review's findings, fixed on the same branch, DESIGN-GAPS "The review of the Invoice
Processing screens (Round 17; 2026-10-14)".

**And Build 21 (2026-10-15/16), a re-entry on the owner's words after build 20** — his thirteen
TestFlight items, D1–D4, the quick-run ask, the Intuit decision ("we will list on apples app store
not intuits. so we do not need that") and "go with all" (~04:15Z, the A/B/C list it answered, not
the session's choices), corrected the same evening by AM1–AM8 (~22:15Z, ~22:35Z): no AI consent
anywhere (A1); Connect vendor saves at the tap and goes back (A2); the vendor row says its state
(A3); one connection row everywhere, our own Connect / Reconnect / Disconnect, the vendors' marks
at 24 (A4, A5); the flow page as the run page — DASHBOARD live, STEPS with the document and Start
run in Step 1 and the vendor in its step, CONNECTIONS, Edit setup at the bottom — and Set up one
simple page, once (A6, AM4); a run's page with every step from the start, its documents and
Download JSON (A7, the app's side of C1/C2); every run by its full id (A8, AM2); Home's RUN A FLOW
and no Teams list (A9, AM5). The record is DESIGN-GAPS "Build 21 (Round 17; 2026-10-15)", the
session's choices listed there as the session's; the contract is the round's (`b21-contract`) until
the platform's release, then backend `main`. Its independent review (2026-10-17), fixed on the same
branch: DESIGN-GAPS "The review of Build 21's screens (Round 17; 2026-10-17)".

**And Build 22 (2026-10-17), a re-entry on the owner's words after build 21** — his seven TestFlight
items (14:30–14:39Z: Home, Flows, Activity and the flow page, quoted in DESIGN-GAPS "Build 22") and
"continue and complete. parallel if you can" (21:12Z), which approved the plan H1–H4 · F1–F3 · P1–P5 ·
W1–W3 and **the session's suggestions D1–D6** shown with it (D1 the owners, admins and the person who
started a run always get its email, the step 5 screen adds more; D2 "AI processing"; D3 "Details
saved" with None, "QuickBooks updated" otherwise; D4 "overflow" = OVERVIEW; D5 the website matches;
D6 the approvals banner right after TODAY — the session's, approved, never the owner's own words):
Home is the greeting, TODAY, the banner, Add a flow + Flows and RECENT RUNS — no RUN A FLOW, OVERVIEW,
Connect integration or View teams (H1–H4); Flows and Activity open on one title row, Home's two scope
circles beside the title (`components/title-row.tsx`; `ScopeControl`'s pills deleted; F1–F3); the flow
page's five steps, titles only — Upload invoice, Connect integration with the integration, AI
processing, QuickBooks updated / Details saved, Email sent with who gets it — no CONNECTIONS, no move
to another version (the platform moves every flow, backend ADR-0041; `move-version.tsx` and
`setup-dialog.tsx` deleted; P1–P4); a flow's email screen, Who gets the email (`app/(tabs)/flows/email.tsx`,
P5); and the run page's setting step, step 4 by the flow's choice and step 5 by the run's email. The
spec is the session's b22/spec.md, the contract `b22-contract` (`automations.yaml` `8f780521…`,
`openapi.yaml` `52a5ca8d…`) until the platform's release, then backend `main`. The record is
DESIGN-GAPS "Build 22 (Round 17; 2026-10-17)", the session's choices listed there as the session's.
Its independent review (2026-10-17), fixed on the same branch: DESIGN-GAPS "The review of Build 22's
screens (Round 17; 2026-10-17)" — the title rows keep every item on one line at 320 pt, and the email
screen's field shows over the keyboard.

**Round 16 CLOSED 2026-10-07** — Gate 24 re-run by command by a fresh `snoopy-backend` session that wrote none of it; its record here is DESIGN-GAPS "Build 16: the owner's device pass, and Round 16's close". Open from 2026-09-29 (BUILD-PLAN Phase 24, ADR-0032): the mobile app offers
every signed-in feature the website offers, on the same published operations,
and ships to Apple first. This repository owns 24.3–24.7 and, since the owner's build 6 feedback of 2026-10-02, 24.9 (the flows design pass: one Flows tab, a project scope, a shared workspace snapshot) and, since build 7's, 24.11.6–24.11.10 (the cover when signed out, Teams in place of Projects, Archived flows (Removed flows until 24.12), Unlink, flow history), and, since build 9's (the owner's decisions of 2026-10-02), the app's part of 24.12 (a team is its kind, the archive wording, Settings by category, the billing cards, the join link, the export to the share sheet, Unlink in words, the empty-screen standard, the bigger type), and, since build 10's (the owner's decisions of 2026-10-03, build 11), Settings as one grouped page, compact billing cards with a drawn Pro, an archived flow's live twin, a team on and for every flow, the Archived header button and the Flows empty standard, and a tick on every press, one phase per session:
the foundation, automations/runs/connections, organization/projects/teams,
billing/account/data/support, and the iOS release. **The round closed in
`snoopy-backend`, not here**: a fresh session that wrote none of it re-ran Gate 24 by command on
2026-10-07 and recorded only what it established; a further change here is a re-entry the owner
approves (MASTER-PLAN §4). Earlier rounds' records stay in
`DESIGN-GAPS.md` and `ROUND-7.5-OBSERVATIONS.md` and are not rewritten.
