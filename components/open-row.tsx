import { CaretRight } from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A row that opens a page, the height of a drop-down's row (the owner's build
 * 28 items F5 and F9: "should be the size of the must haves drop down", "a
 * component with an arrow"): what it leads with — an item's run its rank —
 * its title, what it says on the right — the run's score — and the arrow; at
 * least 44 tall, with the padding and the type of `RunSections`' rows, so the
 * two stack as one list. An item's runs and every run's "Run details" are
 * drawn with it. `muted`: a failed run's title and score, in the muted tone
 * (never faded: its words stay AA).
 */
export function OpenRow({
  testID,
  title,
  lead,
  value,
  valueTestID,
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
  muted?: boolean;
  divider?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const tone = muted ? palette.neutral[400] : palette.text;
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
        <Text style={[styles.title, { color: tone }]}>{title}</Text>
      </View>
      {value ? (
        <Text testID={valueTestID} style={[styles.value, { color: tone }]}>
          {value}
        </Text>
      ) : null}
      <CaretRight size={15} color={palette.neutral[500]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `RunSections`' toggle: 44 at least, 11 above and below, 14 a side.
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  lead: { minWidth: 20, fontFamily: fonts.medium, ...typeScale.label },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.medium, ...typeScale.label },
  value: { fontFamily: fonts.medium, ...typeScale.label },
});
