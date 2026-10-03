/**
 * Fails when a font size is written outside the type scale (24.12).
 *
 * The owner's decision 11 (2026-10-02): bigger type across the whole app — easy
 * to read. `typeScale` in `constants/theme.ts` holds the sizes, and every size
 * on a screen is one of its steps, so tuning the type is one table. Nothing held
 * that rule: a screen could write `fontSize: 13` again and drift back to the
 * design's small sizes, and the snapshots pin only the Nocturne set. This is the
 * gate.
 *
 * A size is found by parsing, not by matching lines: a `fontSize` or
 * `lineHeight` property, a `fontSize={…}` prop, a `fontSize = …` default, and
 * the size `em(track, size)` turns into letter-spacing. It fails when a number
 * can come out of it — `13`, `md ? 20 : 18`, `size + 1` — and a name is followed
 * to what it was given in the same file, so a number hoisted into a `const`, a
 * default or a local table of sizes is found too: that is how a size escapes a
 * scale in practice. A comparison (`height >= 52 ? … : …`) yields no size, and a
 * value read from the scale passes. The scale's own file is where a size is a
 * number; generated contracts are not scanned.
 */
import { readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const sourceRoots = ["app", "components", "constants", "hooks", "lib"];
const GENERATED = "lib/generated/";

/** The type scale is where a size is allowed to be a number. */
const TYPE_SCALE = "constants/theme.ts";

/** The style properties whose value is a size from the scale. */
const SIZE_PROPERTIES = new Set(["fontSize", "lineHeight"]);

/** An operator whose result is a boolean, never a size. */
const COMPARISONS = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.InKeyword,
]);

const files = sourceRoots
  .flatMap((dir) => walk(join(root, dir)))
  .filter((file) => {
    const path = relative(root, file);
    return path !== TYPE_SCALE && !path.startsWith(GENERATED);
  });

// One program so a name resolves to its own declaration, scope by scope. No
// imports are followed and no library is loaded: a size taken from the scale is
// an import, and an import is never a number written here.
const program = ts.createProgram({
  rootNames: files,
  options: { allowJs: true, jsx: ts.JsxEmit.Preserve, noResolve: true, noLib: true, types: [], noEmit: true },
});
const checker = program.getTypeChecker();

const findings = new Map();

for (const file of files) {
  const source = program.getSourceFile(file);
  if (source) visit(source, source);
}

function visit(node, source) {
  const value = sizeValue(node);
  if (value) {
    for (const literal of numbersIn(value, new Set())) {
      const literalSource = literal.getSourceFile();
      const { line } = literalSource.getLineAndCharacterOfPosition(literal.getStart(literalSource));
      const location = `${relative(root, literalSource.fileName)}:${line + 1}`;
      findings.set(location, literalSource.text.split("\n")[line].trim());
    }
  }
  ts.forEachChild(node, (child) => visit(child, source));
}

/** The expression a node gives as a size, or null when it gives none. */
function sizeValue(node) {
  if (ts.isPropertyAssignment(node) && SIZE_PROPERTIES.has(nameOf(node.name))) return node.initializer;
  if (ts.isShorthandPropertyAssignment(node) && SIZE_PROPERTIES.has(node.name.text)) return node.name;
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && SIZE_PROPERTIES.has(node.name.text)) {
    return node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : null;
  }
  if (
    (ts.isBindingElement(node) || ts.isParameter(node) || ts.isVariableDeclaration(node)) &&
    node.initializer &&
    SIZE_PROPERTIES.has(nameOf(ts.isBindingElement(node) && node.propertyName ? node.propertyName : node.name))
  ) {
    return node.initializer;
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "em") {
    return node.arguments[1] ?? null;
  }
  return null;
}

/** Every number that can come out of an expression as its value. */
function numbersIn(node, seen) {
  if (!node) return [];
  if (ts.isNumericLiteral(node)) return [node];
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return numbersIn(node.expression, seen);
  }
  if (ts.isPrefixUnaryExpression(node)) return numbersIn(node.operand, seen);
  if (ts.isConditionalExpression(node)) return [...numbersIn(node.whenTrue, seen), ...numbersIn(node.whenFalse, seen)];
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (COMPARISONS.has(operator)) return [];
    if (operator === ts.SyntaxKind.CommaToken || operator === ts.SyntaxKind.EqualsToken) return numbersIn(node.right, seen);
    return [...numbersIn(node.left, seen), ...numbersIn(node.right, seen)];
  }
  if (ts.isCallExpression(node)) return node.arguments.flatMap((argument) => numbersIn(argument, seen));
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return declarationsOf(node).flatMap((declaration) => {
      if (seen.has(declaration)) return [];
      seen.add(declaration);
      if (ts.isShorthandPropertyAssignment(declaration)) return numbersIn(declaration.name, seen);
      return "initializer" in declaration ? numbersIn(declaration.initializer, seen) : [];
    });
  }
  return [];
}

/** Where a name or a table entry was declared, in this file. */
function declarationsOf(node) {
  let symbol;
  if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
    symbol = checker.getShorthandAssignmentValueSymbol(node.parent);
  } else if (ts.isPropertyAccessExpression(node)) {
    symbol = checker.getSymbolAtLocation(node.name);
  } else if (ts.isElementAccessExpression(node)) {
    symbol = checker.getSymbolAtLocation(node.argumentExpression);
  } else {
    symbol = checker.getSymbolAtLocation(node);
  }
  return symbol?.declarations ?? [];
}

function nameOf(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
  return null;
}

if (findings.size > 0) {
  console.error(
    `Type audit failed. A size is a step of the type scale in ${TYPE_SCALE} (typeScale.body.fontSize, …typeScale.body); use one instead of a number:\n`,
  );
  for (const [location, line] of findings) console.error(`  ${location}: ${line}`);
  process.exit(1);
}

console.log(`Type audit passed. Every font size comes from the type scale in ${TYPE_SCALE}.`);

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
