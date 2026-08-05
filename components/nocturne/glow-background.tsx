import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** Glow centre as percentages of the screen, e.g. cx="50%" cy="40%". */
  cx?: string;
  cy?: string;
  /** Radius at which the glow has fully faded (CSS gradient stop). */
  r?: string;
  /** Defaults to accent-900 — the only glow color the design uses. */
  color?: string;
};

/** RN equivalent of the design's `radial-gradient(circle at X Y,
 *  var(--color-accent-900) 0%, transparent N%)` screen backgrounds. */
export function GlowBackground({ cx = '50%', cy = '40%', r = '58%', color }: Props) {
  const { palette } = useTheme();
  const glow = color ?? palette.accentRamp[900];
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="glow" cx={cx} cy={cy} r={r}>
          <Stop offset="0" stopColor={glow} stopOpacity={1} />
          <Stop offset="1" stopColor={glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
    </Svg>
  );
}
