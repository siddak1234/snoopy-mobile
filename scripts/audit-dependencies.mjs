/**
 * Fails when a production dependency has a high or critical advisory that scripts/audit-allowlist.json does not name, or when an entry there is past its review-by date.
 *
 *   node scripts/audit-dependencies.mjs [--report <npm-audit.json>] [--today <YYYY-MM-DD>]
 *
 * The owner's security plan, item 8 (2026-11-15): the app's dependency bar
 * moves from critical to high, like the other repositories, with the
 * advisories open that day as named, dated exceptions. It runs
 * `npm audit --omit=dev --json` and judges each advisory (an object in a
 * vulnerability's `via`), not each package: a package that is high only
 * because it reaches another package's advisory is that advisory. Moderate,
 * low and info advisories pass; any other severity is at the bar.
 *
 * Red (exit 1): an advisory at the bar the allowlist does not name; an entry
 * whose `reviewBy` date has passed (UTC), whether or not its advisory is still
 * open; an allowlist that is not the shape below; and a report npm could not
 * give (the registry unreachable, an error, another report version), so the
 * bar is never skipped. An entry no advisory at the bar matches any more is
 * printed as stale, to remove, and does not fail.
 *
 * The allowlist: `{ "advisories": [{ "id": "GHSA-…", "package", "reason",
 * "reviewBy": "YYYY-MM-DD" }] }`, one entry per id. It prints advisory ids
 * only, never the report. `--report` reads a saved report instead of running
 * npm and `--today` sets the date: both for tests. CI and the full change
 * class run it as `npm run audit:dependencies`.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ALLOWLIST = 'scripts/audit-allowlist.json';
/** npm's severities under the bar; every other one, an unknown one too, is at it. */
const BELOW = new Set(['info', 'low', 'moderate']);
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const rank = (severity) => RANK[severity] ?? 5;
const GHSA = /GHSA(?:-[0-9a-z]{4}){3}/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const isDate = (text) => typeof text === 'string' && DATE.test(text) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The advisories in an `npm audit --json` report (version 2): one per id, at its highest severity. Throws on a report that is not one. */
export function advisories(report) {
  if (report === null || typeof report !== 'object') throw new Error('the report is not a JSON object');
  if (report.error) throw new Error(`npm audit failed: ${String(report.error.code ?? report.error.summary ?? 'no reason given').split('\n')[0].slice(0, 160)}`);
  if (report.auditReportVersion !== 2 || report.vulnerabilities === null || typeof report.vulnerabilities !== 'object') {
    throw new Error('the report is not npm audit report version 2');
  }
  const found = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities)) {
    for (const via of vulnerability?.via ?? []) {
      if (via === null || typeof via !== 'object') continue;
      const id = GHSA.exec(String(via.url ?? ''))?.[0] ?? `npm-advisory-${via.source}`;
      const severity = String(via.severity);
      if (!found.has(id) || rank(severity) > rank(found.get(id).severity)) found.set(id, { id, severity });
    }
  }
  return [...found.values()].sort(byId);
}

/** What is wrong with the allowlist's shape, one line each; empty when it is sound. */
export function allowlistProblems(allowlist) {
  if (allowlist === null || typeof allowlist !== 'object' || !Array.isArray(allowlist.advisories)) return ['it has no "advisories" list'];
  const problems = [];
  const seen = new Set();
  allowlist.advisories.forEach((entry, index) => {
    const at = `entry ${index + 1}`;
    if (entry === null || typeof entry !== 'object') return problems.push(`${at} is not an object`);
    if (typeof entry.id !== 'string' || !new RegExp(`^${GHSA.source}$`, 'u').test(entry.id)) problems.push(`${at}: "id" is not a GHSA id`);
    else if (seen.has(entry.id)) problems.push(`${at}: ${entry.id} is listed twice`);
    else seen.add(entry.id);
    for (const field of ['package', 'reason']) if (typeof entry[field] !== 'string' || entry[field].trim() === '') problems.push(`${at}: "${field}" is empty`);
    if (!isDate(entry.reviewBy)) problems.push(`${at}: "reviewBy" is not a YYYY-MM-DD date`);
  });
  return problems;
}

