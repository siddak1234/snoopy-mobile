import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GLASS_BACKING_ALPHA, glassTint, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A Liquid Glass surface (the owner's build 22 items 5–6: "Liquid Glass", the
 * app only), on four things: the tab bar's capsule, the header circles, the
 * drop-down panels and the status-bar strip. A new primitive, snapshot-pinned
 * in both palettes.
 *
 * - iOS 26 and later (`isLiquidGlassAvailable()`): the system's own glass,
 *   `regular`, tinted by `glassTint`, in the app's scheme, interactive on a
 *   button; no ring.
 * - Earlier iOS: a blur under a 55% card colour, inside a hairline ring.
 * - Android: today's look, the card colour at 92% inside a hairline ring.
 *
 * `backing` (round 24 P1, the owner's build 23 F1/F13/F14) lays the card
 * colour (`panel`) or the page colour (`page`) at `GLASS_BACKING_ALPHA` under
 * the children in each form, so the surface reads the same over a busy page
 * and an empty one; its testID is `${testID}-backing`.
 *
 * An accent surface (New's circle) keeps its accent ring where there is a ring.
 */
export function GlassSurface({
  radius,
  interactive = false,
  tone = 'neutral',
  backing,
  style,
  children,
  testID,
}: {
  radius: number;
  interactive?: boolean;
  tone?: 'neutral' | 'accent';
  backing?: 'panel' | 'page';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  const ring = { borderWidth: 1, borderColor: tone === 'accent' ? palette.accent : palette.neutral[800] };
  const under = backing ? (
    <View
      testID={testID ? `${testID}-backing` : undefined}
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: withAlpha(backing === 'page' ? palette.bg : palette.surface, GLASS_BACKING_ALPHA) },
      ]}
    />
  ) : null;

  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView
        testID={testID}
        glassEffectStyle="regular"
        isInteractive={interactive}
        colorScheme={palette.scheme}
        tintColor={glassTint(palette, tone)}
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
        {under}
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View testID={testID} style={[{ borderRadius: radius, overflow: 'hidden' }, ring, style]}>
        <BlurView
          testID={testID ? `${testID}-blur` : undefined}
          intensity={40}
          tint={palette.scheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(palette.surface, 0.55) }]} />
        {under}
        {children}
      </View>
    );
  }

  return (
    <View
      testID={testID}
      style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: withAlpha(palette.surface, 0.92) }, ring, style]}>
      {under}
      {children}
    </View>
  );
}
