/**
 * Fails when a press runs nothing a test has run (build 13: the owner's
 * "Ensure auditing of all functionality that buttons and items work as we
 * have configured").
 *
 * `audit:haptics` holds how a press is written; nothing held whether a test had
 * ever pressed it. This is that half, mechanically: every onPress and
 * onLongPress written in app/ and components/ is resolved to the function it
 * runs, and the suite's coverage (`npm run test:coverage`, istanbul's
 * coverage-final.json) says whether that function ever ran. One that never ran
 * is a button no test has pressed, and fails here. Whether it then did what the
 * app's decisions say is the pressing test's own assertion; this gate proves
 * there is a pressing test.
 *
 * What a press runs, as written:
 * - an inline arrow or function: that function;
 * - `pressed(x)`, the tick wrapper: x;
 * - a name: its declaration in the same file — a function, a const arrow, a
 *   `useCallback(arrow)`;
 * - a call: the handlers the same-file function it calls returns (Billing's
 *   `pressFor(card)`);
 * - a conditional: each handler it can be, a row each (`undefined` is no press);
 * - a component's own prop (PillButton's `onPress={onPress}`, a dialog's
 *   `onPress={onClose}`, ScreenEmpty's `action.onPress`): PASSTHROUGH. The
 *   function is the caller's, so the prop becomes a press of that component and
 *   every `<Component prop={…}>` is audited where it is written, under whatever
 *   name the prop has — a dialog's Cancel is its caller's `onClose`;
 * - anything else: UNRESOLVED, which fails — a handler the audit cannot see is a
 *   press it cannot vouch for. A hook's function is one (`onRetry={x.reload}`):
 *   its count is every screen's, not this button's; written `() => x.reload()`,
 *   the count is this button's alone.
 *
 * A function is found in istanbul's map where istanbul records it — a named
 * function at its name, any other at its first character — so coverage from
 * another version of the source finds nothing there and fails as stale rather
 * than passing.
 *
 *   node scripts/audit-presses.mjs [--coverage coverage/coverage-final.json] [--out <inventory.json>]
 *
 * The table goes to stdout; the inventory (every press, what it runs, and
 * whether a test ran it) to --out, by default press-inventory.json beside the
 * coverage.
 */
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import ts from "typescript";

const root = process.cwd();
const realRoot = realpath(root);
const sourceRoots = ["app", "components"];
const GENERATED = "lib/generated/";
const PRESS_ATTRIBUTES = ["onPress", "onLongPress"];

/**
 * Presses another change owns right now, and that change brings their tests.
 * Each is EXCLUDED in the inventory, never counted as run. An entry whose file
 * is here but holds no press it matches fails the audit, so a change that lands
 * cannot leave its entry behind.
 *
 * TODO(build 13 part 2): empty this list when part 2 lands — the sign-out paths
 * (#6), the archived flow's Unarchive (#4) and one flow per workspace (#9) — so
 * this audit holds those presses as it holds every other.
 *
 * Part 2's too, and not entries because they hold no press: the guards in
 * app/_layout.tsx and app/(tabs)/_layout.tsx, and the Linked accounts lead
 * sentence (#8).
 *
 * `handler` is the press's value as written (or a list of them), `attribute` the
 * prop it is passed as, `inside` the condition whose true branch holds it; with
 * none of them, the whole file.
 */
const EXCLUDED = [
  {
    file: "app/(tabs)/settings/index.tsx",
    handler: "handleSignOut",
    reason: "Settings › Sign out, and its failure's Try again: the sign-out paths (#6), build 13 part 2",
  },
  {
    file: "app/(auth)/faceid.tsx",
    handler: "onUseIdentityProvider",
    reason: 'The Face ID lock\'s "Use identity provider": the sign-out paths (#6, #7), build 13 part 2',
  },
  {
    file: "app/(tabs)/settings/account.tsx",
    attribute: "onSignIn",
    reason: 'Delete account\'s "Sign in again": the sign-out paths (#6), build 13 part 2',
  },
  {
    file: "app/(tabs)/flows/detail.tsx",
    inside: "def.removed",
    reason: 'The archived flow page\'s "Add it again" section, Unarchive (#4), build 13 part 2',
  },
  {
    file: "app/(tabs)/flows/add.tsx",
    reason: "Flows › Add: one flow per workspace (#9), build 13 part 2",
  },
  {
    file: "app/(tabs)/flows/setup.tsx",
    handler: ["() => setCreatingTeam(true)", "() => router.push('/(tabs)/settings/teams')", "() => setCreatingTeam(false)"],
    reason: "Setup's team/scope choice: one flow per workspace (#9), build 13 part 2",
  },
  {
    file: "app/(tabs)/flows/setup.tsx",
    handler: "activate",
    reason: "Setup's Activate, and its failure's Try again: one flow per workspace (#9), build 13 part 2",
  },
];

