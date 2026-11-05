const { spawnSync } = require('node:child_process');
const { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

/**
 * Round 21 hardening: the release gate reads only the PUSH run's all-green
 * (scripts/all-green-on-head.mjs, beside the nightly), a skipped test is red
 * (scripts/no-skipped-tests.mjs, M4), and the contract is read from a
 * hash-checked copy that never lets verify:platform-contracts skip (M1).
 * Each script's verdict is a pure function, judged here in a real Node; the
 * .github configuration's own rules are read from its files. Lint's four
 * React Compiler rules (eslint.config.js) are read through ESLint itself.
 */
const root = resolve(__dirname, '..');
const url = (path) => pathToFileURL(join(root, path)).href;
/** Every workflow file, as [name, text]. */
const workflows = readdirSync(join(root, '.github/workflows'))
  .filter((file) => /\.ya?ml$/u.test(file))
  .map((file) => [file, readFileSync(join(root, '.github/workflows', file), 'utf8')]);

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
  const check = (suite, conclusion, appId = APP, name = 'all-green') => ({
    name,
    status: 'completed',
    conclusion,
    html_url: `https://github.com/x/runs/${suite}`,
    app: { id: appId },
    check_suite: { id: suite },
  });
  // nightly.yml calls ci.yml from its job named CI, so the nightly's check is
  // `CI / all-green`, in the nightly run's own suite.
  const nightly = (conclusion) => check(NIGHT_SUITE, conclusion, APP, 'CI / all-green');
  const pick = (input) => evaluate('scripts/all-green-on-head.mjs', `m.pickAllGreen(${JSON.stringify(input)})`);

  it('keeps the push suite\'s all-green when the nightly\'s CI / all-green is on the same commit', () => {
    const verdict = pick({
      pushRuns,
      checkRuns: { check_runs: [nightly('success'), check(PUSH_SUITE, 'success')] },
      appId: APP,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.check.check_suite.id).toBe(PUSH_SUITE);
  });

  it('refuses a red push run, however green the nightly is', () => {
    const verdict = pick({
      pushRuns,
      checkRuns: { check_runs: [nightly('success'), check(PUSH_SUITE, 'failure')] },
      appId: APP,
    });
    expect(verdict).toEqual({ ok: false, reason: expect.stringContaining('completed/failure') });
  });

  it('refuses when the push suite has no all-green (the nightly\'s, or another suite\'s, is not enough)', () => {
    for (const other of [nightly('success'), check(NIGHT_SUITE, 'success')]) {
      const verdict = pick({ pushRuns, checkRuns: { check_runs: [other] }, appId: APP });
      expect(verdict).toEqual({ ok: false, reason: expect.stringContaining('found 0') });
    }
  });

  it('takes no check named otherwise, even in the push suite', () => {
    const verdict = pick({ pushRuns, checkRuns: { check_runs: [check(PUSH_SUITE, 'success', APP, 'CI / all-green')] }, appId: APP });
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
    expect(script).toContain('check-runs?check_name=all-green&');
    expect(script).toContain('node scripts/all-green-on-head.mjs "$WORK/push-runs.json" "$WORK/check-runs.json" "$GITHUB_ACTIONS_APP_ID"');
    expect(script).not.toContain('grep -c .');
  });
});

