import { useRouter } from 'expo-router';
import { CaretRight, CrownSimple, MagnifyingGlass } from 'phosphor-react-native';
import React, { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/nocturne/filter-chip';
import { IconTile } from '@/components/nocturne/icon-tile';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { UNAVAILABLE_NOTE, errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { updateSubscription } from '@/lib/platform/automations';
import { newIdempotencyKey } from '@/lib/platform/client';
import { readSubscriptions } from '@/lib/platform/runs';
import { toSolutions, type SolutionView } from '@/lib/view/catalog';
import { useTheme } from '@/hooks/use-theme';

export default function SolutionsScreen() {
  const { palette } = useTheme();
  const { isActive, setActive, totals } = useSolutions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const workspaceId = activeWorkspaceId(session);
  const [category, setCategory] = useState('All');
  /** The solution pending removal, by templateId (design rmIdx). */
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  const pauseKeys = useRef<Record<string, string>>({});

  /**
   * The marketplace, from the catalog.
   *
   * `subscribed` is the server's own answer to Add-versus-Added, and the filter
   * chips come from `categories`, which the contract says a client must render
   * rather than invent. Identity is the templateId throughout — the array
   * position this screen used to key on cannot survive contact with a real
   * catalog.
   */
  const catalog = useWorkspaceResource(async (id) => {
    const [catalogResponse, subscriptions] = await Promise.all([
      readCatalog(id),
      readSubscriptions(id),
    ]);
    return { catalog: catalogResponse, subscriptions: subscriptions.subscriptions };
  });
  const solutions: SolutionView[] =
    catalog.status === 'ready'
      ? toSolutions(catalog.data.catalog)
      : [];
  const chips =
    catalog.status === 'ready' ? catalog.data.catalog.categories : [];

  const visible = solutions.filter((sol) => category === 'All' || sol.cat === category);
  const removeSolution = removeId == null ? null : solutions.find((s) => s.templateId === removeId);
  const { activeCount, planTotal } = totals(solutions);

  const pauseSolution = async () => {
    if (!removeSolution || !workspaceId || catalog.status !== 'ready') return;
    setPausing(true);
    setPauseError(null);
    try {
      const matching = catalog.data.subscriptions.filter(
        (subscription) => subscription.templateId === removeSolution.templateId,
      );
      if (matching.length === 0) {
        setPauseError('No matching workflow was found. Refresh before trying again.');
        return;
      }
      await Promise.all(
        matching.map((subscription) =>
          updateSubscription(
            workspaceId,
            subscription.id,
            { status: 'paused' },
            (pauseKeys.current[subscription.id] ??= newIdempotencyKey('pause')),
          ),
        ),
      );
      for (const subscription of matching) delete pauseKeys.current[subscription.id];
      // The platform accepted `paused`: state it, rather than flipping
      // relative to whatever an earlier override happened to say.
      setActive(removeSolution.templateId, false);
      setRemoveId(null);
    } catch (error) {
      setPauseError(error instanceof Error ? error.message : 'The workflows were not paused.');
    } finally {
      setPausing(false);
    }
  };

  // Below every hook: these return early.
  if (catalog.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (catalog.status === 'offline') {
    return <ScreenOffline onRetry={catalog.reload} topInset={insets.top} />;
  }
  if (catalog.status === 'unconfigured') {
    return (
      <ScreenUnavailable
        title={errorTitleFor('solutions')}
        topInset={insets.top}
      />
    );
  }
  if (catalog.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('solutions')}
        onRetry={catalog.reload}
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
      <View>
        <Text style={[styles.h1, { color: palette.text }]}>Solutions</Text>
        <Text style={[styles.sub, { color: palette.neutral[400] }]}>
          Prebuilt automations, proven at scale. Add one to your workspace and configure it in minutes.
        </Text>
      </View>

      <Pressable
        onPress={() => router.push('/(tabs)/settings')}
        style={({ pressed }) => [
          styles.planBanner,
          {
            borderColor: palette.accentRamp[700],
            backgroundColor: withAlpha(palette.accent, pressed ? 0.15 : 0.09),
          },
        ]}>
        <CrownSimple size={20} color={palette.accentRamp[300]} />
        <View style={styles.planBody}>
          <Text style={[styles.planTitle, { color: palette.text }]}>
            Solutions · {planTotal}/mo
          </Text>
          <Text style={[styles.planSub, { color: palette.neutral[400] }]}>
            {activeCount} active · manage in Settings
          </Text>
        </View>
        <CaretRight size={15} color={palette.neutral[500]} />
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {chips.map((f) => (
          <FilterChip key={f} label={f} active={f === category} onPress={() => setCategory(f)} />
        ))}
      </ScrollView>

      <View style={styles.list}>
        {visible.map((sol) => {
          const added = isActive(sol.templateId, sol.subscribed);
          return (
            <SurfaceCard key={sol.templateId} style={styles.card}>
              <IconTile icon={sol.icon} size={42} iconSize={21} borderRadius={12} bordered />
              <View style={styles.cardBody}>
                <Text style={[styles.cardName, { color: palette.text }]}>{sol.name}</Text>
                <Text style={[styles.cardDesc, { color: palette.neutral[400] }]}>{sol.desc}</Text>
                <Text style={[styles.cardMeta, { color: palette.neutral[500] }]}>
                  {sol.cat} · ${sol.price}/mo
                </Text>
                {/* The platform probed this automation and it did not answer.
                    Saying so beats an Add button that fails at the first run —
                    the same line the web client renders. */}
                {!sol.available ? (
                  <Text style={[styles.cardMeta, { color: status.warnText }]}>
                    {UNAVAILABLE_NOTE}
                  </Text>
                ) : null}
              </View>
              <Pressable
                disabled={!added && !sol.available}
                accessibilityState={{ disabled: !added && !sol.available }}
                onPress={() =>
                  added
                    ? setRemoveId(sol.templateId)
                    : router.push({ pathname: '/(tabs)/solutions/setup', params: { template: sol.templateId } })
                }
                style={({ pressed }) => [
                  styles.addBtn,
                  { borderColor: added || !sol.available ? palette.neutral[700] : palette.accent },
                  pressed && { backgroundColor: withAlpha(palette.accent, 0.1) },
                ]}>
                <Text
                  style={{
                    fontFamily: fonts.medium,
                    fontSize: 13,
                    color: added || !sol.available ? palette.neutral[400] : palette.accent,
                  }}>
                  {added ? 'Added ✓' : 'Add'}
                </Text>
              </Pressable>
            </SurfaceCard>
          );
        })}
        {visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MagnifyingGlass size={34} color={palette.neutral[600]} />
            <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>
              No {category} solutions yet — more are on the way.
            </Text>
          </View>
        ) : null}
      </View>

      <Modal
        visible={removeId != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveId(null)}>
        <View style={[styles.overlay, { backgroundColor: status.overlay }]}>
          <View
            style={[
              styles.dialog,
              { backgroundColor: palette.surface, borderColor: palette.neutral[800] },
            ]}>
            <Text style={[styles.dialogTitle, { color: palette.text }]}>
              Pause {removeSolution?.name}?
            </Text>
            <Text style={[styles.dialogBody, { color: palette.neutral[400] }]}>
              Every workflow built on it will be paused. Workspace connections remain available.
            </Text>
            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setRemoveId(null)}
                style={({ pressed }) => [
                  styles.dialogBtn,
                  { borderColor: palette.neutral[700] },
                  pressed && { backgroundColor: withAlpha(palette.text, 0.06) },
                ]}>
                <Text style={[styles.dialogBtnLabel, { color: palette.text }]}>Keep it</Text>
              </Pressable>
              <Pressable
                disabled={pausing}
                onPress={pauseSolution}
                style={({ pressed }) => [
                  styles.dialogBtn,
                  { borderColor: status.err },
                  pressed && { backgroundColor: status.errCalloutBg },
                ]}>
                <Text style={[styles.dialogBtnLabel, { color: status.err }]}>
                  {pausing ? 'Pausing…' : 'Pause'}
                </Text>
              </Pressable>
            </View>
            {pauseError ? (
              <Text style={[styles.dialogBody, { color: status.err }]}>{pauseError}</Text>
            ) : null}
          </View>
        </View>
      </Modal>
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
    fontSize: 26,
    letterSpacing: em(-0.015, 26),
  },
  sub: {
    marginTop: 5,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.55,
  },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  planBody: {
    flex: 1,
  },
  planTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  planSub: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  list: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: layout.cardPad,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  cardDesc: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
  cardMeta: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 11.5,
  },
  addBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  dialog: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  dialogTitle: {
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  dialogBody: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  dialogBtn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
  },
});
