import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { DownloadSimple, Export } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { errorTitleFor } from '@/lib/content/screen-states';
import { downloadSignedFile } from '@/lib/platform/client';
import {
  isPartialExport,
  readBoundedExport,
  readCompleteExport,
  startCompleteExport,
  type ExportJob,
  type WorkspaceExport,
} from '@/lib/platform/exports';
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
 * section: a quick summary, bounded, shared as a JSON file; and everything as
 * one file, prepared on the platform from a link read again at the moment of
 * the download, since one read earlier may have expired (23.10.1). On iOS that
 * file is saved into the app and handed to the share sheet — Save to Files,
 * AirDrop, Mail — rather than opened in Safari (24.12, the owner's build 9); on
 * Android, whose share sheet carries text, the link opens in the browser. An
 * export holds every member's email, every project and every run, so it is an
 * owner's or an admin's; anyone else is told so.
 */
export default function DataExportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const keys = useIntentKeys('workspace-export');
  const [summary, setSummary] = useState<WorkspaceExport | null>(null);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [busy, setBusy] = useState<'summary' | 'share' | 'start' | 'download' | null>(null);
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

  // A file the share sheet hands on: on iOS the file itself, on Android the
  // text, which is what its share intent carries. Removed once shared.
  const share = () => {
    if (!summary) return;
    void run(
      'share',
      async () => {
        const json = JSON.stringify(summary, null, 2);
        if (Platform.OS !== 'ios') {
          await Share.share({ message: json });
          return;
        }
        const file = new File(Paths.cache, `workspace-export-${summary.workspaceId}.json`);
        file.create({ overwrite: true });
        file.write(json);
        try {
          await Share.share({ url: file.uri });
        } finally {
          if (file.exists) file.delete();
        }
      },
      'The export could not be shared.',
    );
  };

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

  const download = () => {
    const workspaceId = shown();
    if (!workspaceId || !job) return;
    void run(
      'download',
      async () => {
        const fresh = await readCompleteExport(workspaceId, job.id);
        setJob(fresh);
        const file = fresh.file;
        if (!file?.downloadUrl) return;
        if (new URL(file.downloadUrl).protocol !== 'https:') throw new Error('The export answered an unusable address.');
        if (Platform.OS !== 'ios') {
          await Linking.openURL(file.downloadUrl);
          return;
        }
        // Saved in the app's cache, handed to the share sheet, removed once shared.
        const saved = await downloadSignedFile(file.downloadUrl, file.filename);
        try {
          await Share.share({ url: saved.uri });
        } finally {
          if (saved.exists) saved.delete();
        }
      },
      'The file could not be saved.',
    );
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
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Export my data</Text>
      </View>

      {!access.data.canExport ? (
        <SurfaceCard style={styles.pad}>
          <Text style={[styles.text, muted]}>
            Exporting a workspace is for its owners and admins, because the export holds every member&apos;s email and
            every team.
          </Text>
        </SurfaceCard>
      ) : (
        <>
          <View>
            <SectionLabel>SUMMARY</SectionLabel>
            <SurfaceCard style={[styles.card, styles.pad]}>
              <Text style={[styles.text, muted]}>
                A copy of this workspace&apos;s records — its runs, approvals, flows, connections, teams and
                members — as a JSON file you can keep. The summary takes each part&apos;s most recent entries.
              </Text>
              <PillButton
                label={busy === 'summary' ? 'Preparing export…' : 'Prepare export'}
                variant="secondary"
                height={42}
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
                  <PillButton
                    label={busy === 'share' ? 'Sharing…' : 'Share JSON'}
                    variant="primary"
                    height={42}
                    icon={Export}
                    iconSize={15}
                    disabled={busy !== null}
                    onPress={share}
                  />
                </>
              ) : null}
            </SurfaceCard>
          </View>

          <View>
            <SectionLabel>EVERYTHING</SectionLabel>
            <SurfaceCard style={[styles.card, styles.pad]}>
              <Text style={[styles.text, muted]}>
                Or export every record as one file, however large the workspace. It takes a moment to prepare and the
                file is kept for a day.
              </Text>
              <PillButton
                label={running ? 'Preparing everything…' : 'Export everything'}
                variant="secondary"
                height={42}
                disabled={busy !== null || running}
                onPress={start}
              />
              {job?.status === 'ready' ? (
                <PillButton
                  label={busy === 'download' ? 'Saving…' : 'Download file'}
                  variant="primary"
                  height={42}
                  icon={DownloadSimple}
                  iconSize={15}
                  disabled={busy !== null}
                  onPress={download}
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
            </SurfaceCard>
          </View>
        </>
      )}
      {error ? <Text style={[styles.text, { color: status.err }]}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
  card: { marginTop: 9 },
  pad: { padding: 14, gap: 10 },
  text: { fontFamily: fonts.regular, ...typeScale.body },
  small: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
});
