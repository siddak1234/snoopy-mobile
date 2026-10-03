import { useRouter } from 'expo-router';
import { Archive } from 'phosphor-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { IconTile } from '@/components/nocturne/icon-tile';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { useTheme } from '@/hooks/use-theme';
import {
  ARCHIVED_FLOWS_EMPTY_BODY,
  ARCHIVED_FLOWS_EMPTY_TITLE,
  ARCHIVED_FLOWS_NOTE,
  ARCHIVED_FLOWS_TITLE,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readProjects } from '@/lib/platform/projects';
import { readRemovedSubscriptions, readRunStats } from '@/lib/platform/runs';
import { scopeLabels, toRemovedFlows } from '@/lib/view/catalog';
import { inScope } from '@/lib/view/scope';

/** Where an archived flow's page opens: in the stack its list was reached in. */
export type ArchivedFlowPath = '/(tabs)/flows/detail' | '/(tabs)/settings/archived-flow';

/**
 * The flows archived in this team, or in the whole workspace (BUILD-PLAN
 * 24.11.8; "Archived flows" since the owner's decision 4 of 2026-10-02, 24.12).
 * Archiving a flow stops it and moves it here: its runs stay in Activity and it
 * stays here, read-only, with "Add it again" on its page — or, once it has been
 * added again in the same scope, "Open the live flow" (build 11, D3). The scope
 * is the one the person is looking at, as everywhere else; every row says its
 * team, or "Whole workspace" (D4).
 *
 * Reached from Flows' Archived button and from Settings, each in its own stack: a
 * flow opened from the Settings copy opens in Settings too, so Back returns to
 * Settings rather than switching to the Flows tab (the owner's build 9).
 */
export function ArchivedFlows({ detailPath }: { detailPath: ArchivedFlowPath }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { projectId } = useScope();

  const archived = useWorkspaceResource(async (workspaceId) => {
    const [archived, catalog, stats, projects] = await Promise.all([
      readRemovedSubscriptions(workspaceId),
      readCatalog(workspaceId),
      readRunStats(workspaceId),
      readProjects(workspaceId),
    ]);
    return toRemovedFlows(
      archived.subscriptions,
      catalog.automations,
      stats.subscriptions,
      scopeLabels(projects),
    );
  });

  if (archived.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (archived.status === 'offline') {
    return <ScreenOffline onRetry={archived.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (archived.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('archived')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (archived.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('archived')}
        onRetry={archived.reload}
        body={busyBody(archived)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const rows = archived.data.filter((flow) => inScope(flow, projectId));
  if (rows.length === 0) {
    return (
      <ScreenEmpty
        icon={<Archive size={40} color={palette.accentRamp[300]} />}
        title={ARCHIVED_FLOWS_EMPTY_TITLE}
        body={ARCHIVED_FLOWS_EMPTY_BODY}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const muted = { color: palette.neutral[400] };
  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{ARCHIVED_FLOWS_TITLE}</Text>
          <Text style={[styles.subtitle, muted]}>{ARCHIVED_FLOWS_NOTE}</Text>
        </View>
      </View>

      <View style={styles.cardList}>
        {rows.map((def) => (
          <SurfaceCard
            key={def.key}
            onPress={() => router.push({ pathname: detailPath, params: { flow: def.key } })}
            style={styles.flowCard}>
            <IconTile icon={def.icon} size={42} iconSize={21} borderRadius={12} bordered />
            <View style={styles.flowBody}>
              <Text style={[styles.flowName, { color: palette.text }]}>{def.name}</Text>
              {/* Its team, or "Whole workspace", in every scope — a picked
                  team's too (D4: every archived row; the build 11 review). */}
              <Text style={[styles.flowRuns, { color: palette.neutral[500] }]}>
                {def.scope ? `${def.scope} · ${def.runs}` : def.runs}
              </Text>
            </View>
            <Text style={[styles.archived, { color: palette.neutral[400] }]}>
              {def.removedOn ? `Archived ${def.removedOn}` : 'Archived'}
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
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
  subtitle: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize, marginTop: 1 },
  cardList: { gap: 10 },
  flowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  flowBody: { flex: 1, minWidth: 0 },
  flowName: { fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  flowRuns: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize, marginTop: 3 },
  archived: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
});
