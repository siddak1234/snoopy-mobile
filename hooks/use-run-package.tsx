import { useCallback, useRef, useState } from 'react';
import { Linking, Platform, Share } from 'react-native';

import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import { DOWNLOAD_FAILED } from '@/lib/content/screen-states';
import { downloadSignedFile, newIdempotencyKey } from '@/lib/platform/client';
import { requestRunPackageFile, type RunPackageFile, type RunPackageFormat } from '@/lib/platform/runs';

/** The zone the package prints its times in: the phone's, or none (the platform then prints UTC). */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** A signed link the app may open: https only. */
export function usableLink(file: RunPackageFile): RunPackageFile {
  if (new URL(file.downloadUrl).protocol !== 'https:') throw new Error('The package answered an unusable address.');
  return file;
}

/**
 * The one way the run package's files are downloaded (round 24 P12; the owner's
 * build 23 F16: "I want to download excel … and a pdf"), for the two screens
 * that offer it — the run page and the package page: the platform builds the
 * file (`requestRunPackageFile`, a key per press, the phone's zone, one more ask
 * after a busy answer's wait), then, as Settings › Data's export does, iOS
 * saves the signed link into the app's cache (`downloadSignedFile`, the one
 * native download), hands it to the share sheet and removes it; Android opens
 * the link. Bound to the workspace the screen read; any failure is "Could not
 * download. Try again.".
 */
export function useRunPackageDownload(shownWorkspaceId: string | null | undefined, runId: string | undefined) {
  const session = useSession();
  const [busy, setBusy] = useState<RunPackageFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const working = useRef(false);

  const download = useCallback(
    async (format: RunPackageFormat) => {
      if (working.current || !runId) return;
      const workspaceId = workspaceIfShown(session, shownWorkspaceId ?? null);
      if (!workspaceId) {
        setError(WORKSPACE_CHANGED);
        return;
      }
      working.current = true;
      setBusy(format);
      setError(null);
      try {
        const file = usableLink(
          await requestRunPackageFile(workspaceId, runId, format, newIdempotencyKey(`run-package-${format}`), deviceTimeZone()),
        );
        if (Platform.OS !== 'ios') {
          await Linking.openURL(file.downloadUrl);
          return;
        }
        const saved = await downloadSignedFile(file.downloadUrl, file.filename);
        try {
          await Share.share({ url: saved.uri });
        } finally {
          if (saved.exists) saved.delete();
        }
      } catch {
        setError(DOWNLOAD_FAILED);
      } finally {
        working.current = false;
        setBusy(null);
      }
    },
    [runId, session, shownWorkspaceId],
  );

  return { busy, error, download };
}
