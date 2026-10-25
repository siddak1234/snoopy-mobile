import { DownloadSimple } from 'phosphor-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { PillButton } from '@/components/nocturne/pill-button';
import { Text } from '@/components/text';
import { fonts, iconSize, status, typeScale } from '@/constants/theme';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import {
  DOWNLOAD_FAILED,
  DOWNLOAD_LABEL,
  FILE_GONE,
  FILE_NOT_OPENED,
  FILE_OPENING,
  TRY_AGAIN_LABEL,
} from '@/lib/content/screen-states';
import type { RunFileLink } from '@/lib/platform/automations';
import { downloadSignedFile, type SavedFile } from '@/lib/platform/client';
import { PlatformError } from '@/lib/platform/problem';
import { shareSignedFile, signedLink } from '@/lib/platform/signed-file';

type Shown = { kind: 'opening' } | { kind: 'ready'; uri: string } | { kind: 'notOpened' } | { kind: 'gone' };

/**
 * A run's or an item's own file, drawn in place (Round 19, build 28; the
 * owner's items F4 and F7: "Shows the original document downloadable", "review
 * the original document that you can download and share like other
 * documents"), as the run package's page draws its PDF: the platform's
 * short-lived link (`read`: `readItemFile` or `readRunFile`, in the workspace
 * the page loaded) checked (`signedLink`, https only), the file saved into the
 * app's cache under a name of its own (`downloadSignedFile`) and drawn in a
 * WebView from there, the cached copy deleted when the page closes. Over it,
 * Download — a fresh link each press, handed to the share sheet to save or
 * share (`shareSignedFile`, as the package's Download PDF), "Could not
 * download. Try again." when it cannot, refused once the workspace changed.
 * Opening: "Opening the file…"; a link refused or a file not saved: "Could not
 * open the file. Try again." with Try again; a file the store no longer keeps
 * (404): "This file is no longer kept.", no Try again.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const saved = await downloadSignedFile(signedLink(link.downloadUrl), `view-${link.file.filename}`);
      if (!live.current) {
        if (saved.exists) saved.delete();
        return;
      }
      forget();
      cached.current = saved;
      setShown({ kind: 'ready', uri: saved.uri });
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

  const download = async () => {
    if (busy) return;
    const shownIn = workspaceIfShown(session, workspaceId);
    if (!shownIn) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const link = await reader.current(shownIn);
      await shareSignedFile({ downloadUrl: link.downloadUrl, filename: link.file.filename });
    } catch {
      setError(DOWNLOAD_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const frame = height === undefined ? styles.fill : { height };
  return (
    <View testID={testID} style={[styles.wrap, height === undefined && styles.fill]}>
      {shown.kind === 'gone' ? null : (
        <PillButton
          testID={`${testID}-download`}
          label={DOWNLOAD_LABEL}
          variant="secondary"
          height={44}
          fontSize={typeScale.label.fontSize}
          icon={DownloadSimple}
          iconSize={iconSize.button}
          disabled={busy}
          onPress={download}
        />
      )}
      {error ? (
        <Text accessibilityRole="alert" style={[styles.note, { color: status.err }]}>
          {error}
        </Text>
      ) : null}
      {shown.kind === 'ready' ? (
        <WebView
          testID={`${testID}-webview`}
          source={{ uri: shown.uri }}
          originWhitelist={['file://*']}
          allowFileAccess
          // iOS reads the file from its own folder, the app's cache, and nothing else.
          allowingReadAccessToURL={shown.uri.slice(0, shown.uri.lastIndexOf('/') + 1)}
          style={[frame, styles.web, { backgroundColor: palette.bg }]}
        />
      ) : (
        <View testID={`${testID}-${shown.kind}`} style={[frame, styles.state]}>
          <Text style={[styles.note, { color: palette.neutral[400] }]}>
            {shown.kind === 'opening' ? FILE_OPENING : shown.kind === 'gone' ? FILE_GONE : FILE_NOT_OPENED}
          </Text>
          {shown.kind === 'notOpened' ? (
            <PillButton
              testID={`${testID}-retry`}
              label={TRY_AGAIN_LABEL}
              variant="secondary"
              height={40}
              fontSize={typeScale.body.fontSize}
              onPress={() => void load()}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  fill: { flex: 1 },
  web: { borderRadius: 14, overflow: 'hidden' },
  state: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  note: { fontFamily: fonts.regular, ...typeScale.small, textAlign: 'center' },
});