/** A press no test ran, or one the audit cannot vouch for. */
const FAILING = new Set(["not-run", "unresolved", "no-coverage", "stale-coverage"]);

const coverageArgument = flag("--coverage") ?? "coverage/coverage-final.json";
const coverageFile = resolve(
  root,
  extname(coverageArgument) === ".json" ? coverageArgument : join(coverageArgument, "coverage-final.json"),
);
const inventoryFile = resolve(root, flag("--out") ?? join(dirname(coverageFile), "press-inventory.json"));

const coverage = readCoverage(coverageFile);
const files = sourceRoots.flatMap((dir) => walk(join(root, dir))).filter((file) => !repoPath(file).startsWith(GENERATED));
// Parsed and bound together so a name resolves to its declaration, as the
// editor would; nothing is resolved across modules but a component's import.
const program = ts.createProgram(files, {
  allowJs: true,
  jsx: ts.JsxEmit.Preserve,
  noLib: true,
  noResolve: true,
  types: [],
  target: ts.ScriptTarget.Latest,
});
const checker = program.getTypeChecker();
const sources = new Map(files.map((file) => [repoPath(file), program.getSourceFile(file)]));

/** component function → "prop" or "prop.member" → { component, prop, path } */
const pressProps = new Map();
/** repository path → export name → declaration */
const exportTables = new Map();
/** "Component.prop" → the labels of the controls that prop presses */
const labelsByProp = new Map();
let rows = [];
for (;;) {
  rows = collectRows();
  let grew = false;
  for (const row of rows) if (row.target.kind === "passthrough") grew = register(row.target) || grew;
  if (!grew) break;
}

const inventory = rows
  .map(finish)
  .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.column - b.column));
// One function behind several presses (a dialog's `close`, a status change and
// its Try again) has one count: a test of any of them runs it for all. Each is
// marked, so a run there is read as the function's, not that press's.
for (const row of inventory) {
  if (!row.handlerAt) continue;
  const others = inventory.filter((other) => other !== row && other.handlerAt === row.handlerAt);
  if (others.length > 0) row.sharedWith = others.map((other) => `${other.file}:${other.line} <${other.element}> ${other.attribute}`);
}
const stale = EXCLUDED.filter(
  (entry) => sources.has(entry.file) && !inventory.some((row) => row.excluded === entry.reason && row.file === entry.file),
);

const count = (status) => inventory.filter((row) => row.status === status).length;
const totals = {
  presses: inventory.filter((row) => row.status !== "passthrough").length,
  run: count("run"),
  notRun: count("not-run"),
  unresolved: count("unresolved"),
  noCoverage: count("no-coverage"),
  staleCoverage: count("stale-coverage"),
  excluded: count("excluded"),
  passthrough: count("passthrough"),
};

mkdirSync(dirname(inventoryFile), { recursive: true });
writeFileSync(
  inventoryFile,
  `${JSON.stringify(
    {
      coverage: displayPath(coverageFile),
      totals,
      excluded: EXCLUDED.map((entry) => ({
        ...entry,
        matched: inventory.filter((row) => row.excluded === entry.reason && row.file === entry.file).length,
      })),
      presses: inventory,
    },
    null,
    2,
  )}\n`,
);

printTable(inventory);
console.log(
  `\n${totals.presses} presses: ${totals.run} run by a test, ${totals.notRun} never run, ${totals.unresolved} unresolved, ` +
    `${totals.noCoverage + totals.staleCoverage} without coverage, ${totals.excluded} excluded (build 13 part 2). ` +
    `${totals.passthrough} passthroughs are audited at their callers.\nInventory: ${displayPath(inventoryFile)}`,
);

