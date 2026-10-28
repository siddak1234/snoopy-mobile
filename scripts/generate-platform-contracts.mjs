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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The YAML reader openapi-typescript itself reads the contracts with (its
// dependency, pinned through it in package-lock.json), so the required fields
// below come from the same parse as the types.
import { parseYaml } from "@redocly/openapi-core";

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

/**
 * The block fixtures (backend ADR-0048 decision 9): every page body both
 * clients must draw to exactly its `text`, committed as one file so the tests
 * run in public CI. Headed, as the contracts are, by one sha256 — over the
 * fixtures' bytes, each file in filename order: the rule both clients share,
 * so the app's header equals the website's when both assert the same fixtures.
 */
export const blockFixtures = {
  input: join(backendRoot, "packages/contracts/fixtures/blocks"),
  output: join(root, "lib/generated/platform-contracts/block-fixtures.ts"),
};

/** The fixture files in filename order, and the one sha256 over their bytes. */
export function readBlockFixtures() {
  const names = readdirSync(blockFixtures.input)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const hash = createHash("sha256");
  const fixtures = names.map((name) => {
    const bytes = readFileSync(join(blockFixtures.input, name));
    hash.update(bytes);
    return JSON.parse(bytes.toString("utf8"));
  });
  return { fixtures, sha256: hash.digest("hex") };
}

function writeBlockFixtures() {
  if (!existsSync(blockFixtures.input)) {
    throw new Error(`Required block fixtures are unavailable: ${blockFixtures.input}`);
  }
  const { fixtures, sha256: hash } = readBlockFixtures();
  writeFileSync(
    blockFixtures.output,
    `// From snoopy-backend ${relative(backendRoot, blockFixtures.input)}/*.json, sha256 ${hash}.\n` +
      "// Regenerate with `npm run generate:platform-contracts`; never edit by hand.\n" +
      "/** A page body and its visible words in reading order, closed sections left out. */\n" +
      "export type BlockFixture = {\n  name: string;\n  about: string;\n  blockSetVersion: number;\n  blocks: readonly unknown[];\n  text: readonly string[];\n};\n\n" +
      `export const BLOCK_FIXTURES: readonly BlockFixture[] = ${JSON.stringify(fixtures, null, 2)};\n`,
  );
}

/**
 * The block rules (backend ADR-0048 amendment 1, points 8, 14 and 17): the
 * words of search, sort and pages (`BLOCK_WORDS`), the spacing table
 * (`BLOCK_SPACING`, the owner's Q8), the list rules, and the search and sort
 * cases both clients' tests run. Copied from `fixtures/block-rules/` into
 * `block-rules.ts`, headed by one sha256 over the files' bytes in filename
 * order, as the block fixtures are. A file this generator does not know stops
 * it: a new rule is drawn here first, never dropped.
 */
export const blockRules = {
  input: join(backendRoot, "packages/contracts/fixtures/block-rules"),
  output: join(root, "lib/generated/platform-contracts/block-rules.ts"),
};

const BLOCK_RULE_FILES = ["search.json", "sort.json", "spacing.json", "words.json"];

/** The rule files by name, and the one sha256 over their bytes in filename order. */
export function readBlockRules() {
  const names = readdirSync(blockRules.input)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const unknown = names.filter((name) => !BLOCK_RULE_FILES.includes(name));
  const missing = BLOCK_RULE_FILES.filter((name) => !names.includes(name));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      `The block rules changed shape (unknown: ${unknown.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}); draw them in scripts/generate-platform-contracts.mjs first`,
    );
  }
  const hash = createHash("sha256");
  const rules = Object.fromEntries(
    names.map((name) => {
      const bytes = readFileSync(join(blockRules.input, name));
      hash.update(bytes);
      return [name, JSON.parse(bytes.toString("utf8"))];
    }),
  );
  return { rules, sha256: hash.digest("hex") };
}

