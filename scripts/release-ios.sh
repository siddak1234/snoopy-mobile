#!/bin/bash
# Builds and submits the iOS app from main — and refuses everything else.
#
#   npm run release:ios                      build in EAS's cloud, check, submit
#   npm run release:ios -- --local           build on this Mac instead (free, no EAS
#                                            build quota), check, submit
#   npm run release:ios -- --dry-run         run every refusal, then stop before the build
#   npm run release:ios -- --local --dry-run also refuse a Mac that cannot build
#
# --local (Round 17, 2026-10-08): `eas build --local` runs the same build on this
# Mac with Xcode, CocoaPods and fastlane, fetching the project's credentials and
# its EAS "production" environment as the cloud build does; it bumps the same
# remote build number. Nothing is registered as an EAS build, so the cloud path's
# `gitCommitHash` read has no record to read: the gates' clean HEAD == origin/main
# and `cli.requireCommit` are what bind the archive to HEAD. The ipa's
# entitlements are checked exactly as the cloud build's, and it is submitted with
# `eas submit --path`. Measured 2026-10-08 on main 4fc5ddd: 5.5 minutes, ENTITLEMENTS_OK,
# `EXConstants.bundle/app.config` identical to cloud build 16's.
#
# Refuses unless: HEAD is origin/main; the tree is clean; the `all-green` check
# run from GitHub Actions on HEAD concluded success (selected by check NAME and
# app id — a Dependabot check run on the same commit is not CI); the live
# AASA names this app in both applinks and webcredentials; and the deployed
# platform's contract hashes (/health/live) equal the generated types' headers
# (scripts/verify-deployed-contracts.mjs --release). After `eas build`:
# the build's gitCommitHash is HEAD and the ipa carries the release's
# entitlements. Only then does it submit. Any doubt refuses.
#
# Runs with the caller's PATH: node 22 (eas-cli through npx), gh, python3,
# curl, unzip, codesign, plutil. Working files go under .autom8x/release-ios/
# (gitignored). The Expo session is read from ~/.expo/state.json at the moment
# the submission is polled and is never written anywhere.
set -u
cd "$(dirname "$0")/.." || exit 1

DRY_RUN=0
LOCAL=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --local) LOCAL=1 ;;
    *) echo "usage: $0 [--local] [--dry-run]"; exit 2 ;;
  esac
done

refuse() { echo "REFUSED: $*"; exit 1; }

WORK=.autom8x/release-ios
mkdir -p "$WORK" || exit 1
# The native redirect host (app.config.js RELEASE_NATIVE_REDIRECT_URI): the
# associated domain the entitlements name, and where the platform's proxy serves
# the AASA (snoopy-backend deploy/Caddyfile `handle /.well-known/apple-app-site-association`).
LINK_HOST=app.autom8x.ai
AASA_URL="https://$LINK_HOST/.well-known/apple-app-site-association"
GITHUB_ACTIONS_APP_ID=15368
# <TeamID>.<bundleIdentifier>, from the committed configuration.
APP_ID=$(python3 -c '
import json
team = json.load(open("eas.json"))["submit"]["production"]["ios"]["appleTeamId"]
bundle = json.load(open("app.json"))["expo"]["ios"]["bundleIdentifier"]
print(f"{team}.{bundle}")') || refuse "cannot read the Team ID and bundle identifier"

echo "tree: $(git rev-parse --short HEAD) dirty=$(git status --short | wc -l | tr -d ' ') app: $APP_ID"

# --- gates: build only what main's CI passed ---------------------------------
git fetch -q origin || refuse "cannot fetch origin"
HEAD_SHA=$(git rev-parse HEAD); MAIN_SHA=$(git rev-parse origin/main)
[ "$HEAD_SHA" = "$MAIN_SHA" ] || refuse "HEAD $HEAD_SHA is not origin/main $MAIN_SHA"
[ -z "$(git status --porcelain)" ] || refuse "the tree is not clean"

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner) || refuse "cannot resolve the GitHub repository"
# The latest check run per name; only the one named all-green from GitHub Actions.
CHECKS=$(gh api "repos/$REPO/commits/$HEAD_SHA/check-runs?check_name=all-green&per_page=100" \
  -q "[.check_runs[] | select(.name == \"all-green\" and .app.id == $GITHUB_ACTIONS_APP_ID)] | .[] | \"\(.status) \(.conclusion) \(.html_url)\"") \
  || refuse "cannot read the check runs on $HEAD_SHA"
N=$(printf '%s\n' "$CHECKS" | grep -c .)
echo "all-green on ${HEAD_SHA:0:7} (GitHub Actions): ${CHECKS:-none}"
[ "$N" = 1 ] || refuse "expected exactly one all-green check run from GitHub Actions on HEAD, found $N"
case "$CHECKS" in "completed success "*) ;; *) refuse "all-green on this commit is not completed/success" ;; esac

