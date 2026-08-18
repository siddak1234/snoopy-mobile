/**
 * Fails when the three transport-and-token rules are broken.
 *
 * All three are exit-gate lines, and all three were checked by hand with
 * `git grep` in every audit so far. That is the same gap `audit:tokens` closed:
 * a rule nothing runs is documentation, and an auditor who forgets one grep
 * reports a pass that was never tested.
 *
 *   1. **One path to the network.** Round 6 uses `openapi-fetch` behind one
 *      schema-typed module. No repository file may call a raw network primitive;
 *      even the facade delegates its request construction to the generated client.
 *   2. **Tokens live in the secure enclave.** ADR-0017 amended invariant 1 to
 *      permit a native client holding its own session tokens *only* in
 *      Keychain/Keystore. `AsyncStorage` is plain, world-readable app storage,
 *      so a single import of it would break the invariant the whole native
 *      session contract rests on.
 *   3. **Nothing logs.** The same invariant says the token is never written to
 *      logs. `console.*` in the transport or the hooks that hold session state
 *      is the one line of code that could do it by accident.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();

const TRANSPORT = "lib/platform/client.ts";
const RUNTIME_ROOTS = ["app", "components", "constants", "hooks", "lib"];

const RULES = [
  {
    name: "raw network primitive",
    roots: RUNTIME_ROOTS,
    pattern: /(?:\bfetch|\.fetch|\[['"]fetch['"]\])\s*\(|\b(?:XMLHttpRequest|WebSocket|EventSource)\s*\(|\baxios\s*(?:\.|\()/,
    allow: () => false,
    detail: `requests must be expressed through the schema-typed clients in ${TRANSPORT}`,
  },
  {
    name: "alternate network library",
    roots: RUNTIME_ROOTS,
    pattern: /from\s+['"](?:axios|expo\/fetch|cross-fetch|node-fetch)['"]|require\s*\(\s*['"](?:axios|expo\/fetch|cross-fetch|node-fetch)['"]\s*\)/,
    allow: () => false,
    detail: `only openapi-fetch in ${TRANSPORT} is an approved runtime transport`,
  },
  {
    name: "openapi-fetch outside the transport",
    roots: RUNTIME_ROOTS,
    pattern: /from\s+['"]openapi-fetch['"]|require\s*\(\s*['"]openapi-fetch['"]\s*\)/,
    allow: (path) => path === TRANSPORT,
    detail: `only ${TRANSPORT} owns generated-client middleware and error mapping`,
  },
  {
    name: "AsyncStorage",
    roots: RUNTIME_ROOTS,
    // Matches an import or a member access, not the word inside a comment
    // explaining that it must never be used.
    pattern: /from\s+['"][^'"]*async-storage['"]|\bAsyncStorage\s*\./,
    allow: () => false,
    detail: "tokens go in expo-secure-store; ADR-0017 permits the enclave and nothing else",
  },
  {
    name: "console",
    roots: RUNTIME_ROOTS,
    pattern: /\bconsole\s*\.\s*[a-z]+\s*\(/,
    allow: () => false,
    detail: "a session token must never reach a log line",
  },
];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a configured root that does not exist yet is not a failure
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extname(full))) out.push(full);
  }
  return out;
}

/** Strip line and block comments so prose about a rule never trips it. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const failures = [];

for (const rule of RULES) {
  for (const dir of rule.roots) {
    for (const file of walk(join(root, dir))) {
      const path = relative(root, file).split("\\").join("/");
      if (rule.allow(path)) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      source.split("\n").forEach((line, index) => {
        if (rule.pattern.test(line)) {
          failures.push(`${path}:${index + 1}: ${rule.name} — ${rule.detail}`);
        }
      });
    }
  }
}

if (failures.length > 0) {
  console.error("Platform audit failed:\n");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  "Platform audit passed. Schema-typed transport only, tokens in the enclave, no runtime logging.",
);
