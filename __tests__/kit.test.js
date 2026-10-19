const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

/**
 * The common kit (`.claude/hooks/`, `.claude/agents/`, `scripts/kit/`), copied
 * byte for byte from the backend's engineering standard, section 0. Its own
 * suite, `scripts/kit/kit.test.mjs`, runs under node:test, not jest (jest's
 * `testPathIgnorePatterns` leaves `/scripts/kit/` alone), so it is spawned here
 * and `npm test` — `verify` and CI — runs it. Beside it: `docs/MAP.md` is
 * current, the docs map is sound, and `.claude/settings.json` wires the three
 * hooks, section (h).
 */

const root = resolve(__dirname, '..');
const node = (...args) =>
  spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 180_000 });
const passes = (run) => {
  if (run.status !== 0) console.log(`${run.stdout}\n${run.stderr}`);
  expect(run.status).toBe(0);
};

describe('the common kit', () => {
  it('passes its own node:test suite', () => passes(node('--test', 'scripts/kit/kit.test.mjs')), 200_000);

  it('finds docs/MAP.md current', () => passes(node('scripts/kit/map.mjs', '--check')), 60_000);

  it('finds the docs map sound', () => passes(node('scripts/kit/check-docs.mjs', '--map-only')), 60_000);

  it('wires the three hooks in .claude/settings.json', () => {
    const { hooks } = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
    const command = (file) => `node "$CLAUDE_PROJECT_DIR/.claude/hooks/${file}"`;
    const entries = (event) => (hooks?.[event] ?? []).flatMap((entry) => entry.hooks.map((hook) => ({ ...hook, matcher: entry.matcher })));
    expect(entries('PreToolUse')).toContainEqual({ type: 'command', command: command('guard.mjs'), timeout: 5, matcher: 'Bash|Write|Edit|NotebookEdit' });
    expect(entries('SessionStart')).toContainEqual(expect.objectContaining({ type: 'command', command: command('session-start.mjs'), timeout: 10 }));
    for (const event of ['Stop', 'SubagentStop']) {
      expect(entries(event)).toContainEqual(expect.objectContaining({ type: 'command', command: command('stop-check.mjs'), timeout: 10 }));
    }
  });
});
