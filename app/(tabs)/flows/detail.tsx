import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pause, Play, RocketLaunch } from 'phosphor-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AutomationActions } from '@/components/automations/automation-actions';
import type { ArchivedFlowPath } from '@/components/flows/archived-flows';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatusPill } from '@/components/nocturne/status-pill';
import { StepCard } from '@/components/nocturne/step-card';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { pressed } from '@/components/pressable';
import { StatTileButton } from '@/components/stat-tile-button';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ActionFailure, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { roleIn, useSession, workspaceIfShown } from '@/hooks/use-session';
import { statusAction, useWorkflows, type FlowStatus } from '@/hooks/use-workflows';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import {
  OPEN_LIVE_FLOW_LABEL,
  UNARCHIVE_LABEL,
  UNAVAILABLE_NOTE,
  archivedFlowAddedAgainBody,
  archivedFlowBody,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { readCatalog, readConnectionProviders } from '@/lib/platform/catalog';
import { updateSubscription } from '@/lib/platform/automations';
import { readProjects } from '@/lib/platform/projects';
import { readRemovedSubscriptionsOrNone, readRunStats, readSubscriptions } from '@/lib/platform/runs';
import { addedAgainAs, scopeLabels, toFlows, toRemovedFlows, type FlowView } from '@/lib/view/catalog';
import { administers } from '@/lib/view/roles';
import { statusLabel } from '@/lib/view/status';

const ACTION_ICON = { pause: Pause, play: Play, rocket: RocketLaunch } as const;

/**
 * The flow page — one screen per flow identity (design `flow` prop). Drawn in
 * the Flows stack and, for an archived flow opened from Settings, in the
 * Settings stack (24.12); `detailPath` is where its live twin opens (build 11,
 * D3), in the same stack, as the archived list's rows open there.
 */
export function WorkflowDetail({ detailPath }: { detailPath: ArchivedFlowPath }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { record, settle, status: statusOf } = useWorkflows();
  const session = useSession();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per target status: a retry of Pause keeps its key, and a Resume
  // after a re-read is a different intent with its own.
  const statusKeys = useIntentKeys('status');

  /**
   * This workflow, by subscription id.
   *
   * `flow` used to be one of four `FlowKey`s baked into the prototype; it is now
   * a subscription id, which is the identity the platform uses and the only one
   * that can name a workspace's actual workflows. The three reads are the same
   * join the list makes — subscription for status, catalog for name and
   * `pipeline`, `run-stats` for the counters. The subscription and its catalog
   * entry are kept as read, for the actions (`AutomationActions`).
   */
  const flows = useWorkspaceResource(async (workspaceId) => {
    const [subs, catalog, stats, providers, projects, removed] = await Promise.all([
      readSubscriptions(workspaceId),
      readCatalog(workspaceId),
      readRunStats(workspaceId),
      readConnectionProviders(),
      readProjects(workspaceId),
      readRemovedSubscriptionsOrNone(workspaceId),
    ]);
    const labels = scopeLabels(projects);
    return {
      // An archived flow is read here too (24.11.8): its page stays, read-only,
      // so a run row that names it opens something rather than "Couldn't load".
      flows: [
        ...toFlows(
          subs.subscriptions,
          catalog.automations,
          stats.subscriptions,
          new Map(providers.providers.map((p) => [p.providerId, p])),
          labels,
        ),
        ...toRemovedFlows(removed.subscriptions, catalog.automations, stats.subscriptions, labels),
      ],
      // An archived flow's own row too, so its page can say what it was.
      subscriptions: [...subs.subscriptions, ...removed.subscriptions],
      automations: catalog.automations,
    };
  });

  const live: FlowView | undefined =
    flows.status === 'ready'
      ? flows.data.flows.find((f) => f.key === flow)
      : undefined;
  const def = live;
  const subscription =
    flows.status === 'ready' && live ? flows.data.subscriptions.find((s) => s.id === live.key) : undefined;
  const entry =
    flows.status === 'ready' && subscription
      ? flows.data.automations.find((a) => a.templateId === subscription.templateId)
      : undefined;
  // An archived flow the workspace holds again, in any team (D3; any team since
  // the owner's build 12 item 9): its live twin, from the live list already
  // read here — no extra request.
  const twin =
    flows.status === 'ready' && subscription?.status === 'archived'
      ? addedAgainAs(subscription, flows.data.subscriptions)
      : undefined;
  // The platform's answer to this device's own change shows the moment it is
  // answered (`record`), until this screen's re-read lands and confirms it
  // (`settle` below). Showing "the status as last read" alone drew the old label
  // again between the PATCH and the re-read — a flip the owner read as a bug
  // (24.7.3 attempt 2, "it switches back then to the right state").
  const current = def ? statusOf(def.key, def.status as FlowStatus) : ('Draft' as FlowStatus);
  const landedStatus = flows.status === 'ready' ? def?.status : undefined;
  useEffect(() => {
    if (def && landedStatus) settle([def.key]);
    // `def` is derived from `flows.data`; the landed status is what settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landedStatus, flows.status]);
  const action = statusAction(current);
  const ActionIcon = ACTION_ICON[action.icon];

  // Go live is offered only where it can succeed, as the website offers it: every
  // required account connected, and the automation answering its probe.
  const canGoLive = subscription?.unmetConnections.length === 0 && entry?.available === true;
  const goingLive = current !== 'Live';

  const changeStatus = async () => {
    if (!def || busy || (goingLive && !canGoLive)) return;
    const workspaceId = workspaceIfShown(session, flows.loadedFor);
    if (!workspaceId) {
      setActionError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const target = current === 'Live' ? 'paused' : 'live';
      const { subscription: answered } = await updateSubscription(
        workspaceId,
        def.key,
        { status: target },
        statusKeys.keyFor(target),
      );
      statusKeys.settle(target);
      // The list shows the platform's answer until it reads again.
      record(def.key, statusLabel(answered.status) as FlowStatus);
      // Re-read keeping the page: the status just answered is already shown,
      // and a skeleton here read as the screen going blank (feedback #6).
      flows.refresh();
    } catch (error) {
      setActionError(refusalMessage(error, {}, 'The flow status was not changed.'));
    } finally {
      setBusy(false);
    }
  };

  // Below every hook on purpose — these return early.
  if (flows.status === 'loading') return <ScreenLoading tiles topInset={insets.top} />;
  if (flows.status === 'offline') {
    return <ScreenOffline onRetry={() => flows.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  // An unconfigured build or an unresolved workspace cannot succeed on a
  // retry, so it does not get a Retry. A refused identity and a platform
  // refusal both can — a stale read is the common case — so they keep one.
  if (flows.status === 'unconfigured') {
    return (
      <ScreenUnavailable
        title={errorTitleFor('detail')}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  if (!def || !subscription || flows.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('detail')}
        onRetry={() => flows.reload()} body={busyBody(flows)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  // Draft flows show em dashes, which stay neutral rather than ok/err.
  const dash = (v: string) => v === '—';

  const connectionTone = (tone: 'ok' | 'warn' | 'neutral') =>
    tone === 'ok' ? status.ok : tone === 'warn' ? status.warnText : palette.neutral[500];

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}>
      <View style={styles.headerRow}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{def.name}</Text>
          <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>
            {def.scope ? `${def.scope} · ${def.desc}` : def.desc}
          </Text>
        </View>
        {def.removed ? (
          <Text style={[styles.removedBadge, { color: palette.neutral[400] }]}>Archived</Text>
        ) : (
          <StatusPill label={current} />
        )}
      </View>

      {/* The three tiles open Activity for this flow and that outcome, over all time (24.11.9);
          each looks like the button it is (the owner's build 12 item 1). */}
      <View style={styles.statsRow}>
        {(
          [
            ['Runs', def.runCount, 'All', undefined],
            ['Successes', def.okCount, 'Success', dash(def.okCount) ? palette.neutral[500] : status.ok],
            ['Failures', def.failCount, 'Failed', dash(def.failCount) ? palette.neutral[500] : status.err],
          ] as const
        ).map(([label, value, filter, valueColor]) => (
          <StatTileButton
            key={label}
            testID={`flow-stat-${filter}`}
            accessibilityLabel={`${label}: see these runs in Activity`}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/activity',
                params: { flow: def.key, flowName: def.name, filter },
              })
            }
            value={value}
            label={label}
            size="sm"
            valueColor={valueColor}
          />
        ))}
      </View>

      <View>
        <SectionLabel>CONNECTIONS</SectionLabel>
        <SurfaceCard style={styles.connectionsCard}>
          {def.connections.map((c, i) => {
            const IconCmp = c.icon;
            return (
              <View
                key={c.id}
                style={[
                  styles.connectionRow,
                  i < def.connections.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: palette.divider,
                  },
                ]}>
                <IconCmp size={20} color={palette.accentRamp[300]} />
                <View style={styles.connectionBody}>
                  <Text style={[styles.connectionName, { color: palette.text }]}>{c.name}</Text>
                  <Text style={[styles.connectionSub, { color: palette.neutral[400] }]}>
                    {c.sub}
                  </Text>
                </View>
                <Text style={[styles.connectionStatus, { color: connectionTone(c.tone) }]}>
                  {c.status}
                </Text>
              </View>
            );
          })}
        </SurfaceCard>
        {/* The way to the accounts it is owed, as the website links each card's
            unmet connections to its Connections page. An archived flow goes
            live no more, so it is owed nothing. */}
        {!def.removed && def.connections.length > 0 ? (
          <Text style={[styles.owed, { color: status.warnText }]}>
            <Text
              accessibilityRole="link"
              onPress={pressed(() => router.push('/(tabs)/settings/connections'))}
              suppressHighlighting
              style={[styles.owedLink, { color: palette.accentRamp[300] }]}>
              Connect {def.connections.map((c) => c.name).join(', ')}
            </Text>{' '}
            before going live.
          </Text>
        ) : null}
      </View>

      <View>
        <SectionLabel>PIPELINE</SectionLabel>
        <View style={styles.pipeline}>
          {def.steps.map((st) => (
            <View key={st.id}>
              <StepCard step={st} />
              {st.more ? (
                <View style={[styles.connector, { borderColor: palette.accentRamp[700] }]} />
              ) : null}
            </View>
          ))}
        </View>
      </View>

      {def.removed ? (
        // Read-only (24.11.8): no status, no actions. The one thing to do with an
        // archived flow is unarchive it — "Add it again" until the owner's build
        // 12 item 4, the same action: Setup for its template, in the team it had,
        // a fresh setup — or, once the workspace holds it again in any team (D3;
        // item 9: one flow per workspace), open that copy instead.
        <SurfaceCard style={styles.removedCard}>
          {twin ? (
            <>
              <Text style={[styles.note, { color: palette.neutral[400] }]}>
                {archivedFlowAddedAgainBody(def.removedOn)}
              </Text>
              <PillButton
                label={OPEN_LIVE_FLOW_LABEL}
                variant="secondary"
                height={44}
                fontSize={typeScale.label.fontSize}
                onPress={() => router.push({ pathname: detailPath, params: { flow: twin.id } })}
              />
            </>
          ) : (
            <>
              <Text style={[styles.note, { color: palette.neutral[400] }]}>{archivedFlowBody(def.removedOn)}</Text>
              <PillButton
                label={UNARCHIVE_LABEL}
                variant="primary"
                height={44}
                fontSize={typeScale.label.fontSize}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/flows/setup',
                    params: { template: def.templateId, ...(def.projectId ? { project: def.projectId } : {}) },
                  })
                }
              />
            </>
          )}
        </SurfaceCard>
      ) : null}
      {!def.removed && entry && !entry.available ? (
        <Text style={[styles.note, { color: status.warnText }]}>{UNAVAILABLE_NOTE}</Text>
      ) : null}
      {!def.removed && actionError ? (
        <ActionFailure message={actionError} retryLabel="Try again" onRetry={changeStatus} />
      ) : null}
      {def.removed ? null : (
      <AutomationActions
        name={def.name}
        subscription={subscription}
        entry={entry}
        live={current === 'Live'}
        shownWorkspaceId={flows.loadedFor}
        canAdminister={administers(roleIn(session, flows.loadedFor))}
        onChanged={flows.reload}
        // To the list, whichever way detail was reached — a cross-tab replace
        // from Setup leaves nothing to go back to.
        onArchived={() => router.dismissTo('/(tabs)/flows')}
        onRunStarted={(runId) => router.push({ pathname: '/(tabs)/(home)/run', params: { runId } })}
        statusRow={
          <View style={styles.actions}>
            <PillButton
              label={busy ? 'Saving…' : action.label}
              variant="secondary"
              height={46}
              fontSize={typeScale.label.fontSize}
              icon={ActionIcon}
              iconSize={16}
              style={styles.actionBtn}
              disabled={busy || (goingLive && !canGoLive)}
              onPress={changeStatus}
            />
          </View>
        }
      />
      )}
    </ScrollView>
  );
}

/** The Flows tab's own page: a live twin opens here too. */
export default function WorkflowDetailScreen() {
  return <WorkflowDetail detailPath="/(tabs)/flows/detail" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  removedBadge: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  removedCard: { padding: 14, gap: 12 },
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
    marginTop: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  connectionsCard: {
    marginTop: 9,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  connectionBody: {
    flex: 1,
    minWidth: 0,
  },
  connectionName: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
  },
  connectionSub: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  connectionStatus: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  owed: {
    marginTop: 8,
    fontFamily: fonts.regular,
    ...typeScale.small,
  },
  owedLink: {
    fontFamily: fonts.medium,
  },
  pipeline: {
    marginTop: 10,
  },
  connector: {
    width: 1.5,
    height: 20,
    marginLeft: 32,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  actionBtn: {
    flex: 1,
  },
});
