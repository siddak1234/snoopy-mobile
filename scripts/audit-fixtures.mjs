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
  // Blocked on the public contract — no published shape supplies these.
  ["app/(tabs)/(home)/index.tsx", "no homeStats source; no run summary or run number"],
  ["app/(tabs)/(home)/run.tsx", "no run number, confidence, or run output; steps need manifest.pipeline"],
  ["app/(tabs)/(home)/notifications.tsx", "no notifications route exists at any shape"],
  ["app/(tabs)/activity/index.tsx", "no run number and no run result summary"],
  ["app/(tabs)/activity/approvals.tsx", "Approval publishes `reason` but no title"],
  ["app/(tabs)/flows/index.tsx", "no run aggregates (runs/ok/failed per subscription)"],
  ["app/(tabs)/flows/detail.tsx", "no run aggregates; steps need manifest.pipeline"],
  ["app/(tabs)/flows/builder.tsx", "manifest.pipeline is published nowhere — BUILD-PLAN 8.7"],
  ["app/(tabs)/flows/configure.tsx", "manifest.pipeline; no usedByTeams"],
  ["hooks/use-workflows.tsx", "workflow status overrides ride on the fixture flow keys"],
  ["hooks/use-solutions.tsx", "PLAN_BASE_PRICE is billing — §12.1 #46 / BUILD-PLAN 8.3"],

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
  ["app/(tabs)/solutions/index.tsx", "catalog OK; use-solutions is index-keyed + PLAN_BASE_PRICE is billing"],
  ["app/(tabs)/solutions/setup.tsx", "same index identity, plus DESIGN-GAPS item 3 (content is QuickBooks-specific for every solution)"],
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
