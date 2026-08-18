/**
 * Fails when a colour is written outside the token sheet.
 *
 * `constants/theme.ts` is the single source of truth for colour, and the design
 * system ships an oxlint config (`design-source/.../_adherence.oxlintrc.json`)
 * that says so — but nothing runs it: `npm run lint` is `expo lint`, and the
 * adherence config is not part of that. The rule was documentation, not a gate.
 * This is the gate.
 *
 * Detection is context-sensitive on purpose. A bare `#`-literal is not enough to
 * judge: the fixtures legitimately contain `'#8841'` (a purchase-order number)
 * and `'#4821'` (a run number), which are the same shape as a three- or
 * four-digit colour. A literal is only a finding when its line also names a
 * colour-bearing style property.
 *
 * `app.json` is exempt and not scanned: the Android adaptive icon and the splash
 * screen are resolved by the native build before any JavaScript runs, so they
 * cannot read a TypeScript token. This mirrors the exemption the platform audit
 * granted `snoopy`'s `opengraph-image.tsx` for the same reason.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "components", "hooks", "lib"];

/** The token sheet is where colour is allowed to be literal. */
const TOKEN_SHEET = "constants/theme.ts";

/** Style properties whose value is a colour. */
const COLOR_PROPERTY =
  /\b(color|backgroundColor|borderColor|shadowColor|tintColor|fill|stroke|placeholderTextColor|selectionColor|barStyle|overlayColor)\b/;

const HEX_LITERAL = /['"]#[0-9a-fA-F]{3,8}['"]/;
const FUNCTIONAL_COLOR = /['"](?:rgba?|hsla?)\(/;

/**
 * A six- or eight-digit hex is a colour wherever it appears.
 *
 * The same-line colour-property rule below exists because a three- or
 * four-digit literal is ambiguous — `'#8841'` was a purchase-order number in
 * the prototype. Six and eight digits are not ambiguous, and requiring the
 * property on the same line let the obvious evasion through: hoist the literal
 * to a `const` on its own line, then use the const on the colour prop. That is
 * how a colour actually escapes a token sheet in practice, so it is checked
 * unconditionally.
 */
const UNAMBIGUOUS_HEX = /['"]#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})['"]/;

/** A hex assembled in a template literal, which no plain string match sees. */
const TEMPLATE_HEX = /`#\$\{|`#[0-9a-fA-F]*\$\{/;

const findings = [];

for (const dir of sourceRoots) {
  for (const file of walk(join(root, dir))) {
    const path = relative(root, file);
    if (path === TOKEN_SHEET) continue;

    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const hasHex = HEX_LITERAL.test(line) && COLOR_PROPERTY.test(line);
        const hasFunctional = FUNCTIONAL_COLOR.test(line);
        const hasUnambiguous = UNAMBIGUOUS_HEX.test(line);
        const hasTemplate = TEMPLATE_HEX.test(line);
        if (hasHex || hasFunctional || hasUnambiguous || hasTemplate) {
          findings.push({ location: `${path}:${index + 1}`, line: line.trim() });
        }
      });
  }
}

if (findings.length > 0) {
  console.error(
    `Token audit failed. Colour belongs in ${TOKEN_SHEET}; import a token instead:\n`,
  );
  for (const finding of findings) {
    console.error(`  ${finding.location}: ${finding.line}`);
  }
  process.exit(1);
}

console.log(`Token audit passed. No colour literals outside ${TOKEN_SHEET}.`);

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
