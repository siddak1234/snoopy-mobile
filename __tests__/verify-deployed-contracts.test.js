const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

/**
 * The deployed contract check (`scripts/verify-deployed-contracts.mjs`, CI's
 * contract-deployed job and the release's refusal): the committed headers'
 * hashes against what the running platform's /health/live reports. Every
 * branch of its verdict is a pure function, judged here with fixtures — the
 * network is never read; readLive's retries run against a stubbed fetch.
 */
const root = resolve(__dirname, '..');
const script = pathToFileURL(join(root, 'scripts/verify-deployed-contracts.mjs')).href;

/** Runs `expression` with the script's exports as `m` in a real Node, and returns its JSON. */
function evaluate(expression) {
  const run = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import * as m from ${JSON.stringify(script)};\n` +
        `const out = await (async () => (${expression}))();\n` +
        'process.stdout.write(JSON.stringify(out));',
    ],
    { encoding: 'utf8' },
  );
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout);
}

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const COMMIT = 'c6b8650'.padEnd(40, '0');
const committed = { 'openapi.yaml': A, 'automations.yaml': B, 'connections.yaml': C };
const live = (contracts) => ({
  body: { status: 'ok', service: 'snoopy-api', version: '0.1.0', commit: COMMIT, contracts },
});

function judge(input) {
  return evaluate(`m.judge(${JSON.stringify({ committed, ...input })})`);
}

describe('the deployed contract verdict', () => {
  it('passes when every committed hash is the deployed one, and names the deployed commit', () => {
    const verdict = judge({ answer: live(committed) });
    expect(verdict.ok).toBe(true);
    expect(verdict.lines.join('\n')).toContain(`deployed commit ${COMMIT}`);
    expect(verdict.lines.at(-1)).toMatch(/^PASS: /u);
  });

  it('fails a mismatch, naming the document and both hashes', () => {
    const verdict = judge({ answer: live({ ...committed, 'automations.yaml': D }) });
    expect(verdict.ok).toBe(false);
    const text = verdict.lines.join('\n');
    expect(text).toContain(`automations.yaml  committed ${B}  deployed ${D}  DIFFERENT`);
    expect(verdict.lines.at(-1)).toMatch(/^FAIL: automations\.yaml — /u);
    expect(verdict.lines.at(-1)).toContain('aheadOfDeployed');
  });

  it('fails closed when the host could not be read — ahead or not', () => {
    for (const aheadOfDeployed of [false, true]) {
      const verdict = judge({ answer: { error: '4 attempts, the last: fetch failed' }, aheadOfDeployed });
      expect(verdict.ok).toBe(false);
      expect(verdict.lines.at(-1)).toMatch(/^FAIL \(closed\): .* could not be read \(4 attempts/u);
    }
  });

  it('fails closed on an answer with no marker — today\'s /health/live — ahead or not', () => {
    for (const aheadOfDeployed of [false, true]) {
      const verdict = judge({
        answer: { body: { status: 'ok', service: 'snoopy-api', version: '0.1.0' } },
        aheadOfDeployed,
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.lines.at(-1)).toMatch(/^FAIL \(closed\): .* no deployed marker/u);
    }
  });

  it('fails closed on a marker that lacks a document or carries no sha256 for it', () => {
    const missing = { 'openapi.yaml': A, 'automations.yaml': B };
    expect(judge({ answer: live(missing) }).lines.at(-1)).toMatch(/no sha256 for connections\.yaml/u);
    expect(judge({ answer: live({ ...committed, 'openapi.yaml': 'A1' }) }).ok).toBe(false);
    expect(judge({ answer: live(null) }).ok).toBe(false);
    expect(judge({ answer: { body: 'ok' } }).ok).toBe(false);
  });

  it('passes a mismatch loudly when platform-requirement.json declares the tree ahead', () => {
    const verdict = judge({ answer: live({ ...committed, 'openapi.yaml': D }), aheadOfDeployed: true });
    expect(verdict.ok).toBe(true);
    expect(verdict.lines.join('\n')).toContain('PASS, AHEAD OF THE DEPLOYED PLATFORM');
    expect(verdict.lines.join('\n')).toContain('openapi.yaml differs');
    expect(verdict.lines.at(-1)).toMatch(/^!!! .* must not ship/u);
  });

  it('refuses an ahead tree for a release: --release reads no escape', () => {
    const verdict = judge({ answer: live({ ...committed, 'openapi.yaml': D }), aheadOfDeployed: true, release: true });
    expect(verdict.ok).toBe(false);
    expect(verdict.lines.at(-1)).toContain('a release never ships ahead of the platform');
    expect(judge({ answer: live(committed), aheadOfDeployed: true, release: true }).ok).toBe(true);
  });

  it('fails an escape that outlived its change: ahead declared, nothing ahead', () => {
    const verdict = judge({ answer: live(committed), aheadOfDeployed: true });
    expect(verdict.ok).toBe(false);
    expect(verdict.lines.at(-1)).toContain('Set it back to {"aheadOfDeployed": false}');
  });
});

describe('reading the deployed platform', () => {
  it('retries a refused connection, a non-2xx and a non-JSON answer, then gives up with the last error', () => {
    const out = evaluate(`(async () => {
      const seen = [];
      const answers = [
        () => { throw new Error('connect ECONNREFUSED'); },
        () => ({ ok: false, status: 502, text: async () => 'bad gateway' }),
        () => ({ ok: true, status: 200, text: async () => '<html>' }),
        () => { throw new Error('The operation was aborted due to timeout'); },
      ];
      const result = await m.readLive('https://x.test/health/live', {
        delays: [0, 0, 0],
        fetch: async () => answers[seen.push(1) - 1](),
      });
      return { calls: seen.length, result };
    })()`);
    expect(out.calls).toBe(4);
    expect(out.result).toEqual({ error: '4 attempts, the last: The operation was aborted due to timeout' });
  });

  it('returns the first JSON answer after a transient failure, without trying again', () => {
    const out = evaluate(`(async () => {
      let calls = 0;
      const result = await m.readLive('https://x.test/health/live', {
        delays: [0, 0, 0],
        fetch: async () => {
          calls += 1;
          if (calls === 1) throw new Error('fetch failed');
          return { ok: true, status: 200, text: async () => '{"status":"ok"}' };
        },
      });
      return { calls, result };
    })()`);
    expect(out).toEqual({ calls: 2, result: { body: { status: 'ok' } } });
  });
});

describe('what is committed', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'snoopy-mobile-deployed-'));
    mkdirSync(join(dir, 'lib/generated/platform-contracts'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads this tree's three headers, each the sha256 of its document", () => {
    const hashes = evaluate(`m.committedHashes(${JSON.stringify(root)})`);
    expect(Object.keys(hashes)).toEqual(['openapi.yaml', 'automations.yaml', 'connections.yaml']);
    const platform = readFileSync(join(root, 'lib/generated/platform-contracts/platform.d.ts'), 'utf8');
    expect(platform.split('\n')[0]).toBe(`// From snoopy-backend docs/openapi.yaml, sha256 ${hashes['openapi.yaml']}.`);
  });

  it('refuses a file with no header, or a header naming another document', () => {
    const write = (file, first) =>
      writeFileSync(join(dir, 'lib/generated/platform-contracts', file), `${first}\nexport {};\n`);
    write('platform.d.ts', `// From snoopy-backend docs/openapi.yaml, sha256 ${A}.`);
    write('automations.d.ts', `// From snoopy-backend docs/openapi/connections.yaml, sha256 ${B}.`);
    write('connections.d.ts', '/** hand-written */');
    expect(() => evaluate(`m.committedHashes(${JSON.stringify(dir)})`)).toThrow(
      /automations\.d\.ts names docs\/openapi\/connections\.yaml, not docs\/openapi\/automations\.yaml/u,
    );
    write('automations.d.ts', `// From snoopy-backend docs/openapi/automations.yaml, sha256 ${B}.`);
    expect(() => evaluate(`m.committedHashes(${JSON.stringify(dir)})`)).toThrow(/connections\.d\.ts carries no/u);
  });

  it('commits platform-requirement.json as not ahead, and reads nothing but that one boolean', () => {
    expect(evaluate(`m.readRequirement(${JSON.stringify(root)})`)).toEqual({ aheadOfDeployed: false });
    for (const text of ['{"aheadOfDeployed": "yes"}', '{"aheadOfDeployed": true, "x": 1}', '[true]', 'ahead']) {
      writeFileSync(join(dir, 'platform-requirement.json'), text);
      expect(() => evaluate(`m.readRequirement(${JSON.stringify(dir)})`)).toThrow(/platform-requirement\.json/u);
    }
    writeFileSync(join(dir, 'platform-requirement.json'), '{"aheadOfDeployed": true}');
    expect(evaluate(`m.readRequirement(${JSON.stringify(dir)})`)).toEqual({ aheadOfDeployed: true });
  });
});
