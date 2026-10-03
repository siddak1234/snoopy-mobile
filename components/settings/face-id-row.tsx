import * as LocalAuthentication from 'expo-local-authentication';
import { UserFocus } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ActionFailure } from '@/components/screen-state';
import { SettingsRow, type SettingsRowSize } from '@/components/settings/settings-row';
import { useBiometricWording } from '@/hooks/use-biometric-wording';
import { readFaceIdEnabled, writeFaceIdEnabled } from '@/lib/platform/session-store';

/**
 * The Face ID unlock row — Settings' SECURITY card, with its failure under it
 * (build 11, the owner's build 10 item 2: "Security does not need its own page
 * it can be in the main settings page like before"). The handler is the one
 * the old single Settings screen and build 10's Security page had: turning it
 * on runs the hardware and enrolment check, then the OS prompt; the choice is
 * the session's and leaves with it (`lib/platform/session-store.ts`). The
 * state is read from the secure store, never the platform, so the index still
 * reads nothing for it.
 */
export function FaceIdRow({ size = 'regular', testID }: { size?: SettingsRowSize; testID?: string }) {
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

  // Try again repeats the change that failed — turning Face ID off as well as on
  // (build 13's button audit: it always turned Face ID on).
  const attempted = useRef(true);
  const changeFaceId = async (enabled: boolean) => {
    attempted.current = enabled;
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
    <View>
      <SurfaceCard style={styles.card}>
        <SettingsRow
          icon={UserFocus}
          title={biometric.settingsTitle}
          sub={biometric.settingsSub}
          size={size}
          testID={testID}
          right={<NocToggle value={faceId} onChange={changeFaceId} />}
        />
      </SurfaceCard>
      {/* Directly under the toggle, not at the foot of the page: it names this row's failure. */}
      {faceIdError ? (
        <ActionFailure message={faceIdError} retryLabel="Try again" onRetry={() => changeFaceId(attempted.current)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The 9 under a section label, as every labelled card on Settings sits.
  card: { marginTop: 9 },
});
