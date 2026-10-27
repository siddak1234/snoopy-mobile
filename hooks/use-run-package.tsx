import { useCallback } from 'react';

import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import { newIdempotencyKey } from '@/lib/platform/client';
import { requestRunPackageFile, type RunPackageFormat } from '@/lib/platform/runs';
import { saveSignedFile, shareSignedFile } from '@/lib/platform/signed-file';

/** The zone the package prints its times in: the phone's, or none (the platform then prints UTC). */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The one way the run package's files are handed on (round 24 P12; the owner's
 * build 23 F16: "I want to download excel … and a pdf"), for the two screens
 * that offer them — the run page and the package page — as `FileActions`'
 * presses (Round 21; the owner's Q7: Download, then Share): the platform
 * builds the file (`requestRunPackageFile`, a key per press, the phone's zone,
 * one more ask after a busy answer's wait, the format asked for and within
 * 25 MiB); `download` saves it (`saveSignedFile`, as Settings › Data's export
 * and the file pages: on iOS into the folder picked in Files, on Android the
 * browser), `share` hands the PDF to the share sheet (`shareSignedFile`, iOS
 * only). Bound to the workspace the screen read: a press after it changed says
 * so; a failure throws, and `FileActions` says "Could not download. Try
 * again." or "Could not share. Try again.".
 */
export function useRunPackageDownload(shownWorkspaceId: string | null | undefined, runId: string | undefined) {
  const session = useSession();

  const built = useCallback(
    async (format: RunPackageFormat, hand: (file: { downloadUrl: string; filename: string }) => Promise<void>) => {
      if (!runId) return null;
      const workspaceId = workspaceIfShown(session, shownWorkspaceId ?? null);
      if (!workspaceId) return WORKSPACE_CHANGED;
      await hand(
        await requestRunPackageFile(workspaceId, runId, format, newIdempotencyKey(`run-package-${format}`), deviceTimeZone()),
      );
      return null;
    },
    [runId, session, shownWorkspaceId],
  );

  const download = useCallback((format: RunPackageFormat) => built(format, saveSignedFile), [built]);
  const share = useCallback(() => built('pdf', shareSignedFile), [built]);

  return { download, share };
}
