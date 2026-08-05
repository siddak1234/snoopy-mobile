import React from 'react';
import { Pressable, Text } from 'react-native';

import { fonts, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  height?: number;
};

/** 32px filter chip row item: active = accent outline + accent label. */
export function FilterChip({ label, active = false, onPress, height = 32 }: Props) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        height,
        paddingHorizontal: 13,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? palette.accent : palette.neutral[800],
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? withAlpha(palette.text, 0.06) : 'transparent',
      })}>
      <Text
        style={{
          fontFamily: active ? fonts.medium : fonts.regular,
          fontSize: 12.5,
          color: active ? palette.accent : palette.neutral[400],
        }}>
        {label}
      </Text>
    </Pressable>
  );
}
