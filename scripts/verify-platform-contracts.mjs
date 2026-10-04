/**
 * Fails when the committed platform types no longer match the backend contracts.
 *
 * Regenerating in CI is what stops a screen from being written against a shape
 * the Edge stopped serving. The generated output is committed so the app builds
 * without the backend checkout present; this check proves the commit is current:
 * each file's header hash must equal the sha256 of its source document, and a
 * regeneration must reproduce the file byte for byte.
 *
 * Skips, with exit 0, when the backend checkout (`SNOOPY_BACKEND_ROOT`, default
 * `../snoopy-backend`) is absent, matching `snoopy`: the private repo is not
 * available to every checkout, and an unavailable contract is not a failing one.
 * The skip is RECORDED beside the facts file, so `scripts/repo-facts.mjs` emits
 * no facts claiming gate `verify` for a run whose contract check did not run.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import {
  HEADER,
  backendRoot,
  contracts,
  sha256,
} from "./generate-platform-contracts.mjs";
import { recordContractCheck } from "./repo-facts.mjs";

const root = resolve(import.meta.dirname, "..");

if (!existsSync(backendRoot)) {
  const reason = `snoopy-backend is not checked out at ${backendRoot} (SNOOPY_BACKEND_ROOT, default ../snoopy-backend); skipping contract verification.`;
  recordContractCheck({ skipped: true, reason });
  console.log(`${reason} The skip is recorded; no facts will be emitted for this run.`);
  process.exit(0);
}

for (const { output } of contracts) {
  if (!existsSync(output)) {
    throw new Error(
      "Generated platform types are missing; run npm run generate:platform-contracts and commit the output",
    );
  }
}

// The header hashes first: a stale file is named with both hashes, which a
// byte comparison alone cannot say.
for (const { input, output } of contracts) {
  if (!existsSync(input)) {
    throw new Error(`Required platform contract is unavailable: ${input}`);
  }
  const header = HEADER.exec(readFileSync(output, "utf8"));
  const file = relative(root, output);
  if (!header) {
    throw new Error(`${file} carries no source hash header; run npm run generate:platform-contracts and commit the output`);
  }
  const expected = sha256(input);
  if (header[2] !== expected) {
    throw new Error(
      `${file} was generated from ${header[1]} at sha256 ${header[2]}, but that document is now ${expected}; run npm run generate:platform-contracts and commit the output`,
    );
  }
}

const outputs = contracts.map(({ output }) => output);
const before = outputs.map((output) => readFileSync(output));
execFileSync(process.execPath, ["scripts/generate-platform-contracts.mjs"], {
  cwd: root,
  stdio: "inherit",
});
const after = outputs.map((output) => readFileSync(output));

if (before.some((content, index) => !content.equals(after[index]))) {
  throw new Error(
    "Generated platform types were stale; commit the output from npm run generate:platform-contracts",
  );
}

recordContractCheck({ skipped: false });
console.log("Generated platform types are current.");
