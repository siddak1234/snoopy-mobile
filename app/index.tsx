import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { PillButton } from '@/components/nocturne/pill-button';
import { Pressable } from '@/components/pressable';
import { em, fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/hooks/use-session';
import { SESSION_ENDED_BODY, SESSION_ENDED_TITLE } from '@/lib/content/screen-states';
import { coverPlaysEntrance } from '@/lib/view/cover-entrance';

/** CSS `ease-out` (a8xPulse timing). */
const easeOut = Easing.out(Easing.ease);
/** CSS `ease` (a8xUp timing). */
const easeCss = Easing.bezier(0.25, 0.1, 0.25, 1);

/** a8xPulse: 0% scale(1)/opacity .5 → 75% (2100ms) scale(2)/opacity 0,
 *  invisible until 100% (2800ms), infinite. */
const PULSE_ACTIVE_MS = 2100;
const PULSE_HOLD_MS = 700;
const PULSE_RING2_DELAY_MS = 1400;

/**
 * The cover, and the splash.
 *
 * Signed in, this is the splash it always was: the mark, the pulse, and on to
 * the workspace (or the Face ID unlock) 2400ms after mount, or on a tap. Signed
 * out — a fresh install, a sign-out, an ended session, a deleted account — it is
 * the cover: it stays, and "Get started" is the one way on, to Sign in (the
 * owner, build 7: "anytime they have to sign in they see the cover page";
 * BUILD-PLAN 24.11.6). Every route that used to leave for Sign in leaves for
 * here instead, so the cover is what being signed out looks like. A session
 * that ended while it was in use says so over Get started, in the website's
 * words — and the sign-in that follows returns to the screen that was open
 * (Gate 24 parity, G4; `lib/view/return-to.ts`).
 */
export default function SplashScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const navigatedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
  const signedIn = session.status === 'signed-in';
  const locked = session.locked;

  // A session the Face ID lock holds goes to the lock: the root guard keeps the
  // tabs from it until the lock's check passes (the build 13 review).
  const enterWorkspace = useCallback(() => {
    if (navigatedRef.current || !signedIn) return;
    navigatedRef.current = true;
    router.replace(locked ? '/(auth)/faceid' : '/(tabs)/(home)');
  }, [router, signedIn, locked]);

  const getStarted = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace('/(auth)/login');
  }, [router]);

  // Signed in, auto-advance 2400ms after mount, but never before session
  // restoration has resolved. The remaining time is scheduled rather than
  // restarting the full delay when `restoring` changes. Signed out, nothing is
  // scheduled: the cover waits for the person.
  useEffect(() => {
    if (!signedIn) return;
    const elapsed = Date.now() - mountedAtRef.current;
    const t = setTimeout(enterWorkspace, Math.max(0, 2400 - elapsed));
    return () => clearTimeout(t);
  }, [enterWorkspace, signedIn]);

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

  // Kicker group: a8xUp .9s ease .25s both — on a cold start. After a sign-out the
  // cover is shown whole, at once (the owner's build 13 decision 1).
  const playsEntrance = useRef(coverPlaysEntrance()).current;
  const up = useSharedValue(playsEntrance ? 0 : 1);
  useEffect(() => {
    if (!playsEntrance) return;
    up.value = withDelay(250, withTiming(1, { duration: 900, easing: easeCss }));
  }, [up, playsEntrance]);
  const upStyle = useAnimatedStyle(() => ({
    opacity: up.value,
    transform: [{ translateY: 14 * (1 - up.value) }],
  }));

  // Whether the cover's one control is drawn: not while the session is still
  // being restored (a flash of "Get started" for a person who is signed in), and
  // not for a person who is.
  const showGetStarted = session.status !== 'restoring' && !signedIn;
  // Why the person is here, when their session ended under them (G4).
  const ended = session.status === 'signed-out' && session.ended === true;

  return (
    // Signed out, a tap does nothing, so it has no handler and gives no tick (D7).
    <Pressable
      testID="cover"
      onPress={signedIn ? enterWorkspace : undefined}
      style={[styles.root, { backgroundColor: palette.bg }]}>
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
      {ended ? (
        <Animated.View testID="cover-session-ended" accessibilityRole="alert" style={[styles.ended, upStyle]}>
          <Text style={[styles.endedTitle, { color: palette.text }]}>{SESSION_ENDED_TITLE}</Text>
          <Text style={[styles.endedBody, { color: palette.neutral[400] }]}>{SESSION_ENDED_BODY}</Text>
        </Animated.View>
      ) : null}
      {showGetStarted ? (
        <Animated.View testID="cover-get-started" style={[styles.getStarted, upStyle]}>
          <PillButton label="Get started" variant="primary" height={52} onPress={getStarted} />
        </Animated.View>
      ) : null}
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
    fontSize: typeScale.small.fontSize,
    letterSpacing: em(0.36, typeScale.small.fontSize),
    paddingLeft: em(0.36, typeScale.small.fontSize),
  },
  getStarted: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 64,
  },
  // Over Get started (52 tall at 64 from the bottom), clear of the mark above.
  ended: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 140,
    alignItems: 'center',
    gap: 6,
  },
  endedTitle: {
    fontFamily: fonts.medium,
    fontSize: typeScale.lead.fontSize,
    textAlign: 'center',
  },
  endedBody: {
    fontFamily: fonts.regular,
    ...typeScale.body,
    textAlign: 'center',
  },
});
