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
  Plus,
  Sparkle,
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
import { ScopeControl } from '@/components/scope-control';
import { StatTileButton } from '@/components/stat-tile-button';
import { em, fonts, layout, status, typeScale, withAlpha } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { ADD_FLOW_LABEL } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { localMidnight, readAllApprovals, readRunStats, readRuns, readSubscriptions } from '@/lib/platform/runs';
import { toStatTiles, type StatTileView } from '@/lib/view/catalog';
import { catalogIndex, toRunRows } from '@/lib/view/runs';
import { scopeApprovals, scopeRuns, scopeStats } from '@/lib/view/scope';

/** Skeleton layout while the dashboard loads (design sHomeLoad). */
function HomeLoading({ paddingTop }: { paddingTop: number }) {
  return (
    <View style={[styles.content, { paddingTop }]}>
      <View style={styles.headerRow} testID="home-header">
        <BrandMark height={HOME_MARK_HEIGHT} testID="home-mark" />
        <View style={styles.headerActions}>
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

/** First-run empty dashboard (design sHomeEmpty). */
function HomeEmpty({ paddingTop, initials }: { paddingTop: number; initials: string }) {
  const { palette } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.stateRoot, { paddingTop, backgroundColor: palette.bg }]}>
      <View style={styles.headerRow} testID="home-header">
        <BrandMark height={HOME_MARK_HEIGHT} testID="home-mark" />
        <View style={styles.headerActions}>
          <View style={[styles.bellButton, { borderColor: palette.neutral[800] }]}>
            <Bell size={19} color={palette.neutral[300]} weight="regular" />
          </View>
          <AvatarBadge initials={initials} />
        </View>
      </View>
      <View style={styles.stateCenter}>
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
    </View>
  );
}

/** Connection-failure state (design sHomeErr). */
function HomeError({
  paddingTop,
  initials,
  onRetry,
}: {
  paddingTop: number;
  initials: string;
  onRetry: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.stateRoot, { paddingTop, backgroundColor: palette.bg }]}>
      <View style={styles.headerRow} testID="home-header">
        <BrandMark height={HOME_MARK_HEIGHT} testID="home-mark" />
        <AvatarBadge initials={initials} />
      </View>
      <View style={styles.stateCenter}>
        <View style={[styles.errorHero, { borderColor: palette.neutral[800] }]}>
          <WifiSlash size={36} color={palette.neutral[400]} />
        </View>
        <Text style={[styles.errorTitle, { color: palette.text }]}>Can&apos;t reach Autom8x</Text>
        <Text style={[styles.errorBody, { color: palette.neutral[400] }]}>
          Check your connection. Your agents keep running in the cloud and will sync when
          you&apos;re back.
        </Text>
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
 * this number and the room it leaves the two buttons at 320 pt.
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
   * The three stat tiles, from `run-stats` windowed to this morning.
   *
   * §12.1 #73b: `homeStats` is not published as such, and the substitute it names
   * is `run-stats?since=<local midnight>` reading `total`, `succeeded`, `failed`.
   * Windowed locally because "Runs today" is a local idea — Auckland and Los
   * Angeles do not share a midnight — and `localMidnight()` is the one place that
   * converts that boundary to the UTC instant the API wants.
   *
   * Home keeps its own bespoke loading and error states rather than the shared
   * ones. The five reads resolve atomically so no partial dashboard can combine
   * fresh counts with stale or absent activity; the scope then narrows what is
   * shown, never what was read (24.9.2).
   */
  const dashboard = useWorkspaceResource(async (workspaceId) => {
    const [stats, runs, catalog, approvals, subscriptions] = await Promise.all([
      readRunStats(workspaceId, localMidnight()),
      readRuns(workspaceId),
      readCatalog(workspaceId),
      readAllApprovals(workspaceId),
      readSubscriptions(workspaceId),
    ]);
    return {
      stats,
      runs: runs.runs,
      index: catalogIndex(catalog.automations),
      // Every approval is read so a held run's row can say how it was decided;
      // the banner counts the pending ones only.
      approvals: approvals.approvals,
      subscriptions: subscriptions.subscriptions,
      // Whether this workspace has set anything up, ever: the catalog's flag
      // counts every subscription it holds, in any project, archived ones too.
      // Not the subscription list, which shows only what this person can see —
      // a member outside a project would get the first-run screen over runs
      // and approvals they CAN see. Runs an archived automation made still
      // belong on the dashboard.
      hasSubscriptions: catalog.automations.some((automation) => automation.subscribed),
    };
  });

  if (dashboard.status === 'loading') return <HomeLoading paddingTop={paddingTop} />;
  if (dashboard.status !== 'ready') {
    return <HomeError paddingTop={paddingTop} initials={initials} onRetry={() => dashboard.reload()} />;
  }
  if (!dashboard.data.hasSubscriptions) {
    return <HomeEmpty paddingTop={paddingTop} initials={initials} />;
  }

  const { stats, runs, index, approvals, subscriptions } = dashboard.data;
  const counts = scopeStats(stats, subscriptions, projectId);
  const tiles: StatTileView[] = toStatTiles(counts);
  const scopedRuns = scopeRuns(runs, subscriptions, projectId);
  const runRows = toRunRows(scopedRuns.slice(0, 4), index, Date.now(), approvals);
  const pending = scopeApprovals(
    approvals.filter((approval) => approval.status === 'pending'),
    subscriptions,
    projectId,
  );
  const approvalCount = pending.length;
  const hasAttention = approvalCount > 0 || scopedRuns.some((run) => run.status === 'failed');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.headerRow} testID="home-header">
        <BrandMark height={HOME_MARK_HEIGHT} testID="home-mark" />
        <View style={styles.headerActions}>
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
            {hasAttention ? <View style={[styles.bellDot, { backgroundColor: palette.accent }]} /> : null}
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

      {/* The scope: the workspace, and the project looked at (24.9.2). */}
      <ScopeControl />

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
        <Text
          style={{
            marginTop: 5,
            fontFamily: fonts.regular,
            fontSize: typeScale.body.fontSize,
            color: palette.neutral[400],
          }}>
          Your agents ran {counts.total.toLocaleString()} tasks today.
        </Text>
      </View>

      {/* Stats: today's, and said so over the row (the owner's build 12 item 1). */}
      <View>
        <SectionLabel>TODAY</SectionLabel>
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
      </View>

      {/* Approvals banner */}
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

      {/* Quick actions */}
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

      {/* Recent runs */}
      <View>
        <View style={styles.sectionHeader}>
          <SectionLabel>RECENT RUNS</SectionLabel>
          <Text
            onPress={pressed(() => router.push('/(tabs)/activity'))}
            suppressHighlighting
            style={{
              fontFamily: fonts.regular,
              fontSize: typeScale.small.fontSize,
              color: palette.accentRamp[300],
            }}>
            See all
          </Text>
        </View>
        <SurfaceCard level="sm" style={styles.runsCard}>
          {runRows.map((r) => (
            <Pressable
              key={r.runId}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/(home)/run',
                  params: { runId: r.runId },
                })
              }
              style={({ pressed }) => [
                styles.runRow,
                { borderBottomColor: palette.divider },
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
          {runRows.length === 0 ? (
            <Text style={[styles.noRuns, { color: palette.neutral[500] }]}>No runs in this team yet.</Text>
          ) : null}
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
    borderBottomWidth: 1,
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
