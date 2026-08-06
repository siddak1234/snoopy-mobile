import React from 'react';
import { Text, View } from 'react-native';

import { fonts, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  initials: string;
  /** 38 in the Home header, 48 on the Settings profile card. */
  size?: number;
  fontSize?: number;
};

/** Circular initials badge: accent-16% fill, accent-800 ring, accent-200 text. */
export function AvatarBadge({ initials, size = 38, fontSize = 13 }: Props) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: withAlpha(palette.accent, 0.16),
        borderColor: palette.accentRamp[800],
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize, color: palette.accentRamp[200] }}>
        {initials}
      </Text>
    </View>
  );
}
