const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

/**
 * Round 21, change-aware gates: scripts/change-class.mjs picks the pre-push
 * gate by change class (docs, code, full), every rail lands in full, an error
 * is full, and the pull-request CI it relies on still runs the whole suite.
 * The classifier is judged in a real Node, as release-and-ci-guards does.
 */
const root = resolve(__dirname, '..');
const classifier = pathToFileURL(join(root, 'scripts/change-class.mjs')).href;

/** Runs `expression` with the classifier's exports as `m`, and returns its JSON. */
function evaluate(expression) {
  const run = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `import * as m from ${JSON.stringify(classifier)};\nprocess.stdout.write(JSON.stringify(${expression}));`],
    { cwd: root, encoding: 'utf8' },
  );
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout);
}

/** The plan for name-status changes, with jest's related lookup stubbed. */
const planFor = (changes, related = { '__tests__/x.test.tsx': ['__tests__/x.test.tsx'] }, options = {}) =>
  evaluate(
    `m.plan(${JSON.stringify(changes)}, { recordsTestFiles: ['__tests__/doc-references.test.js'], listRelated: (f) => (${JSON.stringify(related)}[f] ?? ${JSON.stringify(
      Object.values(related)[0] ?? [],
    )}), ...${JSON.stringify(options)} })`,
  );
const cli = (...args) => spawnSync(process.execPath, ['scripts/change-class.mjs', ...args], { cwd: root, encoding: 'utf8' });
const M = (path) => ({ status: 'M', paths: [path] });
const cmds = (p) => p.commands.map((c) => c.cmd);

describe('the docs class', () => {
  it('README.md alone runs the docs checks and the records tests, found by a source search', () => {
    const run = cli('--files', 'README.md');
    expect(run.stdout.split('\n')[0]).toBe('change-class: docs — only Markdown changed');
    expect(run.stdout).toContain('npm run check:docs');
    expect(run.stdout).toContain('npm run map -- --check');
    expect(run.stdout).toContain('npm run audit:docs');
    expect(run.stdout).toMatch(/mkdir -p coverage && npx jest --ci --runTestsByPath .*'__tests__\/doc-references\.test\.js'.* --json --outputFile=coverage\/jest-related\.json/u);
    expect(run.stdout).toContain('node scripts/no-skipped-tests.mjs coverage/jest-related.json');
    expect(run.stdout).not.toContain('npm run verify');
    expect(run.stdout).toMatch(/change-class: skips .*lint.*audit:presses/u);
    expect(evaluate('m.recordsTests()')).toContain('__tests__/doc-references.test.js');
  });

  it('Markdown in the kit is full', () => {
    expect(cli('--files', '.claude/agents/x.md').stdout.split('\n')[0]).toBe('change-class: full — .claude/agents/x.md: the kit');
    expect(planFor([M('.github/x.md')]).cls).toBe('full');
  });
});

