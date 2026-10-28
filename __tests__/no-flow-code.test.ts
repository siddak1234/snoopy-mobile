import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { screen } from '@testing-library/react-native';
import React from 'react';

import { BlockList, RENDERERS } from '@/components/blocks/block-list';
import { FALLBACK } from '@/lib/content/screen-states';
import { renderWithProviders } from '@/test/render';

/**
 * No code for one flow (backend BUILD-PLAN 27.5.2; MASTER-PLAN §3.4). The owner, 2026-10-21:
 * "if i create a new automation, automation and backend update should show up on the app ...
 * eventually app wouldnt need updates." A screen draws what the platform sends — the catalog
 * entry's manifest fields, a run's steps, details and documents — so no source here compares a
 * flow's `templateId` with an id written in it, or switches on one. The website holds the same
 * test (`snoopy/test/no-flow-code.test.mjs`).
 *
 * And since Round 21 (backend ADR-0048 decision 11) three more: the run, item and file pages and
 * `components/blocks` read none of a run's or a flow's own result fields or words — they draw the
 * platform's blocks; the block registry's keys are the contract's union, and what it does not know
 * draws the fallback; and nothing under `components/blocks` makes markup or a web view of a block.
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

/** The pages that draw blocks, and the renderers (decision 11). */
const BLOCK_PAGES = [
  'app/(tabs)/activity/run.tsx',
  'app/(tabs)/activity/run-file.tsx',
  'app/(tabs)/flows/item.tsx',
  'app/(tabs)/flows/item-file.tsx',
  ...sources('components/blocks'),
];

/** A run's or a flow's own result fields and words, which the platform's blocks now say. */
const OWN_WORDS = /\.(?:documents|sections|details)\b|\b(?:documentWords|verdictWords|runWords)\b/u;

/** The one exemption, by exact line: the Archive confirmation's words (flows/item.tsx). */
const ALLOWED = new Set(['body={archiveItemBody(declared.runWords)}']);

function ownWords(text: string): { line: string; at: number }[] {
  return text
    .split('\n')
    .map((line, at) => ({ line, at: at + 1 }))
    .filter(({ line }) => OWN_WORDS.test(line) && !ALLOWED.has(line.trim()));
}

/** Markup from a block's words, or a web view: refused under components/blocks. */
const MARKUP = /\bdangerouslySetInnerHTML\b|\bWebView\b|react-native-webview/u;

describe('the pages draw the platform\'s blocks (backend ADR-0048 decision 11)', () => {
  it('no run, item or file page, and no block renderer, reads a run\'s documents, sections or details, or a flow\'s words', () => {
    const found = BLOCK_PAGES.flatMap((path) =>
      ownWords(readFileSync(join(root, path), 'utf8')).map(({ at, line }) => `${path}:${at}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
    // The Archive line is there, and is the one exemption.
    expect(readFileSync(join(root, 'app/(tabs)/flows/item.tsx'), 'utf8')).toContain('body={archiveItemBody(declared.runWords)}');
  });

  it('the guard sees each read it refuses, and lets the Archive line by', () => {
    for (const planted of [
      'const cards = toDocumentCards(liveRun.detail.documents);',
      'run.sections.map((section) => section.title)',
      '{liveRun.detail.details?.length ? <Details /> : null}',
      'const word = entry.documentWords?.singular;',
      'itemTiles(item, declared.verdictWords)',
      'noRunsYet(declared.runWords)',
      '  body={archiveItemBody(declared.runWords)} extra',
    ])
      expect(ownWords(planted)).toHaveLength(1);
    expect(ownWords('        body={archiveItemBody(declared.runWords)}')).toHaveLength(0);
    expect(ownWords("const label = 'Documents'; // a word, not a field")).toHaveLength(0);
  });

  it('nothing under components/blocks makes markup or a web view of a block', () => {
    const found = sources('components/blocks').flatMap((path) =>
      readFileSync(join(root, path), 'utf8')
        .split('\n')
        .map((line, at) => ({ line, at: at + 1 }))
        .filter(({ line }) => MARKUP.test(line))
        .map(({ at, line }) => `${path}:${at}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
    for (const planted of [
      '<div dangerouslySetInnerHTML={{ __html: block.text }} />',
      "import { WebView } from 'react-native-webview';",
      '<WebView source={{ html: block.text }} />',
    ])
      expect(MARKUP.test(planted)).toBe(true);
  });

  it('the registry\'s keys are the contract\'s union, and a copy of it with the fallback taken out fails the unknown cases', async () => {
    const generated = readFileSync(join(root, 'lib/generated/platform-contracts/automations.d.ts'), 'utf8');
    const union = generated.slice(generated.indexOf('        Block: {'), generated.indexOf('        FlowPages: {'));
    // Each type once: a group's sections name `section` again (ADR-0048 amendment 1).
    const types = [...new Set([...union.matchAll(/\/\*\* @constant \*\/\n\s+type: "(\w+)";/gu)].map((match) => match[1]))];
    expect(Object.keys(RENDERERS).sort()).toEqual([...types].sort());

    // Two types no build knows (~~`chart`~~, drawn since Round 21).
    const UNKNOWN = [{ type: 'gauge' }, { type: 'section', title: 'In', open: true, blocks: [{ type: 'gauge' }] }];

    // The renderer as it is: each unknown type draws the one sentence.
    await renderWithProviders(React.createElement(BlockList, { blocks: UNKNOWN }));
    expect(screen.getAllByText(FALLBACK)).toHaveLength(2);
    screen.unmount();

    // A copy with its fallback taken out: the same blocks no longer draw it.
    const source = readFileSync(join(root, 'components/blocks/block-list.tsx'), 'utf8');
    // The unknown type's branch; the copy goes straight on to the field check
    // and the renderer (round 21), so an unknown type reaches `draw` undefined.
    const withFallback = `            {!draw || !type ? (
              <Fallback testID={\`\${testID}-fallback\`} />
            ) : missing ? (`;
    expect(source).toContain(withFallback);
    const copy = source
      .replace(withFallback, '            {missing ? (')
      .replace(/from '\.\/([\w-]+)'/gu, "from '@/components/blocks/$1'");
    const folder = join(root, 'test/.block-list-copy');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'block-list.tsx'), copy);
    try {
      const { BlockList: Stripped } = jest.requireActual('@/test/.block-list-copy/block-list');
      const silence = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      // The copy throws on a type it has no renderer for; a boundary holds the throw, as the app's would.
      class Boundary extends React.Component<{ children: React.ReactNode }, { broke: boolean }> {
        state = { broke: false };
        static getDerivedStateFromError() {
          return { broke: true };
        }
        render() {
          return this.state.broke ? null : this.props.children;
        }
      }
      try {
        await renderWithProviders(
          React.createElement(Boundary, null, React.createElement(Stripped, { blocks: UNKNOWN })),
        );
      } finally {
        silence.mockRestore();
      }
      expect(screen.queryAllByText(FALLBACK)).toHaveLength(0);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
