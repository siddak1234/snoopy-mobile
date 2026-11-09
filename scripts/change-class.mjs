/**
 * The pre-push gate by change class (Round 21, change-aware gates): docs, code or full, and the exact commands each runs.
 *
 *   node scripts/change-class.mjs [--worktree | --range A..B | --files p ...] [--full] [--run]
 *
 * The changed files are `git diff --name-status <merge base with origin/main>`
 * to HEAD, or to the working tree with `--worktree` (staged, unstaged and
 * untracked files too: what .githooks/pre-push judges); `--range` and `--files`
 * are for tests and evidence. The class, its reason, the commands and what the
 * class skips are printed FIRST; `--run` then runs the commands in order and the
 * first red one stops the run (exit 10). `--full` forces the full class.
 *
 * - full: today's whole gate — `CI=1 npm run verify`, `audit:dependencies` and
 *   the salvaged-client-data scan. Every rail lands here: a dependency file,
 *   the contracts, the kit, CI config and hooks, test tooling and every
 *   script, this classifier and its test, a deleted or renamed non-Markdown
 *   file, an unrecognised path, an empty change, and any classifier error (it
 *   never fails open).
 * - docs: only Markdown outside .claude/ and .github/ (and docs-map's records
 *   files): the docs checks and the records tests — the jest tests whose source
 *   reads a Markdown path, found by a source search here, never a hand list.
 * - code: the screens, components, constants, hooks, lib (not lib/generated),
 *   assets and tests: the fast checks and every static audit, then jest's
 *   related tests for the changed files with the no-skipped check. A code file
 *   with no related test, or more than MAX_RELATED files, runs the whole
 *   `test:coverage` instead. `audit:presses` needs the whole suite's coverage,
 *   so this class skips it and says so; CI's Test job runs it on every PR.
 *
 * GitHub CI (ci.yml) runs the whole suite on every pull request regardless.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Over this many code files, the related lookup is skipped and the whole suite runs. */
export const MAX_RELATED = 15;
/** The exit code of a red gate; any other non-zero exit is a classifier error. */
export const RED = 10;

const DEPENDENCY = new Set(['package.json', 'package-lock.json', '.npmrc', '.nvmrc']);
const TOOLING = new Set([
  'tsconfig.json',
  'eslint.config.js',
  'babel.config.js',
  '.babelrc',
  'metro.config.js',
  'jest.config.js',
  'app.config.js',
  'app.json',
  'eas.json',
]);
const CLASSIFIER = new Set(['scripts/change-class.mjs', '__tests__/change-class.test.js']);
const CODE = ['app/', 'components/', 'constants/', 'hooks/', 'lib/', 'assets/', '__tests__/'];

/** One path's class and why: 'docs', 'code' or 'full'. */
export function classifyPath(path, records = []) {
  if (CLASSIFIER.has(path)) return { cls: 'full', why: 'the change classifier or its test' };
  if (path.startsWith('.claude/') || path.startsWith('scripts/kit/')) return { cls: 'full', why: 'the kit' };
  if (path.startsWith('.github/') || path.startsWith('.githooks/')) return { cls: 'full', why: 'CI config or hooks' };
  if (DEPENDENCY.has(path)) return { cls: 'full', why: 'a dependency file', dependency: true };
  if (path.startsWith('lib/generated/') || path === 'platform-requirement.json') {
    return { cls: 'full', why: 'the contracts' };
  }
  if (TOOLING.has(path) || path.startsWith('test/') || path.startsWith('scripts/')) {
    return { cls: 'full', why: 'test tooling, config or a gate script' };
  }
  if (path.endsWith('.md') || records.includes(path)) return { cls: 'docs', why: 'Markdown' };
  if (CODE.some((prefix) => path.startsWith(prefix))) return { cls: 'code', why: 'app code or tests' };
  return { cls: 'full', why: 'an unrecognised path' };
}

/** `git diff --name-status` text as [{ status, paths }]. */
export function parseNameStatus(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [status, ...paths] = line.split('\t');
      if (!status || paths.length === 0) throw new Error(`unreadable name-status line: ${JSON.stringify(line)}`);
      return { status: status[0], paths };
    });
}

/** The jest tests whose source reads a Markdown path (the records tests), sorted. */
export function recordsTests(base = root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(base, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.test\.[jt]sx?$/u.test(entry.name) && /\.md['"`]/u.test(readFileSync(join(base, path), 'utf8'))) {
        found.push(path);
      }
    }
  };
  walk('__tests__');
  return found.sort();
}