const failing = inventory.filter((row) => FAILING.has(row.status));
if (failing.length > 0 || stale.length > 0) {
  console.error(
    "\nPress audit failed. Every press is run by a test — write the test that presses it and asserts what it does:\n",
  );
  for (const row of failing) console.error(`  ${row.file}:${row.line}: <${row.element}> ${row.attribute} — ${why(row)}`);
  for (const entry of stale) {
    console.error(`  ${entry.file}: the exclusion "${entry.reason}" matches no press there; remove it from scripts/audit-presses.mjs`);
  }
  process.exit(1);
}
console.log("Press audit passed. Every press is run by a test.");

// ── Sites ────────────────────────────────────────────────────────────────────

/** Every press value written, one row per function it can run. */
function collectRows() {
  const found = [];
  for (const [path, source] of sources) {
    visitElements(source, (element) => {
      // onPress and onLongPress written on any element are presses. Spread into
      // one, they are only where the element presses with them: not this
      // repository's component, or one whose prop is a press.
      const component = componentOfTag(element.tagName);
      const registered = component ? pressProps.get(component) : undefined;
      const props = PRESS_ATTRIBUTES.map((prop) => ({
        prop,
        path: [],
        via: undefined,
        spread: !component || Boolean(registered?.has(prop)),
      }));
      for (const entry of registered?.values() ?? []) {
        if (entry.path.length === 0 && PRESS_ATTRIBUTES.includes(entry.prop)) continue;
        props.push({ prop: entry.prop, path: entry.path, via: entry, spread: true });
      }
      for (const { prop, path: member, via, spread } of props) {
        for (const value of descend(propValues(element, prop, spread), member)) {
          const site = {
            file: path,
            source,
            element,
            anchor: value.anchor,
            attribute: [prop, ...member].join("."),
            value: collapse(value.expression.getText(source)) + value.member.map((key) => `.${key}`).join(""),
            via,
          };
          for (const target of resolveValue(value.expression, value.member, 0)) found.push({ ...site, target });
        }
      }
    });
  }
  return found;
}

function visitElements(node, visit) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) visit(node);
  ts.forEachChild(node, (child) => visitElements(child, visit));
}

/**
 * What the element is given as `prop`: the attribute, or a spread's property.
 * A spread of what the audit cannot read is followed only when it is a
 * component's own props passed on (`{...rest}`); anything else may not hold the
 * prop at all, and is no press the audit can see.
 */
function propValues(element, prop, spread) {
  const attributes = element.attributes.properties;
  const explicit = attributes.filter(
    (attribute) => ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) && attribute.name.text === prop,
  );
  if (explicit.length > 0) {
    return explicit.flatMap((attribute) => {
      const value = attribute.initializer;
      const expression = value && ts.isJsxExpression(value) ? value.expression : undefined;
      return expression ? [{ expression, anchor: attribute, member: [] }] : [];
    });
  }
  if (!spread) return [];
  return attributes
    .filter(ts.isJsxSpreadAttribute)
    .flatMap((attribute) => propertyValues(attribute.expression, prop, attribute, 0))
    .filter(
      (value) =>
        value.member.length === 0 ||
        resolveValue(value.expression, value.member, 0).some((target) => target.kind === "passthrough"),
    );
}

/** `key` of an object as written: `{ key: … }`, either side of a conditional, a same-file const's. */
function propertyValues(node, key, anchor, depth) {
  const expression = unwrap(node);
  if (!expression || depth > 8) return [];
  if (ts.isConditionalExpression(expression)) {
    return [
      ...propertyValues(expression.whenTrue, key, anchor, depth + 1),
      ...propertyValues(expression.whenFalse, key, anchor, depth + 1),
    ];
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return propertyValues(expression.right, key, anchor, depth + 1);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.flatMap((property) => {
      if (ts.isSpreadAssignment(property)) return propertyValues(property.expression, key, anchor, depth + 1);
      if (propertyName(property.name) !== key) return [];
      if (ts.isPropertyAssignment(property)) return [{ expression: property.initializer, anchor: property, member: [] }];
      if (ts.isShorthandPropertyAssignment(property)) return [{ expression: property.name, anchor: property, member: [] }];
      if (ts.isMethodDeclaration(property)) return [{ expression: property, anchor: property, member: [] }];
      return [];
    });
  }
  if (ts.isIdentifier(expression)) {
    const declaration = declarationOf(expression);
    if (declaration && ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && declaration.initializer) {
      return propertyValues(declaration.initializer, key, anchor, depth + 1);
    }
  }
  // Not an object the audit can read: resolved as `expression.key`, which is a
  // component's prop passed on, or unresolved.
  return [{ expression, anchor, member: [key] }];
}

