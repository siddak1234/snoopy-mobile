import type { NavigationProp } from '@react-navigation/native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { CalendarBlank, CaretRight, CheckCircle, Funnel, HandPalm } from 'phosphor-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NoMatch, Pager, SearchBox, SortControl } from '@/components/blocks/paged';
import { Dropdown } from '@/components/dropdown';
import { Group } from '@/components/group';
import { FilterChip } from '@/components/nocturne/filter-chip';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Page } from '@/components/page';
import { Pressable } from '@/components/pressable';
import { CircleButton, ScopePill } from '@/components/scope-control';
import { Text } from '@/components/text';
import { TitleRow } from '@/components/title-row';
import { ScreenEmpty, ScreenError, ScreenUnavailable, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts, inset, space, status, typeScale } from '@/constants/theme';
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
import { ACTIVITY_FILTERS, ACTIVITY_FILTER_LABEL, type ActivityItem } from '@/lib/content/screen-states';
import { BLOCK_WORDS } from '@/lib/generated/platform-contracts/block-rules';
import { readCatalog } from '@/lib/platform/catalog';
import {
  rangeStart,
  readAllApprovals,
  readApprovals,
  readRemovedSubscriptionsOrNone,
  readRunsPage,
  readSubscriptions,
  type RunRange,
  type RunsQuery,
} from '@/lib/platform/runs';
import { fill, isLong, pageCount } from '@/lib/view/block-sort';
import { catalogIndex, needsReview, runIcon, splitByDay, toRunRow } from '@/lib/view/runs';
import type { Run } from '@/lib/platform/automations';
import { scopeRuns } from '@/lib/view/scope';

/**
 * One run. Opens its run detail, as Home's RECENT RUNS and the inbox already do
 * (ROUND-7.5-OBSERVATIONS finding 2, BUILD-PLAN 24.4.4) — the rows were inert.
 * Under its line, the website's: the date and time it was made and the version
 * it ran (Gate 24's parity pass, G17); the time beside it stays the design's.
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
      onPress={() => router.push({ pathname: '/(tabs)/activity/run', params: { runId: item.id } })}
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
        <Text style={[styles.rowStamp, { color: palette.neutral[500] }]}>{item.stamp}</Text>
      </View>
      <Text style={[styles.rowTime, { color: palette.neutral[500] }]}>{item.time}</Text>
    </Pressable>
  );
}

function ActivitySection({ label, items }: { label: string; items: ActivityItem[] }) {
  return (
    <Group title={label}>
      {items.map((item, i) => (
        <ActivityRow key={item.id} item={item} last={i === items.length - 1} />
      ))}
    </Group>
  );
}

/** All four outcomes are filters (design actF — v3 ratified filtering and made
 *  "Needs review" filter held runs instead of navigating); one drop-down since
 *  round 23 (~~four chips~~). */
type ActivityFilter = 'All' | 'Success' | 'Needs review' | 'Failed';

/**
 * Each outcome as the platform selects it (Round 21; backend ADR-0048
 * amendment 1, point 4): Success `status=succeeded`, Failed `status=failed`,
 * and Needs review `needsReview=true` — held jobs nobody has decided, never
 * `status=held`, which lists a held run long after someone decided it (a run
 * stays held after its approval, because the approval starts a new run).
 * ~~`FILTER_STATUS` and `matchesFilter`, selected on the phone from the 100
 * newest~~ until Round 21: a page is never emptied by a filter now.
 */
function outcomeQuery(filter: ActivityFilter): Pick<RunsQuery, 'status' | 'needsReview'> {
  if (filter === 'Success') return { status: 'succeeded' };
  if (filter === 'Failed') return { status: 'failed' };
  if (filter === 'Needs review') return { needsReview: true };
  return {};
}

const EMPTY_LABEL: Record<Exclude<ActivityFilter, 'All'>, string> = {
  Success: 'successful',
  'Needs review': 'held',
  Failed: 'failed',
};

/** Activity's two orders (`BLOCK_WORDS`): newest first, today's, then oldest first. */
const RUN_ORDERS: readonly { value: RunsQuery['sort']; label: string }[] = [
  { value: 'newest', label: BLOCK_WORDS.newestFirst },
  { value: 'oldest', label: BLOCK_WORDS.oldestFirst },
];

/** How long typing rests before the search is sent. */
const SEARCH_REST_MS = 350;

const isActivityFilter = (value: unknown): value is ActivityFilter =>
  typeof value === 'string' && (ACTIVITY_FILTERS as readonly string[]).includes(value);

type ArrivalParams = { flow?: string; flowName?: string; filter?: string; period?: string };

