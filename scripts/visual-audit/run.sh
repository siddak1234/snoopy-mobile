#!/usr/bin/env bash
# The simulator visual audit (round 24 A4): every changed surface, light and dark, default and the largest text size.
#
# README "Verification", "Visual audit". Dev-only: a Debug build whose session and appearance stores Metro swaps for
# scripts/visual-audit/'s fixtures (metro.config.js, VISUAL_AUDIT=1), against the fixture Edge (fixture-edge.mjs).
# Heavy (a native build): run it under the session's gate lock. Everything it starts — the simulators it creates,
# Metro, the fixture Edge, the build and its certificate — it stops and deletes on exit, success or not.
#
#   bash scripts/visual-audit/run.sh                     # screenshots into artifacts/visual-audit/ (gitignored)
#   VISUAL_AUDIT_OUT=/some/dir bash scripts/visual-audit/run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT="${VISUAL_AUDIT_OUT:-$ROOT/artifacts/visual-audit}"
RUNTIME="${VISUAL_AUDIT_RUNTIME:-com.apple.CoreSimulator.SimRuntime.iOS-26-1}"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
EDGE_PORT=8090
FILES_PORT=8443
METRO_PORT=8081
WORK="$(mktemp -d "${TMPDIR:-/tmp}/a8x-visual.XXXXXX")"
INDEX="$ROOT/scripts/visual-audit/fixtures/index.json"
run_id() { node -e "process.stdout.write(require('$INDEX').runs['$1'])"; }
RUNNING="$(run_id running)"; HELD="$(run_id held)"; DONE="$(run_id done)"

CREATED=()          # simulator udids this run created
PIDS=()             # Metro, the fixture Edge
MADE_IOS=0          # whether this run made the ios/ folder
MADE_EXPO=0         # whether this run made the .expo/ folder (expo start)

log() { printf 'visual-audit: %s\n' "$*" >&2; }

# A process and everything under it (npx -> expo -> Metro's workers).
killtree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do killtree "$child"; done
  kill "$1" 2>/dev/null
}

cleanup() {
  local status=$?
  set +e
  trap - EXIT INT TERM HUP ALRM
  for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && killtree "$pid"; done
  for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && wait "$pid" 2>/dev/null; done
  for udid in "${CREATED[@]:-}"; do
    [ -z "$udid" ] && continue
    xcrun simctl shutdown "$udid" >/dev/null 2>&1
    xcrun simctl delete "$udid" >/dev/null 2>&1
  done
  [ "$MADE_IOS" = 1 ] && rm -rf "$ROOT/ios"
  [ "$MADE_EXPO" = 1 ] && rm -rf "$ROOT/.expo"
  rm -rf "$WORK"
  log "cleaned up (exit $status)"
  exit "$status"
}
trap cleanup EXIT INT TERM HUP ALRM

create() { # name, device type id -> NEW_UDID (kept for cleanup; never in a subshell, or cleanup would not see it)
  NEW_UDID="$(xcrun simctl create "$1" "$2" "$RUNTIME")" || return 1
  CREATED+=("$NEW_UDID")
}

mkdir -p "$OUT"
log "work folder $WORK; screenshots into $OUT"

# 1. Simulators: iPhone 17 Pro for every surface; a small and a large phone for a subset.
create a8x-visual-17pro com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro; PRO="$NEW_UDID"
if create a8x-visual-se3 com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation 2>/dev/null; then
  SMALL="$NEW_UDID"; SMALL_NAME=se3
else
  log "iPhone SE (3rd generation) does not take $RUNTIME: iPhone 16e instead"
  create a8x-visual-16e com.apple.CoreSimulator.SimDeviceType.iPhone-16e; SMALL="$NEW_UDID"; SMALL_NAME=16e
fi
create a8x-visual-17promax com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max; MAX="$NEW_UDID"
for udid in "$PRO" "$SMALL" "$MAX"; do xcrun simctl boot "$udid"; done
for udid in "$PRO" "$SMALL" "$MAX"; do xcrun simctl bootstatus "$udid" -b >/dev/null; done

# 2. A throwaway certificate for the fixture Edge's https files, trusted by these simulators only.
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
  -keyout "$WORK/files.key" -out "$WORK/files.crt" >/dev/null 2>&1
for udid in "$PRO" "$SMALL" "$MAX"; do xcrun simctl keychain "$udid" add-root-cert "$WORK/files.crt"; done

