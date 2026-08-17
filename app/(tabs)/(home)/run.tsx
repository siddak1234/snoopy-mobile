import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleNotch, FlowArrow } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatCard } from '@/components/nocturne/stat-card';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { runDetails, runFields, type RunTimelineItem, type RunVariant } from '@/lib/fixtures';
import { ScreenError, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readRun } from '@/lib/platform/runs';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { clockTime, duration } from '@/lib/view/format';
import { statusLabel } from '@/lib/view/status';
import { metaFor, runLabel, toRunStats, toTimeline } from '@/lib/view/runs';

const TIMELINE_ICON_COLOR = {
  ok: status.ok,
  warn: status.warnText,
  err: status.err,
  pending: undefined,
} as const;

function TimelineRow({ item, divider }: { item: RunTimelineItem; divider: boolean }) {
  const { palette } = useTheme();
  const iconColor = TIMELINE_ICON_COLOR[item.tone] ?? palette.neutral[500];
  const IconCmp = item.icon;
  return (
    <View
      style={[styles.timelineRow, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }]}>
      <IconCmp size={19} color={iconColor} style={styles.timelineIcon} />
      <View style={styles.timelineBody}>
        <Text
          style={[
            styles.timelineTitle,
            { color: item.tone === 'pending' ? palette.neutral[400] : palette.text },
          ]}>
          {item.title}
        </Text>
        <Text
          style={[
            styles.timelineSub,
            { color: item.tone === 'pending' ? palette.neutral[500] : palette.neutral[400] },
          ]}>
          {item.sub}
        </Text>
      </View>
      {item.time ? (
        <Text style={[styles.timelineTime, { color: palette.neutral[500] }]}>{item.time}</Text>
      ) : null}
    </View>
  );
}

export default function RunDetailScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { variant, runId } = useLocalSearchParams<{ variant?: RunVariant; runId?: string }>();
  // Retry (design `rty`): idle → retrying (1600ms) → the retried run.
  const [retry, setRetry] = useState<'idle' | 'running' | 'done'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const requested = variant ?? 'held';
  const effective: RunVariant =
    requested === 'failed' && retry === 'done' ? 'retried' : requested;
  /**
   * One run, plus the catalog for its name and the step titles.
   *
   * `RunStep` carries a `stepId` the spec guarantees the pinned manifest
   * declares, so the human title comes from that manifest's `pipeline` — the
   * intended join, not a workaround.
   *
   * Two tiles the design draws have no source and are refused rather than
   * invented: **confidence** lives in the run's output (§12.1 #73a) and the
   * extracted-fields card needs that same output (§12.1 #67), which no published
   * shape carries — terminal event payloads are `{}`. Confidence renders the
   * design's own em dash; the fields card is omitted, exactly as the design
   * already omits it on a failed run.
   */
  const detail = useWorkspaceResource(
    async (workspaceId) => {
      if (!runId) throw new PlatformNotConfiguredError();
      const [run, catalog] = await Promise.all([
        readRun(workspaceId, runId),
        readCatalog(workspaceId),
      ]);
      const entry = catalog.automations.find((a) => a.templateId === run.run.templateId);
      return { detail: run, entry };
    },
    [runId],
  );

  const liveRun = detail.status === 'ready' ? detail.data : null;
  const run = liveRun
    ? {
        title: runLabel(liveRun.detail.run),
        sub: `${liveRun.entry?.name ?? liveRun.detail.run.templateId} · ${metaFor(liveRun.detail.run)}`,
        status: statusLabel(liveRun.detail.run.status) as (typeof runDetails)['held']['status'],
        stats: toRunStats(
          liveRun.detail.steps.length,
          liveRun.entry?.pipeline?.length ?? 0,
          duration(liveRun.detail.run.startedAt, liveRun.detail.run.endedAt),
        ),
        timeline: toTimeline(
          liveRun.detail.steps,
          liveRun.entry?.pipeline,
          clockTime,
        ) as RunTimelineItem[],
        // No published run output, so no extracted-fields card.
        fields: false,
        action: runDetails[effective]?.action,
      }
    : (runDetails[effective] ?? runDetails.held);
  const isHeld = run.status === 'Held';
  const isRetrying = retry === 'running';

  const startRetry = () => {
    if (retry !== 'idle') return;
    setRetry('running');
    timer.current = setTimeout(() => setRetry('done'), 1600);
  };

  // Below every hook: these return early. Only a named run fetches; without a
  // runId there is nothing to look up and the prototype's variants stand in.
  if (runId) {
    if (detail.status === 'loading') return <ScreenLoading tiles topInset={insets.top} />;
    if (detail.status === 'offline') {
      return <ScreenOffline onRetry={detail.reload} onBack={() => router.back()} topInset={insets.top} />;
    }
    if (detail.status === 'error') {
      return (
        <ScreenError
          title={errorTitleFor('run')}
          onRetry={detail.reload}
          onBack={() => router.back()}
          topInset={insets.top}
        />
      );
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{run.title}</Text>
          <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>{run.sub}</Text>
        </View>
        <StatusPill label={run.status} />
      </View>

      <View style={styles.statsRow}>
        {run.stats.map((s) => (
          <StatCard key={s.label} value={s.value} label={s.label} size="sm" />
        ))}
      </View>

      <View>
        <SectionLabel>TIMELINE</SectionLabel>
        <SurfaceCard style={styles.sectionCard}>
          {run.timeline.map((item, i) => (
            <TimelineRow key={item.title} item={item} divider={i < run.timeline.length - 1} />
          ))}
        </SurfaceCard>
      </View>

      {run.fields ? (
        <View>
          <SectionLabel>EXTRACTED FIELDS</SectionLabel>
          <SurfaceCard style={styles.sectionCard}>
            {runFields.map((f, i) => (
              <View
                key={f.key}
                style={[
                  styles.fieldRow,
                  i < runFields.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: palette.divider,
                  },
                ]}>
                <Text style={[styles.fieldKey, { color: palette.neutral[400] }]}>{f.key}</Text>
                <Text style={[styles.fieldValue, { color: palette.text }]}>{f.value}</Text>
              </View>
            ))}
          </SurfaceCard>
        </View>
      ) : null}

      <View style={styles.actions}>
        {run.action ? (
          <PillButton
            label={isRetrying ? 'Retrying…' : run.action.label}
            variant="primary"
            height={46}
            fontSize={14}
            icon={isRetrying ? CircleNotch : run.action.icon}
            iconSize={16}
            style={styles.actionBtn}
            onPress={isHeld ? () => router.push('/(tabs)/activity/approvals') : startRetry}
          />
        ) : null}
        <PillButton
          label="View workflow"
          variant="secondary"
          height={46}
          fontSize={14}
          icon={FlowArrow}
          iconSize={16}
          style={styles.actionBtn}
          onPress={() => router.push('/(tabs)/flows/detail')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 14,
  },
  header: {
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
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionCard: {
    marginTop: 9,
    overflow: 'hidden',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  timelineIcon: {
    marginTop: 1,
  },
  timelineBody: {
    flex: 1,
  },
  timelineTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  timelineSub: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  timelineTime: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  fieldKey: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
  },
  fieldValue: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
});
