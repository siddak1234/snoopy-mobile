import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Camera, FileArrowUp, Paperclip, UploadSimple, X, type Icon } from 'phosphor-react-native';
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Dropdown } from '@/components/dropdown';
import { PILL_HEIGHT } from '@/components/nocturne/pill-button';
import { Pressable } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, iconSize, inset, space, status, typeScale, withAlpha } from '@/constants/theme';
import { useAccessibilityTextSize } from '@/hooks/use-accessibility-text-size';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { UPLOAD_REFUSALS, WORKSPACE_CHANGED, uploadRefusalMessage } from '@/lib/content/refusals';
import {
  CAMERA_NOT_OPENED,
  CAMERA_OFF,
  CHOOSE_FILE_LABEL,
  DEFAULT_MAX_FILES,
  TAKE_PHOTO_LABEL,
  UPLOAD_LABEL,
  acceptedLine,
  chooseAccepted,
  removeFileLabel,
  tooManyFiles,
} from '@/lib/content/screen-states';
import type { AutomationRunInputField } from '@/lib/platform/automations';
import { sendRunFile, type ChosenFile } from '@/lib/platform/run-file';
import { PHOTO_NAME, RUN_FILE_TYPES, isImage, jpegName, reencodeImage, takesPhotos } from '@/lib/platform/run-image';

type FileState =
  | { kind: 'empty' }
  | { kind: 'uploading'; name: string }
  | { kind: 'ready'; name: string; sizeBytes: number };

