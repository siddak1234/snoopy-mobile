import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Paperclip } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, status } from '@/constants/theme';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { UPLOAD_REFUSALS, WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import type { AutomationRunInputField } from '@/lib/platform/automations';
import { sendRunFile } from '@/lib/platform/run-file';

type FileState =
  | { kind: 'empty' }
  | { kind: 'uploading'; name: string }
  | { kind: 'ready'; name: string; sizeBytes: number };

/**
 * A run's file field (backend FR-14, ADR-0030's `artifact` control) — the
 * website's `RunFileField`, on the same operations.
 *
 * Choosing a file uploads it at once (`sendRunFile`), and the field's value is
 * then only the file's id, which is all a run's input carries. An upload belongs
 * to the field that started it: its busy state is reported under the field's
 * key, it stops when the field goes (the form closed, or was emptied to choose
 * again), and an answer for an upload no longer in flight changes nothing.
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

  const choose = async () => {
    setError(null);
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    } catch {
      setError('The file could not be opened. Try again.');
      return;
    }
    // Closing the picker keeps whatever the field already held.
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;

    inFlight.current?.abort();
    const upload = new AbortController();
    inFlight.current = upload;
    setState({ kind: 'uploading', name: asset.name });
    onValue(field.key, undefined);
    onBusyChange(field.key, true);
    try {
      const file = new File(asset.uri);
      const uploaded = await sendRunFile(
        workspaceId,
        subscriptionId,
        {
          name: asset.name,
          ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
          sizeBytes: file.size,
          read: () => file.bytes(),
        },
        upload.signal,
      );
      if (upload.signal.aborted) return;
      setState({ kind: 'ready', name: uploaded.filename, sizeBytes: uploaded.sizeBytes });
      onValue(field.key, uploaded.artifactId);
    } catch (failure) {
      if (upload.signal.aborted) return;
      setState({ kind: 'empty' });
      setError(refusalMessage(failure, UPLOAD_REFUSALS, 'The file could not be sent.'));
    } finally {
      if (inFlight.current === upload) {
        inFlight.current = null;
        onBusyChange(field.key, false);
      }
    }
  };

  const progress =
    state.kind === 'uploading'
      ? `Uploading ${state.name}…`
      : state.kind === 'ready'
        ? `Ready: ${state.name} (${formatSize(state.sizeBytes)})`
        : null;

  return (
    <View style={[styles.row, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
      <Paperclip size={20} color={palette.accentRamp[300]} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: palette.text }]}>
          {field.title}
          {field.required ? null : <Text style={{ color: palette.neutral[400] }}> (optional)</Text>}
        </Text>
        <Text style={[styles.sub, { color: palette.neutral[400] }]}>{field.description}</Text>
        {progress ? <Text style={[styles.sub, { color: palette.neutral[400] }]}>{progress}</Text> : null}
        {error ? <Text style={[styles.sub, { color: status.err }]}>{error}</Text> : null}
      </View>
      <Pressable
        testID={`run-file-${field.key}`}
        accessibilityRole="button"
        accessibilityLabel={`Choose a file for ${field.title}`}
        disabled={state.kind === 'uploading'}
        onPress={() => void choose()}>
        <Text style={[styles.choose, { color: state.kind === 'uploading' ? palette.neutral[500] : palette.accentRamp[300] }]}>
          {state.kind === 'ready' ? 'Replace' : 'Choose file'}
        </Text>
      </Pressable>
    </View>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.medium, fontSize: 14 },
  sub: { fontFamily: fonts.regular, fontSize: 12 },
  choose: { fontFamily: fonts.medium, fontSize: 13 },
});
