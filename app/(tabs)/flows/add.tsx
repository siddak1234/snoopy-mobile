import { useRouter } from 'expo-router';
import { FlowArrow, MagnifyingGlass, SquaresFour } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Dropdown } from '@/components/dropdown';
import { IconTile } from '@/components/nocturne/icon-tile';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { ScopePill } from '@/components/scope-control';
import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { em, fonts, iconSize, inset, layout, space, status, typeScale, withAlpha } from '@/constants/theme';
import { useAccessibilityTextSize } from '@/hooks/use-accessibility-text-size';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import {
  CATALOG_EMPTY_BODY,
  CATALOG_EMPTY_TITLE,
  CATALOG_SUBTITLE,
  UNAVAILABLE_NOTE,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readProjects } from '@/lib/platform/projects';
import { readSubscriptions } from '@/lib/platform/runs';
import { catalogPrice, heldAs, scopeLabel, scopeLabels, toSolutions, withoutArchived } from '@/lib/view/catalog';

/** A category as the drop-down says it: the catalog's "All" is All categories (S5). */
const categoryLabel = (category: string) => (category === 'All' ? 'All categories' : category);

/**
 * "New" — the catalog, inside Flows (BUILD-PLAN 24.9.3; the owner's feedback 4
 * and 5 of 2026-10-02: "name them flows… the new gives us a list of all flows
 * and which one to pick up or add then what project to assign it to").
 *
 * A flow goes to the team of its category (backend ADR-0036; the owner,
 * 2026-10-14: "when a person goes to flows to add this it will already be in a
 * accounting category … theres no choose a team"): Add opens Setup for it, and
 * no team is chosen anywhere. Each card says its category and its price — the
 * version is gone from it (the spec's S9). A workspace holds a flow once (the
 * owner's build 12 item 9: "Teams cannot have the same flows"): one it holds,
 * in any team or the whole workspace, reads "Added ✓" with its team and opens
 * itself.
 */
