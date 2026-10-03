import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { UserFocus } from 'phosphor-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ActionFailure } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { useBiometricWording } from '@/hooks/use-biometric-wording';
import { useTheme } from '@/hooks/use-theme';
import { readFaceIdEnabled, writeFaceIdEnabled } from '@/lib/platform/session-store';

/**
 * Settings › Security (24.12, the owner's decision 10): the Face ID unlock,
 * moved here whole from the old single Settings screen. Turning it on runs the
 * check first; the choice is the session's and leaves with it.
 */
export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const biometric = useBiometricWording();
  const [faceId, setFaceId] = useState(false);
  const [faceIdError, setFaceIdError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readFaceIdEnabled().then((enabled) => {
      if (!cancelled) setFaceId(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeFaceId = async (enabled: boolean) => {
    setFaceIdError(null);
    try {
      if (enabled) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
        if (!enrolled) {
          setFaceIdError(biometric.unavailableOrUnenrolled);
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: biometric.enablePrompt,
          disableDeviceFallback: true,
        });
        if (!result.success) {
          setFaceIdError(biometric.notEnabled);
          return;
        }
      }
      await writeFaceIdEnabled(enabled);
      setFaceId(enabled);
    } catch {
      setFaceIdError(biometric.notSaved);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Security</Text>
      </View>
      <SurfaceCard>
        <SettingsRow
          icon={UserFocus}
          title={biometric.settingsTitle}
          sub={biometric.settingsSub}
          right={<NocToggle value={faceId} onChange={changeFaceId} />}
        />
      </SurfaceCard>
      {faceIdError ? (
        <ActionFailure message={faceIdError} retryLabel="Try again" onRetry={() => changeFaceId(true)} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
});
