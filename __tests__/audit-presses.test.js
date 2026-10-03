const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

/**
 * The press audit (build 13): every onPress is resolved to the function it runs,
 * and istanbul's coverage says whether a test ran it. Each case writes a small
 * tree and the coverage-final.json a run of the suite would leave, with the
 * function where istanbul records it — an anonymous function at its first
 * character — so the gate is held to the shape the real coverage has.
 */
const pressAudit = resolve(__dirname, '../scripts/audit-presses.mjs');
let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'snoopy-mobile-presses-'));
  for (const directory of ['app', 'components']) mkdirSync(join(root, directory));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path, lines) {
  const source = lines.join('\n');
  writeFileSync(join(root, path), source);
  return source;
}

/** Where `text` starts in `source`, as istanbul writes it: line from 1, column from 0. */
function at(source, text) {
  const index = source.indexOf(text);
  if (index === -1) throw new Error(`${text} is not in the source`);
  const lines = source.slice(0, index).split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length };
}

/** coverage-final.json: per file, fnMap's declarations and f's counts. */
function coverage(files) {
  const json = {};
  for (const [path, functions] of Object.entries(files)) {
    const fnMap = {};
    const f = {};
    functions.forEach(({ start, runs }, id) => {
      const end = { line: start.line, column: start.column + 1 };
      fnMap[id] = { name: `(anonymous_${id})`, decl: { start, end }, loc: { start, end }, line: start.line };
      f[id] = runs;
    });
    json[join(root, path)] = { path: join(root, path), statementMap: {}, fnMap, branchMap: {}, s: {}, f, b: {} };
  }
  mkdirSync(join(root, 'coverage'), { recursive: true });
  writeFileSync(join(root, 'coverage/coverage-final.json'), JSON.stringify(json));
}

function run() {
  return spawnSync(process.execPath, [pressAudit], { cwd: root, encoding: 'utf8' });
}

const pillButton = [
  "import { Pressable } from 'react-native';",
  'export function PillButton({ label, onPress }) {',
  '  return <Pressable accessibilityLabel={label} onPress={onPress} />;',
  '}',
];

