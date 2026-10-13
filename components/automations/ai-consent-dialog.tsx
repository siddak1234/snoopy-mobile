import React from 'react';
import { Linking, StyleSheet, Text } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { pressed } from '@/components/pressable';
import {
  AI_CONSENT_AGREE,
  AI_CONSENT_BODY,
  AI_CONSENT_CANCEL,
  AI_CONSENT_POLICY,
  AI_CONSENT_TITLE,
} from '@/lib/content/ai-consent';
import { websiteOrigin } from '@/lib/platform/native-auth';

/**
 * The consent before AI reads a run's file (Apple's Guideline 5.1.2(i)), asked
 * by Start run before a run that carries a file, once per person on this phone
 * (`components/automations/start-run.tsx`). The app's one dialog, drawn as the
 * Delete account confirmation is: the words, Cancel, and the way on — here
 * "Agree and start" — in the accent, since agreeing removes nothing. "Privacy
 * Policy" opens the website's, which names the providers, where the app knows
 * the website's origin, and is plain words where it does not, as on Account
 * deleted. Mounted only while open; closing it any other way is Cancel.
 */
export function AiConsentDialog({ onAgree, onCancel }: { onAgree: () => void; onCancel: () => void }) {
  const site = websiteOrigin();
  const [before, policy, after] = AI_CONSENT_POLICY;
  return (
    <Dialog
      visible
      testID="ai-consent-dialog"
      onRequestClose={onCancel}
      title={AI_CONSENT_TITLE}
      body={AI_CONSENT_BODY}
      actions={
        <>
          <DialogButton label={AI_CONSENT_CANCEL} onPress={onCancel} />
          <DialogButton tone="accent" label={AI_CONSENT_AGREE} onPress={onAgree} />
        </>
      }>
      <DialogText>
        {before}
        {site ? (
          <Text
            style={styles.link}
            accessibilityRole="link"
            testID="ai-consent-privacy"
            onPress={pressed(() => void Linking.openURL(`${site}/privacy`))}>
            {policy}
          </Text>
        ) : (
          policy
        )}
        {after}
      </DialogText>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
});
