const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const platformAudit = resolve(__dirname, '../scripts/audit-platform.mjs');
const fixtureAudit = resolve(__dirname, '../scripts/audit-fixtures.mjs');
const credentialAudit = resolve(__dirname, '../scripts/audit-credentials.mjs');
const tokenAudit = resolve(__dirname, '../scripts/audit-tokens.mjs');
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