/** A file a field took: its name and size, as its ready line says them. */
export type HeldFile = { name: string; sizeBytes: number };

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
 * or a PNG (`RUN_FILE_TYPES`) where the field names no types (below). Every
 * image — a photo, or a JPEG or PNG uploaded — is re-encoded once
 * (`reencodeImage`: upright, its long side at most 2,576 px, a JPEG at 0.9) and
 * sent as `image/jpeg` under a `.jpg` name; a PDF is sent as it is.
 *
 * Giving a file uploads it at once (`sendRunFile`), and the field's value is
 * then only the file's id, which is all a run's input carries. An upload belongs
 * to the field that started it: its busy state is reported under the field's
 * key, it stops when the field goes (the form started a run, or was emptied to
 * choose again), and an answer for an upload no longer in flight changes nothing.
 *
 * **A field that names its types** (`acceptedContentTypes`, backend ADR-0046):
 * Upload offers those, and a file of another type is refused in their words
 * ("Choose a PDF or Word file.") before it is sent. A Word file is sent as it
 * is; Take photo, and the re-encode, only where a JPEG is taken (`takesPhotos`).
 * A field that names none is as above. A line under the title says the types
 * only where the page asks (`showTypes`): the item's file (`items.file`, drawn
 * by this field on the same upload) and the item page's run field — as the
 * website draws it — never Step 1 of a flow page, whose fields are titles only
 * (Build 21, A6), though the platform names the types of every file field of a
 * manifest with an `artifacts` block.
 *
 * **A file it already holds** (`held`, Round 21 stage 2, C3): drawn ready when
 * the field is drawn again — the upload card, a dialog, is taken off the screen
 * while the health data agreement is open, and comes back as it was. `onValue`
 * names the file it took, for that.
 *
 * **`compact`**, Home's quick-access card alone (the owner's build 42 item 16:
 * "Maybe we dont need the clip icon and document/resume in there"): no title
 * line (no Paperclip, no title), no row padding or divider; ~~Take photo,
 * Upload and `trailing` (the card's Start) on ONE row~~ until build 43, now
 * Upload and `trailing` alone on ONE row (`run-file-${key}-actions`) that
 * wraps, each pill growing to fill it, stacked at iOS's accessibility sizes;
 * the uploading, ~~ready~~ (until build 43, now the pills) and error lines
 * under it, unindented, only once they have words. The buttons' accessibility
 * labels still name the field ("Upload a file for Resume"). Without it the
 * field is as above, the flow page's. The owner's build 43 item 17 ("for the
 * compact card i want two buttons … upload start"): where the field takes a
 * photo, Upload opens a menu anchored to it — Take photo, then Choose file
 * (`UploadMenu`), the choice run once the menu is gone — else it opens the
 * picker at once.
 *
 * **`removable`**, the start forms' (build 43 item 17: "the document should
 * dynamically show up in a horizontal pill with the document name and an x on
 * the right side"): the file it holds is a pill (`FilePills`), its name and an
 * x that takes it out of the run (`onValue` with no file), in place of the
 * "Ready: {name} ({size})" line; nothing is deleted on the server. Without it
 * (the job upload card, `ItemUploadDialog`) the ready line stays, no x.
 */
export function RunFileField({
  field,
  shownWorkspaceId,
  subscriptionId,
  onValue,
  onBusyChange,
  divider,
  showTypes = false,
  held,
  compact = false,
  trailing,
  removable = false,
}: {
  field: Pick<AutomationRunInputField, 'key' | 'title' | 'acceptedContentTypes'>;
  /** The workspace the screen loaded; the upload is refused once it is not active. */
  shownWorkspaceId: string | null;
  subscriptionId: string;
  onValue: (key: string, artifactId: string | undefined, file?: HeldFile) => void;
  onBusyChange: (key: string, busy: boolean) => void;
  divider: boolean;
  /** Say the types under the title (the item's file, the item page's run field). */
  showTypes?: boolean;
  /** The file the field took before it was drawn again: shown ready, as it was. */
  held?: HeldFile;
  /** Home's card: no title line, Upload and `trailing` on one wrapping row (build 42 item 16; build 43 item 17). */
  compact?: boolean;
  /** Drawn at the end of the buttons' row, `compact` only: the card's Start. */
  trailing?: ReactNode;
  /** The start forms': the file a pill with an x, in place of the ready line (build 43 item 17). */
  removable?: boolean;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const [state, setState] = useState<FileState>(() => (held ? { kind: 'ready', ...held } : { kind: 'empty' }));
  const [error, setError] = useState<string | null>(null);
  const accepted = field.acceptedContentTypes;
  const photos = takesPhotos(accepted);
  const typesLine = acceptedLine(accepted);
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
      picked = await DocumentPicker.getDocumentAsync({ type: accepted ?? RUN_FILE_TYPES, copyToCacheDirectory: true, multiple: false });
    } catch {
      setError('The file could not be opened. Try again.');
      return;
    }
    // Closing the picker keeps whatever the field already held.
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    // A picker that let another type through: refused in words, nothing sent.
    if (accepted && asset.mimeType && !accepted.includes(asset.mimeType)) {
      setError(typesLine ? chooseAccepted(typesLine) : UPLOAD_REFUSALS.content_type_not_accepted!);
      return;
    }
    await send(
      workspaceId,
      photos && isImage(asset)
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
      onValue(field.key, uploaded.artifactId, { name: uploaded.filename, sizeBytes: uploaded.sizeBytes });
    } catch (failure) {
      if (sending.signal.aborted) return;
      setState({ kind: 'empty' });
      setError(uploadRefusalMessage(failure, 'The file could not be sent.'));
    } finally {
      if (inFlight.current === sending) {
        inFlight.current = null;
        onBusyChange(field.key, false);
      }
    }
  };

  /** The x: the file out of the run; the stored copy stays until retention. */
  const remove = () => {
    setState({ kind: 'empty' });
    onValue(field.key, undefined);
  };

  const busy = state.kind === 'uploading';
  const progress =
    state.kind === 'uploading'
      ? `Uploading ${state.name}…`
      : state.kind === 'ready' && !removable
        ? `Ready: ${state.name} (${formatSize(state.sizeBytes)})`
        : null;

  // Title line, then the two ways to give the file at full width — the setting
  // rows' order, so both read alike in one card (`compact`: the row alone, then its lines).
  const sub = compact ? styles.subFlush : styles.sub;
  return (
    <FieldFrame
      fieldKey={field.key}
      title={field.title}
      divider={divider}
      compact={compact}
      trailing={trailing}
      lines={
        <>
          {progress ? (
            <Text testID={`run-file-${field.key}-line`} style={[sub, { color: palette.neutral[400] }]}>
              {progress}
            </Text>
          ) : null}
          {removable && state.kind === 'ready' ? <FilePills fieldKey={field.key} names={[state.name]} onRemove={remove} /> : null}
          {error ? <Text style={[sub, { color: status.err }]}>{error}</Text> : null}
          {showTypes && typesLine ? (
            <Text testID={`run-file-${field.key}-types`} style={[sub, { color: palette.neutral[400] }]}>
              {typesLine}
            </Text>
          ) : null}
        </>
      }>
      <FileActions
        fieldKey={field.key}
        photoLabel={`Take a photo for ${field.title}`}
        uploadLabel={`Upload a file for ${field.title}`}
        photos={photos}
        busy={busy}
        compact={compact}
        onTakePhoto={() => void takePhoto()}
        onUpload={() => void upload()}
      />
    </FieldFrame>
  );
}

/**
 * A run's file field that takes several (Round 21 platform round 2, B2: the
 * manifest's `multiple`), the website's several-file `RunFileField` in the
 * same steps: Upload's picker lets several be chosen at once and **replaces**
 * what the field held; each Take photo **adds** one more. Every file is sent
 * as `RunFileField` sends one (`sendRunFile`, an image re-encoded), one after
 * another, the line under the title saying "Uploading {name}…"; the field's
 * value is then their ids in the order given, and Start run uploads every one
 * into ONE run (the batch addendum, which supersedes B2's run per file).
 * Every file held is a pill (`FilePills`, build 43 item 17), in the order
 * given, in one row that scrolls sideways; its x takes that file out, the rest
 * kept in their order, none left the field empty. ~~"Ready: {name} ({size})"
 * for one file and "{n} files selected" for more~~ until build 43. More than the field's `maxFiles` — absent, the platform's 50
 * (`DEFAULT_MAX_FILES`) — is refused before anything is sent, "Add up to {max}
 * files at a time.": a choice past it empties the field, a photo past it keeps
 * the files held. A file of a type the field does
 * not take, or one that fails, empties the field and says why, as one alone
 * does. A field without `multiple` is `RunFileField`, unchanged.
 *
 * `compact` and `trailing`: as `RunFileField`'s (Home's card, build 42 item 16;
 * Upload and Start since build 43).
 *
 * testIDs: as `RunFileField`'s. ~~Its line `run-file-${key}-count`~~ until build 43.
 */
export function RunFilesField({
  field,
  shownWorkspaceId,
  subscriptionId,
  onValue,
  onBusyChange,
  divider,
  showTypes = false,
  compact = false,
  trailing,
}: {
  field: Pick<AutomationRunInputField, 'key' | 'title' | 'acceptedContentTypes' | 'maxFiles'>;
  shownWorkspaceId: string | null;
  subscriptionId: string;
  onValue: (key: string, artifactIds: string[] | undefined) => void;
  onBusyChange: (key: string, busy: boolean) => void;
  divider: boolean;
  showTypes?: boolean;
  compact?: boolean;
  trailing?: ReactNode;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const [files, setFiles] = useState<readonly SentFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accepted = field.acceptedContentTypes;
  const photos = takesPhotos(accepted);
  const typesLine = acceptedLine(accepted);
  const maxFiles = field.maxFiles ?? DEFAULT_MAX_FILES;
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

  const workspaceFor = (): string | null => {
    setError(null);
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) setError(WORKSPACE_CHANGED);
    return workspaceId;
  };

  /** Nothing held, and why. */
  const empty = (message: string) => {
    setFiles([]);
    onValue(field.key, undefined);
    setError(message);
  };

  /** Sends what was given after the files kept, one after another; any failure empties the field. */
  const sendAll = async (workspaceId: string, kept: readonly SentFile[], given: Picked[]) => {
    inFlight.current?.abort();
    const sending = new AbortController();
    inFlight.current = sending;
    onValue(field.key, undefined);
    onBusyChange(field.key, true);
    const sent: SentFile[] = [...kept];
    try {
      for (const picked of given) {
        setUploading(picked.name);
        const chosen = await prepare(picked);
        if (sending.signal.aborted) return;
        const uploaded = await sendRunFile(workspaceId, subscriptionId, chosen, sending.signal);
        if (sending.signal.aborted) return;
        sent.push({ artifactId: uploaded.artifactId, name: uploaded.filename, sizeBytes: uploaded.sizeBytes });
      }
      setFiles(sent);
      onValue(field.key, sent.map((file) => file.artifactId));
    } catch (failure) {
      if (sending.signal.aborted) return;
      empty(uploadRefusalMessage(failure, 'The file could not be sent.'));
    } finally {
      if (!sending.signal.aborted) setUploading(null);
      if (inFlight.current === sending) {
        inFlight.current = null;
        onBusyChange(field.key, false);
      }
    }
  };

  const takePhoto = async () => {
    const workspaceId = workspaceFor();
    if (!workspaceId) return;
    // A photo past the most the field takes: said, and the files held kept.
    if (files.length + 1 > maxFiles) {
      setError(tooManyFiles(maxFiles));
      return;
    }
    let taken: ImagePicker.ImagePickerResult;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(CAMERA_OFF);
        return;
      }
      taken = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    } catch {
      setError(CAMERA_NOT_OPENED);
      return;
    }
    // Closing the camera keeps whatever the field already held.
    const photo = taken.canceled ? undefined : taken.assets[0];
    if (!photo) return;
    await sendAll(workspaceId, files, [{ uri: photo.uri, name: PHOTO_NAME, image: true }]);
  };

  const upload = async () => {
    const workspaceId = workspaceFor();
    if (!workspaceId) return;
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: accepted ?? RUN_FILE_TYPES, copyToCacheDirectory: true, multiple: true });
    } catch {
      setError('The file could not be opened. Try again.');
      return;
    }
    // Closing the picker keeps whatever the field already held.
    const assets = picked.canceled ? [] : picked.assets;
    if (assets.length === 0) return;
    // A choice replaces what the field held: past the most the field takes, or a file of another type, empties it, nothing sent.
    if (assets.length > maxFiles) {
      empty(tooManyFiles(maxFiles));
      return;
    }
    if (assets.some((asset) => accepted && asset.mimeType && !accepted.includes(asset.mimeType))) {
      empty(typesLine ? chooseAccepted(typesLine) : UPLOAD_REFUSALS.content_type_not_accepted!);
      return;
    }
    await sendAll(
      workspaceId,
      [],
      assets.map((asset) =>
        photos && isImage(asset)
          ? { uri: asset.uri, name: jpegName(asset.name), image: true }
          : { uri: asset.uri, name: asset.name, image: false, ...(asset.mimeType ? { mimeType: asset.mimeType } : {}) },
      ),
    );
  };

  /** The x on the file at `index`: the rest kept in their order, none left the field empty. */
  const remove = (index: number) => {
    const rest = files.filter((_, at) => at !== index);
    setFiles(rest);
    onValue(field.key, rest.length > 0 ? rest.map((file) => file.artifactId) : undefined);
  };

  const busy = uploading !== null;

  const sub = compact ? styles.subFlush : styles.sub;
  return (
    <FieldFrame
      fieldKey={field.key}
      title={field.title}
      divider={divider}
      compact={compact}
      trailing={trailing}
      lines={
        <>
          {uploading !== null ? (
            <Text testID={`run-file-${field.key}-line`} style={[sub, { color: palette.neutral[400] }]}>
              {`Uploading ${uploading}…`}
            </Text>
          ) : files.length > 0 ? (
            <FilePills fieldKey={field.key} names={files.map((file) => file.name)} onRemove={remove} />
          ) : null}
          {error ? <Text style={[sub, { color: status.err }]}>{error}</Text> : null}
          {showTypes && typesLine ? (
            <Text testID={`run-file-${field.key}-types`} style={[sub, { color: palette.neutral[400] }]}>
              {typesLine}
            </Text>
          ) : null}
        </>
      }>
      <FileActions
        fieldKey={field.key}
        photoLabel={`Take a photo for ${field.title}`}
        uploadLabel={`Upload files for ${field.title}`}
        photos={photos}
        busy={busy}
        compact={compact}
        onTakePhoto={() => void takePhoto()}
        onUpload={() => void upload()}
      />
    </FieldFrame>
  );
}

