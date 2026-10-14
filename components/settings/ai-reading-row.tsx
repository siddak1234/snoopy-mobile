import { Sparkle } from 'phosphor-react-native';
import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ActionFailure } from '@/components/screen-state';
import { SettingsRow, type SettingsRowSize } from '@/components/settings/settings-row';
import { useAiReading } from '@/hooks/use-ai-reading';
import { AI_READING_SETTING, AI_READING_SETTING_FAILED } from '@/lib/content/ai-reading';

/**
 * "AI reads documents" — Settings' SECURITY card, below Face ID (backend
 * ADR-0038; the spec's §3.H): the account's answer to the card Home asks once,
 * on for allowed. Saved on the account for every workspace; a save that fails
 * says so under the switch, and Try again repeats it.
 */
export function AiReadingRow({ size = 'regular', testID }: { size?: SettingsRowSize; testID?: string }) {
  const { choice, save } = useAiReading();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attempted = useRef(true);

  const change = async (allowed: boolean) => {
    if (busy) return;
    attempted.current = allowed;
    setBusy(true);
    setError(null);
    try {
      await save(allowed ? 'allowed' : 'declined');
    } catch {
      setError(AI_READING_SETTING_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <SurfaceCard style={styles.card}>
        <SettingsRow
          icon={Sparkle}
          title={AI_READING_SETTING}
          size={size}
          testID={testID}
          right={<NocToggle value={choice === 'allowed'} disabled={busy} onChange={change} />}
        />
      </SurfaceCard>
      {error ? (
        <ActionFailure message={error} retryLabel="Try again" onRetry={() => change(attempted.current)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Under Face ID's card, as Settings' cards follow one another.
  card: { marginTop: 10 },
});