# The live AASA: the platform's half of sign-in and the callback. A build
# shipped against a file that stopped naming the app loses sign-in on install.
AASA=$(curl -fsS -m 20 "$AASA_URL") || refuse "cannot read $AASA_URL"
printf '%s' "$AASA" | python3 -c '
import json, sys
want = sys.argv[1]
d = json.load(sys.stdin)
applinks = [x.get("appID") for x in d.get("applinks", {}).get("details", [])]
web = d.get("webcredentials", {}).get("apps", [])
print("live AASA applinks:", applinks)
print("live AASA webcredentials:", web)
sys.exit(0 if want in applinks and want in web else 1)
' "$APP_ID" || refuse "the live AASA at $AASA_URL does not list $APP_ID in both applinks and webcredentials"

# The deployed contract: the platform this build will talk to serves the
# contract its types were generated from — each generated file's sha256 header
# equals the hash the live /health/live reports for its document. `--release`
# reads no escape: a tree platform-requirement.json declares ahead of the
# platform is refused here until that platform is promoted. An unreachable
# host or an answer with no marker refuses too.
node scripts/verify-deployed-contracts.mjs --release \
  || refuse "the committed platform types are not the contract the deployed platform serves"

# --local: the Mac must be able to build. A missing tool refuses before anything
# is built, so a dry run with --local proves the toolchain too.
if [ "$LOCAL" = 1 ]; then
  xcodebuild -version >/dev/null 2>&1 || refuse "--local needs Xcode (xcodebuild)"
  command -v pod >/dev/null 2>&1 || refuse "--local needs CocoaPods (pod)"
  command -v fastlane >/dev/null 2>&1 || refuse "--local needs fastlane (brew install fastlane)"
  echo "local toolchain: $(xcodebuild -version | head -1), CocoaPods $(pod --version), $(fastlane --version 2>/dev/null | grep -oE 'fastlane [0-9.]+' | head -1)"
fi

if [ "$DRY_RUN" = 1 ]; then
  echo "DRY RUN: every gate passed on ${HEAD_SHA:0:7}; stopping before the build."
  exit 0
fi

if [ "$LOCAL" = 0 ]; then
# --- build -------------------------------------------------------------------
echo "=== eas build (full client output in $WORK/build-client.log) ==="
npx eas-cli build --platform ios --profile production --non-interactive --no-wait --json > "$WORK/build-start.json" 2> "$WORK/build-client.log"
echo "capability sync lines:"; sed 's/\x1b\[[0-9;]*[A-Za-z]//g' "$WORK/build-client.log" | grep -i -E "capabilit|sign in with apple|associated domain|push|APPLE_ID_AUTH|ASSOCIATED_DOMAINS|PUSH_NOTIFICATIONS" | head -10
BID=$(python3 -c 'import sys,json; d=json.load(open(sys.argv[1])); d=d[0] if isinstance(d,list) else d; print(d["id"])' "$WORK/build-start.json" 2>/dev/null)
if [ -z "$BID" ]; then echo "NO BUILD ID — client log tail:"; tail -20 "$WORK/build-client.log"; exit 1; fi
echo "build id: $BID"

view() { npx eas-cli build:view "$BID" --json 2>/dev/null; }
# The build must be of HEAD and nothing else; a build of another commit is never
# waited for or submitted.
BUILD_SHA=$(view | python3 -c 'import sys,json; print(json.load(sys.stdin).get("gitCommitHash") or "")')
[ "$BUILD_SHA" = "$HEAD_SHA" ] || refuse "build $BID is of commit '${BUILD_SHA:-unknown}', not HEAD $HEAD_SHA — cancel it: npx eas-cli build:cancel $BID"
echo "build $BID is of HEAD ${HEAD_SHA:0:7}"

st=""
for i in $(seq 1 60); do
  st=$(view | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("status"))')
  echo "$(date -u +%H:%M:%SZ) build $st"
  case "$st" in FINISHED|ERRORED|CANCELED) break;; esac
  sleep 45
done
[ "$st" = "FINISHED" ] || { echo "BUILD DID NOT FINISH: $st"; view | python3 -c 'import sys,json; print(json.load(sys.stdin).get("error"))'; exit 1; }
fi

# --- build on this Mac -----------------------------------------------------------
if [ "$LOCAL" = 1 ]; then
echo "=== eas build --local (full output in $WORK/local-build.log) ==="
rm -rf "$WORK/local" && mkdir -p "$WORK/local" || exit 1
npx eas-cli build --platform ios --profile production --local --non-interactive --output "$WORK/local/app.ipa" > "$WORK/local-build.log" 2>&1 \
  || { echo "LOCAL BUILD FAILED — log tail:"; tail -30 "$WORK/local-build.log"; exit 1; }
