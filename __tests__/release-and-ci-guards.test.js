const { spawnSync } = require('node:child_process');
const { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { brotliCompressSync, gzipSync } = require('node:zlib');

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

const easJson = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const APP_ID = `${easJson.submit.production.ios.appleTeamId}.${appJson.expo.ios.bundleIdentifier}`;
/** npx answering as eas.json's eas-cli does to `--version`. */
const EAS_LINE = `echo 'eas-cli/${easJson.cli.version} darwin-arm64 node-v22'`;

/**
 * release-ios.sh with `args` in a temporary copy whose every gate passes — git on
 * origin/main and clean, gh and node green, curl the AASA naming the app, npx
 * answering as eas.json's eas-cli (and exiting 0, the doctor's call too), and an
 * Xcode 26.6, CocoaPods and fastlane that pass. `stubs` replace or add commands,
 * each a sh body that finds the copy in $STUB_DIR; `files` are written into the
 * copy first. Returns the exit status, the output and what `read(dir)` reads
 * from the copy before it is removed.
 */
function stubbedRelease(args, { stubs = {}, files = {}, read = () => ({}) } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mobile-release-stubbed-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'bin'));
    for (const file of ['scripts/release-ios.sh', 'scripts/eas-build-findings.mjs', 'app.json', 'eas.json']) {
      cpSync(join(root, file), join(dir, file));
    }
    const aasa = { applinks: { details: [{ appID: APP_ID }] }, webcredentials: { apps: [APP_ID] } };
    writeFileSync(join(dir, 'aasa.json'), JSON.stringify(aasa));
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), body);
    }
    const all = {
      npx: EAS_LINE,
      git: 'case "$1" in rev-parse) echo 0000000 ;; esac',
      gh: 'case "$1" in repo) echo autom8x/snoopy-mobile ;; api) echo "{}" ;; esac',
      node: 'echo green',
      curl: 'cat "$STUB_DIR/aasa.json"',
      xcodebuild: "printf '%s\\n' 'Xcode 26.6' 'Build version 17B100'",
      pod: 'echo 1.16.2',
      fastlane: 'echo fastlane 2.228.0',
      ...stubs,
    };
    for (const [name, body] of Object.entries(all)) {
      writeFileSync(join(dir, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    }
    const run = spawnSync('bash', [join(dir, 'scripts/release-ios.sh'), ...args], {
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, STUB_DIR: dir, PATH: `${join(dir, 'bin')}:${process.env.PATH}` },
    });
    return { status: run.status, out: run.stdout, ...read(dir) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
/** A file the stubs wrote into the copy, or '' when none did. */
const readIn = (dir, path) => (existsSync(join(dir, path)) ? readFileSync(join(dir, path), 'utf8') : '');

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

  it('runs that exact version at every eas-cli call in release-ios.sh, and one pinned expo-doctor, never the deprecated --no-install', () => {
    const lines = script.split('\n').filter((line) => /\bnpx\b/u.test(line) && !line.trimStart().startsWith('#'));
    const doctor = lines.filter((line) => line.includes('expo-doctor@'));
    expect(doctor).toEqual(['npx --yes "expo-doctor@$EXPO_DOCTOR_VERSION" > "$WORK/expo-doctor.log" 2>&1']);
    // The doctor's refusal names the fix, the project's own `npx expo install --fix`: words, not a call.
    const advice = lines.filter((line) => line.includes('(npx expo install --fix)'));
    expect(advice).toHaveLength(1);
    expect(advice[0].match(/\bnpx\b/gu)).toHaveLength(1);
    const calls = lines.filter((line) => !doctor.includes(line) && !advice.includes(line));
    expect(calls.length).toBeGreaterThanOrEqual(7);
    for (const line of calls) expect(line).toMatch(/\bnpx --yes "?eas-cli@\$EAS_VERSION"? /u);
    expect(script).not.toContain('--no-install');
  });

  /**
   * The script's first lines, run in a temporary copy with eas.json naming
   * `cliVersion`: npx records its arguments and answers as eas-cli `reported`
   * would, and git refuses the fetch, the first gate after the version's.
   */
  function release(cliVersion, reported, edit = (text) => text) {
    const dir = mkdtempSync(join(tmpdir(), 'mobile-release-'));
    try {
      mkdirSync(join(dir, 'scripts'));
      mkdirSync(join(dir, 'bin'));
      writeFileSync(join(dir, 'scripts/release-ios.sh'), edit(script));
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

  it('release-ios.sh refuses a range in EXPO_DOCTOR_VERSION and never runs npx', () => {
    const pin = '\nEXPO_DOCTOR_VERSION=1.21.9\n';
    expect(script).toContain(pin);
    const run = release('9.8.7', '9.8.7', (text) => text.replace(pin, "\nEXPO_DOCTOR_VERSION='>= 1.21.0'\n"));
    expect(run.status).toBe(1);
    expect(run.out).toContain("REFUSED: EXPO_DOCTOR_VERSION '>= 1.21.0' is not one exact version");
    expect(run.npx).toBe('');
  });
});

describe("--local refuses an Xcode below 26.4, SDK 57's minimum, and Xcode 27 and later", () => {
  const appId = APP_ID;

  /**
   * `--local --dry-run` in a temporary copy whose every gate passes (stubbedRelease)
   * and whose xcodebuild prints `xcodeLine` first, as `xcodebuild -version` does,
   * and whose pod runs `podBody`.
   */
  function localDryRun(xcodeLine, podBody = 'echo 1.16.2') {
    return stubbedRelease(['--local', '--dry-run'], {
      stubs: { xcodebuild: `printf '%s\\n' '${xcodeLine}' 'Build version 17B100'`, pod: podBody },
    });
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

describe('release-ios.sh runs expo-doctor, pinned, before either path builds, the dry runs included', () => {
  const npxLog = 'echo "$*" >> "$STUB_DIR/npx.log"';
  // The doctor's own lines, as expo-doctor 1.21.9 printed them for build 46's tree.
  const DOCTOR_RED = [
    npxLog,
    "case \"$2\" in expo-doctor@*) printf '%s\\n' 'Running 21 checks on your project...' '20/21 checks passed. 1 checks failed. Possible issues detected:' '' '✖ Check that packages match versions required by installed Expo SDK'; exit 1 ;; esac",
    EAS_LINE,
  ].join('\n');
  const DOCTOR_GREEN = [
    npxLog,
    "case \"$2\" in expo-doctor@*) printf '%s\\n' 'Running 21 checks on your project...' '21/21 checks passed.'; exit 0 ;; esac",
    EAS_LINE,
  ].join('\n');
  const PATHS = [['--dry-run'], ['--local', '--dry-run']];

  it('refuses a failed doctor on both dry runs, naming its summary and each failed check, before the Mac toolchain', () => {
    for (const args of PATHS) {
      const run = stubbedRelease(args, { stubs: { npx: DOCTOR_RED } });
      expect(run.out).toContain(`live AASA applinks: ['${APP_ID}']`);
      expect(run.out).toContain('expo-doctor 1.21.9: 20/21 checks passed. 1 checks failed. Possible issues detected:');
      expect(run.out).toContain('  failed check: Check that packages match versions required by installed Expo SDK');
      expect(run.out).toContain(
        'REFUSED: expo-doctor failed: 20/21 checks passed; fix with a reviewed pull request (npx expo install --fix) or a reviewed expo.install.exclude entry named in README "Verification"',
      );
      expect(run.out).not.toContain('local toolchain:');
      expect(run.out).not.toContain('DRY RUN');
      expect(run.status).toBe(1);
    }
  });

  it('runs expo-doctor@1.21.9 once, prints its summary, then goes on to the dry run', () => {
    for (const args of PATHS) {
      const run = stubbedRelease(args, { stubs: { npx: DOCTOR_GREEN }, read: (dir) => ({ npx: readIn(dir, 'npx.log') }) });
      expect(run.npx.split('\n').filter((line) => line.includes('expo-doctor'))).toEqual(['--yes expo-doctor@1.21.9']);
      const summary = run.out.indexOf('expo-doctor 1.21.9: 21/21 checks passed.');
      expect(summary).toBeGreaterThan(-1);
      expect(run.out.indexOf('DRY RUN: every gate passed on 0000000')).toBeGreaterThan(summary);
      expect(run.status).toBe(0);
    }
  });
});

/** One line of an EAS build log, in @expo/eas-build-job's logger's shape; reserved values only. */
const BUILD_ID = '00000000-0000-4000-8000-000000000046';
const logLine = (phase, msg, extra = {}) =>
  JSON.stringify({ name: 'worker', phase, pid: 100, buildId: BUILD_ID, level: 30, msg, time: '2026-01-01T00:00:00.000Z', v: 0, ...extra });
/** A phase's lines: its START_PHASE marker, `body`, its END_PHASE marker with `result`. */
const phaseLines = (phase, result, body = []) => [
  logLine(phase, `Start phase: ${phase}`, { marker: 'START_PHASE' }),
  ...body.map((line) => (typeof line === 'string' ? logLine(phase, line) : logLine(phase, line.msg, line))),
  logLine(phase, `End phase: ${phase}`, { marker: 'END_PHASE', result, durationMs: 1000 }),
];
/** A build's JSON log, shaped as build 46's: the environment, EAS's doctor, then the build. */
function buildLog({ doctor = 'success', fastlane = 'success', withDoctor = true, extra = [] } = {}) {
  const checks =
    doctor === 'success'
      ? ['Running 21 checks on your project...', '21/21 checks passed.']
      : [
          'Running 21 checks on your project...',
          '20/21 checks passed. 1 checks failed. Possible issues detected:',
          '✖ Check that packages match versions required by installed Expo SDK',
          { msg: 'Command "expo doctor" failed.', level: 50 },
        ];
  return `${[
    ...phaseLines('SPIN_UP_BUILDER', 'success', [
      'Using VM template "macos-tahoe-26.5-xcode-26.6" running macOS Tahoe 26.5.2',
      'Installed software:',
      '- Xcode 26.6 (17F113)',
      '- Node.js 22.23.1',
      '  EXPO_TOKEN=********',
    ]),
    ...(withDoctor ? phaseLines('RUN_EXPO_DOCTOR', doctor, checks) : []),
    ...phaseLines('INSTALL_PODS', 'success'),
    ...phaseLines('RUN_FASTLANE', fastlane),
    ...extra,
  ].join('\n')}\n`;
}
/** The plain-text Xcode log EAS lists beside the JSON one. */
const XCODE_LOG = 'Command line invocation:\n    xcodebuild -workspace ./Example.xcworkspace\n\n** ARCHIVE SUCCEEDED **\n';
const ENVIRONMENT = [
  'EAS build environment: Using VM template "macos-tahoe-26.5-xcode-26.6" running macOS Tahoe 26.5.2',
  'EAS build environment: Xcode 26.6 (17F113)',
];

describe("EAS's own verdicts, read from its logs (scripts/eas-build-findings.mjs)", () => {
  const verdict = (texts) => evaluate('scripts/eas-build-findings.mjs', `m.buildVerdict(${JSON.stringify(texts)})`);
  const submission = (texts) => evaluate('scripts/eas-build-findings.mjs', `m.submissionLines(${JSON.stringify(texts)})`);

  it("refuses a doctor phase that ended warning, as build 46's did, listing its failed check and the build environment", () => {
    expect(verdict([buildLog({ doctor: 'warning' }), XCODE_LOG])).toEqual({
      ok: false,
      lines: [
        ...ENVIRONMENT,
        'EAS phase RUN_EXPO_DOCTOR: warning',
        'EAS doctor: 20/21 checks passed. 1 checks failed. Possible issues detected:',
        'EAS doctor failed check: Check that packages match versions required by installed Expo SDK',
      ],
      reason: "EAS's expo doctor phase (RUN_EXPO_DOCTOR) ended warning, not success",
    });
  });

  it('passes a doctor phase that ended success, and still lists every other phase that did not', () => {
    expect(verdict([buildLog({ fastlane: 'warning', extra: phaseLines('SAVE_CACHE', 'skipped') }), XCODE_LOG])).toEqual({
      ok: true,
      lines: [...ENVIRONMENT, 'EAS phase RUN_FASTLANE: warning', 'EAS phase SAVE_CACHE: skipped', 'EAS doctor: 21/21 checks passed.'],
    });
  });

  it('refuses a log with no doctor phase, or a doctor phase that never ended', () => {
    expect(verdict([buildLog({ withDoctor: false })])).toEqual({
      ok: false,
      lines: ENVIRONMENT,
      reason: "EAS's build logs have no end of the RUN_EXPO_DOCTOR phase: EAS's doctor verdict is unknown",
    });
    const cut = buildLog()
      .split('\n')
      .filter((line) => !(line.includes('"END_PHASE"') && line.includes('"RUN_EXPO_DOCTOR"')))
      .join('\n');
    const run = verdict([cut]);
    expect(run.ok).toBe(false);
    expect(run.lines).toContain('EAS phase RUN_EXPO_DOCTOR: started, never ended');
  });

  it('refuses logs that are empty, plain text only, or broken', () => {
    const empty = { ok: false, lines: [], reason: "EAS's build logs are empty" };
    expect(verdict([])).toEqual(empty);
    expect(verdict(['', '\n\n'])).toEqual(empty);
    expect(verdict([XCODE_LOG]).reason).toBe("EAS's build logs cannot be read: none of the 1 files is a JSON log");
    for (const bad of ['{"phase":"SPIN_UP_BUILDER","msg":"cut', '"a string"', '[1]', 'null']) {
      const lines = buildLog().split('\n');
      lines.splice(3, 0, bad);
      expect(verdict([lines.join('\n')]).reason).toBe("EAS's build logs cannot be read: log 1 line 4 is not a JSON object");
    }
  });

  it("lists the submission's warn and error lines and each line naming an ITMS- code, never a signed URL, and never refuses", () => {
    const log = [
      logLine('SUBMIT_TO_APP_STORE', 'Uploading the build'),
      logLine('SUBMIT_TO_APP_STORE', 'The upload carried a warning', { level: 40 }),
      logLine('SUBMIT_TO_APP_STORE', 'ITMS-90725: SDK version issue (example)'),
      logLine('SUBMIT_TO_APP_STORE', 'Apple answered', { err: { message: 'ITMS-90000: example' } }),
      logLine('FAIL_SUBMISSION', 'See https://logs.example.com/0001/submission.txt?X-Goog-Signature=00ff', { level: 50 }),
    ].join('\n');
    expect(submission([log, 'a plain line\nITMS-90725 named in plain text\n'])).toEqual([
      'EAS submission warn: The upload carried a warning',
      'EAS submission info: ITMS-90725: SDK version issue (example)',
      'EAS submission info: Apple answered (ITMS-90000)',
      'EAS submission error: See https://logs.example.com/0001/submission.txt?…',
      'EAS submission: ITMS-90725 named in plain text',
    ]);
    expect(submission([])).toEqual(['EAS submission logs: none']);
    expect(submission([logLine('SUBMIT_TO_APP_STORE', 'Uploaded')])).toEqual(['EAS submission logs: no warning, error or ITMS- line']);
  });

  it('reads a folder as release-ios.sh saves it: brotli as EAS serves it, gzip or plain; a refusal exits 1, a submission never does', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mobile-eas-logs-'));
    const cli = (mode, folder) =>
      spawnSync(process.execPath, ['scripts/eas-build-findings.mjs', mode, join(dir, folder)], { cwd: root, encoding: 'utf8', timeout: 30_000 });
    try {
      const write = (folder, files) => {
        mkdirSync(join(dir, folder));
        files.forEach((bytes, index) => writeFileSync(join(dir, folder, `log-${index + 1}.txt`), bytes));
      };
      write('brotli', [brotliCompressSync(buildLog()), brotliCompressSync(XCODE_LOG)]);
      write('gzip', [gzipSync(buildLog({ doctor: 'warning' }))]);
      write('plain', [buildLog(), XCODE_LOG]);
      for (const folder of ['brotli', 'plain']) {
        const pass = cli('build', folder);
        expect(pass.stdout).toBe(`${[...ENVIRONMENT, 'EAS doctor: 21/21 checks passed.'].join('\n')}\n`);
        expect(pass.status).toBe(0);
      }
      const refused = cli('build', 'gzip');
      expect(refused.stdout).toContain("\nREFUSED: EAS's expo doctor phase (RUN_EXPO_DOCTOR) ended warning, not success\n");
      expect(refused.status).toBe(1);
      const none = cli('build', 'missing');
      expect(none.stdout).toBe("REFUSED: EAS's build logs are empty\n");
      expect(none.status).toBe(1);
      const quiet = cli('submission', 'missing');
      expect(quiet.stdout).toBe('EAS submission logs: none\n');
      expect(quiet.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the cloud path reads EAS's log of the build before the ipa and the submit", () => {
  const SHA = '0123456789abcdef0123456789abcdef01234567';
  // Signed, as EAS's are: a query the output must never show.
  const LOG_URLS = ['https://logs.example.com/0001/build.txt?X-Goog-Signature=00ff', 'https://logs.example.com/0001/build-xcode.txt?X-Goog-Signature=00ff'];
  const ARCHIVE = 'https://artifacts.example.com/0001/app.ipa';

  /**
   * `npm run release:ios` (the cloud path) through every gate: npx answers the
   * doctor green, `build --json` with a build id and `build:view` with `status`,
   * HEAD's commit and the two log files; curl serves the AASA, and the logs
   * brotli-encoded as EAS's storage does, and fails the archive's download.
   */
  function cloudRelease(status, log) {
    const view = {
      id: BUILD_ID,
      status,
      gitCommitHash: SHA,
      error: status === 'ERRORED' ? { errorCode: 'EXAMPLE_ERROR', message: 'An example failure' } : null,
      logFiles: LOG_URLS,
      artifacts: { applicationArchiveUrl: ARCHIVE },
    };
    return stubbedRelease([], {
      files: {
        'view.json': JSON.stringify(view),
        'logs/build.txt': brotliCompressSync(log),
        'logs/build-xcode.txt': brotliCompressSync(XCODE_LOG),
      },
      stubs: {
        git: `case "$1" in rev-parse) echo ${SHA} ;; esac`,
        node: `case "$1" in scripts/eas-build-findings.mjs) exec '${process.execPath}' "$@" ;; *) echo green ;; esac`,
        npx: [
          'echo "$*" >> "$STUB_DIR/npx.log"',
          'case "$2" in expo-doctor@*) echo "21/21 checks passed."; exit 0 ;; esac',
          `case "$3" in --version) ${EAS_LINE} ;; build) echo '{"id":"${BUILD_ID}"}' ;; build:view) cat "$STUB_DIR/view.json" ;; esac`,
        ].join('\n'),
        curl: [
          'echo "$*" >> "$STUB_DIR/curl.log"',
          'out=""; url=""',
          'while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2 ;; -m) shift 2 ;; -*) shift ;; *) url="$1"; shift ;; esac; done',
          '[ -z "$out" ] && exec cat "$STUB_DIR/aasa.json"',
          'case "$url" in https://logs.example.com/*) name=${url%%\\?*}; cp "$STUB_DIR/logs/${name##*/}" "$out" ;; *) exit 22 ;; esac',
        ].join('\n'),
      },
      read: (dir) => ({ npx: readIn(dir, 'npx.log'), curl: readIn(dir, 'curl.log'), ipa: existsSync(join(dir, '.autom8x/release-ios/ipa')) }),
    });
  }

  it("refuses a FINISHED build whose doctor phase ended warning: no ipa fetched, nothing submitted, the build kept", () => {
    const run = cloudRelease('FINISHED', buildLog({ doctor: 'warning' }));
    expect(run.out).toContain(`build ${BUILD_ID} is of HEAD 0123456`);
    for (const line of ENVIRONMENT) expect(run.out).toContain(`\n${line}\n`);
    expect(run.out).toContain('\nEAS phase RUN_EXPO_DOCTOR: warning\n');
    expect(run.out).toContain('\nEAS doctor failed check: Check that packages match versions required by installed Expo SDK\n');
    expect(run.out).toContain(
      `REFUSED: EAS's log of build ${BUILD_ID} did not pass (above); the build is kept, not cancelled, and nothing is downloaded or submitted`,
    );
    expect(run.status).toBe(1);
    expect(run.npx).not.toMatch(/\bsubmit\b|build:cancel/u);
    expect(run.curl).toContain('https://logs.example.com/0001/build.txt');
    expect(run.curl).not.toContain(ARCHIVE);
    expect(run.ipa).toBe(false);
    expect(run.out).not.toContain('X-Goog-Signature');
  });

  it('goes on to the ipa when the doctor phase ended success', () => {
    const run = cloudRelease('FINISHED', buildLog());
    expect(run.out).toContain('\nEAS doctor: 21/21 checks passed.\n');
    expect(run.out).not.toContain('EAS phase ');
    expect(run.out).toContain("=== verify the ipa's entitlements before submitting ===");
    expect(run.curl).toContain(ARCHIVE);
    expect(run.out).toContain('REFUSED: no .app in the downloaded archive');
    expect(run.npx).not.toMatch(/\bsubmit\b/u);
    expect(run.out).not.toContain('X-Goog-Signature');
  });

  it('prints the findings of an ERRORED build before it exits', () => {
    const run = cloudRelease('ERRORED', buildLog({ fastlane: 'failed' }));
    expect(run.out).toContain('BUILD DID NOT FINISH: ERRORED');
    expect(run.out).toContain('\nEAS phase RUN_FASTLANE: failed\n');
    expect(run.status).toBe(1);
    expect(run.curl).not.toContain(ARCHIVE);
    expect(run.npx).not.toMatch(/\bsubmit\b/u);
  });
});

describe('the doctor\'s one escape, expo.install.exclude, is named in README "Verification" with its reason', () => {
  it('names every entry package.json excludes, and only those, each with its reason', () => {
    const exclude = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).expo?.install?.exclude ?? [];
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const from = readme.indexOf('\n## Verification\n');
    const section = readme.slice(from, readme.indexOf('\n## ', from + 1));
    const lead = "Excluded from the doctor's version check (`expo.install.exclude`), each with its reason:\n\n";
    expect(section).toContain(lead);
    const items = section.slice(section.indexOf(lead) + lead.length).split('\n\n')[0].split(/\n(?=- )/u);
    const named = items.map((item) => item.match(/^- `([^`]+)`: (\S[\s\S]{40,})$/u));
    expect(named.filter((match) => !match)).toEqual([]);
    expect(named.map(([, name]) => name).sort()).toEqual([...exclude].sort());
  });
});

describe('the nightly (NIGHT-7) is its own workflow calling ci.yml, and reports a red night (NIGHT-9)', () => {
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const nightly = readFileSync(join(root, '.github/workflows/nightly.yml'), 'utf8');
  const report = nightly.slice(nightly.indexOf('\n  report:\n'));

  it('schedules nightly.yml alone, which calls the whole of ci.yml from its job named CI', () => {
    expect(nightly).toMatch(/^on:\n {2}schedule:\n {4}- cron: '\d+ \d+ \* \* \*'\n\n/mu);
    expect(nightly).toContain('\n  ci:\n    name: CI\n    uses: $/.github/workflows/ci.yml\n');
    // The one secret a call passes: the private-data scan's pattern (change-class.test.js holds the step).
    expect(ci).toMatch(
      /^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_call:\n {4}# [^\n]*\n {4}secrets:\n {6}CLIENT_DENY_PATTERN:\n {8}required: true\n\n/mu,
    );
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
  it('pins every action by a 40-hex commit with its # vX.Y.Z comment (a $/ workflow is this commit; a ./ one is not, and fails)', () => {
    const refs = workflows.flatMap(([file, text]) =>
      [...text.matchAll(/^\s+(?:- )?uses: (\S+.*)$/gmu)].map(([, ref]) => [file, ref]).filter(([, ref]) => !ref.startsWith('$/')),
    );
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter(([, ref]) => !/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/u.test(ref))).toEqual([]);
  });

  it("drops every checkout's token and calls this repository's own workflow as $/ (zizmor's artipacked and self-repository; the kit's workflow lint)", () => {
    // No step fetches or pushes with git, so no checkout leaves the token in .git/config.
    const checkouts = workflows.flatMap(([file, text]) =>
      [...text.matchAll(/^( +)- uses: actions\/checkout@.*\n((?:\1 {2}.*\n)*)/gmu)].map(([, , rest]) => [file, /^ +persist-credentials: false$/mu.test(rest)]),
    );
    expect(checkouts.length).toBeGreaterThan(0);
    expect(checkouts.filter(([, dropped]) => !dropped).map(([file]) => file)).toEqual([]);
    // GitHub's self-repository form: this repository at the running commit, never the workspace's files.
    expect(workflows.filter(([, text]) => /^\s+(?:- )?uses: \.\//mu.test(text)).map(([file]) => file)).toEqual([]);
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

  it("names .nvmrc's Node major in package.json's engines, so npm and CI agree on one Node", () => {
    const major = readFileSync(join(root, '.nvmrc'), 'utf8').match(/^(\d+)\./u)?.[1];
    expect(major).toBeDefined();
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).engines?.node).toBe(`${major}.x`);
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
