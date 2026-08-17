import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowClockwise,
  Bell,
  CaretRight,
  HandPalm,
  Sparkle,
  SquaresFour,
  Storefront,
  WifiSlash,
} from 'phosphor-react-native';

import { AvatarBadge } from '@/components/nocturne/avatar-badge';
import { BrandMark } from '@/components/nocturne/brand-mark';
import { IconTile } from '@/components/nocturne/icon-tile';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { Skeleton } from '@/components/nocturne/skeleton';
import { StatCard } from '@/components/nocturne/stat-card';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { homeStats, recentRuns } from '@/lib/fixtures';
import { readCatalog } from '@/lib/platform/catalog';
import { localMidnight, readRunStats, readRuns } from '@/lib/platform/runs';
import { toStatTiles, type StatTileView } from '@/lib/view/catalog';
import { catalogIndex, toRunRows } from '@/lib/view/runs';

type HomeState = 'default' | 'loading' | 'empty' | 'error';

/** Skeleton layout while the dashboard loads (design sHomeLoad). */
function HomeLoading({ paddingTop }: { paddingTop: number }) {
  return (
    <View style={[styles.content, { paddingTop }]}>
      <View style={styles.headerRow}>
        <BrandMark height={17} />
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
function HomeEmpty({ paddingTop }: { paddingTop: number }) {
  const { palette } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.stateRoot, { paddingTop, backgroundColor: palette.bg }]}>
      <View style={styles.headerRow}>
        <BrandMark height={17} />
        <View style={styles.headerActions}>
          <View style={[styles.bellButton, { borderColor: palette.neutral[800] }]}>
            <Bell size={19} color={palette.neutral[300]} weight="regular" />
          </View>
          <AvatarBadge initials="AK" />
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
          Add a prebuilt solution and your first agent is running in minutes — no building
          required.
        </Text>
        <PillButton
          label="Browse solutions"
          variant="primary"
          height={48}
          icon={Storefront}
          iconSize={18}
          onPress={() => router.push('/(tabs)/solutions')}
          style={styles.stateCta}
        />
        <PillButton
          label="See how it works"
          variant="plain"
          height={44}
          fontSize={14.5}
          onPress={() => router.push('/(auth)/onboarding')}
          style={styles.stateSecondary}
        />
      </View>
    </View>
  );
}

