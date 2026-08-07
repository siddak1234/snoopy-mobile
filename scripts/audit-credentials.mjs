/**
 * Fails when a credential-shaped default appears in an app screen.
 *
 * The prototype ships hardcoded demo credentials in the auth screens. Story S7.3
 * removes them and makes login create a real session. Until then the exact known
 * occurrences are pinned below, so the set can only shrink — a new one fails the
 * build, and removing a pinned one must also remove it from the allowlist.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "components", "hooks", "lib"];

/** Exact occurrences that exist today, tracked by story S7.3. */
const knownDemoCredentials = new Set([
  "app/(auth)/login.tsx:32",
  "app/(auth)/login.tsx:33",
  "app/(auth)/reset.tsx:19",
]);

const CREDENTIAL_NAME = /password|passwd|secret|token|apikey|api_key|credential/i;
const EMAIL_LITERAL = /['"][^'"\s]+@[^'"\s]+\.[A-Za-z]{2,}['"]/;

const findings = [];

for (const dir of sourceRoots) {
  for (const file of walk(join(root, dir))) {
    const path = relative(root, file);
    const lines = readFileSync(file, "utf8").split("\n");

    lines.forEach((line, index) => {
      const location = `${path}:${index + 1}`;

      // useState('someone@example.com') — an email-shaped default.
      const emailDefault =
        /useState\s*(<[^>]*>)?\s*\(/.test(line) && EMAIL_LITERAL.test(line);

      // const [password, setPassword] = useState('literal') — a credential-named
      // binding given a non-empty string default.
      const destructured = /const\s*\[\s*([A-Za-z0-9_]+)/.exec(line);
      const namedDefault =
        destructured !== null &&
        CREDENTIAL_NAME.test(destructured[1]) &&
        /useState\s*(<[^>]*>)?\s*\(\s*['"][^'"]+['"]\s*\)/.test(line);

      if (emailDefault || namedDefault) {
        findings.push({ location, line: line.trim() });
      }
    });
  }
}

const unexpected = findings.filter((f) => !knownDemoCredentials.has(f.location));
const resolved = [...knownDemoCredentials].filter(
  (known) => !findings.some((f) => f.location === known),
);

const failures = [];

for (const finding of unexpected) {
  failures.push(`${finding.location}: new credential-shaped default — ${finding.line}`);
}
for (const location of resolved) {
  failures.push(
    `${location}: resolved — remove it from knownDemoCredentials in scripts/audit-credentials.mjs`,
  );
}

if (failures.length > 0) {
  console.error("Credential audit failed:\n");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  `Credential audit passed. Pinned prototype demo credentials: ${knownDemoCredentials.size} (story S7.3 drives this to 0).`,
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
    return [".ts", ".tsx"].includes(extname(full)) ? [full] : [];
  });
}
