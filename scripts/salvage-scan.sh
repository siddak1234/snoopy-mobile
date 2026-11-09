#!/bin/sh
# ci.yml "No salvaged client data", step for step, for the pre-push gate (scripts/change-class.mjs and .githooks/pre-push).
#
# The identifier pattern is read from ci.yml itself, so this file never names
# the identifiers (the scan would find them here) and the gate and CI can never
# search for different ones.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
if git ls-files | grep -i '_salvage'; then
  echo "FAIL: a _salvage path is tracked in this repository."
  exit 1
fi
pattern=$(sed -n "s/^ *if git grep -Iln -iE '\([^']*\)' -- \. .*/\1/p" .github/workflows/ci.yml)
if [ -z "$pattern" ]; then
  echo "FAIL: the identifier pattern was not found in .github/workflows/ci.yml (the 'No salvaged client data' step)."
  exit 1
fi
if git grep -Iln -iE "$pattern" -- . ':(exclude).github/workflows/*'; then
  echo "FAIL: a real client identifier appears in tracked content."
  exit 1
fi
echo "No salvaged client data: PASS"