export default function AddFlowScreen() {
  const { palette } = useTheme();
  // At iOS's accessibility sizes a card's icon, words and Add stack, so the words keep the card's width.
  const stacked = useAccessibilityTextSize();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('All');
  const [categoryOpen, setCategoryOpen] = useState(false);

  const catalog = useWorkspaceResource(async (id) => {
    const [catalogResponse, subscriptions, projects] = await Promise.all([
      readCatalog(id),
      readSubscriptions(id),
      readProjects(id),
    ]);
    return {
      catalog: catalogResponse,
      subscriptions: withoutArchived(subscriptions.subscriptions),
      // Every team's name, an archived team's too: a flow held there says where.
      labels: scopeLabels(projects),
    };
  });

  const ready = catalog.status === 'ready' ? catalog.data : null;

  const solutions = ready ? toSolutions(ready.catalog, ready.subscriptions) : [];
  const chips = ready ? ready.catalog.categories : [];
  const visible = solutions.filter((sol) => category === 'All' || sol.cat === category);

  // Below every hook: these return early.
  if (catalog.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (catalog.status === 'offline') {
    return <ScreenOffline onRetry={() => catalog.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (catalog.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('add')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (catalog.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('add')}
        onRetry={() => catalog.reload()}
        body={busyBody(catalog)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  if (solutions.length === 0) {
    // Nothing in the catalog at all: the whole-screen standard (24.12). A
    // category with nothing in it keeps its own line below.
    return (
      <ScreenEmpty
        icon={<FlowArrow size={40} color={palette.accentRamp[300]} />}
        title={CATALOG_EMPTY_TITLE}
        body={CATALOG_EMPTY_BODY}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  return (
    <Page>
      <PageHeader onBack={() => router.back()} title="Add a flow" subtitle={CATALOG_SUBTITLE} />

      {/* The category, one drop-down where the chips were (round 23, the
          owner's build 22 items 3–4): All categories, then each (S5). */}
      <View style={styles.filters}>
        <Dropdown
          testID="add-category"
          title="Category"
          options={chips.map((f) => ({ value: f, label: categoryLabel(f) }))}
          value={category}
          open={categoryOpen}
          onOpenChange={setCategoryOpen}
          onChange={(next) => {
            setCategory(next);
            setCategoryOpen(false);
          }}
          trigger={
            <ScopePill
              testID="add-category"
              icon={SquaresFour}
              label={categoryLabel(category)}
              accessibilityLabel={`Category: ${categoryLabel(category)}`}
              onPress={() => setCategoryOpen(true)}
            />
          }
        />
      </View>

      <View style={styles.list}>
        {visible.map((sol) => {
          // Where the workspace holds it, in any team (item 9). Two copies added
          // before the rule are both named; the card opens the first.
          const held = ready ? heldAs(sol.templateId, ready.subscriptions) : [];
          const here = held[0];
          const openFlow = here
            ? () => router.push({ pathname: '/(tabs)/flows/detail', params: { flow: here.id } })
            : undefined;
          return (
            <SurfaceCard key={sol.templateId} style={[styles.card, stacked && styles.cardStacked]} onPress={openFlow}>
              <IconTile icon={sol.icon} size={42} iconSize={iconSize.row} borderRadius={12} bordered />
              <View style={stacked ? styles.cardBodyStacked : styles.cardBody}>
                <Text style={[styles.cardName, { color: palette.text }]}>{sol.name}</Text>
                <Text style={[styles.cardDesc, { color: palette.neutral[400] }]}>{sol.desc}</Text>
                {/* Its category — the team it goes to — and its price (spec §3.A). */}
                <Text style={[styles.cardMeta, { color: palette.neutral[500] }]}>
                  {sol.cat} · {catalogPrice(sol.price)}
                </Text>
                {/* The platform probed this automation and it did not answer.
                    Saying so beats an Add button that fails at the first run —
                    the same line the web client renders. */}
                {!sol.available ? (
                  <Text style={[styles.cardMeta, { color: status.warnText }]}>{UNAVAILABLE_NOTE}</Text>
                ) : null}
                {ready && held.length > 0 ? (
                  <Text testID={`added-where-${sol.templateId}`} style={[styles.cardMeta, { color: palette.neutral[500] }]}>
                    {held.map((subscription) => scopeLabel(subscription.projectId, ready.labels)).join(', ')}
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
                    router.push({ pathname: '/(tabs)/flows/setup', params: { template: sol.templateId } })
                  }
                  style={({ pressed }) => [
                    styles.addBtn,
                    { borderColor: sol.available ? palette.accent : palette.neutral[700] },
                    pressed && { backgroundColor: withAlpha(palette.accent, 0.1) },
                  ]}>
                  <Text
                    style={{
                      fontFamily: fonts.medium,
                      fontSize: typeScale.body.fontSize,
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
    </Page>
  );
}

const styles = StyleSheet.create({
  h1: {
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.015, typeScale.heading.fontSize),
  },
  sub: {
    marginTop: inset.xxs,
    fontFamily: fonts.regular,
    ...typeScale.body,
  },
  filters: {
    flexDirection: 'row',
    gap: space.inner,
  },
  list: {
    gap: space.inner,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inner,
    padding: layout.cardPad,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  // Round 24's simulator audit: beside Add or "Added ✓" at the largest size, "QuickBoo/ks." broke inside the word.
  cardStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  cardBodyStacked: {
    alignSelf: 'stretch',
  },
  cardName: {
    fontFamily: fonts.medium,
    fontSize: typeScale.lead.fontSize,
  },
  cardDesc: {
    marginTop: inset.xxs,
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  cardMeta: {
    marginTop: inset.xs,
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
  },
  added: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body.fontSize,
  },
  addBtn: {
    minHeight: 34,
    paddingHorizontal: space.rowX,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
