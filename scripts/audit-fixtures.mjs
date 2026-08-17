/**
 * Fails when a screen starts reading `lib/fixtures` again, or when a file that
 * stopped reading it is not removed from the ledger below.
 *
 * Gate 8's first mobile line is literally "0 imports of `lib/fixtures` outside
 * tests", and until now nothing enforced it — the count was re-derived by hand
 * with `git grep` in each audit, which is the same shape `audit:tokens` and
 * `audit:credentials` existed to fix. A rule checked only when someone
 * remembers to check it is documentation.
 *
 * This is a **ratchet, and it only loosens**: the set below may shrink and may
 * never grow. Wiring a screen to the platform means deleting its row here in
 * the same commit, and the script fails in both directions so the ledger cannot
 * drift from the source — a stale row is as much a failure as a new import.
 *
 * Each remaining row names what blocks it, so the list doubles as the honest
 * answer to "why is this not zero yet". `tests` are exempt by the gate's own
 * wording: `lib/fixtures.ts` is prototype data, and a fixture test may read it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "components", "hooks", "lib"];

/**
 * Files still reading the prototype fixtures, and the named reason each does.
 * Delete a row when its screen is wired; never add one.
 */
const knownFixtureReaders = new Map([
  // MOBILE WORK. Every shape these need is published as of Round 6.6, or the
  // round filed a refusal naming what to render instead. None waits on the
  // backend; each is implementation in this repo.
  ["app/(tabs)/(home)/index.tsx", "wired — unconfigured fallback only"],
  ["app/(tabs)/(home)/run.tsx", "wired — unconfigured fallback only"],
  ["app/(tabs)/(home)/notifications.tsx", "wired — unconfigured fallback only"],
  ["app/(tabs)/activity/index.tsx", "wired — unconfigured fallback only"],
  ["app/(tabs)/activity/approvals.tsx", "wired — unconfigured fallback only"],
  ["app/(tabs)/flows/index.tsx", "wired — unconfigured fallback only"],
  ["app/(tabs)/flows/detail.tsx", "wired — unconfigured fallback only"],
  ["app/(tabs)/flows/builder.tsx", "wired — unconfigured fallback only; flow detail now names the template"],
  ["app/(tabs)/flows/configure.tsx", "wired — unconfigured fallback only"],

  // GENUINELY BLOCKED, and not by anything a backend contract round can fix.
  // BUILD-PLAN 8.3 is "no longer gated on a decision" — §12.1 #46 was ratified
  // 2026-08-17 — but it waits on a payment provider account, which ADR-0016 puts
  // in ROUND 7. So the $99 plan base has no wire source until then, by design.
  ["hooks/use-solutions.tsx", "BLOCKED — PLAN_BASE_PRICE needs BUILD-PLAN 8.3, which waits on Round 7's provider account"],

  // Wired to the platform. The import survives ONLY on the `unconfigured`
  // branch, which is the one state where fixtures are still correct — there is
  // no backend to disagree with. Deleting these is the whole of the change once
  // the browsability question in DESIGN-CONTRACT.md is answered.
  ["app/(tabs)/flows/templates.tsx", "wired — unconfigured fallback only"],
  ["app/(tabs)/settings.tsx", "wired — unconfigured fallback only"],

  // Contract is published, but the screens are not cleanly wireable yet. Both
  // carry array-INDEX identity: `useSolutions` keys `active`/`toggle` by the
  // fixture's position, and setup reads `solutionDefs[index]` from a route
  // param. Wiring the cards to the catalog without an identity refactor would
  // leave the toggle acting on the wrong row — worse than the fixture. The
  // refactor is app-wide (SolutionsProvider is mounted at the root) and cannot
  // remove this import anyway, because PLAN_BASE_PRICE has no wire source.
  ["app/(tabs)/solutions/index.tsx", "wired — unconfigured fallback only"],
  ["app/(tabs)/solutions/setup.tsx", "wired — unconfigured fallback only"],
]);

/** `from '@/lib/fixtures'`, `from '../lib/fixtures'`, and friends. */
const FIXTURE_IMPORT = /from\s+['"][^'"]*lib\/fixtures['"]/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if ([".ts", ".tsx"].includes(extname(full))) out.push(full);
  }
  return out;
}

const found = new Set();

for (const dir of sourceRoots) {
  for (const file of walk(join(root, dir))) {
    const path = relative(root, file).split("\\").join("/");
    if (path === "lib/fixtures.ts") continue; // the module itself, not a reader
    if (FIXTURE_IMPORT.test(readFileSync(file, "utf8"))) found.add(path);
  }
}

const failures = [];

for (const path of found) {
  if (!knownFixtureReaders.has(path)) {
    failures.push(`${path}: new import of lib/fixtures — the exit gate is zero, so this may not grow`);
  }
}
for (const path of knownFixtureReaders.keys()) {
  if (!found.has(path)) {
    failures.push(`${path}: no longer reads fixtures — delete its row from scripts/audit-fixtures.mjs`);
  }
}

if (failures.length > 0) {
  console.error("Fixture audit failed:\n");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  `Fixture audit passed. Files still reading lib/fixtures: ${found.size} (exit gate: 0).`,
);
