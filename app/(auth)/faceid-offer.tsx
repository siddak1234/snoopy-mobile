import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useState } from 'react';
import { UserFocus } from 'phosphor-react-native';

import { OfferScreen } from '@/components/offer-screen';
import { useBiometricWording } from '@/hooks/use-biometric-wording';
import { offersPushAsk } from '@/hooks/use-push-registration';
import { writeFaceIdEnabled } from '@/lib/platform/session-store';
import { nextAfterSignIn } from '@/lib/view/return-to';

/**
 * The one-time Face ID question, asked right after a remembered sign-in.
 *
 * Owner direction 2026-10-02 (24.7.3 attempt 4): the system's "Allow Face ID"
 * alert must appear at the moment a person chooses, not at the next launch.
 * So the choice is made here, once per session — "Use Face ID" runs the check
 * now (which is when iOS asks its permission), "Not now" records the answer so
 * the question is not asked again. Either way the session is already signed in;
 * biometrics never create one (ADR-0017). Settings keeps the toggle for later.
 * Answered, it goes where the sign-in would have: the notifications offer when
 * this phone can still be asked (round 24 P8), else the screen an ended
 * session left, or Home (Gate 24 parity, G4) — `nextAfterSignIn`. Its layout is
 * `OfferScreen`, shared with the notifications offer.
 */
export default function FaceIdOfferScreen() {
  const router = useRouter();
  const biometric = useBiometricWording();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const finish = async () => {
    const next = nextAfterSignIn('faceid-offer', { faceId: false, notifications: await offersPushAsk() });
    if (next.options) router.replace(next.href, next.options);
    else router.replace(next.href);
  };

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
      await finish();
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
      await finish();
    }
  };

  return (
    <OfferScreen
      icon={UserFocus}
      title={biometric.offerTitle}
      body={biometric.offerBody}
      message={message}
      accept={{ label: biometric.offerAccept, onPress: enable }}
      decline={{ label: 'Not now', onPress: decline }}
      busy={busy}
    />
  );
}
