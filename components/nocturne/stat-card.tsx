import React from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { em, fonts, inset, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SurfaceCard } from '@/components/nocturne/surface-card';

type Props = {
  value: string;
  label: string;
  /** Home's tiles (the design's 20px values) are tracked tighter and padded more
   *  than the detail cards (its 18px); both sizes are the scale's `title` step
   *  since 24.12. */
  size?: 'md' | 'sm';
  /** Home stats tint their values (ok/err); defaults to the text color. */
  valueColor?: string;
};

/** Equal-width stat tile (Home dashboard row, Workflow-detail row). */
export function StatCard({ value, label, size = 'md', valueColor }: Props) {
  const { palette } = useTheme();
  const md = size === 'md';
  return (
    <SurfaceCard style={md ? styles.cardMd : styles.cardSm}>
      <Text
        style={{
          fontFamily: fonts.medium,
          fontSize: typeScale.title.fontSize,
          letterSpacing: md ? em(-0.01, typeScale.title.fontSize) : 0,
          color: valueColor ?? palette.text,
        }}>
        {value}
      </Text>
      <Text
        style={{
          marginTop: inset.xxs,
          fontFamily: fonts.regular,
          fontSize: typeScale.caption.fontSize,
          color: palette.neutral[400],
        }}>
        {label}
      </Text>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  cardMd: {
    flex: 1,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
  },
  cardSm: {
    flex: 1,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
  },
});
