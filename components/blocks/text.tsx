import React from 'react';
import { StyleSheet } from 'react-native';

import { SectionTitle } from '@/components/nocturne/section-label';
import { Text } from '@/components/text';
import { fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { toneColor, toneOf, type BlockOf } from './look';

/**
 * text: a line in the run page's result-line look (~~run.tsx's `run-result`~~
 * until Round 21), toned by its tone — an error one an alert; a `label` the
 * page's section label (`SectionLabel`), drawn in capitals, a heading; a
 * `strong` one in the medium weight; a `muted` one small and muted. Line breaks
 * kept; the words are a text node, never markup. A label is a title over what
 * it heads since Round 21 (`SectionTitle`; the owner's build 30 note F3).
 */
export function TextBlock({ block, testID }: { block: BlockOf<'text'>; testID: string }) {
  const { palette } = useTheme();
  if (block.style === 'label') {
    // A heading over the block after it (`SectionTitle`), the block list giving it the `title` gap.
    return (
      <SectionTitle testID={testID} flush>
        {block.text}
      </SectionTitle>
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
  body: { fontFamily: fonts.regular, ...typeScale.body },
  strong: { fontFamily: fonts.medium },
  muted: { fontFamily: fonts.regular, ...typeScale.small },
});
