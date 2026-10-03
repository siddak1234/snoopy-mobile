import React from 'react';
import { Platform, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlowArrow,
  Gear,
  House,
  Pulse,
  type Icon,
} from 'phosphor-react-native';

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

/** The design's tab bar: hairline divider on top, bg at 88% over blur(14),
 *  22px Phosphor glyphs with labels (the design's 10px, the scale's `micro`
 *  since 24.12), active = accent. The design's
 *  22px bottom pad already accounts for the home-indicator band; live we
 *  derive it from the safe-area inset. A tab ticks as every press does, through
 *  `components/pressable.tsx` (build 11): the tick that was this component's own
 *  is the app's rule now. */
export function NocturneTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom - 12, 8);

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: palette.divider, overflow: 'hidden' }}>
      {Platform.OS === 'ios' ? (
        <BlurView
          tint={palette.scheme === 'dark' ? 'dark' : 'light'}
          intensity={40}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      <View
        style={{
          backgroundColor: withAlpha(palette.bg, Platform.OS === 'ios' ? 0.88 : 1),
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingTop: 6,
          paddingHorizontal: 8,
          paddingBottom,
        }}>
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
    </View>
  );
}
