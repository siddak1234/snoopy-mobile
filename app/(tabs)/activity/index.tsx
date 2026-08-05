import { useRouter } from 'expo-router';
import React from 'react';
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

export default function ActivityScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
            active={f === 'All'}
            onPress={
              f === 'Needs review' ? () => router.push('/(tabs)/activity/approvals') : undefined
            }
          />
        ))}
      </View>
      <ActivitySection label="TODAY" items={activityToday} />
      <ActivitySection label="YESTERDAY" items={activityYesterday} />
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
});
