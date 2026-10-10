import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Paperclip, UploadSimple, type Icon } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/pressable';
import { fonts, status, typeScale, withAlpha } from '@/constants/theme';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { UPLOAD_REFUSALS, WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { CAMERA_NOT_OPENED, CAMERA_OFF, TAKE_PHOTO_LABEL, UPLOAD_LABEL } from '@/lib/content/screen-states';
import type { AutomationRunInputField } from '@/lib/platform/automations';
import { sendRunFile, type ChosenFile } from '@/lib/platform/run-file';
import { PHOTO_NAME, RUN_FILE_TYPES, isImage, jpegName, reencodeImage } from '@/lib/platform/run-image';

type FileState =
  | { kind: 'empty' }
  | { kind: 'uploading'; name: string }
  | { kind: 'ready'; name: string; sizeBytes: number };

/** What the field was given: an image, sent re-encoded as a JPEG, or a file sent as it is. */
type Picked = { uri: string; name: string; image: boolean; mimeType?: string };

/**
 * A run's file field (backend FR-14, ADR-0030's `artifact` control) — the
 * website's `RunFileField`, on the same operations.
 *
 * Two ways to give it a file, side by side (BUILD-PLAN 25.8.3; the owner's
 * decision 1 of 2026-10-10): **Take photo**, the camera through
 * expo-image-picker, its permission asked first and a refusal said in a
 * sentence here; and **Upload**, the document picker, limited to a PDF, a JPEG
 * or a PNG (`RUN_FILE_TYPES`) because a run-input field carries no list of
 * types. Every image — a photo, or a JPEG or PNG uploaded — is re-encoded once
 * (`reencodeImage`: upright, its long side at most 2,576 px, a JPEG at 0.9) and
 * sent as `image/jpeg` under a `.jpg` name; a PDF is sent as it is.
 *
 * Giving a file uploads it at once (`sendRunFile`), and the field's value is
 * then only the file's id, which is all a run's input carries. An upload belongs
 * to the field that started it: its busy state is reported under the field's
 * key, it stops when the field goes (the form started a run, or was emptied to
 * choose again), and an answer for an upload no longer in flight changes nothing.
 */
export function RunFileField({
  field,
  shownWorkspaceId,
  subscriptionId,
  onValue,
  onBusyChange,
  divider,
}: {
  field: AutomationRunInputField;
  /** The workspace the screen loaded; the upload is refused once it is not active. */
  shownWorkspaceId: string | null;
  subscriptionId: string;
  onValue: (key: string, artifactId: string | undefined) => void;
  onBusyChange: (key: string, busy: boolean) => void;
  divider: boolean;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const [state, setState] = useState<FileState>({ kind: 'empty' });
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const report = useRef(onBusyChange);
  useEffect(() => {
    report.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    const key = field.key;
    return () => {
      const upload = inFlight.current;
      if (!upload) return;
      inFlight.current = null;
      upload.abort();
      report.current(key, false);
    };
  }, [field.key]);

  /** The workspace an upload may go to, or null with the refusal said. */
  const workspaceFor = (): string | null => {
    setError(null);
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) setError(WORKSPACE_CHANGED);
    return workspaceId;
  };

  const takePhoto = async () => {
    const workspaceId = workspaceFor();
    if (!workspaceId) return;
    let taken: ImagePicker.ImagePickerResult;
    try {
      // Asked at the press, never before: a refusal is a sentence in the field, not a crash.
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(CAMERA_OFF);
        return;
      }
      // Images only; the one lossy encode is the re-encode, so the camera's is at full quality.
      taken = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    } catch {
      setError(CAMERA_NOT_OPENED);
      return;
    }
    // Closing the camera keeps whatever the field already held.
    const photo = taken.canceled ? undefined : taken.assets[0];
    if (!photo) return;
    await send(workspaceId, { uri: photo.uri, name: PHOTO_NAME, image: true });
  };

  const upload = async () => {
    const workspaceId = workspaceFor();
    if (!workspaceId) return;
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: RUN_FILE_TYPES, copyToCacheDirectory: true, multiple: false });
    } catch {
      setError('The file could not be opened. Try again.');
      return;
    }
    // Closing the picker keeps whatever the field already held.
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    await send(
      workspaceId,
      isImage(asset)
        ? { uri: asset.uri, name: jpegName(asset.name), image: true }
        : { uri: asset.uri, name: asset.name, image: false, ...(asset.mimeType ? { mimeType: asset.mimeType } : {}) },
    );
  };

  const send = async (workspaceId: string, picked: Picked) => {
    inFlight.current?.abort();
    const sending = new AbortController();
    inFlight.current = sending;
    setState({ kind: 'uploading', name: picked.name });
    onValue(field.key, undefined);
    onBusyChange(field.key, true);
    try {
      const chosen = await prepare(picked);
      if (sending.signal.aborted) return;
      const uploaded = await sendRunFile(workspaceId, subscriptionId, chosen, sending.signal);
      if (sending.signal.aborted) return;
      setState({ kind: 'ready', name: uploaded.filename, sizeBytes: uploaded.sizeBytes });
      onValue(field.key, uploaded.artifactId);
    } catch (failure) {
      if (sending.signal.aborted) return;
      setState({ kind: 'empty' });
      setError(refusalMessage(failure, UPLOAD_REFUSALS, 'The file could not be sent.'));
    } finally {
      if (inFlight.current === sending) {
        inFlight.current = null;
        onBusyChange(field.key, false);
      }
    }
  };

  const busy = state.kind === 'uploading';
  const progress =
    state.kind === 'uploading'
      ? `Uploading ${state.name}…`
      : state.kind === 'ready'
        ? `Ready: ${state.name} (${formatSize(state.sizeBytes)})`
        : null;

  // Title line, then the description, then the two ways to give the file at
  // full width — the Setup rows' order, so both read alike in one card.
  return (
    <View style={[styles.row, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
      <View style={styles.titleLine}>
        <Paperclip size={20} color={palette.accentRamp[300]} />
        <Text style={[styles.title, { color: palette.text }]}>
          {field.title}
          {field.required ? null : <Text style={{ color: palette.neutral[400] }}> (optional)</Text>}
        </Text>
      </View>
      <Text style={[styles.sub, { color: palette.neutral[400] }]}>{field.description}</Text>
      {progress ? <Text style={[styles.sub, { color: palette.neutral[400] }]}>{progress}</Text> : null}
      {error ? <Text style={[styles.sub, { color: status.err }]}>{error}</Text> : null}
      <View style={styles.actions}>
        <FileAction
          testID={`run-file-${field.key}-photo`}
          label={TAKE_PHOTO_LABEL}
          accessibilityLabel={`Take a photo for ${field.title}`}
          icon={Camera}
          busy={busy}
          onPress={() => void takePhoto()}
        />
        <FileAction
          testID={`run-file-${field.key}-upload`}
          label={UPLOAD_LABEL}
          accessibilityLabel={`Upload a file for ${field.title}`}
          icon={UploadSimple}
          busy={busy}
          onPress={() => void upload()}
        />
      </View>
    </View>
  );
}

/** One way to give the field its file: an outlined pill, held while an upload is in flight. */
function FileAction({
  testID,
  label,
  accessibilityLabel,
  icon: IconCmp,
  busy,
  onPress,
}: {
  testID: string;
  label: string;
  accessibilityLabel: string;
  icon: Icon;
  busy: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const color = busy ? palette.neutral[500] : palette.accentRamp[300];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={busy ? { disabled: true } : undefined}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { borderColor: busy ? palette.neutral[700] : palette.accent },
        pressed && !busy && { backgroundColor: withAlpha(palette.accent, 0.12) },
      ]}>
      <IconCmp size={16} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * What is read and sent for what was given. A PDF goes as it is, with the type
 * the picker named; an image goes re-encoded — an `image/jpeg` whatever it was.
 */
async function prepare(picked: Picked): Promise<ChosenFile> {
  const { uri, mimeType } = picked.image
    ? { uri: (await reencodeImage(picked.uri)).uri, mimeType: 'image/jpeg' }
    : { uri: picked.uri, mimeType: picked.mimeType };
  const file = new File(uri);
  return {
    name: picked.name,
    ...(mimeType ? { mimeType } : {}),
    sizeBytes: file.size,
    read: () => file.bytes(),
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  row: {
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  sub: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize, paddingLeft: 30 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  action: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  actionLabel: { fontFamily: fonts.medium, fontSize: typeScale.body.fontSize },
});
