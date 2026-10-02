import { useRouter } from 'expo-router';
import { CaretRight, CrownSimple, MagnifyingGlass } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/nocturne/filter-chip';
import { IconTile } from '@/components/nocturne/icon-tile';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useSolutions } from '@/hooks/use-solutions';
import { UNAVAILABLE_NOTE, errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readProjects } from '@/lib/platform/projects';
import { readSubscriptions } from '@/lib/platform/runs';
import { toSolutions, withoutArchived, type SolutionView } from '@/lib/view/catalog';
import { useTheme } from '@/hooks/use-theme';

export default function SolutionsScreen() {
  const { palette } = useTheme();
  const { isActive, totals } = useSolutions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('All');

  /**
   * The marketplace, from the catalog.
   *
   * Add-versus-Added is answered from the subscriptions the workspace still has
   * (`withoutArchived`, the website's rule), and the filter chips come from
   * `categories`, which the contract says a client must render
   * rather than invent. Identity is the templateId throughout — the array
   * position this screen used to key on cannot survive contact with a real
   * catalog.
   */
  const catalog = useWorkspaceResource(async (id) => {
    const [catalogResponse, subscriptions, projects] = await Promise.all([
      readCatalog(id),
      readSubscriptions(id),
      readProjects(id),
    ]);
    return {
      catalog: catalogResponse,
      subscriptions: subscriptions.subscriptions,
      openProjects: projects.filter((project) => project.status !== 'archived'),
    };
  });
  /** The workflow "Added" opens: the workspace-level subscription first, else the first in a project. */
  const subscriptionFor = (templateId: string) => {
    if (catalog.status !== 'ready') return undefined;
    const matching = withoutArchived(catalog.data.subscriptions).filter(
      (subscription) => subscription.templateId === templateId,
    );
    return matching.find((subscription) => !subscription.projectId) ?? matching[0];
  };
  /**
   * Whether an added automation can still be added somewhere — the whole
   * workspace or an open project it is not in yet — as the website's Add offers
   * exactly those scopes (18.6.2). Without projects that is only the workspace,
   * free when the automation was added to a project alone.
   */
  const canAddElsewhere = (templateId: string) => {
    if (catalog.status !== 'ready') return false;
    const taken = new Set(
      withoutArchived(catalog.data.subscriptions)
        .filter((subscription) => subscription.templateId === templateId)
        .map((subscription) => subscription.projectId ?? ''),
    );
    return ['', ...catalog.data.openProjects.map((project) => project.id)].some((scope) => !taken.has(scope));
  };
  const solutions: SolutionView[] =
    catalog.status === 'ready'
      ? toSolutions(catalog.data.catalog, catalog.data.subscriptions)
      : [];
  const chips =
    catalog.status === 'ready' ? catalog.data.catalog.categories : [];

  const visible = solutions.filter((sol) => category === 'All' || sol.cat === category);
  const { activeCount, planTotal } = totals(solutions);


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
        onRetry={catalog.reload} body={busyBody(catalog)}
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
        onPress={() => router.push('/(tabs)/settings/billing')}
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
            {activeCount} active · plan and billing
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
                {added && sol.available && canAddElsewhere(sol.templateId) ? (
                  <Text
                    testID={`add-elsewhere-${sol.templateId}`}
                    suppressHighlighting
                    onPress={() =>
                      router.push({ pathname: '/(tabs)/solutions/setup', params: { template: sol.templateId } })
                    }
                    style={[styles.cardMeta, { color: palette.accentRamp[300] }]}>
                    Add to…
                  </Text>
                ) : null}
              </View>
              <Pressable
                disabled={!added && !sol.available}
                accessibilityState={{ disabled: !added && !sol.available }}
                onPress={() => {
                  // "Added" opens the workflow, where Pause and Archive live — the
                  // platform's two words, the website's too. A pause dialog here
                  // read as "remove" (owner, 2026-10-02; 24.7.3 attempt 4, #3).
                  const subscription = added ? subscriptionFor(sol.templateId) : undefined;
                  if (subscription) {
                    router.push({ pathname: '/(tabs)/flows/detail', params: { flow: subscription.id } });
                    return;
                  }
                  router.push({ pathname: '/(tabs)/solutions/setup', params: { template: sol.templateId } });
                }}
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
});
