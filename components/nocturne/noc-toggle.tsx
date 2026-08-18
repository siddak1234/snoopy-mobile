import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { status } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 46×28 pill toggle from the design: white 24px knob travelling 18px,
 *  track neutral-800 → accent, 200ms. */
export function NocToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 200 });
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [palette.neutral[800], palette.accent]),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 18 }],
  }));

  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled || undefined}
      hitSlop={6}
      accessibilityRole="switch"
      accessibilityState={disabled ? { checked: value, disabled: true } : { checked: value }}
      style={disabled ? { opacity: 0.55 } : undefined}>
      <Animated.View
        style={[{ width: 46, height: 28, borderRadius: 999, justifyContent: 'center' }, trackStyle]}>
        <Animated.View
          style={[
            {
              width: 24,
              height: 24,
              borderRadius: 999,
              marginLeft: 2,
              backgroundColor: status.knob,
              shadowColor: status.knobShadowColor,
              shadowOpacity: status.knobShadowOpacity,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            },
            knobStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
