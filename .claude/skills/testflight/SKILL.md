---
name: testflight
description: Ship an iOS build of main to TestFlight with npm run release:ios, after the owner says go - the dry run, the build (on this Mac or EAS's cloud), the submit, processing, the tester group, the What to Test note, and where the build's feedback goes.
---

# TestFlight

**Purpose.** One iOS build of `origin/main` to TestFlight, through `scripts/release-ios.sh` only. The script holds the refusals; this skill holds the order. The release values it needs are README "Release configuration, pinned"; how the script decides is README "Verification".

**Inputs.**
- The owner's go for this build, and the owner's choice of where it builds: `--local` (this Mac, no EAS build quota) or the cloud build. No choice recorded: `--local`.
- A scratch clone outside ~/Desktop and iCloud, on `main`; its `npm ci` runs in step 2, under the gate lock.
- Node 22, `gh` signed in, an Expo session (`npx --yes eas-cli@<eas.json cli.version> whoami`, the one eas-cli version the release runs), and for `--local` the Mac toolchain [README "Verification"](../../../README.md#verification) names for `npm run release:ios -- --local`.

## Steps

1. Bring the clone to `origin/main`, clean:
   ```bash
   git fetch origin && git switch main && git reset --hard origin/main
   git status --short          # must print nothing
   ```
2. Take the gate lock, then the clone's `npm ci`, then rehearse every refusal. Nothing is built.
   ```bash
   node ~/.claude/autom8x/gate-lock.mjs acquire testflight
   npm ci                                      # the build's install, under the lock
   npm run release:ios -- --dry-run            # the cloud path
   npm run release:ios -- --local --dry-run    # the Mac path; refuses Xcode 27 and later for SDK 57 (README "Verification")
   ```
   It must end `DRY RUN: every gate passed on <sha>`. Both paths refuse unless HEAD == `origin/main`, the tree is clean, `all-green` concluded success on HEAD, the live AASA names the app, and the deployed platform's contract hashes equal the generated types'.
3. Build and submit, the path the owner chose, then release the gate lock:
   ```bash
   npm run release:ios -- --local      # or: npm run release:ios
   node ~/.claude/autom8x/gate-lock.mjs release testflight
   ```
   Keep the printed build id (cloud) or ipa path (local) and the submission id. It submits only after the ipa's entitlements print `ENTITLEMENTS_OK`.
   The gate lock covers the local steps only, the clone's `npm ci` and steps 2 and 3: release it right after the submission is FINISHED (the script's last line, `DONE: … -> FINISHED`), or at any stop below, and never hold it while Apple processes the build (step 4). Any script that builds a TestFlight, a session's own too, takes and releases the lock the same way.
4. After the submit, follow processing, without the gate lock:
   ```bash
   npx --yes "eas-cli@$(node -p "require('./eas.json').cli.version")" submit:list --platform ios --limit 1
   ```
   Wait until App Store Connect shows the build as processed (VALID). The app has one TestFlight group, internal, "Team (Expo)", with access to all builds and one tester, the owner (read through the App Store Connect API, 2026-11-04 22:15Z), so a VALID build reaches the owner by itself, as build 37 did: there is no console step to add a build to a group and no note to paste. The owner is never asked to do either; a What to Test note (step 5), when written, goes in the reply. Give the owner the build number.
5. The What to Test note is optional. When it helps, write it from `templates/what-to-test.md`: plain words, 5 lines or fewer, what changed on screen, not how.
   **Sign-in is always the first check.** Every build's test list, written or said, starts with: sign out,
   then sign in with each provider the login screen shows, from a closed app. TestFlight 37 and 38 could not
   sign in (expo-web-browser 55 changed when iOS catches the HTTPS return; DESIGN-GAPS "Hotfix: sign-in on
   iOS"), and the list for 38 did not name it. The session gives the owner this check first with the build
   number (step 4), and calls the build working only after the owner's sign-in succeeds.
6. Record the build in `DESIGN-GAPS.md` under the round's current section: build number, commit, build or ipa path, submission id, date. Facts only.
7. The build's feedback: when the owner's testers send it, run the backend's `feedback-intake` skill (`/add-dir ../snoopy-backend`, then `/feedback-intake`). It lists every item verbatim first; nothing is built from feedback until the owner approves the list.

## Stop conditions

- Any `REFUSED:` line: stop, report the line, fix nothing on the release path without the owner.
- `Deployed contract` red on `main` (types ahead of production): stop; the platform's release comes first (`lib/platform/CLAUDE.md`).
- A build whose commit is not HEAD: cancel it with the command the script prints, and stop.
- Never pass `--no-verify`, never edit `eas.json` or `app.json` values, never run EAS in a checkout under ~/Desktop or iCloud.

## Output

- The build number, commit, submission id, the sign-in check first (step 5) and, when written, the What to Test note, in the reply to the owner.
- The `DESIGN-GAPS.md` record (step 6). Docs-map rule: `.claude/**` changes update `CLAUDE.md`; a change to `scripts/release-ios.sh` updates README.