describe("eas-cli is eas.json's one exact cli.version, run with npx (Expo's version policy)", () => {
  const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
  const script = readFileSync(join(root, 'scripts/release-ios.sh'), 'utf8');

  it('is one exact version in eas.json, and no dependency of the app or in its lockfile', () => {
    expect(eas.cli.version).toMatch(/^\d+\.\d+\.\d+$/u);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('eas-cli');
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    expect(Object.keys(lock.packages).filter((path) => /(^|\/)node_modules\/eas-cli$/u.test(path))).toEqual([]);
  });

  it('runs that exact version at every call in release-ios.sh, never the deprecated --no-install', () => {
    const calls = script.split('\n').filter((line) => /\bnpx\b/u.test(line) && !line.trimStart().startsWith('#'));
    expect(calls.length).toBeGreaterThanOrEqual(7);
    for (const line of calls) expect(line).toMatch(/\bnpx --yes "?eas-cli@\$EAS_VERSION"? /u);
    expect(script).not.toContain('--no-install');
  });

  /**
   * The script's first lines, run in a temporary copy with eas.json naming
   * `cliVersion`: npx records its arguments and answers as eas-cli `reported`
   * would, and git refuses the fetch, the first gate after the version's.
   */
  function release(cliVersion, reported) {
    const dir = mkdtempSync(join(tmpdir(), 'mobile-release-'));
    try {
      mkdirSync(join(dir, 'scripts'));
      mkdirSync(join(dir, 'bin'));
      cpSync(join(root, 'scripts/release-ios.sh'), join(dir, 'scripts/release-ios.sh'));
      cpSync(join(root, 'app.json'), join(dir, 'app.json'));
      writeFileSync(join(dir, 'eas.json'), JSON.stringify({ ...eas, cli: { ...eas.cli, version: cliVersion } }));
      const log = join(dir, 'npx.log');
      writeFileSync(join(dir, 'bin/npx'), `#!/bin/sh\necho "$*" >> '${log}'\necho 'eas-cli/${reported} darwin-arm64 node-v22'\n`, { mode: 0o755 });
      writeFileSync(join(dir, 'bin/git'), '#!/bin/sh\ncase "$1" in fetch) exit 1 ;; rev-parse) echo 0000000 ;; esac\n', { mode: 0o755 });
      const run = spawnSync('bash', [join(dir, 'scripts/release-ios.sh'), '--dry-run'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` },
      });
      return { status: run.status, out: run.stdout, npx: existsSync(log) ? readFileSync(log, 'utf8') : '' };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("release-ios.sh runs eas.json's version, prints it and goes on to the gates when eas-cli reports it", () => {
    const run = release('9.8.7', '9.8.7');
    expect(run.npx).toBe('--yes eas-cli@9.8.7 --version\n');
    expect(run.out).toMatch(/^tree: 0000000 dirty=0 app: \S+ eas-cli 9\.8\.7$/mu);
    expect(run.out).toContain('REFUSED: cannot fetch origin');
  });

  it('release-ios.sh refuses before any gate when eas-cli reports another version', () => {
    const run = release('9.8.7', '9.8.6');
    expect(run.status).toBe(1);
    expect(run.out).toContain("REFUSED: eas-cli 9.8.7 (eas.json cli.version) did not run: got 'eas-cli 9.8.6'");
    expect(run.out).not.toContain('cannot fetch origin');
  });

  it('release-ios.sh refuses a range in eas.json and never runs npx', () => {
    const run = release('>= 22.0.0', '27.2.0');
    expect(run.status).toBe(1);
    expect(run.out).toContain("REFUSED: eas.json cli.version '>= 22.0.0' is not one exact version");
    expect(run.npx).toBe('');
  });
});

describe("--local refuses an Xcode below 26.4, SDK 57's minimum, and Xcode 27 and later", () => {
  const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
  const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
  const appId = `${eas.submit.production.ios.appleTeamId}.${app.expo.ios.bundleIdentifier}`;

  /**
   * `--local --dry-run` in a temporary copy whose every gate passes — git on
   * origin/main and clean, gh and node green, curl the AASA naming the app —
   * and whose xcodebuild prints `xcodeLine` first, as `xcodebuild -version` does,
   * and whose pod runs `podBody`.
   */
  function localDryRun(xcodeLine, podBody = 'echo 1.16.2') {
    const dir = mkdtempSync(join(tmpdir(), 'mobile-release-local-'));
    try {
      mkdirSync(join(dir, 'scripts'));
      mkdirSync(join(dir, 'bin'));
      cpSync(join(root, 'scripts/release-ios.sh'), join(dir, 'scripts/release-ios.sh'));
      cpSync(join(root, 'app.json'), join(dir, 'app.json'));
      cpSync(join(root, 'eas.json'), join(dir, 'eas.json'));
      const aasa = { applinks: { details: [{ appID: appId }] }, webcredentials: { apps: [appId] } };
      writeFileSync(join(dir, 'aasa.json'), JSON.stringify(aasa));
      const stubs = {
        npx: `echo 'eas-cli/${eas.cli.version} darwin-arm64 node-v22'`,
        git: 'case "$1" in rev-parse) echo 0000000 ;; esac',
        gh: 'case "$1" in repo) echo autom8x/snoopy-mobile ;; api) echo "{}" ;; esac',
        node: 'echo green',
        curl: `cat '${join(dir, 'aasa.json')}'`,
        xcodebuild: `printf '%s\\n' '${xcodeLine}' 'Build version 17B100'`,
        pod: podBody,
        fastlane: 'echo fastlane 2.228.0',
      };
      for (const [name, body] of Object.entries(stubs)) {
        writeFileSync(join(dir, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      }
      const run = spawnSync('bash', [join(dir, 'scripts/release-ios.sh'), '--local', '--dry-run'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` },
      });
      return { status: run.status, out: run.stdout };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("refuses Xcode 26.3, 26.2 (SDK 55's floor), 26.1.1, a bare 26 and an unreadable version, after every other gate passed", () => {
    for (const line of ['Xcode 26.3', 'Xcode 26.2', 'Xcode 26.1.1', 'Xcode 26', 'Xcode']) {
      const run = localDryRun(line);
      expect(run.out).toContain(`live AASA applinks: ['${appId}']`);
      expect(run.out).toContain('REFUSED: --local needs Xcode 26.4 or later for SDK 57');
      expect(run.out).not.toContain('DRY RUN');
      expect(run.status).toBe(1);
    }
  });

  it("refuses Xcode 27.0 and this Mac's 27.2: the app has no scene life cycle, and 27.2 could not archive SDK 55's pods", () => {
    for (const line of ['Xcode 27.0', 'Xcode 27.2']) {
      const run = localDryRun(line);
      expect(run.out).toContain(
        "REFUSED: --local needs an Xcode before 27 for SDK 57: Xcode 27 needs the scene life cycle, which this app does not opt into; build in EAS's cloud",
      );
      expect(run.out).not.toContain('local toolchain:');
      expect(run.out).not.toContain('DRY RUN');
      expect(run.status).toBe(1);
    }
  });

  it("passes Xcode 26.4, 26.6 (EAS's SDK 57 image) and 26.10, printing the toolchain before the dry run stops", () => {
    for (const version of ['26.4', '26.6', '26.10']) {
      const run = localDryRun(`Xcode ${version}`);
      expect(run.out).toContain(`local toolchain: Xcode ${version}, CocoaPods 1.16.2, fastlane 2.228.0`);
      expect(run.out).toContain('DRY RUN: every gate passed on 0000000');
      expect(run.status).toBe(0);
    }
  });

  it('refuses a CocoaPods whose pod --version fails, prints nothing or prints no version — 2026-11-04 printed "CocoaPods ," and passed', () => {
    for (const pod of ['echo "[!] You have not agreed to the Xcode license." >&2; exit 1', 'exit 0', 'echo', 'echo not-a-version']) {
      const run = localDryRun('Xcode 26.4', pod);
      expect(run.out).toContain('REFUSED: --local needs a working CocoaPods (pod --version gave no version number)');
      expect(run.out).not.toContain('local toolchain:');
      expect(run.out).not.toContain('DRY RUN');
      expect(run.status).toBe(1);
    }
    // A warning printed before the version: the version is its last line.
    const run = localDryRun('Xcode 26.4', 'echo "a warning"; echo 1.16.2');
    expect(run.out).toContain('local toolchain: Xcode 26.4, CocoaPods 1.16.2, fastlane 2.228.0');
    expect(run.out).toContain('DRY RUN');
    expect(run.status).toBe(0);
  });
});

describe('the nightly (NIGHT-7) is its own workflow calling ci.yml, and reports a red night (NIGHT-9)', () => {
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const nightly = readFileSync(join(root, '.github/workflows/nightly.yml'), 'utf8');
  const report = nightly.slice(nightly.indexOf('\n  report:\n'));

  it('schedules nightly.yml alone, which calls the whole of ci.yml from its job named CI', () => {
    expect(nightly).toMatch(/^on:\n {2}schedule:\n {4}- cron: '\d+ \d+ \* \* \*'\n\n/mu);
    expect(nightly).toContain('\n  ci:\n    name: CI\n    uses: ./.github/workflows/ci.yml\n');
    expect(ci).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_call:\n\n/mu);
    expect(ci).not.toMatch(/^\s+schedule:/mu);
  });

  it('opens or comments on a "Nightly red" issue from its own job, only when the called CI failed', () => {
    expect(report).toContain("\n    needs: [ci]\n    # Any night that is not green: failed, cancelled or timed out.\n    if: always() && needs.ci.result != 'success'\n");
    expect(report).toContain("gh issue create --repo \"$GITHUB_REPOSITORY\" --title 'Nightly red'");
    // Only the bot's own issue is reused: anyone can open one with that title here.
    expect(report).toContain("--author 'github-actions[bot]'");
    expect(report).toContain('map(select(.title == "Nightly red"))');
    expect(ci).not.toContain('Nightly red');
  });

  it("grants issues: write to that job alone, and ci.yml's jobs contents: read only", () => {
    const writes = workflows.flatMap(([, text]) => text.split('\n').filter((line) => /^\s+issues: write$/u.test(line)));
    expect(writes).toHaveLength(1);
    const header = report.slice(0, report.indexOf('    steps:'));
    expect(header).toContain('    permissions:\n      issues: write\n');
    expect(header).not.toContain('contents:');
    expect(ci).toMatch(/^permissions:\n {2}contents: read\n\n/mu);
    expect(ci.match(/^\s*permissions:/gmu)).toHaveLength(1);
  });
});