/** `action.onPress`: the property of each value, or the member to read on what is not an object. */
function descend(values, path) {
  let current = values;
  for (const key of path) {
    current = current.flatMap((value) =>
      value.member.length > 0
        ? [{ ...value, member: [...value.member, key] }]
        : propertyValues(value.expression, key, value.anchor, 0),
    );
  }
  return current;
}

// ── What a press runs ────────────────────────────────────────────────────────

function resolveValue(node, member, depth) {
  const expression = unwrap(node);
  if (!expression) return [];
  if (depth > 12) return [unresolved(expression, "too many steps from the press to follow")];
  if (member.length > 0) return resolveMember(expression, member, depth);
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression) || ts.isMethodDeclaration(expression)) {
    return [{ kind: "function", fn: expression }];
  }
  if (ts.isIdentifier(expression)) return expression.text === "undefined" ? [] : resolveName(expression, [], depth);
  if (expression.kind === ts.SyntaxKind.NullKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) return [];
  if (ts.isConditionalExpression(expression)) {
    return [...resolveValue(expression.whenTrue, [], depth + 1), ...resolveValue(expression.whenFalse, [], depth + 1)];
  }
  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return resolveValue(expression.right, [], depth + 1);
    if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
      return [...resolveValue(expression.left, [], depth + 1), ...resolveValue(expression.right, [], depth + 1)];
    }
  }
  if (ts.isCallExpression(expression)) return resolveCall(expression, depth);
  if (ts.isPropertyAccessExpression(expression)) {
    const path = [];
    let base = expression;
    while (ts.isPropertyAccessExpression(base)) {
      path.unshift(base.name.text);
      base = unwrap(base.expression);
    }
    return resolveMember(base, path, depth);
  }
  return [unresolved(expression, `${brief(expression)} is not a handler the audit can follow`)];
}

/** `pressed(x)` and `useCallback(x)` are x; a same-file function's call is what it returns. */
function resolveCall(call, depth) {
  const callee = unwrap(call.expression);
  const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
  if (name === "pressed" || name === "useCallback") {
    return call.arguments.length > 0 ? resolveValue(call.arguments[0], [], depth + 1) : [];
  }
  const declaration = ts.isIdentifier(callee) ? declarationOf(callee) : undefined;
  const fn = declaration ? functionOf(declaration) : undefined;
  if (!fn) {
    return [unresolved(call, `${collapse(callee.getText())}(…) returns a handler declared outside this file`)];
  }
  return returnedExpressions(fn).flatMap((returned) => resolveValue(returned, [], depth + 1));
}

function resolveName(identifier, member, depth) {
  const declaration = declarationOf(identifier);
  const written = [identifier.text, ...member].join(".");
  if (!declaration) return [unresolved(identifier, `${written} is declared nowhere the audit can see`)];
  const prop = propOf(declaration);
  if (prop) {
    const path = [...prop.path, ...member];
    // `{ onPress, ...rest }`: rest holds none of what was destructured beside it.
    if (prop.omits?.has(path[prop.path.length])) return [];
    if (path.length === 0) return [unresolved(identifier, `${written} is a component's whole props`)];
    return [{ kind: "passthrough", component: prop.component, prop: path[0], path: path.slice(1) }];
  }
  if (ts.isFunctionDeclaration(declaration)) {
    return member.length === 0
      ? [{ kind: "function", fn: declaration }]
      : [unresolved(identifier, `${written} is a property of a function`)];
  }
  if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && declaration.initializer) {
    const held = resolveValue(declaration.initializer, member, depth + 1);
    return held.map((target) =>
      target.kind === "unresolved" && member.length > 0
        ? unresolved(identifier, `${written} is a member of ${brief(declaration.initializer)}`)
        : target,
    );
  }
  if (ts.isImportSpecifier(declaration) || ts.isImportClause(declaration) || ts.isNamespaceImport(declaration)) {
    return [unresolved(identifier, `${written} is imported; a press's handler is read in its own file`)];
  }
  if (ts.isBindingElement(declaration)) {
    return [unresolved(identifier, `${written} is destructured from ${origin(declaration)}`)];
  }
  if (ts.isParameter(declaration)) {
    return [unresolved(identifier, `${written} is a parameter of a function that is not a component`)];
  }
  return [unresolved(identifier, `${written} is a ${ts.SyntaxKind[declaration.kind]}`)];
}

