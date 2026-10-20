import { CaretRight } from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { StatCard } from '@/components/nocturne/stat-card';
import { Pressable } from '@/components/pressable';
import { radius, withAlpha } from '@/constants/theme';
import { useAccessibilityTextSize } from '@/hooks/use-accessibility-text-size';
import { useTheme } from '@/hooks/use-theme';

type Props = React.ComponentProps<typeof StatCard> & {
  testID: string;
  accessibilityLabel: string;
  onPress: () => void;
};

/**
 * A stat tile that opens the runs it counts, and looks like it does (the
 * owner's build 12 item 1: "i thought i said they should be buttons"). The
 * tiles have opened Activity since 24.11.9, but were drawn as the design's
 * static cards, with nothing to say a tap would do anything.
 *
 * The frozen StatCard is drawn as it is — its render and its snapshots in both
 * palettes do not move — inside the press, which draws over it what the review
 * banner beside it has: a caret, here in the tile's top-right corner beside the
 * number, and while pressed the accent tint. A wrapper, not a Nocturne
 * primitive, as `components/pressable.tsx` is.
 */
export function StatTileButton({ testID, accessibilityLabel, onPress, ...card }: Props) {
  const { palette } = useTheme();
  const stacked = useAccessibilityTextSize();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={stacked ? undefined : styles.tile}>
      {({ pressed }) => (
        <>
          <StatCard {...card} />
          <View pointerEvents="none" style={styles.caret}>
            <CaretRight size={13} color={palette.neutral[500]} weight="regular" testID={`${testID}-caret`} />
          </View>
          {pressed ? (
            <View
              pointerEvents="none"
              testID={`${testID}-pressed`}
              style={[styles.tint, { backgroundColor: withAlpha(palette.accent, PRESSED_TINT) }]}
            />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** The review banner's own tint while pressed (Home's approvals banner). */
export const PRESSED_TINT = 0.15;

/**
 * The tiles' row, Home's and a flow page's: side by side, 10 apart — and one
 * under another at iOS's accessibility text sizes (`useAccessibilityTextSize`;
 * round 24's simulator audit: "Succe/sses" and "Failure/s" broke inside the
 * word in a third of the row), each tile the row's width.
 */
export function StatTileRow({
  testID,
  style,
  children,
}: {
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const stacked = useAccessibilityTextSize();
  return (
    <View testID={testID} style={[stacked ? styles.column : styles.row, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  column: {
    gap: 10,
  },
  // Level with the number: the tile's top padding plus half its line, less half the caret.
  caret: {
    position: 'absolute',
    top: 18,
    right: 12,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.card,
  },
});
