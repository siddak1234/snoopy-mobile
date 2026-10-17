import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  NumberedSectionLabel,
  SetupFieldRow,
  bySection,
  declaredValues,
  rowFields,
  sectionLabel,
  type SetupField,
} from '@/components/setup-field';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { MOVE_REFUSALS, WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { SETUP_SAVE_FAILED } from '@/lib/content/screen-states';
import { updateSubscription } from '@/lib/platform/automations';

/**
 * The settings form a flow's move to a newer version draws (backend §12.1 #185):
 * a move refused because the settings do not fit that version
 * (`invalid_config`) is answered with that version's fields seeded from what
 * the flow holds, sent with the move in one change. The Move dialog draws that
 * form itself, in its own sheet (`useSetupForm`, `SetupFields`): iOS will not
 * present a second modal while the first is still being dismissed, so a second
 * dialog swapped in for the Move one was never shown (the connections card's
 * rule; the review of #49).
 *
 * ~~`SetupDialog`, "Set up {name}" over the flow page~~ until Build 21: Set up is
 * one page, opened from the flow page's "Edit setup" (the owner's AM4).
 */

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
        moveTo === undefined ? SETUP_SAVE_FAILED : refusalMessage(caught, MOVE_REFUSALS, 'The flow was not moved.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return { values, change, reset, save, busy, error };
}

/**
 * The fields, by section, in the manifest's order, each section a numbered
 * step; about a screen of them scroll. The vendor choice is not a row — it has
 * its own page (Connect vendor) — and is saved as the flow holds it.
 */
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
      {bySection(rowFields(setup)).map(({ section, fields }, position) => (
        // The manifest's order can come back to a section, so its place keys it.
        <View key={`${section}-${position}`}>
          <NumberedSectionLabel>{sectionLabel(position + 1, section)}</NumberedSectionLabel>
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
