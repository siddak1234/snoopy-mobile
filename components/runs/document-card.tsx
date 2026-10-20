import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Text } from '@/components/text';
import { fonts, status, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DOCUMENT_MORE_LINES } from '@/lib/content/screen-states';
import type { DocumentCardView, DocumentRowView } from '@/lib/view/documents';

/**
 * One document a run read, on its own card (Build 21, spec A7; backend
 * ADR-0039; the owner's ~04:05Z: "a json out that clearly seperates
 * accordingly … different receipts from different vendors … cu price,
 * location, and more should be there"): "Document 1 of 3" and what happened to
 * it; the type and seller; where; when; the numbers that match it to its
 * record (AM7); each line with "{quantity} × {unit price}" under it; the totals;
 * how it was paid; the result line; then the automation's own detail lines.
 * Composed of the theme's tokens and `SurfaceCard`; a content component, not
 * a Nocturne primitive.
 */
export function DocumentCard({ card }: { card: DocumentCardView }) {
  const { palette } = useTheme();
  const tone = card.tone === 'ok' ? status.ok : card.tone === 'warn' ? status.warnText : palette.neutral[400];
  const muted = { color: palette.neutral[400] };
  const pairs = (rows: DocumentRowView[], prefix: string) =>
    rows.map((row, index) => (
      <View key={`${prefix}-${row.label}-${index}`} style={styles.pair}>
        <Text style={[styles.pairLabel, muted]}>{row.label}</Text>
        <Text
          selectable
          style={[styles.pairValue, { color: palette.text }, row.strong && styles.strong]}>
          {row.value}
        </Text>
      </View>
    ));
  return (
    <View testID={`document-${card.index}`}>
      <SurfaceCard style={styles.card}>
        <View style={styles.headRow}>
          <Text style={[styles.heading, muted]}>{card.heading}</Text>
          <Text
            testID={`document-${card.index}-chip`}
            style={[styles.chip, { color: tone, borderColor: tone, backgroundColor: withAlpha(tone, 0.08) }]}>
            {card.chip}
          </Text>
        </View>
        <Text style={[styles.title, { color: palette.text }]}>{card.title}</Text>
        {card.location ? <Text style={[styles.small, muted]}>{card.location}</Text> : null}
        {card.when ? <Text style={[styles.small, muted]}>{card.when}</Text> : null}
        {card.ids.length > 0 ? <View style={styles.block}>{pairs(card.ids, 'id')}</View> : null}
        {card.lines.length > 0 || card.moreLines ? (
          <View style={[styles.block, styles.rule, { borderTopColor: palette.divider }]}>
            {card.lines.map((line, index) => (
              <View key={`line-${index}`} testID={`document-${card.index}-line-${index + 1}`} style={styles.line}>
                <View style={styles.lineText}>
                  <Text style={[styles.body, { color: palette.text }]}>{line.description}</Text>
                  {line.each ? <Text style={[styles.small, muted]}>{line.each}</Text> : null}
                </View>
                {line.amount ? <Text style={[styles.body, { color: palette.text }]}>{line.amount}</Text> : null}
              </View>
            ))}
            {card.moreLines ? <Text style={[styles.small, muted]}>{DOCUMENT_MORE_LINES}</Text> : null}
          </View>
        ) : null}
        <View style={[styles.block, styles.rule, { borderTopColor: palette.divider }]}>{pairs(card.rows, 'row')}</View>
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: 4,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { fontFamily: fonts.medium, ...typeScale.small },
  chip: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    fontFamily: fonts.medium,
    ...typeScale.caption,
  },
  title: { marginTop: 4, fontFamily: fonts.medium, ...typeScale.label },
  small: { fontFamily: fonts.regular, ...typeScale.small },
  body: { fontFamily: fonts.regular, ...typeScale.body },
  block: { marginTop: 8, gap: 6 },
  rule: { borderTopWidth: 1, paddingTop: 8 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lineText: { flex: 1, minWidth: 0 },
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  pairLabel: { fontFamily: fonts.regular, ...typeScale.body },
  pairValue: { flex: 1, textAlign: 'right', fontFamily: fonts.regular, ...typeScale.body },
  strong: { fontFamily: fonts.medium },
});
