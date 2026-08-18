import { useRouter } from 'expo-router';
import { CheckCircle } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/nocturne/filter-chip';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { em, fonts, layout, status } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import {
  ACTIVITY_EMPTY_BODY,
  ACTIVITY_EMPTY_TITLE,
  BROWSE_SOLUTIONS_LABEL,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { ACTIVITY_FILTERS, type ActivityItem } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readRuns } from '@/lib/platform/runs';
import { catalogIndex, runIcon, splitByDay, toRunRow } from '@/lib/view/runs';

function ActivityRow({ item }: { item: ActivityItem }) {
  const { palette } = useTheme();
  const IconCmp = item.icon;
  // The same five treatments the Nocturne StatusPill uses, so a run's row and
  // its pill agree. `accent` is the watched state and `neutral` is Draft's
  // treatment, exactly as `components/nocturne/status-pill.tsx` spells them.
  const toneColor: Record<ActivityItem['tone'], string> = {
    ok: status.ok,
    warn: status.warnText,
    err: status.err,
    accent: palette.accentRamp[300],
    neutral: palette.neutral[400],
  };
  return (
    <View style={[styles.row, { borderBottomColor: palette.divider }]}>
      <IconCmp size={19} color={toneColor[item.tone]} style={styles.rowIcon} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: palette.text }]}>{item.title}</Text>
        <Text style={[styles.rowDesc, { color: palette.neutral[400] }]}>{item.desc}</Text>
      </View>
      <Text style={[styles.rowTime, { color: palette.neutral[500] }]}>{item.time}</Text>
    </View>
  );
}

function ActivitySection({ label, items }: { label: string; items: ActivityItem[] }) {
  return (
    <View>
      <SectionLabel>{label}</SectionLabel>
      <SurfaceCard style={styles.sectionCard}>
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} />
        ))}
      </SurfaceCard>
    </View>
  );
}

/** All four chips are filters (design actF — v3 ratified filtering and made
 *  "Needs review" filter held runs instead of navigating). */
type ActivityFilter = 'All' | 'Success' | 'Needs review' | 'Failed';

/**
 * Chip → the published run status it selects.
 *
 * Keyed on `RunStatus`, not on tone. A tone is a shared treatment: `warn` is
 * worn by `held` *and*, before this, by anything the row could not colour. The
 * design's "Needs review" is the held queue — a human decision list — so it
 * must select `held` and nothing else.
 */
const FILTER_STATUS: Record<Exclude<ActivityFilter, 'All'>, string> = {
  Success: 'succeeded',
  'Needs review': 'held',
  Failed: 'failed',
};

const EMPTY_LABEL: Record<Exclude<ActivityFilter, 'All'>, string> = {
  Success: 'successful',
  'Needs review': 'held',
  Failed: 'failed',
};

const matchesFilter = (item: ActivityItem, filter: ActivityFilter) =>
  filter === 'All' || item.status === FILTER_STATUS[filter];

export default function ActivityScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<ActivityFilter>('All');

  /**
   * The runs list, joined to the catalog for a display name.
   *
   * Two reads because `Run` publishes `templateId` and no name — the runs list's
   * own description calls that join intended client work, so it is not a gap.
   * The second line comes from `resultSummary` or `failureReason`, which is
   * §12.1 #67's named substitute for the run output it refuses.
   *
   * Grouping is local-day, not UTC: "Today" and "Yesterday" are the design's two
   * sections and a person's own midnight decides them.
   */
  const activity = useWorkspaceResource(async (workspaceId) => {
    const [runs, catalog] = await Promise.all([readRuns(workspaceId), readCatalog(workspaceId)]);
    const index = catalogIndex(catalog.automations);
    const grouped = splitByDay(runs.runs);
    const toRow = (run: (typeof runs.runs)[number]): ActivityItem => {
      const row = toRunRow(run, index);
      return {
        id: run.id,
        icon: runIcon(run.status),
        // Carried verbatim: the chips select on this, never on the tone.
        status: run.status,
        tone: row.tone,
        title: row.name,
        desc: row.meta,
        time: row.time,
      };
    };
    return { today: grouped.today.map(toRow), yesterday: grouped.yesterday.map(toRow) };
  });

  const live = activity.status === 'ready' ? activity.data : null;
  const sourceToday = live ? live.today : [];
  const sourceYesterday = live ? live.yesterday : [];

  const today = sourceToday.filter((i) => matchesFilter(i, filter));
  const yesterday = sourceYesterday.filter((i) => matchesFilter(i, filter));
  const isEmpty = today.length === 0 && yesterday.length === 0;
  /** Nothing at all, as opposed to nothing matching a filter. */
  const hasNoRuns = live !== null && live.today.length === 0 && live.yesterday.length === 0;

  if (activity.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (activity.status === 'offline') {
    return <ScreenOffline onRetry={activity.reload} topInset={insets.top} />;
  }
  if (activity.status === 'error' || activity.status === 'unconfigured') {
    return (
      <ScreenError
        title={errorTitleFor('activity')}
        onRetry={activity.reload}
        topInset={insets.top}
      />
    );
  }
  if (hasNoRuns) {
    // The first-run empty, distinct from the filtered one below: the old copy
    // read "No … runs in the last two days", which assumes a filter and reads as
    // nonsense for a workspace that has never run anything.
    return (
      <ScreenEmpty
        icon={<CheckCircle size={40} color={status.ok} />}
        title={ACTIVITY_EMPTY_TITLE}
        body={ACTIVITY_EMPTY_BODY}
        action={{ label: BROWSE_SOLUTIONS_LABEL, onPress: () => router.push('/(tabs)/solutions') }}
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
      <Text style={[styles.h1, { color: palette.text }]}>Activity</Text>
      <View style={styles.filters}>
        {ACTIVITY_FILTERS.map((f) => (
          <FilterChip
            key={f}
            label={f}
            active={f === filter}
            onPress={() => setFilter(f as ActivityFilter)}
          />
        ))}
      </View>
      {today.length > 0 ? <ActivitySection label="TODAY" items={today} /> : null}
      {yesterday.length > 0 ? <ActivitySection label="YESTERDAY" items={yesterday} /> : null}
      {isEmpty && filter !== 'All' ? (
        <View style={styles.emptyWrap}>
          <CheckCircle size={38} color={palette.neutral[600]} />
          <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>
            No {EMPTY_LABEL[filter]} runs in the last two days.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 14,
  },
  h1: {
    fontFamily: fonts.medium,
    fontSize: 26,
    letterSpacing: em(-0.015, 26),
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionCard: {
    marginTop: 9,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  rowIcon: {
    marginTop: 1,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  rowDesc: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  rowTime: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
  },
  emptyWrap: {
    paddingVertical: 56,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    textAlign: 'center',
  },
});
