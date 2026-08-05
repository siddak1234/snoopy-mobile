import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { IconTile } from '@/components/nocturne/icon-tile';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import type { PipelineStep } from '@/lib/fixtures';

type Props = {
  step: PipelineStep;
  /** Builder canvas cards carry a 1px neutral-800 outline. */
  outlined?: boolean;
  /** Trailing affordance (e.g. the Builder drag handle). */
  trailing?: React.ReactNode;
};

/** Pipeline step card: icon tile, tracked kicker, title, description. */
export function StepCard({ step, outlined = false, trailing }: Props) {
  const { palette } = useTheme();
  return (
    <SurfaceCard
      style={[
        styles.card,
        outlined && { borderWidth: 1, borderColor: palette.neutral[800] },
      ]}>
      <IconTile icon={step.icon} />
      <View style={styles.body}>
        <SectionLabel fontSize={10} track={0.16} color={palette.accentRamp[300]}>
          {step.kicker}
        </SectionLabel>
        <Text style={[styles.title, { color: palette.text }]}>{step.title}</Text>
        <Text style={[styles.desc, { color: palette.neutral[400] }]}>{step.desc}</Text>
      </View>
      {trailing}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 14,
    marginTop: 2,
  },
  desc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 1,
  },
});
