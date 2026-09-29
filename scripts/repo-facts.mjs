// What this repository reports about itself, in the shape snoopy-backend's
// docs/repo-facts.schema.json declares, so that repository can quote the mobile
// app's counts without reading its files (BUILD-PLAN 24.3.7 — 17.2.4's mobile
// part; backend §12.2 #68). Every count carries the command that produced it: a
// number without its command is the thing that drifted. Ported from `snoopy`'s
// scripts/repo-facts.mjs.
//
// Emitted by `npm run verify` and NEVER committed here — it would restate this
// repository's own HEAD, which is stale the moment it is written. The round's
// close commits the emitted file into snoopy-backend as
// docs/repo-facts/snoopy-mobile.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
/** Where `npm run verify` writes the file; gitignored. */
export const FACTS_PATH = ".autom8x/repo-facts/snoopy-mobile.json";

// SYSTEM-MANIFEST §10's units, in its order, on ONE basis: the working tree
// minus what .gitignore excludes — tracked and untracked alike, never
// node_modules, dist or an iCloud conflict copy the ignore rules exclude.
const BASIS = "git ls-files --cached --others --exclude-standard -- ";
const COUNTS = [
  ["screenFiles", `${BASIS}':(glob)app/**/*.tsx' | wc -l`],
  ["components", `${BASIS}':(glob)components/**/*.tsx' | wc -l`],
  ["hooks", `${BASIS}hooks | wc -l`],
  ["fixtureModules", `${BASIS}':(glob)lib/fixtures.*' | wc -l`],
  ["testFiles", `${BASIS}':(glob)**/*.test.*' | wc -l`],
];

// `pipefail`, so a producer that fails cannot hide behind `wc`'s exit 0 and be
// recorded as a verified count of zero.
function sh(command) {
  return execFileSync("bash", ["-c", `set -o pipefail; ${command}`], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function count(unit, command) {
  const out = sh(command);
  const value = Number(out);
  if (out === "" || !Number.isInteger(value) || value < 0) {
    throw new Error(`repo-facts: ${unit} produced "${out}", not a count`);
  }
  return value;
}

export function repoFacts({ gate } = {}) {
  const counts = {};
  for (const [unit, command] of COUNTS) {
    counts[unit] = { value: count(unit, command), command };
  }
  return {
    schemaVersion: 1,
    repository: "snoopy-mobile",
    head: sh("git rev-parse --short HEAD"),
    readAt: new Date().toISOString().slice(0, 10),
    ...(gate ? { gate } : {}),
    counts,
  };
}

export function writeRepoFacts(outPath, options) {
  const facts = repoFacts(options);
  if (sh("git status --porcelain")) {
    console.warn(
      "repo-facts: the tree is dirty — counts are from the working tree while `head` is the last commit; the close copies only a clean-main emission",
    );
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(facts, null, 2)}\n`);
  return facts;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const flag = (name) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const facts = writeRepoFacts(resolve(root, flag("--out") ?? FACTS_PATH), { gate: flag("--gate") });
  console.log(JSON.stringify(facts, null, 2));
}