const q = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const step = (name, cmd) => ({ name, cmd });

export const FULL_COMMANDS = [
  step('verify (lint, docs checks, typecheck, architecture gates, contracts, tests with coverage, presses, facts)', 'npm run verify'),
  step('audit:dependencies', 'npm run audit:dependencies'),
  step('No salvaged client data', 'sh scripts/salvage-scan.sh'),
];
const DOCS_CHECKS = [
  step('check:docs', 'npm run check:docs'),
  step('map --check', 'npm run map -- --check'),
  step('audit:docs', 'npm run audit:docs'),
];
const FAST = [
  step('lint', 'npm run lint'),
  ...DOCS_CHECKS,
  step('typecheck', 'npm run typecheck'),
  ...['credentials', 'tokens', 'type', 'spacing', 'vocabulary', 'haptics', 'fixtures', 'platform'].map((a) =>
    step(`audit:${a}`, `npm run audit:${a}`),
  ),
  step('verify:platform-contracts', 'npm run verify:platform-contracts'),
  step('No salvaged client data', 'sh scripts/salvage-scan.sh'),
];
// jest writes its --outputFile into an existing folder only: a fresh clone has no coverage/.
const RELATED_REPORT = 'coverage/jest-related.json';
const WHOLE_SUITE = [
  step('test:coverage (the whole suite)', 'npm run test:coverage'),
  step('no skipped tests', 'node scripts/no-skipped-tests.mjs'),
];
const relatedSteps = (flag, files) => [
  step(
    `jest (${flag === '--runTestsByPath' ? 'the records tests' : 'tests related to the change'})`,
    `mkdir -p coverage && npx jest --ci ${flag} ${files.map(q).join(' ')} --json --outputFile=${RELATED_REPORT}`,
  ),
  step('no skipped tests', `node scripts/no-skipped-tests.mjs ${RELATED_REPORT}`),
];
const EXPORTS = 'the native bundle exports (CI-only)';

/** The test a snapshot file belongs to, else the path itself. */
const testOf = (path) => {
  const m = /^(.*)__snapshots__\/(.+)\.snap$/u.exec(path);
  return m ? `${m[1]}${m[2]}` : path;
};

/**
 * The plan for a change: { cls, reason, files, commands, skips }.
 * `listRelated(file)` returns the tests jest relates to one file.
 */
export function plan(changes, { full = false, records = [], recordsTestFiles = [], listRelated } = {}) {
  const files = changes.flatMap((c) => c.paths);
  const fullPlan = (reason) => ({ cls: 'full', reason, files, commands: FULL_COMMANDS, skips: [EXPORTS] });
  if (full) return fullPlan('--full');
  if (changes.length === 0) return fullPlan('no changed file was found (fail safe)');
  const md = (p) => p.endsWith('.md');
  for (const { status, paths } of changes) {
    if (!'MADRCT'.includes(status)) return fullPlan(`status ${status} on ${paths.join(' -> ')} is not recognised`);
    if ((status === 'D' || status === 'R') && !paths.every(md)) {
      return fullPlan(`${status === 'D' ? 'deleted' : 'renamed'} non-Markdown file ${paths.join(' -> ')}`);
    }
  }
  const touched = changes.flatMap(({ status, paths }) => (status === 'R' ? paths : paths.slice(-1)));
  const kinds = touched.map((p) => ({ path: p, ...classifyPath(p, records) }));
  const rail = kinds.find((k) => k.cls === 'full');
  if (rail) return fullPlan(`${rail.path}: ${rail.why}`);

  const code = kinds.filter((k) => k.cls === 'code').map((k) => k.path);
  const hasDocs = kinds.some((k) => k.cls === 'docs');
  if (code.length === 0) {
    if (recordsTestFiles.length === 0) return fullPlan('no records test was found (fail safe)');
    return {
      cls: 'docs',
      reason: 'only Markdown changed',
      files,
      commands: [...DOCS_CHECKS, ...relatedSteps('--runTestsByPath', recordsTestFiles)],
      skips: ['lint', 'typecheck', 'the static audits', 'verify:platform-contracts', 'the whole test suite', 'audit:presses', 'audit:dependencies', EXPORTS],
    };
  }

  const skips = ['audit:presses (needs the whole suite\'s coverage; CI\'s Test job runs it)', 'repo-facts (verify writes it at the land step)', 'audit:dependencies (no dependency file changed; CI runs it)', EXPORTS];
  const targets = [...new Set([...code.map(testOf), ...(hasDocs ? recordsTestFiles : [])])];
  let fallback = null;
  if (code.length > MAX_RELATED) fallback = `${code.length} code files (over ${MAX_RELATED})`;
  else {
    if (typeof listRelated !== 'function') throw new Error('no related-test lookup');
    const lonely = code.find((file) => listRelated(testOf(file)).length === 0);
    if (lonely) fallback = `${lonely} has no related test`;
  }
  if (fallback) {
    return {
      cls: 'code',
      reason: `app code changed; ${fallback}, so the whole suite runs`,
      files,
      commands: [...FAST, ...WHOLE_SUITE],
      skips,
    };
  }
  return {
    cls: 'code',
    reason: 'app code changed',
    files,
    commands: [...FAST, ...relatedSteps('--findRelatedTests', targets)],
    skips: [...skips, 'the tests unrelated to the change (CI runs the whole suite)'],
  };
}

