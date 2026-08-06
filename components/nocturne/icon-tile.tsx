import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { Icon } from 'phosphor-react-native';

import { withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  icon: Icon;
  size?: number;
  iconSize?: number;
  borderRadius?: number;
  /** Accent tint strength for the fill (design uses 10–16%). */
  tint?: number;
  /** 1px accent-800 border, used on flow/template tiles. */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Rounded-square icon badge: accent-tinted fill, accent-300 glyph. */
export function IconTile({
  icon: IconCmp,
  size = 38,
  iconSize = 19,
  borderRadius = 11,
  tint = 0.1,
  bordered = false,
  style,
}: Props) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: withAlpha(palette.accent, tint),
          alignItems: 'center',
          justifyContent: 'center',
        },
        bordered && { borderWidth: 1, borderColor: palette.accentRamp[800] },
        style,
      ]}>
      <IconCmp size={iconSize} color={palette.accentRamp[300]} weight="regular" />
    </View>
  );
}
