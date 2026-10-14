import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FlowArrow, StopCircle } from 'phosphor-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatCard } from '@/components/nocturne/stat-card';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import type { InboxRunPath } from '@/components/notifications/inbox';
import { Pressable } from '@/components/pressable';
import { em, fonts, iconSize, layout, status, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TimelineRowView as RunTimelineItem } from '@/lib/view/runs';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { useResource, busyBody } from '@/hooks/use-resource';
import { activeWorkspaceId, useSession, workspaceIfShown } from '@/hooks/use-session';
import { refusalMessage, WORKSPACE_CHANGED } from '@/lib/content/refusals';
import { DETAILS_LABEL, PROGRESS_LABEL, errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { cancelRun } from '@/lib/platform/automations';
import { readAllApprovals, readRun } from '@/lib/platform/runs';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';
import { dateTime, duration } from '@/lib/view/format';
import { statusLabel, type StatusPillLabel } from '@/lib/view/status';
import {
  NO_STEPS_REPORTED,
  RUN_REREAD_MS,
  runLabel,
  runResultLine,
  toProgress,
  toRunFacts,
  toRunStats,
} from '@/lib/view/runs';

const TIMELINE_ICON_COLOR: Record<string, string | undefined> = {
  ok: status.ok,
  warn: status.warnText,
  err: status.err,
  pending: undefined,
} as const;


/**
 * One row of PROGRESS — a group of the flow's steps, or a step — its title, the
 * latest summary in it, a held step's reason beside it, and when it happened —
 * the date and the time, on a line of its own, as the website's steps say it
 * (Gate 24's parity pass, G18). Its icon is 24 (spec §3.0 rule 2).
 */
function TimelineRow({ item, divider }: { item: RunTimelineItem; divider: boolean }) {
  const { palette } = useTheme();
  const iconColor = TIMELINE_ICON_COLOR[item.tone] ?? palette.neutral[500];
  const IconCmp = item.icon;
  // The run still going is drawn quieter than what it did.
  const quiet = item.tone === 'pending';
  return (
    <View
      style={[styles.timelineRow, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
      <IconCmp size={iconSize.row} color={iconColor} style={styles.timelineIcon} />
      <View style={styles.timelineBody}>
        <Text
          style={[
            styles.timelineTitle,
            { color: quiet ? palette.neutral[400] : palette.text },
          ]}>
          {item.title}
        </Text>
        {item.sub ? (
          <Text
            style={[
              styles.timelineSub,
              { color: quiet ? palette.neutral[500] : palette.neutral[400] },
            ]}>
            {item.sub}
          </Text>
        ) : null}
        {item.reason ? <Text style={[styles.timelineSub, { color: status.warnText }]}>{item.reason}</Text> : null}
        {item.time ? (
          <Text style={[styles.timelineTime, { color: palette.neutral[500] }]}>{item.time}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A run's page. Registered in two stacks — Home's, and Settings' for its inbox
 * (`app/(tabs)/settings/run.tsx`) — and `runPath` is the one it is in, so the
 * run it continues opens in the same stack and Back returns here.
 */
export default function RunDetailScreen({ runPath = '/(tabs)/(home)/run' }: { runPath?: InboxRunPath }) {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { runId } = useLocalSearchParams<{ runId?: string }>();
  const session = useSession();
  // **A run belongs to the workspace it was opened in.** The read is bound to
  // that workspace, not to whichever is active: re-reading a run id in another
  // workspace answered 404 three times on build 7 (BUILD-PLAN 24.11.9). When
  // the active workspace changes, this page leaves instead — the run is not
  // the new workspace's to show.
  const [openedIn] = useState(() => activeWorkspaceId(session));
  const activeNow = activeWorkspaceId(session);
  useEffect(() => {
    if (openedIn && activeNow && activeNow !== openedIn) {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/activity');
    }
  }, [activeNow, openedIn, router]);
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
   * What a succeeded run saved is its DETAILS (backend ADR-0037, §12.1 #67 as
   * amended 2026-10-14): the label and value lines its automation wrote for
   * people, on this one-run read only — never the raw output. ~~Confidence~~,
   * which no published shape carries (§12.1 #73a), is no longer drawn.
   */
  // Reads that have settled, either way: what schedules the next one while the run goes on.
  const [reads, setReads] = useState(0);
  const detail = useResource(async () => {
    try {
      if (!runId || !openedIn) throw new PlatformNotConfiguredError();
      const [run, catalog, approvals] = await Promise.all([
        readRun(openedIn, runId),
        readCatalog(openedIn),
        readAllApprovals(openedIn),
      ]);
      const entry = catalog.automations.find((a) => a.templateId === run.run.templateId);
      return { detail: run, entry, approvals: approvals.approvals };
    } finally {
      setReads((n) => n + 1);
    }
  }, [runId, openedIn]);

  /**
   * A run that has not ended is read again until it has — the owner's build 14
   * feedback #3, "It says running": the page read run `5acc41ac` once, Running at
   * 0 / 4, and still said so after the run succeeded four seconds later. One read
   * at a time: the next waits for the last to settle, either way, and none is
   * made while another screen is in front of this one. Each re-read keeps the
   * page on screen (`refresh`), as a return to it does.
   */
  const going =
    detail.status === 'ready' &&
    (detail.data.detail.run.status === 'pending' || detail.data.detail.run.status === 'running');
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const { refresh } = detail;
  useEffect(() => {
    if (!going || !focused) return;
    const timer = setTimeout(refresh, RUN_REREAD_MS);
    return () => clearTimeout(timer);
  }, [going, focused, reads, refresh]);

  const liveRun = detail.status === 'ready' ? detail.data : null;
  // What it did, by the flow's visible groups where its manifest declares them
  // (spec §3.E) — the catalog's groups only for a run of the version they were
  // declared for; a run of another version is drawn step by step, as the
  // website draws it (the review of the Invoice Processing screens).
  const progress = liveRun
    ? toProgress(
        liveRun.detail.steps,
        liveRun.entry?.pipeline,
        liveRun.entry?.version === liveRun.detail.run.templateVersion ? liveRun.entry.groups : undefined,
        dateTime,
        liveRun.detail.run.status,
      )
    : [];
  const run = liveRun
    ? {
        title: runLabel(liveRun.detail.run),
        // Its flow — the website's subheader, which no longer says the version
        // it ran (the Invoice Processing update; the spec's S9, the version gone
        // from the catalog card too).
        sub: liveRun.entry?.name ?? liveRun.detail.run.templateId,
        // How it went, on a line of its own (spec §3.E).
        result: runResultLine(liveRun.detail.run, liveRun.approvals),
        status: statusLabel(liveRun.detail.run.status) as StatusPillLabel,
        stats: toRunStats(progress, duration(liveRun.detail.run.startedAt, liveRun.detail.run.endedAt)),
        // Started, Ended, Trigger: the website's facts under its title.
        facts: toRunFacts(liveRun.detail.run),
        // The run a continuation continues, a tap away, as the website links "the
        // run that was held" (until Gate 24's parity pass, its id's first eight
        // characters, which nothing opened).
        continues: liveRun.detail.run.continuesRunId,
        // "No steps reported yet." while nothing is drawn, whatever was reported.
        reported: progress.some((row) => row.id !== 'working'),
        timeline: progress as RunTimelineItem[],
        // What a succeeded run saved, as its automation wrote it for people
        // (backend ADR-0037; the one-run read only). Absent, no section.
        details: liveRun.detail.details ?? [],
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
    // The run's own workspace, and only while it is still the active one.
    const workspaceId = workspaceIfShown(session, openedIn);
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
    return <ScreenOffline onRetry={() => detail.reload()} onBack={() => router.back()} topInset={insets.top} />;
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
        onRetry={() => detail.reload()} body={busyBody(detail)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  const continued = run.continues;

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

      {run.result ? (
        <Text testID="run-result" style={[styles.result, { color: palette.text }]}>
          {run.result}
        </Text>
      ) : null}

      <View style={styles.statsRow}>
        {run.stats.map((s) => (
          <StatCard key={s.label} value={s.value} label={s.label} size="sm" />
        ))}
      </View>

      <SurfaceCard>
        {run.facts.map((fact, i) => (
          <View
            key={fact.label}
            testID={`run-fact-${fact.label}`}
            style={[styles.fieldRow, i < run.facts.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
            <Text style={[styles.fieldKey, { color: palette.neutral[400] }]}>{fact.label}</Text>
            <Text style={[styles.fieldValue, { color: palette.text }]}>{fact.value}</Text>
          </View>
        ))}
      </SurfaceCard>

      {continued ? (
        <Pressable
          testID="run-continues"
          accessibilityRole="link"
          onPress={() => router.push({ pathname: runPath, params: { runId: continued } })}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
          <Text style={[styles.continues, { color: palette.neutral[400] }]}>
            Continues <Text style={{ color: palette.accentRamp[300] }}>the run that was held</Text>.
          </Text>
        </Pressable>
      ) : null}

      <View testID="run-progress">
        <SectionLabel>{PROGRESS_LABEL}</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          {/* The website's line while the run has reported nothing; "Working…"
              follows it while the run goes on. */}
          {run.reported ? null : (
            <Text
              style={[
                styles.noSteps,
                { color: palette.neutral[400] },
                run.timeline.length > 0 && { borderBottomWidth: 1, borderBottomColor: palette.divider },
              ]}>
              {NO_STEPS_REPORTED}
            </Text>
          )}
          {run.timeline.map((item, i) => (
            <TimelineRow key={item.id} item={item} divider={i < run.timeline.length - 1} />
          ))}
        </SurfaceCard>
      </View>

      {run.details.length > 0 ? (
        <View testID="run-details">
          <SectionLabel>{DETAILS_LABEL}</SectionLabel>
          <SurfaceCard style={styles.sectionCard}>
            {run.details.map((line, i) => (
              <View
                key={`${line.label}-${i}`}
                style={[
                  styles.detailRow,
                  i < run.details.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider },
                ]}>
                <Text style={[styles.fieldKey, { color: palette.neutral[400] }]}>{line.label}</Text>
                <Text style={[styles.detailValue, { color: palette.text }]}>{line.value}</Text>
              </View>
            ))}
          </SurfaceCard>
        </View>
      ) : null}

      <View style={styles.actions}>
        {/* It stops the run, which is not resumed: red (the owner's build 12 item 5, "stop"). */}
        {run.cancellable ? (
          <PillButton
            label="Cancel run"
            variant="danger"
            height={46}
            fontSize={typeScale.label.fontSize}
            icon={StopCircle}
            iconSize={iconSize.button}
            style={styles.actionBtn}
            onPress={() => {
              setCancelError(null);
              setCancelOpen(true);
            }}
          />
        ) : null}
        <PillButton
          label="View flow"
          variant="secondary"
          height={46}
          fontSize={typeScale.label.fontSize}
          icon={FlowArrow}
          iconSize={iconSize.button}
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
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  subtitle: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
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
    fontSize: typeScale.label.fontSize,
  },
  timelineSub: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  timelineTime: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
  },
  continues: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
  },
  noSteps: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  fieldKey: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
  },
  fieldValue: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body.fontSize,
  },
  result: {
    fontFamily: fonts.regular,
    ...typeScale.body,
  },
  // A label and its value on one line; a long value wraps under its own column.
  detailRow: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.medium,
    ...typeScale.body,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
});
