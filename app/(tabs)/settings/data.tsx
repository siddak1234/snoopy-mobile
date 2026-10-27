import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Share, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FileActions } from '@/components/files/file-actions';
import { Group } from '@/components/group';
import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { fonts, status, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { errorTitleFor } from '@/lib/content/screen-states';
import {
  isPartialExport,
  readBoundedExport,
  readCompleteExport,
  startCompleteExport,
  type ExportJob,
  type WorkspaceExport,
} from '@/lib/platform/exports';
import { saveSignedFile, saveToFiles, shareSignedFile } from '@/lib/platform/signed-file';
import { readWorkspaces } from '@/lib/platform/workspaces';
import { administers } from '@/lib/view/roles';

/** How often a running export is asked about, and how many reads in a row may fail. */
const POLL_MS = 2_000;
const FAILED_READS_ALLOWED = 3;

/** A reason the platform names, in the website's words. */
const FAILURES: Record<string, string> = {
  interrupted: 'The export was interrupted. Start it again.',
  too_large: 'The workspace is larger than one export file may be.',
  not_configured: 'Exports are not available here.',
};

/**
 * Settings → Data export (BUILD-PLAN 24.6.3) — the website's workspace export
 * section: a quick summary, bounded, as a JSON file; and everything as one
 * file, prepared on the platform from a link read again at the moment of the
 * press, since one read earlier may have expired (23.10.1). Each is
 * Download, then Share (`FileActions`, Round 21; the owner's Q7 and build 30
 * note F4), in the website's words — "Download JSON", "Download file": on iOS
 * Download saves the file into the folder picked in Files and Share hands it
 * to the share sheet (24.12, the owner's build 9: "share or download to files
 * like apple native rather than go to safari"); on Android, whose share sheet
 * carries text, the summary's Download shares its text and the file's opens
 * its link, and there is no Share. An export holds every member's email, every
 * project and every run, so it is an owner's or an admin's; anyone else is
 * told so.
 */
export default function DataExportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const keys = useIntentKeys('workspace-export');
  const [summary, setSummary] = useState<WorkspaceExport | null>(null);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [busy, setBusy] = useState<'summary' | 'start' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gone = useRef(false);

  useEffect(
    () => () => {
      gone.current = true;
      clearTimeout(timer.current);
    },
    [],
  );

  const access = useWorkspaceResource(async (workspaceId) => {
    const { workspaces } = await readWorkspaces();
    return { canExport: administers(workspaces.find((workspace) => workspace.id === workspaceId)?.role) };
  });

  const shown = () => {
    const workspaceId = workspaceIfShown(session, access.loadedFor);
    if (!workspaceId) setError(WORKSPACE_CHANGED);
    return workspaceId;
  };

  const run = async (which: NonNullable<typeof busy>, work: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(which);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(refusalMessage(caught, {}, fallback));
    } finally {
      setBusy(null);
    }
  };

  const prepare = () => {
    const workspaceId = shown();
    if (!workspaceId) return;
    void run('summary', async () => setSummary(await readBoundedExport(workspaceId)), 'The export could not be prepared.');
  };

  /**
   * The summary as a JSON file in the app's cache, handed to `hand`, then
   * removed. On Android the summary's Download shares its text, which is what
   * Android's share intent carries (today's, ~~"Share JSON"~~ until Round 21).
   */
  const summaryFile = async (hand: (file: File, filename: string) => Promise<unknown>): Promise<string | null> => {
    if (!summary) return null;
    const json = JSON.stringify(summary, null, 2);
    const filename = `workspace-export-${summary.workspaceId}.json`;
    const file = new File(Paths.cache, filename);
    file.create({ overwrite: true });
    file.write(json);
    try {
      await hand(file, filename);
    } finally {
      if (file.exists) file.delete();
    }
    return null;
  };
  const said = (work: () => Promise<string | null>, fallback: string) => async (): Promise<string | null> => {
    try {
      return await work();
    } catch (caught) {
      return refusalMessage(caught, {}, fallback);
    }
  };
  const downloadSummary = said(async () => {
    if (!summary) return null;
    if (Platform.OS !== 'ios') {
      await Share.share({ message: JSON.stringify(summary, null, 2) });
      return null;
    }
    return summaryFile((file, filename) => saveToFiles(file, filename));
  }, 'The file could not be saved.');
  const shareSummary = said(() => summaryFile((file) => Share.share({ url: file.uri })), 'The export could not be shared.');

  const follow = (workspaceId: string, exportId: string, failedReads = 0) => {
    timer.current = setTimeout(async () => {
      let next: ExportJob;
      try {
        next = await readCompleteExport(workspaceId, exportId);
      } catch (caught) {
        if (gone.current) return;
        if (failedReads + 1 < FAILED_READS_ALLOWED) return follow(workspaceId, exportId, failedReads + 1);
        setJob(null);
        setError(refusalMessage(caught, {}, 'The export could not be checked just now.'));
        return;
      }
      if (gone.current) return;
      setJob(next);
      if (next.status === 'running') follow(workspaceId, exportId);
    }, POLL_MS * 2 ** failedReads);
  };

  const start = () => {
    const workspaceId = shown();
    if (!workspaceId) return;
    void run(
      'start',
      async () => {
        const started = await startCompleteExport(workspaceId, keys.keyFor());
        keys.settle();
        setJob(started);
        if (started.status === 'running') follow(workspaceId, started.id);
      },
      'The export could not be started.',
    );
  };

  /**
   * The complete export's file, from a link read again now, handed to `hand`;
   * nothing when no file is offered. A refusal in its own words ("The link to
   * the file cannot be used.", "The file could not be saved.").
   */
  const exportFile =
    (hand: (file: { downloadUrl: string; filename: string }) => Promise<void>, fallback: string) =>
    async (): Promise<string | null> => {
      const workspaceId = workspaceIfShown(session, access.loadedFor);
      if (!workspaceId) return WORKSPACE_CHANGED;
      if (!job) return null;
      try {
        const fresh = await readCompleteExport(workspaceId, job.id);
        setJob(fresh);
        const file = fresh.file;
        if (!file?.downloadUrl) return null;
        await hand({ downloadUrl: file.downloadUrl, filename: file.filename });
        return null;
      } catch (caught) {
        return refusalMessage(caught, {}, fallback);
      }
    };

  if (access.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (access.status === 'offline') {
    return <ScreenOffline onRetry={() => access.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (access.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('data')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (access.status === 'error') {
    return (
      <ScreenError title={errorTitleFor('data')} onRetry={() => access.reload()} body={busyBody(access)} onBack={() => router.back()} topInset={insets.top} />
    );
  }

  const muted = { color: palette.neutral[400] };
  const running = job?.status === 'running';
  const partial = summary ? isPartialExport(summary) : false;

  return (
    <Page testID="data-screen">
      <PageHeader onBack={() => router.back()} title="Export my data" />

      {!access.data.canExport ? (
        <SurfaceCard padded>
          <Text style={[styles.text, muted]}>
            Exporting a workspace is for its owners and admins, because the export holds every member&apos;s email and
            every department.
          </Text>
        </SurfaceCard>
      ) : (
        <>
          <Group title="SUMMARY" padded>
            <Text style={[styles.text, muted]}>
              A copy of this workspace&apos;s records — its runs, approvals, flows, connections, departments and
              members — as a JSON file you can keep. The summary takes each part&apos;s most recent entries.
            </Text>
            <PillButton
              label={busy === 'summary' ? 'Preparing export…' : 'Prepare export'}
              variant="secondary"
              disabled={busy !== null}
              onPress={prepare}
            />
            {summary ? (
              <>
                <Text style={[styles.text, { color: partial ? status.warnText : status.ok }]}>
                  {partial
                    ? 'This is a partial export. Some records or service sections are unavailable or bounded.'
                    : 'This export is complete.'}
                </Text>
                {summary.services.map((section) => (
                  <Text key={section.service} style={[styles.small, muted]}>
                    {section.service.charAt(0).toUpperCase() + section.service.slice(1)}:{' '}
                    {section.ok ? 'included' : section.reason}
                    {section.ok && section.data.truncated ? ' (bounded)' : ''}
                  </Text>
                ))}
                <FileActions
                  testID="data-summary-actions"
                  downloads={[{ label: 'Download JSON', busyLabel: 'Saving…', testID: 'data-summary-download', run: downloadSummary }]}
                  share={{ testID: 'data-summary-share', busyLabel: 'Sharing…', run: shareSummary }}
                />
              </>
            ) : null}
          </Group>

          <Group title="EVERYTHING" padded>
            <Text style={[styles.text, muted]}>
              Or export every record as one file, however large the workspace. It takes a moment to prepare and the
              file is kept for a day.
            </Text>
            <PillButton
              label={running ? 'Preparing everything…' : 'Export everything'}
              variant="secondary"
              disabled={busy !== null || running}
              onPress={start}
            />
            {job?.status === 'ready' ? (
              <FileActions
                testID="data-export-actions"
                downloads={[
                  {
                    label: 'Download file',
                    busyLabel: 'Saving…',
                    testID: 'data-export-download',
                    run: exportFile(saveSignedFile, 'The file could not be saved.'),
                  },
                ]}
                share={{
                  testID: 'data-export-share',
                  busyLabel: 'Sharing…',
                  run: exportFile(shareSignedFile, 'The export could not be shared.'),
                }}
              />
            ) : null}
            <Text style={[styles.text, muted]}>
              {job?.status === 'ready'
                ? job.complete
                  ? 'Ready. The file holds the whole workspace.'
                  : 'Ready, but partial: a part of the workspace could not be read, and the file says which.'
                : job?.status === 'failed'
                  ? (FAILURES[job.failureReason ?? ''] ?? 'The export could not be made.')
                  : job?.status === 'expired'
                    ? 'That file has been removed. Export again for a new one.'
                    : ''}
            </Text>
          </Group>
        </>
      )}
      {error ? <Text style={[styles.text, { color: status.err }]}>{error}</Text> : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.regular, ...typeScale.body },
  small: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
});
