import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Text } from '@/components/text';
import { fonts, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tableChoices } from '@/lib/view/block-sort';

import type { BlockOf } from './look';
import { ListTools, NoMatch, Pager, usePaged } from './paged';

/**
 * table: the document card's pairs (~~components/runs/document-card.tsx~~ until
 * Round 21) — two or three columns, the first at its own width and the rest
 * filling the line, each to its side; a muted column in the muted token; a
 * strong row in the medium weight; a row's note small under it; a rule
 * between rows when it is divided. Column titles, when any, head it. On a card
 * of its own at the top of a page; inside a section, on the section's card.
 * Over 25 rows (Round 21, ADR-0048 amendment 1, point 4): the search box over
 * every cell, the sort (`BLOCK_WORDS.defaultOrder`, then each titled column's
 * `columnAToZ` or `columnHighToLow`) and the pages of 25, under the card.
 */
export function TableBlock({ block, testID, nested }: { block: BlockOf<'table'>; testID: string; nested: boolean }) {
  const { palette } = useTheme();
  const cell = (index: number) => [
    styles.cell,
    index === 0 ? styles.first : styles.rest,
    block.columns[index]?.align === 'end' && styles.end,
    { color: block.columns[index]?.muted ? palette.neutral[400] : palette.text },
  ];
  const titled = block.columns.some((column) => column.title);
  const cells = block.rows.map((row) => row.cells);
  const paged = usePaged({
    count: block.rows.length,
    fields: (at) => cells[at] ?? [],
    choices: tableChoices(block.columns, cells),
  });
  const body = (
    <View testID={testID} style={[styles.table, !nested && styles.alone]}>
      {titled ? (
        <View style={styles.row}>
          {block.columns.map((column, index) => (
            <Text
              key={`title-${index}`}
              style={[
                styles.title,
                index === 0 ? styles.first : styles.rest,
                column.align === 'end' && styles.end,
                { color: palette.neutral[400] },
              ]}>
              {column.title ?? ''}
            </Text>
          ))}
        </View>
      ) : null}
      {paged.shown.map((at, index) => {
        const row = block.rows[at]!;
        return (
        <View
          key={`row-${at}`}
          testID={`${testID}-row-${at}`}
          style={[block.divided && index > 0 && [styles.rule, { borderTopColor: palette.divider }]]}>
          <View style={styles.row}>
            {block.columns.map((_, index) => (
              <Text key={`cell-${index}`} selectable style={[cell(index), row.strong && styles.strong]}>
                {row.cells[index] ?? ''}
              </Text>
            ))}
          </View>
          {row.note ? <Text style={[styles.note, { color: palette.neutral[400] }]}>{row.note}</Text> : null}
        </View>
        );
      })}
    </View>
  );
  const card = nested ? body : <SurfaceCard>{body}</SurfaceCard>;
  if (!paged.long) return card;
  return (
    <View style={styles.paged}>
      <ListTools paged={paged} testID={testID} />
      {paged.noMatch ? <NoMatch testID={`${testID}-no-match`} text={paged.noMatch} /> : card}
      <Pager testID={`${testID}-pager`} page={paged.page} pages={paged.pages} onPage={paged.setPage} />
    </View>
  );
}

const styles = StyleSheet.create({
  paged: { gap: space.inner },
  table: { gap: space.inner },
  alone: { paddingVertical: space.rowY, paddingHorizontal: space.rowX },
  // The room between a table's columns: a row's side padding.
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.rowX },
  rule: { borderTopWidth: 1, paddingTop: space.inner },
  cell: { fontFamily: fonts.regular, ...typeScale.body },
  first: { flexShrink: 1 },
  rest: { flex: 1 },
  end: { textAlign: 'right' },
  strong: { fontFamily: fonts.medium },
  title: { fontFamily: fonts.medium, ...typeScale.caption },
  note: { fontFamily: fonts.regular, ...typeScale.small },
});
