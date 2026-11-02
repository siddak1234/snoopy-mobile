const { spawnSync } = require('node:child_process');
const { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

/**
 * Round 21 hardening: the release gate reads only the PUSH run's all-green
 * (scripts/all-green-on-head.mjs, beside the nightly), a skipped test is red
 * (scripts/no-skipped-tests.mjs, M4), and the contract is read from a
 * hash-checked copy that never lets verify:platform-contracts skip (M1).
 * Each script's verdict is a pure function, judged here in a real Node.
 */
const root = resolve(__dirname, '..');
const url = (path) => pathToFileURL(join(root, path)).href;

/** Runs `expression` with the module's exports as `m`, and returns its JSON. */
function evaluate(module, expression, env = {}) {
  const run = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import * as m from ${JSON.stringify(url(module))};\n` +
        `const out = await (async () => (${expression}))();\n` +
        'process.stdout.write(JSON.stringify(out));',
    ],
    { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } },
  );
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout);
}

describe("the release gate's all-green: the push run's only", () => {
  const APP = 15368;
  const PUSH_SUITE = 111;
  const NIGHT_SUITE = 222;
  const pushRuns = { workflow_runs: [{ event: 'push', check_suite_id: PUSH_SUITE }] };
  const check = (suite, conclusion, appId = APP) => ({
    name: 'all-green',
    status: 'completed',
    conclusion,
    html_url: `https://github.com/x/runs/${suite}`,
    app: { id: appId },
    check_suite: { id: suite },
  });
  const pick = (input) => evaluate('scripts/all-green-on-head.mjs', `m.pickAllGreen(${JSON.stringify(input)})`);

  it('keeps the push suite\'s all-green when the nightly added a second one on the same commit', () => {
    const verdict = pick({
      pushRuns,
      checkRuns: { check_runs: [check(NIGHT_SUITE, 'success'), check(PUSH_SUITE, 'success')] },
      appId: APP,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.check.check_suite.id).toBe(PUSH_SUITE);
  });

  it('refuses a red push run, however green the nightly is', () => {
    const verdict = pick({
      pushRuns,
      checkRuns: { check_runs: [check(NIGHT_SUITE, 'success'), check(PUSH_SUITE, 'failure')] },
      appId: APP,
    });
    expect(verdict).toEqual({ ok: false, reason: expect.stringContaining('completed/failure') });
  });

  it('refuses when the push suite has no all-green (the nightly\'s alone is not enough)', () => {
    const verdict = pick({ pushRuns, checkRuns: { check_runs: [check(NIGHT_SUITE, 'success')] }, appId: APP });
    expect(verdict).toEqual({ ok: false, reason: expect.stringContaining('found 0') });
  });

  it('refuses with no push run, and ignores another app\'s check named all-green', () => {
    expect(pick({ pushRuns: { workflow_runs: [] }, checkRuns: { check_runs: [] }, appId: APP })).toEqual({
      ok: false,
      reason: 'no push run of ci.yml on HEAD',
    });
    const verdict = pick({ pushRuns, checkRuns: { check_runs: [check(PUSH_SUITE, 'success', 29110)] }, appId: APP });
    expect(verdict.ok).toBe(false);
  });

  it('is what release-ios.sh runs, in place of counting every all-green on HEAD', () => {
    const script = readFileSync(join(root, 'scripts/release-ios.sh'), 'utf8');
    expect(script).toContain('actions/workflows/ci.yml/runs?head_sha=$HEAD_SHA&event=push');
    expect(script).toContain('node scripts/all-green-on-head.mjs "$WORK/push-runs.json" "$WORK/check-runs.json" "$GITHUB_ACTIONS_APP_ID"');
    expect(script).not.toContain('grep -c .');
  });
});

describe('eas-cli is pinned (the release CLI)', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const version = pkg.devDependencies['eas-cli'];

  it('is an exact devDependency, and eas.json names the same version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8')).cli.version).toBe(version);
  });

  it('is bumped by hand: Dependabot ignores it, so a grouped npm bump never splits package.json from eas.json', () => {
    const dependabot = readFileSync(join(root, '.github/dependabot.yml'), 'utf8');
    const npm = dependabot.slice(dependabot.indexOf('package-ecosystem: npm'));
    expect(npm).toMatch(/\n {4}ignore:\n {6}- dependency-name: eas-cli\n/u);
  });

  it('runs from the lockfile at every call in release-ios.sh, never a download', () => {
    const script = readFileSync(join(root, 'scripts/release-ios.sh'), 'utf8');
    const calls = script.split('\n').filter((line) => /\bnpx\b/u.test(line) && !line.trimStart().startsWith('#'));
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const line of calls) expect(line).toMatch(/npx --no-install eas-cli\b/u);
  });
});

