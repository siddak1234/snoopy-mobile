import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Archive, CaretRight, FlowArrow, MagnifyingGlass, Plus } from 'phosphor-react-native';

import { IconTile } from '@/components/nocturne/icon-tile';
import { PillButton } from '@/components/nocturne/pill-button';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SettingsRow } from '@/components/settings/settings-row';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScopeControl } from '@/components/scope-control';
import { em, fonts, layout, radius, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ScreenEmpty, ScreenError, ScreenUnavailable, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { useWorkflows, type FlowStatus } from '@/hooks/use-workflows';
import {
  ADD_FLOW_LABEL,
  FLOWS_EMPTY_BODY,
  FLOWS_EMPTY_TITLE,
  FLOWS_SCOPE_EMPTY_BODY,
  FLOWS_SCOPE_EMPTY_TITLE,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readProjects } from '@/lib/platform/projects';
import { readRemovedSubscriptionsOrNone, readRunStats, readSubscriptions } from '@/lib/platform/runs';
import { scopeLabels, toFlows, toRemovedFlows, type FlowView } from '@/lib/view/catalog';
import { inScope } from '@/lib/view/scope';

/**
 * Flows — the one tab for what the workspace runs (design `sFlows`; one tab
 * since BUILD-PLAN 24.9.3). The scope control narrows it to a project; "New"
 * opens the catalog inside this tab.
 */
export default function FlowsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { status: statusOf, settle } = useWorkflows();
  const { projectId } = useScope();
  const [query, setQuery] = useState('');

  /**
   * A workspace's flows: subscriptions, the catalog, and their run counts.
   *
   * Three reads because each answers a part nothing else can — `Subscription`
   * has identity and status, the catalog has name/description/icon/pipeline, and
   * `run-stats` has the totals this row's summary line draws. All-time rather
   * than windowed: the design's line is a lifetime count, so `since` is omitted,
   * which the endpoint documents as meaning all time. Every read is served from
   * the shared snapshot where it is fresh (24.9.1).
   */
  const flows = useWorkspaceResource(async (workspaceId) => {
    const [subs, catalog, stats, projects, removed] = await Promise.all([
      readSubscriptions(workspaceId),
      readCatalog(workspaceId),
      readRunStats(workspaceId),
      readProjects(workspaceId),
      readRemovedSubscriptionsOrNone(workspaceId),
    ]);
    const labels = scopeLabels(projects, subs.subscriptions);
    return {
      flows: toFlows(subs.subscriptions, catalog.automations, stats.subscriptions, undefined, labels),
      // Removed (archived) flows are a count here and a page of their own (24.11.8).
      removed: toRemovedFlows(removed.subscriptions, catalog.automations, stats.subscriptions, labels),
    };
  });

  const live: FlowView[] | null = flows.status === 'ready' ? flows.data.flows : null;
  const removedInScope: FlowView[] =
    flows.status === 'ready' ? flows.data.removed.filter((flow) => inScope(flow, projectId)) : [];
  // What detail recorded holds only until this list reads the platform again.
  useEffect(() => {
    if (live) settle(live.map((flow) => flow.key));
  }, [live, settle]);
  // The scope narrows what is shown, never what was read (24.9.2).
  const scoped: FlowView[] = (live ?? []).filter((flow) => inScope(flow, projectId));

  const q = query.trim().toLowerCase();
  const visible = scoped.filter((def) => {
    if (!q) return true;
    return `${def.name} ${def.desc}`.toLowerCase().includes(q);
  });

  if (flows.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (flows.status === 'offline') {
    return <ScreenOffline onRetry={flows.reload} topInset={insets.top} />;
  }
  if (flows.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('flows')} topInset={insets.top} />;
  }
  if (flows.status === 'error') {
    return (
      <ScreenError title={errorTitleFor('flows')} onRetry={flows.reload} body={busyBody(flows)} topInset={insets.top} />
    );
  }
  if (live !== null && live.length === 0 && removedInScope.length === 0) {
    // The first-run empty. The filtered one below reads `No flows match
    // "{query}"`, which is nonsense for a workspace that has none at all.
    return (
      <ScreenEmpty
        icon={<FlowArrow size={40} />}
        title={FLOWS_EMPTY_TITLE}
        body={FLOWS_EMPTY_BODY}
        action={{
          label: ADD_FLOW_LABEL,
          onPress: () => router.push('/(tabs)/flows/add'),
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
      <ScopeControl />
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: palette.text }]}>Flows</Text>
        <PillButton
          label="New"
          variant="primary"
          height={36}
          fontSize={13}
          icon={Plus}
          iconSize={14}
          gap={5}
          style={styles.headerPill}
          onPress={() => router.push('/(tabs)/flows/add')}
        />
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
          placeholder="Search flows"
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
                <Text style={[styles.flowRuns, { color: palette.neutral[500] }]}>
                  {def.scope && projectId === null ? `${def.scope} · ${def.runs}` : def.runs}
                </Text>
              </View>
              <StatusPill label={statusOf(key, def.status as FlowStatus)} />
            </SurfaceCard>
          );
        })}
        {visible.length === 0 && scoped.length === 0 ? (
          <View style={styles.emptyWrap}>
            <FlowArrow size={34} color={palette.neutral[600]} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>{FLOWS_SCOPE_EMPTY_TITLE}</Text>
            <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>{FLOWS_SCOPE_EMPTY_BODY}</Text>
            <PillButton
              label={ADD_FLOW_LABEL}
              variant="primary"
              height={40}
              fontSize={13.5}
              onPress={() => router.push('/(tabs)/flows/add')}
            />
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MagnifyingGlass size={34} color={palette.neutral[600]} />
            <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>
              No flows match &quot;{query}&quot;.
            </Text>
          </View>
        ) : null}
      </View>
      {removedInScope.length > 0 ? (
        <SurfaceCard style={styles.removedCard}>
          <SettingsRow
            icon={Archive}
            title={`Removed flows (${removedInScope.length})`}
            sub="Kept with their history; add any again"
            testID="flows-removed"
            onPress={() => router.push('/(tabs)/flows/removed')}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
        </SurfaceCard>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  removedCard: { marginTop: 4 },
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
  emptyTitle: {
    fontFamily: fonts.medium,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    textAlign: 'center',
    maxWidth: 260,
  },
});
