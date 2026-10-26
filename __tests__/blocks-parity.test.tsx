import { screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BLOCK_FIXTURES } from '@/lib/generated/platform-contracts/block-fixtures';
import { renderBlocks, visibleWords } from '@/test/blocks';

/**
 * Word parity with the website (backend ADR-0048 decision 9): every fixture in
 * `packages/contracts/fixtures/blocks`, committed by the generator as
 * `block-fixtures.ts`, drawn by `BlockList` gives exactly its `text` — its
 * visible words in reading order, closed sections left out. The website holds
 * the same test (`snoopy/test/blocks-parity.test.mjs`) over the same fixtures:
 * the two files' headers name one sha256, so both clients draw the same words.
 */

const HEADER = /^\/\/ From snoopy-backend packages\/contracts\/fixtures\/blocks\/\*\.json, sha256 ([0-9a-f]{64})\.$/u;

describe('the block fixtures, drawn', () => {
  it('are the generator\'s, headed by one sha256 over the fixtures', () => {
    const first = readFileSync(
      resolve(__dirname, '../lib/generated/platform-contracts/block-fixtures.ts'),
      'utf8',
    ).split('\n')[0];
    expect(first).toMatch(HEADER);
    expect(BLOCK_FIXTURES.length).toBeGreaterThanOrEqual(15);
  });

  it.each(BLOCK_FIXTURES.map((fixture) => [fixture.name, fixture] as const))(
    '%s: its visible words, in order, are exactly its text',
    async (_name, fixture) => {
      await renderBlocks(fixture.blocks);
      expect(visibleWords(screen.toJSON())).toEqual([...fixture.text]);
    },
  );
});
