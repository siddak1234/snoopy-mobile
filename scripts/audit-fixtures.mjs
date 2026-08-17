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
  // EMPTY, and that is the exit gate met. Every screen reads the platform; the
  // prototype fallbacks went with the owner's 2026-08-17 decision, and the last
  // entry — `PLAN_BASE_PRICE` in hooks/use-solutions.tsx — went when the backend
  // answered finding 8 on the same day: there is no plan to price. No local
  // constant replaced it, because the number is not this client's to state.
  //
  // A row may only be added with a reason in review. The gate is zero.
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
