import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { fontScaleLimit, fonts, typeScale, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { toneColor, type BlockOf } from './look';

/**
 * A chip — a badge block's, a section's, a list row's: the document card's
 * chip (~~components/runs/document-card.tsx~~ until Round 21), its tone a
 * theme token, with an error tone (`status.err`). Not the Nocturne
 * `StatusPill`, which knows a closed set of labels and throws on any other.
 */
export function Chip({ badge, testID }: { badge: { text: string; tone?: unknown }; testID?: string }) {
  const { palette } = useTheme();
  const tone = toneColor(badge.tone, palette, palette.neutral[400]);
  return (
    <Text
      testID={testID}
      numberOfLines={1}
      maxFontSizeMultiplier={fontScaleLimit.chrome}
      style={[styles.chip, { color: tone, borderColor: tone, backgroundColor: withAlpha(tone, 0.08) }]}>
      {badge.text}
    </Text>
  );
}

/** badge: the chip, on a line of its own. */
export function BadgeBlock({ block, testID }: { block: BlockOf<'badge'>; testID: string }) {
  return (
    <View style={styles.line}>
      <Chip badge={block} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row' },
  chip: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    fontFamily: fonts.medium,
    ...typeScale.caption,
  },
});
