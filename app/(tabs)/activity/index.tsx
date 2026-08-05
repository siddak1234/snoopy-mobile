import { CheckCircle } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/nocturne/filter-chip';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  activityFilters,
  activityToday,
  activityYesterday,
  type ActivityItem,
} from '@/lib/fixtures';

const toneColor = { ok: status.ok, warn: status.warnText, err: status.err } as const;

function ActivityRow({ item }: { item: ActivityItem }) {
  const { palette } = useTheme();
  const IconCmp = item.icon;
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
        {items.map((item, i) => (
          <ActivityRow key={i} item={item} />
        ))}
      </SurfaceCard>
    </View>
  );
}

/** All four chips are filters (design actF — v3 ratified filtering and made
 *  "Needs review" filter held runs instead of navigating). */
type ActivityFilter = 'All' | 'Success' | 'Needs review' | 'Failed';

const FILTER_TONE: Record<Exclude<ActivityFilter, 'All'>, ActivityItem['tone']> = {
  Success: 'ok',
  'Needs review': 'warn',
  Failed: 'err',
};

const EMPTY_LABEL: Record<Exclude<ActivityFilter, 'All'>, string> = {
  Success: 'successful',
  'Needs review': 'held',
  Failed: 'failed',
};

const matchesFilter = (item: ActivityItem, filter: ActivityFilter) =>
  filter === 'All' || item.tone === FILTER_TONE[filter];

export default function ActivityScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ActivityFilter>('All');

  const today = activityToday.filter((i) => matchesFilter(i, filter));
  const yesterday = activityYesterday.filter((i) => matchesFilter(i, filter));
  const isEmpty = today.length === 0 && yesterday.length === 0;

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
        {activityFilters.map((f) => (
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