function resolveMember(base, path, depth) {
  const expression = unwrap(base);
  if (ts.isIdentifier(expression)) return resolveName(expression, path, depth);
  if (ts.isObjectLiteralExpression(expression) || ts.isConditionalExpression(expression)) {
    return propertyValues(expression, path[0], expression, 0).flatMap((value) =>
      resolveValue(value.expression, [...value.member, ...path.slice(1)], depth + 1),
    );
  }
  return [unresolved(expression, `${brief(expression)}.${path.join(".")} is a member of something the audit cannot read`)];
}

/** A destructured first parameter of a component — `{ onPress }`, `{ action }` — or `props` itself. */
function propOf(declaration) {
  const path = [];
  let omits;
  let node = declaration;
  while (ts.isBindingElement(node)) {
    const pattern = node.parent;
    if (!ts.isObjectBindingPattern(pattern)) return undefined;
    if (node.dotDotDotToken) {
      omits = new Set(pattern.elements.filter((element) => element !== node).map((element) => propertyName(element.propertyName ?? element.name)));
    } else {
      const key = propertyName(node.propertyName ?? node.name);
      if (key === undefined) return undefined;
      path.unshift(key);
    }
    node = pattern.parent;
    if (ts.isVariableDeclaration(node)) {
      // `const { onPress } = props`
      const from = unwrap(node.initializer);
      const outer = from && ts.isIdentifier(from) ? declarationOf(from) : undefined;
      const prop = outer ? propOf(outer) : undefined;
      return prop ? { component: prop.component, path: [...prop.path, ...path], omits } : undefined;
    }
  }
  if (!ts.isParameter(node)) return undefined;
  const fn = node.parent;
  if (fn.parameters[0] !== node || !isComponent(fn)) return undefined;
  return { component: fn, path, omits };
}

function register(target) {
  const key = [target.prop, ...target.path].join(".");
  const props = pressProps.get(target.component) ?? new Map();
  pressProps.set(target.component, props);
  if (props.has(key)) return false;
  props.set(key, { component: target.component, prop: target.prop, path: target.path });
  return true;
}

function unresolved(node, reason) {
  return { kind: "unresolved", node, reason };
}

// ── Components ───────────────────────────────────────────────────────────────

/** The function a JSX tag draws, when this repository declares it. */
function componentOfTag(tag) {
  if (!ts.isIdentifier(tag) || !/^[A-Z]/.test(tag.text)) return undefined;
  return componentOf(declarationOf(tag), 0);
}

function componentOf(declaration, depth) {
  if (!declaration || depth > 8) return undefined;
  if (ts.isImportSpecifier(declaration) || ts.isImportClause(declaration)) {
    const importDeclaration = ts.isImportClause(declaration) ? declaration.parent : declaration.parent.parent.parent;
    const name = ts.isImportClause(declaration) ? "default" : propertyName(declaration.propertyName ?? declaration.name);
    const target = resolveModule(repoPath(declaration.getSourceFile().fileName), importDeclaration.moduleSpecifier.text);
    return target ? componentOf(exportsOf(target).get(name), depth + 1) : undefined;
  }
  const fn = functionOf(declaration);
  return fn && isComponent(fn) ? fn : undefined;
}

