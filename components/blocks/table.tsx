import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Text } from '@/components/text';
import { fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { BlockOf } from './look';

/**
 * table: the document card's pairs (~~components/runs/document-card.tsx~~ until
 * Round 21) — two or three columns, the first at its own width and the rest
 * filling the line, each to its side; a muted column in the muted token; a
 * strong row in the medium weight; a row's note small under it; a rule
 * between rows when it is divided. Column titles, when any, head it. On a card
 * of its own at the top of a page; inside a section, on the section's card.
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
      {block.rows.map((row, at) => (
        <View
          key={`row-${at}`}
          testID={`${testID}-row-${at}`}
          style={[block.divided && at > 0 && [styles.rule, { borderTopColor: palette.divider }]]}>
          <View style={styles.row}>
            {block.columns.map((_, index) => (
              <Text key={`cell-${index}`} selectable style={[cell(index), row.strong && styles.strong]}>
                {row.cells[index] ?? ''}
              </Text>
            ))}
          </View>
          {row.note ? <Text style={[styles.note, { color: palette.neutral[400] }]}>{row.note}</Text> : null}
        </View>
      ))}
    </View>
  );
  return nested ? body : <SurfaceCard>{body}</SurfaceCard>;
}

const styles = StyleSheet.create({
  table: { gap: 6 },
  alone: { paddingVertical: 11, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  rule: { borderTopWidth: 1, paddingTop: 6 },
  cell: { fontFamily: fonts.regular, ...typeScale.body },
  first: { flexShrink: 1 },
  rest: { flex: 1 },
  end: { textAlign: 'right' },
  strong: { fontFamily: fonts.medium },
  title: { fontFamily: fonts.medium, ...typeScale.caption },
  note: { fontFamily: fonts.regular, ...typeScale.small },
});
