import { useRouter } from 'expo-router';
import { MagnifyingGlass } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { FilterChip } from '@/components/nocturne/filter-chip';
import { IconTile } from '@/components/nocturne/icon-tile';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { em, fonts, layout, status, withAlpha } from '@/constants/theme';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { useTheme } from '@/hooks/use-theme';
import { UNAVAILABLE_NOTE, errorTitleFor } from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readProjects } from '@/lib/platform/projects';
import { readSubscriptions, type Subscription } from '@/lib/platform/runs';
import { toSolutions, withoutArchived } from '@/lib/view/catalog';

/**
 * "New" — the catalog, inside Flows (BUILD-PLAN 24.9.3; the owner's feedback 4
 * and 5 of 2026-10-02: "name them flows… the new gives us a list of all flows
 * and which one to pick up or add then what project to assign it to").
 *
 * The scope control chose where a flow is added: the chosen project, or the
 * whole workspace. A flow already added there says so and opens itself; one
 * not yet added there offers Add, whatever other scopes already hold it — the
 * website's rule (18.6.2): a flow can be added once per scope. Setup is told
 * the project, so the person does not choose it twice.
 */
export default function AddFlowScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { projectId } = useScope();
  const [category, setCategory] = useState('All');

  const catalog = useWorkspaceResource(async (id) => {
    const [catalogResponse, subscriptions, projects] = await Promise.all([
      readCatalog(id),
      readSubscriptions(id),
      readProjects(id),
    ]);
    return {
      catalog: catalogResponse,
      subscriptions: withoutArchived(subscriptions.subscriptions),
      openProjects: projects.filter((project) => project.status !== 'archived'),
    };
  });

  const ready = catalog.status === 'ready' ? catalog.data : null;
  const scopeProject = ready?.openProjects.find((project) => project.id === projectId);
  // '' is the whole workspace, as `Subscription.projectId` null is.
  const scopeKey = scopeProject ? scopeProject.id : '';
  const scopeName = scopeProject ? scopeProject.name : 'your workspace';
  const projectName = (id: string | null) =>
    id === null ? 'your workspace' : (ready?.openProjects.find((project) => project.id === id)?.name ?? 'a team');

  const subscriptionsFor = (templateId: string): Subscription[] =>
    (ready?.subscriptions ?? []).filter((subscription) => subscription.templateId === templateId);
  const inThisScope = (templateId: string) =>
    subscriptionsFor(templateId).find((subscription) => (subscription.projectId ?? '') === scopeKey);
  const elsewhere = (templateId: string) =>
    subscriptionsFor(templateId).filter((subscription) => (subscription.projectId ?? '') !== scopeKey);

  const solutions = ready ? toSolutions(ready.catalog, ready.subscriptions) : [];
  const chips = ready ? ready.catalog.categories : [];
  const visible = solutions.filter((sol) => category === 'All' || sol.cat === category);

  // Below every hook: these return early.
  if (catalog.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (catalog.status === 'offline') {
    return <ScreenOffline onRetry={catalog.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (catalog.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('add')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (catalog.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('add')}
        onRetry={catalog.reload}
        body={busyBody(catalog)}
        onBack={() => router.back()}
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
      <View style={styles.headerRow}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.h1, { color: palette.text }]}>Add a flow</Text>
          <Text style={[styles.sub, { color: palette.neutral[400] }]}>
            Prebuilt flows, set up in minutes. Adding to {scopeName}.
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {chips.map((f) => (
          <FilterChip key={f} label={f} active={f === category} onPress={() => setCategory(f)} />
        ))}
      </ScrollView>

      <View style={styles.list}>
        {visible.map((sol) => {
          const here = inThisScope(sol.templateId);
          const others = elsewhere(sol.templateId);
          const openFlow = here
            ? () => router.push({ pathname: '/(tabs)/flows/detail', params: { flow: here.id } })
            : undefined;
          return (
            <SurfaceCard key={sol.templateId} style={styles.card} onPress={openFlow}>
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
                  <Text style={[styles.cardMeta, { color: status.warnText }]}>{UNAVAILABLE_NOTE}</Text>
                ) : null}
                {others.length > 0 ? (
                  <Text testID={`added-elsewhere-${sol.templateId}`} style={[styles.cardMeta, { color: palette.neutral[500] }]}>
                    Added in {others.map((subscription) => projectName(subscription.projectId)).join(', ')}
                  </Text>
                ) : null}
              </View>
              {here ? (
                <Text testID={`added-${sol.templateId}`} style={[styles.added, { color: palette.neutral[400] }]}>
                  Added ✓
                </Text>
              ) : (
                <Pressable
                  testID={`add-${sol.templateId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${sol.name}`}
                  disabled={!sol.available}
                  accessibilityState={{ disabled: !sol.available }}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/flows/setup',
                      params: { template: sol.templateId, ...(scopeKey ? { project: scopeKey } : {}) },
                    })
                  }
                  style={({ pressed }) => [
                    styles.addBtn,
                    { borderColor: sol.available ? palette.accent : palette.neutral[700] },
                    pressed && { backgroundColor: withAlpha(palette.accent, 0.1) },
                  ]}>
                  <Text
                    style={{
                      fontFamily: fonts.medium,
                      fontSize: 13,
                      color: sol.available ? palette.accent : palette.neutral[400],
                    }}>
                    Add
                  </Text>
                </Pressable>
              )}
            </SurfaceCard>
          );
        })}
        {visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MagnifyingGlass size={34} color={palette.neutral[600]} />
            <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>
              No {category} flows yet — more are on the way.
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  h1: {
    fontFamily: fonts.medium,
    fontSize: 22,
    letterSpacing: em(-0.015, 22),
  },
  sub: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
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
  added: {
    fontFamily: fonts.medium,
    fontSize: 13,
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
