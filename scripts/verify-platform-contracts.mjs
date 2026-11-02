/**
 * Fails when the committed platform types no longer match the backend contracts.
 *
 * Regenerating in CI is what stops a screen from being written against a shape
 * the Edge stopped serving. The generated output is committed so the app builds
 * without the backend checkout present; this check proves the commit is current:
 * each file's header hash must equal the sha256 of its source document, and a
 * regeneration must reproduce the file byte for byte. The block fixtures
 * (`block-fixtures.ts`, backend ADR-0048 decision 9) are held the same way: their
 * header's sha256 over the fixtures' bytes, then the regeneration; and so are
 * the block rules (`block-rules.ts`, ADR-0048 amendment 1: the words, the
 * spacing table and the search and sort cases). The block check's required
 * fields (`block-required.ts`, round 21) are read from automations.yaml, so its
 * header's hash is that document's, then the regeneration.
 *
 * It never skips (M1). The contract is read from SNOOPY_BACKEND_ROOT, else the
 * sibling `../snoopy-backend` when present, else the committed copy at
 * `lib/generated/snoopy-backend/` (scripts/generate-platform-contracts.mjs
 * resolveBackend), and the copy is checked first, every run: SHA256SUMS names
 * exactly its files at their hashes. From a real backend, the regeneration
 * below rewrites the copy too, so a copy that is not that backend's bytes is
 * stale and fails. No contract anywhere, or a named root that is absent, fails.
 */
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  COPY_SUMS,
  HEADER,
  backendFrom,
  backendRoot,
  checkCopy,
  copyPaths,
  copyRoot,
  blockFixtures,
  blockRequired,
  blockRules,
  contracts,
  readBlockFixtures,
  readBlockRules,
  sha256,
} from "./generate-platform-contracts.mjs";
import { recordContractCheck } from "./repo-facts.mjs";

const root = resolve(import.meta.dirname, "..");

console.log(`Contract read from ${backendFrom}: ${relative(root, backendRoot) || "."}`);

// The copy, whatever the contract is read from: a hand edit fails here.
const copyProblems = checkCopy();
if (copyProblems.length > 0) {
  throw new Error(
    `The committed contract copy (${relative(root, copyRoot)}) is not intact: ${copyProblems.join("; ")}; run npm run generate:platform-contracts and commit the output`,
  );
}

for (const { output } of [...contracts, blockFixtures, blockRules, blockRequired]) {
  if (!existsSync(output)) {
    throw new Error(
      "Generated platform types are missing; run npm run generate:platform-contracts and commit the output",
    );
  }
}

// The header hashes first: a stale file is named with both hashes, which a
// byte comparison alone cannot say.
for (const { input, output } of [...contracts, blockRequired]) {
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

// The block fixtures' and the block rules' headers: one sha256 over each
// folder's bytes, in filename order.
for (const [{ input, output }, read, what] of [
  [blockFixtures, readBlockFixtures, "block fixtures"],
  [blockRules, readBlockRules, "block rules"],
]) {
  if (!existsSync(input)) {
    throw new Error(`Required ${what} are unavailable: ${input}`);
  }
  const header = HEADER.exec(readFileSync(output, "utf8"));
  const file = relative(root, output);
  const expected = read().sha256;
  if (!header || header[2] !== expected) {
    throw new Error(
      `${file} was not generated from the ${what} at sha256 ${expected}; run npm run generate:platform-contracts and commit the output`,
    );
  }
}

// The regeneration also rewrites the copy from a real backend, so the copy's
// files and SHA256SUMS are compared as well, by name and by bytes.
const copied = () => [...copyPaths(copyRoot), COPY_SUMS].map((path) => join(copyRoot, path));
const copiedBefore = copied();
const outputs = [...contracts.map(({ output }) => output), blockFixtures.output, blockRules.output, blockRequired.output, ...copiedBefore];
const before = outputs.map((output) => readFileSync(output));
execFileSync(process.execPath, ["scripts/generate-platform-contracts.mjs"], {
  cwd: root,
  stdio: "inherit",
});
const after = outputs.map((output) => (existsSync(output) ? readFileSync(output) : Buffer.alloc(0)));
const copiedAfter = copied();

if (
  before.some((content, index) => !content.equals(after[index])) ||
  copiedAfter.join("\n") !== copiedBefore.join("\n")
) {
  throw new Error(
    "Generated platform types were stale; commit the output from npm run generate:platform-contracts",
  );
}

recordContractCheck({ skipped: false });
console.log("Generated platform types are current.");