/** A function declaration, or the function a const holds: an arrow, `useCallback(arrow)`, `forwardRef(function …)`. */
function functionOf(declaration) {
  if (ts.isFunctionDeclaration(declaration)) return declaration;
  if (!ts.isVariableDeclaration(declaration)) return undefined;
  let value = unwrap(declaration.initializer);
  while (value && ts.isCallExpression(value)) value = unwrap(value.arguments.find((argument) => isFunctionLike(unwrap(argument))) ?? value.arguments[0]);
  return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : undefined;
}

function isFunctionLike(node) {
  return Boolean(node) && (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isCallExpression(node));
}

function isComponent(fn) {
  return /^[A-Z]/.test(componentName(fn) ?? "");
}

function componentName(fn) {
  if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name) return fn.name.text;
  let node = fn.parent;
  while (node && (ts.isCallExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node))) node = node.parent;
  return node && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) ? node.name.text : undefined;
}

function exportsOf(path) {
  if (exportTables.has(path)) return exportTables.get(path);
  const table = new Map();
  exportTables.set(path, table);
  const source = sources.get(path);
  for (const statement of source?.statements ?? []) {
    const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
    const exported = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(statement) && exported) {
      table.set(isDefault ? "default" : statement.name?.text, statement);
    } else if (ts.isVariableStatement(statement) && exported) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) table.set(declaration.name.text, declaration);
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression)) {
      table.set("default", declarationOf(statement.expression));
    } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const specifier of statement.exportClause.elements) {
        const local = propertyName(specifier.propertyName ?? specifier.name);
        const target = statement.moduleSpecifier ? resolveModule(path, statement.moduleSpecifier.text) : undefined;
        if (statement.moduleSpecifier) {
          if (target) table.set(specifier.name.text, exportsOf(target).get(local));
        } else {
          const symbol = checker.getExportSpecifierLocalTargetSymbol(specifier);
          table.set(specifier.name.text, symbol?.valueDeclaration ?? symbol?.declarations?.[0]);
        }
      }
    }
  }
  return table;
}

/** `@/x` and relative specifiers, to a scanned file; a package is not this repository's. */
function resolveModule(from, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) base = posix.join(posix.dirname(from), specifier);
  else return undefined;
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (sources.has(candidate)) return candidate;
  }
  return undefined;
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function finish(row) {
  const { line, character } = row.source.getLineAndCharacterOfPosition(row.anchor.getStart(row.source));
  const exclusion = EXCLUDED.find((entry) => excludes(entry, row));
  const base = {
    file: row.file,
    line: line + 1,
    column: character + 1,
    element: row.element.tagName.getText(row.source),
    attribute: row.attribute,
    label: labelOf(row),
    value: truncate(row.value, 160),
  };
  const { target } = row;
  let result;
  if (target.kind === "passthrough") {
    const name = componentName(target.component);
    result = {
      ...base,
      status: "passthrough",
      handler: `audited where <${name}> is given ${[target.prop, ...target.path].join(".")}`,
    };
  } else if (target.kind === "unresolved") {
    result = { ...base, status: "unresolved", handler: base.value, reason: target.reason };
  } else {
    const ran = runsOf(target.fn);
    result = {
      ...base,
      status: ran.status,
      runs: ran.runs,
      handler: describeFunction(target.fn),
      handlerAt: ran.at,
      ...(ran.reason ? { reason: ran.reason } : {}),
    };
  }
  if (row.via) result.via = `${componentName(row.via.component)}.${[row.via.prop, ...row.via.path].join(".")}`;
  if (exclusion) result = { ...result, status: "excluded", excluded: exclusion.reason };
  return result;
}

function excludes(entry, row) {
  if (entry.file !== row.file) return false;
  if (entry.handler && ![entry.handler].flat().includes(row.value)) return false;
  if (entry.attribute && row.attribute !== entry.attribute) return false;
  if (entry.inside && !isInside(row.anchor, entry.inside)) return false;
  return true;
}

function isInside(node, condition) {
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isConditionalExpression(parent) && parent.whenTrue === child && collapse(parent.condition.getText()) === condition) {
      return true;
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      parent.right === child &&
      collapse(parent.left.getText()) === condition
    ) {
      return true;
    }
  }
  return false;
}

