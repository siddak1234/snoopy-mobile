import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { RunFileField } from '@/components/automations/run-file-field';
import { ChoiceChips } from '@/components/choice-chips';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { TextField } from '@/components/nocturne/text-field';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED, itemRefusal } from '@/lib/content/refusals';
import { OTHER_LABEL, UPLOAD_LABEL, uploadItemLabel } from '@/lib/content/screen-states';
import { createItem, type AutomationItems, type Item } from '@/lib/platform/automations';
import {
  OTHER_CHOICE,
  initialItemValues,
  itemFieldLimit,
  itemFieldValues,
  itemFieldsComplete,
  selectChoices,
} from '@/lib/view/items';

/**
 * The upload card (Round 19, plan §5.2; the website's dialog, the same
 * fields): each of the flow's `items.fields` in order — a select as the app's
 * chips (`ChoiceChips`, the app's select since a phone has none): its options,
 * then the names typed before (`choices`), then "Other", which shows a text
 * box of 40 characters; a text field as a text box of its `maxLength` — then
 * the file (`items.file`, the run's file field on the same upload), then
 * Upload. Upload is offered once every required field holds a value and the
 * file has arrived; it sends `createItem` under one key per set of values, so
 * a retry after a lost answer makes the item once. Made, the card closes and
 * the page shows the new row, "Reading…". Mounted only while open.
 */
export function ItemUploadDialog({
  items,
  choices,
  subscriptionId,
  shownWorkspaceId,
  onClose,
  onMade,
}: {
  items: AutomationItems;
  choices: Readonly<Record<string, string[]>>;
  subscriptionId: string;
  shownWorkspaceId: string | null;
  onClose: () => void;
  onMade: (item: Item) => void;
}) {
  const session = useSession();
  const keys = useIntentKeys('item');
  const [values, setValues] = useState<Record<string, string>>(() => initialItemValues(items.fields));
  const [others, setOthers] = useState<Record<string, string>>({});
  const [file, setFile] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  // Bumped to empty the file field when the platform will not take the file.
  const [fileRound, setFileRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (key: string, value: string) => {
    setValues((was) => ({ ...was, [key]: value }));
    keys.settle();
  };
  const changeOther = (key: string, value: string) => {
    setOthers((was) => ({ ...was, [key]: value }));
    keys.settle();
  };
  const onFile = useCallback(
    (_key: string, artifactId: string | undefined) => {
      setFile(artifactId);
      keys.settle();
    },
    [keys],
  );
  const onBusyChange = useCallback((_key: string, isBusy: boolean) => setUploading(isBusy), []);

  const ready = itemFieldsComplete(items.fields, values, others) && file !== undefined && !uploading && !busy;

  const upload = async () => {
    if (!ready || !file) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { item } = await createItem(
        workspaceId,
        subscriptionId,
        { fields: itemFieldValues(items.fields, values, others), file },
        keys.keyFor(),
      );
      keys.settle();
      onMade(item);
    } catch (caught) {
      const refused = itemRefusal(caught);
      setError(refused.message);
      if (refused.fileGone) {
        setFile(undefined);
        setFileRound((round) => round + 1);
        keys.settle();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible
      testID="item-upload-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title={uploadItemLabel(items.words)}
      actions={
        <>
          <DialogButton testID="item-upload-cancel" label="Cancel" disabled={busy} onPress={onClose} />
          <DialogButton
            testID="item-upload-send"
            tone="accent"
            disabled={!ready}
            label={busy ? 'Uploading…' : UPLOAD_LABEL}
            onPress={upload}
          />
        </>
      }>
      <ScrollView style={styles.form} contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
        {items.fields.map((field) =>
          field.control === 'select' ? (
            <View key={field.key} testID={`item-field-${field.key}`} style={styles.fields}>
              <ChoiceChips
                label={field.title}
                options={selectChoices(field, choices[field.key])}
                value={values[field.key] ?? ''}
                onChange={(next) => change(field.key, next)}
              />
              {values[field.key] === OTHER_CHOICE ? (
                <TextField
                  label={OTHER_LABEL}
                  placeholder={field.title}
                  value={others[field.key] ?? ''}
                  onChangeText={(text) => changeOther(field.key, text.slice(0, itemFieldLimit(field)))}
                />
              ) : null}
            </View>
          ) : (
            <TextField
              key={field.key}
              label={field.title}
              value={values[field.key] ?? ''}
              onChangeText={(text) => change(field.key, text.slice(0, itemFieldLimit(field)))}
            />
          ),
        )}
        {/* The run's file field, flush with the boxes above it. */}
        <View style={styles.file}>
          <RunFileField
            key={`${items.file.key}:${fileRound}`}
            field={{ key: items.file.key, title: items.file.title, acceptedContentTypes: items.file.acceptedContentTypes }}
            shownWorkspaceId={shownWorkspaceId}
            subscriptionId={subscriptionId}
            onValue={onFile}
            onBusyChange={onBusyChange}
            divider={false}
          />
        </View>
        {error ? (
          <DialogText tone="error" testID="item-upload-error">
            {error}
          </DialogText>
        ) : null}
      </ScrollView>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  form: { maxHeight: 460 },
  fields: { gap: 12 },
  file: { marginHorizontal: -14 },
});