# 3. The fixture Edge.
EDGE_PORT=$EDGE_PORT FILES_PORT=$FILES_PORT FILES_CERT="$WORK/files.crt" FILES_KEY="$WORK/files.key" \
  node "$ROOT/scripts/visual-audit/fixture-edge.mjs" >"$WORK/edge.log" 2>&1 &
PIDS+=("$!")

# 4. One Debug build, its JavaScript from Metro, the Edge the fixture's.
export VISUAL_AUDIT=1 EXPO_PUBLIC_BACKEND_API_ORIGIN="http://localhost:$EDGE_PORT" CI=1 RCT_METRO_PORT=$METRO_PORT
[ -d "$ROOT/ios" ] || MADE_IOS=1
npx expo prebuild --platform ios --no-install >"$WORK/prebuild.log" 2>&1
(cd "$ROOT/ios" && pod install >"$WORK/pods.log" 2>&1)
WORKSPACE="$(ls -d "$ROOT"/ios/*.xcworkspace | head -1)"
SCHEME="$(basename "$WORKSPACE" .xcworkspace)"
log "building $SCHEME (Debug, simulator)"
xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Debug -sdk iphonesimulator \
  -destination "id=$PRO" -derivedDataPath "$WORK/build" CODE_SIGNING_ALLOWED=NO build >"$WORK/build.log" 2>&1 \
  || { tail -40 "$WORK/build.log" >&2; exit 1; }
APP="$(ls -d "$WORK"/build/Build/Products/Debug-iphonesimulator/*.app | head -1)"
for udid in "$PRO" "$SMALL" "$MAX"; do xcrun simctl install "$udid" "$APP"; done

# 5. Metro.
[ -d "$ROOT/.expo" ] || MADE_EXPO=1
npx expo start --port $METRO_PORT --localhost >"$WORK/metro.log" 2>&1 &
PIDS+=("$!")
for _ in $(seq 1 120); do
  curl -fsS "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q running && break
  sleep 1
done

# 6. Each device, appearance and text size.
shoot() { # udid, name, subset
  local udid=$1 name=$2 subset=$3 theme size
  mkdir -p "$OUT/$name"
  xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
  for theme in dark light; do
    for size in default largest; do
      xcrun simctl ui "$udid" appearance "$theme"
      xcrun simctl ui "$udid" content_size "$([ "$size" = largest ] && echo accessibility-extra-extra-extra-large || echo large)"
      log "$name $theme $size"
      # Maestro writes screenshots only inside its own output folder; they are moved out after.
      local shots="$WORK/shots-$name-$theme-$size"
      "$MAESTRO" --device "$udid" test --test-output-dir "$shots" \
        -e MODE="$theme--$size" -e SUBSET="$subset" \
        -e RUNNING="$RUNNING" -e HELD="$HELD" -e DONE="$DONE" \
        "$ROOT/.maestro/visual-audit/surfaces.yaml" >"$WORK/maestro-$name-$theme-$size.log" 2>&1 \
        || { log "maestro failed: $name $theme $size"; tail -30 "$WORK/maestro-$name-$theme-$size.log" >&2; }
      find "$shots" -name '[0-9][0-9]-*--*--*.png' -exec mv {} "$OUT/$name/" \; 2>/dev/null || true
    done
  done
  # The tab bar's lens, recorded: dark, default size.
  xcrun simctl ui "$udid" appearance dark
  xcrun simctl ui "$udid" content_size large
  xcrun simctl io "$udid" recordVideo --codec h264 --force "$OUT/$name/00-tab-bar-lens--dark--default.mov" >/dev/null 2>&1 &
  local video=$!
  sleep 2
  "$MAESTRO" --device "$udid" test "$ROOT/.maestro/visual-audit/tabs.yaml" >"$WORK/maestro-$name-tabs.log" 2>&1 \
    || log "maestro failed: $name tabs"
  kill -INT "$video" 2>/dev/null; wait "$video" 2>/dev/null || true
}
shoot "$PRO" 17pro 0
shoot "$SMALL" "$SMALL_NAME" 1
shoot "$MAX" 17promax 1

grep -h 'unrouted' "$WORK/edge.log" | sort | uniq -c >&2 || true
log "done: $(find "$OUT" -name '*.png' | wc -l | tr -d ' ') screenshots, $(find "$OUT" -name '*.mov' | wc -l | tr -d ' ') videos in $OUT"
