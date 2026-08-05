import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GlowBackground } from '@/components/nocturne/glow-background';
import { IconTile } from '@/components/nocturne/icon-tile';
import { PillButton } from '@/components/nocturne/pill-button';
import { em, fonts, layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { onboardingPhases } from '@/lib/fixtures';

/** Design: dot 6×6 neutral-700; active 22px wide accent; transition all .25s. */
function Dot({ active }: { active: boolean }) {
  const { palette } = useTheme();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: 250 });
  }, [active, progress]);

  const animatedStyle = useAnimatedStyle(
    () => ({
      width: interpolate(progress.value, [0, 1], [6, 22]),
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [palette.neutral[700], palette.accent],
      ),
    }),
    [palette],
  );

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();

  const [phase, setPhase] = useState(0);
  const lastPhase = onboardingPhases.length - 1;
  const current = onboardingPhases[phase];

  const next = () => {
    if (phase < lastPhase) {
      setPhase((p) => p + 1);
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: palette.bg,
          paddingTop: insets.top + (layout.designTop.onboarding - layout.statusArea),
        },
      ]}>
      <GlowBackground cx="50%" cy="20%" r="52%" />

      <View style={styles.skipRow}>
        <Pressable onPress={() => router.replace('/(tabs)')} style={styles.skipHit}>
          <Text style={[styles.skipLabel, { color: palette.neutral[400] }]}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.center}>
        <IconTile
          icon={current.icon}
          size={104}
          iconSize={48}
          borderRadius={32}
          tint={0.1}
          bordered
          style={{ borderColor: palette.accentRamp[700] }}
        />
        <Text style={[styles.kicker, { color: palette.accentRamp[300] }]}>{current.kicker}</Text>
        <Text style={[styles.title, { color: palette.text }]}>{current.title}</Text>
        <Text style={[styles.sub, { color: palette.neutral[400] }]}>{current.sub}</Text>
      </View>

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {onboardingPhases.map((_, i) => (
            <Dot key={i} active={i === phase} />
          ))}
        </View>
        <PillButton
          label={phase < lastPhase ? 'Next' : 'Get started'}
          onPress={next}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.welcomeX,
    paddingBottom: 52,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  skipHit: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  skipLabel: {
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  kicker: {
    fontFamily: fonts.regular,
    fontSize: 11,
    letterSpacing: em(0.28, 11),
    textAlign: 'center',
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 27,
    lineHeight: 27 * 1.2,
    letterSpacing: em(-0.015, 27),
    textAlign: 'center',
    /* design: max-width 22ch (Inter ch ≈ .55em → ≈ 327pt) */
    maxWidth: 327,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 15 * 1.55,
    textAlign: 'center',
    /* design: max-width 30ch (Inter ch ≈ .55em → ≈ 248pt) */
    maxWidth: 248,
  },
  bottom: {
    alignItems: 'center',
    gap: 22,
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
  },
  dot: {
    height: 6,
    borderRadius: 999,
  },
  cta: {
    alignSelf: 'stretch',
  },
});
