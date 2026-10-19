/**
 * Fails when the app's copy says "project", "automation", "solution",
 * "pipeline" or "team" (BUILD-PLAN 24.11.7; the Invoice Processing update,
 * 2026-10-14; "team" since round 23).
 *
 * The owner's words: a team is the sub-organization with its own flows — what
 * the platform's contract calls a project — and "Flows will be the name we use
 * from now on" (24.9). The code keeps the contract's names (`projectId`,
 * `readProjects`, `/projects` paths, `lib/platform/automations`); a person
 * reads Teams and Flows. Nothing ran that rule, so a renamed screen could keep
 * an old sentence. This is the gate.
 *
 * Copy is what a person reads, found by parsing, not by matching lines: JSX
 * text, and a string or template's text that reads as words — it holds a space,
 * or it begins with a capital. An identifier, a key, a path, a test id, an
 * import and a comment are never copy, so `scope: 'project'` and
 * `'/v1/workspaces/{workspaceId}/projects'` pass. Generated contracts are not
 * scanned: they are the platform's words, not the app's. The brand line under
 * the mark, "AUTOMATION × AI", names what Autom8x is, not a thing in the app,
 * and is the one exact string allowed.
 *
 * Since Build 21 (Round 17, 2026-10-15) two more, from the owner's build 20
 * items: no copy says "Connect vendor ›" (items 4 and 5: "It says connected but
 * not connected on the main flow page", "Why does it say connect when it was
 * connected" — the button drawn whatever the connection's state; the vendor row
 * says its state now), and no screen reads a run's `requestId` (decision D4:
 * "run number is the run ID" — build 20 titled run 793eef82 by its request id's
 * first eight characters): a property `.requestId` read in app/, components/,
 * lib/view/ or lib/content/ fails, as a run is named by its `id` alone.
 *
 * Since Build 22 (Round 17, 2026-10-17) two more, from the owner's build 21
 * items: no copy says "Move to v" (item 7: "I also dont want a move to vx number
 * in the flows. The user always gets the latest version. They dont get to oick
 * when to update" — the platform moves every flow, backend ADR-0041), and none
 * says "Connect vendor" at all, the "›" or not (item 5: "2. Connect integration
 * … if i click that button it should take me to the choices"; the session's
 * S21: the choices page is "Connect integration", one word for one thing).
 *
 * Since round 23 (2026-10-19) "team" too, from the owner's build 22 feedback:
 * a person reads Department — "All departments", "in a department". The code
 * keeps its names (`teams`, `/settings/team`, `scope-team`); only copy is read.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
// Every runtime root and every module Metro bundles as code, as audit:tokens and
// audit:credentials since backend manifest §12.2 #21: copy is copy wherever it
// is written.
const sourceRoots = ["app", "components", "constants", "hooks", "lib"];
const GENERATED = "lib/generated/";

/**
 * The retired names, as words. "Solution" and "pipeline" joined them with the
 * Invoice Processing update (2026-10-14; the owner's build 19 item 8: "So much
 * ai slop wording … you just randomly out wird jargon in each place"): a person
 * reads flows and steps. "Team" since round 23: a person reads departments.
 */
const RETIRED = /\b(projects?|automations?|solutions?|pipelines?|teams?)\b/iu;

/** The brand line under the mark (design source, the cover and Home). */
const BRAND_LINE = "AUTOMATION × AI";

/**
 * Copy no screen says again: "Connect vendor" (Build 21's "Connect vendor ›",
 * the owner's build 20 items 4 and 5; any form since Build 22) and "Move to v"
 * (Build 22; the owner's build 21 item 7).
 */
const BANNED_PHRASES = ["Connect vendor", "Move to v"];

/** Where a screen's words and what it shows are made: a run's request id is read in none of them (D4). */
const DISPLAY_ROOTS = ["app/", "components/", "lib/view/", "lib/content/"];

/** Reads as words to a person: a space, or a leading capital. */
function readsAsCopy(text) {
  return /\s/u.test(text.trim()) || /^[A-Z]/u.test(text.trim());
}

const findings = [];

for (const dir of sourceRoots) {
  for (const file of walk(join(root, dir))) {
    const path = relative(root, file);
    if (path.startsWith(GENERATED)) continue;
    // The kind follows the extension: `.tsx`, `.jsx` and the plain JavaScript
    // ones parse JSX, as Metro reads them; `.ts` does not.
    const source = ts.createSourceFile(path, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    visit(source, source, path);
  }
}

function visit(node, source, path) {
  let text = null;
  if (ts.isJsxText(node)) {
    text = node.getText(source);
  } else if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    const parent = node.parent;
    const isModuleName =
      parent &&
      (ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        ts.isExternalModuleReference(parent) ||
        (ts.isCallExpression(parent) &&
          (parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(parent.expression) &&
              ["require", "jest.mock"].includes(parent.expression.text)))));
    if (!isModuleName && readsAsCopy(node.text)) text = node.text;
  }
  if (text !== null && text.trim() !== BRAND_LINE && RETIRED.test(text)) {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push(`${path}:${line + 1}: ${JSON.stringify(text.trim())}`);
  }
  if (text !== null && BANNED_PHRASES.some((phrase) => text.includes(phrase))) {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push(`${path}:${line + 1}: ${JSON.stringify(text.trim())} (a banned phrase)`);
  }
  if (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "requestId" &&
    DISPLAY_ROOTS.some((prefix) => path.startsWith(prefix))
  ) {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push(`${path}:${line + 1}: ${node.getText(source)} (a run is named by its id, never its request id)`);
  }
  ts.forEachChild(node, (child) => visit(child, source, path));
}

if (findings.length > 0) {
  console.error(
    'Vocabulary audit failed. The app says "department", "flow" and "steps" — a project, an automation, a solution, a pipeline and a team are not copy; "Connect vendor" and "Move to v" are not said; a run is named by its id:\n',
  );
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(
  'Vocabulary audit passed. No copy says "project", "automation", "solution", "pipeline", "team", "Connect vendor" or "Move to v", and no screen reads a run\'s request id.',
);

function walk(path) {
  let entries;
  try {
    entries = readdirSync(path);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extname(full)) ? [full] : [];
  });
}