[ -s "$WORK/local/app.ipa" ] || refuse "the local build wrote no ipa"
# Still HEAD, still clean: nothing moved under the build.
[ "$(git rev-parse HEAD)" = "$HEAD_SHA" ] || refuse "HEAD moved during the local build"
[ -z "$(git status --porcelain)" ] || refuse "the tree changed during the local build"
echo "built locally from HEAD ${HEAD_SHA:0:7}: $WORK/local/app.ipa"
fi

# --- the ipa's entitlements, before anything is submitted --------------------
echo "=== verify the ipa's entitlements before submitting ==="
rm -rf "$WORK/ipa" && mkdir -p "$WORK/ipa" || exit 1
if [ "$LOCAL" = 1 ]; then
  cp "$WORK/local/app.ipa" "$WORK/ipa/app.ipa" && (cd "$WORK/ipa" && unzip -q -o app.ipa 'Payload/*')
else
  FINISHED=$(view)
  BUILD_SHA=$(printf '%s' "$FINISHED" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("gitCommitHash") or "")')
  [ "$BUILD_SHA" = "$HEAD_SHA" ] || refuse "finished build $BID reports commit '${BUILD_SHA:-unknown}', not HEAD $HEAD_SHA"
  URL=$(printf '%s' "$FINISHED" | python3 -c 'import sys,json; print(json.load(sys.stdin)["artifacts"]["applicationArchiveUrl"])')
  curl -s -L -m 300 -o "$WORK/ipa/app.ipa" "$URL" && (cd "$WORK/ipa" && unzip -q -o app.ipa 'Payload/*')
fi
APP=$(ls -d "$WORK"/ipa/Payload/*.app | head -1)
[ -n "$APP" ] || refuse "no .app in the downloaded archive"
codesign -d --entitlements :- "$APP" 2>/dev/null | python3 -c '
import sys, plistlib
host = sys.argv[1]
d = plistlib.loads(sys.stdin.buffer.read())
for k in sorted(d): print("  ", k, "=", d[k])
ad = d.get("com.apple.developer.associated-domains", []); sia = d.get("com.apple.developer.applesignin")
aps = d.get("aps-environment")
print("  aps-environment is", repr(aps))
ok = (f"webcredentials:{host}" in ad) and (f"applinks:{host}" in ad) and bool(sia) and aps == "production"
print("ENTITLEMENTS_OK" if ok else "ENTITLEMENTS_WRONG")
' "$LINK_HOST" | tee "$WORK/ipa/entitlements.txt"
grep -q ENTITLEMENTS_OK "$WORK/ipa/entitlements.txt" || refuse "entitlements wrong; not submitting"
plutil -extract CFBundleVersion raw "$APP/Info.plist" | sed 's/^/build number: /'

# --- submit ------------------------------------------------------------------
echo "=== submit ==="
if [ "$LOCAL" = 1 ]; then SUBMIT_FROM=(--path "$WORK/ipa/app.ipa"); else SUBMIT_FROM=(--id "$BID"); fi
npx eas-cli submit --platform ios --profile production "${SUBMIT_FROM[@]}" --non-interactive --no-wait 2>&1 | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -v "^\s*$" | tail -6 | tee "$WORK/submit-client.log"
SID=$(grep -o -E "submissions/[0-9a-f-]{36}" "$WORK/submit-client.log" | head -1 | cut -d/ -f2)
echo "submission id: $SID"
[ -n "$SID" ] || exit 1

# Poll the submission with the Expo session, read now and passed only as a header.
TOKEN=$(python3 -c 'import json,os; print(json.load(open(os.path.expanduser("~/.expo/state.json"))).get("auth",{}).get("sessionSecret",""))' 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "no Expo session in ~/.expo/state.json; the submission is scheduled — follow it with: npx eas-cli submit:list --platform ios"
  exit 0
fi
st=""
for i in $(seq 1 80); do
  st=$(curl -s https://api.expo.dev/graphql -H "content-type: application/json" -H "expo-session: $TOKEN" --data "{\"query\":\"{ submissions { byId(submissionId: \\\"$SID\\\") { status error { message errorCode } } } }\"}" | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]["submissions"]["byId"]; print(d["status"], d["error"] or "")')
  echo "$(date -u +%H:%M:%SZ) submission $st"
  case "$st" in FINISHED*|ERRORED*|CANCELED*) break;; esac
  sleep 60
done
echo "DONE: build ${BID:-local} submission $SID -> $st"
