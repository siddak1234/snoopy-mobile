const { readFileSync, readdirSync, statSync } = require('node:fs');
const { extname, join, relative, resolve } = require('node:path');

/**
 * No elevated card may also clip its children.
 *
 * Found live on 2026-09-03 (Round 7.5M, Android 15 emulator, RN 0.81.5, new
 * architecture): in the LIGHT palette every Settings section card rendered as
 * an empty white rectangle. The accessibility tree still held all 36 text
 * nodes at the right bounds, so the rows were laid out and not drawn. The two
 * cards on the same screen that did render were the ones without
 * `overflow: 'hidden'`. The light palette's `--shadow-sm` is an Android
 * `elevation` where the dark palette's is a hairline border — which is why
 * every dark-mode inspection through Rounds 6–7.5 passed and the defect waited
 * for the first light-mode screen on a device.
 *
 * `SurfaceCard` carries the palette's elevation; a caller's style must not add
 * `overflow: 'hidden'` on the same View. Clip an inner View instead, if a child
 * ever needs clipping. The rule is checked on the source because no Jest render
 * can observe Android compositing.
 */

const root = resolve(__dirname, '..');
const ROOTS = ['app', 'components'];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return ['.tsx', '.ts'].includes(extname(full)) ? [full] : [];
  });
}

/** Style names a file hands to `<SurfaceCard style=…>`, in either style form. */
function surfaceCardStyleNames(source) {
  const names = new Set();
  const usage = /<SurfaceCard\b[^>]*?style=\{(\[?)([^}]*)\}/gs;
  for (const match of source.matchAll(usage)) {
    for (const name of match[2].matchAll(/styles\.([A-Za-z0-9_]+)/g)) names.add(name[1]);
  }
  return names;
}

/** The body of one `StyleSheet.create` entry, by name. */
function styleEntry(source, name) {
  const entry = new RegExp(`\\n  ${name}:\\s*\\{([\\s\\S]*?)\\n  \\},|\\n  ${name}:\\s*\\{([^\\n]*)\\},`);
  const match = entry.exec(source);
  return match ? (match[1] ?? match[2] ?? '') : '';
}

function findViolations(baseDir) {
  const violations = [];
  for (const dir of ROOTS) {
    for (const file of walk(join(baseDir, dir))) {
      const source = readFileSync(file, 'utf8');
      for (const name of surfaceCardStyleNames(source)) {
        if (/overflow:\s*['"]hidden['"]/.test(styleEntry(source, name))) {
          violations.push(`${relative(baseDir, file)}: styles.${name}`);
        }
      }
      // The same defect without the primitive: an entry that both elevates
      // and clips.
      for (const match of source.matchAll(
        /\n  ([A-Za-z0-9_]+):\s*\{([\s\S]*?)\n  \},|\n  ([A-Za-z0-9_]+):\s*\{([^\n]*)\},/g,
      )) {
        const body = match[2] ?? match[4] ?? '';
        match[1] = match[1] ?? match[3];
        if (/\belevation:/.test(body) && /overflow:\s*['"]hidden['"]/.test(body)) {
          violations.push(`${relative(baseDir, file)}: styles.${match[1]} (elevation + overflow hidden)`);
        }
      }
    }
  }
  return violations;
}

describe('elevated cards do not clip on Android', () => {
  it('passes the current tree', () => {
    expect(findViolations(root)).toEqual([]);
  });

  it('would have caught the light-mode defect', () => {
    // A copy of the shape Settings had: an elevated SurfaceCard given a style
    // that also clips. The gate must name it.
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
    const { tmpdir } = require('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'snoopy-card-overflow-'));
    try {
      mkdirSync(join(dir, 'app'));
      mkdirSync(join(dir, 'components'));
      writeFileSync(
        join(dir, 'app', 'screen.tsx'),
        [
          "const styles = StyleSheet.create({",
          "  sectionCard: {",
          "    marginTop: 9,",
          "    overflow: 'hidden',",
          "  },",
          "  fine: { marginTop: 9 },",
          "  shadowed: { elevation: 2, overflow: 'hidden' },",
          "});",
          "const a = <SurfaceCard style={styles.sectionCard}>x</SurfaceCard>;",
          "const b = <SurfaceCard style={[styles.fine, { padding: 1 }]}>x</SurfaceCard>;",
          '',
        ].join('\n'),
      );
      expect(findViolations(dir)).toEqual([
        'app/screen.tsx: styles.sectionCard',
        'app/screen.tsx: styles.shadowed (elevation + overflow hidden)',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