/** Where istanbul counted the function: a named function at its name, any other at its first character. */
function runsOf(fn) {
  const source = fn.getSourceFile();
  const path = repoPath(source.fileName);
  const anchor = (ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name ? fn.name : fn;
  const { line, character } = source.getLineAndCharacterOfPosition(anchor.getStart(source));
  const at = `${path}:${line + 1}:${character + 1}`;
  const counted = coverage.get(path);
  if (!counted) {
    return { status: "no-coverage", at, reason: `${path} is not in the coverage; collectCoverageFrom must include it` };
  }
  const runs = counted.get(`${line + 1}:${character}`);
  if (runs === undefined) {
    return { status: "stale-coverage", at, reason: "the coverage has no function here; it was made from other source" };
  }
  return { status: runs > 0 ? "run" : "not-run", runs, at };
}

function describeFunction(fn) {
  if (ts.isFunctionDeclaration(fn) && fn.name) return `${fn.name.text}()`;
  let node = fn.parent;
  while (node && (ts.isCallExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node))) node = node.parent;
  if (node && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return truncate(collapse(fn.getText()), 160);
}

/** The words on the press, followed through a passthrough to the control that shows them. */
function labelOf(row) {
  const own = ownLabel(row.element, row.source);
  if (!row.via) return own ?? "";
  const inner = labelsFor(row.via);
  return [inner.join(" / "), own ? `(${own})` : ""].filter(Boolean).join(" ");
}

function labelsFor(entry) {
  const key = `${componentName(entry.component)}.${[entry.prop, ...entry.path].join(".")}`;
  if (labelsByProp.has(key)) return labelsByProp.get(key);
  labelsByProp.set(key, []);
  const labels = new Set();
  for (const row of rows) {
    const { target } = row;
    if (target.kind !== "passthrough" || target.component !== entry.component) continue;
    if ([target.prop, ...target.path].join(".") !== [entry.prop, ...entry.path].join(".")) continue;
    const label = row.via ? labelsFor(row.via).join(" / ") : ownLabel(row.element, row.source);
    labels.add(label || row.element.tagName.getText(row.source));
  }
  labelsByProp.set(key, [...labels]);
  return labelsByProp.get(key);
}

function ownLabel(element, source) {
  for (const name of ["label", "accessibilityLabel", "title", "retryLabel", "confirmLabel"]) {
    const value = attributeText(element, name, source);
    if (value) return value;
  }
  // Words the control shows: written text first, then the value it shows.
  const words = ts.isJsxOpeningElement(element)
    ? (childText(element.parent, source, false) ?? childText(element.parent, source, true))
    : undefined;
  if (words) return words;
  // A test id as written, not a prop's name passed on (`testID={testID}`).
  const testID = element.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === "testID",
  )?.initializer;
  const id = testID && ts.isJsxExpression(testID) ? unwrap(testID.expression) : testID;
  return id && (ts.isStringLiteral(id) || ts.isTemplateExpression(id) || ts.isNoSubstitutionTemplateLiteral(id))
    ? attributeText(element, "testID", source)
    : undefined;
}

function attributeText(element, name, source) {
  const attribute = element.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
  const value = attribute?.initializer;
  if (!value) return undefined;
  if (ts.isStringLiteral(value)) return value.text;
  const expression = ts.isJsxExpression(value) ? unwrap(value.expression) : undefined;
  if (!expression) return undefined;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (
    ts.isConditionalExpression(expression) &&
    ts.isStringLiteralLike(unwrap(expression.whenTrue)) &&
    ts.isStringLiteralLike(unwrap(expression.whenFalse))
  ) {
    return `${unwrap(expression.whenTrue).text} / ${unwrap(expression.whenFalse).text}`;
  }
  return truncate(collapse(expression.getText(source)), 60);
}

function childText(node, source, names) {
  for (const child of node.children ?? []) {
    if (ts.isJsxText(child) && child.text.trim()) return collapse(child.text);
    if (ts.isJsxExpression(child) && child.expression) {
      const expression = unwrap(child.expression);
      if (ts.isStringLiteralLike(expression)) return expression.text;
      if (names && (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression))) return expression.getText(source);
    }
    if (ts.isJsxElement(child)) {
      const words = childText(child, source, names);
      if (words) return words;
    }
  }
  return undefined;
}

// ── Output ───────────────────────────────────────────────────────────────────

