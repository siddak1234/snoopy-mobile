import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Archive, FlowArrow, MagnifyingGlass, Plus, Warning } from 'phosphor-react-native';

import { IconTile } from '@/components/nocturne/icon-tile';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionTitle } from '@/components/nocturne/section-label';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { SearchBox } from '@/components/blocks/paged';
import { CircleButton } from '@/components/scope-control';
import { Text } from '@/components/text';
import { TitleRow } from '@/components/title-row';
import { fonts, iconSize, inset, layout, space, status, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ScreenEmpty, ScreenError, ScreenUnavailable, ScreenLoading, ScreenOffline } from '@/components/screen-state';
import { Page } from '@/components/page';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { useWorkflows, type FlowStatus } from '@/hooks/use-workflows';
import {
  ADD_FLOW_LABEL,
  ARCHIVED_FLOWS_LABEL,
  FLOWS_EMPTY_BODY,
  FLOWS_EMPTY_TITLE,
  FLOWS_SCOPE_EMPTY_BODY,
  FLOWS_SCOPE_EMPTY_TITLE,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { overPlanSentence } from '@/lib/content/refusals';
import { readCatalog } from '@/lib/platform/catalog';
import { readProjects } from '@/lib/platform/projects';
import { readRemovedSubscriptionsOrNone, readRunStats, readSubscriptions } from '@/lib/platform/runs';
import { flowsOverPlan } from '@/lib/view/billing';
import { groupFlows, scopeLabels, toFlows, toRemovedFlows, type FlowView } from '@/lib/view/catalog';
import { inScope } from '@/lib/view/scope';

/** The header's Archived: its circle's name (always a circle since round 23). */
const ARCHIVED_LABEL = 'Archived';
/** The header's New, its word or — a 320-pt row — its icon's name. */
const NEW_LABEL = 'New';

/**
 * Flows — the one tab for what the workspace runs (design `sFlows`; one tab
 * since BUILD-PLAN 24.9.3). Its first row is the title, then on the right
 * Home's two scope circles — they narrow it to a department — "Archived" and
 * "New" (round 23, A1; Build 22, F1; `TitleRow`); "New" opens the catalog
 * inside this tab, as its accent circle when the row has no room for its word
 * (the session's S26), and "Archived", left of it (build 11, D5 — the owner's
 * build 10 item 8: "a button to the left of new… We dont need a component on
 * the page"), opens the archived flows, always, count or none — its circle
 * alone at every width since round 23 (~~its word where it fit~~).
 * Under the search, the flows by department (the owner's build 28 item F1):
 * each department's name over its cards, the departments A–Z, then the whole
 * workspace's, each in the catalog's order (`groupFlows`); each card still says
 * its department.
 * With no live flow in the workspace the screen is the empty standard,
 * whatever is archived (D6, item 9: "like this when no flows even if archive"),
 * with the way to the archived ones under it when there are any.
 */
export default function FlowsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { status: statusOf, settle } = useWorkflows();
  const { projectId } = useScope();
  const [query, setQuery] = useState('');

  /**
   * A workspace's flows: subscriptions, the catalog, and their run counts.
   *
   * Three reads because each answers a part nothing else can — `Subscription`
   * has identity and status, the catalog has name/description/icon/pipeline, and
   * `run-stats` has the totals this row's summary line draws. All-time rather
   * than windowed: the design's line is a lifetime count, so `since` is omitted,
   * which the endpoint documents as meaning all time. Every read is served from
   * the shared snapshot where it is fresh (24.9.1).
   */
  const flows = useWorkspaceResource(async (workspaceId) => {
    const [subs, catalog, stats, projects, removed] = await Promise.all([
      readSubscriptions(workspaceId),
      readCatalog(workspaceId),
      readRunStats(workspaceId),
      readProjects(workspaceId),
      readRemovedSubscriptionsOrNone(workspaceId),
    ]);
    const labels = scopeLabels(projects);
    return {
      flows: toFlows(subs.subscriptions, catalog.automations, stats.subscriptions, undefined, labels),
      // Each department's kind, for the list's groups (F1), and the catalog's order within each.
      labels,
      catalogOrder: catalog.automations.map((entry) => entry.templateId),
      // Archived flows are a page of their own (24.11.8); read here only to
      // know whether the empty screen has any to offer (D6).
      removed: toRemovedFlows(removed.subscriptions, catalog.automations, stats.subscriptions, labels),
      // Over the plan's flow allowance, the whole workspace's (decision 7a3).
      overPlan: flowsOverPlan(subs.flowAllowance),
    };
  });

  const live: FlowView[] | null = flows.status === 'ready' ? flows.data.flows : null;
  const overPlan = flows.status === 'ready' ? flows.data.overPlan : null;
  const removedInScope: FlowView[] =
    flows.status === 'ready' ? flows.data.removed.filter((flow) => inScope(flow, projectId)) : [];
  // What detail recorded holds only until this list reads the platform again.
  useEffect(() => {
    if (live) settle(live.map((flow) => flow.key));
  }, [live, settle]);
  // The scope narrows what is shown, never what was read (24.9.2).
  const scoped: FlowView[] = (live ?? []).filter((flow) => inScope(flow, projectId));

  const q = query.trim().toLowerCase();
  const visible = scoped.filter((def) => {
    if (!q) return true;
    return `${def.name} ${def.desc}`.toLowerCase().includes(q);
  });
  const groups = flows.status === 'ready' ? groupFlows(visible, flows.data.labels, flows.data.catalogOrder) : [];

  if (flows.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (flows.status === 'offline') {
    return <ScreenOffline onRetry={() => flows.reload()} topInset={insets.top} />;
  }
  if (flows.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('flows')} topInset={insets.top} />;
  }
  if (flows.status === 'error') {
    return (
      <ScreenError title={errorTitleFor('flows')} onRetry={() => flows.reload()} body={busyBody(flows)} topInset={insets.top} />
    );
  }
  if (live !== null && live.length === 0) {
    // No live flow in the workspace, whatever is archived: the empty standard
    // (D6), as Activity's. The filtered one below reads `No flows match
    // "{query}"`, which is nonsense for a workspace that has none at all. The
    // person who just archived their last flow lands here, so the way to it is
    // under Add a flow when archived flows exist in the scope.
    return (
      <ScreenEmpty
        icon={<FlowArrow size={40} color={palette.accentRamp[300]} />}
        title={FLOWS_EMPTY_TITLE}
        body={FLOWS_EMPTY_BODY}
        action={{
          label: ADD_FLOW_LABEL,
          onPress: () => router.push('/(tabs)/flows/add'),
        }}
        {...(removedInScope.length > 0
          ? { secondaryAction: { label: ARCHIVED_FLOWS_LABEL, onPress: () => router.push('/(tabs)/flows/archived') } }
          : {})}
        topInset={insets.top}
      />
    );
  }

  return (
    <Page keyboardShouldPersistTaps="handled">
      {/* [Archived][New]: Archived secondary, so New stays the one accent control.
          Archived always its circle; at 320 pt New is its accent circle too. */}
      <TitleRow
        title="Flows"
        levels={1}
        right={(level) => (
          <>
            <CircleButton
              testID="flows-archived"
              icon={Archive}
              accessibilityLabel={ARCHIVED_LABEL}
              onPress={() => router.push('/(tabs)/flows/archived')}
            />
            {level >= 1 ? (
              <CircleButton
                testID="flows-new"
                icon={Plus}
                tone="accent"
                accessibilityLabel={NEW_LABEL}
                onPress={() => router.push('/(tabs)/flows/add')}
              />
            ) : (
              <PillButton
                label={NEW_LABEL}
                variant="primary"
                fontSize={typeScale.body.fontSize}
                icon={Plus}
                iconSize={14}
                style={styles.headerPill}
                testID="flows-new"
                onPress={() => router.push('/(tabs)/flows/add')}
              />
            )}
          </>
        )}
      />

      {/* Over the plan (decision 7a3): every flow is held from starting a run, in
          any scope, so this says so above the list, whatever the team. */}
      {overPlan ? (
        <View testID="flows-over-plan" style={styles.overPlan}>
          <Warning size={16} color={status.warnText} style={styles.overPlanIcon} />
          <Text style={styles.overPlanText}>{overPlanSentence(overPlan.allowed, overPlan.live)}</Text>
        </View>
      ) : null}

      {/* The search box every list shares since Round 21 (`SearchBox`; ~~drawn here alone~~). */}
      <SearchBox testID="flows-search" value={query} onChange={setQuery} placeholder="Search flows" />

      <View style={styles.groups}>
        {groups.map((group, g) => (
          <View key={group.name ?? `unread-${g}`} testID={`flows-group-${g}`} style={styles.cardList}>
            {group.name ? <SectionTitle flush>{group.name.toUpperCase()}</SectionTitle> : null}
            {group.flows.map((def) => {
              const key = def.key;
              return (
                <SurfaceCard
                  key={key}
                  onPress={() => router.push({ pathname: '/(tabs)/flows/detail', params: { flow: key } })}
                  style={styles.flowCard}>
                  <IconTile icon={def.icon} size={42} iconSize={iconSize.row} borderRadius={12} bordered />
                  <View style={styles.flowBody}>
                    <Text style={[styles.flowName, { color: palette.text }]}>{def.name}</Text>
                    <Text style={[styles.flowDesc, { color: palette.neutral[400] }]}>{def.desc}</Text>
                    {/* Its team, or "Whole workspace", in every scope — a picked
                        team's too (D4: every card; the build 11 review). */}
                    <Text style={[styles.flowRuns, { color: palette.neutral[500] }]}>
                      {def.scope ? `${def.scope} · ${def.runs}` : def.runs}
                    </Text>
                  </View>
                  <StatusPill label={statusOf(key, def.status as FlowStatus)} />
                </SurfaceCard>
              );
            })}
          </View>
        ))}
        {visible.length === 0 && scoped.length === 0 ? (
          <View style={styles.emptyWrap}>
            <FlowArrow size={34} color={palette.neutral[600]} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>{FLOWS_SCOPE_EMPTY_TITLE}</Text>
            <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>{FLOWS_SCOPE_EMPTY_BODY}</Text>
            <PillButton
              label={ADD_FLOW_LABEL}
              variant="primary"
              fontSize={typeScale.body.fontSize}
              onPress={() => router.push('/(tabs)/flows/add')}
            />
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MagnifyingGlass size={34} color={palette.neutral[600]} />
            <Text style={[styles.emptyText, { color: palette.neutral[500] }]}>
              No flows match &quot;{query}&quot;.
            </Text>
          </View>
        ) : null}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Both header pills 12 a side (the session's S26), so the words fit beside the circles.
  headerPill: {
    paddingHorizontal: space.rowX,
  },
  overPlan: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.inner,
    backgroundColor: status.warnCalloutBg,
    borderWidth: 1,
    borderColor: status.warnCalloutBorder,
    borderRadius: 10,
    paddingVertical: space.inner,
    paddingHorizontal: space.rowX,
  },
  overPlanIcon: {
    marginTop: inset.hair,
  },
  overPlanText: {
    flex: 1,
    fontFamily: fonts.regular,
    ...typeScale.body,
    color: status.warnText,
  },
  groups: {
    gap: space.group,
  },
  cardList: {
    gap: space.inner,
  },
  flowCard: {
    padding: layout.cardPad,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inner,
  },
  flowBody: {
    flex: 1,
    minWidth: 0,
  },
  flowName: {
    fontFamily: fonts.medium,
    fontSize: typeScale.lead.fontSize,
  },
  flowDesc: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
    marginTop: inset.xxs,
  },
  flowRuns: {
    fontFamily: fonts.regular,
    fontSize: typeScale.caption.fontSize,
    marginTop: inset.xs,
  },
  emptyWrap: {
    paddingVertical: space.bottom,
    alignItems: 'center',
    gap: space.inner,
  },
  emptyTitle: {
    fontFamily: fonts.medium,
    fontSize: typeScale.lead.fontSize,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
    textAlign: 'center',
    maxWidth: 260,
  },
});
