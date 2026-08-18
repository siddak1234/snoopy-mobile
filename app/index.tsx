import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { BrandMark } from '@/components/nocturne/brand-mark';
import { GlowBackground } from '@/components/nocturne/glow-background';
import { em, fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/hooks/use-session';
import { readFaceIdEnabled } from '@/lib/platform/session-store';

/** CSS `ease-out` (a8xPulse timing). */
const easeOut = Easing.out(Easing.ease);
/** CSS `ease` (a8xUp timing). */
const easeCss = Easing.bezier(0.25, 0.1, 0.25, 1);

/** a8xPulse: 0% scale(1)/opacity .5 → 75% (2100ms) scale(2)/opacity 0,
 *  invisible until 100% (2800ms), infinite. */
const PULSE_ACTIVE_MS = 2100;
const PULSE_HOLD_MS = 700;
const PULSE_RING2_DELAY_MS = 1400;

export default function SplashScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const navigatedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  const leaveSplash = useCallback(async () => {
    if (navigatedRef.current) return;
    if (session.status === 'restoring') return;
    navigatedRef.current = true;
    if (session.status === 'signed-in') {
      router.replace(
        (await readFaceIdEnabled()) ? '/(auth)/faceid' : '/(tabs)/(home)',
      );
      return;
    }
    router.replace('/(auth)/welcome');
  }, [router, session.status]);

  // Auto-advance 2400ms after mount, but never before session restoration has
  // resolved. The remaining time is scheduled rather than restarting the full
  // delay when `restoring` changes.
  useEffect(() => {
    if (session.status === 'restoring') return;
    const elapsed = Date.now() - mountedAtRef.current;
    const t = setTimeout(leaveSplash, Math.max(0, 2400 - elapsed));
    return () => clearTimeout(t);
  }, [leaveSplash, session.status]);

  // Pulse ring progress: 0→1 over the active phase, held at 1 while
  // invisible, then snapped back to 0 and repeated.
  const p1 = useSharedValue(0);
  // Ring 2 starts at −1 = "delay not elapsed": CSS fill-mode `none` shows the
  // unanimated ring (opacity 1, scale 1) during its 1.4s delay.
  const p2 = useSharedValue(-1);

  useEffect(() => {
    p1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: PULSE_ACTIVE_MS, easing: easeOut }),
        withTiming(1, { duration: PULSE_HOLD_MS }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
    p2.value = withDelay(
      PULSE_RING2_DELAY_MS,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: PULSE_ACTIVE_MS, easing: easeOut }),
          withTiming(1, { duration: PULSE_HOLD_MS }),
        ),
        -1,
        false,
      ),
    );
  }, [p1, p2]);

  const ring1Style = useAnimatedStyle(() => ({
    opacity: interpolate(p1.value, [0, 1], [0.5, 0]),
    transform: [{ scale: interpolate(p1.value, [0, 1], [1, 2]) }],
  }));
  const ring2Style = useAnimatedStyle(() => {
    const p = p2.value;
    return {
      opacity: p < 0 ? 1 : interpolate(p, [0, 1], [0.5, 0]),
      transform: [{ scale: p < 0 ? 1 : interpolate(p, [0, 1], [1, 2]) }],
    };
  });

  // Kicker group: a8xUp .9s ease .25s both.
  const up = useSharedValue(0);
  useEffect(() => {
    up.value = withDelay(250, withTiming(1, { duration: 900, easing: easeCss }));
  }, [up]);
  const upStyle = useAnimatedStyle(() => ({
    opacity: up.value,
    transform: [{ translateY: 14 * (1 - up.value) }],
  }));

  return (
    <Pressable onPress={leaveSplash} style={[styles.root, { backgroundColor: palette.bg }]}>
      <GlowBackground cx="50%" cy="40%" r="58%" />
      <View style={styles.markWrap}>
        <Animated.View
          style={[styles.ring, { borderColor: palette.accentRamp[700] }, ring1Style]}
        />
        <Animated.View
          style={[styles.ring, { borderColor: palette.accentRamp[700] }, ring2Style]}
        />
        <BrandMark width={196} />
      </View>
      <Animated.View style={[styles.kickerGroup, upStyle]}>
        <Svg width={72} height={1}>
          <Defs>
            <LinearGradient id="hairline" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={palette.accent} stopOpacity={0} />
              <Stop offset="0.5" stopColor={palette.accent} stopOpacity={1} />
              <Stop offset="1" stopColor={palette.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="72" height="1" fill="url(#hairline)" />
        </Svg>
        <Text style={[styles.kicker, { color: palette.neutral[400] }]}>AUTOMATION × AI</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 26,
  },
  markWrap: {
    width: 240,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 999,
    borderWidth: 1,
  },
  kickerGroup: {
    alignItems: 'center',
    gap: 12,
  },
  kicker: {
    fontFamily: fonts.regular,
    fontSize: 12,
    letterSpacing: em(0.36, 12),
    paddingLeft: em(0.36, 12),
  },
});