/**
 * The decision, pure: the report, the allowlist and today's date (YYYY-MM-DD, UTC) in; ok and the reasons out.
 * `error` is set when the report or the allowlist cannot be judged, which is red.
 */
export function decide(report, allowlist, today) {
  const result = { ok: false, error: undefined, found: 0, atBar: 0, allowed: [], unlisted: [], expired: [], stale: [] };
  if (!isDate(today)) return { ...result, error: `today (${String(today)}) is not a YYYY-MM-DD date` };
  const problems = allowlistProblems(allowlist);
  if (problems.length > 0) return { ...result, error: `${ALLOWLIST}: ${problems.join('; ')}` };
  let found;
  try {
    found = advisories(report);
  } catch (error) {
    return { ...result, error: error.message };
  }
  const entries = new Map(allowlist.advisories.map((entry) => [entry.id, entry]));
  const atBar = found.filter((advisory) => !BELOW.has(advisory.severity));
  for (const advisory of atBar) {
    const entry = entries.get(advisory.id);
    if (!entry) result.unlisted.push(advisory);
    else if (entry.reviewBy >= today) result.allowed.push({ ...advisory, reviewBy: entry.reviewBy });
  }
  for (const entry of [...entries.values()].sort(byId)) {
    if (entry.reviewBy < today) result.expired.push({ id: entry.id, reviewBy: entry.reviewBy });
    if (!atBar.some((advisory) => advisory.id === entry.id)) result.stale.push(entry.id);
  }
  return { ...result, found: found.length, atBar: atBar.length, ok: result.unlisted.length === 0 && result.expired.length === 0 };
}

/** The lines a decision prints: ids, severities and dates only. */
export function explain(decision) {
  const out = [];
  if (decision.error) {
    out.push(`audit:dependencies: RED, nothing judged: ${decision.error}`);
    return out;
  }
  out.push(`audit:dependencies: ${decision.found} advisories in production dependencies, ${decision.atBar} high or critical (the bar)`);
  for (const a of decision.allowed) out.push(`  allowed until ${a.reviewBy}: ${a.id} (${a.severity})`);
  for (const a of decision.unlisted) out.push(`  NOT ALLOWED: ${a.id} (${a.severity})`);
  for (const e of decision.expired) out.push(`  EXPIRED on ${e.reviewBy}: ${e.id}`);
  for (const id of decision.stale) out.push(`  stale, remove it from ${ALLOWLIST}: ${id} (no advisory at the bar)`);
  if (decision.ok) out.push('audit:dependencies: green');
  else {
    out.push(
      `audit:dependencies: RED. Fix the dependency, or list the advisory in ${ALLOWLIST} (id, package, reason, reviewBy); an expired entry is reviewed, then fixed or given a new date.`,
    );
  }
  return out;
}

/** `npm audit --omit=dev --json`'s report; npm exits 1 when it finds any advisory, so the JSON decides, not the exit. */
function npmAudit() {
  const run = spawnSync('npm', ['audit', '--omit=dev', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 180_000 });
  if (run.error) throw new Error(`npm audit did not run (${run.error.code ?? run.error.message})`);
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new Error(`npm audit gave no JSON (exit ${run.status})`);
  }
}

function main(args) {
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const today = value('--today') ?? new Date().toISOString().slice(0, 10);
  let report;
  let allowlist;
  try {
    allowlist = JSON.parse(readFileSync(resolve(root, ALLOWLIST), 'utf8'));
    // `--report -` reads standard input by its descriptor: `/dev/stdin` fails on Linux when it is a socket.
    const from = value('--report');
    report = from ? JSON.parse(readFileSync(from === '-' ? 0 : resolve(from), 'utf8')) : npmAudit();
  } catch (error) {
    console.log(`audit:dependencies: RED, nothing judged: ${error.message}`);
    return 1;
  }
  const decision = decide(report, allowlist, today);
  for (const line of explain(decision)) console.log(line);
  return decision.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
