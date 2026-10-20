import { useCallback, useRef, useState } from 'react';

import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import { DOWNLOAD_FAILED } from '@/lib/content/screen-states';
import { newIdempotencyKey } from '@/lib/platform/client';
import { requestRunPackageFile, type RunPackageFormat } from '@/lib/platform/runs';
import { shareSignedFile } from '@/lib/platform/signed-file';

/** The zone the package prints its times in: the phone's, or none (the platform then prints UTC). */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The one way the run package's files are downloaded (round 24 P12; the owner's
 * build 23 F16: "I want to download excel … and a pdf"), for the two screens
 * that offer it — the run page and the package page: the platform builds the
 * file (`requestRunPackageFile`, a key per press, the phone's zone, one more ask
 * after a busy answer's wait, the format asked for and within 25 MiB), then
 * hands it on by the one path Settings › Data's export takes too
 * (`shareSignedFile`: the link checked, iOS's share sheet, Android's browser).
 * Bound to the workspace the screen read; any failure is "Could not download.
 * Try again.".
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
        await shareSignedFile(
          await requestRunPackageFile(workspaceId, runId, format, newIdempotencyKey(`run-package-${format}`), deviceTimeZone()),
        );
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
