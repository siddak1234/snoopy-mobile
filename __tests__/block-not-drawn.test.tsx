import { act, screen } from '@testing-library/react-native';
import React, { useState } from 'react';
import { Text } from 'react-native';

import { BlockList } from '@/components/blocks/block-list';
import { missingField } from '@/components/blocks/drawable';
import { GroupCard } from '@/components/blocks/group';
import * as look from '@/components/blocks/look';
import { InlineBoundary } from '@/components/dialog-boundary';
import { FALLBACK } from '@/lib/content/screen-states';
import { BLOCK_FIXTURES } from '@/lib/generated/platform-contracts/block-fixtures';
import { fileLinkFor, fixtureBlock, renderBlocks, visibleWords } from '@/test/blocks';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  downloadSignedFile: jest.fn(),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * A part that cannot be drawn is not a crash, and it is logged (round 21,
 * design D2.6): a known block missing a required field is `Fallback` before its
 * renderer runs; a renderer that throws is `Fallback` from the `Catch` around
 * each block; a type this build does not know, or a body with no blocks, is
 * `Fallback` too, and so is a form or an image target this build does not
 * know and a group entry that is not a section; either way the next block
 * still draws, and `notDrawn` logs
 * the block's type and the field, the reason or the error — never its words.
 * A re-read that replaces a caught block resets its boundary.
 */

const TABLE_COLUMNS = [{ title: 'Item' }, { title: 'Amount', align: 'end' }];

let logged: jest.SpyInstance;
beforeEach(() => {
  logged = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  logged.mockRestore();
});

/** The `notDrawn` lines, without React's own report of a caught error. */
const notDrawnLines = () => logged.mock.calls.filter(([message]) => message === 'block not drawn');

describe('a block missing a required field (the check before drawing)', () => {
  it('a table with no rows is the fallback, the next block still draws, and one line names `table` and `rows`', async () => {
    await renderBlocks([
      { type: 'table', columns: TABLE_COLUMNS },
      { type: 'text', text: 'After the table' },
    ]);
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK, 'After the table']);
    expect(screen.getByTestId('b-0-fallback')).toBeTruthy();
    // No throw: React reports nothing, and the one line is the check's.
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith('block not drawn', { type: 'table', error: 'rows' });
  });

  it('inside a section, a row without its cells is the fallback in its place, and the section still draws', async () => {
    await renderBlocks([
      {
        type: 'section',
        title: 'Documents',
        open: true,
        blocks: [
          { type: 'table', columns: TABLE_COLUMNS, rows: [{ note: 'no cells' }] },
          { type: 'text', text: 'Inside, after' },
        ],
      },
    ]);
    expect(screen.getByTestId('b-0-0-fallback')).toBeTruthy();
    expect(screen.getByText('Inside, after')).toBeTruthy();
    expect(logged).toHaveBeenCalledWith('block not drawn', { type: 'table', error: 'rows[0].cells' });
  });

  it('every block in the platform\'s fixtures passes the check, inside sections and groups too', () => {
    const every = (blocks: readonly unknown[]): unknown[] =>
      blocks.flatMap((block) => {
        const typed = block as { blocks?: unknown[]; sections?: { blocks: unknown[] }[] };
        return [block, ...every(typed.blocks ?? []), ...every((typed.sections ?? []).flatMap((section) => section.blocks))];
      });
    const blocks = every(BLOCK_FIXTURES.flatMap((fixture) => fixture.blocks)) as { type: string }[];
    expect(blocks.length).toBeGreaterThan(20);
    expect(blocks.filter((block) => missingField(block) !== null)).toEqual([]);
  });

  it('a field of the wrong basic type is missing too; a type this build does not know is left to the registry', () => {
    expect(missingField({ type: 'table', columns: TABLE_COLUMNS, rows: 'three' } as never)).toBe('rows');
    expect(missingField({ type: 'chart', kind: 'bar', title: 'T', alt: 'A', points: [{ label: 'a', value: '1', text: '1' }] } as never)).toBe('points[0].value');
    expect(missingField({ type: 'image', alt: 'A', open: { target: 'run-file' }, file: null } as never)).toBe('file');
    expect(missingField({ type: 'sparkline' })).toBeNull();
  });
});

describe('a block whose renderer throws (the boundary around each block)', () => {
  it('is the fallback in its place, the next block still draws, and the line names its type and the error', async () => {
    // Every required field is there, so the check passes; a cell that is an
    // object is not a child React can draw, so the table's renderer throws.
    await renderBlocks([
      { type: 'table', columns: TABLE_COLUMNS, rows: [{ cells: [{ not: 'text' }, '£1'] }] },
      { type: 'text', text: 'After the table' },
    ]);
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK, 'After the table']);
    expect(screen.getByTestId('b-0-fallback')).toBeTruthy();
    expect(notDrawnLines()).toEqual([['block not drawn', { type: 'table', error: expect.any(Error) }]]);
  });
});

describe('a re-read that replaces a caught block (the boundary is reset by the block)', () => {
  /** A page whose body a re-read replaces, as use-resource's focus re-read does with the list still mounted. */
  let reread: (blocks: readonly unknown[]) => void = () => {};
  function Page({ first }: { first: readonly unknown[] }) {
    const [blocks, setBlocks] = useState(first);
    reread = setBlocks;
    return <BlockList blocks={blocks} testID="b" />;
  }
  const THROWS = { type: 'table', columns: TABLE_COLUMNS, rows: [{ cells: [{ not: 'text' }, '£1'] }] };

  it('the same block stays the fallback, unlogged again; a valid one in its place draws; a new broken one is logged once', async () => {
    await renderWithProviders(<Page first={[THROWS]} />);
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK]);
    expect(notDrawnLines()).toHaveLength(1);

    // The same content again (a focus re-read): still the fallback, no second line.
    await act(async () => reread([{ ...THROWS }]));
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK]);
    expect(notDrawnLines()).toHaveLength(1);

    // A valid block in that place draws.
    await act(async () => reread([{ type: 'text', text: 'Now valid' }]));
    expect(visibleWords(screen.toJSON())).toEqual(['Now valid']);

    // A different broken block there is the fallback and is logged once more.
    await act(async () => reread([{ ...THROWS, rows: [{ cells: [{ other: 'object' }, '£2'] }] }]));
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK]);
    expect(notDrawnLines()).toHaveLength(2);
  });
});

