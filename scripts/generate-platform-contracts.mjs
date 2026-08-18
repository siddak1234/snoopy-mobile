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
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = resolve(root, "../snoopy-backend");
const generator = join(root, "node_modules/.bin/openapi-typescript");

const contracts = [
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
}
