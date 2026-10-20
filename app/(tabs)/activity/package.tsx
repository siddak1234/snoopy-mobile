import { useLocalSearchParams, useRouter } from 'expo-router';
import { DownloadSimple } from 'phosphor-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { ScreenError, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { em, fonts, iconSize, layout, status, typeScale } from '@/constants/theme';
import { deviceTimeZone, useRunPackageDownload } from '@/hooks/use-run-package';
import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import {
  DOWNLOAD_EXCEL_LABEL,
  DOWNLOAD_PDF_LABEL,
  PACKAGE_NOT_OPENED,
  PACKAGE_PREPARING,
  RUN_PACKAGE_TITLE,
  SESSION_KEPT,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { refusalMessage } from '@/lib/content/refusals';
import { downloadSignedFile, newIdempotencyKey, type SavedFile } from '@/lib/platform/client';
import { packageNotOpened, requestRunPackageFile } from '@/lib/platform/runs';
import { signedLink } from '@/lib/platform/signed-file';

type Shown =
  | { kind: 'preparing' }
  | { kind: 'ready'; uri: string }
  | { kind: 'notOpened' }
  | { kind: 'error'; body: string }
  | { kind: 'unavailable' };

/**
 * The run package, viewed (round 24 P12; the owner's build 23 F16: "They can
 * also view it from this page. The view button should take them to a page
 * showing the package"; the main session's correction: the PDF itself, ~~a
 * page of the package's sections~~). In Activity's stack, `?runId=`.
 *
 * The platform builds the job's PDF (`requestRunPackageFile`, the phone's zone;
 * a 503 is asked once more after its wait, the website's rule); a file that is
 * not a PDF or is over 25 MiB is refused before anything is saved; the signed
 * link (https only, `signedLink`) is saved into the app's cache
 * (`downloadSignedFile`, the one native download, under a name of its own so a
 * share from the header never removes it) and drawn in a WebView from that
 * file. The header holds Back, Download PDF and Download Excel — the run page's
 * download path (`useRunPackageDownload`). States: preparing; not opened —
 * still busy, or the file refused — "Could not open the package. Try again.",
 * the website's words for both, with Retry; error (the refusal's words). The
 * cached file is deleted when the page closes.
 */
export default function RunPackageScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { runId } = useLocalSearchParams<{ runId?: string }>();
  const session = useSession();
  // The package belongs to the workspace it was opened in, as its run does.
  const [openedIn] = useState(() => activeWorkspaceId(session));
  const files = useRunPackageDownload(openedIn, runId);
  const [shown, setShown] = useState<Shown>({ kind: 'preparing' });
  const cached = useRef<SavedFile | null>(null);
  const live = useRef(true);

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
    if (!runId || !openedIn) {
      setShown({ kind: 'unavailable' });
      return;
    }
    setShown({ kind: 'preparing' });
    try {
      const file = await requestRunPackageFile(openedIn, runId, 'pdf', newIdempotencyKey('run-package-pdf'), deviceTimeZone());
      const saved = await downloadSignedFile(signedLink(file.downloadUrl), `view-${file.filename}`);
      if (!live.current) {
        if (saved.exists) saved.delete();
        return;
      }
      forget();
      cached.current = saved;
      setShown({ kind: 'ready', uri: saved.uri });
    } catch (error) {
      if (!live.current) return;
      setShown(packageNotOpened(error) ? { kind: 'notOpened' } : { kind: 'error', body: refusalMessage(error) });
    }
  }, [openedIn, runId]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
      forget();
    };
  }, [load]);

  if (shown.kind === 'unavailable') {
    return <ScreenUnavailable title={errorTitleFor('package')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (shown.kind === 'notOpened') {
    return (
      <ScreenError title={PACKAGE_NOT_OPENED} body={SESSION_KEPT} onRetry={() => void load()} onBack={() => router.back()} topInset={insets.top} />
    );
  }
  if (shown.kind === 'error') {
    return (
      <ScreenError title={errorTitleFor('package')} body={shown.body} onRetry={() => void load()} onBack={() => router.back()} topInset={insets.top} />
    );
  }

  return (
    <View
      testID="package-screen"
      style={[styles.screen, { backgroundColor: palette.bg, paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
          {RUN_PACKAGE_TITLE}
        </Text>
      </View>
      <View style={styles.downloads}>
        <PillButton
          testID="package-download-pdf"
          label={DOWNLOAD_PDF_LABEL}
          variant="secondary"
          height={44}
          fontSize={typeScale.label.fontSize}
          icon={DownloadSimple}
          iconSize={iconSize.button}
          disabled={files.busy !== null}
          style={styles.download}
          onPress={() => files.download('pdf')}
        />
        <PillButton
          testID="package-download-excel"
          label={DOWNLOAD_EXCEL_LABEL}
          variant="secondary"
          height={44}
          fontSize={typeScale.label.fontSize}
          icon={DownloadSimple}
          iconSize={iconSize.button}
          disabled={files.busy !== null}
          style={styles.download}
          onPress={() => files.download('xlsx')}
        />
      </View>
      {files.error ? (
        <Text accessibilityRole="alert" style={[styles.note, { color: status.err }]}>
          {files.error}
        </Text>
      ) : null}
      {shown.kind === 'ready' ? (
        <WebView
          testID="package-webview"
          source={{ uri: shown.uri }}
          originWhitelist={['file://*']}
          allowFileAccess
          // iOS reads the file from its own folder, the app's cache, and nothing else.
          allowingReadAccessToURL={shown.uri.slice(0, shown.uri.lastIndexOf('/') + 1)}
          style={[styles.pdf, { backgroundColor: palette.bg }]}
        />
      ) : (
        <View testID="package-preparing" style={styles.preparing}>
          <Text style={[styles.note, { color: palette.neutral[400] }]}>{PACKAGE_PREPARING}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.screenX,
  },
  title: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  downloads: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: layout.screenX,
    paddingTop: 14,
    paddingBottom: 12,
  },
  download: { flex: 1 },
  note: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 8,
    fontFamily: fonts.regular,
    ...typeScale.small,
  },
  pdf: { flex: 1 },
  preparing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
