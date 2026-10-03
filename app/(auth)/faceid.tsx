import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useEffect, useRef, useState } from 'react';
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
import { PillButton } from '@/components/nocturne/pill-button';
import { fonts, layout, radius, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBiometricWording } from '@/hooks/use-biometric-wording';
import { useSession } from '@/hooks/use-session';
import { SIGN_OUT_FAILED } from '@/lib/content/screen-states';
import { readSession } from '@/lib/platform/session-store';

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
  const session = useSession();
  const [message, setMessage] = useState('Unlocking your workspace…');
  // Read through a ref inside the unlock effect: the wording can be refined
  // after the first render, and that must not start a second biometric prompt.
  const wording = useBiometricWording();
  const words = useRef(wording);
  words.current = wording;

  const { unlock } = session;

  // Biometrics unlock an existing enclave-held session; they never mint one.
  // Every refusal remains on the auth side of the route boundary. A check that
  // passes opens the session (`unlock`) before Home is asked for: the root
  // guard holds the tabs from a locked session, so it is this, not the
  // address, that lets Home open — and a link that arrives while the lock shows
  // opens nothing (the build 13 review).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await readSession();
        if (!stored || session.status !== 'signed-in') {
          if (!cancelled) setMessage('Sign in with your identity provider first.');
          return;
        }
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
        if (!enrolled) {
          if (!cancelled) setMessage(words.current.unavailable);
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock your workspace',
          disableDeviceFallback: true,
        });
        if (cancelled) return;
        if (result.success) {
          unlock();
          router.replace('/(tabs)/(home)');
        } else setMessage(words.current.didNotUnlock);
      } catch {
        if (!cancelled) setMessage(words.current.didNotUnlock);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, session.status, unlock]);

  /**
   * "Use identity provider" signs this phone out, the way Settings › Sign out
   * does, and only then shows the cover (the owner's build 12 item 7, option A:
   * "It should allow the user to log back in using their account").
   *
   * The cover waits only for someone signed out. Sent there still signed in, it
   * was the splash, which replaced itself with this lock 2400 ms later — the
   * Face ID prompt again, in a loop (builds 9–12). The sign-out revokes this
   * phone's session (the web's stays), lets go of its push registration and
   * clears the Face ID choice with the tokens, so the next sign-in is asked
   * again. A sign-out that could not be revoked keeps the lock and says so,
   * with nothing cleared (ADR-0017 §4), and the button tries again. With no
   * signed-in session to unlock — an outage, or nothing stored — there is
   * nothing to revoke, and it goes to the cover as before.
   */
  const onUseIdentityProvider = async () => {
    if (session.status !== 'signed-in') {
      router.replace('/');
      return;
    }
    const { revoked } = await session.signOut();
    if (!revoked) {
      setMessage(SIGN_OUT_FAILED);
      return;
    }
    // Signed out is the cover (24.11.6); Sign in is one tap from it.
    router.replace('/');
  };

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
      {/*
        The glow and the clip live on two Views. On Android (observed on the
        Android 15 emulator, RN 0.81.5, new architecture) a View that both
        elevates and clips draws none of its children — `__tests__/
        android-card-overflow.test.js` records the finding. The outer View
        carries the design's glow; the inner carries the ring and clips the
        scan line to it.
      */}
      <Animated.View style={[styles.scanGlow, { shadowColor: palette.accent }, glowStyle]}>
        <View style={[styles.scanBox, { borderColor: palette.accent }]}>
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
        </View>
      </Animated.View>
      <View style={styles.textGroup}>
        <Text style={[styles.title, { color: palette.text }]}>{wording.title}</Text>
        <Text style={[styles.sub, { color: palette.neutral[400] }]}>
          {message}
        </Text>
      </View>
      {message !== 'Unlocking your workspace…' ? (
        <PillButton
          label="Use identity provider"
          height={44}
          fontSize={typeScale.label.fontSize}
          onPress={onUseIdentityProvider}
          style={styles.fallback}
        />
      ) : null}
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
  scanGlow: {
    width: 96,
    height: 96,
    borderRadius: radius.faceid,
    /* design: box-shadow 0 0 44px accent@35% */
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  scanBox: {
    width: 96,
    height: 96,
    borderRadius: radius.faceid,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
    // A sign-out that could not be revoked says so in a long sentence.
    paddingHorizontal: layout.screenX,
  },
  fallback: {
    minWidth: 210,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.title.fontSize,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
    textAlign: 'center',
  },
  brand: {
    position: 'absolute',
    bottom: 64,
  },
});