describe('a fallback drawn before any renderer runs is logged too', () => {
  it('a type this build does not know is the fallback, the next block draws, and one line names its type and `unknown type`', async () => {
    await renderBlocks([{ type: 'sparkline', points: [1, 2] }, { type: 'text', text: 'After it' }]);
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK, 'After it']);
    expect(screen.getByTestId('b-0-fallback')).toBeTruthy();
    expect(notDrawnLines()).toEqual([['block not drawn', { type: 'sparkline', error: 'unknown type' }]]);
  });

  it('a block with no type is logged as `unknown`', async () => {
    await renderBlocks([{ text: 'no type' }]);
    expect(notDrawnLines()).toEqual([['block not drawn', { type: 'unknown', error: 'unknown type' }]]);
  });

  it('a body with no blocks is the fallback alone, logged as `unknown`, `no blocks`; one that is not a list, `not a list`', async () => {
    await renderBlocks(undefined);
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK]);
    expect(notDrawnLines()).toEqual([['block not drawn', { type: 'unknown', error: 'no blocks' }]]);
    logged.mockClear();
    await renderBlocks('three' as never);
    expect(screen.getByTestId('b-fallback')).toBeTruthy();
    expect(notDrawnLines()).toEqual([['block not drawn', { type: 'unknown', error: 'not a list' }]]);
  });
});

describe('a fallback a renderer draws itself is logged too (every fallback is logged)', () => {
  it('a questions form this build does not know is the fallback, logged as `questions`, `form.kind`', async () => {
    await renderBlocks([{ type: 'questions', title: 'Add', form: { kind: 'survey' } }, { type: 'text', text: 'After it' }]);
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK, 'After it']);
    expect(screen.getByTestId('b-0-fallback')).toBeTruthy();
    expect(notDrawnLines()).toEqual([['block not drawn', { type: 'questions', error: 'form.kind' }]]);
  });

  it('an image whose target has no reader is the fallback, logged as `image`, `open.target`', async () => {
    const photo = fixtureBlock('drawn-image', 'image');
    await renderBlocks([{ ...photo, open: { target: 'flow', flowId: 'f-1' } }], { workspaceId: TEST_WORKSPACE });
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK]);
    expect(notDrawnLines()).toEqual([['block not drawn', { type: 'image', error: 'open.target' }]]);
  });

  it('an image of a file drawn as a row, with no page to open, is the fallback, logged as `image`, `open.target`', async () => {
    const photo = fixtureBlock('drawn-image', 'image');
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/runs/{runId}/files/{fileId}', fileLinkFor({ ...photo.file, contentType: 'text/csv' }));
    const noRoute = jest.spyOn(look, 'openRoute').mockReturnValue(null);
    try {
      await renderBlocks([photo], { workspaceId: TEST_WORKSPACE });
      expect(await screen.findByTestId('b-0-fallback')).toBeTruthy();
      expect(notDrawnLines()).toEqual([['block not drawn', { type: 'image', error: 'open.target' }]]);
    } finally {
      noRoute.mockRestore();
    }
  });

  it('a group holding an entry that is not a section is the fallback, logged as `group`, `sections[0].type` (the contract\'s const)', async () => {
    await renderBlocks([
      { type: 'group', title: 'Details', sections: [{ type: 'text', title: 'Not a section', blocks: [] }] },
      { type: 'text', text: 'After it' },
    ]);
    expect(visibleWords(screen.toJSON())).toEqual([FALLBACK, 'After it']);
    expect(screen.getByTestId('b-0-fallback')).toBeTruthy();
    expect(notDrawnLines()).toEqual([['block not drawn', { type: 'group', error: 'sections[0].type' }]]);
  });

  it("GroupCard's own guard: an entry that is not a section is the fallback in its place, logged, never left out", async () => {
    const block = {
      type: 'group',
      title: 'Details',
      sections: [
        { type: 'section', title: 'First', open: true, blocks: [] },
        { type: 'text', text: 'Not a section' },
      ],
    } as never;
    await renderWithProviders(<GroupCard block={block} testID="g" inner={() => null} />);
    expect(screen.getByTestId('g-1-fallback')).toBeTruthy();
    expect(visibleWords(screen.toJSON())).toContain(FALLBACK);
    expect(notDrawnLines()).toEqual([['block not drawn', { type: 'group', error: 'sections[1].type' }]]);
  });
});

describe("Catch's own line, for the form and dialog boundaries", () => {
  function Throws(): React.ReactElement {
    throw new Error('a control this build cannot draw');
  }

  it('a form that throws is logged once as `unknown`, its error and nothing of the form', async () => {
    await renderWithProviders(
      <InlineBoundary title="Couldn't load this run's form">
        <Throws />
        <Text>never drawn</Text>
      </InlineBoundary>,
    );
    expect(screen.getByTestId('form-failed')).toBeTruthy();
    expect(notDrawnLines()).toEqual([['block not drawn', { type: 'unknown', error: expect.any(Error) }]]);
    expect((notDrawnLines()[0]![1] as { error: Error }).error.message).toBe('a control this build cannot draw');
  });
});
