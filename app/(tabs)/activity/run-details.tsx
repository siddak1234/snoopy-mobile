import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatCard } from '@/components/nocturne/stat-card';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { em, fonts, iconSize, layout, status, typeScale } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { busyBody } from '@/hooks/use-resource';
import { useRunDetail } from '@/hooks/use-run-detail';
import { useTheme } from '@/hooks/use-theme';
import { RUN_DETAILS_LABEL, STEPS_LABEL, errorTitleFor } from '@/lib/content/screen-states';
import { duration } from '@/lib/view/format';
import { statusLabel, type StatusPillLabel } from '@/lib/view/status';
import { runLabel, toRunFacts, toRunStats, type TrackerRow } from '@/lib/view/runs';

/**
 * A working step's icon turns (round 23, A4 — the owner's build 22 item 7: the
 * running step spins): a full turn every 900 ms, steadily, for as long as the
 * step works; still and upright under Reduce Motion.
 */
function StepSpinner({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    // Reduce Motion is known only after the first frame (`useReducedMotion`
    // answers off until the system does): a turn already started is stopped
    // and set upright, never left tilted where it stopped.
    if (reduceMotion) {
      cancelAnimation(turn);
      turn.value = 0;
      return;
    }
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
 * Stopped — never a step's own summary and never a step id (B6). A held step
 * says where it stands; its Approve and Deny are on the run's page (round 24
 * P6; build 28's review).
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
 * A run's details (the owner's build 28 item F9: "In the bottom make a section
 * that says Run details … When clicked it takes you to this list with steps and
 * steps done, started ended and everything"; the standard for every run, Round
 * 19 plan §3): its own page in Activity's stack, `?runId=`, opened from the
 * "Run details" row of the run's page, which reads the run the same way
 * (`useRunDetail`: bound to the workspace it was opened in, read again while it
 * goes). Top to bottom: Back, "Run details", the run's name and its status;
 * the tiles — Duration and Steps done; STEPS, every step from the start, live,
 * a held step saying where it stands (its Approve and Deny, and how the run
 * went, stay on the run's page); then its facts — Started, Ended, Trigger, Run
 * ID (the website's, G18).
 */
export default function RunDetailsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { runId } = useLocalSearchParams<{ runId?: string }>();
  const { detail, liveRun, tracker } = useRunDetail(runId);

  if (detail.status === 'loading') return <ScreenLoading tiles topInset={insets.top} />;
  if (detail.status === 'offline') {
    return <ScreenOffline onRetry={() => detail.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (detail.status === 'unconfigured') {
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

  const run = liveRun.detail.run;
  const stats = toRunStats(tracker, duration(run.startedAt, run.endedAt));
  const facts = toRunFacts(run);
  const name = run.title !== undefined && run.score !== undefined ? run.title : runLabel(run);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text testID="run-details-title" style={[styles.title, { color: palette.text }]}>
            {RUN_DETAILS_LABEL}
          </Text>
          <View style={styles.subRow}>
            <Text testID="run-details-name" selectable style={[styles.subtitle, { color: palette.neutral[400] }]}>
              {name}
            </Text>
            <StatusPill label={statusLabel(run.status) as StatusPillLabel} />
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        {stats.map((s) => (
          <StatCard key={s.label} value={s.value} label={s.label} size="sm" />
        ))}
      </View>

      <View testID="run-progress">
        <SectionLabel>{STEPS_LABEL}</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          {tracker.map((row, i) => (
            <TrackerStep key={row.id} row={row} divider={i < tracker.length - 1} />
          ))}
        </SurfaceCard>
      </View>

      <SurfaceCard>
        {facts.map((fact, i) => (
          <View
            key={fact.label}
            testID={`run-fact-${fact.label}`}
            style={[styles.fieldRow, i < facts.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
            <Text style={[styles.fieldKey, { color: palette.neutral[400] }]}>{fact.label}</Text>
            <Text selectable style={[styles.fieldValue, { color: palette.text }]}>
              {fact.value}
            </Text>
          </View>
        ))}
      </SurfaceCard>
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
});
