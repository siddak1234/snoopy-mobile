const { execFileSync, spawnSync } = require('node:child_process');
const { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');

/**
 * `npm run audit:docs` (scripts/audit-doc-references.mjs): no document names a
 * file that does not exist. This repository's documents pass it, and a temp
 * copy of the repository with one broken path planted fails it, naming the
 * document, the line and the path. A broken path in an archive the docs map
 * names (`records.archive`) is history and is not read. And the three docs
 * checks (`check:docs`, `map -- --check`, `audit:docs`) run in `verify`, right
 * after lint, and in CI's Architecture gates job on the PR's whole range.
 */

const root = resolve(__dirname, '..');
const script = join(root, 'scripts/audit-doc-references.mjs');
const audit = (cwd) =>
  spawnSync(process.execPath, [script, cwd], { cwd, encoding: 'utf8', timeout: 60_000 });

/** A clone of HEAD, with history (struck names need it), and the working tree's changes over it. */
function tempCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'autom8x-doc-references-'));
  const copy = join(dir, 'repo');
  execFileSync('git', ['clone', '-q', '--local', root, copy]);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const changed = git('ls-files', '-z', '--modified', '--others', '--exclude-standard').split('\0').filter(Boolean);
  const deleted = new Set(git('ls-files', '-z', '--deleted').split('\0').filter(Boolean));
  for (const file of changed) {
    if (deleted.has(file)) continue;
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    copyFileSync(join(root, file), join(copy, file));
  }
  for (const file of deleted) rmSync(join(copy, file), { force: true });
  return { dir, copy };
}

describe('audit:docs — every path a document names exists', () => {
  let temp;
  beforeAll(() => {
    temp = tempCopy();
  });
  afterAll(() => {
    if (temp) rmSync(temp.dir, { recursive: true, force: true });
  });

  it("passes on this repository's documents", () => {
    const run = audit(root);
    expect(run.stderr).toBe('');
    expect(run.stdout).toMatch(/missing 0$/m);
    expect(run.status).toBe(0);
  });

  it('passes on the temp copy before anything is planted', () => {
    expect(audit(temp.copy).status).toBe(0);
  });

  it('fails on a broken path planted in a current document, and names it', () => {
    const doc = join(temp.copy, 'README.md');
    const before = readFileSync(doc, 'utf8');
    try {
      appendFileSync(doc, '\nThe planted line names `scripts/planted-missing.mjs`.\n');
      const line = readFileSync(doc, 'utf8').split('\n').length - 1;
      const run = audit(temp.copy);
      expect(run.stdout).toContain(`missing\tREADME.md:${line}\tscripts/planted-missing.mjs`);
      expect(run.status).toBe(1);
    } finally {
      writeFileSync(doc, before);
    }
  });

  it('does not read an archive the docs map names', () => {
    const doc = join(temp.copy, 'DESIGN-GAPS.archive.md');
    const before = readFileSync(doc, 'utf8');
    try {
      appendFileSync(doc, '\nThe planted line names `scripts/planted-missing.mjs`.\n');
      const run = audit(temp.copy);
      expect(run.stdout).not.toContain('planted-missing');
      expect(run.status).toBe(0);
    } finally {
      writeFileSync(doc, before);
    }
  });
});

describe('the docs checks are wired into verify and CI', () => {
  it('runs check:docs, map --check and audit:docs in verify, right after lint', () => {
    const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(scripts['check:docs']).toBe('node scripts/kit/check-docs.mjs');
    expect(scripts.map).toBe('node scripts/kit/map.mjs');
    expect(scripts['audit:docs']).toBe('node scripts/audit-doc-references.mjs');
    expect(scripts.verify.startsWith('npm run lint && npm run check:docs && npm run map -- --check && npm run audit:docs && ')).toBe(true);
  });

  it("runs them in CI's Architecture gates job, on the PR's whole range", () => {
    const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    const gates = ci.slice(ci.indexOf('\n  gates:'), ci.indexOf('\n  export:'));
    expect(gates).toContain('fetch-depth: 0');
    expect(gates).toContain("DOCS_BASE: origin/${{ github.base_ref || 'main' }}");
    for (const step of ['npm run check:docs', 'npm run map -- --check', 'npm run audit:docs']) {
      expect(gates).toContain(`- run: ${step}\n`);
    }
  });
});
