import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserFocus } from 'phosphor-react-native';

import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { useBiometricWording } from '@/hooks/use-biometric-wording';
import { useTheme } from '@/hooks/use-theme';
import { writeFaceIdEnabled } from '@/lib/platform/session-store';
import { RETURN_OPTIONS, afterSignIn } from '@/lib/view/return-to';

/**
 * The one-time Face ID question, asked right after a remembered sign-in.
 *
 * Owner direction 2026-10-02 (24.7.3 attempt 4): the system's "Allow Face ID"
 * alert must appear at the moment a person chooses, not at the next launch.
 * So the choice is made here, once per session — "Use Face ID" runs the check
 * now (which is when iOS asks its permission), "Not now" records the answer so
 * the question is not asked again. Either way the session is already signed in;
 * biometrics never create one (ADR-0017). Settings keeps the toggle for later.
 * Answered, it goes where the sign-in would have: the screen an ended session
 * left, or Home (Gate 24 parity, G4).
 */
export default function FaceIdOfferScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const biometric = useBiometricWording();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const finish = () => router.replace(afterSignIn(), RETURN_OPTIONS);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
      if (!enrolled) {
        setMessage(biometric.unavailableOrUnenrolled);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: biometric.enablePrompt,
        disableDeviceFallback: true,
      });
      if (!result.success) {
        setMessage(biometric.notEnabled);
        return;
      }
      await writeFaceIdEnabled(true);
      finish();
    } catch {
      setMessage(biometric.notSaved);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // An explicit "off": the question was answered for this session.
      await writeFaceIdEnabled(false);
    } catch {
      // The session is signed in either way; a preference that could not be
      // written only means the question may be asked again next time.
    } finally {
      setBusy(false);
      finish();
    }
  };

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: palette.bg, paddingTop: insets.top + (layout.designTop.auth - layout.statusArea) },
      ]}>
      <SurfaceCard style={styles.card}>
        <View style={[styles.glyph, { borderColor: palette.accentRamp[700] }]}>
          <UserFocus size={28} color={palette.accentRamp[300]} />
        </View>
        <Text style={[styles.title, { color: palette.text }]}>{biometric.offerTitle}</Text>
        <Text style={[styles.body, { color: palette.neutral[400] }]}>{biometric.offerBody}</Text>
        {message ? <Text style={[styles.message, { color: status.err }]}>{message}</Text> : null}
        <View style={styles.actions}>
          <PillButton
            label={biometric.offerAccept}
            variant="primary"
            height={48}
            fontSize={typeScale.lead.fontSize}
            disabled={busy}
            onPress={enable}
            style={styles.action}
          />
          <PillButton label="Not now" variant="plain" height={44} fontSize={typeScale.label.fontSize} disabled={busy} onPress={decline} />
        </View>
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: layout.authX },
  card: { padding: 22, alignItems: 'center', gap: 10 },
  glyph: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontFamily: fonts.medium, fontSize: typeScale.title.fontSize, letterSpacing: em(-0.01, typeScale.title.fontSize), textAlign: 'center' },
  body: { fontFamily: fonts.regular, ...typeScale.label, textAlign: 'center' },
  message: { fontFamily: fonts.regular, fontSize: typeScale.body.fontSize, textAlign: 'center' },
  actions: { alignSelf: 'stretch', marginTop: 8, gap: 6 },
  action: { alignSelf: 'stretch' },
});
