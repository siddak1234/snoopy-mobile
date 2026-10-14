import React, { useState } from 'react';
import { Linking, StyleSheet, Text } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { pressed } from '@/components/pressable';
import { useAiReading } from '@/hooks/use-ai-reading';
import {
  AI_READING_ALLOW,
  AI_READING_BODY,
  AI_READING_CARD_FAILED,
  AI_READING_NOT_NOW,
  AI_READING_POLICY,
  AI_READING_TITLE,
} from '@/lib/content/ai-reading';
import type { AiDocumentReadingChoice } from '@/lib/platform/ai-reading';
import { websiteOrigin } from '@/lib/platform/native-auth';

/**
 * "AI reads your documents" — the account's one question about AI (backend
 * ADR-0038; the spec's §3.G): Allow or Not now, saved on the account for every
 * workspace and every device. Drawn as the app's other dialogs are; Allow in
 * the accent. "Privacy Policy" opens the website's, which names the providers,
 * where the app knows the website's origin. A save that fails says so and the
 * card stays; `onAnswered` follows a saved answer.
 */
export function AiReadingCard({
  onAnswered,
  onDismiss,
  testID = 'ai-reading-card',
}: {
  onAnswered?: (choice: AiDocumentReadingChoice) => void;
  /** Closed without an answer (the system back gesture): nothing is saved. */
  onDismiss?: () => void;
  testID?: string;
}) {
  const { save } = useAiReading();
  const [busy, setBusy] = useState<AiDocumentReadingChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const site = websiteOrigin();
  const [before, policy, after] = AI_READING_POLICY;

  const answer = async (choice: AiDocumentReadingChoice) => {
    if (busy) return;
    setBusy(choice);
    setError(null);
    try {
      await save(choice);
      onAnswered?.(choice);
    } catch {
      setError(AI_READING_CARD_FAILED);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      visible
      testID={testID}
      onRequestClose={() => (busy ? undefined : onDismiss?.())}
      title={AI_READING_TITLE}
      body={AI_READING_BODY}
      actions={
        <>
          <DialogButton label={AI_READING_NOT_NOW} disabled={busy !== null} onPress={() => answer('declined')} />
          <DialogButton tone="accent" label={AI_READING_ALLOW} disabled={busy !== null} onPress={() => answer('allowed')} />
        </>
      }>
      <DialogText>
        {before}
        {site ? (
          <Text
            style={styles.link}
            accessibilityRole="link"
            testID="ai-reading-privacy"
            onPress={pressed(() => void Linking.openURL(`${site}/privacy`))}>
            {policy}
          </Text>
        ) : (
          policy
        )}
        {after}
      </DialogText>
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

/**
 * The card once, on Home, while the account has never answered
 * (`aiDocumentReading` null) — a new sign-in or an existing account alike. Once
 * answered it is not drawn again; closed with the back gesture, it waits for
 * the next time Home is opened.
 */
export function AiReadingCardOnce() {
  const { choice, signedIn } = useAiReading();
  const [dismissed, setDismissed] = useState(false);
  if (!signedIn || choice !== null || dismissed) return null;
  return <AiReadingCard onDismiss={() => setDismissed(true)} />;
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
});
