import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FileView } from '@/components/files/file-view';
import { BackCircle } from '@/components/nocturne/back-circle';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { busyBody } from '@/hooks/use-resource';
import { useRunDetail } from '@/hooks/use-run-detail';
import { useTheme } from '@/hooks/use-theme';
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
  const { palette } = useTheme();
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
    <View
      testID="run-file-screen"
      style={[styles.screen, { backgroundColor: palette.bg, paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text testID="run-file-title" accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
            {row?.title ?? FILE_WORD}
          </Text>
          <Text testID="run-file-run" selectable style={[styles.sub, { color: palette.neutral[400] }]}>
            {run.title ?? runLabel(run)}
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        <FileView testID="run-file" workspaceId={openedIn} read={(workspaceId) => readRunFile(workspaceId, run.id, fileId)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.screenX },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  sub: { marginTop: 1, fontFamily: fonts.regular, fontSize: typeScale.body.fontSize },
  body: { flex: 1, paddingHorizontal: layout.screenX, paddingTop: 14, paddingBottom: 20 },
});
