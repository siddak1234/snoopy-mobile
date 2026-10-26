import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SectionLabel } from '@/components/nocturne/section-label';
import { Text } from '@/components/text';
import { fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { toneColor, toneOf, type BlockOf } from './look';

/**
 * text: a line in the run page's result-line look (~~run.tsx's `run-result`~~
 * until Round 21), toned by its tone — an error one an alert; a `label` the
 * page's section label (`SectionLabel`), drawn in capitals, a heading; a
 * `strong` one in the medium weight; a `muted` one small and muted. Line breaks
 * kept; the words are a text node, never markup.
 */
export function TextBlock({ block, testID }: { block: BlockOf<'text'>; testID: string }) {
  const { palette } = useTheme();
  if (block.style === 'label') {
    return (
      // A heading: the label in a header element, as the page's own section labels are read.
      <View testID={testID} accessible accessibilityRole="header">
        <SectionLabel style={styles.label}>{block.text}</SectionLabel>
      </View>
    );
  }
  if (block.style === 'muted') {
    return (
      <Text testID={testID} selectable style={[styles.muted, { color: palette.neutral[400] }]}>
        {block.text}
      </Text>
    );
  }
  return (
    <Text
      testID={testID}
      selectable
      accessibilityRole={toneOf(block.tone) === 'error' ? 'alert' : undefined}
      style={[styles.body, block.style === 'strong' && styles.strong, { color: toneColor(block.tone, palette) }]}>
      {block.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: { textTransform: 'uppercase' },
  body: { fontFamily: fonts.regular, ...typeScale.body },
  strong: { fontFamily: fonts.medium },
  muted: { fontFamily: fonts.regular, ...typeScale.small },
});