describe('the code class', () => {
  it('a component runs the fast checks and its related tests, and skips audit:presses out loud', () => {
    const p = planFor([M('components/x.tsx')], { 'components/x.tsx': ['__tests__/x.test.tsx'] });
    expect(p.cls).toBe('code');
    expect(cmds(p)).toEqual(
      expect.arrayContaining(['npm run lint', 'npm run typecheck', 'npm run audit:platform', 'npm run verify:platform-contracts', 'sh scripts/salvage-scan.sh']),
    );
    expect(cmds(p)).toContain("mkdir -p coverage && npx jest --ci --findRelatedTests 'components/x.tsx' --json --outputFile=coverage/jest-related.json");
    expect(cmds(p)).toContain('node scripts/no-skipped-tests.mjs coverage/jest-related.json');
    expect(cmds(p).join('\n')).not.toContain('audit:presses');
    expect(cmds(p)).not.toContain('npm run test:coverage');
    expect(p.skips.join('\n')).toContain('audit:presses');
  });

  it('a code file with no related test runs the whole test:coverage', () => {
    const p = planFor([M('components/x.tsx'), M('components/lonely.tsx')], { 'components/x.tsx': ['__tests__/x.test.tsx'], 'components/lonely.tsx': [] });
    expect(p.cls).toBe('code');
    expect(p.reason).toContain('components/lonely.tsx has no related test');
    expect(cmds(p)).toContain('npm run test:coverage');
    expect(cmds(p)).toContain('node scripts/no-skipped-tests.mjs');
    expect(cmds(p).join('\n')).not.toContain('--findRelatedTests');
  });

  it('a screen change adds the real-router proofs, which jest cannot relate to a route file', () => {
    const router = evaluate('m.realRouterTests()');
    expect(router).toContain('__tests__/real-router/root-boundary.test.tsx');
    const p = planFor([M('app/(auth)/_layout.tsx')], { 'app/(auth)/_layout.tsx': ['__tests__/tab-layout.test.tsx'] }, { routerTestFiles: router });
    const related = cmds(p).find((c) => c.includes('--findRelatedTests'));
    expect(related).toContain("'app/(auth)/_layout.tsx'");
    router.forEach((t) => expect(related).toContain(`'${t}'`));
    expect(cmds(planFor([M('components/x.tsx')], undefined, { routerTestFiles: router })).join('\n')).not.toContain('real-router');
    expect(planFor([M('app/x.tsx')]).cls).toBe('full');
  });

  it(`more than MAX_RELATED code files run the whole test:coverage without a lookup`, () => {
    const max = evaluate('m.MAX_RELATED');
    const many = Array.from({ length: max + 1 }, (_, i) => `components/c${i}.tsx`);
    const p = evaluate(
      `m.plan(${JSON.stringify(many.map(M))}, { recordsTestFiles: ['r'], listRelated: () => { throw new Error('looked up'); } })`,
    );
    expect(p.cls).toBe('code');
    expect(p.reason).toContain(`${max + 1} code files (over ${max})`);
    expect(cmds(p)).toContain('npm run test:coverage');
    expect(cmds(p).join('\n')).not.toContain('--findRelatedTests');
    expect(evaluate(`m.plan(${JSON.stringify(many.slice(0, max).map(M))}, { recordsTestFiles: ['r'], listRelated: () => ['t'] }).reason`)).toBe('app code changed');
  });

  it('a snapshot runs its own test, and Markdown beside code adds the records tests', () => {
    const p = planFor([M('__tests__/__snapshots__/x.test.tsx.snap'), M('README.md')]);
    expect(cmds(p)).toContain(
      "mkdir -p coverage && npx jest --ci --findRelatedTests '__tests__/x.test.tsx' '__tests__/doc-references.test.js' --json --outputFile=coverage/jest-related.json",
    );
  });
});

describe('the full class: every rail', () => {
  it.each([
    ['package.json', 'a dependency file'],
    ['package-lock.json', 'a dependency file'],
    ['app.config.js', 'test tooling, config or a gate script'],
    ['.github/workflows/ci.yml', 'CI config or hooks'],
    ['.githooks/pre-push', 'CI config or hooks'],
    ['scripts/change-class.mjs', 'the change classifier or its test'],
    ['test/jest-setup.js', 'test tooling, config or a gate script'],
    ['lib/generated/platform-contracts/x.ts', 'the contracts'],
    ['foo.txt', 'an unrecognised path'],
  ])('%s is full (%s), with today\'s whole gate', (path, why) => {
    const run = cli('--files', path);
    expect(run.stdout.split('\n')[0]).toBe(`change-class: full — ${path}: ${why}`);
    expect(run.stdout).toContain('npm run verify');
    expect(run.stdout).toContain('npm run audit:dependencies');
    expect(run.stdout).toContain('sh scripts/salvage-scan.sh');
  });

  it('a deleted or renamed non-Markdown file is full; a deleted Markdown file is not', () => {
    expect(planFor([{ status: 'D', paths: ['app/x.tsx'] }]).reason).toBe('deleted non-Markdown file app/x.tsx');
    expect(planFor([{ status: 'R', paths: ['components/a.tsx', 'components/b.tsx'] }]).cls).toBe('full');
    expect(planFor([{ status: 'D', paths: ['docs/old.md'] }]).cls).toBe('docs');
  });

  it('a classifier error, an empty change and --full are full', () => {
    const error = cli('--range', 'no-such-ref..also-not-a-ref');
    expect(error.stdout.split('\n')[0]).toMatch(/^change-class: full — classifier error: git diff .*\(fail safe\)$/u);
    expect(error.stdout).toContain('npm run verify');
    expect(evaluate("m.plan([], { recordsTestFiles: ['r'], listRelated: () => ['t'] }).reason")).toBe('no changed file was found (fail safe)');
    expect(planFor([M('components/x.tsx')], { 'components/x.tsx': ['t'] }, { full: true }).reason).toBe('--full');
    expect(cli('--files', 'README.md', '--full').stdout.split('\n')[0]).toBe('change-class: full — --full');
  });
});

