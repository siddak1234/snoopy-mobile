/**
 * Fails when a press can be silent (build 11, D7).
 *
 * The owner's build 10, item 10: "Ensure any button clicked does haptic
 * feedback like the others." One haptic existed, inside the tab bar, and
 * nothing made it the app's rule, so every Pressable written since was silent.
 * `components/pressable.tsx` is now the one place a press passes through — its
 * `Pressable` ticks, and `pressed()` wraps a handler on a host element — and
 * this is the gate that keeps it so. Four rules, each a thing a silent press
 * is written as:
 *
 * 1. A Pressable, Touchable or Button imported from 'react-native' outside the
 *    helper: a press that bypasses it.
 * 2. A default or namespace import, or a require, of 'react-native' anywhere:
 *    `RN.Pressable` would bypass it the same way.
 * 3. An import or require of 'expo-haptics' outside the helper: a second call
 *    style, which is how the tab bar's tick stayed the tab bar's.
 * 4. An onPress, onLongPress, onPressIn or onPressOut on a host element — Text,
 *    View, Image, ScrollView, Animated.* — whose value is not a `pressed(…)`
 *    call: Text's own handler never meets the helper.
 *
 * Found by parsing, not by matching lines, in audit-vocabulary's manner; type
 * imports are not calls and pass. Generated contracts are not scanned.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const sourceRoots = ["app", "components", "hooks", "lib"];
const GENERATED = "lib/generated/";

/** The one file that draws react-native's Pressable and calls expo-haptics. */
const HELPER = "components/pressable.tsx";

/** What a press is written as, in react-native. */
const PRESS_PRIMITIVES = new Set([
  "Pressable",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "TouchableNativeFeedback",
  "Button",
]);

/** A host element that takes a press handler of its own. */
const HOST_TAGS = new Set(["Text", "View", "Image", "ScrollView"]);
const PRESS_ATTRIBUTES = new Set(["onPress", "onLongPress", "onPressIn", "onPressOut"]);

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
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    checkImport(node, source, path);
  } else if (isRequireOf(node, "react-native")) {
    report(node, source, path, "react-native is required; a press is written with @/components/pressable");
  } else if (isRequireOf(node, "expo-haptics") && path !== HELPER) {
    report(node, source, path, "expo-haptics is called outside components/pressable.tsx");
  } else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && PRESS_ATTRIBUTES.has(node.name.text)) {
    checkHostHandler(node, source, path);
  }
  ts.forEachChild(node, (child) => visit(child, source, path));
}

function checkImport(node, source, path) {
  const module = node.moduleSpecifier.text;
  const clause = node.importClause;
  if (!clause || clause.isTypeOnly) return;
  if (module === "expo-haptics") {
    if (path !== HELPER) report(node, source, path, "expo-haptics is imported outside components/pressable.tsx");
    return;
  }
  if (module !== "react-native") return;
  if (clause.name) report(node, source, path, "react-native is imported as a default");
  const bindings = clause.namedBindings;
  if (!bindings) return;
  if (ts.isNamespaceImport(bindings)) {
    report(node, source, path, "react-native is imported as a namespace");
    return;
  }
  if (path === HELPER) return;
  for (const element of bindings.elements) {
    if (element.isTypeOnly) continue;
    const imported = (element.propertyName ?? element.name).text;
    if (PRESS_PRIMITIVES.has(imported)) {
      report(element, source, path, `${imported} is imported from react-native; a press is written with @/components/pressable`);
    }
  }
}

/** `<Text onPress={…}>`: the handler is `pressed(…)`, or the press is silent. */
function checkHostHandler(attribute, source, path) {
  const element = attribute.parent.parent;
  if (!ts.isJsxOpeningElement(element) && !ts.isJsxSelfClosingElement(element)) return;
  if (!isHostTag(element.tagName)) return;
  const value = attribute.initializer;
  const expression = value && ts.isJsxExpression(value) ? value.expression : undefined;
  if (expression && ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "pressed") {
    return;
  }
  report(
    attribute,
    source,
    path,
    `${attribute.name.text} on <${element.tagName.getText(source)}> is not pressed(…); a host element's press is wrapped so it ticks`,
  );
}

/** Text, View, Image, ScrollView, or Animated.<any> — the elements a press can be put on directly. */
function isHostTag(tagName) {
  if (ts.isIdentifier(tagName)) return HOST_TAGS.has(tagName.text);
  return (
    ts.isPropertyAccessExpression(tagName) && ts.isIdentifier(tagName.expression) && tagName.expression.text === "Animated"
  );
}

function isRequireOf(node, module) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0]) &&
    node.arguments[0].text === module
  );
}

function report(node, source, path, finding) {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  findings.push(`${path}:${line + 1}: ${finding}`);
}

if (findings.length > 0) {
  console.error(
    "Haptics audit failed. Every press ticks through components/pressable.tsx — its Pressable, or pressed() around a host element's handler:\n",
  );
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log("Haptics audit passed. Every press goes through components/pressable.tsx.");

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
