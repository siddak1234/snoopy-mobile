import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pause, PencilSimple } from 'phosphor-react-native';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatCard } from '@/components/nocturne/stat-card';
import { StatusPill } from '@/components/nocturne/status-pill';
import { StepCard } from '@/components/nocturne/step-card';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { detailConnections, detailStats, steps } from '@/lib/fixtures';

/** Workflow detail — design `sDetail` block in Screen.dc.html. */
export default function WorkflowDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();

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
          <Text style={[styles.title, { color: palette.text }]}>Invoice triage</Text>
          <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>
            AP inbox → QuickBooks
          </Text>
        </View>
        <StatusPill label="Live" />
      </View>

      <View style={styles.statsRow}>
        {detailStats.map((s) => (
          <StatCard
            key={s.label}
            value={s.value}
            label={s.label}
            size="sm"
            valueColor={s.tone === 'ok' ? status.ok : s.tone === 'err' ? status.err : undefined}
          />
        ))}
      </View>

      <View>
        <SectionLabel>CONNECTIONS</SectionLabel>
        <SurfaceCard style={styles.connectionsCard}>
          {detailConnections.map((c, i) => {
            const IconCmp = c.icon;
            return (
              <View
                key={c.name}
                style={[
                  styles.connectionRow,
                  i < detailConnections.length - 1 && {
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
              </View>
            );
          })}
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>PIPELINE</SectionLabel>
        <View style={styles.pipeline}>
          {steps.map((st) => (
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
          label="Pause"
          variant="secondary"
          height={46}
          fontSize={14}
          icon={Pause}
          iconSize={16}
          style={styles.actionBtn}
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
  },
  connectionName: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  connectionSub: {
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
