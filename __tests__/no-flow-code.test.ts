import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * No code for one flow (backend BUILD-PLAN 27.5.2; MASTER-PLAN §3.4). The owner, 2026-10-21:
 * "if i create a new automation, automation and backend update should show up on the app ...
 * eventually app wouldnt need updates." A screen draws what the platform sends — the catalog
 * entry's manifest fields, a run's steps, details and documents — so no source here compares a
 * flow's `templateId` with an id written in it, or switches on one. The website holds the same
 * test (`snoopy/test/no-flow-code.test.mjs`).
 */

const root = resolve(__dirname, '..');
const FOLDERS = ['app', 'components', 'lib', 'hooks', 'constants'];
const SKIP = new Set(['lib/generated']);

/** A comparison of `templateId` with a written string, either way round, or a switch on it. */
const FLOW_CODE = [
  /\btemplateId\s*(?:===|!==|==|!=)\s*["'`]/u,
  /["'`][^"'`\n]*["'`]\s*(?:===|!==|==|!=)\s*[\w.?]*\btemplateId\b/u,
  /switch\s*\([^)]*\btemplateId\b[^)]*\)/u,
];

function sources(folder: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, folder))) {
    const path = join(folder, name);
    if (SKIP.has(path)) continue;
    if (statSync(join(root, path)).isDirectory()) out.push(...sources(path));
    else if (/\.(?:ts|tsx|js)$/u.test(name)) out.push(path);
  }
  return out;
}

function flowCode(text: string): { line: string; at: number }[] {
  return text
    .split('\n')
    .map((line, at) => ({ line, at: at + 1 }))
    .filter(({ line }) => FLOW_CODE.some((pattern) => pattern.test(line)));
}

describe('no code for one flow', () => {
  it("no source compares a flow's templateId with a written id, or switches on it", () => {
    const found = FOLDERS.flatMap((folder) => sources(folder)).flatMap((path) =>
      flowCode(readFileSync(join(root, path), 'utf8')).map(
        ({ at, line }) => `${relative(root, join(root, path))}:${at}: ${line.trim()}`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('the guard sees each shape it refuses', () => {
    for (const planted of [
      "if (entry.templateId === 'invoice-processing') return 'Invoice';",
      'const isInvoices = "invoice-processing" === run.templateId;',
      'switch (flow.templateId) {',
      'return run?.templateId !== `invoice-processing`;',
    ])
      expect(flowCode(planted)).toHaveLength(1);
    for (const allowed of [
      'const entry = catalog.automations.find((a) => a.templateId === run.run.templateId);',
      "(entry) => entry.templateId === templateId && entry.status !== 'archived',",
    ])
      expect(flowCode(allowed)).toHaveLength(0);
  });
});
