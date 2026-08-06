import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { BrandMark } from '@/components/nocturne/brand-mark';
import { GlowBackground } from '@/components/nocturne/glow-background';
import { fonts, radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** CSS `ease` / `ease-in-out` used by a8xGlow / a8xScan. */
const easeCss = Easing.bezier(0.25, 0.1, 0.25, 1);
const easeInOut = Easing.inOut(Easing.ease);

/** The design's 52px Face ID glyph: corner brackets, eyes, nose, smile. */
function FaceGlyph({ color }: { color: string }) {
  return (
    <Svg width={52} height={52} viewBox="0 0 52 52" fill="none">
      <Path
        d="M4 14V9a5 5 0 015-5h5M38 4h5a5 5 0 015 5v5M48 38v5a5 5 0 01-5 5h-5M14 48H9a5 5 0 01-5-5v-5"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx={18} cy={21} r={2.4} fill={color} />
      <Circle cx={34} cy={21} r={2.4} fill={color} />
      <Path
        d="M26 21v8h-3M18 34c2.2 2.4 5 3.6 8 3.6s5.8-1.2 8-3.6"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function FaceIdScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const navigatedRef = useRef(false);

  const goHome = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace('/(tabs)/(home)');
  }, [router]);

  // Prototype behavior: attempt real Face ID only when biometrics are
  // actually enrolled (otherwise iOS falls back to the system passcode
  // sheet, which blocks the app); the design auto-advances after ~2100ms
  // regardless.
  useEffect(() => {
    const t = setTimeout(goHome, 2100);
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
        if (enrolled) {
          await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock your workspace',
            disableDeviceFallback: true,
          });
        }
      } catch {
        // fall through to the timer
      }
    })();
    return () => clearTimeout(t);
  }, [goHome]);

  // a8xGlow: opacity .45 → 1 → .45, 2s ease infinite.
  const glow = useSharedValue(0);
  // a8xScan: translateY −20 → 20 → −20 with opacity .2 → 1 → .2, 1.6s.
  const scan = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 1000, easing: easeCss }), -1, true);
    scan.value = withRepeat(withTiming(1, { duration: 800, easing: easeInOut }), -1, true);
  }, [glow, scan]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.45, 1]),
  }));
  const scanStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scan.value, [0, 1], [0.2, 1]),
    transform: [{ translateY: interpolate(scan.value, [0, 1], [-20, 20]) }],
  }));

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <GlowBackground cx="50%" cy="45%" r="55%" />
      <Animated.View
        style={[
          styles.scanBox,
          {
            borderColor: palette.accent,
            shadowColor: palette.accent,
          },
          glowStyle,
        ]}>
        <FaceGlyph color={palette.accent} />
        <Animated.View style={[styles.scanLineWrap, scanStyle]}>
          <Svg width="100%" height={2}>
            <Defs>
              <LinearGradient id="scan" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={palette.accentRamp[300]} stopOpacity={0} />
                <Stop offset="0.5" stopColor={palette.accentRamp[300]} stopOpacity={1} />
                <Stop offset="1" stopColor={palette.accentRamp[300]} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="2" rx="1" fill="url(#scan)" />
          </Svg>
        </Animated.View>
      </Animated.View>
      <View style={styles.textGroup}>
        <Text style={[styles.title, { color: palette.text }]}>Face ID</Text>
        <Text style={[styles.sub, { color: palette.neutral[400] }]}>
          Unlocking your workspace…
        </Text>
      </View>
      <View style={styles.brand}>
        <BrandMark width={64} opacity={0.5} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 26,
  },
  scanBox: {
    width: 96,
    height: 96,
    borderRadius: radius.faceid,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    /* design: box-shadow 0 0 44px accent@35% */
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  scanLineWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
  },
  textGroup: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 19,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
  },
  brand: {
    position: 'absolute',
    bottom: 64,
  },
});
