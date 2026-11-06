import { useRouter } from 'expo-router';
import { Archive } from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FlowCard } from '@/components/flows/flow-card';
import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { fonts, space, typeScale } from '@/constants/theme';
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
 * stays here, read-only, with "Unarchive" on its page ("Add it again" until the
 * owner's build 12 item 4) — or, once the workspace holds it again in any team,
 * "Open the live flow" (build 11, D3; any team since item 9). The scope
 * is the one the person is looking at, as everywhere else. Each row is the one
 * flow card (`FlowCard`; the owner's builds 37 items 1 and 4): its icon, name
 * and description, "Archived {date}" where the pill goes (~~its team, or
 * "Whole workspace", and its runs, D4~~ until builds 37 and 39).
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
    return <ScreenOffline onRetry={() => archived.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (archived.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('archived')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (archived.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('archived')}
        onRetry={() => archived.reload()}
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

  return (
    <Page>
      <PageHeader onBack={() => router.back()} title={ARCHIVED_FLOWS_TITLE} subtitle={ARCHIVED_FLOWS_NOTE} />

      <View style={styles.cardList}>
        {rows.map((def) => (
          <FlowCard
            key={def.key}
            testID={`archived-flow-${def.key}`}
            icon={def.icon}
            name={def.name}
            description={def.desc}
            right={
              <Text style={[styles.archived, { color: palette.neutral[400] }]}>
                {def.removedOn ? `Archived ${def.removedOn}` : 'Archived'}
              </Text>
            }
            onPress={() => router.push({ pathname: detailPath, params: { flow: def.key } })}
          />
        ))}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  cardList: { gap: space.inner },
  archived: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
});
