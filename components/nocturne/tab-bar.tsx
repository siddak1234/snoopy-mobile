import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlowArrow,
  Gear,
  House,
  Pulse,
  type Icon,
} from 'phosphor-react-native';

import { GlassSurface } from '@/components/glass-surface';
import { Pressable } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, fontScaleLimit, inset, space, typeScale, withAlpha } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';

/** Route → tab config. Four tabs since 2026-10-02 (BUILD-PLAN 24.9.2): the
 *  Solutions marketplace folded into Flows as its "New" step, on the owner's
 *  word — one name for one thing. */
const TABS: Record<string, { label: string; icon: Icon }> = {
  '(home)': { label: 'Home', icon: House },
  flows: { label: 'Flows', icon: FlowArrow },
  activity: { label: 'Activity', icon: Pulse },
  settings: { label: 'Settings', icon: Gear },
};

/** The capsule's least height (round 23, A3: ~62; taller only at a large text size, round 24 P3). */
const CAPSULE_HEIGHT = 62;
/** Inside the capsule, around the four tabs. */
const CAPSULE_PAD = inset.xs;
/** The lens's slide to a newly focused tab (round 24 P2): eased out, no overshoot. */
const LENS_SLIDE = { duration: 240, easing: Easing.out(Easing.cubic) };

/**
 * Where the lens sits for the tab in `slot` (round 24 P2, the owner's build 23
 * F2, F3): the capsule's pad plus that many tab widths — the same sum the
 * tabs' `flex: 1` lays out, so it is centred under its tab. Pure.
 */
export function lensOffset(slot: number, rowWidth: number, count: number): number {
  if (count <= 0 || slot <= 0) return CAPSULE_PAD;
  return CAPSULE_PAD + slot * ((rowWidth - CAPSULE_PAD * 2) / count);
}

/** The design's tab bar, on Liquid Glass since round 23 (the owner's build 22
 *  items 5–6; S1: the custom bar kept in the layout, not native tabs): the band
 *  under it is the page's colour, 16 pt each side, and in it a capsule
 *  (`GlassSurface`, fully round, ~62 tall) holding the four tabs; the focused
 *  tab sits in an accent lens (`withAlpha(accent, 0.16)`) that latches where it
 *  belongs on the first layout and slides to the tab chosen in 240 ms, eased
 *  out (round 24 P2, the owner's build 23 F2, F3; ~~springs to the tab chosen~~
 *  until round 24, which overshot and shook), and jumps under Reduce Motion
 *  (`useReducedMotion`). ~~A full-width band, a hairline on top, blur under the page's
 *  colour at 88%~~ until round 23. 22px Phosphor glyphs with labels (the
 *  design's 10px, the scale's `micro` since 24.12), active = accent. The bottom
 *  pad is derived from the safe-area inset. A tab ticks as every press does,
 *  through `components/pressable.tsx` (build 11). */
export function NocturneTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom - space.rowY, space.inner);
  const [rowWidth, setRowWidth] = useState(0);
  const shown = state.routes.filter((route) => TABS[route.name]);
  const tabWidth = shown.length > 0 ? (rowWidth - CAPSULE_PAD * 2) / shown.length : 0;
  const focusedSlot = shown.findIndex((route) => route.key === state.routes[state.index]?.key);
  const reduceMotion = useReducedMotion();

  // The lens: set (never animated) on its first layout and on a new row width;
  // a new focus slides it; Reduce Motion sets it. Hidden until first set, so it
  // never shows at the row's start before it latches.
  const lensX = useSharedValue(0);
  const lensShown = useSharedValue(0);
  const lastSlot = useRef<number | null>(null);
  useEffect(() => {
    if (tabWidth <= 0 || focusedSlot < 0) return;
    const target = lensOffset(focusedSlot, rowWidth, shown.length);
    const moved = lastSlot.current !== null && lastSlot.current !== focusedSlot;
    lastSlot.current = focusedSlot;
    lensX.value = moved && !reduceMotion ? withTiming(target, LENS_SLIDE) : target;
    lensShown.value = 1;
  }, [focusedSlot, rowWidth, shown.length, tabWidth, reduceMotion, lensX, lensShown]);
  const lensStyle = useAnimatedStyle(() => ({
    opacity: lensShown.value,
    transform: [{ translateX: lensX.value }],
  }));

  return (
    <View testID="tab-bar" style={{ backgroundColor: palette.bg, paddingHorizontal: space.rowX, paddingTop: inset.sm, paddingBottom }}>
      <GlassSurface radius={999} testID="tab-bar-capsule">
        <View
          testID="tab-bar-row"
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
          style={{ minHeight: CAPSULE_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: CAPSULE_PAD }}>
          {tabWidth > 0 && focusedSlot >= 0 ? (
            <Animated.View
              testID="tab-bar-lens"
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  top: CAPSULE_PAD,
                  bottom: CAPSULE_PAD,
                  left: 0,
                  width: tabWidth,
                  borderRadius: 999,
                  backgroundColor: withAlpha(palette.accent, 0.16),
                },
                lensStyle,
              ]}
            />
          ) : null}
          {state.routes.map((route, index) => {
            const tab = TABS[route.name];
            if (!tab) return null;
            const focused = state.index === index;
            const color = focused ? palette.accent : palette.neutral[500];
            const IconCmp = tab.icon;
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel ?? tab.label}
                onPress={onPress}
                style={{ flex: 1, alignItems: 'center', gap: inset.xxs, paddingVertical: space.inner }}>
                <IconCmp size={22} color={color} weight="regular" />
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={fontScaleLimit.chrome}
                  style={{ fontFamily: fonts.medium, fontSize: typeScale.micro.fontSize, color }}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}
