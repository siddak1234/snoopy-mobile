import { File, Paths } from 'expo-file-system';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { DownloadSimple, FlowArrow, StopCircle } from 'phosphor-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
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
import { DocumentCard } from '@/components/runs/document-card';
import { em, fonts, iconSize, layout, status, typeScale } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { useResource, busyBody } from '@/hooks/use-resource';
import { activeWorkspaceId, useSession, workspaceIfShown } from '@/hooks/use-session';
import { refusalMessage, WORKSPACE_CHANGED } from '@/lib/content/refusals';
import {
  DETAILS_LABEL,
  DOCUMENTS_LABEL,
  DOWNLOAD_FAILED,
  DOWNLOAD_JSON_LABEL,
  STEPS_LABEL,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { cancelRun } from '@/lib/platform/automations';
import {
  readAllApprovals,
  readRemovedSubscriptionsOrNone,
  readRun,
  readRunDocuments,
  readSubscriptions,
  type Subscription,
} from '@/lib/platform/runs';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';
import { duration, timeOfDay } from '@/lib/view/format';
import { documentsFileName, toDocumentCards } from '@/lib/view/documents';
import { statusLabel, type StatusPillLabel } from '@/lib/view/status';
import {
  RUN_REREAD_MS,
  heldDecision,
  runLabel,
  runResultLine,
  toRunFacts,
  toRunStats,
  toTracker,
  type TrackerFlow,
  type TrackerRow,
} from '@/lib/view/runs';


/**
 * A working step's icon turns (round 23, A4 — the owner's build 22 item 7: the
 * running step spins): a full turn every 900 ms, steadily, for as long as the
 * step works; still under Reduce Motion.
 */
function StepSpinner({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    turn.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduceMotion, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View testID="run-step-spinner" style={[styles.trackerIcon, spin]}>
      {children}
    </Animated.View>
  );
}

/**
 * One row of STEPS (Build 21, spec A7; the owner's build 20 item 10: "It
 * shoukd show all the steps and a live tracker of which ones are done"): "2 ·
 * Read", its state's icon at 24 and its state in words — Waiting, Working…,
 * Done and when, Waiting for approval and why, the run's failure, Skipped or
 * Stopped — never a step's own summary and never a step id (B6).
 */
function TrackerStep({ row, divider }: { row: TrackerRow; divider: boolean }) {
  const { palette } = useTheme();
  const tone =
    row.tone === 'ok'
      ? status.ok
      : row.tone === 'warn'
        ? status.warnText
        : row.tone === 'err'
          ? status.err
          : row.tone === 'accent'
            ? palette.accentRamp[300]
            : palette.neutral[500];
  const IconCmp = row.icon;
  const quiet = row.state === 'waiting' || row.state === 'skipped' || row.state === 'stopped' || row.state === 'unknown';
  return (
    <View
      testID={`run-step-${row.id}`}
      style={[styles.trackerRow, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
      {row.state === 'working' ? (
        <StepSpinner>
          <IconCmp size={iconSize.row} color={tone} />
        </StepSpinner>
      ) : (
        <IconCmp size={iconSize.row} color={tone} style={styles.trackerIcon} />
      )}
      <View style={styles.trackerBody}>
        <Text style={[styles.trackerTitle, { color: quiet ? palette.neutral[400] : palette.text }]}>{row.title}</Text>
        {/* A platform step this build does not know has no state, so no line (backend ADR-0041). */}
        {row.sub ? (
          <Text style={[styles.trackerSub, { color: row.tone === 'muted' ? palette.neutral[500] : tone }]}>{row.sub}</Text>
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
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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
   *
   * And its flow, as it is now (Build 22, the session's S23): a setting step's
   * line — the integration the flow has chosen — and a title by connection
   * ("QuickBooks updated") follow the flow's settings, since a run does not
   * record its own choice (backend §12.1 #290). The live list first, an
   * archived flow's only when the run's flow is not in it; a flow that cannot be
   * read costs those two their words, never the page.
   */
  // Reads that have settled, either way: what schedules the next one while the run goes on.
  const [reads, setReads] = useState(0);
  const detail = useResource(async () => {
    try {
      if (!runId || !openedIn) throw new PlatformNotConfiguredError();
      const [run, catalog, approvals, live] = await Promise.all([
        readRun(openedIn, runId),
        readCatalog(openedIn),
        readAllApprovals(openedIn),
        readSubscriptions(openedIn).then(
          (answer) => answer.subscriptions,
          () => null,
        ),
      ]);
      const entry = catalog.automations.find((a) => a.templateId === run.run.templateId);
      const own = (rows: Subscription[] | null) => rows?.find((row) => row.id === run.run.subscriptionId);
      const flow =
        own(live) ?? (live === null ? undefined : own((await readRemovedSubscriptionsOrNone(openedIn)).subscriptions));
      return { detail: run, entry, approvals: approvals.approvals, flow };
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
  // Every step from the start, each where the run is (spec A7; the session's
  // S14) — by the catalog's groups, the newest version's, for any run whose
  // every reported step they still declare (Build 22, the session's S25: a v3
  // run is drawn by v4's five steps); a run that reported a step they no longer
  // declare is drawn by the steps it reported. ~~Only a run of the catalog's
  // own version drawn by its groups~~ until Build 22. Step 2 says the flow's
  // integration, step 4's title follows it, step 5 is the run's email.
  const trackerFlow: TrackerFlow | undefined =
    liveRun?.flow !== undefined
      ? {
          setup: liveRun.flow.setup ?? liveRun.entry?.setup ?? [],
          config: liveRun.flow.config,
          providerName: (providerId) =>
            liveRun.entry?.requiredConnections.find((c) => c.providerId === providerId)?.displayName ?? providerId,
        }
      : undefined;
  const tracker = liveRun
    ? toTracker(
        liveRun.detail.steps,
        liveRun.entry?.pipeline,
        liveRun.entry?.groups,
        liveRun.detail.run,
        timeOfDay,
        liveRun.entry?.pipeline,
        { flow: trackerFlow, email: liveRun.detail.email },
      )
    : [];
  // A waiting document whose approval was refused or ran out says "Not approved" (S21).
  const decided = liveRun ? heldDecision(liveRun.detail.run, liveRun.approvals) : null;
  const run = liveRun
    ? {
        // The run by its FULL id (the owner's D4 and AM2); never the request id.
        title: runLabel(liveRun.detail.run),
        // Its flow — the website's subheader.
        sub: liveRun.entry?.name ?? liveRun.detail.run.templateId,
        // How it went, on a line of its own (spec §3.E).
        result: runResultLine(liveRun.detail.run, liveRun.approvals),
        status: statusLabel(liveRun.detail.run.status) as StatusPillLabel,
        stats: toRunStats(tracker, duration(liveRun.detail.run.startedAt, liveRun.detail.run.endedAt)),
        // Started, Ended, Trigger, Run ID: the website's facts.
        facts: toRunFacts(liveRun.detail.run),
        // The run a continuation continues, a tap away, as the website links "the
        // run that was held" (until Gate 24's parity pass, its id's first eight
        // characters, which nothing opened).
        continues: liveRun.detail.run.continuesRunId,
        tracker,
        // Each document it read, on a card of its own (backend ADR-0039).
        documents: toDocumentCards(
          liveRun.detail.documents,
          decided === 'rejected' ? 'rejected' : decided === 'closed' ? 'expired' : null,
        ),
        // What a v1/v2 run saved, as its automation wrote it for people (backend
        // ADR-0037; the one-run read only) — drawn only where no documents are.
        details: liveRun.detail.details ?? [],
        subscriptionId: liveRun.detail.run.subscriptionId,
        id: liveRun.detail.run.id,
        // The two states the platform cancels (BUILD-PLAN 24.4.2).
        cancellable: liveRun.detail.run.status === 'pending' || liveRun.detail.run.status === 'running',
      }
    : null;

  /**
   * Download JSON (spec A7, C2; the session's S25): the run's documents as the
   * platform serves them for keeping (`readRunDocuments`), read at the press,
   * handed to the share sheet as `run-{full id}.json` — on iOS the file itself,
   * on Android the text, which is what its share intent carries — the pattern
   * of Settings › Data's export. The file is removed once shared.
   */
  const downloadJson = async () => {
    if (!run || downloading) return;
    const workspaceId = workspaceIfShown(session, openedIn);
    if (!workspaceId) {
      setDownloadError(WORKSPACE_CHANGED);
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      const file = await readRunDocuments(workspaceId, run.id);
      const json = JSON.stringify(file, null, 2);
      if (Platform.OS !== 'ios') {
        await Share.share({ message: json });
        return;
      }
      const saved = new File(Paths.cache, documentsFileName(run.id));
      saved.create({ overwrite: true });
      saved.write(json);
      try {
        await Share.share({ url: saved.uri });
      } finally {
        if (saved.exists) saved.delete();
      }
    } catch {
      setDownloadError(DOWNLOAD_FAILED);
    } finally {
      setDownloading(false);
    }
  };

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
      {/* The run by its full id, which wraps at its hyphens; its flow and status under it. */}
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text testID="run-title" selectable style={[styles.title, { color: palette.text }]}>
            {run.title}
          </Text>
          <View style={styles.subRow}>
            <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>{run.sub}</Text>
            <StatusPill label={run.status} />
          </View>
        </View>
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
        <SectionLabel>{STEPS_LABEL}</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          {run.tracker.map((row, i) => (
            <TrackerStep key={row.id} row={row} divider={i < run.tracker.length - 1} />
          ))}
        </SurfaceCard>
      </View>

      {run.documents.length > 0 ? (
        <View testID="run-documents" style={styles.documents}>
          <SectionLabel>{DOCUMENTS_LABEL}</SectionLabel>
          {run.documents.map((card) => (
            <DocumentCard key={card.index} card={card} />
          ))}
        </View>
      ) : run.details.length > 0 ? (
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

      <SurfaceCard>
        {run.facts.map((fact, i) => (
          <View
            key={fact.label}
            testID={`run-fact-${fact.label}`}
            style={[styles.fieldRow, i < run.facts.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
            <Text style={[styles.fieldKey, { color: palette.neutral[400] }]}>{fact.label}</Text>
            <Text selectable style={[styles.fieldValue, { color: palette.text }]}>
              {fact.value}
            </Text>
          </View>
        ))}
      </SurfaceCard>

      {run.documents.length > 0 ? (
        <View style={styles.download}>
          <PillButton
            testID="run-download-json"
            label={DOWNLOAD_JSON_LABEL}
            variant="secondary"
            height={46}
            fontSize={typeScale.label.fontSize}
            icon={DownloadSimple}
            iconSize={iconSize.button}
            disabled={downloading}
            onPress={downloadJson}
          />
          {downloadError ? (
            <Text accessibilityRole="alert" style={[styles.downloadError, { color: status.err }]}>
              {downloadError}
            </Text>
          ) : null}
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
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontFamily: fonts.medium,
    ...typeScale.title,
    letterSpacing: em(-0.01, typeScale.title.fontSize),
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  subtitle: {
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
  documents: {
    gap: 9,
  },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  trackerIcon: {
    marginTop: 1,
  },
  trackerBody: {
    flex: 1,
  },
  trackerTitle: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
  },
  trackerSub: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  continues: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
  },
  // A label and its value on one line; a long value — the run's id — wraps under its own column.
  fieldRow: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  fieldKey: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
  },
  fieldValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.medium,
    fontSize: typeScale.body.fontSize,
  },
  result: {
    fontFamily: fonts.regular,
    ...typeScale.body,
  },
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
  download: {
    gap: 6,
  },
  downloadError: {
    fontFamily: fonts.regular,
    ...typeScale.small,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
});
