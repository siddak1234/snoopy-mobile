import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlowArrow, MagnifyingGlass, Plus } from 'phosphor-react-native';

import { IconTile } from '@/components/nocturne/icon-tile';
import { PillButton } from '@/components/nocturne/pill-button';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, radius, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useWorkflows, type FlowStatus } from '@/hooks/use-workflows';
import {
  BROWSE_SOLUTIONS_LABEL,
  FLOWS_EMPTY_BODY,
  FLOWS_EMPTY_TITLE,
  START_FROM_TEMPLATE_LABEL,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readRunStats, readSubscriptions } from '@/lib/platform/runs';
import { toFlows, type FlowView } from '@/lib/view/catalog';

/** Workflows list — design `sFlows`, now searchable and identity-aware. */
export default function FlowsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { status: statusOf } = useWorkflows();
  const [query, setQuery] = useState('');

  /**
   * A workspace's workflows: subscriptions, the catalog, and their run counts.
   *
   * Three reads because each answers a part nothing else can — `Subscription`
   * has identity and status, the catalog has name/description/icon/pipeline, and
   * `run-stats` has the totals this row's summary line draws. All-time rather
   * than windowed: the design's line is a lifetime count, so `since` is omitted,
   * which the endpoint documents as meaning all time.
   */
  const flows = useWorkspaceResource(async (workspaceId) => {
    const [subs, catalog, stats] = await Promise.all([
      readSubscriptions(workspaceId),
      readCatalog(workspaceId),
      readRunStats(workspaceId),
    ]);
    return toFlows(subs.subscriptions, catalog.automations, stats.subscriptions);
  });

  const live: FlowView[] | null = flows.status === 'ready' ? flows.data : null;
  const source: FlowView[] = live ?? [];

  const q = query.trim().toLowerCase();
  const visible = source.filter((def) => {
    if (!q) return true;
    return `${def.name} ${def.desc}`.toLowerCase().includes(q);
  });

  if (flows.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (flows.status === 'offline') {
    return <ScreenOffline onRetry={flows.reload} topInset={insets.top} />;
  }
  if (flows.status === 'error' || flows.status === 'unconfigured') {
    return (
      <ScreenError title={errorTitleFor('flows')} onRetry={flows.reload} topInset={insets.top} />
    );
  }
  if (live !== null && live.length === 0) {
    // The first-run empty. The filtered one below reads `No workflows match
    // "{query}"`, which is nonsense for a workspace that has none at all.
    return (
      <ScreenEmpty
        icon={<FlowArrow size={40} />}
        title={FLOWS_EMPTY_TITLE}
        body={FLOWS_EMPTY_BODY}
        action={{
          label: BROWSE_SOLUTIONS_LABEL,
          onPress: () => router.push('/(tabs)/solutions'),
        }}
        secondaryAction={{
          label: START_FROM_TEMPLATE_LABEL,
          onPress: () => router.push('/(tabs)/flows/templates'),
        }}
        topInset={insets.top}
      />
    );
  }

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: palette.text }]}>Workflows</Text>
        <View style={styles.titleActions}>
          <PillButton
            label="Templates"
            variant="secondary"
            height={36}
            fontSize={13}
            style={styles.headerPill}
            onPress={() => router.push('/(tabs)/flows/templates')}
          />
          <PillButton
            label="New"
            variant="primary"
            height={36}
            fontSize={13}
            icon={Plus}
            iconSize={14}
            gap={5}
            style={styles.headerPill}
            onPress={() => router.push('/(tabs)/flows/templates')}
          />
        </View>
      </View>

      <View
        style={[
          styles.search,
          {
            borderColor: palette.neutral[800],
            backgroundColor: withAlpha(palette.surface, 0.6),
          },
        ]}>
        <MagnifyingGlass size={17} color={palette.neutral[500]} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search workflows"
          placeholderTextColor={palette.neutral[500]}
          selectionColor={palette.accent}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, { color: palette.text }]}
        />
      </View>

      <View style={styles.cardList}>
        {visible.map((def) => {
          const key = def.key;
          return (
            <SurfaceCard
              key={key}
              onPress={() =>
                router.push({ pathname: '/(tabs)/flows/detail', params: { flow: key } })
              }
              style={styles.flowCard}>
              <IconTile icon={def.icon} size={42} iconSize={21} borderRadius={12} bordered />
              <View style={styles.flowBody}>
                <Text style={[styles.flowName, { color: palette.text }]}>{def.name}</Text>
                <Text style={[styles.flowDesc, { color: palette.neutral[400] }]}>{def.desc}</Text>
                <Text style={[styles.flowRuns, { color: palette.neutral[500] }]}>{def.runs}</Text>
              </View>
              <StatusPill label={statusOf(key, def.status as FlowStatus)} />
            </SurfaceCard>
          );
        })}
        {visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MagnifyingGlass size={34} color={palette.neutral[600]} />
            <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>
              No workflows match &quot;{query}&quot;.
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 26,
    letterSpacing: em(-0.015, 26),
  },
  titleActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerPill: {
    paddingHorizontal: 14,
  },
  search: {
    height: 44,
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    paddingVertical: 0,
  },
  cardList: {
    gap: 10,
  },
  flowCard: {
    padding: layout.cardPad,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  flowBody: {
    flex: 1,
    minWidth: 0,
  },
  flowName: {
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  flowDesc: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    marginTop: 2,
  },
  flowRuns: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    marginTop: 4,
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    textAlign: 'center',
  },
});
