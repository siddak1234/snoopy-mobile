import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SectionLabel } from '@/components/nocturne/section-label';
import { sectionLabel, SetupFieldRow, bySection, declaredValues, type SetupField } from '@/components/setup-field';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { MOVE_REFUSALS, WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { updateSubscription } from '@/lib/platform/automations';

/**
 * Change an existing subscription's settings (BUILD-PLAN 24.4.1) — the
 * website's "Set up" dialog. It saves the settings only; going live stays its
 * own action. Mounted only while open, so it always starts from what the
 * subscription holds now.
 *
 * **With `moveTo`, the settings are the version it moves to, and saving moves
 * it** (backend §12.1 #185): a move refused because the settings do not fit
 * that version (`invalid_config`) is answered with that version's fields seeded
 * from what the flow holds, sent with the move in one change — Set up itself
 * draws the version the flow runs, so it could never fix a mismatch with
 * another one. The Move dialog draws that form itself, in its own sheet
 * (`useSetupForm`, `SetupFields`): iOS will not present a second modal while
 * the first is still being dismissed, so a second dialog swapped in for the
 * Move one was never shown (the connections card's rule; the review of #49).
 */
export function SetupDialog({
  subscriptionId,
  shownWorkspaceId,
  setup,
  config,
  moveTo,
  onClose,
  onSaved,
}: {
  subscriptionId: string;
  /** The workspace the screen loaded; the save is refused once it is not active. */
  shownWorkspaceId: string | null;
  setup: SetupField[];
  config: Record<string, unknown>;
  /** The version the save moves the flow to, whose fields `setup` are. */
  moveTo?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useSetupForm({ subscriptionId, shownWorkspaceId, setup, config, moveTo, onSaved });

  return (
    <Dialog
      visible
      testID="setup-dialog"
      onRequestClose={form.busy ? () => undefined : onClose}
      title={moveTo === undefined ? 'Flow setup' : `Settings for v${moveTo}`}
      body={
        moveTo === undefined
          ? 'Complete the settings supplied by this flow.'
          : `v${moveTo} checks its settings differently. Set them for it; saving moves the flow.`
      }
      actions={
        <>
          <DialogButton label="Cancel" disabled={form.busy} onPress={onClose} />
          <DialogButton
            tone="accent"
            disabled={form.busy}
            onPress={() => void form.save()}
            label={moveTo === undefined ? (form.busy ? 'Saving…' : 'Save setup') : form.busy ? 'Moving…' : `Save and move to v${moveTo}`}
          />
        </>
      }>
      <SetupFields setup={setup} values={form.values} onChange={form.change} />
      {form.error ? <DialogText tone="error">{form.error}</DialogText> : null}
    </Dialog>
  );
}

/**
 * The form's state and its one write: the values, seeded from what the flow
 * holds (`reset` seeds them again), and the save — the settings alone, or with
 * `moveTo` the settings and the move in one change, under a key spent by a
 * success or a changed value.
 */
export function useSetupForm({
  subscriptionId,
  shownWorkspaceId,
  setup,
  config,
  moveTo,
  onSaved,
}: {
  subscriptionId: string;
  shownWorkspaceId: string | null;
  setup: SetupField[];
  config: Record<string, unknown>;
  moveTo?: number;
  onSaved: () => void;
}) {
  const session = useSession();
  const keys = useIntentKeys(moveTo === undefined ? 'subscription-config' : `version-config-${moveTo}`);
  const seed = () => Object.fromEntries(setup.map((field) => [field.key, config[field.key] ?? field.defaultValue]));
  const [values, setValues] = useState<Record<string, unknown>>(seed);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = (key: string, value: unknown) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    keys.settle();
  };

  /** Seeded again from what the flow holds now, nothing said: the form as it first opens. */
  const reset = () => {
    setValues(seed());
    setError(null);
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
      const change = { config: declaredValues(setup, values), ...(moveTo === undefined ? {} : { templateVersion: moveTo }) };
      await updateSubscription(workspaceId, subscriptionId, change, keys.keyFor());
      keys.settle();
      onSaved();
    } catch (caught) {
      setError(
        moveTo === undefined
          ? refusalMessage(caught, {}, 'The setup was not saved.')
          : refusalMessage(caught, MOVE_REFUSALS, 'The flow was not moved.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return { values, change, reset, save, busy, error };
}

/** The fields, by section, in the manifest's order; about a screen of them scroll. */
export function SetupFields({
  setup,
  values,
  onChange,
}: {
  setup: SetupField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <ScrollView style={styles.fields} keyboardShouldPersistTaps="handled">
      {bySection(setup).map(({ section, fields }, position) => (
        // The manifest's order can come back to a section, so its place keys it.
        <View key={`${section}-${position}`}>
          <SectionLabel>{sectionLabel(position + 1, section)}</SectionLabel>
          {fields.map((field, index) => (
            <SetupFieldRow
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(next) => onChange(field.key, next)}
              divider={index < fields.length - 1}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fields: {
    maxHeight: 380,
  },
});
