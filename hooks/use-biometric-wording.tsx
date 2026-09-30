import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * What this device calls its biometric unlock — BUILD-PLAN 24.4.4, the approved
 * "platform-aware biometric wording".
 *
 * The app said "Face ID" everywhere. That is Apple's name for one sensor on one
 * platform, so an iPhone with Touch ID, and every Android phone, were told about
 * hardware they do not have. Each variant is written out in full rather than
 * assembled, because "Biometric unlock unlock" is what string arithmetic makes.
 */
export type BiometricWording = {
  /** The unlock screen's title. */
  title: string;
  /** Login's way to the unlock screen. */
  unlockLabel: string;
  /** Settings' row, and what it asks for. */
  settingsTitle: string;
  settingsSub: string;
  /** The OS prompt that enables it from Settings. */
  enablePrompt: string;
  unavailable: string;
  unavailableOrUnenrolled: string;
  didNotUnlock: string;
  notEnabled: string;
  notSaved: string;
};

const FACE_ID: BiometricWording = {
  title: 'Face ID',
  unlockLabel: 'Unlock with Face ID',
  settingsTitle: 'Face ID unlock',
  settingsSub: 'Require Face ID when opening',
  enablePrompt: 'Enable Face ID unlock',
  unavailable: 'Face ID is not available on this device.',
  unavailableOrUnenrolled: 'Face ID is not available or enrolled on this device.',
  didNotUnlock: 'Face ID did not unlock this workspace.',
  notEnabled: 'Face ID unlock was not enabled.',
  notSaved: 'Face ID preference could not be saved on this device.',
};

const TOUCH_ID: BiometricWording = {
  title: 'Touch ID',
  unlockLabel: 'Unlock with Touch ID',
  settingsTitle: 'Touch ID unlock',
  settingsSub: 'Require Touch ID when opening',
  enablePrompt: 'Enable Touch ID unlock',
  unavailable: 'Touch ID is not available on this device.',
  unavailableOrUnenrolled: 'Touch ID is not available or enrolled on this device.',
  didNotUnlock: 'Touch ID did not unlock this workspace.',
  notEnabled: 'Touch ID unlock was not enabled.',
  notSaved: 'Touch ID preference could not be saved on this device.',
};

/** Android's own word for the family — fingerprint, face or iris, whichever it has. */
const BIOMETRIC: BiometricWording = {
  title: 'Biometric unlock',
  unlockLabel: 'Unlock with biometrics',
  settingsTitle: 'Biometric unlock',
  settingsSub: 'Require biometrics when opening',
  enablePrompt: 'Enable biometric unlock',
  unavailable: 'Biometric unlock is not available on this device.',
  unavailableOrUnenrolled: 'Biometric unlock is not available or set up on this device.',
  didNotUnlock: 'Biometric unlock did not unlock this workspace.',
  notEnabled: 'Biometric unlock was not enabled.',
  notSaved: 'Biometric unlock preference could not be saved on this device.',
};

/** Pure, so it is tested without a device: the platform and what it reports. */
export function biometricWordingFor(
  os: string,
  types: readonly LocalAuthentication.AuthenticationType[] | undefined,
): BiometricWording {
  if (os !== 'ios') return BIOMETRIC;
  if (types?.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) &&
    !types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return TOUCH_ID;
  }
  // Face ID is every current iPhone's, and the design's own word, so it is the
  // answer until the device says otherwise.
  return FACE_ID;
}

/** The wording for this device: right on first render, refined once it answers. */
export function useBiometricWording(): BiometricWording {
  const [wording, setWording] = useState(() => biometricWordingFor(Platform.OS, undefined));
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let cancelled = false;
    LocalAuthentication.supportedAuthenticationTypesAsync()
      .then((types) => {
        if (!cancelled) setWording(biometricWordingFor(Platform.OS, types));
      })
      .catch(() => {
        // Unanswered: the first render's wording stands.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return wording;
}
