import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pause, PencilSimple, Play, RocketLaunch } from 'phosphor-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatCard } from '@/components/nocturne/stat-card';
import { StatusPill } from '@/components/nocturne/status-pill';
import { StepCard } from '@/components/nocturne/step-card';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { statusAction, useWorkflows, type FlowStatus } from '@/hooks/use-workflows';
import { errorTitleFor } from '@/lib/content/screen-states';
import { flowDefs, type FlowKey } from '@/lib/fixtures';
import { readCatalog } from '@/lib/platform/catalog';
import { readRunStats, readSubscriptions } from '@/lib/platform/runs';
import { toFlows, type FlowView } from '@/lib/view/catalog';

const ACTION_ICON = { pause: Pause, play: Play, rocket: RocketLaunch } as const;

/** Workflow detail — one screen per workflow identity (design `flow` prop). */
export default function WorkflowDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { status: statusOf, toggle } = useWorkflows();
  const { flow } = useLocalSearchParams<{ flow?: string }>();

  /**
   * This workflow, by subscription id.
   *
   * `flow` used to be one of four `FlowKey`s baked into the prototype; it is now
   * a subscription id, which is the identity the platform uses and the only one
   * that can name a workspace's actual workflows. The three reads are the same
   * join the list makes — subscription for status, catalog for name and
   * `pipeline`, `run-stats` for the counters.
   */
  const flows = useWorkspaceResource(async (workspaceId) => {
    const [subs, catalog, stats] = await Promise.all([
      readSubscriptions(workspaceId),
      readCatalog(workspaceId),
      readRunStats(workspaceId),
    ]);
    return toFlows(subs.subscriptions, catalog.automations, stats.subscriptions);
  });

  const fixtureKey: FlowKey = flow && (flowDefs as Record<string, unknown>)[flow]
    ? (flow as FlowKey)
    : 'invoice';
  const live: FlowView | undefined =
    flows.status === 'ready'
      ? (flows.data.find((f) => f.key === flow) ?? flows.data[0])
      : undefined;
  const def: FlowView =
    live ?? { ...flowDefs[fixtureKey], key: fixtureKey, steps: flowDefs[fixtureKey].steps };
  const key = def.key;
  const current = statusOf(key, def.status as FlowStatus);
  const action = statusAction(current);
  const ActionIcon = ACTION_ICON[action.icon];

  // Below every hook on purpose — these return early.
  if (flows.status === 'loading') return <ScreenLoading tiles topInset={insets.top} />;
  if (flows.status === 'offline') {
    return <ScreenOffline onRetry={flows.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (flows.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('detail')}
        onRetry={flows.reload}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  // Draft flows show em dashes, which stay neutral rather than ok/err.
  const dash = (v: string) => v === '—';

  const connectionTone = (tone: 'ok' | 'warn' | 'neutral') =>
    tone === 'ok' ? status.ok : tone === 'warn' ? status.warnText : palette.neutral[500];

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}>
      <View style={styles.headerRow}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{def.name}</Text>
          <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>{def.desc}</Text>
        </View>
        <StatusPill label={current} />
      </View>

      <View style={styles.statsRow}>
        <StatCard value={def.runCount} label="Runs" size="sm" />
        <StatCard
          value={def.okCount}
          label="Successes"
          size="sm"
          valueColor={dash(def.okCount) ? palette.neutral[500] : status.ok}
        />
        <StatCard
          value={def.failCount}
          label="Failures"
          size="sm"
          valueColor={dash(def.failCount) ? palette.neutral[500] : status.err}
        />
      </View>

      <View>
        <SectionLabel>CONNECTIONS</SectionLabel>
        <SurfaceCard style={styles.connectionsCard}>
          {def.connections.map((c, i) => {
            const IconCmp = c.icon;
            return (
              <View
                key={c.name}
                style={[
                  styles.connectionRow,
                  i < def.connections.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: palette.divider,
                  },
                ]}>
                <IconCmp size={20} color={palette.accentRamp[300]} />
                <View style={styles.connectionBody}>
                  <Text style={[styles.connectionName, { color: palette.text }]}>{c.name}</Text>
                  <Text style={[styles.connectionSub, { color: palette.neutral[400] }]}>
                    {c.sub}
                  </Text>
                </View>
                <Text style={[styles.connectionStatus, { color: connectionTone(c.tone) }]}>
                  {c.status}
                </Text>
              </View>
            );
          })}
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>PIPELINE</SectionLabel>
        <View style={styles.pipeline}>
          {def.steps.map((st) => (
            <View key={st.title}>
              <StepCard step={st} />
              {st.more ? (
                <View style={[styles.connector, { borderColor: palette.accentRamp[700] }]} />
              ) : null}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <PillButton
          label={action.label}
          variant="secondary"
          height={46}
          fontSize={14}
          icon={ActionIcon}
          iconSize={16}
          style={styles.actionBtn}
          onPress={() => toggle(key, def.status as FlowStatus)}
        />
        <PillButton
          label="Edit in Builder"
          variant="primary"
          height={46}
          fontSize={14}
          icon={PencilSimple}
          iconSize={16}
          style={styles.actionBtn}
          onPress={() => router.push('/(tabs)/flows/builder')}
        />
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 21,
    letterSpacing: em(-0.01, 21),
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  connectionsCard: {
    marginTop: 9,
    overflow: 'hidden',
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  connectionBody: {
    flex: 1,
    minWidth: 0,
  },
  connectionName: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  connectionSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  connectionStatus: {
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  pipeline: {
    marginTop: 10,
  },
  connector: {
    width: 1.5,
    height: 20,
    marginLeft: 32,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
});
