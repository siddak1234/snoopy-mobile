import { screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { missingField } from '@/components/blocks/drawable';
import { InlineBoundary } from '@/components/dialog-boundary';
import { FALLBACK } from '@/lib/content/screen-states';
import { BLOCK_FIXTURES } from '@/lib/generated/platform-contracts/block-fixtures';
import { renderBlocks, visibleWords } from '@/test/blocks';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  downloadSignedFile: jest.fn(),
}));

/**
 * A part that cannot be drawn is not a crash, and it is logged (round 21,
 * design D2.6): a known block missing a required field is `Fallback` before its
 * renderer runs; a renderer that throws is `Fallback` from the `Catch` around
 * each block; either way the next block still draws, and `notDrawn` logs the
 * block's type and the field or the error — never its words.
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
