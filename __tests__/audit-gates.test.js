const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const platformAudit = resolve(__dirname, '../scripts/audit-platform.mjs');
const fixtureAudit = resolve(__dirname, '../scripts/audit-fixtures.mjs');
const credentialAudit = resolve(__dirname, '../scripts/audit-credentials.mjs');
const tokenAudit = resolve(__dirname, '../scripts/audit-tokens.mjs');
const vocabularyAudit = resolve(__dirname, '../scripts/audit-vocabulary.mjs');
const typeAudit = resolve(__dirname, '../scripts/audit-type.mjs');
let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'snoopy-mobile-audit-'));
  for (const directory of ['app', 'components', 'constants', 'hooks', 'lib']) {
    mkdirSync(join(root, directory));
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(script) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
}

describe('architecture audit scripts', () => {
  it('passes a clean source tree and fails every raw network primitive', () => {
    expect(run(platformAudit).status).toBe(0);

    for (const source of [
      "fetch('https://example.test')",
      "globalThis.fetch('https://example.test')",
      "new XMLHttpRequest()",
      "new WebSocket('wss://example.test')",
      "axios.get('https://example.test')",
    ]) {
      writeFileSync(join(root, 'app/bad.ts'), source);
      const result = run(platformAudit);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('raw network primitive');
    }
  });

  it('fails every non-generated transport, storage, and logging escape hatch', () => {
    for (const [source, finding] of [
      ["import axios from 'axios'", 'alternate network library'],
      ["import createClient from 'openapi-fetch'", 'openapi-fetch outside the transport'],
      ["import AsyncStorage from '@react-native-async-storage/async-storage'\nAsyncStorage.getItem('token')", 'AsyncStorage'],
      ["console.log('session')", 'console'],
    ]) {
      writeFileSync(join(root, 'app/bad.ts'), source);
      const result = run(platformAudit);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(finding);
    }
  });

  it('fails static, side-effect, dynamic, CommonJS, and relative fixture imports', () => {
    // No `lib/fixtures.ts` is written here any more: the module existing inside
    // a runtime root is itself a failure now, so creating one would assert the
    // opposite of the rule. The gate resolves the specifier rather than statting
    // the file, so an import is detected whether or not a target exists — which
    // is the stricter behaviour and the one worth pinning.
    expect(run(fixtureAudit).status).toBe(0);

    for (const source of [
      "import value from '@/lib/fixtures'",
      "import '@/lib/fixtures'",
      "import('@/lib/fixtures')",
      "require('@/lib/fixtures')",
      "import value from '../lib/fixtures'",
    ]) {
      writeFileSync(join(root, 'app/bad.ts'), source);
      const result = run(fixtureAudit);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('new import of lib/fixtures');
    }
  });

  it('fails a credential-shaped default', () => {
    writeFileSync(
      join(root, 'app/bad.tsx'),
      "const [password, setPassword] = useState('prototype-secret');",
    );
    const result = run(credentialAudit);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('new credential-shaped default');
  });

  it('fails a raw design colour outside the token sheet', () => {
    writeFileSync(join(root, 'app/bad.tsx'), "const style = { backgroundColor: '#abcdef' };");
    const result = run(tokenAudit);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Token audit failed');
  });

  /**
   * The forms the gates used to miss.
   *
   * The 2026-08-18 audit injected each of these into an isolated copy of the
   * real tree and watched every one pass. They are not exotic — they are the
   * shapes a rule actually gets broken in, because the original checks were all
   * line-local: the literal and the thing that makes it a violation had to sit
   * on one line. Pinned here so closing them cannot silently regress.
   */
  it('fails a colour hoisted to a const and used on a colour prop', () => {
    writeFileSync(
      join(root, 'app/bad.tsx'),
      "const BRAND = '#12E3AA';\nexport const style = { backgroundColor: BRAND };",
    );
    expect(run(tokenAudit).status).toBe(1);
  });

  it('fails a colour assembled in a template literal', () => {
    writeFileSync(join(root, 'app/bad.tsx'), "const c = { color: `#${'12E3AA'}` };");
    expect(run(tokenAudit).status).toBe(1);
  });

  it('fails a credential pinned without useState', () => {
    writeFileSync(join(root, 'app/bad.ts'), "export const DEMO_PASSWORD = 'hunter2x';");
    const result = run(credentialAudit);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('credential-shaped default');
  });

  it('fails a credential pinned inside an object literal', () => {
    writeFileSync(join(root, 'app/bad.ts'), "export const D = { token: 'eyJhbGciOiJIUzI1' };");
    expect(run(credentialAudit).status).toBe(1);
  });

  it('does NOT fail a keychain key name or a UI label, which are not secrets', () => {
    // The value's shape is what separates a secret from a slot: a dotted key
    // name behind a `*_KEY` binding, and prose behind a label, are neither.
    writeFileSync(
      join(root, 'app/fine.ts'),
      "const ACCESS_TOKEN_KEY = 'autom8x.access-token';\n" +
        "export const label = { accessibilityLabel: 'Show password' };\n" +
        'export const k = ACCESS_TOKEN_KEY;',
    );
    expect(run(credentialAudit).status).toBe(0);
  });

  it('allows the transport ONE plain fetch, the signed upload, and nothing more (24.3.4)', () => {
    mkdirSync(join(root, 'lib/platform'), { recursive: true });
    const transport = join(root, 'lib/platform/client.ts');
    const put = "export const put = (url, bytes) => fetch(url, { method: 'PUT', body: bytes });";
    writeFileSync(transport, put);
    expect(run(platformAudit).status).toBe(0);

    // Two calls on ONE line spend two (the budget counts calls, not lines).
    writeFileSync(transport, "export const both = (a, b) => fetch(a).then(() => fetch(b));");
    const twice = run(platformAudit);
    expect(twice.status).toBe(1);
    expect(twice.stderr).toContain('raw network primitive');

    // An admitted call cannot carry another primitive on its line.
    writeFileSync(transport, "export const mixed = (u) => fetch(u) && new XMLHttpRequest();");
    expect(run(platformAudit).status).toBe(1);

    for (const extra of [
      'export const again = (url) => fetch(url);',
      "export const other = () => globalThis.fetch('https://example.test');",
      "export const socket = () => new WebSocket('wss://example.test');",
    ]) {
      writeFileSync(transport, `${put}\n${extra}`);
      const result = run(platformAudit);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('raw network primitive');
    }

    // The allowance is the transport's alone: the same call anywhere else fails.
    writeFileSync(transport, '');
    writeFileSync(join(root, 'lib/upload.ts'), put);
    const elsewhere = run(platformAudit);
    expect(elsewhere.status).toBe(1);
    expect(elsewhere.stderr).toContain('lib/upload.ts');
  });

  it('allows the transport ONE native download, the signed export, and nothing more (24.12)', () => {
    mkdirSync(join(root, 'lib/platform'), { recursive: true });
    const transport = join(root, 'lib/platform/client.ts');
    const save = 'export const save = (url, to) => File.downloadFileAsync(url, to, { idempotent: true });';
    writeFileSync(transport, save);
    expect(run(platformAudit).status).toBe(0);

    // A second download in the transport is a second path to the network.
    writeFileSync(transport, `${save}\nexport const again = (url, to) => File.downloadFileAsync(url, to);`);
    const twice = run(platformAudit);
    expect(twice.status).toBe(1);
    expect(twice.stderr).toContain('native file download');

    // The allowance is the transport's alone: the same call in a screen fails.
    writeFileSync(transport, '');
    writeFileSync(join(root, 'app/screen.tsx'), save);
    const elsewhere = run(platformAudit);
    expect(elsewhere.status).toBe(1);
    expect(elsewhere.stderr).toContain('app/screen.tsx');
  });

  it('fails a network primitive captured in a binding', () => {
    writeFileSync(
      join(root, 'app/bad.ts'),
      "const send = globalThis.fetch;\nexport const go = () => send('https://example.test');",
    );
    const result = run(platformAudit);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('aliased network primitive');
  });

  it('fails a fixture import from a .js file, which the walker used to skip', () => {
    writeFileSync(join(root, 'lib/fixtures.ts'), 'export const prototype = true;');
    writeFileSync(join(root, 'app/bad.js'), "import v from '@/lib/fixtures';\nexport default v;");
    expect(run(fixtureAudit).status).toBe(1);
  });

  it('fails prototype fixture data merely EXISTING in a runtime root', () => {
    // Stronger than counting importers, and the reason the count cannot drift:
    // the rule used to hold because the script exempted one path by name.
    writeFileSync(join(root, 'lib/fixtures.ts'), 'export const prototype = true;');
    const result = run(fixtureAudit);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('may not live in a runtime root');
  });
});