function printTable(list) {
  const columns = [
    ["STATUS", (row) => row.status.toUpperCase(), 14],
    ["PRESS", (row) => `${row.file}:${row.line}`, 52],
    ["ELEMENT", (row) => `<${row.element}> ${row.attribute}`, 40],
    ["LABEL", (row) => row.label, 32],
    ["RUNS", (row) => (row.runs === undefined ? "-" : String(row.runs)), 6],
    [
      "HANDLER",
      (row) =>
        (row.sharedWith ? `${row.handler} (one function, ${row.sharedWith.length + 1} presses)` : row.handler) +
        (row.reason && row.status !== "run" ? ` — ${row.reason}` : ""),
      110,
    ],
  ];
  const cells = list.map((row) => columns.map(([, cell, width]) => truncate(String(cell(row) ?? ""), width)));
  const widths = columns.map(([title], index) => Math.max(title.length, ...cells.map((line) => line[index].length)));
  const format = (line) => line.map((cell, index) => (index === line.length - 1 ? cell : cell.padEnd(widths[index]))).join("  ");
  console.log(format(columns.map(([title]) => title)));
  for (const line of cells) console.log(format(line));
}

function why(row) {
  if (row.status === "not-run") return `${row.handler} (${row.handlerAt}) never ran in a test`;
  return `${row.status === "unresolved" ? "UNRESOLVED" : row.status}: ${row.reason}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readCoverage(file) {
  let json;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.error(`Press audit failed: no coverage at ${displayPath(file)}. Run \`npm run test:coverage\` first.`);
    process.exit(1);
  }
  const byFile = new Map();
  for (const [key, value] of Object.entries(json)) {
    const data = value?.data ?? value;
    const path = inRepo(data?.path ?? key);
    if (!path) continue;
    const runs = new Map();
    for (const [id, fn] of Object.entries(data.fnMap ?? {})) {
      const at = `${fn.decl.start.line}:${fn.decl.start.column}`;
      runs.set(at, (runs.get(at) ?? 0) + (data.f?.[id] ?? 0));
    }
    byFile.set(path, runs);
  }
  return byFile;
}

/** A coverage key as a repository path, whichever spelling of the root it carries. */
function inRepo(file) {
  for (const base of [root, realRoot]) {
    const path = relative(base, file);
    if (path && !path.startsWith("..") && !isAbsolute(path)) return path.split(sep).join("/");
  }
  const real = realpath(file);
  const path = relative(realRoot, real);
  return path && !path.startsWith("..") && !isAbsolute(path) ? path.split(sep).join("/") : undefined;
}

function declarationOf(identifier) {
  let symbol = checker.getSymbolAtLocation(identifier);
  if (ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier) {
    symbol = checker.getShorthandAssignmentValueSymbol(identifier.parent) ?? symbol;
  }
  return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
}

function returnedExpressions(fn) {
  if (fn.body && !ts.isBlock(fn.body)) return [fn.body];
  const returned = [];
  const visit = (node) => {
    if (ts.isReturnStatement(node)) {
      if (node.expression) returned.push(node.expression);
      return;
    }
    if (ts.isFunctionLike(node)) return;
    ts.forEachChild(node, visit);
  };
  if (fn.body) ts.forEachChild(fn.body, visit);
  return returned;
}

function origin(binding) {
  let node = binding;
  while (ts.isBindingElement(node) || ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) node = node.parent;
  if (ts.isVariableDeclaration(node) && node.initializer) return brief(node.initializer);
  if (ts.isParameter(node)) return "a parameter of a function that is not a component";
  return "something the audit cannot read";
}

/** A node as a reader names it: a call as `name(…)`, anything else as written, shortened. */
function brief(node) {
  const expression = unwrap(node);
  if (ts.isCallExpression(expression)) return `${collapse(expression.expression.getText())}(…)`;
  return truncate(collapse(expression.getText()), 60);
}

function propertyName(name) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function collapse(text) {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text, width) {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text;
}

function repoPath(file) {
  return relative(root, file).split(sep).join("/");
}

function displayPath(file) {
  const path = relative(root, file);
  return path.startsWith("..") ? file : path;
}

function realpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

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
    return [".ts", ".tsx", ".js", ".jsx"].includes(extname(full)) ? [full] : [];
  });
}