describe("the .github configuration's own rules (the website's structure-contract holds the same)", () => {
  it('pins every action by a 40-hex commit with its # vX.Y.Z comment (a ./ workflow is this commit)', () => {
    const refs = workflows.flatMap(([file, text]) =>
      [...text.matchAll(/^\s+(?:- )?uses: (\S+.*)$/gmu)].map(([, ref]) => [file, ref]).filter(([, ref]) => !ref.startsWith('./')),
    );
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter(([, ref]) => !/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/u.test(ref))).toEqual([]);
  });

  it("gives every setup-node .nvmrc's Node, one exact version, and names no Node of its own", () => {
    expect(readFileSync(join(root, '.nvmrc'), 'utf8')).toMatch(/^\d+\.\d+\.\d+\n$/u);
    const wrong = workflows.filter(([, text]) => {
      const setups = text.match(/uses: actions\/setup-node@/gu) ?? [];
      const fromNvmrc = text.match(/uses: actions\/setup-node@.*\n {8}with:\n(?: {10}.*\n)*? {10}node-version-file: \.nvmrc\n/gu) ?? [];
      return /node-version: /u.test(text) || fromNvmrc.length !== setups.length;
    });
    expect(wrong.map(([file]) => file)).toEqual([]);
  });

  it('sets timeout-minutes on every job that runs on a runner (a job calling a workflow cannot)', () => {
    const jobs = workflows.flatMap(([file, text]) =>
      text
        .slice(text.indexOf('\njobs:\n'))
        .split(/\n(?= {2}[\w-]+:\n)/u)
        .slice(1)
        .filter((job) => !/\n {4}uses: /u.test(job))
        .map((job) => [`${file}: ${job.trim().split(':')[0]}`, /\n {4}timeout-minutes: \d+\n/u.test(job)]),
    );
    expect(jobs.length).toBeGreaterThanOrEqual(8);
    expect(jobs.filter(([, timed]) => !timed).map(([job]) => job)).toEqual([]);
  });

  it('has Dependabot update the actions alone, weekly: no npm version updates (§12.1 #278)', () => {
    const dependabot = readFileSync(join(root, '.github/dependabot.yml'), 'utf8');
    expect([...dependabot.matchAll(/^\s+- package-ecosystem: (\S+)$/gmu)].map((m) => m[1])).toEqual(['github-actions']);
    expect(dependabot).toContain('\n    schedule:\n      interval: weekly\n');
  });
});

