import React, { useEffect } from 'react';
import type { DimensionValue } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

type Props = {
  width?: DimensionValue;
  height: number;
  borderRadius?: number;
  /** Stagger offset in ms (design a8xSkel delays: 0–.6s). */
  delay?: number;
  flex?: boolean;
};

/** Loading placeholder block: neutral-900 fill pulsing .45→1 over 1.4s
 *  (design a8xSkel keyframes). */
export function Skeleton({ width, height, borderRadius = 6, delay = 0, flex = false }: Props) {
  const { palette } = useTheme();
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [t, delay]);

  const pulse = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0.45, 1]),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: palette.neutral[900],
        },
        flex && { flex: 1 },
        pulse,
      ]}
    />
  );
}