/** Connection-failure state (design sHomeErr). */
function HomeError({ paddingTop }: { paddingTop: number }) {
  const { palette } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.stateRoot, { paddingTop, backgroundColor: palette.bg }]}>
      <View style={styles.headerRow}>
        <BrandMark height={17} />
        <AvatarBadge initials="AK" />
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
          fontSize={14}
          icon={ArrowClockwise}
          iconSize={16}
          gap={8}
          onPress={() => router.setParams({ state: undefined })}
          style={styles.retryBtn}
        />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  // Demo/dev entry into the designed data states until the API exists:
  // /(tabs)/(home)?state=loading|empty|error
  const { state } = useLocalSearchParams<{ state?: HomeState }>();
  const paddingTop = insets.top + (layout.designTop.app - layout.statusArea);

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
   * ones, so this does not gate the screen: `unconfigured` and any failure fall
   * through to the prototype's tiles, which is what keeps the design browsable.
   */
  const stats = useWorkspaceResource((workspaceId) =>
    readRunStats(workspaceId, localMidnight()),
  );
  const tiles: StatTileView[] =
    stats.status === 'ready' ? toStatTiles(stats.data.workspace) : homeStats;

  /**
   * Recent runs — now that a run's result line and a run detail both exist.
   *
   * This was the last thing on Home with no source: §12.1 #67 refuses run output,
   * and Round 6.6 published `resultSummary`/`failureReason` on the run itself as
   * the substitute, so the row's second line no longer needs a per-run detail
   * fetch. The name is the catalog join the runs list documents as intended.
   *
   * The design draws four rows.
   */
  const recent = useWorkspaceResource(async (workspaceId) => {
    const [runs, catalog] = await Promise.all([readRuns(workspaceId), readCatalog(workspaceId)]);
    return toRunRows(runs.runs.slice(0, 4), catalogIndex(catalog.automations));
  });
  const runRows =
    recent.status === 'ready'
      ? recent.data
      : recentRuns.map((r) => ({
          runId: '',
          name: r.name,
          meta: r.meta,
          time: r.time,
          tone: r.tone as 'ok' | 'warn',
          status: 'Success' as const,
          runVariant: r.runVariant,
        }));

  if (state === 'loading') return <HomeLoading paddingTop={paddingTop} />;
  if (state === 'empty') return <HomeEmpty paddingTop={paddingTop} />;
  if (state === 'error') return <HomeError paddingTop={paddingTop} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.headerRow}>
        <BrandMark height={17} />
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
            <View style={[styles.bellDot, { backgroundColor: palette.accent }]} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            accessibilityRole="button"
            accessibilityLabel="Account and settings"
            style={({ pressed }) => pressed && { opacity: 0.85 }}>
            <AvatarBadge initials="AK" />
          </Pressable>
        </View>
      </View>

      {/* Greeting */}
      <View>
        <SectionLabel track={0.26} color={palette.accentRamp[300]}>
          AUTOMATION × AI
        </SectionLabel>
        <Text
          style={{
            marginTop: 8,
            fontFamily: fonts.medium,
            fontSize: 26,
            letterSpacing: em(-0.015, 26),
            color: palette.text,
          }}>
          Welcome back, Alex
        </Text>
        <Text
          style={{
            marginTop: 5,
            fontFamily: fonts.regular,
            fontSize: 13.5,
            color: palette.neutral[400],
          }}>
          Your agents ran 128 tasks while you were away.
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {tiles.map((s) => (
          <StatCard
            key={s.label}
            value={s.value}
            label={s.label}
            valueColor={s.tone === 'ok' ? status.ok : s.tone === 'err' ? status.err : undefined}
          />
        ))}
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
          <Text style={{ fontFamily: fonts.medium, fontSize: 14.5, color: palette.text }}>
            3 items need your review
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontFamily: fonts.regular,
              fontSize: 12,
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
          label="Add a solution"
          variant="primary"
          height={46}
          fontSize={14}
          icon={Storefront}
          iconSize={16}
          onPress={() => router.push('/(tabs)/solutions')}
          style={{ flex: 1 }}
        />
        <PillButton
          label="Templates"
          variant="secondary"
          height={46}
          fontSize={14}
          icon={SquaresFour}
          iconSize={16}
          onPress={() => router.push('/(tabs)/flows/templates')}
          style={{ flex: 1 }}
        />
      </View>

      {/* Recent runs */}
      <View>
        <View style={styles.sectionHeader}>
          <SectionLabel>RECENT RUNS</SectionLabel>
          <Text
            onPress={() => router.push('/(tabs)/activity')}
            suppressHighlighting
            style={{
              fontFamily: fonts.regular,
              fontSize: 12.5,
              color: palette.accentRamp[300],
            }}>
            See all
          </Text>
        </View>
        <SurfaceCard level="sm" style={styles.runsCard}>
          {runRows.map((r, i) => (
            <Pressable
              key={i}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/(home)/run',
                  params: r.runId
                    ? { runId: r.runId }
                    : { variant: (r as { runVariant?: string }).runVariant },
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
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: palette.text }}>
                  {r.name}
                </Text>
                <Text
                  style={{
                    marginTop: 1,
                    fontFamily: fonts.regular,
                    fontSize: 12,
                    color: palette.neutral[400],
                  }}>
                  {r.meta}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: fonts.regular,
                  fontSize: 11.5,
                  color: palette.neutral[500],
                }}>
                {r.time}
              </Text>
            </Pressable>
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
    overflow: 'hidden',
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
    fontSize: 22,
    letterSpacing: em(-0.015, 22),
    textAlign: 'center',
  },
  stateBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 14 * 1.55,
    textAlign: 'center',
    maxWidth: 224,
  },
  stateCta: {
    marginTop: 8,
    alignSelf: 'stretch',
  },
  stateSecondary: {
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
    fontSize: 20,
    letterSpacing: em(-0.01, 20),
    textAlign: 'center',
  },
  errorBody: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.55,
    textAlign: 'center',
    maxWidth: 224,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 26,
  },
});
