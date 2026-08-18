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
    writeFileSync(join(root, 'lib/fixtures.ts'), 'export const prototype = true;');
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
});
