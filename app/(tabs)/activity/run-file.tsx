import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FileView } from '@/components/files/file-view';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { busyBody } from '@/hooks/use-resource';
import { useRunDetail } from '@/hooks/use-run-detail';
import { FILE_WORD, errorTitleFor } from '@/lib/content/screen-states';
import { readRunFile } from '@/lib/platform/automations';
import { runFileRows } from '@/lib/view/items';
import { runLabel } from '@/lib/view/runs';

/**
 * One file the run's job uploaded (Round 19, build 28; the owner's item F7:
 * "When clicked it takes you to a page to review the original document that
 * you can download and share like other documents"), opened from the run's
 * "View {file}" row, in Activity's stack, `?runId=&fileId=`. Back, the file's
 * word as its flow names it ("Resume", `runFileRows`) and the run's title (or
 * "Run {id}"); then the file, drawn in place over the page, its name and its
 * line, and Download (`FileView`, `readRunFile`). The run is read as its page reads it (`useRunDetail`), so
 * the page leaves when the workspace changes; loading, offline, error and
 * unavailable as every fetching screen.
 */
export default function RunFileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { runId, fileId } = useLocalSearchParams<{ runId?: string; fileId?: string }>();
  const { openedIn, detail, liveRun } = useRunDetail(runId);

  if (detail.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (detail.status === 'offline') {
    return <ScreenOffline onRetry={() => detail.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (detail.status === 'unconfigured' || !fileId) {
    return <ScreenUnavailable title={errorTitleFor('run')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (detail.status === 'error' || !liveRun) {
    return (
      <ScreenError
        title={errorTitleFor('run')}
        onRetry={() => detail.reload()}
        body={busyBody(detail)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  const files = liveRun.detail.files ?? [];
  const row = runFileRows(files, liveRun.flow?.runInput).find((candidate) => candidate.id === fileId);
  const run = liveRun.detail.run;

  return (
    <Page testID="run-file-screen" fill>
      <PageHeader
        onBack={() => router.back()}
        title={row?.title ?? FILE_WORD}
        titleTestID="run-file-title"
        subtitle={run.title ?? runLabel(run)}
        subtitleTestID="run-file-run"
      />
      <View style={styles.body}>
        <FileView testID="run-file" workspaceId={openedIn} read={(workspaceId) => readRunFile(workspaceId, run.id, fileId)} />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
});
