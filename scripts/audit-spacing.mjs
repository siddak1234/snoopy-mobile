/**
 * Fails when a padding, a margin or a gap is a typed number instead of a name
 * from the spacing table (backend ADR-0048 amendment 1, point 14; the owner's
 * Q8, 2026-10-26).
 *
 * The owner's build 30 note F3 ("We want uniform spacing and formatting for the
 * layouts"): the same gap was 0, 9 or 14 from screen to screen, because every
 * screen typed its own. The platform now publishes one table, `BLOCK_SPACING`
 * (`lib/generated/platform-contracts/block-rules.ts`), and `constants/theme.ts`
 * gives it to the screens as `space` — with `inset`, the steps below the
 * table's smallest (`inner`, 8) for the inside of one control: a chip's own
 * padding, an icon beside its word. Every padding, margin and gap under app/ and
 * components/ is one of those names (`space.group`, `layout.screenX`), or 0.
 *
 * `inset` is the app's alone (the website's lib/spacing.ts has no step below
 * 8), so where it is used is held here (`INSET`, Round 21's review): each file,
 * how many times, and what it spaces inside one control. One more in a file,
 * or one in a file not listed, fails — a gap between rows, cards, a title and
 * what it heads, or things in one card is the table's (`space.title`,
 * `space.inner`); one fewer asks for the list to be lowered.
 *
 * Found by parsing, as `audit-type.mjs` finds a size: a `padding*`, `margin*`,
 * `gap`, `rowGap` or `columnGap` property, the same named prop (`gap={…}`), and
 * a default given to such a name. It fails when a number other than 0 can come
 * out of it — `9`, `md ? 20 : 18`, `space.group + 2` — and a name is followed to
 * what it was given in the same file, so a number hoisted into a `const` or a
 * local table is found too. A comparison yields no spacing, the type's own
 * geometry (`em`, `centredOn`) is not one, and a value read from the theme
 * passes: it is an import, never a number written here.
 */
import { readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
/** Where a screen's spacing is written: the screens and their components. */
const sourceRoots = ["app", "components"];

/** The style properties whose value is a spacing from the table. */
const SPACING = /^(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?$|^(gap|rowGap|columnGap)$/u;

/**
 * The type's own geometry, never a spacing: a tracked word's letter-spacing
 * given back on its other side (`em`, held by `audit:type`), and an icon
 * centred on the first line of its words (`centredOn`, its size the icon's).
 */
const GEOMETRY = new Set(["em", "centredOn"]);

/** An operator whose result is a boolean, never a spacing. */
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

/**
 * Where `inset` (constants/theme.ts) may be used, and how many times: the
 * inside of one control only.
 */
const INSET = {
  "app/(auth)/login.tsx": [2, "the error's icon on its first line; Remember me's line under its title"],
  "app/(tabs)/(home)/index.tsx": [4, "a line under the line above (the counts, a row's line and stamp)"],
  "app/(tabs)/activity/approvals.tsx": [5, "a text button's own padding"],
  "app/(tabs)/activity/index.tsx": [3, "a row's icon on its first line; its line and stamp under its title"],
  "app/(tabs)/activity/run.tsx": [1, "the line under the title"],
  "app/(tabs)/flows/add.tsx": [3, "the lines under a card's name"],
  "app/(tabs)/flows/index.tsx": [3, "the callout's icon on its first line; the lines under a flow's name"],
  "app/(tabs)/settings/index.tsx": [2, "the segmented control's own padding and gap"],
  "components/automations/run-file-field.tsx": [1, "a button's icon beside its word"],
  "components/automations/webhook-address-dialog.tsx": [1, "a value under its label"],
  "components/blocks/badge.tsx": [1, "a chip's own padding"],
  "components/blocks/link.tsx": [1, "the line under a link's title"],
  "components/blocks/list.tsx": [1, "the line under a row's title"],
  "components/blocks/section.tsx": [1, "the line under a section's title"],
  "components/connection-row.tsx": [2, "the line under the name; the button's own padding"],
  "components/flows/archived-flows.tsx": [1, "the line under a flow's name"],
  "components/nocturne/noc-toggle.tsx": [1, "the toggle's knob"],
  "components/nocturne/oauth-button.tsx": [1, "the Apple glyph on its word"],
  "components/nocturne/pill-button.tsx": [1, "an icon beside its word"],
  "components/nocturne/stat-card.tsx": [1, "the line under a tile's number"],
  "components/nocturne/status-pill.tsx": [1, "a pill's own padding"],
  "components/nocturne/tab-bar.tsx": [3, "the bar's own top, its capsule, a tab's icon over its word"],
  "components/notifications/inbox.tsx": [3, "the dot and icon on a row's first line; the line under its title"],
  "components/organization/org-domains.tsx": [1, "a value under its label"],
  "components/runs/tracker-step.tsx": [2, "a step's icon on its first line; the line under its title"],
  "components/scope-control.tsx": [1, "the pill's icon beside its word"],
  "components/screen-state.tsx": [1, "the loading header's two lines"],
  "components/setup-field.tsx": [2, "the currency beside its box; the box's own padding"],
};

const files = sourceRoots.flatMap((dir) => walk(join(root, dir)));

// One program so a name resolves to its own declaration, scope by scope. No
// imports are followed: a spacing taken from the theme is an import.
const program = ts.createProgram({
  rootNames: files,
  options: { allowJs: true, jsx: ts.JsxEmit.Preserve, noResolve: true, noLib: true, types: [], noEmit: true },
});
const checker = program.getTypeChecker();

const findings = new Map();
/** How many times each file names an `inset` step. */
const insetUses = new Map();

for (const file of files) {
  const source = program.getSourceFile(file);
  if (source) visit(source);
}

for (const [file, count] of insetUses) {
  const held = INSET[file]?.[0] ?? 0;
  if (count > held) {
    findings.set(
      `${file}: inset`,
      `${count} inset steps, the list holds ${held}: between rows, cards, a title and what it heads, or things in one card is space.title or space.inner`,
    );
  } else if (count < held) {
    findings.set(`${file}: inset`, `${count} inset steps, the list holds ${held}: lower INSET in scripts/audit-spacing.mjs`);
  }
}
for (const [file, [held]] of Object.entries(INSET)) {
  if (!insetUses.has(file) && files.includes(join(root, file))) {
    findings.set(`${file}: inset`, `0 inset steps, the list holds ${held}: lower INSET in scripts/audit-spacing.mjs`);
  }
}

function visit(node) {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "inset") {
    const file = relative(root, node.getSourceFile().fileName);
    insetUses.set(file, (insetUses.get(file) ?? 0) + 1);
  }
  const value = spacingValue(node);
  if (value) {
    for (const literal of numbersIn(value, new Set())) {
      if (Number(literal.text) === 0) continue;
      const literalSource = literal.getSourceFile();
      const { line } = literalSource.getLineAndCharacterOfPosition(literal.getStart(literalSource));
      findings.set(`${relative(root, literalSource.fileName)}:${line + 1}`, literalSource.text.split("\n")[line].trim());
    }
  }
  ts.forEachChild(node, visit);
}

/** The expression a node gives as a spacing, or null when it gives none. */
function spacingValue(node) {
  if (ts.isPropertyAssignment(node) && SPACING.test(nameOf(node.name) ?? "")) return node.initializer;
  if (ts.isShorthandPropertyAssignment(node) && SPACING.test(node.name.text)) return node.name;
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && SPACING.test(node.name.text)) {
    return node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : null;
  }
  if (
    (ts.isBindingElement(node) || ts.isParameter(node) || ts.isVariableDeclaration(node)) &&
    node.initializer &&
    SPACING.test(nameOf(ts.isBindingElement(node) && node.propertyName ? node.propertyName : node.name) ?? "")
  ) {
    return node.initializer;
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
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && GEOMETRY.has(node.expression.text)) return [];
    return node.arguments.flatMap((argument) => numbersIn(argument, seen));
  }
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
    "Spacing audit failed. A padding, margin or gap is a name from the spacing table in constants/theme.ts (space.group, space.title, layout.screenX, …; inset.* inside one control), never a number:\n",
  );
  for (const [location, line] of findings) console.error(`  ${location}: ${line}`);
  process.exit(1);
}

console.log("Spacing audit passed. Every padding, margin and gap under app/ and components/ comes from the spacing table.");

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