/**
 * The time range's choices, as its drop-down lists them (the owner's build 13
 * decision 4: "Today / Week / Month"; a drop-down since round 23, ~~a card~~),
 * after All time — every run, which Activity opens on. A choice's name is the
 * button's label; the line under it says what it spans (`rangeStart`).
 */
const RANGES: readonly RunRange[] = ['all', 'today', 'week', 'month'];
const RANGE_LABEL: Record<RunRange, string> = { all: 'All time', today: 'Today', week: 'Week', month: 'Month' };
const RANGE_SPAN: Record<RunRange, string> = {
  all: 'Every run',
  today: 'Since midnight',
  week: 'The last 7 days',
  month: 'The last 30 days',
};
/** How an empty selection says its range. */
const RANGE_WORDS: Record<RunRange, string> = {
  all: '',
  today: ' today',
  week: ' in the last 7 days',
  month: ' in the last 30 days',
};

/**
 * What a tile on Home or a flow page arrived with (24.11.9): an outcome, and
 * perhaps a flow — or, from Home, today (the owner's build 12 item 1): Home's
 * tiles count today's runs, so the list a tile opens is today's, and its number
 * is the rows it opens. A flow page's tiles count all time, and bring All time.
 */
function arrivedWith(params: ArrivalParams): {
  filter: ActivityFilter;
  flow: { id: string; name: string } | null;
  range: RunRange;
} {
  return {
    filter: isActivityFilter(params.filter) ? params.filter : 'All',
    flow: params.flow ? { id: params.flow, name: params.flowName || 'this flow' } : null,
    range: params.period === 'today' ? 'today' : 'all',
  };
}

