import type { NavigationProp } from '@react-navigation/native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { CheckCircle } from 'phosphor-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/nocturne/filter-chip';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { ScopeControl } from '@/components/scope-control';
import { ScreenEmpty, ScreenError, ScreenUnavailable, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { useTheme } from '@/hooks/use-theme';
import {
  ACTIVITY_EMPTY_BODY,
  ACTIVITY_EMPTY_TITLE,
  ACTIVITY_SCOPE_EMPTY,
  ADD_FLOW_LABEL,
  RUN_FLOW_ARCHIVED,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { ACTIVITY_FILTERS, type ActivityItem } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readAllApprovals, readRemovedSubscriptionsOrNone, readRuns, readSubscriptions } from '@/lib/platform/runs';
import { catalogIndex, needsReview, runIcon, splitByDay, toRunRow } from '@/lib/view/runs';
import { scopeRuns } from '@/lib/view/scope';

/**
 * One run. Opens its run detail, as Home's RECENT RUNS and the inbox already do
 * (ROUND-7.5-OBSERVATIONS finding 2, BUILD-PLAN 24.4.4) — the rows were inert.
 */
function ActivityRow({ item, last }: { item: ActivityItem; last: boolean }) {
  const { palette } = useTheme();
  const router = useRouter();
  const IconCmp = item.icon;
  // The same five treatments the Nocturne StatusPill uses, so a run's row and
  // its pill agree. `accent` is the watched state and `neutral` is Draft's
  // treatment, exactly as `components/nocturne/status-pill.tsx` spells them.
  const toneColor: Record<ActivityItem['tone'], string> = {
    ok: status.ok,
    warn: status.warnText,
    err: status.err,
    accent: palette.accentRamp[300],
    neutral: palette.neutral[400],
  };
  return (
    <Pressable
      testID={`activity-row-${item.id}`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/(tabs)/(home)/run', params: { runId: item.id } })}
      style={({ pressed }) => [
        styles.row,
        // The last row draws no border: it would run square past the card's rounded
        // corner (the owner, build 13 #7).
        !last && { borderBottomWidth: 1, borderBottomColor: palette.divider },
        pressed && { opacity: 0.7 },
      ]}>
      <IconCmp size={19} color={toneColor[item.tone]} style={styles.rowIcon} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: palette.text }]}>{item.title}</Text>
        <Text style={[styles.rowDesc, { color: palette.neutral[400] }]}>{item.desc}</Text>
      </View>
      <Text style={[styles.rowTime, { color: palette.neutral[500] }]}>{item.time}</Text>
    </Pressable>
  );
}

function ActivitySection({ label, items }: { label: string; items: ActivityItem[] }) {
  return (
    <View>
      <SectionLabel>{label}</SectionLabel>
      <SurfaceCard style={styles.sectionCard}>
        {items.map((item, i) => (
          <ActivityRow key={item.id} item={item} last={i === items.length - 1} />
        ))}
      </SurfaceCard>
    </View>
  );
}

/** All four chips are filters (design actF — v3 ratified filtering and made
 *  "Needs review" filter held runs instead of navigating). */
type ActivityFilter = 'All' | 'Success' | 'Needs review' | 'Failed';

/**
 * Chip → the published run status it selects.
 *
 * Keyed on `RunStatus`, not on tone. A tone is a shared treatment: `warn` is
 * worn by `held` *and*, before this, by anything the row could not colour. The
 * design's "Needs review" is the held queue — a human decision list — so it
 * must select `held` and nothing else.
 */
const FILTER_STATUS: Record<Exclude<ActivityFilter, 'All'>, string> = {
  Success: 'succeeded',
  'Needs review': 'held',
  Failed: 'failed',
};

const EMPTY_LABEL: Record<Exclude<ActivityFilter, 'All'>, string> = {
  Success: 'successful',
  'Needs review': 'held',
  Failed: 'failed',
};

const matchesFilter = (item: ActivityItem, filter: ActivityFilter) =>
  filter === 'All' || (filter === 'Needs review' ? item.needsReview : item.status === FILTER_STATUS[filter]);

const isActivityFilter = (value: unknown): value is ActivityFilter =>
  typeof value === 'string' && (ACTIVITY_FILTERS as readonly string[]).includes(value);

type ArrivalParams = { flow?: string; flowName?: string; filter?: string; period?: string };

/**
 * What a tile on Home or a flow page arrived with (24.11.9): an outcome, and
 * perhaps a flow — or, from Home, today (the owner's build 12 item 1): Home's
 * tiles count today's runs, so the list a tile opens is today's, and its number
 * is the rows it opens.
 */