/** A file sent, as the several-file field holds it. */
type SentFile = { artifactId: string; name: string; sizeBytes: number };

/**
 * A file field's frame. Today's: the title line (Paperclip and title), the
 * lines, then the buttons at full width, in a padded row with its divider.
 * `compact` (Home's card): the buttons and `trailing` on one wrapping row —
 * stacked at iOS's accessibility sizes — then the lines; no title, no padding.
 * Since build 43 item 17 that row is Upload and `trailing` (Start); the lines
 * are the "Uploading {name}…" line, the pills, then the field's error.
 */
function FieldFrame({
  fieldKey,
  title,
  divider,
  compact,
  trailing,
  lines,
  children,
}: {
  fieldKey: string;
  title: string;
  divider: boolean;
  compact: boolean;
  trailing?: ReactNode;
  lines: ReactNode;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  const large = useAccessibilityTextSize();
  if (compact) {
    return (
      <View style={styles.compactRow}>
        <View testID={`run-file-${fieldKey}-actions`} style={[styles.actions, styles.actionsWrap, large && styles.actionsStacked]}>
          {children}
          {trailing}
        </View>
        {lines}
      </View>
    );
  }
  return (
    <View style={[styles.row, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
      <View style={styles.titleLine}>
        <Paperclip size={iconSize.row} color={palette.accentRamp[300]} />
        {/* The manifest's title alone: no "(optional)" (spec §3.D) and no line under it (Build 21, A6: titles only). */}
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      </View>
      {lines}
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

/**
 * The field's buttons. Today's (the flow page, the item page, the job upload
 * card): Take photo, where the field takes one, beside Upload. `compact`
 * (Home's card, build 43 item 17): Upload alone — a menu (`UploadMenu`) where
 * the field takes a photo, else the picker at once.
 */
function FileActions({
  fieldKey,
  photoLabel,
  uploadLabel,
  photos,
  busy,
  compact,
  onTakePhoto,
  onUpload,
}: {
  fieldKey: string;
  photoLabel: string;
  uploadLabel: string;
  photos: boolean;
  busy: boolean;
  compact: boolean;
  onTakePhoto: () => void;
  onUpload: () => void;
}) {
  if (compact && photos) {
    return <UploadMenu fieldKey={fieldKey} accessibilityLabel={uploadLabel} busy={busy} onTakePhoto={onTakePhoto} onChooseFile={onUpload} />;
  }
  return (
    <>
      {photos ? (
        <FileAction
          testID={`run-file-${fieldKey}-photo`}
          label={TAKE_PHOTO_LABEL}
          accessibilityLabel={photoLabel}
          icon={Camera}
          busy={busy}
          compact={compact}
          onPress={onTakePhoto}
        />
      ) : null}
      <FileAction
        testID={`run-file-${fieldKey}-upload`}
        label={UPLOAD_LABEL}
        accessibilityLabel={uploadLabel}
        icon={UploadSimple}
        busy={busy}
        compact={compact}
        onPress={onUpload}
      />
    </>
  );
}

type UploadChoice = 'photo' | 'file';

/**
 * Home's Upload where the field takes a photo (build 43 item 17): a menu
 * anchored to it, Take photo (`Camera`) then Choose file (`FileArrowUp`). The
 * field holds it open itself, so the press is here; a choice closes it and runs
 * once the panel is gone (`onClosed`: the camera or the picker cannot open over
 * it); a press outside closes it with nothing done.
 *
 * testIDs: Upload `run-file-${key}-upload`, its menu `run-file-${key}-upload-menu`,
 * Take photo `run-file-${key}-photo`, Choose file `run-file-${key}-file`.
 */
function UploadMenu({
  fieldKey,
  accessibilityLabel,
  busy,
  onTakePhoto,
  onChooseFile,
}: {
  fieldKey: string;
  accessibilityLabel: string;
  busy: boolean;
  onTakePhoto: () => void;
  onChooseFile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = useRef<UploadChoice | null>(null);
  return (
    // Grows in the card's row as the other buttons do; the trigger fills it.
    <View style={styles.actionGrow}>
      <Dropdown<UploadChoice>
        testID={`run-file-${fieldKey}-upload`}
        value={null}
        options={[
          { value: 'photo', label: TAKE_PHOTO_LABEL, icon: Camera, testID: `run-file-${fieldKey}-photo` },
          { value: 'file', label: CHOOSE_FILE_LABEL, icon: FileArrowUp, testID: `run-file-${fieldKey}-file` },
        ]}
        open={open}
        onOpenChange={setOpen}
        onChange={(choice) => {
          chosen.current = choice;
          setOpen(false);
        }}
        onClosed={() => {
          const choice = chosen.current;
          chosen.current = null;
          if (choice === 'photo') onTakePhoto();
          else if (choice === 'file') onChooseFile();
        }}
        trigger={
          <FileAction
            testID={`run-file-${fieldKey}-upload`}
            label={UPLOAD_LABEL}
            accessibilityLabel={accessibilityLabel}
            icon={UploadSimple}
            busy={busy}
            compact
            onPress={() => setOpen(true)}
          />
        }
      />
    </View>
  );
}

/**
 * The files a start form's field holds (build 43 item 17): one pill each, in
 * the order given, in ONE row that scrolls sideways (never wraps). A pill is
 * the file's name — one line, cut at its end, the pill never wider than the
 * row — and on its right an x (`X`, a 44 target) that takes that file out,
 * said "Remove {name}".
 *
 * testIDs: the row `run-file-${key}-pills`, a pill `run-file-${key}-pill-${n}`,
 * its x `run-file-${key}-remove-${n}`.
 */
function FilePills({ fieldKey, names, onRemove }: { fieldKey: string; names: readonly string[]; onRemove: (index: number) => void }) {
  const { palette } = useTheme();
  // The row's own width, once laid out: no pill is wider (a long name is cut instead).
  const [width, setWidth] = useState<number | undefined>(undefined);
  return (
    <ScrollView
      testID={`run-file-${fieldKey}-pills`}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      contentContainerStyle={styles.pills}>
      {names.map((name, index) => (
        <View
          key={`${index}:${name}`}
          testID={`run-file-${fieldKey}-pill-${index}`}
          style={[styles.pill, { borderColor: palette.neutral[700] }, width !== undefined && { maxWidth: width }]}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.pillName, { color: palette.text }]}>
            {name}
          </Text>
          <Pressable
            testID={`run-file-${fieldKey}-remove-${index}`}
            accessibilityRole="button"
            accessibilityLabel={removeFileLabel(name)}
            onPress={() => onRemove(index)}
            style={({ pressed }) => [styles.pillX, pressed && { backgroundColor: withAlpha(palette.text, 0.07) }]}>
            <X size={20} color={palette.text} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

/** One way to give the field its file: an outlined pill, held while an upload is in flight. */
function FileAction({
  testID,
  label,
  accessibilityLabel,
  icon: IconCmp,
  busy,
  compact,
  onPress,
}: {
  testID: string;
  label: string;
  accessibilityLabel: string;
  icon: Icon;
  busy: boolean;
  /** Home's card: grows to fill its wrapping row rather than sharing it (`flex: 1` clips). */
  compact: boolean;
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
        compact ? styles.actionGrow : styles.actionShare,
        { borderColor: busy ? palette.neutral[700] : palette.accent },
        pressed && !busy && { backgroundColor: withAlpha(palette.accent, 0.12) },
      ]}>
      <IconCmp size={iconSize.button} color={color} />
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
    gap: space.inner,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: space.inner },
  title: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  sub: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize, paddingLeft: iconSize.row + space.inner },
  actions: { flexDirection: 'row', gap: space.inner },
  // Home's card (build 42 item 16): its row alone, the lines under it unindented.
  compactRow: { gap: space.inner },
  subFlush: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  actionsWrap: { flexWrap: 'wrap' },
  actionsStacked: { flexDirection: 'column' },
  // Today's pills share the row; Home's grow to fill a wrapped one instead, so a label never clips.
  actionShare: { flex: 1 },
  actionGrow: { flexGrow: 1 },
  action: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: inset.sm,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.rowX,
  },
  actionLabel: { fontFamily: fonts.medium, fontSize: typeScale.body.fontSize },
  // The file pills (build 43 item 17).
  pills: { flexDirection: 'row', gap: space.inner },
  pill: {
    minHeight: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: space.rowX,
  },
  pillName: { flexShrink: 1, fontFamily: fonts.regular, ...typeScale.small },
  pillX: { width: PILL_HEIGHT, height: PILL_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
});
