---
name: testflight
description: Ship an iOS build of main to TestFlight with npm run release:ios, after the owner says go - the dry run, the build (on this Mac or EAS's cloud), the submit, processing, the tester group, the What to Test note, and where the build's feedback goes.
---

# TestFlight

**Purpose.** One iOS build of `origin/main` to TestFlight, through `scripts/release-ios.sh` only. The script holds the refusals; this skill holds the order. The release values it needs are README "Release configuration, pinned"; how the script decides is README "Verification".

**Inputs.**
- The owner's go for this build, and the owner's choice of where it builds: `--local` (this Mac, no EAS build quota) or the cloud build. No choice recorded: `--local`.
- A scratch clone outside ~/Desktop and iCloud, on `main`, with `npm ci` done.
- Node 22, `gh` signed in, an Expo session (`npx eas-cli whoami`), and for `--local` Xcode, CocoaPods and fastlane.

## Steps

1. Bring the clone to `origin/main`, clean:
   ```bash
   git fetch origin && git switch main && git reset --hard origin/main
   git status --short          # must print nothing
   ```
2. Rehearse every refusal. Nothing is built.
   ```bash
   npm run release:ios -- --dry-run            # the cloud path
   npm run release:ios -- --local --dry-run    # the Mac path, also proves the toolchain
   ```
   It must end `DRY RUN: every gate passed on <sha>`. Both paths refuse unless HEAD == `origin/main`, the tree is clean, `all-green` concluded success on HEAD, the live AASA names the app, and the deployed platform's contract hashes equal the generated types'.
3. Build and submit, the path the owner chose:
   ```bash
   npm run release:ios -- --local      # or: npm run release:ios
   ```
   Keep the printed build id (cloud) or ipa path (local) and the submission id. It submits only after the ipa's entitlements print `ENTITLEMENTS_OK`.
4. After the submit, follow processing:
   ```bash
   npx eas-cli submit:list --platform ios --limit 1
   ```
   Wait until App Store Connect shows the build as processed (VALID). Then it goes to the TestFlight tester group (App Store Connect, TestFlight, the group, Builds); a console step there is the owner's, so give the owner the build number and the What to Test note.
5. Write the What to Test note from `templates/what-to-test.md`: plain words, 5 lines or fewer, what changed on screen, not how.
6. Record the build in `DESIGN-GAPS.md` under the round's current section: build number, commit, build or ipa path, submission id, date. Facts only.
7. The build's feedback: when the owner's testers send it, run the backend's `feedback-intake` skill (`/add-dir ../snoopy-backend`, then `/feedback-intake`). It lists every item verbatim first; nothing is built from feedback until the owner approves the list.

## Stop conditions

- Any `REFUSED:` line: stop, report the line, fix nothing on the release path without the owner.
- `Deployed contract` red on `main` (types ahead of production): stop; the platform's release comes first (`lib/platform/CLAUDE.md`).
- A build whose commit is not HEAD: cancel it with the command the script prints, and stop.
- Never pass `--no-verify`, never edit `eas.json` or `app.json` values, never run EAS in a checkout under ~/Desktop or iCloud.

## Output

- The build number, commit, submission id and the What to Test note, in the reply to the owner.
- The `DESIGN-GAPS.md` record (step 6). Docs-map rule: `.claude/**` changes update `CLAUDE.md`; a change to `scripts/release-ios.sh` updates README.