describe('no skipped tests (M4)', () => {
  const problems = (report) => evaluate('scripts/no-skipped-tests.mjs', `m.skippedTestProblems(${JSON.stringify(report)})`);

  it('passes a run with every test run, and fails a skipped, a todo or an empty one', () => {
    expect(problems({ numTotalTests: 3, numPassedTests: 3, numPendingTests: 0, numTodoTests: 0 })).toEqual([]);
    expect(problems({ numTotalTests: 3, numPendingTests: 1, numTodoTests: 0 })).toEqual(['1 skipped']);
    expect(problems({ numTotalTests: 3, numPendingTests: 0, numTodoTests: 2 })).toEqual(['2 todo']);
    expect(problems({ numTotalTests: 0, numPendingTests: 0, numTodoTests: 0 })).toEqual(['the suite ran no tests']);
  });

  it('is wired: test:coverage writes the report, and CI and verify read it', () => {
    const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(scripts['test:coverage']).toContain('--json --outputFile=coverage/jest-results.json');
    expect(scripts.verify).toContain('npm run test:coverage && node scripts/no-skipped-tests.mjs && ');
    const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('      - run: npm run test:coverage\n      # No silent skips');
    expect(ci).toContain('      - run: node scripts/no-skipped-tests.mjs\n');
  });
});

describe('the contract copy (M1): read without a backend, and never skipped', () => {
  const generator = 'scripts/generate-platform-contracts.mjs';
  const copy = join(root, 'lib/generated/snoopy-backend');
  const resolveWith = (env, present) =>
    evaluate(
      generator,
      `(() => { try { const r = m.resolveBackend({ env: ${JSON.stringify(env)}, exists: (p) => ${JSON.stringify(present)}.some((x) => p.endsWith(x)) }); return { from: r.from, root: r.backendRoot }; } catch (e) { return { error: e.message }; } })()`,
      { SNOOPY_BACKEND_ROOT: copy },
    );

  it('reads SNOOPY_BACKEND_ROOT, else the sibling, else the copy, and fails with none', () => {
    expect(resolveWith({ SNOOPY_BACKEND_ROOT: '/x/backend' }, ['/x/backend'])).toEqual({ from: 'SNOOPY_BACKEND_ROOT', root: '/x/backend' });
    expect(resolveWith({}, ['/snoopy-backend', 'lib/generated/snoopy-backend']).from).toBe('sibling');
    expect(resolveWith({}, ['lib/generated/snoopy-backend'])).toEqual({ from: 'copy', root: copy });
    expect(resolveWith({ SNOOPY_BACKEND_ROOT: copy }, ['lib/generated/snoopy-backend']).from).toBe('copy');
    expect(resolveWith({}, []).error).toMatch(/^no contract to read/u);
    expect(resolveWith({ SNOOPY_BACKEND_ROOT: '/x/gone' }, []).error).toMatch(/does not exist$/u);
  });

  it('the committed copy passes its SHA256SUMS, and one edited byte fails it', () => {
    const check = (dir) => evaluate(generator, `m.checkCopy(${JSON.stringify(dir)})`, { SNOOPY_BACKEND_ROOT: copy });
    expect(check(copy)).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), 'mobile-copy-'));
    try {
      cpSync(copy, dir, { recursive: true });
      const rules = join(dir, 'packages/contracts/fixtures/block-rules/words.json');
      writeFileSync(rules, readFileSync(rules, 'utf8').replace('{', '{ '));
      expect(check(dir)).toEqual([expect.stringMatching(/^packages\/contracts\/fixtures\/block-rules\/words\.json is sha256 /u)]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('verify:platform-contracts reading the copy fails on an edited copy file, and never exits 0 without a contract', () => {
    const verify = (env) =>
      spawnSync(process.execPath, ['scripts/verify-platform-contracts.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
    // A temporary copy (SNOOPY_CONTRACT_COPY): the committed one, which other
    // suites read in parallel, is never written.
    const dir = mkdtempSync(join(tmpdir(), 'mobile-copy-'));
    try {
      cpSync(copy, dir, { recursive: true });
      const target = join(dir, 'docs/repo-facts.schema.json');
      writeFileSync(target, `${readFileSync(target, 'utf8')} `);
      const edited = verify({ SNOOPY_BACKEND_ROOT: dir, SNOOPY_CONTRACT_COPY: dir });
      expect(edited.status).not.toBe(0);
      expect(edited.stdout).toContain('Contract read from copy');
      expect(edited.stderr).toContain('docs/repo-facts.schema.json is sha256 ');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const none = verify({ SNOOPY_BACKEND_ROOT: join(tmpdir(), 'no-such-backend-root') });
    expect(none.status).not.toBe(0);
    expect(none.stderr).toContain('does not exist');
  });
});
