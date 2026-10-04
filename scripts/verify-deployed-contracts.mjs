/**
 * Are this repository's generated platform types the contract the RUNNING
 * platform serves? (CI plan Wave 1, the client contract job's second half.)
 *
 * Each file in lib/generated/platform-contracts/ begins
 * "// From snoopy-backend <document>, sha256 <hex>." — the sha256 of the bytes
 * of the OpenAPI document it was generated from. The platform's public
 * GET https://api.autom8x.ai/health/live reports, since its deployed marker,
 * `commit` and `contracts`: the same sha256 of each public document at the
 * commit it runs (snoopy-backend scripts/contract-hashes.mjs, keyed
 * openapi.yaml, automations.yaml, connections.yaml). Equal hashes are equal
 * bytes, so this compares strings and parses no OpenAPI.
 *
 *   node scripts/verify-deployed-contracts.mjs            CI's contract-deployed job
 *   node scripts/verify-deployed-contracts.mjs --release  a release: no escape
 *
 * Exit 0 only when every document's committed hash equals the deployed one.
 * Exit 1 otherwise, and it FAILS CLOSED: a host that cannot be read after four
 * attempts (one and three retries, 2, 4 and 8 s apart), and an answer with no
 * `contracts` (a platform from before the marker, or an image built without
 * it), fail exactly as a mismatch does. An unread contract is not a matching
 * one, and nothing here skips.
 *
 * platform-requirement.json, at the repository root, is the one escape,
 * committed and reviewed with the change that needs it:
 *
 *   {"aheadOfDeployed": false}
 *
 * `true` declares a client change that must land BEFORE the platform change it
 * was generated from is promoted. A mismatch then passes, loudly, naming each
 * document and both hashes; an unreadable host or a missing marker still fail.
 * It cannot outlive its change: once the deployed contract equals the
 * committed one, `true` FAILS until it is set back to `false`. `--release`
 * ignores it — what ships must match what runs — so the app's release refuses
 * an ahead tree until the platform it needs is promoted. (Where a merge is the
 * release — the website — the post-deploy probe compares production with the
 * platform with no escape either.)
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIVE_URL = "https://api.autom8x.ai/health/live";
export const REQUIREMENT_FILE = "platform-requirement.json";

/**
 * Each document as /health/live keys it → the platform path its generated file
 * names in its header, and that file. The keys are snoopy-backend's
 * CONTRACT_DOCUMENTS.
 */
export const DOCUMENTS = Object.freeze({
  "openapi.yaml": {
    source: "docs/openapi.yaml",
    file: "lib/generated/platform-contracts/platform.d.ts",
  },
  "automations.yaml": {
    source: "docs/openapi/automations.yaml",
    file: "lib/generated/platform-contracts/automations.d.ts",
  },
  "connections.yaml": {
    source: "docs/openapi/connections.yaml",
    file: "lib/generated/platform-contracts/connections.d.ts",
  },
});

const HEADER = /^\/\/ From snoopy-backend (\S+), sha256 ([0-9a-f]{64})\.$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

/** The hash each generated file's first line names. Throws naming the file. */
export function committedHashes(root) {
  return Object.fromEntries(
    Object.entries(DOCUMENTS).map(([document, { source, file }]) => {
      const path = join(root, file);
      if (!existsSync(path)) throw new Error(`${file} is missing`);
      const header = HEADER.exec(readFileSync(path, "utf8").split("\n")[0]);
      if (!header) {
        throw new Error(`${file} carries no "// From snoopy-backend" header`);
      }
      if (header[1] !== source) {
        throw new Error(`${file} names ${header[1]}, not ${source}`);
      }
      return [document, header[2]];
    }),
  );
}

