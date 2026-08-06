import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { em, fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  children: string;
  fontSize?: number;
  /** Letter-spacing in em (design: .14em sections, .16em card kickers,
   *  .26–.36em brand kickers). */
  track?: number;
  /** Defaults to neutral-400; pass accentRamp[300] for accent kickers. */
  color?: string;
  style?: StyleProp<TextStyle>;
};

/** Tracked uppercase kicker/section label. */
export function SectionLabel({ children, fontSize = 11, track = 0.14, color, style }: Props) {
  const { palette } = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: fonts.regular,
          fontSize,
          letterSpacing: em(track, fontSize),
          color: color ?? palette.neutral[400],
        },
        style,
      ]}>
      {children}
    </Text>
  );
}