function arrivedWith(params: ArrivalParams): {
  filter: ActivityFilter;
  flow: { id: string; name: string } | null;
  todayOnly: boolean;
} {
  return {
    filter: isActivityFilter(params.filter) ? params.filter : 'All',
    flow: params.flow ? { id: params.flow, name: params.flowName || 'this flow' } : null,
    todayOnly: params.period === 'today',
  };
}

/** What an empty selection says: the outcome, the flow, and the day, as chosen. */
function emptyLine(filter: ActivityFilter, flow: { name: string } | null, todayOnly: boolean): string {
  if (filter === 'All') {
    if (flow) return `No runs for ${flow.name} ${todayOnly ? 'today' : 'yet'}.`;
    return 'No runs today.';
  }
  return `No ${EMPTY_LABEL[filter]} runs${flow ? ` for ${flow.name}` : ''}${todayOnly ? ' today' : ''}.`;
}

export default function ActivityScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // This screen's own navigation, typed with the params it takes.
  const navigation = useNavigation<NavigationProp<{ index: ArrivalParams }>>();
  const { projectId } = useScope();
  const params = useLocalSearchParams<ArrivalParams>();
  const [filter, setFilter] = useState<ActivityFilter>(() => arrivedWith(params).filter);
  // One flow's history (24.11.9): a tile on Home or a flow page arrives with the
  // flow and the outcome, and that selection replaces whatever was chosen here.
  // The chip clears it; the tab bar arrives with nothing and changes nothing.
  const [flow, setFlow] = useState<{ id: string; name: string } | null>(() => arrivedWith(params).flow);
  // Today only (the owner's build 12 item 1): a Home tile arrives with it, a flow
  // page's with none — its tiles count all time. Its chip clears it, as the flow's does.
  const [todayOnly, setTodayOnly] = useState<boolean>(() => arrivedWith(params).todayOnly);
  useEffect(() => {
    if (!params.flow && !params.filter && !params.period) return;
    const arrived = arrivedWith(params);
    setFilter(arrived.filter);
    setFlow(arrived.flow);
    setTodayOnly(arrived.todayOnly);
    // Taken, and cleared from this screen's own route: the same tile pressed
    // again sends the same params, and only a change re-runs this, so a
    // selection cleared here and asked for again did not come back (build 13).
    // Cleared, every press is a change. The screen's navigation object names
    // its route; `router.setParams` goes to whatever is focused, which on the
    // first arrival is still the tab, not this screen.
    navigation.setParams({ flow: undefined, flowName: undefined, filter: undefined, period: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.flow, params.flowName, params.filter, params.period]);

  /**
   * The runs list, joined to the catalog for a display name.
   *
   * Two reads because `Run` publishes `templateId` and no name — the runs list's
   * own description calls that join intended client work, so it is not a gap.
   * The second line comes from `resultSummary` or `failureReason`, which is
   * §12.1 #67's named substitute for the run output it refuses. Subscriptions
   * are read for the scope: a run follows its flow's project (24.9.2).
   *
   * Grouping is local-day, not UTC: "Today" and "Yesterday" are the design's two
   * sections and a person's own midnight decides them.
   */
  const activity = useWorkspaceResource(async (workspaceId) => {
    const [runs, catalog, approvals, subscriptions, removed] = await Promise.all([
      readRuns(workspaceId),
      readCatalog(workspaceId),
      readAllApprovals(workspaceId),
      readSubscriptions(workspaceId),
      readRemovedSubscriptionsOrNone(workspaceId),
    ]);
    const index = catalogIndex(catalog.automations);
    const grouped = splitByDay(runs.runs);
    // A run whose flow was archived says so on its row (24.11.8).
    const removedFlows = new Set(removed.subscriptions.map((s) => s.id));
    const toRow = (run: (typeof runs.runs)[number]): ActivityItem => {
      const row = toRunRow(run, index, Date.now(), approvals.approvals);
      return {
        id: run.id,
        subscriptionId: run.subscriptionId,
        icon: runIcon(run.status),
        // Carried verbatim: the chips select on this, never on the tone.
        status: run.status,
        needsReview: needsReview(run, approvals.approvals),
        tone: row.tone,
        title: row.name,
        desc: removedFlows.has(run.subscriptionId) ? `${row.meta} · ${RUN_FLOW_ARCHIVED}` : row.meta,
        time: row.time,
      };
    };
    return {
      today: grouped.today.map(toRow),
      yesterday: grouped.yesterday.map(toRow),
      earlier: grouped.earlier.map(toRow),
      subscriptions: subscriptions.subscriptions,
    };
  });

  const live = activity.status === 'ready' ? activity.data : null;
  // The scope narrows what is shown, never what was read (24.9.2); a chosen flow
  // narrows it further (24.11.9), and the two empties stay distinct.
  const inScope = (items: ActivityItem[]) => (live ? scopeRuns(items, live.subscriptions, projectId) : []);
  const inFlow = (items: ActivityItem[]) => (flow ? items.filter((item) => item.subscriptionId === flow.id) : items);
  const scopedToday = inScope(live ? live.today : []);
  const scopedYesterday = inScope(live ? live.yesterday : []);
  const scopedEarlier = inScope(live ? live.earlier : []);
  const sourceToday = inFlow(scopedToday);
  const sourceYesterday = inFlow(scopedYesterday);
  const sourceEarlier = inFlow(scopedEarlier);

  const today = sourceToday.filter((i) => matchesFilter(i, filter));
  // Today only, while a Home tile's chip is on: the runs its number counted.
  const yesterday = todayOnly ? [] : sourceYesterday.filter((i) => matchesFilter(i, filter));
  // The website's Activity is every run in the workspace; the two day sections
  // are a grouping of it. Older runs sit under EARLIER rather than vanishing —
  // the first TestFlight build showed "No activity yet" to a workspace with 13
  // runs, all older than two days (24.7.3 attempt 1, feedback #3).
  const earlier = todayOnly ? [] : sourceEarlier.filter((i) => matchesFilter(i, filter));
  const isEmpty = today.length === 0 && yesterday.length === 0 && earlier.length === 0;
  /** Nothing at all, as opposed to nothing matching a filter. */
  const hasNoRuns =
    live !== null && live.today.length === 0 && live.yesterday.length === 0 && live.earlier.length === 0;
  /** The workspace has runs, the chosen project has none. */
  const scopeIsEmpty =
    !hasNoRuns && scopedToday.length === 0 && scopedYesterday.length === 0 && scopedEarlier.length === 0;

  if (activity.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (activity.status === 'offline') {
    return <ScreenOffline onRetry={() => activity.reload()} topInset={insets.top} />;
  }
  if (activity.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('activity')} topInset={insets.top} />;
  }
  if (activity.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('activity')}
        onRetry={() => activity.reload()}
        body={busyBody(activity)}
        topInset={insets.top}
      />
    );
  }
  if (hasNoRuns) {
    // The first-run empty, distinct from the filtered one below: the old copy
    // read "No … runs in the last two days", which assumes a filter and reads as
    // nonsense for a workspace that has never run anything.
    return (
      <ScreenEmpty
        icon={<CheckCircle size={40} color={status.ok} />}
        title={ACTIVITY_EMPTY_TITLE}
        body={ACTIVITY_EMPTY_BODY}
        action={{ label: ADD_FLOW_LABEL, onPress: () => router.push('/(tabs)/flows/add') }}
        topInset={insets.top}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      <ScopeControl />
      <Text style={[styles.h1, { color: palette.text }]}>Activity</Text>
      {/* What a tile chose — the flow, or today — on a row of its own above the
          outcomes: a fifth chip beside the four runs off a phone's width
          (the owner's build 12 item 1). Each clears itself. */}
      {flow || todayOnly ? (
        <View style={styles.filters} testID="activity-selection">
          {flow ? (
            <FilterChip
              key="flow"
              label={`${flow.name} ✕`}
              active
              onPress={() => setFlow(null)}
            />
          ) : null}
          {todayOnly ? (
            <FilterChip key="today" label="Today ✕" active onPress={() => setTodayOnly(false)} />
          ) : null}
        </View>
      ) : null}
      <View style={styles.filters} testID="activity-outcomes">
        {ACTIVITY_FILTERS.map((f) => (
          <FilterChip
            key={f}
            label={f}
            active={f === filter}
            onPress={() => setFilter(f as ActivityFilter)}
          />
        ))}
      </View>
      {today.length > 0 ? <ActivitySection label="TODAY" items={today} /> : null}
      {yesterday.length > 0 ? <ActivitySection label="YESTERDAY" items={yesterday} /> : null}
      {earlier.length > 0 ? <ActivitySection label="EARLIER" items={earlier} /> : null}
      {scopeIsEmpty ? (
        <View style={styles.emptyWrap}>
          <CheckCircle size={38} color={palette.neutral[600]} />
          <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>{ACTIVITY_SCOPE_EMPTY}</Text>
        </View>
      ) : isEmpty && (filter !== 'All' || flow || todayOnly) ? (
        <View style={styles.emptyWrap}>
          <CheckCircle size={38} color={palette.neutral[600]} />
          <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>{emptyLine(filter, flow, todayOnly)}</Text>
        </View>
      ) : null}
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
    fontSize: typeScale.display.fontSize,
    letterSpacing: em(-0.015, typeScale.display.fontSize),
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionCard: {
    marginTop: 9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
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
    fontSize: typeScale.label.fontSize,
  },
  rowDesc: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  rowTime: {
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
  },
  emptyWrap: {
    paddingVertical: 56,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
    textAlign: 'center',
  },
});
