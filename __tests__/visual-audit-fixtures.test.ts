import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

/**
 * The visual audit's fixtures (round 24 A4; `scripts/visual-audit/`): the
 * fixture Edge answers the audited screens from these files, so each must be an
 * answer the platform could give. Each file is type-checked against its
 * route's success body in the generated contract (`Answer`, `test/fake-platform.ts`),
 * as an object literal under `satisfies`, so a status, an enum or a missing
 * field fails here — not on a simulator. Made-up businesses and numbers only.
 */

jest.setTimeout(120_000);

const root = resolve(__dirname, '..');
const dir = join(root, 'scripts/visual-audit/fixtures');
type Route = { route: string; path: string; file: string };
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { workspaceId: string; runs: Record<string, string>; routes: Route[] };

/** Type-checks `source` as a file at the repository's root; answers its diagnostics. */
function typeCheck(source: string): string[] {
  const configFile = ts.readConfigFile(join(root, 'tsconfig.json'), (path) => ts.sys.readFile(path));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  const virtual = join(root, '__visual_audit_fixtures__.ts');
  const host = ts.createCompilerHost({ ...parsed.options, noEmit: true });
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, onError, create) =>
    name === virtual ? ts.createSourceFile(name, source, language) : getSourceFile(name, language, onError, create);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => name === virtual || fileExists(name);
  const program = ts.createProgram({ rootNames: [virtual], options: { ...parsed.options, noEmit: true }, host });
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === virtual)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

function sourceFor(routes: readonly Route[], read: (file: string) => string): string {
  return [
    "import type { Answer } from '@/test/fake-platform';",
    ...routes.map((entry, n) => `export const fixture${n} = (${read(entry.file)}) satisfies Answer<'${entry.route}'>;`),
  ].join('\n');
}

describe('the visual audit fixtures', () => {
  it('every file is routed, and every route names a file', () => {
    const files = readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'index.json').sort();
    expect([...new Set(index.routes.map((entry) => entry.file))].sort()).toEqual(files);
    for (const entry of index.routes) expect(() => new RegExp(entry.path)).not.toThrow();
  });

  it("each fixture is an answer its route's contract allows", () => {
    const diagnostics = typeCheck(sourceFor(index.routes, (file) => readFileSync(join(dir, file), 'utf8')));
    expect(diagnostics).toEqual([]);
  });

  it('the check bites: a status the contract does not have is refused', () => {
    const run = index.routes.find((entry) => entry.file === 'run-done.json')!;
    const broken = typeCheck(
      sourceFor([run], (file) => readFileSync(join(dir, file), 'utf8').replace('"status": "succeeded"', '"status": "done"')),
    );
    expect(broken.join('\n')).toMatch(/"done"/u);
  });
});

/**
 * The two modules Metro swaps in for the audit (`metro.config.js`): each must
 * export every name the real one does, or the audited bundle breaks the day
 * the real module gains one.
 */
describe('the visual audit swaps', () => {
  it.each([
    ['lib/platform/session-store', 'scripts/visual-audit/session-store'],
    ['lib/platform/appearance-store', 'scripts/visual-audit/appearance-store'],
  ])('%s and its swap export the same names', (real, swap) => {
    const names = (path: string) => Object.keys(jest.requireActual(join(root, path))).sort();
    expect(names(swap)).toEqual(names(real));
  });

  it('the swapped session needs no sign-in: a year to expire, remembered, Face ID off', async () => {
    const swap = jest.requireActual(join(root, 'scripts/visual-audit/session-store'));
    const session = await swap.readSession();
    expect(session.expiresAt).toBeGreaterThan(Date.now() + 300 * 24 * 60 * 60 * 1000);
    expect(await swap.readAccessToken()).toBe(session.accessToken);
    expect(await swap.readRememberSession()).toBe(true);
    expect(await swap.readFaceIdEnabled()).toBe(false);
    expect(await swap.readFaceIdChoice()).toBe('off');
    expect(await jest.requireActual(join(root, 'scripts/visual-audit/appearance-store')).readAppearance()).toBe('auto');
  });
});
