const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

/**
 * audit:dependencies (the owner's security plan, item 8): a high or critical
 * advisory in a production dependency fails unless scripts/audit-allowlist.json
 * names it and its reviewBy date has not passed. The decision is judged in a
 * real Node, as change-class does, on reports shaped like npm audit's own
 * (version 2): an advisory is an object in a vulnerability's `via`, and a
 * package that is high only through another package (a string in `via`) is not
 * one more advisory.
 */
const root = resolve(__dirname, '..');
const script = join(root, 'scripts/audit-dependencies.mjs');
const moduleUrl = pathToFileURL(script).href;

/** Runs `expression` with the script's exports as `m`, and returns its JSON. */
function evaluate(expression) {
  const run = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `import * as m from ${JSON.stringify(moduleUrl)};\nprocess.stdout.write(JSON.stringify(${expression}));`],
    { cwd: root, encoding: 'utf8' },
  );
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout);
}
const decide = (report, allowlist, today = '2026-11-15') =>
  evaluate(`m.decide(${JSON.stringify(report)}, ${JSON.stringify(allowlist)}, ${JSON.stringify(today)})`);

const advisory = (id, severity, dependency) => ({
  source: 1,
  name: dependency,
  dependency,
  title: 'a title',
  url: `https://github.com/advisories/${id}`,
  severity,
  range: '<1.0.0',
});
const report = (vulnerabilities) => ({ auditReportVersion: 2, vulnerabilities, metadata: {} });
const HIGH = 'GHSA-qr28-fpjm-wq7f';
/** The production advisories npm reported on 2026-11-15: one high, through a chain of packages that are high only by it. */
const today = {
  'decode-uri-component': { severity: 'high', via: [advisory('GHSA-vcc3-ghjq-m6fr', 'moderate', 'decode-uri-component'), advisory(HIGH, 'high', 'decode-uri-component')] },
  'query-string': { severity: 'high', via: ['decode-uri-component'] },
  'expo-router': { severity: 'high', via: ['query-string'] },
  glob: { severity: 'moderate', via: [advisory('GHSA-3g3m-2fjr-6pw4', 'moderate', 'glob'), 'minimatch'] },
  minimatch: { severity: 'moderate', via: [advisory('GHSA-g3hv-75wg-m249', 'moderate', 'minimatch')] },
  deepmerge: { severity: 'low', via: [advisory('GHSA-gcqx-w48m-w2h4', 'low', 'deepmerge')] },
};
const entry = (id, reviewBy = '2026-12-31') => ({ id, package: 'decode-uri-component', reason: 'fixed by the next SDK', reviewBy });
const allow = (...entries) => ({ advisories: entries });