function git(args) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${(run.stderr || '').trim() || `exit ${run.status}`}`);
  return run.stdout;
}

/** The changes the arguments name. */
export function changesFrom(args) {
  const files = args.indexOf('--files');
  if (files !== -1) {
    return args.slice(files + 1).filter((a) => !a.startsWith('--')).map((p) => ({ status: 'M', paths: [p] }));
  }
  const range = args.indexOf('--range');
  if (range !== -1) {
    const value = args[range + 1];
    if (!value || !value.includes('..')) throw new Error('--range needs A..B');
    return parseNameStatus(git(['diff', '--name-status', '-M', value]));
  }
  const base = git(['merge-base', 'origin/main', 'HEAD']).trim();
  if (!args.includes('--worktree')) return parseNameStatus(git(['diff', '--name-status', '-M', base, 'HEAD']));
  const tracked = parseNameStatus(git(['diff', '--name-status', '-M', base]));
  const untracked = git(['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean)
    .map((p) => ({ status: 'A', paths: [p] }));
  return [...tracked, ...untracked];
}

/** jest's related tests for one file, as repository paths. */
function jestRelated(file) {
  const run = spawnSync(process.execPath, ['node_modules/jest/bin/jest.js', '--listTests', '--json', '--findRelatedTests', file], {
    cwd: root,
    encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(`jest --listTests for ${file}: exit ${run.status} ${(run.stderr || '').trim()}`);
  const json = run.stdout.trim().split('\n').pop();
  return JSON.parse(json).map((p) => relative(root, p));
}

/** Classifies the arguments' change; any error is the full class. */
export function decide(args, lookups = {}) {
  try {
    const recordsFile = join(root, 'docs/docs-map.json');
    const map = existsSync(recordsFile) ? JSON.parse(readFileSync(recordsFile, 'utf8')) : {};
    const records = [...(map.records?.current ?? []), ...(map.records?.archive ?? [])];
    return plan(changesFrom(args), {
      full: args.includes('--full'),
      records,
      recordsTestFiles: lookups.recordsTestFiles ?? recordsTests(),
      listRelated: lookups.listRelated ?? jestRelated,
    });
  } catch (error) {
    return { cls: 'full', reason: `classifier error: ${String(error.message).replace(/\s+/gu, ' ').trim()} (fail safe)`, files: [], commands: FULL_COMMANDS, skips: [EXPORTS] };
  }
}

export function explain(p) {
  const lines = [`change-class: ${p.cls} — ${p.reason}`, `change-class: ${p.files.length} changed file(s)${p.files.length ? `: ${p.files.join(', ')}` : ''}`, 'change-class: runs'];
  p.commands.forEach((c, i) => lines.push(`  ${i + 1}. ${c.name}: ${c.cmd}`));
  lines.push(`change-class: skips ${p.skips.join('; ')}`);
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const p = decide(args);
  console.log(explain(p));
  if (args.includes('--run')) {
    const started = Date.now();
    const secs = (t) => Math.round((Date.now() - t) / 1000);
    for (const c of p.commands) {
      console.log(`change-class: ${c.name}`);
      const t0 = Date.now();
      const run = spawnSync('sh', ['-c', c.cmd], { cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1' } });
      if (run.status !== 0) {
        console.log(`change-class: RED — '${c.name}' (exit ${run.status ?? run.signal}) after ${secs(started)} s`);
        process.exit(RED);
      }
      console.log(`change-class: ${c.name} — green in ${secs(t0)} s`);
    }
    console.log(`change-class: every ${p.cls} gate green in ${secs(started)} s`);
  }
}
