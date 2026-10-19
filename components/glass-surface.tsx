import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { glassTint, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A Liquid Glass surface (the owner's build 22 items 5–6: "Liquid Glass", the
 * app only), on three things: the tab bar's capsule, the header circles and the
 * drop-down panels. A new primitive, snapshot-pinned in both palettes.
 *
 * - iOS 26 and later (`isLiquidGlassAvailable()`): the system's own glass,
 *   `regular`, tinted by `glassTint`, in the app's scheme, interactive on a
 *   button; no ring.
 * - Earlier iOS: a blur under a 55% card colour, inside a hairline ring.
 * - Android: today's look, the card colour at 92% inside a hairline ring.
 *
 * An accent surface (New's circle) keeps its accent ring where there is a ring.
 */
export function GlassSurface({
  radius,
  interactive = false,
  tone = 'neutral',
  style,
  children,
  testID,
}: {
  radius: number;
  interactive?: boolean;
  tone?: 'neutral' | 'accent';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  const ring = { borderWidth: 1, borderColor: tone === 'accent' ? palette.accent : palette.neutral[800] };

  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView
        testID={testID}
        glassEffectStyle="regular"
        isInteractive={interactive}
        colorScheme={palette.scheme}
        tintColor={glassTint(palette, tone)}
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
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
        {children}
      </View>
    );
  }

  return (
    <View
      testID={testID}
      style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: withAlpha(palette.surface, 0.92) }, ring, style]}>
      {children}
    </View>
  );
}