describe('audit:dependencies, the decision', () => {
  it('passes a high advisory the allowlist names, until and on its reviewBy date', () => {
    const decision = decide(report(today), allow(entry(HIGH)));
    expect(decision).toMatchObject({ ok: true, found: 5, atBar: 1, allowed: [{ id: HIGH, severity: 'high', reviewBy: '2026-12-31' }], unlisted: [], expired: [], stale: [] });
    expect(decide(report(today), allow(entry(HIGH)), '2026-12-31').ok).toBe(true);
  });

  it('fails a high advisory the allowlist does not name, and lets moderate and low ones pass', () => {
    expect(decide(report(today), allow())).toMatchObject({ ok: false, atBar: 1, unlisted: [{ id: HIGH, severity: 'high' }] });
    const belowBar = Object.fromEntries(Object.entries(today).filter(([name]) => name !== 'decode-uri-component'));
    expect(decide(report(belowBar), allow())).toMatchObject({ ok: true, found: 3, atBar: 0 });
  });

  it('fails an unlisted critical advisory, and any severity npm does not grade below the bar', () => {
    const critical = { 'some-package': { severity: 'critical', via: [advisory('GHSA-2222-3333-4444', 'critical', 'some-package')] } };
    expect(decide(report({ ...today, ...critical }), allow(entry(HIGH)))).toMatchObject({ ok: false, unlisted: [{ id: 'GHSA-2222-3333-4444', severity: 'critical' }] });
    const unknown = { 'some-package': { severity: 'unknown', via: [advisory('GHSA-2222-3333-4444', 'unknown', 'some-package')] } };
    expect(decide(report(unknown), allow()).ok).toBe(false);
  });

  it('fails an entry past its reviewBy date, whether or not its advisory is still open', () => {
    expect(decide(report(today), allow(entry(HIGH)), '2027-01-01')).toMatchObject({ ok: false, allowed: [], unlisted: [], expired: [{ id: HIGH, reviewBy: '2026-12-31' }] });
    expect(decide(report({}), allow(entry(HIGH, '2026-11-14')))).toMatchObject({ ok: false, expired: [{ id: HIGH }], stale: [HIGH] });
  });

  it('names an entry no advisory at the bar matches as stale, without failing', () => {
    expect(decide(report({}), allow(entry(HIGH)))).toMatchObject({ ok: true, stale: [HIGH] });
  });

  it('fails, judging nothing, on a report npm could not give or an allowlist of the wrong shape', () => {
    expect(decide({ error: { code: 'ENOTFOUND', summary: 'x' } }, allow())).toMatchObject({ ok: false, error: 'npm audit failed: ENOTFOUND' });
    expect(decide({ auditReportVersion: 1, advisories: {} }, allow()).ok).toBe(false);
    expect(decide(report(today), {}).error).toMatch(/no "advisories" list/u);
    expect(decide(report(today), allow({ ...entry(HIGH), reviewBy: '2026-02-30' })).error).toMatch(/"reviewBy" is not a YYYY-MM-DD date/u);
    expect(decide(report(today), allow(entry(HIGH), entry(HIGH))).error).toMatch(/listed twice/u);
    expect(decide(report(today), allow({ ...entry('decode-uri-component'), reason: ' ' })).error).toMatch(/"id" is not a GHSA id.*"reason" is empty/u);
    expect(decide(report(today), allow(entry(HIGH)), 'today').ok).toBe(false);
  });
});

describe('audit:dependencies, the command', () => {
  const cli = (input) =>
    spawnSync(process.execPath, [script, '--report', '-', '--today', '2026-11-15'], { cwd: root, encoding: 'utf8', input: JSON.stringify(input), timeout: 60_000 });
  const critical = { 'some-package': { severity: 'critical', via: [advisory('GHSA-2222-3333-4444', 'critical', 'some-package')] } };

  it('exits 1 on an advisory the committed allowlist does not name, and prints advisory ids, never package names or titles', () => {
    const run = cli(report({ ...today, ...critical }));
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('NOT ALLOWED: GHSA-2222-3333-4444 (critical)');
    expect(run.stdout).toMatch(/audit:dependencies: RED/u);
    expect(run.stdout).not.toMatch(/some-package|decode-uri-component|a title/u);
  });

  it('exits 0 when nothing reaches the bar', () => {
    const belowBar = Object.fromEntries(Object.entries(today).filter(([name]) => !['decode-uri-component', 'query-string', 'expo-router'].includes(name)));
    const run = cli(report(belowBar));
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('3 advisories in production dependencies, 0 high or critical (the bar)');
    expect(run.stdout).toMatch(/audit:dependencies: green\n$/u);
  });

  it('is what package.json and CI run, and the committed allowlist is sound', () => {
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts['audit:dependencies']).toBe('node scripts/audit-dependencies.mjs');
    expect(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')).toMatch(/^ {6}- run: npm run audit:dependencies$/mu);
    expect(evaluate(`m.allowlistProblems(${readFileSync(join(root, 'scripts/audit-allowlist.json'), 'utf8')})`)).toEqual([]);
  });
});
