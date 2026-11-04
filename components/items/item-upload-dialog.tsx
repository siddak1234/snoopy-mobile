import { ListBullets } from 'phosphor-react-native';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { RunFileField, type HeldFile } from '@/components/automations/run-file-field';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { Dropdown } from '@/components/dropdown';
import { TextField } from '@/components/nocturne/text-field';
import { ScopePill } from '@/components/scope-control';
import { Text } from '@/components/text';
import { fonts, space, status, typeScale } from '@/constants/theme';
import { useHealthAgreement } from '@/hooks/use-health-agreement';
import { useTheme } from '@/hooks/use-theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { CHECK_THIS_VALUE, WORKSPACE_CHANGED, itemRefusal } from '@/lib/content/refusals';
import { CHOOSE_LABEL, OTHER_LABEL, UPLOAD_LABEL, uploadItemLabel } from '@/lib/content/screen-states';
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
 * drop-down (`Dropdown`, as the catalog's category and Activity's outcome; the
 * owner's decision 7 of build 28, ~~chips~~): its title over a pill saying the
 * choice ("Choose" while there is none), which opens its options, then the
 * names typed before (`choices`), then "Other", which shows a text box of 40
 * characters; a text field as a text box of its `maxLength` — then
 * the file (`items.file`, the run's file field on the same upload), then
 * Upload. Upload is offered once every required field holds a value and the
 * file has arrived; it sends `createItem` under one key per set of values, so
 * a retry after a lost answer makes the item once. A refusal is said under
 * the form, and "Check this value." under each field it names (`itemRefusal`).
 * Made, the card closes and
 * the page shows the new row, "Reading…". Mounted only while open.
 *
 * A flow that carries health data, refused 403 `agreement_required` (Round 21
 * stage 2, C3; the upload starts the run that reads it): for the workspace's
 * owner the card steps aside and the agreement opens, as for a run
 * ("Accept and start run"); accepted, the card comes back as it was, its file
 * still held, and sends `createItem` again under the same key; left, it comes
 * back as it was, nothing sent and nothing said. An admin is told the one
 * line under the form (`useHealthAgreement`); a member is refused first as a
 * member, "Only an owner or admin can do this." (`itemRefusal`), as the
 * website's.
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
  const { palette } = useTheme();
  const keys = useIntentKeys('item');
  const healthAgreement = useHealthAgreement('run');
  // The health data agreement is open over the page: the card is off the screen until it closes.
  const [agreeing, setAgreeing] = useState(false);
  // The select whose drop-down is open, by its key.
  const [openSelect, setOpenSelect] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => initialItemValues(items.fields));
  const [others, setOthers] = useState<Record<string, string>>({});
  const [file, setFile] = useState<string | undefined>(undefined);
  // What the file field shows for that file, kept for the field drawn again when the card comes back.
  const [held, setHeld] = useState<HeldFile | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  // Bumped to empty the file field when the platform will not take the file.
  const [fileRound, setFileRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The fields the last refusal named, each said under its field.
  const [refused, setRefused] = useState<readonly string[]>([]);

  const change = (key: string, value: string) => {
    setValues((was) => ({ ...was, [key]: value }));
    keys.settle();
  };
  const changeOther = (key: string, value: string) => {
    setOthers((was) => ({ ...was, [key]: value }));
    keys.settle();
  };
  const onFile = useCallback(
    (_key: string, artifactId: string | undefined, taken?: HeldFile) => {
      setFile(artifactId);
      setHeld(artifactId ? taken : undefined);
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
    setRefused([]);
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
      // A flow that carries health data (C3): the owner accepts the agreement, then the item is sent again, its key the same.
      const agreement = await healthAgreement(caught, workspaceId, () => setAgreeing(true));
      setAgreeing(false);
      if (agreement) {
        if (agreement.accepted) await upload();
        else setError(agreement.line);
        return;
      }
      const refusal = itemRefusal(
        caught,
        items.fields.map((field) => field.key),
      );
      setError(refusal.message);
      setRefused(refusal.fields);
      if (refusal.fileGone) {
        setFile(undefined);
        setHeld(undefined);
        setFileRound((round) => round + 1);
        keys.settle();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible={!agreeing}
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
        {items.fields.map((field) => {
          if (field.control !== 'select') {
            return (
              <View key={field.key} testID={`item-field-${field.key}`} style={styles.fields}>
                <TextField
                  label={field.title}
                  value={values[field.key] ?? ''}
                  onChangeText={(text) => change(field.key, text.slice(0, itemFieldLimit(field)))}
                />
                {refused.includes(field.key) ? <Refused fieldKey={field.key} /> : null}
              </View>
            );
          }
          const options = selectChoices(field, choices[field.key]);
          const label = options.find((option) => option.value === values[field.key])?.label ?? CHOOSE_LABEL;
          return (
            <View key={field.key} testID={`item-field-${field.key}`} style={styles.fields}>
              <View style={styles.select}>
                <Text style={[styles.label, { color: palette.neutral[400] }]}>{field.title}</Text>
                <View style={styles.pill}>
                  <Dropdown
                    testID={`item-field-${field.key}-choice`}
                    title={field.title}
                    options={options}
                    value={values[field.key] ?? null}
                    open={openSelect === field.key}
                    onOpenChange={(open) => setOpenSelect(open ? field.key : null)}
                    onChange={(next) => {
                      change(field.key, next);
                      setOpenSelect(null);
                    }}
                    trigger={
                      <ScopePill
                        testID={`item-field-${field.key}-choice`}
                        icon={ListBullets}
                        label={label}
                        accessibilityLabel={`${field.title}: ${label}`}
                        onPress={() => setOpenSelect(field.key)}
                      />
                    }
                  />
                </View>
              </View>
              {values[field.key] === OTHER_CHOICE ? (
                <TextField
                  label={OTHER_LABEL}
                  placeholder={field.title}
                  value={others[field.key] ?? ''}
                  onChangeText={(text) => changeOther(field.key, text.slice(0, itemFieldLimit(field)))}
                />
              ) : null}
              {refused.includes(field.key) ? <Refused fieldKey={field.key} /> : null}
            </View>
          );
        })}
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
            showTypes
            held={file ? held : undefined}
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

/** Under a field the platform refused. */
function Refused({ fieldKey }: { fieldKey: string }) {
  return (
    <Text testID={`item-field-${fieldKey}-refused`} style={[styles.refused, { color: status.err }]}>
      {CHECK_THIS_VALUE}
    </Text>
  );
}

const styles = StyleSheet.create({
  refused: { fontFamily: fonts.regular, ...typeScale.small },
  // A select's title over its pill, as a text box's label sits over it.
  select: { gap: space.title },
  label: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  pill: { flexDirection: 'row' },
  form: { maxHeight: 460 },
  fields: { gap: space.inner },
  // Flush with the boxes above it: the field's own row padding given back.
  file: { marginHorizontal: -space.rowX },
});
