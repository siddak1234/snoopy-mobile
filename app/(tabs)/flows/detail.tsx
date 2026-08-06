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
import { statusAction, useWorkflows } from '@/hooks/use-workflows';
import { flowDefs, type FlowKey } from '@/lib/fixtures';

const ACTION_ICON = { pause: Pause, play: Play, rocket: RocketLaunch } as const;

/** Workflow detail — one screen per workflow identity (design `flow` prop). */
export default function WorkflowDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { status: statusOf, toggle } = useWorkflows();
  const { flow } = useLocalSearchParams<{ flow?: FlowKey }>();
  const key: FlowKey = flow && flowDefs[flow] ? flow : 'invoice';
  const def = flowDefs[key];
  const current = statusOf(key);
  const action = statusAction(current);
  const ActionIcon = ACTION_ICON[action.icon];
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
          onPress={() => toggle(key)}
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
