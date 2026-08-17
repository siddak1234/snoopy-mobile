/**
 * Fails when the committed platform types no longer match the backend contracts.
 *
 * Regenerating in CI is what stops a screen from being written against a shape
 * the Edge stopped serving. The generated output is committed so the app builds
 * without the backend checkout present; this check proves the commit is current.
 *
 * Skips when `../snoopy-backend` is absent, matching `snoopy`: the private repo
 * is not available to every checkout, and an unavailable contract is not a
 * failing one.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = resolve(root, "../snoopy-backend");

if (!existsSync(backendRoot)) {
  console.log(
    "snoopy-backend is not checked out beside this repository; skipping contract verification.",
  );
  process.exit(0);
}

const outputs = [
  join(root, "lib/generated/platform-contracts/platform.d.ts"),
  join(root, "lib/generated/platform-contracts/automations.d.ts"),
  join(root, "lib/generated/platform-contracts/connections.d.ts"),
];

for (const output of outputs) {
  if (!existsSync(output)) {
    throw new Error(
      "Generated platform types are missing; run npm run generate:platform-contracts and commit the output",
    );
  }
}

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

console.log("Generated platform types are current.");
