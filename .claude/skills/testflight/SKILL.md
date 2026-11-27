---
name: testflight
description: Ship an iOS build of main to TestFlight with npm run release:ios, after the owner says go - both dry runs, then where it builds (only a path whose dry run passed), the build (on this Mac or EAS's cloud), the submit, every verdict read and given a home (expo-doctor, EAS's build and submission logs, Apple's ITMS codes), processing, the tester group, the What to Test note, and where the build's feedback goes.
---

# TestFlight

**Purpose.** One iOS build of `origin/main` to TestFlight, through `scripts/release-ios.sh` only. The script holds the refusals; this skill holds the order. The release values it needs are README "Release configuration, pinned"; how the script decides is README "Verification".

**Inputs.**
- The owner's go for this build, and the owner's choice of where it builds: `--local` (this Mac, no EAS build quota) or the cloud build, asked only after step 2 has run both dry runs. Offer only the path(s) whose dry run passed, and for a path that refused, say why in plain words (its `REFUSED:` line: this Mac's Xcode 27.2, for one, refuses `--local`). No choice recorded: `--local` when its dry run passes, else the cloud path, said in the reply.
- A scratch clone outside ~/Desktop and iCloud, on `main`; its `npm ci` runs in step 2, under the gate lock.
- Node 22, `gh` signed in, an Expo session (`npx --yes eas-cli@<eas.json cli.version> whoami`, the one eas-cli version the release runs), and for `--local` the Mac toolchain [README "Verification"](../../../README.md#verification) names for `npm run release:ios -- --local`.

## Steps

1. Bring the clone to `origin/main`, clean:
   ```bash
   git fetch origin && git switch main && git reset --hard origin/main
   git status --short          # must print nothing
   ```
2. Take the gate lock, then the clone's `npm ci`, then rehearse every refusal on both paths, before the owner is asked where to build. Nothing is built.
   ```bash
   node ~/.claude/autom8x/gate-lock.mjs acquire testflight
   npm ci                                      # the build's install, under the lock
   npm run release:ios -- --dry-run            # the cloud path
   npm run release:ios -- --local --dry-run    # the Mac path; refuses Xcode 27 and later for SDK 57 (README "Verification")
   ```
   A path can be offered only when its dry run ends `DRY RUN: every gate passed on <sha>`. Both paths refuse unless HEAD == `origin/main`, the tree is clean, `all-green` concluded success on HEAD, the live AASA names the app, the deployed platform's contract hashes equal the generated types', and the pinned expo-doctor passes (README "Verification"; its `expo-doctor` line names the checks passed); `--local` also refuses a Mac that cannot build. Then ask where to build, as Inputs says, unless the owner already chose a path that passed; release the gate lock while the owner answers and take it again for step 3. A doctor refusal is fixed by a reviewed pull request (`npx expo install --fix`, a round of its own) or a reviewed `expo.install.exclude` entry, never on the release path.
3. Build and submit, the path the owner chose, then release the gate lock:
   ```bash
   npm run release:ios -- --local      # or: npm run release:ios
   node ~/.claude/autom8x/gate-lock.mjs release testflight
   ```
   Keep the printed build id (cloud) or ipa path (local), the submission id, and every verdict line it prints: `expo-doctor`, on `--local` the `local toolchain:` line, on the cloud path each `EAS build environment:`, `EAS phase` and `EAS doctor` line, and after the submit each `EAS submission` line. It submits only after EAS's log of a cloud build passed (its doctor phase ended success) and the ipa's entitlements print `ENTITLEMENTS_OK`; a refused cloud build is kept, not cancelled.
   The gate lock covers the local steps only, the clone's `npm ci` and steps 2 and 3: release it right after the submission is FINISHED (the script's last line, `DONE: … -> FINISHED`), or at any stop below, and never hold it while Apple processes the build (step 4). Any script that builds a TestFlight, a session's own too, takes and releases the lock the same way.
4. After the submit, follow processing, without the gate lock:
   ```bash
   npx --yes "eas-cli@$(node -p "require('./eas.json').cli.version")" submit:list --platform ios --limit 1
   ```
   Wait until App Store Connect shows the build as processed (VALID). Then read Apple's delivery email for build N and list each ITMS code in it verbatim (build 46's carried ITMS-90725; EAS's submission log has held none so far, README "Verification"). Each ITMS code, and each finding step 3 printed (an `EAS phase` that did not succeed, an `EAS doctor` failed check, an `EAS submission` warning or error), gets a home: a fix pull request, a §12.1 row or a dated DESIGN-GAPS entry, named beside it in the reply. The app has one TestFlight group, internal, "Team (Expo)", with access to all builds and one tester, the owner (read through the App Store Connect API, 2026-11-04 22:15Z), so a VALID build reaches the owner by itself, as build 37 did: there is no console step to add a build to a group and no note to paste. The owner is never asked to do either; a What to Test note (step 5), when written, goes in the reply. Give the owner the build number.
5. The What to Test note is optional. When it helps, write it from `templates/what-to-test.md`: plain words, 5 lines or fewer, what changed on screen, not how.
   **Sign-in is always the first check.** Every build's test list, written or said, starts with: sign out,
   then sign in with each provider the login screen shows, from a closed app. TestFlight 37 and 38 could not
   sign in (expo-web-browser 55 changed when iOS catches the HTTPS return; DESIGN-GAPS "Hotfix: sign-in on
   iOS"), and the list for 38 did not name it. The session gives the owner this check first with the build
   number (step 4), and calls the build working only after the owner's sign-in succeeds and every step 4 finding has its home.
6. Record the build in the private `DESIGN-GAPS.md` (root `CLAUDE.md` "Records") under the round's current section: build number, commit, build or ipa path, submission id, date, where it built, the build image and Xcode/SDK (`EAS build environment:`, or the `local toolchain:` line), the doctor's result (the script's `expo-doctor` line and, cloud, EAS's), each finding and ITMS code with its home (step 4). Facts only.
7. The build's feedback: when the owner's testers send it, run the backend's `feedback-intake` skill (`/add-dir ../snoopy-backend`, then `/feedback-intake`). It lists every item verbatim first; nothing is built from feedback until the owner approves the list.

## Stop conditions

- Any `REFUSED:` line: stop, report the line, fix nothing on the release path without the owner. Both dry runs refused: stop and report both lines; there is no path to offer. EAS's log refused a cloud build: report the build id and its findings; the build is kept, not cancelled, and never submitted by hand.
- A finding with no home: an ITMS code, or a step 3 finding, with no fix pull request, §12.1 row or dated DESIGN-GAPS entry: the build is not called working until each has one (step 4).
- `Deployed contract` red on `main` (types ahead of production): stop; the platform's release comes first (`lib/platform/CLAUDE.md`).
- A build whose commit is not HEAD: cancel it with the command the script prints, and stop.
- Never pass `--no-verify`, never edit `eas.json` or `app.json` values, never run EAS in a checkout under ~/Desktop or iCloud.

## Output

- Where it built and, when a path was not offered, why its dry run refused (Inputs); the build number, commit, submission id; the build image and Xcode, the doctor's result, each finding and ITMS code with its home (step 4); the sign-in check first (step 5) and, when written, the What to Test note, in the reply to the owner.
- The private `DESIGN-GAPS.md` record (step 6). Docs-map rule: `.claude/**` changes update `CLAUDE.md`; a change to `scripts/release-ios.sh` updates README.