describe('--run', () => {
  /** runPlan over three steps with a stub runner whose statuses are `statuses`; returns the exit, the commands run and their env. */
  const runWith = (statuses) =>
    evaluate(`(() => {
      const ran = [];
      const statuses = ${JSON.stringify(statuses)};
      const p = { cls: 'code', commands: [{ name: 'a', cmd: 'A' }, { name: 'b', cmd: 'B' }, { name: 'c', cmd: 'C' }] };
      const exit = m.runPlan(p, (cmd, env) => { ran.push({ cmd, env }); return statuses[ran.length - 1]; }, () => {});
      return { exit, ran };
    })()`);

  it('stops at the first red step with exit RED, and passes CI=1 to each step', () => {
    const { exit, ran } = runWith([0, 2, 0]);
    expect(exit).toBe(evaluate('m.RED'));
    expect(exit).toBe(10);
    expect(ran.map((r) => r.cmd)).toEqual(['A', 'B']);
    ran.forEach((r) => expect(r.env).toEqual({ CI: '1' }));
  });

  it('exits 0 when every step is green', () => {
    const { exit, ran } = runWith([0, 0, 0]);
    expect(exit).toBe(0);
    expect(ran.map((r) => r.cmd)).toEqual(['A', 'B', 'C']);
  });
});

describe('--worktree', () => {
  let repo;
  const git = (...args) => {
    const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(run.stderr);
  };
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'change-class-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    ['staged.md', 'unstaged.tsx', 'committed.md'].forEach((f) => writeFileSync(join(repo, f), 'one\n'));
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(join(repo, 'committed.md'), 'two\n');
    git('commit', '-q', '-am', 'on the branch');
    writeFileSync(join(repo, 'staged.md'), 'two\n');
    git('add', 'staged.md');
    writeFileSync(join(repo, 'unstaged.tsx'), 'two\n');
    writeFileSync(join(repo, 'untracked.txt'), 'new\n');
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  const changes = (args) => evaluate(`m.changesFrom(${JSON.stringify(args)}, ${JSON.stringify(repo)})`);

  it('diffs committed, staged and unstaged edits against the merge base, and adds untracked files', () => {
    expect(changes(['--worktree'])).toEqual([
      { status: 'M', paths: ['committed.md'] },
      { status: 'M', paths: ['staged.md'] },
      { status: 'M', paths: ['unstaged.tsx'] },
      { status: 'A', paths: ['untracked.txt'] },
    ]);
  });

  it('without --worktree, only the commits since the merge base', () => {
    expect(changes([])).toEqual([{ status: 'M', paths: ['committed.md'] }]);
  });
});

describe('what stays unchanged, and the hook', () => {
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');

  it("ci.yml runs on every pull request, no paths filter, and its Test job runs the whole suite, no skips and presses", () => {
    expect(ci).toContain('\non:\n  pull_request:\n  push:\n');
    expect(ci).not.toMatch(/^\s*paths(-ignore)?:/mu);
    const test = ci.slice(ci.indexOf('    name: Test\n'), ci.indexOf('    name: Architecture gates\n'));
    expect(test).toContain('- run: npm run test:coverage');
    expect(test).toContain('- run: node scripts/no-skipped-tests.mjs');
    expect(test).toContain('- run: npm run audit:presses');
  });

  it('nightly.yml still calls the whole of ci.yml', () => {
    expect(readFileSync(join(root, '.github/workflows/nightly.yml'), 'utf8')).toContain('uses: ./.github/workflows/ci.yml');
  });

  it(".githooks/pre-push runs the classifier's set, and the full set when the classifier fails", () => {
    const hook = readFileSync(join(root, '.githooks/pre-push'), 'utf8');
    expect(hook).toMatch(/^node scripts\/change-class\.mjs --run --worktree\n/mu);
    const fallback = hook.slice(hook.indexOf('  *)\n    echo "pre-push: the classifier failed'));
    expect(fallback).toContain(' npm run verify\n');
    expect(fallback).toContain('gate "audit:dependencies" npm run audit:dependencies\n');
    expect(fallback).toContain(' sh scripts/salvage-scan.sh\n');
    expect(hook).toContain('\nexport CI=1\n');
  });
});
