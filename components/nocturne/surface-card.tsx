import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  children: React.ReactNode;
  /** --shadow-sm (hairline ring on dark) or --shadow-md. */
  level?: 'sm' | 'md';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Surface-filled content card: --color-surface ground, --radius-lg corners. */
export function SurfaceCard({ children, level = 'sm', onPress, style }: Props) {
  const { palette, elevation } = useTheme();
  const base: StyleProp<ViewStyle> = [
    { backgroundColor: palette.surface, borderRadius: radius.card },
    elevation[level],
    style,
  ];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}
