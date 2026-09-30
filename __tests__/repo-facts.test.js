const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

/**
 * The facts file `npm run verify` emits is what snoopy-backend commits and
 * asserts (docs/repo-facts/snoopy-mobile.json against docs/repo-facts.schema.json;
 * BUILD-PLAN 24.3.7). The shape is asserted here so a drift is caught by the
 * repository that emits it, not by the one that quotes it. The schema is read
 * from the backend checkout beside this one when present; absent, that part
 * skips, as `verify:platform-contracts` does.
 */

const root = resolve(__dirname, '..');
const script = join(root, 'scripts/repo-facts.mjs');
const schemaPath = resolve(root, '../snoopy-backend/docs/repo-facts.schema.json');

function emit() {
  const dir = mkdtempSync(join(tmpdir(), 'mobile-facts-'));
  try {
    const out = join(dir, 'facts.json');
    const run = spawnSync(process.execPath, [script, '--out', out, '--gate', 'verify'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('repo facts', () => {
  const facts = emit();

  it('names this repository, its HEAD, the date and the gate that emitted it', () => {
    expect(facts).toMatchObject({ schemaVersion: 1, repository: 'snoopy-mobile', gate: 'verify' });
    expect(facts.head).toMatch(/^[0-9a-f]{7,40}$/u);
    expect(facts.readAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it("counts manifest §10's units, each with the command that produced it", () => {
    expect(Object.keys(facts.counts)).toEqual([
      'screenFiles',
      'components',
      'hooks',
      'fixtureModules',
      'testFiles',
    ]);
    for (const entry of Object.values(facts.counts)) {
      expect(Number.isInteger(entry.value) && entry.value >= 0).toBe(true);
      expect(entry.command).toMatch(/^git ls-files /u);
    }
    // A fixture module in the runtime roots is a gate failure (audit:fixtures).
    expect(facts.counts.fixtureModules.value).toBe(0);
  });

  it('carries only the keys the backend schema allows, when the schema is here', () => {
    if (!existsSync(schemaPath)) return;
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(schema.properties.repository.enum).toContain('snoopy-mobile');
    for (const key of schema.required) expect(facts).toHaveProperty(key);
    for (const key of Object.keys(facts)) expect(Object.keys(schema.properties)).toContain(key);
  });

  it('is never committed here: .gitignore excludes where verify writes it', () => {
    const check = spawnSync('git', ['check-ignore', '-q', '.autom8x/repo-facts/snoopy-mobile.json'], {
      cwd: root,
    });
    expect(check.status).toBe(0);
  });
});
