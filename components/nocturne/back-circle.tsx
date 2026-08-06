import React from 'react';
import { Pressable } from 'react-native';
import { CaretLeft } from 'phosphor-react-native';

import { withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 36px circular back button: neutral-800 ring, neutral-400 caret. */
export function BackCircle({ onPress }: { onPress?: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.neutral[800],
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? withAlpha(palette.text, 0.06) : 'transparent',
      })}>
      <CaretLeft size={17} color={palette.neutral[400]} />
    </Pressable>
  );
}
