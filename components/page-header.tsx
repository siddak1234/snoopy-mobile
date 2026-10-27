import React from 'react';
import { StyleSheet, View } from 'react-native';

import { BackCircle } from '@/components/nocturne/back-circle';
import { Text } from '@/components/text';
import { em, fonts, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A page's header (Round 21; checklist C, "Page header"): Back, the page's
 * title — one size on every page, 24 (`typeScale.heading`; ~~21 on the run's
 * and its details' pages~~ until Round 21, plan Open 11) — and under it its
 * line, muted, or the page's own (`below`: a status pill beside it); on the
 * right, the page's slot (`right`: the run's score, toned by its verdict, F1).
 * Back and the title sit at the top of the row, so a title that wraps keeps
 * Back beside its first line.
 */
export function PageHeader({
  title,
  titleTestID,
  titleMaxFontSizeMultiplier,
  subtitle,
  subtitleTestID,
  below,
  right,
  onBack,
  selectable = false,
  testID,
}: {
  title: string;
  titleTestID?: string;
  /** The title stops at this text size (`fontScaleLimit.chrome`): a one-word title beside a slot. */
  titleMaxFontSizeMultiplier?: number;
  /** The muted line under the title. */
  subtitle?: string | null;
  subtitleTestID?: string;
  /** The page's own line under the title, in place of or after the subtitle. */
  below?: React.ReactNode;
  /** What the page shows on the right of its title (the run's score). */
  right?: React.ReactNode;
  /** Absent, there is no Back (a tab's first page). */
  onBack?: () => void;
  /** The title may be copied (a run's or an item's name). */
  selectable?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={styles.row}>
      {onBack ? <BackCircle onPress={onBack} /> : null}
      <View style={styles.text}>
        <View style={styles.titleLine}>
          <Text
            testID={titleTestID}
            accessibilityRole="header"
            maxFontSizeMultiplier={titleMaxFontSizeMultiplier}
            selectable={selectable}
            style={[styles.title, { color: palette.text }]}>
            {title}
          </Text>
          {right}
        </View>
        {subtitle ? (
          <Text testID={subtitleTestID} selectable style={[styles.subtitle, { color: palette.neutral[400] }]}>
            {subtitle}
          </Text>
        ) : null}
        {below}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.inner },
  text: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: space.inner },
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.medium,
    ...typeScale.heading,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  subtitle: { fontFamily: fonts.regular, ...typeScale.body },
});