describe('the vocabulary audit (24.11.7)', () => {
  it('fails copy that says project or automation, and passes the code that keeps those names', () => {
    expect(run(vocabularyAudit).status).toBe(0);

    for (const [file, source] of [
      ['app/screen.tsx', 'export const A = () => <Text>Your projects</Text>;'],
      ['components/row.tsx', 'export const B = () => <Row title="Create a project" />;'],
      ['lib/words.ts', 'export const C = `This automation is ${state}.`;'],
      ['hooks/label.ts', "export const D = 'Automations';"],
    ]) {
      writeFileSync(join(root, file), source);
      const result = run(vocabularyAudit);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(file);
      rmSync(join(root, file));
    }

    writeFileSync(
      join(root, 'lib/code.tsx'),
      [
        "import { readProjects } from '@/lib/platform/projects';",
        "export const path = '/v1/workspaces/{workspaceId}/projects';",
        "export const scope = { kind: 'project', projectId: 'p-1' };",
        'export const id = `project-${scope.projectId}`;',
        'export const Mark = () => <Text testID="automation-row">AUTOMATION × AI</Text>;',
        '// a project in the contract is a team on screen',
      ].join('\n'),
    );
    expect(run(vocabularyAudit).status).toBe(0);
  });
});

describe('the type audit (24.12)', () => {
  it('fails a font size written outside the type scale, in each form a number becomes a size, and passes the scale', () => {
    expect(run(typeAudit).status).toBe(0);

    for (const [file, source] of [
      ['app/screen.tsx', 'export const s = { fontSize: 13 };'],
      ['components/label.tsx', 'export const L = () => <SectionLabel fontSize={10.5}>Runs</SectionLabel>;'],
      ['components/badge.tsx', 'export function B({ fontSize = 13 }) {\n  return <Text style={{ fontSize }} />;\n}'],
      ['components/stat.tsx', 'export const value = (md) => ({ fontSize: md ? 20 : 18 });'],
      [
        'components/pill.tsx',
        'export function P({ height }) {\n  const size = height >= 52 ? 16 : 13;\n  return <Text style={{ fontSize: size }} />;\n}',
      ],
      ['lib/sizes.ts', 'const SIZES = { title: 21 };\nexport const t = { fontSize: SIZES.title };'],
      ['hooks/kicker.ts', 'export const k = { letterSpacing: em(0.14, 11) };'],
      ['constants/lead.ts', 'export const p = { lineHeight: 18 };'],
    ]) {
      writeFileSync(join(root, file), source);
      const result = run(typeAudit);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(file);
      rmSync(join(root, file));
    }

    // The scale's own file is where a size is a number, and a size read from it
    // passes — a spread pair, a prop's default, the threshold a pill compares.
    writeFileSync(
      join(root, 'constants/theme.ts'),
      'export const typeScale = { body: { fontSize: 15, lineHeight: 22 }, lead: { fontSize: 17, lineHeight: 25 } };',
    );
    writeFileSync(
      join(root, 'components/fine.tsx'),
      [
        "import { em, typeScale } from '@/constants/theme';",
        'export const a = { fontSize: typeScale.body.fontSize, letterSpacing: em(-0.01, typeScale.body.fontSize) };',
        'export const b = { ...typeScale.body, height: 34, marginTop: 4 };',
        'export function P({ height, fontSize, iconSize }) {',
        '  const size = fontSize ?? (height >= 52 ? typeScale.lead.fontSize : typeScale.body.fontSize);',
        '  return <Text style={{ fontSize: size }}>{iconSize ?? size + 1}</Text>;',
        '}',
        'export function L({ fontSize = typeScale.body.fontSize }) {',
        '  return <Text style={{ fontSize }} />;',
        '}',
        'export const c = (wide) => ({ fontSize: (wide > 360 && typeScale.lead.fontSize) || typeScale.body.fontSize });',
      ].join('\n'),
    );
    expect(run(typeAudit).status).toBe(0);
  });
});
