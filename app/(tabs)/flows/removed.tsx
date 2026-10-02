import { useRouter } from 'expo-router';
import { Archive } from 'phosphor-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { IconTile } from '@/components/nocturne/icon-tile';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { em, fonts, layout } from '@/constants/theme';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { useTheme } from '@/hooks/use-theme';
import {
  REMOVED_FLOWS_EMPTY,
  REMOVED_FLOWS_NOTE,
  REMOVED_FLOWS_TITLE,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readProjects } from '@/lib/platform/projects';
import { readRemovedSubscriptions, readRunStats, readSubscriptions } from '@/lib/platform/runs';
import { scopeLabels, toRemovedFlows } from '@/lib/view/catalog';
import { inScope } from '@/lib/view/scope';

/**
 * The flows removed from this team, or from the whole workspace (BUILD-PLAN
 * 24.11.8). Removing a flow archives it: it stops and leaves Flows, but its runs
 * stay in Activity and it stays here, read-only, with "Add it again" on its
 * page. Reached from Flows ("Removed flows") and from Settings. The scope is the
 * one the person is looking at, as everywhere else.
 */
export default function RemovedFlowsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { projectId } = useScope();

  const removed = useWorkspaceResource(async (workspaceId) => {
    const [subs, removed, catalog, stats, projects] = await Promise.all([
      readSubscriptions(workspaceId),
      readRemovedSubscriptions(workspaceId),
      readCatalog(workspaceId),
      readRunStats(workspaceId),
      readProjects(workspaceId),
    ]);
    return toRemovedFlows(
      removed.subscriptions,
      catalog.automations,
      stats.subscriptions,
      scopeLabels(projects, subs.subscriptions),
    );
  });

  if (removed.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (removed.status === 'offline') {
    return <ScreenOffline onRetry={removed.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (removed.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('removed')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (removed.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('removed')}
        onRetry={removed.reload}
        body={busyBody(removed)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const rows = removed.data.filter((flow) => inScope(flow, projectId));
  const muted = { color: palette.neutral[400] };
  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{REMOVED_FLOWS_TITLE}</Text>
          <Text style={[styles.subtitle, muted]}>{REMOVED_FLOWS_NOTE}</Text>
        </View>
      </View>

      {rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Archive size={34} color={palette.neutral[600]} />
          <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>{REMOVED_FLOWS_EMPTY}</Text>
        </View>
      ) : null}
      <View style={styles.cardList}>
        {rows.map((def) => (
          <SurfaceCard
            key={def.key}
            onPress={() => router.push({ pathname: '/(tabs)/flows/detail', params: { flow: def.key } })}
            style={styles.flowCard}>
            <IconTile icon={def.icon} size={42} iconSize={21} borderRadius={12} bordered />
            <View style={styles.flowBody}>
              <Text style={[styles.flowName, { color: palette.text }]}>{def.name}</Text>
              <Text style={[styles.flowRuns, { color: palette.neutral[500] }]}>
                {def.scope && projectId === null ? `${def.scope} · ${def.runs}` : def.runs}
              </Text>
            </View>
            <Text style={[styles.removed, { color: palette.neutral[400] }]}>
              {def.removedOn ? `Removed ${def.removedOn}` : 'Removed'}
            </Text>
          </SurfaceCard>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.medium, fontSize: 21, letterSpacing: em(-0.01, 21) },
  subtitle: { fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  cardList: { gap: 10 },
  flowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  flowBody: { flex: 1, minWidth: 0 },
  flowName: { fontFamily: fonts.medium, fontSize: 14.5 },
  flowRuns: { fontFamily: fonts.regular, fontSize: 12, marginTop: 3 },
  removed: { fontFamily: fonts.regular, fontSize: 12.5 },
  emptyWrap: { alignItems: 'center', gap: 10, paddingVertical: 36 },
  emptyText: { fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
});
