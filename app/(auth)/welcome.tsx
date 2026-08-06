import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/nocturne/brand-mark';
import { GlowBackground } from '@/components/nocturne/glow-background';
import { PillButton } from '@/components/nocturne/pill-button';
import { em, fonts, layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** CSS `ease` (a8xUp timing). */
const easeCss = Easing.bezier(0.25, 0.1, 0.25, 1);

/** a8xUp entrance: opacity 0→1 + translateY 14→0, .7s ease, staggered delay. */
function useFadeUp(delayMs: number) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delayMs, withTiming(1, { duration: 700, easing: easeCss }));
  }, [t, delayMs]);
  return useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: 14 * (1 - t.value) }],
  }));
}

export default function WelcomeScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const upMark = useFadeUp(0);
  const upKicker = useFadeUp(80);
  const upTitle = useFadeUp(160);
  const upBody = useFadeUp(240);
  const upActions = useFadeUp(320);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: palette.bg,
          paddingTop: insets.top + (layout.designTop.welcome - layout.statusArea),
        },
      ]}>
      <GlowBackground cx="50%" cy="-10%" r="50%" />
      <Animated.View style={[styles.mark, upMark]}>
        <BrandMark width={118} />
      </Animated.View>
      <Animated.Text style={[styles.kicker, { color: palette.neutral[400] }, upKicker]}>
        AUTOMATION × AI
      </Animated.Text>
      <Animated.Text style={[styles.title, { color: palette.text }, upTitle]}>
        Every repetitive task, done by an agent.
      </Animated.Text>
      <Animated.Text style={[styles.body, { color: palette.neutral[400] }, upBody]}>
        Repetitive work becomes agentic workflows — secure, scalable, autonomous.
      </Animated.Text>
      <View style={styles.spacer} />
      <Animated.View style={[styles.actions, upActions]}>
        <PillButton
          label="Get started"
          variant="primary"
          onPress={() => router.push('/(auth)/signup')}
        />
        <PillButton label="Log in" variant="plain" onPress={() => router.push('/(auth)/login')} />
        <Text style={[styles.footnote, { color: palette.neutral[600] }]}>
          For businesses, solopreneurs and enterprises.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.welcomeX,
    paddingBottom: 56,
  },
  mark: {
    alignSelf: 'flex-start',
  },
  kicker: {
    marginTop: 10,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    letterSpacing: em(0.3, 11.5),
  },
  title: {
    marginTop: 40,
    fontFamily: fonts.medium,
    fontSize: 32,
    lineHeight: 32 * 1.14,
    letterSpacing: em(-0.015, 32),
  },
  body: {
    marginTop: 16,
    fontFamily: fonts.regular,
    fontSize: 15.5,
    lineHeight: 15.5 * 1.55,
    maxWidth: 258,
  },
  spacer: {
    flex: 1,
  },
  actions: {
    gap: 10,
  },
  footnote: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11.5,
  },
});