function writeBlockRules() {
  if (!existsSync(blockRules.input)) {
    throw new Error(`Required block rules are unavailable: ${blockRules.input}`);
  }
  const { rules, sha256: hash } = readBlockRules();
  const search = rules["search.json"];
  const json = (value) => JSON.stringify(value, null, 2);
  writeFileSync(
    blockRules.output,
    `// From snoopy-backend ${relative(backendRoot, blockRules.input)}/*.json, sha256 ${hash}.\n` +
      "// Regenerate with `npm run generate:platform-contracts`; never edit by hand.\n\n" +
      "/** The words of search, sort and pages (owner-words.md rows 1-16); `{…}` is filled in. */\n" +
      `export const BLOCK_WORDS = ${json(rules["words.json"].blockWords)} as const;\n\n` +
      "/** The spacing table (the owner's Q8): names, read as points in the app. */\n" +
      `export const BLOCK_SPACING = ${json(rules["spacing.json"].blockSpacing)} as const;\n\n` +
      "/** A list or table is long above `pageSize`; a query is at most `queryLength` characters. */\n" +
      `export const BLOCK_LIST_RULES = ${json({ pageSize: search.pageSize, queryLength: search.queryLength })} as const;\n\n` +
      "/** The search cases: a query, the rows' fields, and the rows it matches. */\n" +
      "export type BlockSearchCase = { name: string; query: string; rows: readonly (readonly string[])[]; matches: readonly number[] };\n\n" +
      `export const BLOCK_SEARCH_CASES: readonly BlockSearchCase[] = ${json(search.cases)};\n\n` +
      "/** The sort cases: a list's rows or a table's cells, its choices, one choice and the order it gives. */\n" +
      "export type BlockSortCase = {\n  name: string;\n  kind: 'list' | 'table';\n  columns?: readonly (string | null)[];\n  rows: readonly ({ title: string; value?: string; valueLabel?: string } | readonly string[])[];\n  choices: readonly string[];\n  choice: string;\n  order: readonly number[];\n};\n\n" +
      `export const BLOCK_SORT_CASES: readonly BlockSortCase[] = ${json(rules["sort.json"].cases)};\n`,
  );
}

/**
 * The block check (round 21, design D2.6): each block type's required fields
 * (but `type`) with their basic type, and each required array's items' own,
 * read from the `Block` schema in automations.yaml — the table's
 * `required: [type, columns, rows]` becomes `table: { columns, rows }`.
 * `components/blocks/drawable.ts` reads it before a renderer runs, so a known
 * type with a missing field draws `Fallback` instead of throwing. A section's
 * own `blocks` are not followed: each is checked when it is drawn. A required
 * field of a shape this generator does not read stops it, as the block rules
 * do: a new shape is drawn here first, never dropped.
 */
export const blockRequired = {
  input: join(backendRoot, "docs/openapi/automations.yaml"),
  output: join(root, "lib/generated/platform-contracts/block-required.ts"),
};

const BASIC_TYPES = ["string", "number", "boolean", "object", "array"];

export function readBlockRequired() {
  const schemas = parseYaml(readFileSync(blockRequired.input, "utf8")).components.schemas;
  const BLOCK_REF = "#/components/schemas/Block";
  const follow = (schema, where) => {
    let at = schema;
    while (at && typeof at.$ref === "string") {
      at = schemas[at.$ref.replace("#/components/schemas/", "")];
    }
    if (!at || typeof at !== "object") throw new Error(`${where}: no schema in automations.yaml`);
    return at;
  };
  const basic = (schema, where) => {
    if ("const" in schema) return typeof schema.const;
    const type = schema.type === "integer" ? "number" : schema.type;
    if (BASIC_TYPES.includes(type)) return type;
    throw new Error(
      `${where}: a required field of a shape this generator does not read; draw it in scripts/generate-platform-contracts.mjs first`,
    );
  };
  const fields = (schema, where, top) => {
    const rules = {};
    for (const name of schema.required ?? []) {
      if (top && name === "type") continue;
      const field = follow(schema.properties?.[name], `${where}.${name}`);
      const rule = { type: basic(field, `${where}.${name}`) };
      if (rule.type === "array" && field.items && field.items.$ref !== BLOCK_REF) {
        const item = follow(field.items, `${where}.${name}[]`);
        if (item.type === "object") rule.items = fields(item, `${where}.${name}[]`, false);
      }
      rules[name] = rule;
    }
    return rules;
  };
  return Object.fromEntries(
    schemas.Block.oneOf.map((variant) => {
      const type = variant.properties?.type?.const;
      if (typeof type !== "string") throw new Error("Block: a variant without a `type` const");
      return [type, fields(variant, type, true)];
    }),
  );
}

function writeBlockRequired() {
  if (!existsSync(blockRequired.input)) {
    throw new Error(`Required platform contract is unavailable: ${blockRequired.input}`);
  }
  writeFileSync(
    blockRequired.output,
    `// From snoopy-backend ${relative(backendRoot, blockRequired.input)}, sha256 ${sha256(blockRequired.input)}.\n` +
      "// Regenerate with `npm run generate:platform-contracts`; never edit by hand.\n\n" +
      "/** A required field's basic type and, for an array of objects, its items' required fields. */\n" +
      "export type BlockFieldRule = {\n  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';\n  readonly items?: BlockFieldRules;\n};\n" +
      "export type BlockFieldRules = { readonly [field: string]: BlockFieldRule };\n\n" +
      "/** Each block type's required fields but `type`, from the contract's `Block` schema (the check before drawing). */\n" +
      `export const BLOCK_REQUIRED: { readonly [type: string]: BlockFieldRules } = ${JSON.stringify(readBlockRequired(), null, 2)};\n`,
  );
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
  writeBlockFixtures();
  writeBlockRules();
  writeBlockRequired();
}
