/**
 * Fails when the app's copy says "project" or "automation" (BUILD-PLAN 24.11.7).
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
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const sourceRoots = ["app", "components", "hooks", "lib"];
const GENERATED = "lib/generated/";

/** The retired names, as words. */
const RETIRED = /\b(projects?|automations?)\b/iu;

/** The brand line under the mark (design source, the cover and Home). */
const BRAND_LINE = "AUTOMATION × AI";

/** Reads as words to a person: a space, or a leading capital. */
function readsAsCopy(text) {
  return /\s/u.test(text.trim()) || /^[A-Z]/u.test(text.trim());
}

const findings = [];

for (const dir of sourceRoots) {
  for (const file of walk(join(root, dir))) {
    const path = relative(root, file);
    if (path.startsWith(GENERATED)) continue;
    const source = ts.createSourceFile(
      path,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
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
  ts.forEachChild(node, (child) => visit(child, source, path));
}

if (findings.length > 0) {
  console.error(
    'Vocabulary audit failed. The app says "team" and "flow" — a project and an automation are the contract\'s names, not copy:\n',
  );
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log('Vocabulary audit passed. No copy says "project" or "automation".');

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
    return [".ts", ".tsx"].includes(extname(full)) ? [full] : [];
  });
}
