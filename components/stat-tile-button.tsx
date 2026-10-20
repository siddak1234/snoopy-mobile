import { CaretRight } from 'phosphor-react-native';
import React, { createContext, useContext, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { StatCard } from '@/components/nocturne/stat-card';
import { Pressable } from '@/components/pressable';
import { fontScaleLimit, layout, radius, withAlpha } from '@/constants/theme';
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
  const stacked = useContext(TilesStacked);
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

/** The gap between two tiles. */
const TILE_GAP = 10;

/**
 * The least width of a tile beside its neighbours, per unit of text size: past it, the tiles stack.
 * Measured on the round 24 simulator audit: the longest label, "Successes", fits a 105-pt tile at the
 * standard size (iPhone SE) and broke inside the word in a 114-pt tile at xxxLarge, x1.353 (iPhone 17
 * Pro: 84.3 pt a unit) — 100 stays clear of both.
 */
export const TILE_LEAST_WIDTH = 100;

/** Whether `count` tiles in a row `rowWidth` wide stack at text size `fontScale` (up to the content limit). */
export function tilesStack(rowWidth: number, count: number, fontScale: number): boolean {
  const tile = (rowWidth - TILE_GAP * (count - 1)) / count;
  return tile < TILE_LEAST_WIDTH * Math.min(Math.max(fontScale, 1), fontScaleLimit.content);
}

const TilesStacked = createContext(false);

/**
 * The tiles' row, Home's and a flow page's: side by side, 10 apart — or one under another, each the
 * row's width, once a tile would be narrower than its longest label needs at the phone's text size
 * (`tilesStack`; round 24's simulator audit: "Succe/sses" and "Failure/s" at the largest size,
 * "Successe/s" at xxxLarge). The row's width is its own once laid out; before that, the screen's
 * less the page's gutters.
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
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? window.width - layout.screenX * 2;
  const stacked = tilesStack(width, React.Children.count(children), window.fontScale);
  return (
    <TilesStacked.Provider value={stacked}>
      <View
        testID={testID}
        onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
        style={[stacked ? styles.column : styles.row, style]}>
        {children}
      </View>
    </TilesStacked.Provider>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: TILE_GAP,
  },
  column: {
    gap: TILE_GAP,
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