/** platform-requirement.json, exactly {"aheadOfDeployed": <boolean>}. Throws otherwise. */
export function readRequirement(root) {
  const path = join(root, REQUIREMENT_FILE);
  if (!existsSync(path)) throw new Error(`${REQUIREMENT_FILE} is missing`);
  let requirement;
  try {
    requirement = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${REQUIREMENT_FILE} is not JSON: ${error.message}`);
  }
  const keys =
    requirement && typeof requirement === "object"
      ? Object.keys(requirement)
      : [];
  if (
    keys.length !== 1 ||
    keys[0] !== "aheadOfDeployed" ||
    typeof requirement.aheadOfDeployed !== "boolean"
  ) {
    throw new Error(
      `${REQUIREMENT_FILE} must be exactly {"aheadOfDeployed": false} or {"aheadOfDeployed": true}`,
    );
  }
  return requirement;
}

/**
 * GET /health/live: `{ body }` from the first 2xx JSON answer, or `{ error }`
 * after `attempts` tries. A refused connection, a timeout, a non-2xx status and
 * a body that is not JSON are each retried; an answer that IS JSON is returned
 * as it is, for judge() to read.
 */
export async function readLive(
  url,
  {
    attempts = 4,
    delays = [2000, 4000, 8000],
    timeoutMs = 10000,
    fetch: get = globalThis.fetch,
    log = () => {},
  } = {},
) {
  let error = "never tried";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await get(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      try {
        return { body: JSON.parse(text) };
      } catch {
        throw new Error("the answer is not JSON");
      }
    } catch (failure) {
      error = failure?.message ?? String(failure);
      log(`attempt ${attempt} of ${attempts}: ${error}`);
    }
    if (attempt < attempts) {
      const wait = delays[Math.min(attempt - 1, delays.length - 1)] ?? 0;
      await new Promise((done) => setTimeout(done, wait));
    }
  }
  return { error: `${attempts} attempts, the last: ${error}` };
}

/**
 * The verdict, from what was committed and what the platform answered — no
 * I/O, so every branch is tested with fixtures.
 *
 * @param {object} input
 * @param {Record<string, string>} input.committed  document → committed sha256
 * @param {{ body: unknown } | { error: string }} input.answer  readLive's result
 * @param {boolean} input.aheadOfDeployed  platform-requirement.json
 * @param {boolean} input.release  --release: the escape is not read
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function judge({
  committed,
  answer,
  aheadOfDeployed = false,
  release = false,
  url = LIVE_URL,
}) {
  const lines = [];
  const fail = (line) => ({ ok: false, lines: [...lines, line] });

  if ("error" in answer) {
    return fail(
      `FAIL (closed): ${url} could not be read (${answer.error}). An unread contract is not a matching one; nothing is skipped.`,
    );
  }
  const body = answer.body;
  if (!body || typeof body !== "object" || !("contracts" in body)) {
    return fail(
      `FAIL (closed): ${url} answered with no deployed marker — no \`contracts\` (${JSON.stringify(body)}). A platform from before the marker, or an image built without it: there is nothing to compare the committed types with.`,
    );
  }
  const commit =
    typeof body.commit === "string" && COMMIT.test(body.commit)
      ? body.commit
      : null;
  lines.push(`deployed commit ${commit ?? "<not reported>"}`);
  const deployed = body.contracts;
  const mismatched = [];
  for (const [document, hash] of Object.entries(committed)) {
    const live =
      deployed && typeof deployed === "object" ? deployed[document] : undefined;
    if (typeof live !== "string" || !HEX64.test(live)) {
      return fail(
        `FAIL (closed): the deployed marker has no sha256 for ${document} (${JSON.stringify(live)}).`,
      );
    }
    const same = live === hash;
    lines.push(
      `  ${document.padEnd(17)} committed ${hash}  deployed ${live}  ${same ? "match" : "DIFFERENT"}`,
    );
    if (!same) mismatched.push(document);
  }

  const escape = aheadOfDeployed && !release;
  if (mismatched.length === 0) {
    if (escape) {
      return fail(
        `FAIL: ${REQUIREMENT_FILE} declares aheadOfDeployed, but nothing is ahead — the deployed contract equals the committed one. Set it back to {"aheadOfDeployed": false}.`,
      );
    }
    return {
      ok: true,
      lines: [
        ...lines,
        `PASS: the committed platform types are the contract ${commit ?? "the platform"} serves.`,
      ],
    };
  }
  const named = mismatched.join(", ");
  if (escape) {
    return {
      ok: true,
      lines: [
        ...lines,
        `PASS, AHEAD OF THE DEPLOYED PLATFORM — ${REQUIREMENT_FILE} declares aheadOfDeployed, and ${named} ${mismatched.length === 1 ? "differs" : "differ"} from what runs.`,
        "!!! This tree is generated from a platform that is NOT promoted. It must not ship before that platform does: the release refuses it until then.",
      ],
    };
  }
  return fail(
    `FAIL: ${named} — the committed types are not the deployed contract${commit ? ` (${commit})` : ""}. ` +
      "Regenerate them from the deployed commit (npm run generate:platform-contracts with SNOOPY_BACKEND_ROOT at a worktree of it)" +
      (release
        ? "; a release never ships ahead of the platform."
        : `, or, for a change that must land before the platform's, declare {"aheadOfDeployed": true} in ${REQUIREMENT_FILE}.`),
  );
}

async function main(args) {
  const release = args.includes("--release");
  const unknown = args.filter((arg) => arg !== "--release");
  if (unknown.length > 0) {
    console.error(`usage: verify-deployed-contracts.mjs [--release]`);
    return 2;
  }
  const root = resolve(import.meta.dirname, "..");
  const say = (line) => console.log(`deployed-contracts: ${line}`);
  let committed;
  let aheadOfDeployed = false;
  try {
    committed = committedHashes(root);
    if (!release) ({ aheadOfDeployed } = readRequirement(root));
  } catch (error) {
    say(`FAIL: ${error.message}`);
    return 1;
  }
  say(
    `GET ${LIVE_URL}${release ? " (release: platform-requirement.json not read)" : ` (aheadOfDeployed: ${aheadOfDeployed})`}`,
  );
  const answer = await readLive(LIVE_URL, { log: say });
  const { ok, lines } = judge({ committed, answer, aheadOfDeployed, release });
  for (const line of lines) say(line);
  return ok ? 0 : 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