describe("lint: react-hooks 7's four React Compiler rules warn only in the files written before them", () => {
  const RULES = ['react-hooks/purity', 'react-hooks/refs', 'react-hooks/set-state-in-effect', 'react-hooks/static-components'];
  // One component for each rule, broken as the listed files break it: a ref read in
  // render, Date.now() in render, a component made in render, a state set in an effect.
  const PROBE = [
    "import { useEffect, useRef, useState } from 'react';",
    'export function Refs() { const ref = useRef(0); return ref.current; }',
    'export function Purity() { const at = useRef(Date.now()); return at; }',
    'export function StaticComponents() { const Inner = () => null; return <Inner />; }',
    'export function SetStateInEffect() { const [n, setN] = useState(0); useEffect(() => { setN(1); }, []); return n; }',
    '',
  ].join('\n');
  // Read in a real Node through ESLint's own API and eslint.config.js: the list is the
  // block that makes the four warn; PROBE is linted as a new file and as each listed one,
  // and each listed file itself is linted as it is.
  const script = `
    const { join } = require('node:path');
    const { ESLint } = require('eslint');
    const root = ${JSON.stringify(root)};
    const RULES = ${JSON.stringify(RULES)};
    const PROBE = ${JSON.stringify(PROBE)};
    const block = require(join(root, 'eslint.config.js')).find((c) => c.rules && RULES.every((r) => c.rules[r] === 'warn'));
    const listed = block.files ?? [];
    const severities = (messages) =>
      Object.fromEntries(RULES.map((r) => [r, [...new Set(messages.filter((m) => m.ruleId === r).map((m) => m.severity))]]));
    (async () => {
      const eslint = new ESLint({ cwd: root });
      const probe = async (path) => severities((await eslint.lintText(PROBE, { filePath: join(root, path) }))[0].messages);
      const fresh = {};
      for (const path of ['app/probe.tsx', 'components/probe.tsx']) fresh[path] = await probe(path);
      const asListed = {};
      for (const path of listed) asListed[path] = await probe(path);
      const breaks = {};
      for (const r of await eslint.lintFiles(listed.map((path) => join(root, path))))
        breaks[r.filePath.slice(root.length + 1)] = r.messages.filter((m) => RULES.includes(m.ruleId)).length;
      process.stdout.write(JSON.stringify({ listed, fresh, asListed, breaks }));
    })();
  `;
  const every = (severity) => Object.fromEntries(RULES.map((r) => [r, [severity]]));
  let read;
  beforeAll(() => {
    const run = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8', timeout: 120_000 });
    if (run.status !== 0) throw new Error(run.stderr);
    read = JSON.parse(run.stdout);
  }, 130_000);

  it('fails a file not on the list on each of the four (an error, as eslint-config-expo 57 sets them)', () => {
    expect(read.fresh).toEqual({ 'app/probe.tsx': every(2), 'components/probe.tsx': every(2) });
  });

  it('warns on each of the four in every listed file, and each listed file still breaks one', () => {
    expect(read.listed.length).toBeGreaterThan(0);
    expect(read.asListed).toEqual(Object.fromEntries(read.listed.map((path) => [path, every(1)])));
    expect(Object.keys(read.breaks).sort()).toEqual([...read.listed].sort());
    expect(read.listed.filter((path) => read.breaks[path] === 0)).toEqual([]);
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