/** What an empty selection says: the outcome, the flow, and the range, as chosen. */
function emptyLine(filter: ActivityFilter, flow: { name: string } | null, range: RunRange): string {
  if (filter === 'All') {
    if (flow) return `No runs for ${flow.name}${range === 'all' ? ' yet' : RANGE_WORDS[range]}.`;
    return `No runs${RANGE_WORDS[range]}.`;
  }
  return `No ${EMPTY_LABEL[filter]} runs${flow ? ` for ${flow.name}` : ''}${RANGE_WORDS[range]}.`;
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
  // The time range (the owner's build 13 decision 4): All time — every run — on
  // opening; Today from a Home tile (build 12 item 1), All time from a flow
  // page's, whose tiles count all time. Chosen again from its button at any time,
  // where Today ✕ could only clear (build 13).
  const [range, setRange] = useState<RunRange>(() => arrivedWith(params).range);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  // The search, the order and the page (Round 21): the platform's, sent with
  // the outcome, the range and the flow; a new search, order or selection goes
  // back to page 1. The search is sent once typing rests.
  const [typed, setTyped] = useState('');
  const [searched, setSearched] = useState('');
  const [sort, setSort] = useState<RunsQuery['sort']>('newest');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => setSearched(typed.trim()), SEARCH_REST_MS);
    return () => clearTimeout(timer);
  }, [typed]);
  useEffect(() => setPage(1), [searched, filter, flow, range, sort]);
  useEffect(() => {
    if (!params.flow && !params.filter && !params.period) return;
    const arrived = arrivedWith(params);
    setFilter(arrived.filter);
    setFlow(arrived.flow);
    setRange(arrived.range);
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
   * What the rows are joined to, read once: the catalog for a display name
   * (`Run` publishes `templateId` and no name — the runs list's own description
   * calls that join intended client work), every approval for a held row's
   * words, the subscriptions for the scope (a run follows its flow's project,
   * 24.9.2), the archived flows, and the approvals waiting.
   */
  const activity = useWorkspaceResource(async (workspaceId) => {
    const [catalog, approvals, subscriptions, removed, pending] = await Promise.all([
      readCatalog(workspaceId),
      readAllApprovals(workspaceId),
      readSubscriptions(workspaceId),
      readRemovedSubscriptionsOrNone(workspaceId),
      // What Approvals lists, and what the website's sidebar counts — the
      // whole workspace's, whatever team is chosen, as Home's banner counts (G1).
      readApprovals(workspaceId, 'pending'),
    ]);
    return {
      index: catalogIndex(catalog.automations),
      approvals: approvals.approvals,
      subscriptions: subscriptions.subscriptions,
      removedFlows: new Set(removed.subscriptions.map((s) => s.id)),
      pending: pending.approvals.length,
    };
  });

  /**
   * The runs, one page of 25 as the platform selects them (Round 21,
   * `readRunsPage`): the search, the outcome, the range's start (`since`), the
   * flow a tile chose, the order and the page. Grouping is local-day, not UTC:
   * "Today" and "Yesterday" are the design's two sections and a person's own
   * midnight decides them. While a new page is read the last one stays on the
   * screen, so the search box keeps its place.
   */
  // Where the range begins, fixed when it is chosen: read again at each render,
  // a week back from "now" would name a new instant, and a new read, every time.
  const since = useMemo(() => rangeStart(range), [range]);
  const asked: RunsQuery = {
    ...(searched ? { q: searched } : {}),
    ...outcomeQuery(filter),
    ...(since ? { since: since.toISOString() } : {}),
    ...(flow ? { subscriptionId: flow.id } : {}),
    sort,
    page,
  };
  const key = JSON.stringify(asked);
  const runsRead = useWorkspaceResource((workspaceId) => readRunsPage(workspaceId, asked), [key]);
  const [shownRuns, setShownRuns] = useState<{ runs: Run[]; total?: number } | null>(null);
  useEffect(() => {
    if (runsRead.status === 'ready') setShownRuns(runsRead.data);
  }, [runsRead]);

  const base = activity.status === 'ready' ? activity.data : null;
  const toRow = (run: Run): ActivityItem => {
    const row = toRunRow(run, base!.index, Date.now(), base!.approvals);
    return {
      id: run.id,
      subscriptionId: run.subscriptionId,
      icon: runIcon(run.status),
      // Carried verbatim.
      status: run.status,
      needsReview: needsReview(run, base!.approvals),
      tone: row.tone,
      title: row.name,
      // A run whose flow was archived says so on its row (24.11.8).
      desc: base!.removedFlows.has(run.subscriptionId) ? `${row.meta} · ${RUN_FLOW_ARCHIVED}` : row.meta,
      time: row.time,
      stamp: row.stamp,
      createdAt: run.createdAt,
    };
  };
  const runs = shownRuns?.runs ?? [];
  const grouped = splitByDay(runs);
  // The scope narrows what is shown, never what was read (24.9.2).
  const inScope = (items: ActivityItem[]) => (base ? scopeRuns(items, base.subscriptions, projectId) : []);
  const today = base ? inScope(grouped.today.map(toRow)) : [];
  const yesterday = base ? inScope(grouped.yesterday.map(toRow)) : [];
  // The website's Activity is every run in the workspace; the two day sections
  // are a grouping of it. Older runs sit under EARLIER rather than vanishing —
  // the first TestFlight build showed "No activity yet" to a workspace with 13
  // runs, all older than two days (24.7.3 attempt 1, feedback #3).
  const earlier = base ? inScope(grouped.earlier.map(toRow)) : [];
  const isEmpty = today.length === 0 && yesterday.length === 0 && earlier.length === 0;
  const selecting = searched !== '' || filter !== 'All' || flow !== null || range !== 'all';
  /** Nothing at all, as opposed to nothing matching a selection. */
  const hasNoRuns = shownRuns !== null && !selecting && runs.length === 0 && page === 1;
  /** The workspace has runs on this page, the chosen project none of them. */
  const scopeIsEmpty = !hasNoRuns && runs.length > 0 && isEmpty;
  // Over 25 that match, the order and the pages (an answer without `total`, from
  // a platform before Round 21, is one page).
  const total = shownRuns?.total;
  const long = total !== undefined && isLong(total);
  const pages = total === undefined ? 1 : pageCount(total);
  // Oldest first, the oldest day first.
  const sections =
    sort === 'oldest'
      ? ([['EARLIER', earlier], ['YESTERDAY', yesterday], ['TODAY', today]] as const)
      : ([['TODAY', today], ['YESTERDAY', yesterday], ['EARLIER', earlier]] as const);

  // The screen's states come from the join's read and the first page; a later
  // page that fails keeps the rows on screen and says so under them.
  const first = shownRuns === null ? runsRead : null;
  const gate = activity.status !== 'ready' ? activity : first;
  const retry = () => {
    activity.reload();
    runsRead.reload();
  };
  if (gate?.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (gate?.status === 'offline') {
    return <ScreenOffline onRetry={retry} topInset={insets.top} />;
  }
  if (gate?.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('activity')} topInset={insets.top} />;
  }
  if (gate?.status === 'error') {
    return <ScreenError title={errorTitleFor('activity')} onRetry={retry} body={busyBody(gate)} topInset={insets.top} />;
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
    <Page>
      {/* The title, then Home's two scope circles and the time range on the
          right (round 23, A1; Build 22, F2–F3). The range says what is chosen
          and opens the four in a drop-down on it (the owner's build 22 items
          3–4; ~~a card~~, the owner's build 13 decision 4) — on a row too
          narrow for its words (a 320-pt phone), its calendar alone in a
          circle, read aloud the same (the Build 22 review's M11). */}
      <TitleRow
        title="Activity"
        right={(level) => (
          <Dropdown
            testID="activity-range"
            title="Time range"
            options={RANGES.map((option) => ({
              value: option,
              label: RANGE_LABEL[option],
              sub: RANGE_SPAN[option],
              icon: CalendarBlank,
              testID: `activity-range-${option}`,
            }))}
            value={range}
            open={rangeOpen}
            onOpenChange={setRangeOpen}
            onChange={(next) => {
              setRange(next);
              setRangeOpen(false);
            }}
            trigger={
              level >= 1 ? (
                <CircleButton
                  testID="activity-range"
                  icon={CalendarBlank}
                  accessibilityLabel={`Time range: ${RANGE_LABEL[range]}`}
                  onPress={() => setRangeOpen(true)}
                />
              ) : (
                <ScopePill
                  testID="activity-range"
                  icon={CalendarBlank}
                  label={RANGE_LABEL[range]}
                  accessibilityLabel={`Time range: ${RANGE_LABEL[range]}`}
                  onPress={() => setRangeOpen(true)}
                />
              )
            }
          />
        )}
      />
      {/* The permanent way into Approvals (the owner's decision at Gate 24's
          close, G1): the website's sidebar link with its count, here a row
          above the runs, drawn at 0 too — Home's banner shows only while
          something waits, so this is the one entry that is always there. */}
      <SurfaceCard>
        <SettingsRow
          icon={HandPalm}
          title="Approvals"
          value={`${base?.pending ?? 0} waiting`}
          right={<CaretRight size={15} color={palette.neutral[500]} />}
          testID="activity-approvals"
          onPress={() => router.push('/(tabs)/activity/approvals')}
        />
      </SurfaceCard>
      {/* The flow a flow page's tile chose, on a row of its own above the
          outcome (the owner's build 12 item 1). It clears itself. */}
      {flow ? (
        <View style={styles.filters} testID="activity-selection">
          <FilterChip key="flow" label={`${flow.name} ✕`} active onPress={() => setFlow(null)} />
        </View>
      ) : null}
      {/* The outcome, one drop-down where the four chips were (round 23, the
          owner's build 22 items 3–4): All runs, Success, Needs review, Failed. */}
      <View style={styles.filters} testID="activity-outcomes">
        <Dropdown
          testID="activity-outcome"
          title="Outcome"
          options={ACTIVITY_FILTERS.map((option) => ({ value: option, label: ACTIVITY_FILTER_LABEL[option] }))}
          value={filter}
          open={outcomeOpen}
          onOpenChange={setOutcomeOpen}
          onChange={(next) => {
            setFilter(next as ActivityFilter);
            setOutcomeOpen(false);
          }}
          trigger={
            <ScopePill
              testID="activity-outcome"
              icon={Funnel}
              label={ACTIVITY_FILTER_LABEL[filter]}
              accessibilityLabel={`Outcome: ${ACTIVITY_FILTER_LABEL[filter]}`}
              onPress={() => setOutcomeOpen(true)}
            />
          }
        />
      </View>
      {/* The search (Round 21, `BLOCK_WORDS.searchRuns`): the job's title, its summary and
          its documents' sellers, searched by the platform; the order, over 25. */}
      <SearchBox testID="activity-search" value={typed} onChange={setTyped} placeholder={BLOCK_WORDS.searchRuns} />
      {long ? <SortControl testID="activity-sort" choices={RUN_ORDERS} value={sort} onChange={(next) => setSort(next as RunsQuery['sort'])} /> : null}
      {sections.map(([label, items]) => (items.length > 0 ? <ActivitySection key={label} label={label} items={items} /> : null))}
      {scopeIsEmpty ? (
        <View style={styles.emptyWrap}>
          <CheckCircle size={38} color={palette.neutral[600]} />
          <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>{ACTIVITY_SCOPE_EMPTY}</Text>
        </View>
      ) : isEmpty && searched !== '' ? (
        <NoMatch testID="activity-no-match" text={fill(BLOCK_WORDS.noMatch, { query: searched })} />
      ) : isEmpty && selecting ? (
        <View style={styles.emptyWrap}>
          <CheckCircle size={38} color={palette.neutral[600]} />
          <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>{emptyLine(filter, flow, range)}</Text>
        </View>
      ) : null}
      {long ? <Pager testID="activity-pager" page={Math.min(page, pages)} pages={pages} onPage={setPage} /> : null}
      {shownRuns !== null && runsRead.status !== 'ready' && runsRead.status !== 'loading' ? (
        <Text accessibilityRole="alert" style={[styles.emptyText, { color: status.err }]}>
          {errorTitleFor('activity')}
        </Text>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    gap: space.inner,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.inner,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
  },
  rowIcon: {
    marginTop: inset.hair,
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
    marginTop: inset.hair,
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  rowStamp: {
    marginTop: inset.xxs,
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
  },
  rowTime: {
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
  },
  emptyWrap: {
    paddingVertical: space.bottom,
    alignItems: 'center',
    gap: space.inner,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
    textAlign: 'center',
  },
});
