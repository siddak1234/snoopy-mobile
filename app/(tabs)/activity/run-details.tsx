import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SectionTitle } from '@/components/nocturne/section-label';
import { StatCard } from '@/components/nocturne/stat-card';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TrackerStep } from '@/components/runs/tracker-step';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { fonts, space, typeScale } from '@/constants/theme';
import { busyBody } from '@/hooks/use-resource';
import { useRunDetail } from '@/hooks/use-run-detail';
import { useTheme } from '@/hooks/use-theme';
import { RUN_DETAILS_LABEL, STEPS_LABEL, errorTitleFor } from '@/lib/content/screen-states';
import { duration } from '@/lib/view/format';
import { statusLabel, type StatusPillLabel } from '@/lib/view/status';
import { runLabel, toRunFacts, toRunStats } from '@/lib/view/runs';

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
    <Page>
      <PageHeader
        onBack={() => router.back()}
        title={RUN_DETAILS_LABEL}
        titleTestID="run-details-title"
        below={
          <View style={styles.subRow}>
            <Text testID="run-details-name" selectable style={[styles.subtitle, { color: palette.neutral[400] }]}>
              {name}
            </Text>
            <StatusPill label={statusLabel(run.status) as StatusPillLabel} />
          </View>
        }
      />

      <View style={styles.statsRow}>
        {stats.map((s) => (
          <StatCard key={s.label} value={s.value} label={s.label} size="sm" />
        ))}
      </View>

      <View testID="run-progress">
        <SectionTitle>{STEPS_LABEL}</SectionTitle>
        <SurfaceCard>
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
    </Page>
  );
}

const styles = StyleSheet.create({
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.inner,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  statsRow: {
    flexDirection: 'row',
    gap: space.inner,
  },
  // A label and its value on one line; a long value — the run's id — wraps under its own column.
  fieldRow: {
    flexDirection: 'row',
    gap: space.group,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
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
