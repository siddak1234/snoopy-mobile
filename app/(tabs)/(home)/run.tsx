import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlowArrow, StopCircle } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatCard } from '@/components/nocturne/stat-card';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TimelineRowView as RunTimelineItem } from '@/lib/view/runs';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { refusalMessage, WORKSPACE_CHANGED } from '@/lib/content/refusals';
import { errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { cancelRun } from '@/lib/platform/automations';
import { readRun } from '@/lib/platform/runs';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';
import { clockTime, duration } from '@/lib/view/format';
import { statusLabel, type StatusPillLabel } from '@/lib/view/status';
import { metaFor, runLabel, toRunStats, toTimeline } from '@/lib/view/runs';

const TIMELINE_ICON_COLOR: Record<string, string | undefined> = {
  ok: status.ok,
  warn: status.warnText,
  err: status.err,
  pending: undefined,
} as const;

function TimelineRow({ item, divider }: { item: RunTimelineItem; divider: boolean }) {
  const { palette } = useTheme();
  const iconColor = TIMELINE_ICON_COLOR[item.tone] ?? palette.neutral[500];
  const IconCmp = item.icon;
  return (
    <View
      style={[styles.timelineRow, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
      <IconCmp size={19} color={iconColor} style={styles.timelineIcon} />
      <View style={styles.timelineBody}>
        <Text
          style={[
            styles.timelineTitle,
            { color: item.tone === 'pending' ? palette.neutral[400] : palette.text },
          ]}>
          {item.title}
        </Text>
        <Text
          style={[
            styles.timelineSub,
            { color: item.tone === 'pending' ? palette.neutral[500] : palette.neutral[400] },
          ]}>
          {item.sub}
        </Text>
      </View>
      {item.time ? (
        <Text style={[styles.timelineTime, { color: palette.neutral[500] }]}>{item.time}</Text>
      ) : null}
    </View>
  );
}

export default function RunDetailScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { runId } = useLocalSearchParams<{ runId?: string }>();
  const session = useSession();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  /**
   * The prototype's retry was theatre: idle → 1600ms → swap to a 'retried'
   * fixture. It is gone with the fixtures, and no honest replacement exists yet.
   * A client cannot create a RETRY — `POST /runs` accepts `{subscriptionId,
   * input}` and `RunOrigin` is not client-settable, so the most a client could do
   * is start an unrelated new run and call it one. Recorded in
   * DESIGN-CONTRACT.md rather than faked.
   */
  /**
   * One run, plus the catalog for its name and the step titles.
   *
   * `RunStep` carries a `stepId` the spec guarantees the pinned manifest
   * declares, so the human title comes from that manifest's `pipeline` — the
   * intended join, not a workaround.
   *
   * Two tiles the design draws have no source and are refused rather than
   * invented: **confidence** lives in the run's output (§12.1 #73a) and the
   * extracted-fields card needs that same output (§12.1 #67), which no published
   * shape carries — terminal event payloads are `{}`. Confidence renders the
   * design's own em dash; the fields card is omitted, exactly as the design
   * already omits it on a failed run.
   */
  const detail = useWorkspaceResource(
    async (workspaceId) => {
      if (!runId) throw new PlatformNotConfiguredError();
      const [run, catalog] = await Promise.all([
        readRun(workspaceId, runId),
        readCatalog(workspaceId),
      ]);
      const entry = catalog.automations.find((a) => a.templateId === run.run.templateId);
      return { detail: run, entry };
    },
    [runId],
  );

  const liveRun = detail.status === 'ready' ? detail.data : null;
  const run = liveRun
    ? {
        title: runLabel(liveRun.detail.run),
        sub: `${liveRun.entry?.name ?? liveRun.detail.run.templateId} · ${metaFor(liveRun.detail.run)}`,
        status: statusLabel(liveRun.detail.run.status) as StatusPillLabel,
        stats: toRunStats(
          liveRun.detail.steps.length,
          liveRun.entry?.pipeline?.length ?? 0,
          duration(liveRun.detail.run.startedAt, liveRun.detail.run.endedAt),
        ),
        timeline: toTimeline(
          liveRun.detail.steps,
          liveRun.entry?.pipeline,
          clockTime,
        ) as RunTimelineItem[],
        // No published run output, so no extracted-fields card.
        fields: false,
        action: undefined,
        subscriptionId: liveRun.detail.run.subscriptionId,
        id: liveRun.detail.run.id,
        // The two states the platform cancels (BUILD-PLAN 24.4.2).
        cancellable: liveRun.detail.run.status === 'pending' || liveRun.detail.run.status === 'running',
      }
    : null;

  /**
   * Cancel a run that has not ended, confirmed first because a cancelled run is
   * not resumed — it ends where it stands (BUILD-PLAN 24.4.2, ported from the
   * website's CancelRunButton). Acts on the workspace this run was read in; a 404
   * is said as "already stopped", the one thing a person here can act on.
   */
  const confirmCancel = async () => {
    if (!run || cancelling) return;
    const workspaceId = workspaceIfShown(session, detail.loadedFor);
    if (!workspaceId) {
      setCancelError(WORKSPACE_CHANGED);
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelRun(workspaceId, run.id);
      setCancelOpen(false);
      detail.reload();
    } catch (error) {
      setCancelError(
        error instanceof PlatformError && error.status === 404
          ? 'This run has already stopped, so there is nothing to cancel.'
          : refusalMessage(error),
      );
    } finally {
      setCancelling(false);
    }
  };

  if (detail.status === 'loading') return <ScreenLoading tiles topInset={insets.top} />;
  if (detail.status === 'offline') {
    return <ScreenOffline onRetry={detail.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  // An unconfigured build or an unresolved workspace cannot succeed on a
  // retry, so it does not get a Retry. A refused identity and a platform
  // refusal both can — a stale read is the common case — so they keep one.
  if (detail.status === 'unconfigured') {
    return (
      <ScreenUnavailable
        title={errorTitleFor('run')}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  if (detail.status === 'error' || !run) {
    return (
      <ScreenError
        title={errorTitleFor('run')}
        onRetry={detail.reload} body={busyBody(detail)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{run.title}</Text>
          <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>{run.sub}</Text>
        </View>
        <StatusPill label={run.status} />
      </View>

      <View style={styles.statsRow}>
        {run.stats.map((s) => (
          <StatCard key={s.label} value={s.value} label={s.label} size="sm" />
        ))}
      </View>

      <View>
        <SectionLabel>TIMELINE</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          {run.timeline.map((item, i) => (
            <TimelineRow key={item.id} item={item} divider={i < run.timeline.length - 1} />
          ))}
        </SurfaceCard>
      </View>

      <View style={styles.actions}>
        {run.cancellable ? (
          <PillButton
            label="Cancel run"
            variant="secondary"
            height={46}
            fontSize={14}
            icon={StopCircle}
            iconSize={16}
            style={styles.actionBtn}
            onPress={() => {
              setCancelError(null);
              setCancelOpen(true);
            }}
          />
        ) : null}
        <PillButton
          label="View workflow"
          variant="secondary"
          height={46}
          fontSize={14}
          icon={FlowArrow}
          iconSize={16}
          style={styles.actionBtn}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/flows/detail',
              params: { flow: run.subscriptionId },
            })
          }
        />
      </View>

      <Dialog
        visible={cancelOpen}
        onRequestClose={() => (cancelling ? undefined : setCancelOpen(false))}
        testID="cancel-run-dialog"
        title="Cancel this run?"
        body="It stops where it is and is not resumed. Steps it already finished stay finished."
        actions={
          <>
            <DialogButton label="Keep it running" disabled={cancelling} onPress={() => setCancelOpen(false)} />
            <DialogButton
              tone="danger"
              disabled={cancelling}
              label={cancelling ? 'Cancelling…' : 'Cancel run'}
              onPress={confirmCancel}
            />
          </>
        }>
        {cancelError ? <DialogText tone="error">{cancelError}</DialogText> : null}
      </Dialog>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 21,
    letterSpacing: em(-0.01, 21),
  },
  subtitle: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionCard: {
    marginTop: 9,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  timelineIcon: {
    marginTop: 1,
  },
  timelineBody: {
    flex: 1,
  },
  timelineTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  timelineSub: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  timelineTime: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  fieldKey: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
  },
  fieldValue: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
});
