const { spawnSync } = require('node:child_process');
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
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

// git's own list of its repository variables, which git exports to a hook: under a linked worktree's pre-push they sent
// the scratch repo's git into the pushed repository (scripts/kit/kit.test.mjs, snoopy-backend §12.1 #342), so no git
// child here is given them.
const GIT_REPO = spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).stdout.trim().split('\n');
/** This process's environment without git's repository variables. */
const quietEnv = () => {
  const env = { ...process.env };
  for (const key of GIT_REPO) delete env[key];
  return env;
};

/** Runs `expression` with the classifier's exports as `m`, and returns its JSON. */
function evaluate(expression, env = process.env) {
  const run = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `import * as m from ${JSON.stringify(classifier)};\nprocess.stdout.write(JSON.stringify(${expression}));`],
    { cwd: root, encoding: 'utf8', env },
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
/** CI's "No private data" step: the kit's scanner over every tracked file. */
const SCAN = 'node scripts/kit/private-data-scan.mjs --tree';
/** CI's "Workflow lint" step: the kit's zizmor over .github/workflows/. */
const LINT = 'node scripts/kit/workflow-lint.mjs';
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
      expect.arrayContaining(['npm run lint', 'npm run typecheck', 'npm run audit:platform', 'npm run verify:platform-contracts', SCAN]),
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
    expect(run.stdout).toContain(SCAN);
    expect(run.stdout).toContain(LINT);
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
  /** git in `cwd` without the inherited repository variables, signing or hooks. */
  const git = (cwd, ...args) => {
    const run = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', env: quietEnv() });
    if (run.status !== 0) throw new Error(run.stderr);
    return run.stdout;
  };
  /** A scratch repository with a commit on origin/main, one on the branch, and staged, unstaged and untracked edits. */
  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), 'change-class-'));
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.email', 't@example.com');
    git(dir, 'config', 'user.name', 't');
    ['staged.md', 'unstaged.tsx', 'committed.md'].forEach((f) => writeFileSync(join(dir, f), 'one\n'));
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'base');
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(join(dir, 'committed.md'), 'two\n');
    git(dir, 'commit', '-q', '-am', 'on the branch');
    writeFileSync(join(dir, 'staged.md'), 'two\n');
    git(dir, 'add', 'staged.md');
    writeFileSync(join(dir, 'unstaged.tsx'), 'two\n');
    writeFileSync(join(dir, 'untracked.txt'), 'new\n');
    return dir;
  };
  beforeAll(() => {
    repo = scratch();
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  const changes = (args, dir = repo) => evaluate(`m.changesFrom(${JSON.stringify(args)}, ${JSON.stringify(dir)})`, quietEnv());
  const worktreeChanges = [
    { status: 'M', paths: ['committed.md'] },
    { status: 'M', paths: ['staged.md'] },
    { status: 'M', paths: ['unstaged.tsx'] },
    { status: 'A', paths: ['untracked.txt'] },
  ];

  it('diffs committed, staged and unstaged edits against the merge base, and adds untracked files', () => {
    expect(changes(['--worktree'])).toEqual(worktreeChanges);
  });

  it('without --worktree, only the commits since the merge base', () => {
    expect(changes([])).toEqual([{ status: 'M', paths: ['committed.md'] }]);
  });

  it('leaves the repository an inherited GIT_DIR names untouched', () => {
    const outer = mkdtempSync(join(tmpdir(), 'change-class-outer-'));
    let inner;
    const was = process.env.GIT_DIR;
    try {
      git(outer, 'init', '-q', '-b', 'main');
      writeFileSync(join(outer, 'o.txt'), 'o\n');
      git(outer, 'add', '.');
      git(outer, '-c', 'user.name=o', '-c', 'user.email=o@example.com', 'commit', '-q', '-m', 'outer');
      git(outer, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      const look = () => [git(outer, 'for-each-ref'), git(outer, 'rev-list', '--all'), git(outer, 'config', '--local', '--list'), readFileSync(join(outer, '.git/index'), 'base64')];
      const seen = look();
      process.env.GIT_DIR = join(outer, '.git');
      try {
        inner = scratch();
        expect(changes(['--worktree'], inner)).toEqual(worktreeChanges);
      } finally {
        if (was === undefined) delete process.env.GIT_DIR;
        else process.env.GIT_DIR = was;
      }
      expect(look()).toEqual(seen);
    } finally {
      rmSync(outer, { recursive: true, force: true });
      if (inner) rmSync(inner, { recursive: true, force: true });
    }
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
    expect(readFileSync(join(root, '.github/workflows/nightly.yml'), 'utf8')).toContain('uses: $/.github/workflows/ci.yml');
  });

  it(".githooks/pre-push runs the classifier's set, and the full set when the classifier fails", () => {
    const hook = readFileSync(join(root, '.githooks/pre-push'), 'utf8');
    expect(hook).toMatch(/^node scripts\/change-class\.mjs --run --worktree\n/mu);
    const fallback = hook.slice(hook.indexOf('  *)\n    echo "pre-push: the classifier failed'));
    expect(fallback).toContain(' npm run verify\n');
    expect(fallback).toContain('gate "audit:dependencies" npm run audit:dependencies\n');
    expect(fallback).toContain('gate "No private data" node scripts/kit/private-data-scan.mjs --tree\n');
    expect(hook).toContain('\nexport CI=1\n');
  });
});

describe('no private data: CI, the classes and both hooks run the kit scanner (the owner, 2026-11-15)', () => {
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const nightly = readFileSync(join(root, '.github/workflows/nightly.yml'), 'utf8');

  it("ci.yml's step runs the classes' command with the pattern from the secret, and the nightly passes it", () => {
    expect(evaluate('m.PRIVATE_DATA_SCAN')).toBe(SCAN);
    expect(ci).toContain(`      - name: No private data\n        env:\n          CLIENT_DENY_PATTERN: \${{ secrets.CLIENT_DENY_PATTERN }}\n        run: ${SCAN}\n`);
    expect(nightly).toContain('    uses: $/.github/workflows/ci.yml\n');
    expect(nightly).toContain('    secrets:\n      CLIENT_DENY_PATTERN: ${{ secrets.CLIENT_DENY_PATTERN }}\n');
    // The pattern lives in the secret and the kit, never in a file here.
    expect(ci).not.toMatch(/git grep[^\n]*-[a-zA-Z]*E/u);
    expect(existsSync(join(root, 'scripts/salvage-scan.sh'))).toBe(false);
  });

  it("ci.yml's gates job runs the full class's workflow lint after the scan (the prevention plan's zizmor)", () => {
    expect(evaluate('m.WORKFLOW_LINT')).toBe(LINT);
    expect(evaluate("m.FULL_COMMANDS.map((c) => c.cmd)")).toContain(LINT);
    const gates = ci.slice(ci.indexOf('    name: Architecture gates\n'), ci.indexOf('    name: Native bundle export\n'));
    const scan = gates.indexOf(`        run: ${SCAN}\n`);
    expect(scan).toBeGreaterThan(0);
    expect(gates.indexOf(`      - name: Workflow lint\n        run: ${LINT}\n`)).toBeGreaterThan(scan);
  });

  it('both hooks are executable in the index', () => {
    const modes = spawnSync('git', ['ls-files', '-s', '.githooks'], { cwd: root, encoding: 'utf8', env: quietEnv() }).stdout;
    expect(modes).toMatch(/^100755 \S+ 0\t\.githooks\/pre-commit$/mu);
    expect(modes).toMatch(/^100755 \S+ 0\t\.githooks\/pre-push$/mu);
  });

  /** The kit scanner's stand-in: logs its arguments, then exits STUB_EXIT. */
  const STUB = [
    "import { appendFileSync } from 'node:fs';",
    "appendFileSync('scan.log', `${JSON.stringify(process.argv.slice(2))}\\n`);",
    'process.exit(Number(process.env.STUB_EXIT));',
    '',
  ].join('\n');
  /** The workflow lint's stand-in: logs its arguments and stdin, then exits LINT_EXIT (0 when unset). */
  const LINT_STUB = [
    "import { appendFileSync, readFileSync } from 'node:fs';",
    "appendFileSync('lint.log', `${JSON.stringify({ args: process.argv.slice(2), input: readFileSync(0, 'utf8') })}\\n`);",
    'process.exit(Number(process.env.LINT_EXIT ?? 0));',
    '',
  ].join('\n');
  const dirs = [];
  afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  /** A scratch repository with `hook`, the stub scanner and a green classifier. */
  const hookRepo = (hook) => {
    const dir = mkdtempSync(join(tmpdir(), 'private-data-hook-'));
    dirs.push(dir);
    const init = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, encoding: 'utf8', env: quietEnv() });
    if (init.status !== 0) throw new Error(init.stderr);
    mkdirSync(join(dir, '.githooks'));
    mkdirSync(join(dir, 'scripts/kit'), { recursive: true });
    copyFileSync(join(root, hook), join(dir, hook));
    writeFileSync(join(dir, 'scripts/kit/private-data-scan.mjs'), STUB);
    writeFileSync(join(dir, 'scripts/kit/workflow-lint.mjs'), LINT_STUB);
    writeFileSync(join(dir, 'scripts/change-class.mjs'), 'process.exit(0);\n');
    return dir;
  };
  const runHook = (dir, hook, input, exit, lintExit = 0) =>
    spawnSync('sh', [hook, 'origin', 'https://example.com/r.git'], {
      cwd: dir,
      encoding: 'utf8',
      input,
      env: { ...quietEnv(), STUB_EXIT: String(exit), LINT_EXIT: String(lintExit) },
    });
  const logged = (name) => (dir) =>
    existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [];
  const scans = logged('scan.log');
  const lints = logged('lint.log');
  const PUSH = 'refs/heads/main 1111111111111111111111111111111111111111 refs/heads/main 0000000000000000000000000000000000000000\n';

  it.each([
    [1, 'is red (exit 1)'],
    [2, 'is red (exit 2)'],
  ])('pre-push runs the scanner with --push first, and a scanner exit %i refuses the push', (exit, said) => {
    const dir = hookRepo('.githooks/pre-push');
    const run = runHook(dir, '.githooks/pre-push', PUSH, exit);
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(`pre-push: REFUSED — the gate 'No private data (the pushed commits)' ${said}`);
    expect(run.stdout).not.toContain('the gate by change class');
    expect(scans(dir)).toEqual([['--push']]);
    expect(lints(dir)).toEqual([]);
  });

  it.each([
    [1, 'is red (exit 1)'],
    [2, 'is red (exit 2)'],
  ])('pre-push runs the workflow lint after a clean scan, and a lint exit %i refuses the push before the change class', (exit, said) => {
    const dir = hookRepo('.githooks/pre-push');
    const run = runHook(dir, '.githooks/pre-push', PUSH, 0, exit);
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(`pre-push: REFUSED — the gate 'Workflow lint' ${said}`);
    expect(run.stdout).not.toContain('the gate by change class');
    expect(scans(dir)).toEqual([['--push']]);
    expect(lints(dir)).toEqual([{ args: ['--pre-push'], input: PUSH }]);
  });

  it('pre-push goes on to the change class when the scan is clean, and scans nothing for a delete or an empty push', () => {
    const dir = hookRepo('.githooks/pre-push');
    const run = runHook(dir, '.githooks/pre-push', PUSH, 0);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('pre-push: No private data (the pushed commits) — green');
    expect(run.stdout).toContain('pre-push: Workflow lint — green');
    expect(run.stdout).toContain('pre-push: the gate by change class');
    expect(lints(dir)).toEqual([{ args: ['--pre-push'], input: PUSH }]);
    for (const input of ['(delete) 0000000000000000000000000000000000000000 refs/heads/old 1111111111111111111111111111111111111111\n', '']) {
      const quiet = hookRepo('.githooks/pre-push');
      expect(runHook(quiet, '.githooks/pre-push', input, 1, 1).status).toBe(0);
      expect(scans(quiet)).toEqual([]);
      expect(lints(quiet)).toEqual([]);
    }
  });

  it.each([
    [0, 0, ''],
    [1, 1, 'pre-commit: REFUSED — private data in the staged changes (named above). Nothing was committed.'],
    [2, 1, 'pre-commit: REFUSED — the private-data scanner failed (exit 2). Nothing was committed.'],
  ])('pre-commit runs the scanner on what is staged: scanner exit %i, hook exit %i', (exit, status, said) => {
    const dir = hookRepo('.githooks/pre-commit');
    const run = runHook(dir, '.githooks/pre-commit', '', exit);
    expect(run.status).toBe(status);
    expect(run.stdout.trim()).toBe(said);
    expect(scans(dir)).toEqual([['--staged']]);
  });
});
