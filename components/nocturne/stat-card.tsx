import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { em, fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SurfaceCard } from '@/components/nocturne/surface-card';

type Props = {
  value: string;
  label: string;
  /** Home uses 20px values with tighter padding than the 18px detail cards. */
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
          fontSize: md ? 20 : 18,
          letterSpacing: md ? em(-0.01, 20) : 0,
          color: valueColor ?? palette.text,
        }}>
        {value}
      </Text>
      <Text
        style={{
          marginTop: md ? 3 : 2,
          fontFamily: fonts.regular,
          fontSize: 11,
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
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  cardSm: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
});