describe('the press audit (build 13)', () => {
  it('passes a press a test ran, fails the same press when none did, and skips the passthrough it reaches', () => {
    write('components/pill-button.tsx', pillButton);
    const screen = write('app/screen.tsx', [
      "import { PillButton } from '@/components/pill-button';",
      'export function Screen() {',
      '  return <PillButton label="Save" onPress={() => save()} />;',
      '}',
    ]);

    // PillButton's own onPress is its caller's handler: no coverage of its file
    // is needed, and it is no failure.
    coverage({ 'app/screen.tsx': [{ start: at(screen, '() => save()'), runs: 1 }] });
    const ran = run();
    expect(ran.status).toBe(0);
    expect(ran.stdout).toMatch(/RUN +app\/screen\.tsx:3 +<PillButton> onPress +Save +1 +\(\) => save\(\)/);
    expect(ran.stdout).toMatch(/PASSTHROUGH +components\/pill-button\.tsx:3 +<Pressable> onPress/);
    expect(ran.stdout).toContain('audited where <PillButton> is given onPress');

    coverage({ 'app/screen.tsx': [{ start: at(screen, '() => save()'), runs: 0 }] });
    const unrun = run();
    expect(unrun.status).toBe(1);
    expect(unrun.stderr).toContain('app/screen.tsx:3: <PillButton> onPress — () => save() (app/screen.tsx:3:');
    expect(unrun.stderr).toContain('never ran in a test');
    expect(unrun.stderr).not.toContain('components/pill-button.tsx');
  });

  it('audits a passthrough at its caller, under the name the caller passes it as', () => {
    // A dialog's Cancel is `onPress={onClose}`: the press is the caller's onClose.
    write('components/dialog.tsx', [
      "import { PillButton } from '@/components/pill-button';",
      'export function ConfirmDialog({ onClose }) {',
      '  return <PillButton label="Cancel" onPress={onClose} />;',
      '}',
    ]);
    write('components/pill-button.tsx', pillButton);
    const screen = write('app/screen.tsx', [
      "import { ConfirmDialog } from '@/components/dialog';",
      'export function Screen() {',
      '  return <ConfirmDialog onClose={() => setOpen(false)} />;',
      '}',
    ]);

    coverage({ 'app/screen.tsx': [{ start: at(screen, '() => setOpen(false)'), runs: 0 }] });
    const unrun = run();
    expect(unrun.status).toBe(1);
    expect(unrun.stderr).toContain('app/screen.tsx:3: <ConfirmDialog> onClose — () => setOpen(false)');
    expect(unrun.stdout).toMatch(/PASSTHROUGH +components\/dialog\.tsx:3 +<PillButton> onPress +Cancel/);

    coverage({ 'app/screen.tsx': [{ start: at(screen, '() => setOpen(false)'), runs: 2 }] });
    const ran = run();
    expect(ran.status).toBe(0);
    expect(ran.stdout).toMatch(/RUN +app\/screen\.tsx:3 +<ConfirmDialog> onClose +Cancel +2/);
  });

  it('resolves pressed(fn) to fn, declared in the same file', () => {
    const screen = write('app/screen.tsx', [
      "import { Text } from 'react-native';",
      "import { pressed } from '@/components/pressable';",
      'export function Screen() {',
      '  const retry = () => reload();',
      '  return <Text onPress={pressed(retry)}>Try again</Text>;',
      '}',
    ]);

    coverage({ 'app/screen.tsx': [{ start: at(screen, '() => reload()'), runs: 1 }] });
    const ran = run();
    expect(ran.status).toBe(0);
    expect(ran.stdout).toMatch(/RUN +app\/screen\.tsx:5 +<Text> onPress +Try again +1 +retry/);

    // The count read is retry's, where retry is declared — not the press's line.
    coverage({ 'app/screen.tsx': [{ start: at(screen, '() => reload()'), runs: 0 }] });
    const unrun = run();
    expect(unrun.status).toBe(1);
    expect(unrun.stderr).toContain('app/screen.tsx:5: <Text> onPress — retry (app/screen.tsx:4:');
  });

  it('follows a conditional and a same-file call to each handler they can be, a row each', () => {
    // Billing's `pressFor(card)`: a portal press and a checkout press, or none.
    const screen = write('app/billing.tsx', [
      "import { SurfaceCard } from 'somewhere';",
      'export function Billing({ card, paying, acts }) {',
      '  const pressFor = (plan) => {',
      '    if (plan.drawn) return undefined;',
      '    if (paying) return () => portal(plan);',
      '    return () => checkout(plan);',
      '  };',
      '  return <SurfaceCard onPress={acts ? pressFor(card) : undefined} />;',
      '}',
    ]);

    coverage({
      'app/billing.tsx': [
        { start: at(screen, '() => portal(plan)'), runs: 1 },
        { start: at(screen, '() => checkout(plan)'), runs: 0 },
      ],
    });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/RUN +app\/billing\.tsx:8 +<SurfaceCard> onPress +1 +\(\) => portal\(plan\)/);
    expect(result.stderr).toContain('app/billing.tsx:8: <SurfaceCard> onPress — () => checkout(plan)');
    expect(result.stderr).not.toContain('portal');
  });

  it('fails what it cannot vouch for: a handler it cannot see, coverage of other source, and no coverage', () => {
    const screen = write('app/screen.tsx', [
      "import { Text } from 'react-native';",
      "import { pressed } from '@/components/pressable';",
      'export function Screen() {',
      '  const { reload } = useResource();',
      '  const close = () => setOpen(false);',
      '  return (',
      '    <>',
      '      <Text onPress={pressed(reload)}>Retry</Text>',
      '      <Text onPress={pressed(close)}>Close</Text>',
      '    </>',
      '  );',
      '}',
    ]);

    // A hook's function counts every caller's press, so it is not this one's.
    // And the coverage puts close's function a line away from where it is.
    const moved = at(screen, '() => setOpen(false)');
    coverage({ 'app/screen.tsx': [{ start: { line: moved.line + 1, column: moved.column }, runs: 3 }] });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('app/screen.tsx:8: <Text> onPress — UNRESOLVED: reload is destructured from useResource(…)');
    expect(result.stderr).toContain('app/screen.tsx:9: <Text> onPress — stale-coverage');

    rmSync(join(root, 'coverage'), { recursive: true });
    const none = run();
    expect(none.status).toBe(1);
    expect(none.stderr).toContain('Run `npm run test:coverage` first');
  });
});
