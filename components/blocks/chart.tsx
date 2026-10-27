import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Text } from '@/components/text';
import { fonts, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { BlockOf } from './look';

type Point = BlockOf<'chart'>['points'][number];

/** A bar's track and a line's plot, in points: the drawing's own size, not a spacing. */
const BAR_HEIGHT = 8;
const LINE_HEIGHT = 120;
const DOT_RADIUS = 3;
/** Dots on a line of this many points or fewer (backend ADR-0048 amendment 1, point 3). */
const MOST_DOTS = 24;

/** A bar's width as a share of its track: `value / max`, none when the largest is 0. */
export function barShare(value: number, max: number): number {
  return max > 0 ? Math.max(0, value) / max : 0;
}

/**
 * A line's points on a plot `width` wide: evenly spaced in the order sent,
 * scaled between the lowest and highest values — a flat line in the middle
 * when they are equal — inside the dots' radius.
 */
export function linePoints(points: readonly Pick<Point, 'value'>[], width: number): { x: number; y: number }[] {
  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = width - DOT_RADIUS * 2;
  const tall = LINE_HEIGHT - DOT_RADIUS * 2;
  return values.map((value, at) => ({
    x: DOT_RADIUS + (points.length > 1 ? (span * at) / (points.length - 1) : span / 2),
    y: DOT_RADIUS + (high === low ? tall / 2 : tall - ((value - low) / (high - low)) * tall),
  }));
}

/**
 * chart (backend ADR-0048 amendment 1, point 3): drawn here, no library —
 * react-native-svg's `Svg`, `Rect`, `Polyline` and `Circle`, in the theme's
 * accent and its ring (`neutral[800]`), with no animation. Its box is one
 * image to a screen reader, read as the platform's `alt` (its title, kind and
 * every value); every word is a text node outside the drawing, never markup.
 * A bar chart: a row per point in the order sent — its label, its bar
 * (`value / max` of the track), its text. A line chart: the line across the
 * width `onLayout` gives, a dot at each point when 24 or fewer, the highest
 * and lowest point's text on the left at top and bottom, the first and last
 * label under it. On a card of its own at the top of a page.
 */
export function ChartBlock({ block, testID, nested }: { block: BlockOf<'chart'>; testID: string; nested: boolean }) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);
  const muted = { color: palette.neutral[400] };
  const drawn =
    block.kind === 'bar' ? (
      <View style={styles.bars}>
        {block.points.map((point, at) => {
          const max = Math.max(...block.points.map((each) => each.value));
          return (
            <View key={`bar-${at}`} style={styles.barRow}>
              <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>
                {point.label}
              </Text>
              <View style={styles.track}>
                <Svg testID={`${testID}-bar-${at}`} width="100%" height={BAR_HEIGHT}>
                  <Rect x={0} y={0} width="100%" height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} fill={palette.neutral[800]} />
                  <Rect
                    testID={`${testID}-bar-${at}-value`}
                    x={0}
                    y={0}
                    width={`${barShare(point.value, max) * 100}%`}
                    height={BAR_HEIGHT}
                    rx={BAR_HEIGHT / 2}
                    fill={palette.accent}
                  />
                </Svg>
              </View>
              <Text style={[styles.value, muted]}>{point.text}</Text>
            </View>
          );
        })}
      </View>
    ) : (
      <LineChart points={block.points} testID={testID} width={width} onWidth={setWidth} />
    );
  const box = (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={block.alt} style={styles.box}>
      <Text style={[styles.title, { color: palette.text }]}>{block.title}</Text>
      {drawn}
    </View>
  );
  return nested ? box : <SurfaceCard padded>{box}</SurfaceCard>;
}

function LineChart({
  points,
  testID,
  width,
  onWidth,
}: {
  points: readonly Point[];
  testID: string;
  width: number;
  onWidth: (width: number) => void;
}) {
  const { palette } = useTheme();
  const values = points.map((point) => point.value);
  // The first on a tie, as the platform's text reads it.
  const highest = points[values.indexOf(Math.max(...values))]!;
  const lowest = points[values.indexOf(Math.min(...values))]!;
  const placed = width > 0 ? linePoints(points, width) : [];
  const muted = { color: palette.neutral[400] };
  return (
    <View style={styles.line}>
      <View style={styles.plotRow}>
        <View style={styles.axis}>
          <Text style={[styles.value, muted]}>{highest.text}</Text>
          <Text style={[styles.value, muted]}>{lowest.text}</Text>
        </View>
        <View testID={`${testID}-plot`} style={styles.plot} onLayout={(event) => onWidth(event.nativeEvent.layout.width)}>
          {placed.length > 0 ? (
            <Svg testID={`${testID}-line`} width={width} height={LINE_HEIGHT}>
              <Polyline
                points={placed.map(({ x, y }) => `${x},${y}`).join(' ')}
                fill="none"
                stroke={palette.accent}
                strokeWidth={2}
              />
              {points.length <= MOST_DOTS
                ? placed.map(({ x, y }, at) => (
                    <Circle
                      key={`dot-${at}`}
                      testID={`${testID}-dot-${at}`}
                      cx={x}
                      cy={y}
                      r={DOT_RADIUS}
                      fill={palette.accent}
                      stroke={palette.neutral[800]}
                    />
                  ))
                : null}
            </Svg>
          ) : null}
        </View>
      </View>
      <View style={styles.ends}>
        <Text style={[styles.value, muted]}>{points[0]!.label}</Text>
        <Text style={[styles.value, muted]}>{points[points.length - 1]!.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.inner },
  title: { fontFamily: fonts.medium, ...typeScale.label },
  bars: { gap: space.inner },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.inner },
  label: { flexBasis: '35%', flexShrink: 1, fontFamily: fonts.regular, ...typeScale.small },
  track: { flex: 1, minWidth: 0 },
  value: { fontFamily: fonts.regular, ...typeScale.small },
  line: { gap: space.inner },
  plotRow: { flexDirection: 'row', gap: space.inner },
  axis: { height: LINE_HEIGHT, justifyContent: 'space-between' },
  plot: { flex: 1, minWidth: 0, height: LINE_HEIGHT },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
});
