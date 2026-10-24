import { useRouter } from 'expo-router';
import { BellRinging } from 'phosphor-react-native';
import React, { useState } from 'react';

import { OfferScreen } from '@/components/offer-screen';
import { usePushAsk } from '@/hooks/use-push-registration';
import {
  NOTIFICATIONS_OFFER_BODY,
  NOTIFICATIONS_OFFER_TITLE,
  PUSH_NOT_NOW_LABEL,
  PUSH_TURN_ON_LABEL,
} from '@/lib/content/screen-states';
import { nextAfterSignIn } from '@/lib/view/return-to';

/**
 * The one-time notifications question after a sign-in (round 24 P8; the owner's
 * build 23 F6: "initially when logging into the app we see face id allow. Just
 * like that it should be notifications allow"), after the Face ID offer where
 * that is asked — and at a kept session's cold start, past the cover or the
 * Face ID lock (`nextAfterColdStart`; backend §12.1 #301, the owner's build 25
 * feedback) — and only where this iPhone can still be asked and the person has
 * not said Not now (`offersPushAsk`). "Turn on" is iOS's own prompt, at the tap
 * (`usePushAsk().turnOn`); "Not now" is kept, so neither this screen nor the
 * inbox's card asks again this session. Either way it goes where the sign-in
 * goes (`nextAfterSignIn`) — Home, after a cold start. The Face ID offer's
 * layout (`OfferScreen`). Guarded with the Face ID offer in the auth stack: signed in, not locked.
 */
export default function NotificationsOfferScreen() {
  const router = useRouter();
  const { turnOn, notNow } = usePushAsk();
  const [busy, setBusy] = useState(false);

  const answer = (choice: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await choice();
    } finally {
      setBusy(false);
      const next = nextAfterSignIn('notifications-offer', { faceId: false, notifications: false });
      if (next.options) router.replace(next.href, next.options);
      else router.replace(next.href);
    }
  };

  return (
    <OfferScreen
      testID="notifications-offer"
      icon={BellRinging}
      title={NOTIFICATIONS_OFFER_TITLE}
      body={NOTIFICATIONS_OFFER_BODY}
      accept={{ label: PUSH_TURN_ON_LABEL, onPress: answer(turnOn) }}
      decline={{ label: PUSH_NOT_NOW_LABEL, onPress: answer(notNow) }}
      busy={busy}
    />
  );
}
