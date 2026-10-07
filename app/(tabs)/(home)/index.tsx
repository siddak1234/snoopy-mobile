import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowClockwise,
  Bell,
  CaretRight,
  FlowArrow,
  HandPalm,
  Plugs,
  Plus,
  Sparkle,
  UsersThree,
  WarningCircle,
  WifiSlash,
} from 'phosphor-react-native';

import { AvatarBadge } from '@/components/nocturne/avatar-badge';
import { BrandMark } from '@/components/nocturne/brand-mark';
import { IconTile } from '@/components/nocturne/icon-tile';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { Skeleton } from '@/components/nocturne/skeleton';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable, pressed } from '@/components/pressable';
import { ScopeIcons } from '@/components/scope-control';
import { SettingsRow } from '@/components/settings/settings-row';
import { StatTileButton } from '@/components/stat-tile-button';
import { em, fonts, layout, status, typeScale, withAlpha } from '@/constants/theme';
import { useWorkspaceResource, type ResourceState } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { activeWorkspaceId, roleIn, useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import {
  ADD_FLOW_LABEL,
  FIGURE_UNAVAILABLE,
  HOME_NO_TEAMS,
  HOME_OFFLINE_BODY,
  HOME_OFFLINE_TITLE,
  PLATFORM_BUSY_TITLE,
  PLATFORM_FAILED_TITLE,
  RECENT_RUNS_UNAVAILABLE,
  TEAMS_UNAVAILABLE,
  UNAVAILABLE_BODY,
  sessionKeptBody,
} from '@/lib/content/screen-states';
import { teamTypeIcon } from '@/lib/content/team-types';
import { readCatalog, readConnections } from '@/lib/platform/catalog';
import { readInbox } from '@/lib/platform/notifications';
import { readAccessibleProjects } from '@/lib/platform/projects';
import {
  localMidnight,
  readAllApprovals,
  readApprovals,
  readRunStats,
  readRuns,
  readSubscriptions,
} from '@/lib/platform/runs';
import { toStatTiles, type StatTileView } from '@/lib/view/catalog';
import { flowsFigure, homeFailure, homeTeams, integrationsFigure } from '@/lib/view/home';
import { administers } from '@/lib/view/roles';
import { catalogIndex, toRunRows } from '@/lib/view/runs';
import { scopeRuns, scopeStats } from '@/lib/view/scope';

/**
 * Skeleton layout while the dashboard loads (design sHomeLoad): a circle for
 * each of the header's four buttons — the workspace, the team, the bell and the
 * avatar since build 14 — so nothing moves when it loads.
 */
function HomeLoading({ paddingTop }: { paddingTop: number }) {
  return (
    <View style={[styles.content, { paddingTop }]}>
      <View style={styles.headerRow} testID="home-header">
        <BrandMark height={HOME_MARK_HEIGHT} testID="home-mark" />
        <View style={styles.headerActions} testID="home-header-actions">
          <Skeleton width={38} height={38} borderRadius={999} />
          <Skeleton width={38} height={38} borderRadius={999} />
          <Skeleton width={38} height={38} borderRadius={999} />
          <Skeleton width={38} height={38} borderRadius={999} />
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Skeleton width={96} height={10} />
        <Skeleton width={214} height={22} borderRadius={8} delay={100} />
        <Skeleton width={164} height={12} delay={200} />
      </View>
      <View style={styles.statsRow}>
        <Skeleton flex height={64} borderRadius={14} />
        <Skeleton flex height={64} borderRadius={14} delay={120} />
        <Skeleton flex height={64} borderRadius={14} delay={240} />
      </View>
      <Skeleton height={68} borderRadius={14} delay={300} />
      <View style={{ gap: 8 }}>
        <Skeleton height={58} borderRadius={14} delay={360} />
        <Skeleton height={58} borderRadius={14} delay={480} />
        <Skeleton height={58} borderRadius={14} delay={600} />
      </View>
    </View>
  );
}

/**
 * Home's header, with flows or none: the mark, then the scope as two icons (the
 * owner's build 13 decision 2), the bell and the avatar — every one a button.
 */
function HomeHeader({ initials, hasAttention }: { initials: string; hasAttention: boolean }) {
  const { palette } = useTheme();
  const router = useRouter();
  return (
    <View style={styles.headerRow} testID="home-header">
      <BrandMark height={HOME_MARK_HEIGHT} testID="home-mark" />
      <View style={styles.headerActions} testID="home-header-actions">
        <ScopeIcons />
        <Pressable
          onPress={() => router.push('/(tabs)/(home)/notifications')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={({ pressed }) => [
            styles.bellButton,
            { borderColor: palette.neutral[800] },
            pressed && { backgroundColor: withAlpha(palette.text, 0.07) },
          ]}>
          <Bell size={19} color={palette.neutral[300]} weight="regular" />
          {hasAttention ? (
            <View testID="home-bell-dot" style={[styles.bellDot, { backgroundColor: palette.accent }]} />
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => router.push('/(tabs)/settings')}
          accessibilityRole="button"
          accessibilityLabel="Account and settings"
          style={({ pressed }) => pressed && { opacity: 0.85 }}>
          <AvatarBadge initials={initials} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The first run (design sHomeEmpty), where RECENT RUNS goes: since the owner's
 * build 13 decision 5 the dashboard is drawn as it is with flows — the header's
 * buttons, the greeting, TODAY at 0 — and this says there is nothing yet, with
 * its one way in. Until then it was a screen of its own, whose bell and avatar
 * were drawn but were not buttons. The quick actions' pills are not drawn with
 * it: their Add a flow would sit just over this one. The website's other two,
 * Connect integration and View teams, are (Gate 24 parity, G5).
 */
function HomeFirstRun() {
  const { palette } = useTheme();
  const router = useRouter();
  return (
    <View style={styles.firstRun} testID="home-first-run">
      <View
        style={[
          styles.emptyHero,
          {
            borderColor: palette.accentRamp[700],
            backgroundColor: withAlpha(palette.accent, 0.1),
          },
        ]}>
        <Sparkle size={40} color={palette.accentRamp[300]} />
      </View>
      <Text style={[styles.stateTitle, { color: palette.text }]}>Nothing automated. Yet.</Text>
      <Text style={[styles.stateBody, { color: palette.neutral[400] }]}>
        Add a prebuilt flow and your first agent is running in minutes — no building required.
      </Text>
      <PillButton
        label={ADD_FLOW_LABEL}
        variant="primary"
        height={48}
        icon={Plus}
        iconSize={18}
        onPress={() => router.push('/(tabs)/flows/add')}
        style={styles.stateCta}
      />
    </View>
  );
}

/**
 * Home's own failure (design sHomeErr), when nothing on it could be read, in
 * the words of what happened (Gate 24 parity, G3): offline, the design's — the
 * one case "Check your connection" is true of; busy, the website's title and
 * the wait it stated; refused or failed, the website's title; those two saying
 * the person was not signed out. No backend or no workspace offers no Retry,
 * which could not succeed (`UNAVAILABLE_BODY`, as every other screen's
 * unavailable state).
 */
function HomeError({
  state,
  paddingTop,
  initials,
  onRetry,
}: {
  state: Exclude<ResourceState<unknown>, { status: 'loading' | 'ready' }>;
  paddingTop: number;
  initials: string;
  onRetry: () => void;
}) {
  const { palette } = useTheme();
  const offline = state.status === 'offline';
  const title =
    offline || state.status === 'unconfigured'
      ? HOME_OFFLINE_TITLE
      : state.busy
        ? PLATFORM_BUSY_TITLE
        : PLATFORM_FAILED_TITLE;
  const body = offline
    ? HOME_OFFLINE_BODY
    : state.status === 'unconfigured'
      ? UNAVAILABLE_BODY
      : sessionKeptBody(state.busy ? state.retryAfterSeconds : undefined);
  return (
    <View style={[styles.stateRoot, { paddingTop, backgroundColor: palette.bg }]}>
      <View style={styles.headerRow} testID="home-header">
        <BrandMark height={HOME_MARK_HEIGHT} testID="home-mark" />
        <AvatarBadge initials={initials} />
      </View>
      <View style={styles.stateCenter} testID={`home-failure-${state.status}`}>
        <View style={[styles.errorHero, { borderColor: palette.neutral[800] }]}>
          {offline ? (
            <WifiSlash size={36} color={palette.neutral[400]} />
          ) : (
            <WarningCircle size={36} color={palette.neutral[400]} />
          )}
        </View>
        <Text style={[styles.errorTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.errorBody, { color: palette.neutral[400] }]}>{body}</Text>
        {state.status === 'unconfigured' ? null : (
          <PillButton
            label="Retry"
            variant="primary"
            height={44}
            fontSize={typeScale.label.fontSize}
            icon={ArrowClockwise}
            iconSize={16}
            gap={8}
            onPress={onRetry}
            style={styles.retryBtn}
          />
        )}
      </View>
    </View>
  );
}

/** The Activity chip each stat tile opens: a tone is an outcome here (24.11.9). */
/**
 * The mark fills its row (the owner's D9, 2026-10-03: "should fill up that empty
 * space top left"): the row is as tall as the bell and the avatar, 38, so the
 * mark is 38 — the design drew 17 — and nothing else moves. Wider than 38 would
 * make the row taller and push everything below; the header test holds both
 * this number and the room it leaves the buttons at 320 pt — four since build
 * 14, the scope's two icons beside the bell and the avatar.
 */
const HOME_MARK_HEIGHT = 38;

const OUTCOME_FILTER: Record<StatTileView['tone'], 'All' | 'Success' | 'Failed'> = {
  text: 'All',
  ok: 'Success',
  err: 'Failed',
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const { projectId } = useScope();
  const paddingTop = insets.top + (layout.designTop.app - layout.statusArea);

  const currentSession = session.status === 'signed-in' ? session.session : null;
  const identity = currentSession?.user.displayName?.trim() || currentSession?.user.email || 'Account';
  const firstNameSource = currentSession?.user.displayName?.trim().split(/\s+/u)[0]
    || currentSession?.user.email.split('@')[0]
    || 'there';
  const firstName = firstNameSource === 'there'
    ? firstNameSource
    : `${firstNameSource.charAt(0).toUpperCase()}${firstNameSource.slice(1)}`;
  const initials = identity
    .split(/\s+|@/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';

  /**
   * Home's reads, each a figure of its own (Gate 24 parity, G6).
   *
   * The three stat tiles are `run-stats` windowed to this morning. §12.1 #73b:
   * `homeStats` is not published as such, and the substitute it names is
   * `run-stats?since=<local midnight>` reading `total`, `succeeded`, `failed`.
   * Windowed locally because "Runs today" is a local idea — Auckland and Los
   * Angeles do not share a midnight — and `localMidnight()` is the one place that
   * converts that boundary to the UTC instant the API wants.
   *
   * Home keeps its own bespoke loading and error states rather than the shared
   * ones. Each read stands alone, as the website's dashboard reads each figure
   * (`readOverview`): one the platform refuses or cannot answer says so in its
   * place and the rest still show — until Gate 24 the five reads resolved
   * together and one refusal took the whole of Home with it. Only when none of
   * the workspace's reads answered is Home its own failure, worded by why (G3);
   * a return whose re-read fails that way keeps what was on screen
   * (`useResource`), and nothing stale is mixed with what was just read: a
   * figure whose re-read fails says so. The scope then narrows what
   * is shown, never what was read (24.9.2). Beside them, the inbox's unread
   * count is the bell's alone (decision 3A): a refused read of it costs the dot,
   * never the dashboard; and the teams, every workspace's (G7), are the teams
   * block's alone.
   */
  const dashboard = useWorkspaceResource(async (workspaceId) => {
    const [reads, teams, unread] = await Promise.all([
      Promise.allSettled([
        readRunStats(workspaceId, localMidnight()),
        readRuns(workspaceId),
        readCatalog(workspaceId),
        readAllApprovals(workspaceId),
        readApprovals(workspaceId, 'pending'),
        readSubscriptions(workspaceId),
        readConnections(workspaceId),
      ]),
      readAccessibleProjects().then(
        ({ items }) => items,
        () => null,
      ),
      readInbox(workspaceId).then(
        (inbox) => inbox.unreadCount,
        () => 0,
      ),
    ]);
    const refusals = reads.flatMap((read) => (read.status === 'rejected' ? [read.reason] : []));
    if (refusals.length === reads.length) throw homeFailure(refusals);
    const [stats, runs, catalog, approvals, pending, subscriptions, connections] = reads;
    const answer = <T,>(read: PromiseSettledResult<T>): T | null => (read.status === 'fulfilled' ? read.value : null);
    return {
      stats: answer(stats),
      runs: answer(runs)?.runs ?? null,
      // The catalog names each run; whether this workspace has set anything up,
      // ever, is its flag — `subscribed` counts every subscription it holds, in
      // any team, archived ones too. Not the subscription list, which shows
      // only what this person can see — a member outside a team would get the
      // first-run screen over runs and approvals they CAN see. Runs an archived
      // flow made still belong on the dashboard.
      catalog: answer(catalog)?.automations ?? null,
      // Every approval is read so a held run's row can say how it was decided.
      approvals: answer(approvals)?.approvals ?? null,
      // The banner's count: what Approvals lists (G1).
      pending: answer(pending)?.approvals ?? null,
      subscriptions: answer(subscriptions)?.subscriptions ?? null,
      connections: answer(connections)?.connections ?? null,
      teams,
      unread,
    };
  });

  if (dashboard.status === 'loading') return <HomeLoading paddingTop={paddingTop} />;
  if (dashboard.status !== 'ready') {
    return (
      <HomeError state={dashboard} paddingTop={paddingTop} initials={initials} onRetry={() => dashboard.reload()} />
    );
  }

  const { stats, runs, catalog, approvals, pending, subscriptions, connections, teams, unread } = dashboard.data;
  // A team narrows through the subscriptions (24.9.2): without them, what a
  // chosen team's figures are cannot be told, and they read as unavailable.
  const scopable = projectId === null || subscriptions !== null;
  const counts = stats !== null && scopable ? scopeStats(stats, subscriptions ?? [], projectId) : null;
  const tiles: StatTileView[] | null = counts ? toStatTiles(counts) : null;
  // Without every approval a held run's row says it is held, never how it was decided.
  const runRows =
    runs !== null && scopable
      ? toRunRows(
          scopeRuns(runs, subscriptions ?? [], projectId).slice(0, 4),
          catalogIndex(catalog ?? []),
          Date.now(),
          approvals ?? undefined,
        )
      : null;
  // Every pending approval in the workspace, whatever team is chosen: what
  // Approvals lists, and what the website's Approvals counts (`listApprovals(
  // workspaceId, "pending")`) — until Gate 24 the chosen team's only (G1). A
  // refused read draws no banner: the banner says something waits (the owner,
  // build 13 #3), and that is not known.
  const approvalCount = pending?.length ?? 0;
  // With no flow set up, ever — the catalog's flag, so a catalog that could not
  // be read claims nothing — the first run takes the place of the runs below.
  const firstRun = catalog !== null && !catalog.some((automation) => automation.subscribed);
  const teamRows = teams === null ? null : homeTeams(teams);
  // Only an owner or admin makes a team (backend 24.12.1), so the website offers Create to them alone.
  const canCreateTeam = administers(roleIn(session, activeWorkspaceId(session)));
  // The bell says the inbox holds something unread — the platform's read state,
  // the same on every device (decision 3A), and the whole workspace's, as the
  // inbox is — not merely that something is held or failed.
  const hasAttention = unread > 0;
  const caret = <CaretRight size={15} color={palette.neutral[500]} />;
  const linkStyle = {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
    color: palette.accentRamp[300],
  };
  const lineStyle = [styles.noRuns, { color: palette.neutral[500] }];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      {/* Header — the scope is its two icons now, beside the bell; the labelled
          pills under it went (the owner's build 13 decision 2). */}
      <HomeHeader initials={initials} hasAttention={hasAttention} />

      {/* Greeting */}
      <View>
        <SectionLabel track={0.26} color={palette.accentRamp[300]}>
          AUTOMATION × AI
        </SectionLabel>
        <Text
          style={{
            marginTop: 8,
            fontFamily: fonts.medium,
            fontSize: typeScale.display.fontSize,
            letterSpacing: em(-0.015, typeScale.display.fontSize),
            color: palette.text,
          }}>
          Welcome back, {firstName}
        </Text>
        {counts ? (
          <Text
            style={{
              marginTop: 5,
              fontFamily: fonts.regular,
              fontSize: typeScale.body.fontSize,
              color: palette.neutral[400],
            }}>
            Your agents ran {counts.total.toLocaleString()} tasks today.
          </Text>
        ) : null}
      </View>

      {/* Stats: today's, and said so over the row (the owner's build 12 item 1). */}
      <View>
        <SectionLabel>TODAY</SectionLabel>
        {tiles ? (
          <View style={[styles.statsRow, styles.statsUnderLabel]} testID="home-stats">
            {/* A tile opens Activity for that outcome AND today — the runs it counts (24.11.9; build 12 item 1). */}
            {tiles.map((s) => (
              <StatTileButton
                key={s.label}
                testID={`stat-${OUTCOME_FILTER[s.tone]}`}
                accessibilityLabel={`${s.label}: see these runs in Activity`}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/activity',
                    params: { filter: OUTCOME_FILTER[s.tone], period: 'today' },
                  })
                }
                value={s.value}
                label={s.label}
                valueColor={s.tone === 'ok' ? status.ok : s.tone === 'err' ? status.err : undefined}
              />
            ))}
          </View>
        ) : (
          // Today's counts could not be read: said in their place (G6).
          <SurfaceCard level="sm" style={styles.runsCard}>
            <Text testID="home-stats-unavailable" style={lineStyle}>
              {FIGURE_UNAVAILABLE}
            </Text>
          </SurfaceCard>
        )}
      </View>

      {/* The website's overview beside TODAY (Gate 24 parity, G6): the flows —
          in the team chosen, as the tiles are — and the integrations, each its
          own read and "Unavailable" on its own. Figures, as the website's are,
          not buttons: the quick actions below are the ways to both. */}
      <View>
        <SectionLabel>OVERVIEW</SectionLabel>
        <SurfaceCard level="sm" style={styles.runsCard}>
          <SettingsRow
            icon={FlowArrow}
            title="Flows"
            value={flowsFigure(subscriptions, projectId)}
            testID="home-flows"
            divider
            right={null}
          />
          <SettingsRow
            icon={Plugs}
            title="Integrations"
            value={integrationsFigure(connections)}
            testID="home-integrations"
            right={null}
          />
        </SurfaceCard>
      </View>

      {/* Approvals banner — only when something waits (the owner, build 13 #3). At 0
          Approvals would show its own empty state, so nothing is lost. */}
      {approvalCount > 0 ? (
        <Pressable
          onPress={() => router.push('/(tabs)/activity/approvals')}
          style={({ pressed }) => [
            styles.approvalsBanner,
            {
              borderColor: palette.accentRamp[700],
              backgroundColor: withAlpha(palette.accent, pressed ? 0.15 : 0.09),
            },
          ]}>
          <IconTile icon={HandPalm} size={40} iconSize={21} borderRadius={12} tint={0.16} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.medium, fontSize: typeScale.label.fontSize, color: palette.text }}>
              {approvalCount} {approvalCount === 1 ? 'item needs' : 'items need'} your review
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontFamily: fonts.regular,
                fontSize: typeScale.small.fontSize,
                color: palette.neutral[400],
              }}>
              Exceptions your agents held for judgment
            </Text>
          </View>
          <CaretRight size={16} color={palette.neutral[500]} weight="regular" />
        </Pressable>
      ) : null}

      {/* Quick actions. With no flow, the first run below has its own Add a
          flow, so the pills are not drawn over it; the website's other two
          (Gate 24 parity, G5) are drawn either way, as rows — "Connect
          integration" does not fit half a phone's width as a pill. */}
      <View style={styles.quickActions} testID="home-quick-actions">
        {firstRun ? null : (
          <View style={styles.actionsRow}>
            <PillButton
              label={ADD_FLOW_LABEL}
              variant="primary"
              height={46}
              fontSize={typeScale.label.fontSize}
              icon={Plus}
              iconSize={16}
              onPress={() => router.push('/(tabs)/flows/add')}
              style={{ flex: 1 }}
            />
            <PillButton
              label="Flows"
              variant="secondary"
              height={46}
              fontSize={typeScale.label.fontSize}
              icon={FlowArrow}
              iconSize={16}
              onPress={() => router.push('/(tabs)/flows')}
              style={{ flex: 1 }}
            />
          </View>
        )}
        <SurfaceCard level="sm">
          <SettingsRow
            icon={Plugs}
            title="Connect integration"
            testID="home-connect-integration"
            divider
            onPress={() => router.push('/(tabs)/settings/connections')}
            right={caret}
          />
          <SettingsRow
            icon={UsersThree}
            title="View teams"
            testID="home-view-teams"
            onPress={() => router.push('/(tabs)/settings/teams')}
            right={caret}
          />
        </SurfaceCard>
      </View>

      {firstRun ? (
        // No flow yet (the owner's build 13 decision 5): the first run, where the runs go.
        <HomeFirstRun />
      ) : (
        <View>
          <View style={styles.sectionHeader}>
            <SectionLabel>RECENT RUNS</SectionLabel>
            <Text onPress={pressed(() => router.push('/(tabs)/activity'))} suppressHighlighting style={linkStyle}>
              See all
            </Text>
          </View>
          <SurfaceCard level="sm" style={styles.runsCard}>
            {runRows === null ? (
              // The runs could not be read: said in their place, in the website's words (G6).
              <Text style={lineStyle}>{RECENT_RUNS_UNAVAILABLE}</Text>
            ) : null}
            {(runRows ?? []).map((r, i, rows) => (
              <Pressable
                key={r.runId}
                testID={`home-run-${r.runId}`}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/(home)/run',
                    params: { runId: r.runId },
                  })
                }
                style={({ pressed }) => [
                  styles.runRow,
                  // The last row draws no border: the card has no clip, so it would run
                  // square past the rounded corner (the owner, build 13 #7).
                  i < rows.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: palette.divider,
                  },
                  pressed && { backgroundColor: withAlpha(palette.text, 0.04) },
                ]}>
                <View
                  style={[
                    styles.runDot,
                    { backgroundColor: r.tone === 'ok' ? status.ok : status.warnText },
                  ]}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: typeScale.label.fontSize, color: palette.text }}>
                    {r.name}
                  </Text>
                  <Text
                    style={{
                      marginTop: 1,
                      fontFamily: fonts.regular,
                      fontSize: typeScale.small.fontSize,
                      color: palette.neutral[400],
                    }}>
                    {r.meta}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: fonts.regular,
                    fontSize: typeScale.caption.fontSize,
                    color: palette.neutral[500],
                  }}>
                  {r.time}
                </Text>
              </Pressable>
            ))}
            {runRows !== null && runRows.length === 0 ? (
              <Text style={lineStyle}>No runs in this team yet.</Text>
            ) : null}
          </SurfaceCard>
        </View>
      )}

      {/* The website's Teams (Gate 24 parity, G7): the first three teams this
          person can see, across their workspaces, each its kind and status — and
          its workspace when they span several — opening its page; View all teams
          beside the label, as See all is beside RECENT RUNS. */}
      <View>
        <View style={styles.sectionHeader}>
          <SectionLabel>TEAMS</SectionLabel>
          {teamRows !== null && teamRows.length > 0 ? (
            <Text
              onPress={pressed(() => router.push('/(tabs)/settings/teams'))}
              suppressHighlighting
              style={linkStyle}>
              View all teams
            </Text>
          ) : null}
        </View>
        <SurfaceCard level="sm" style={styles.runsCard}>
          {teamRows === null ? <Text style={lineStyle}>{TEAMS_UNAVAILABLE}</Text> : null}
          {teamRows !== null && teamRows.length === 0 ? (
            <View style={styles.noTeams}>
              <Text style={[styles.noTeamsText, { color: palette.neutral[500] }]}>{HOME_NO_TEAMS}</Text>
              {canCreateTeam ? (
                <PillButton
                  label="Create a team"
                  variant="secondary"
                  height={40}
                  fontSize={typeScale.body.fontSize}
                  icon={Plus}
                  iconSize={15}
                  testID="home-create-team"
                  onPress={() => router.push('/(tabs)/settings/teams')}
                />
              ) : null}
            </View>
          ) : null}
          {(teamRows ?? []).map((team, i, rows) => (
            <SettingsRow
              key={team.id}
              icon={teamTypeIcon(team.kind)}
              title={team.kind}
              value={team.status}
              sub={team.workspace ?? undefined}
              testID={`home-team-${team.id}`}
              divider={i < rows.length - 1}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/settings/team',
                  params: { projectId: team.id, workspaceId: team.workspaceId },
                })
              }
              right={caret}
            />
          ))}
        </SurfaceCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  // The tiles sit under TODAY as the runs card sits under RECENT RUNS.
  statsUnderLabel: {
    marginTop: 10,
  },
  approvalsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  // The pills and the rows under them read as one group, closer than the sections.
  quickActions: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  runsCard: {
    marginTop: 10,
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  runDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
  },
  noRuns: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
    textAlign: 'center',
    paddingVertical: 16,
  },
  // No team yet: the line, and Create a team under it for an owner or admin.
  noTeams: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  noTeamsText: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
    textAlign: 'center',
  },
  stateRoot: {
    flex: 1,
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
  },
  stateCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    textAlign: 'center',
    paddingHorizontal: 14,
  },
  // The first run's message, as the design centred it, in the runs' place on the page.
  firstRun: {
    alignItems: 'center',
    gap: 16,
    paddingTop: 12,
    paddingHorizontal: 14,
  },
  emptyHero: {
    width: 88,
    height: 88,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.015, typeScale.heading.fontSize),
    textAlign: 'center',
  },
  stateBody: {
    fontFamily: fonts.regular,
    ...typeScale.label,
    textAlign: 'center',
    maxWidth: 224,
  },
  stateCta: {
    marginTop: 8,
    alignSelf: 'stretch',
  },
  errorHero: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: typeScale.title.fontSize,
    letterSpacing: em(-0.01, typeScale.title.fontSize),
    textAlign: 'center',
  },
  errorBody: {
    fontFamily: fonts.regular,
    ...typeScale.body,
    textAlign: 'center',
    maxWidth: 224,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 26,
  },
});
