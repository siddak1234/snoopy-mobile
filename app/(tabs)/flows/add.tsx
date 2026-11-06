import { useRouter } from 'expo-router';
import { FlowArrow, MagnifyingGlass, SquaresFour } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Dropdown } from '@/components/dropdown';
import { FlowCard } from '@/components/flows/flow-card';
import { SectionTitle } from '@/components/nocturne/section-label';
import { Pressable } from '@/components/pressable';
import { ScopePill } from '@/components/scope-control';
import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { em, fonts, inset, space, status, typeScale, withAlpha } from '@/constants/theme';
import { useAccessibilityTextSize } from '@/hooks/use-accessibility-text-size';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { roleIn, useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { FLOW_CHANGE_ADMIN_ONLY } from '@/lib/content/refusals';
import {
  CATALOG_EMPTY_BODY,
  CATALOG_EMPTY_TITLE,
  CATALOG_SUBTITLE,
  UNAVAILABLE_NOTE,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { readCatalog } from '@/lib/platform/catalog';
import { readSubscriptions } from '@/lib/platform/runs';
import { byDepartment, heldAs, toSolutions, withoutArchived, type SolutionView } from '@/lib/view/catalog';
import { administers } from '@/lib/view/roles';

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
 * no team is chosen anywhere. A workspace holds a flow once (the owner's build
 * 12 item 9: "Teams cannot have the same flows"): one it holds, in any team or
 * the whole workspace, reads "Added ✓" and opens itself.
 *
 * With "All categories", the flows in sections by department A–Z — each
 * department's name over its cards, as the Flows page groups them — each
 * section in the catalog's order (`byDepartment`; the owner's build 34 F4); a
 * category chosen, its flows alone, the drop-down naming it. A card is its
 * icon, its name, its description and Add or "Added ✓" (F4: "we do not need
 * words like HR included and Department: healthcare insude the flow
 * component"; ~~"{category} · {price}" and "Department: {kind}"~~), and the
 * unavailable line only for a flow the platform could not reach.
 *
 * Only an owner or admin adds a flow (the stage 1 spec's S1-9; backend §12.1
 * #180): to a member each Add is read-only, under "Only an owner or admin can
 * change this flow." once, over the list.
 */
export default function AddFlowScreen() {
  const { palette } = useTheme();
  // At iOS's accessibility sizes a card's icon, words and Add stack, so the words keep the card's width.
  const stacked = useAccessibilityTextSize();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const [category, setCategory] = useState('All');
  const [categoryOpen, setCategoryOpen] = useState(false);

  const catalog = useWorkspaceResource(async (id) => {
    const [catalogResponse, subscriptions] = await Promise.all([readCatalog(id), readSubscriptions(id)]);
    return {
      catalog: catalogResponse,
      subscriptions: withoutArchived(subscriptions.subscriptions),
    };
  });

  const ready = catalog.status === 'ready' ? catalog.data : null;
  const canManage = administers(roleIn(session, catalog.loadedFor));

  const solutions = ready ? toSolutions(ready.catalog, ready.subscriptions) : [];
  const chips = ready ? ready.catalog.categories : [];
  const visible = solutions.filter((sol) => category === 'All' || sol.cat === category);
  // All categories: a section per department, A–Z; one category: its flows, under no name.
  const sections: { department: string | null; entries: SolutionView[] }[] =
    category === 'All'
      ? byDepartment(visible, (sol) => sol.cat)
      : visible.length > 0
        ? [{ department: null, entries: visible }]
        : [];

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

      {canManage ? null : (
        <Text testID="add-admin-only" style={[styles.adminOnly, { color: palette.neutral[400] }]}>
          {FLOW_CHANGE_ADMIN_ONLY}
        </Text>
      )}

      <View style={styles.groups}>
        {sections.map((section, g) => (
          <View key={section.department ?? 'chosen'} testID={`add-group-${g}`} style={styles.list}>
            {section.department ? <SectionTitle flush>{section.department.toUpperCase()}</SectionTitle> : null}
            {section.entries.map((sol) => {
              // Where the workspace holds it, in any team (item 9). Two copies added
              // before the rule are both held; the card opens the first.
              const held = ready ? heldAs(sol.templateId, ready.subscriptions) : [];
              const here = held[0];
              const openFlow = here
                ? () => router.push({ pathname: '/(tabs)/flows/detail', params: { flow: here.id } })
                : undefined;
              return (
                <FlowCard
                  key={sol.templateId}
                  testID={`add-card-${sol.templateId}`}
                  icon={sol.icon}
                  name={sol.name}
                  description={sol.desc}
                  stacked={stacked}
                  onPress={openFlow}
                  note={
                    // The platform probed this automation and it did not answer.
                    // Saying so beats an Add button that fails at the first run —
                    // the same line the web client renders.
                    !sol.available ? (
                      <Text style={[styles.cardMeta, { color: status.warnText }]}>{UNAVAILABLE_NOTE}</Text>
                    ) : null
                  }
                  right={
                    here ? (
                        <Text testID={`added-${sol.templateId}`} style={[styles.added, { color: palette.neutral[400] }]}>
                          Added ✓
                        </Text>
                      ) : (
                        <Pressable
                          testID={`add-${sol.templateId}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${sol.name}`}
                          disabled={!sol.available || !canManage}
                          accessibilityState={{ disabled: !sol.available || !canManage }}
                          onPress={() =>
                            router.push({ pathname: '/(tabs)/flows/setup', params: { template: sol.templateId } })
                          }
                          style={({ pressed }) => [
                            styles.addBtn,
                            { borderColor: sol.available && canManage ? palette.accent : palette.neutral[700] },
                            pressed && { backgroundColor: withAlpha(palette.accent, 0.1) },
                          ]}>
                          <Text
                            style={{
                              fontFamily: fonts.medium,
                              fontSize: typeScale.body.fontSize,
                              color: sol.available && canManage ? palette.accent : palette.neutral[400],
                            }}>
                            Add
                          </Text>
                        </Pressable>
                      )
                  }
                />
              );
            })}
          </View>
        ))}
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
  // Between departments, `group`; inside one, its title `title` above its cards, which are `inner` apart.
  groups: {
    gap: space.group,
  },
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
  adminOnly: { fontFamily: fonts.regular, ...typeScale.small },
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
