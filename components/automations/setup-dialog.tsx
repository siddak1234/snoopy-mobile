import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SectionLabel } from '@/components/nocturne/section-label';
import { sectionLabel, SetupFieldRow, bySection, declaredValues, type SetupField } from '@/components/setup-field';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { updateSubscription } from '@/lib/platform/automations';

/**
 * Change an existing subscription's settings (BUILD-PLAN 24.4.1) — the
 * website's "Set up" dialog. It saves the settings only; going live stays its
 * own action. Mounted only while open, so it always starts from what the
 * subscription holds now.
 */
export function SetupDialog({
  subscriptionId,
  shownWorkspaceId,
  setup,
  config,
  onClose,
  onSaved,
}: {
  subscriptionId: string;
  /** The workspace the screen loaded; the save is refused once it is not active. */
  shownWorkspaceId: string | null;
  setup: SetupField[];
  config: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const session = useSession();
  const keys = useIntentKeys('subscription-config');
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(setup.map((field) => [field.key, config[field.key] ?? field.defaultValue])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = (key: string, value: unknown) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    keys.settle();
  };

  const save = async () => {
    if (busy) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateSubscription(workspaceId, subscriptionId, { config: declaredValues(setup, values) }, keys.keyFor());
      keys.settle();
      onSaved();
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The setup was not saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible
      testID="setup-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title="Automation setup"
      body="Complete the settings supplied by this automation."
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy} onPress={onClose} />
          <DialogButton tone="accent" disabled={busy} onPress={save} label={busy ? 'Saving…' : 'Save setup'} />
        </>
      }>
      <ScrollView style={styles.fields} keyboardShouldPersistTaps="handled">
        {bySection(setup).map(({ section, fields }, position) => (
          <View key={section}>
            <SectionLabel>{sectionLabel(position + 1, section)}</SectionLabel>
            {fields.map((field, index) => (
              <SetupFieldRow
                key={field.key}
                field={field}
                value={values[field.key]}
                onChange={(next) => change(field.key, next)}
                divider={index < fields.length - 1}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  fields: {
    maxHeight: 380,
  },
});
