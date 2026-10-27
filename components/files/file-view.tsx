import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FileActions } from '@/components/files/file-actions';
import { FileFrame } from '@/components/files/file-frame';
import { PillButton } from '@/components/nocturne/pill-button';
import { Text } from '@/components/text';
import { fonts, radius, space, typeScale } from '@/constants/theme';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import {
  DOWNLOAD_LABEL,
  DOWNLOAD_TO_OPEN,
  FILE_GONE,
  FILE_NOT_OPENED,
  FILE_OPENING,
  TRY_AGAIN_LABEL,
} from '@/lib/content/screen-states';
import type { RunFile, RunFileLink } from '@/lib/platform/automations';
import { downloadSignedFile, type SavedFile } from '@/lib/platform/client';
import { PlatformError } from '@/lib/platform/problem';
import { saveSignedFile, shareSignedFile, signedLink } from '@/lib/platform/signed-file';
import { fileLine, viewName } from '@/lib/view/items';

type Shown =
  | { kind: 'opening' }
  | { kind: 'ready'; uri: string; file: RunFile }
  | { kind: 'notShown'; file: RunFile }
  | { kind: 'notOpened' }
  | { kind: 'gone' };

/**
 * A run's or an item's own file, on its page (Round 19, build 28; the owner's
 * items F4 and F7: "Shows the original document downloadable", "review the
 * original document that you can download and share like other documents"),
 * top to bottom as the website draws it: the file, then its name and its line
 * (`fileLine`: "PDF · 2 pages · 24 KB"), then Download and Share (`FileActions`,
 * Round 21; the owner's Q7); the page draws the rest.
 *
 * The file is drawn in place only when it is a PDF, a JPEG or a PNG by its
 * `contentType` (`viewName`), never by the name its uploader gave it (build
 * 28's review, finding 5): the platform's short-lived link (`read`:
 * `readItemFile` or `readRunFile`, in the workspace the page loaded) checked
 * (`signedLink`, https only), the file saved as "view.{pdf|jpg|png}" in a
 * folder made for this one view (`downloadSignedFile`'s `freshFolder`) and
 * drawn by a WebView with no JavaScript that may read that folder alone; the
 * folder is removed when the page closes. Any other type says "Download it to
 * open it." and is not saved. Download and Share take a fresh link each press:
 * Download saves the file (`saveSignedFile`: on iOS into the folder picked in
 * Files), Share hands the file to the share sheet (`shareSignedFile`, iOS
 * only), as the run package's do — "Could not download. Try again." or "Could
 * not share. Try again." when they cannot, refused once the workspace changed. Opening: "Opening the file…"; a link
 * refused or a file not saved: "Could not open the file. Try again." with Try
 * again; a file the store no longer keeps (404): "This file is no longer
 * kept.", no Try again and no Download.
 */
export function FileView({
  testID,
  workspaceId,
  read,
  height,
}: {
  testID: string;
  /** The workspace the page loaded. */
  workspaceId: string | null;
  read: (workspaceId: string) => Promise<RunFileLink>;
  /** A fixed height, on a page that scrolls past it; absent, it fills the page. */
  height?: number;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const [shown, setShown] = useState<Shown>({ kind: 'opening' });
  const cached = useRef<SavedFile | null>(null);
  const live = useRef(true);
  const reader = useRef(read);
  reader.current = read;

  const forget = () => {
    const file = cached.current;
    cached.current = null;
    try {
      if (file?.exists) file.delete();
    } catch {
      // The cache is the system's to clear; nothing a person can act on.
    }
  };

  const load = useCallback(async () => {
    if (!workspaceId) {
      setShown({ kind: 'notOpened' });
      return;
    }
    setShown({ kind: 'opening' });
    try {
      const link = await reader.current(workspaceId);
      const name = viewName(link.file.contentType);
      if (!name) {
        if (live.current) setShown({ kind: 'notShown', file: link.file });
        return;
      }
      const saved = await downloadSignedFile(signedLink(link.downloadUrl), name, { freshFolder: true });
      if (!live.current) {
        if (saved.exists) saved.delete();
        return;
      }
      forget();
      cached.current = saved;
      setShown({ kind: 'ready', uri: saved.uri, file: link.file });
    } catch (caught) {
      if (!live.current) return;
      setShown(caught instanceof PlatformError && caught.status === 404 ? { kind: 'gone' } : { kind: 'notOpened' });
    }
  }, [workspaceId]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
      forget();
    };
  }, [load]);

  /** A fresh link in the workspace the page loaded, handed to `use`; refused once the workspace changed. */
  const withLink = (use: (link: RunFileLink) => Promise<void>) => async (): Promise<string | null> => {
    const shownIn = workspaceIfShown(session, workspaceId);
    if (!shownIn) return WORKSPACE_CHANGED;
    await use(await reader.current(shownIn));
    return null;
  };
  const download = withLink((link) => saveSignedFile({ downloadUrl: link.downloadUrl, filename: link.file.filename }));
  const share = withLink((link) => shareSignedFile({ downloadUrl: link.downloadUrl, filename: link.file.filename }));

  const frame = height === undefined ? styles.fill : { height };
  const file = shown.kind === 'ready' || shown.kind === 'notShown' ? shown.file : null;
  const note =
    shown.kind === 'opening'
      ? FILE_OPENING
      : shown.kind === 'gone'
        ? FILE_GONE
        : shown.kind === 'notShown'
          ? DOWNLOAD_TO_OPEN
          : FILE_NOT_OPENED;
  return (
    <View testID={testID} style={[styles.wrap, height === undefined && styles.fill]}>
      {shown.kind === 'ready' ? (
        <FileFrame
          testID={`${testID}-webview`}
          uri={shown.uri}
          style={[frame, styles.web, { backgroundColor: palette.bg }]}
        />
      ) : (
        <View testID={`${testID}-${shown.kind}`} style={[frame, styles.state]}>
          <Text style={[styles.note, { color: palette.neutral[400] }]}>{note}</Text>
          {shown.kind === 'notOpened' ? (
            <PillButton
              testID={`${testID}-retry`}
              label={TRY_AGAIN_LABEL}
              variant="secondary"
              fontSize={typeScale.body.fontSize}
              onPress={() => void load()}
            />
          ) : null}
        </View>
      )}
      {file ? (
        <View testID={`${testID}-about`}>
          <Text testID={`${testID}-name`} selectable style={[styles.name, { color: palette.text }]}>
            {file.filename}
          </Text>
          <Text testID={`${testID}-line`} style={[styles.line, { color: palette.neutral[400] }]}>
            {fileLine(file)}
          </Text>
        </View>
      ) : null}
      {shown.kind === 'gone' ? null : (
        <FileActions
          testID={`${testID}-actions`}
          stacked
          downloads={[{ label: DOWNLOAD_LABEL, testID: `${testID}-download`, run: download }]}
          share={{ testID: `${testID}-share`, run: share }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.inner },
  fill: { flex: 1 },
  web: { borderRadius: radius.card, overflow: 'hidden' },
  state: { alignItems: 'center', justifyContent: 'center', gap: space.inner },
  note: { fontFamily: fonts.regular, ...typeScale.small, textAlign: 'center' },
  name: { fontFamily: fonts.medium, ...typeScale.label },
  line: { fontFamily: fonts.regular, ...typeScale.small },
});
