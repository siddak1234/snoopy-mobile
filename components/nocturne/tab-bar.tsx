import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { LinearTransition } from 'react-native-reanimated';
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
import { fonts, typeScale, withAlpha } from '@/constants/theme';
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

/** The capsule's height (round 23, A3: ~62). */
const CAPSULE_HEIGHT = 62;
/** Inside the capsule, around the four tabs. */
const CAPSULE_PAD = 4;

/** The design's tab bar, on Liquid Glass since round 23 (the owner's build 22
 *  items 5–6; S1: the custom bar kept in the layout, not native tabs): the band
 *  under it is the page's colour, 16 pt each side, and in it a capsule
 *  (`GlassSurface`, fully round, ~62 tall) holding the four tabs; the focused
 *  tab sits in an accent lens (`withAlpha(accent, 0.16)`) that springs to the
 *  tab chosen — and jumps under Reduce Motion (the transition's system
 *  setting). ~~A full-width band, a hairline on top, blur under the page's
 *  colour at 88%~~ until round 23. 22px Phosphor glyphs with labels (the
 *  design's 10px, the scale's `micro` since 24.12), active = accent. The bottom
 *  pad is derived from the safe-area inset. A tab ticks as every press does,
 *  through `components/pressable.tsx` (build 11). */
export function NocturneTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom - 12, 8);
  const [rowWidth, setRowWidth] = useState(0);
  const shown = state.routes.filter((route) => TABS[route.name]);
  const tabWidth = shown.length > 0 ? (rowWidth - CAPSULE_PAD * 2) / shown.length : 0;
  const focusedSlot = shown.findIndex((route) => route.key === state.routes[state.index]?.key);

  return (
    <View testID="tab-bar" style={{ backgroundColor: palette.bg, paddingHorizontal: 16, paddingTop: 6, paddingBottom }}>
      <GlassSurface radius={999} testID="tab-bar-capsule">
        <View
          testID="tab-bar-row"
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
          style={{ height: CAPSULE_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: CAPSULE_PAD }}>
          {tabWidth > 0 && focusedSlot >= 0 ? (
            <Animated.View
              testID="tab-bar-lens"
              pointerEvents="none"
              layout={LinearTransition.springify().damping(18)}
              style={{
                position: 'absolute',
                top: CAPSULE_PAD,
                bottom: CAPSULE_PAD,
                left: CAPSULE_PAD + focusedSlot * tabWidth,
                width: tabWidth,
                borderRadius: 999,
                backgroundColor: withAlpha(palette.accent, 0.16),
              }}
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
                style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 8 }}>
                <IconCmp size={22} color={color} weight="regular" />
                <Text style={{ fontFamily: fonts.medium, fontSize: typeScale.micro.fontSize, color }}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}
