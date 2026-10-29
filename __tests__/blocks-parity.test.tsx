import { screen, waitFor } from '@testing-library/react-native';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { space } from '@/constants/theme';
import { FILE_OPENING } from '@/lib/content/screen-states';
import { BLOCK_FIXTURES } from '@/lib/generated/platform-contracts/block-fixtures';
import { BLOCK_SPACING } from '@/lib/generated/platform-contracts/block-rules';
import type { Block, RunFile } from '@/lib/platform/automations';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fileLinkFor, renderBlocks, savedFiles, visibleWords } from '@/test/blocks';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE } from '@/test/platform';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  downloadSignedFile: jest.fn(),
}));
const { platformOperation, downloadSignedFile } = jest.requireMock('@/lib/platform/client');

/**
 * Word parity with the website (backend ADR-0048 decision 9): every fixture in
 * `packages/contracts/fixtures/blocks`, committed by the generator as
 * `block-fixtures.ts`, drawn by `BlockList` gives exactly its `text` — its
 * visible words in reading order, closed sections left out. The website holds
 * the same test (`snoopy/test/blocks-parity.test.mjs`) over the same fixtures:
 * the two files' headers name one sha256, so both clients draw the same words.
 * Since Round 21 (amendment 1) the fixtures of `BLOCK_SET_VERSION` 2 — a
 * picture drawn once its file is read, the platform's answer from the
 * fixture's own `file` — and the spacing: the table both clients generate,
 * and every renderer's spacing its names; since amendment 2 the 28 of
 * `BLOCK_SET_VERSION` 3, a review's rows read by everyone (`review-held-*`).
 */

const HEADER = /^\/\/ From snoopy-backend packages\/contracts\/fixtures\/blocks\/\*\.json, sha256 ([0-9a-f]{64})\.$/u;
const RULES_HEADER = /^\/\/ From snoopy-backend packages\/contracts\/fixtures\/block-rules\/\*\.json, sha256 ([0-9a-f]{64})\.$/u;
const RUN_FILE = 'GET /v1/workspaces/{workspaceId}/runs/{runId}/files/{fileId}' as const;
const ITEM_FILE = 'GET /v1/workspaces/{workspaceId}/items/{itemId}/file' as const;

/** Every picture's file in a page body, at any depth. */
function pictures(blocks: readonly unknown[]): RunFile[] {
  return (blocks as Block[]).flatMap((block) => {
    if (block.type === 'image') return [block.file];
    if (block.type === 'section') return pictures(block.blocks);
    if (block.type === 'group') return block.sections.flatMap((section) => pictures(section.blocks));
    return [];
  });
}

beforeEach(() => {
  platformOperation.mockReset();
  resetSnapshot();
  savedFiles(downloadSignedFile);
});

describe('the block fixtures, drawn', () => {
  it('are the generator\'s, headed by one sha256 over the fixtures: the 28 of block set 3', () => {
    const first = readFileSync(
      resolve(__dirname, '../lib/generated/platform-contracts/block-fixtures.ts'),
      'utf8',
    ).split('\n')[0];
    expect(first).toMatch(HEADER);
    expect(BLOCK_FIXTURES).toHaveLength(28);
    expect(BLOCK_FIXTURES.every((fixture) => fixture.blockSetVersion === 3)).toBe(true);
  });

  it.each(BLOCK_FIXTURES.map((fixture) => [fixture.name, fixture] as const))(
    '%s: its visible words, in order, are exactly its text',
    async (_name, fixture) => {
      const files = pictures(fixture.blocks);
      if (files.length > 0) {
        const fake = fakePlatform(platformOperation);
        const byId = (id: string | undefined) => fileLinkFor(files.find((file) => file.id === id) ?? files[0]!);
        fake.always(RUN_FILE, (sent) => byId(sent.values.fileId));
        fake.always(ITEM_FILE, () => byId(undefined));
      }
      await renderBlocks(fixture.blocks, { workspaceId: TEST_WORKSPACE });
      // A picture's words while its file comes are not its own: drawn, it has none (only its alt).
      if (files.length > 0) await waitFor(() => expect(screen.queryByText(FILE_OPENING)).toBeNull());
      expect(visibleWords(screen.toJSON())).toEqual([...fixture.text]);
    },
  );

  it("reviewer-item-scores (the owner's Q4): its chart is one image, read as the fixture's alt", async () => {
    const fixture = BLOCK_FIXTURES.find((each) => each.name === 'reviewer-item-scores')!;
    const at = (fixture.blocks as Block[]).findIndex((block) => block.type === 'chart');
    const chart = fixture.blocks[at] as Extract<Block, { type: 'chart' }>;
    await renderBlocks(fixture.blocks);
    const box = screen.getByTestId(`b-${at}`);
    expect(box.props.accessibilityRole).toBe('image');
    expect(box.props.accessibilityLabel).toBe(chart.alt);
    expect(chart.title).toBe('Candidates by score');
  });
});

