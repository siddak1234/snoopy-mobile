import React from 'react';
import { CaretLeft } from 'phosphor-react-native';

import { GlassSurface } from '@/components/glass-surface';
import { Pressable } from '@/components/pressable';
import { withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 36px circular back button, neutral-400 caret, on Liquid Glass since round 23
 *  (`GlassSurface`, interactive; the owner's build 22 items 5–6; ~~a
 *  neutral-800 ring~~). */
export function BackCircle({ onPress }: { onPress?: () => void }) {
  const { palette } = useTheme();
  return (
    <GlassSurface radius={999} interactive style={{ width: 36, height: 36 }}>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => ({
          flex: 1,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? withAlpha(palette.text, 0.06) : 'transparent',
        })}>
        <CaretLeft size={17} color={palette.neutral[400]} />
      </Pressable>
    </GlassSurface>
  );
}
