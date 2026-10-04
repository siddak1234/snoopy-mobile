/**
 * Generates TypeScript types from the backend's published OpenAPI contracts.
 *
 * The mobile client consumes generated types and never hand-writes a request or
 * response shape (CLAUDE.md rule 5). `snoopy` generates the same three documents
 * with the same tool and version, so both clients track one contract.
 *
 * Only the public Edge surfaces are generated. `access.yaml`, `artifacts.yaml`,
 * and `entitlements.openapi.yaml` describe `/internal/v1` service APIs and
 * self-describe as unreachable from a client — generating them would invite a
 * call that the Edge does not expose.
 *
 * The three documents are emitted separately on purpose: the root document and
 * the two fragments reuse nine operationIds for the same paths, so merging them
 * would collide.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// SNOOPY_BACKEND_ROOT points at another checkout of the platform — a worktree
// at the deployed commit, say — and scripts/verify-platform-contracts.mjs reads
// the same variable, resolved from the repository root as here, so both agree.
// Empty means unset: the sibling checkout, as `snoopy` does.
export const backendRoot = resolve(
  root,
  process.env.SNOOPY_BACKEND_ROOT || "../snoopy-backend",
);
const generator = join(root, "node_modules/.bin/openapi-typescript");

export const contracts = [
  {
    input: join(backendRoot, "docs/openapi.yaml"),
    output: join(root, "lib/generated/platform-contracts/platform.d.ts"),
  },
  {
    input: join(backendRoot, "docs/openapi/automations.yaml"),
    output: join(root, "lib/generated/platform-contracts/automations.d.ts"),
  },
  {
    input: join(backendRoot, "docs/openapi/connections.yaml"),
    output: join(root, "lib/generated/platform-contracts/connections.d.ts"),
  },
];

/** The first line of every generated file: which contract bytes it came from. */
export const HEADER = /^\/\/ From snoopy-backend (\S+), sha256 ([0-9a-f]{64})\.$/mu;

export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  if (!existsSync(generator)) {
    throw new Error(
      "openapi-typescript is not installed; run npm install before generating contracts",
    );
  }

  for (const { input, output } of contracts) {
    if (!existsSync(input)) {
      throw new Error(`Required platform contract is unavailable: ${input}`);
    }
    mkdirSync(dirname(output), { recursive: true });
    execFileSync(generator, [input, "--output", output], {
      cwd: root,
      stdio: "inherit",
    });
    // Each file names the contract it came from by the hash of that contract's
    // bytes, as `snoopy` writes it, so which version of the platform's contract
    // the app was built against is read from the file — and compared with the
    // deployed platform's — not recorded by hand beside it.
    writeFileSync(
      output,
      `// From snoopy-backend ${relative(backendRoot, input)}, sha256 ${sha256(input)}.\n` +
        "// Regenerate with `npm run generate:platform-contracts`; never edit by hand.\n" +
        readFileSync(output, "utf8"),
    );
  }
}
