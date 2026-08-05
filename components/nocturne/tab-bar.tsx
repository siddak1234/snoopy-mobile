import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlowArrow,
  Gear,
  House,
  Pulse,
  Storefront,
  type Icon,
} from 'phosphor-react-native';

import { fonts, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Route → tab config, in the design's order (Builder moved under Flows;
 *  the Solutions marketplace took its tab slot). */
const TABS: Record<string, { label: string; icon: Icon }> = {
  '(home)': { label: 'Home', icon: House },
  flows: { label: 'Flows', icon: FlowArrow },
  solutions: { label: 'Solutions', icon: Storefront },
  activity: { label: 'Activity', icon: Pulse },
  settings: { label: 'Settings', icon: Gear },
};

/** The design's tab bar: hairline divider on top, bg at 88% over blur(14),
 *  22px Phosphor glyphs with 10px labels, active = accent. The design's
 *  22px bottom pad already accounts for the home-indicator band; live we
 *  derive it from the safe-area inset. */
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
            if (Platform.OS === 'ios') Haptics.selectionAsync();
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
              <Text style={{ fontFamily: fonts.medium, fontSize: 10, color }}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