describe('the spacing table (ADR-0048 amendment 1, point 14; the owner\'s Q8)', () => {
  const rules = resolve(__dirname, '../lib/generated/platform-contracts/block-rules.ts');

  it('block-rules.ts is the generator\'s, headed by one sha256 over the platform\'s rules — the snapshot\'s, when the backend is here', () => {
    const header = RULES_HEADER.exec(readFileSync(rules, 'utf8').split('\n')[0]!);
    expect(header).not.toBeNull();
    const backend = resolve(__dirname, '..', process.env.SNOOPY_BACKEND_ROOT || '../snoopy-backend');
    const folder = join(backend, 'packages/contracts/fixtures/block-rules');
    if (!existsSync(folder)) return; // CI has no backend checkout: verify-platform-contracts skips it the same way.
    const hash = createHash('sha256');
    for (const name of readdirSync(folder).filter((each) => each.endsWith('.json')).sort()) hash.update(readFileSync(join(folder, name)));
    expect(header![1]).toBe(hash.digest('hex'));
  });

  it("is the owner's Q8, and the theme's `space` is it", () => {
    expect(BLOCK_SPACING).toEqual({
      edge: 20,
      edgeWide: 24,
      group: 16,
      title: 8,
      inner: 8,
      rowY: 12,
      rowX: 16,
      rowMinHeight: 44,
      card: 16,
      cardWide: 24,
      bottom: 24,
    });
    expect(space).toBe(BLOCK_SPACING);
  });

  it('every renderer takes its spacing from the table: a padding, margin or gap under components/blocks is a name, never a number', () => {
    const folder = resolve(__dirname, '../components/blocks');
    const typed = /\b(?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical)?\s*:\s*-?[1-9]|\b(?:gap|rowGap|columnGap)\s*:\s*[1-9]/u;
    const found = readdirSync(folder)
      .filter((name) => /\.tsx?$/u.test(name))
      .flatMap((name) =>
        readFileSync(join(folder, name), 'utf8')
          .split('\n')
          .map((line, at) => ({ line, at: at + 1 }))
          .filter(({ line }) => typed.test(line))
          .map(({ line, at }) => `${name}:${at}: ${line.trim()}`),
      );
    expect(found).toEqual([]);
    // Each renderer that spaces anything names the table (`space`) or a control's own step (`inset`).
    for (const name of ['block-list.tsx', 'list.tsx', 'table.tsx', 'section.tsx', 'chart.tsx', 'paged.tsx', 'image.tsx', 'link.tsx', 'file.tsx']) {
      expect(readFileSync(join(folder, name), 'utf8')).toMatch(/\bspace\.(?:group|title|inner|rowY|rowX|rowMinHeight|card)\b/u);
    }
    expect(typed.test('  pad: { paddingVertical: 13 }')).toBe(true);
    expect(typed.test('  pad: { paddingVertical: space.rowY }')).toBe(false);
  });
});
