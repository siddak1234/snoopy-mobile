import { CaretRight } from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A row that opens a page, the height of a drop-down's row (the owner's build
 * 28 items F5 and F9: "should be the size of the must haves drop down", "a
 * component with an arrow"): what it leads with — an item's run its rank —
 * its title, what it says on the right — the run's score — and the arrow; at
 * least 44 tall, with the padding and the type of a section block's bar, so the
 * two stack as one list. An item's runs, a file block and every run's "Run
 * details" are drawn with it. `muted`: a failed run's title and score, in the
 * muted tone (never faded: its words stay AA). A list block's row (backend
 * ADR-0048) may add its chip (`badge`) and lines under its title (`below`): the
 * chip and the score then follow the title on its line, so a screen reader
 * reads them in the block's order, and `valueAccessibilityLabel` is what it
 * says for the score ("Score 88"); `valueColor` tones the score (a candidate's
 * verdict, Round 21: the owner's Q5 — green for the positive, red for the
 * negative, the chip beside it saying which). The table's row since Round 21
 * (the owner's Q8): 12 above and below, 16 a side, at least 44 tall (~~11 and
 * 14~~).
 */
export function OpenRow({
  testID,
  title,
  lead,
  value,
  valueTestID,
  valueAccessibilityLabel,
  valueColor,
  badge,
  below,
  muted = false,
  divider = false,
  accessibilityLabel,
  onPress,
}: {
  testID: string;
  title: string;
  lead?: string | number;
  value?: string | null;
  valueTestID?: string;
  valueAccessibilityLabel?: string;
  /** The score's colour, a theme token (`toneColor`); absent, the title's. */
  valueColor?: string;
  badge?: React.ReactNode;
  below?: React.ReactNode;
  muted?: boolean;
  divider?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const tone = muted ? palette.neutral[400] : palette.text;
  const score = value ? (
    <Text testID={valueTestID} accessibilityLabel={valueAccessibilityLabel} style={[styles.value, { color: muted ? tone : (valueColor ?? tone) }]}>
      {value}
    </Text>
  ) : null;
  const lined = badge !== undefined || below !== undefined;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && { borderBottomWidth: 1, borderBottomColor: palette.divider },
        pressed && { opacity: 0.7 },
      ]}>
      {lead !== undefined ? <Text style={[styles.lead, { color: palette.neutral[400] }]}>{lead}</Text> : null}
      <View style={styles.body}>
        {lined ? (
          <>
            <View style={styles.line}>
              <Text style={[styles.title, styles.grow, { color: tone }]}>{title}</Text>
              {badge}
              {score}
            </View>
            {below}
          </>
        ) : (
          <Text style={[styles.title, { color: tone }]}>{title}</Text>
        )}
      </View>
      {lined ? null : score}
      <CaretRight size={15} color={palette.neutral[500]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The table's row, as a section block's bar is: 44 at least, 12 above and below, 16 a side.
  row: {
    minHeight: space.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inner,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
  },
  lead: { minWidth: 20, fontFamily: fonts.medium, ...typeScale.label },
  body: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.inner },
  grow: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.medium, ...typeScale.label },
  value: { fontFamily: fonts.medium, ...typeScale.label },
});
