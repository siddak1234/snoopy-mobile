import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CaretRight, Pause, Play, RocketLaunch } from 'phosphor-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AutomationActions } from '@/components/automations/automation-actions';
import { StartRun, canStartRun } from '@/components/automations/start-run';
import { ConnectionMark, ConnectionRow, NoneMark } from '@/components/connection-row';
import type { ArchivedFlowPath } from '@/components/flows/archived-flows';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { StatusPill } from '@/components/nocturne/status-pill';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { pressed } from '@/components/pressable';
import { ConnectionsCard } from '@/components/settings/connections-card';
import { chosenVendor, connectionFields } from '@/components/setup-field';
import { StatTileButton } from '@/components/stat-tile-button';
import { em, fonts, iconSize, layout, status, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ActionFailure, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { roleIn, useSession, workspaceIfShown } from '@/hooks/use-session';
import { statusAction, useWorkflows, type FlowStatus } from '@/hooks/use-workflows';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import {
  CONNECTIONS_LABEL,
  DASHBOARD_LABEL,
  OPEN_LIVE_FLOW_LABEL,
  SETUP_TURNING_ON,
  SETUP_TURN_ON,
  STEPS_LABEL,
  UNARCHIVE_LABEL,
  UNAVAILABLE_NOTE,
  VENDOR_CONNECTED,
  VENDOR_NONE_SUB,
  VENDOR_NOT_CONNECTED,
  archivedFlowAddedAgainBody,
  archivedFlowBody,
  connectFirst,
  connectFirstOrNone,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { readCatalog, readConnectionProviders, readConnections } from '@/lib/platform/catalog';
import { updateSubscription } from '@/lib/platform/automations';
import { readProjects } from '@/lib/platform/projects';
import {
  readRemovedSubscriptionsOrNone,
  readRunStats,
  readRunStatsNow,
  readSubscriptions,
  type RunSubscriptionCounts,
} from '@/lib/platform/runs';
import {
  addedAgainAs,
  connectionState,
  scopeLabels,
  toConnectionRow,
  toFlows,
  toRemovedFlows,
  type FlowView,
} from '@/lib/view/catalog';
import { EMPTY, count } from '@/lib/view/format';
import { flowStepPlan } from '@/lib/view/pipeline';
import { administers } from '@/lib/view/roles';
import { FLOW_STATS_REREAD_MS } from '@/lib/view/runs';
import { statusLabel } from '@/lib/view/status';

const ACTION_ICON = { pause: Pause, play: Play, rocket: RocketLaunch } as const;

/**
 * The flow page — the run page for a flow (Build 21, spec A6; the owner's AM4 of
 * 2026-10-15: "set up page is initial, after that flow page is the run page …
 * when a user clicks a flow it shows basically steps to run now in the way i
 * described in feedback"). The TEST VERSION of his order (D3: "lets test this
 * flow page order first then we can agree if it should be the standard. it
 * should be easy for a user to run something"), top to bottom:
 *
 * 1. its name, its status and its team — no description (the session's S24);
 * 2. **DASHBOARD** — Runs, Successes, Failures, live: read again each time the
 *    page is shown and every 5 s while a run of this flow is pending or running
 *    (the owner's build 20 item 10: "Dashboard items should be updated too";
 *    the session's S30); a tile opens Activity for it;
 * 3. **STEPS** — numbered, one per group (or step); Step 1 holds the document
 *    and Start run (Turn on while it is off), and the step that writes to a
 *    vendor shows the vendor chosen: its mark, its name, "Connected" or "Not
 *    connected" — the whole row opens Connect vendor (~~a Connect vendor button,
 *    drawn whatever the connection's state~~, the owner's build 20 items 4–5);
 * 4. **CONNECTIONS** — every account the flow uses, the one connection row;
 * 5. at the bottom its actions: Pause while it is on (Turn on is Step 1's while
 *    it is off), the move to a newer version, **Edit setup** (Set up again),
 *    the webhook address, Archive.
 *
 * Drawn in the Flows stack and, for an archived flow opened from Settings, in
 * the Settings stack (24.12); `detailPath` is where its live twin opens (build
 * 11, D3), in the same stack, as the archived list's rows open there.
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
  const [notice, setNotice] = useState<string | null>(null);
  // One key per target status: a retry of Pause keeps its key, and a Resume
  // after a re-read is a different intent with its own.
  const statusKeys = useIntentKeys('status');

  /**
   * This flow, by subscription id: the subscription for its status, the catalog
   * for its name, steps and accounts, `run-stats` for its tiles, and the
   * workspace's connections for the vendor row's state and CONNECTIONS. The
   * subscription and its catalog entry are kept as read, for Step 1 (`StartRun`)
   * and the actions (`AutomationActions`).
   */
  const flows = useWorkspaceResource(async (workspaceId) => {
    const [subs, catalog, stats, providers, projects, removed, held] = await Promise.all([
      readSubscriptions(workspaceId),
      readCatalog(workspaceId),
      readRunStats(workspaceId),
      readConnectionProviders(),
      readProjects(workspaceId),
      readRemovedSubscriptionsOrNone(workspaceId),
      readConnections(workspaceId),
    ]);
    const labels = scopeLabels(projects);
    const byProvider = new Map(providers.providers.map((p) => [p.providerId, p]));
    return {
      // An archived flow is read here too (24.11.8): its page stays, read-only,
      // so a run row that names it opens something rather than "Couldn't load".
      flows: [
        ...toFlows(subs.subscriptions, catalog.automations, stats.subscriptions, byProvider, labels),
        ...toRemovedFlows(removed.subscriptions, catalog.automations, stats.subscriptions, labels),
      ],
      // An archived flow's own row too, so its page can say what it was.
      subscriptions: [...subs.subscriptions, ...removed.subscriptions],
      automations: catalog.automations,
      providers: byProvider,
      connections: held.connections,
      counts: stats.subscriptions,
    };
  });

  // DASHBOARD, live (S30): this flow's counts as last read past the snapshot.
  const [live, setLive] = useState<{ flow: string; counts: RunSubscriptionCounts | null } | null>(null);
  const [statReads, setStatReads] = useState(0);
  const [focused, setFocused] = useState(true);
  const shownFor = flows.loadedFor;
  const readStats = useRef<() => void>(() => undefined);
  readStats.current = () => {
    if (!flow || !shownFor) return;
    readRunStatsNow(shownFor)
      .then((stats) => setLive({ flow, counts: stats.subscriptions.find((c) => c.subscriptionId === flow) ?? null }))
      // A read that fails leaves the tiles as they were; the next one may answer.
      .catch(() => undefined)
      .finally(() => setStatReads((n) => n + 1));
  };
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // The first showing has just read them; every return reads them again.
      if (focusedOnce.current) readStats.current();
      else focusedOnce.current = true;
      return () => setFocused(false);
    }, []),
  );
  const counts =
    live && live.flow === flow
      ? live.counts
      : flows.status === 'ready'
        ? (flows.data.counts.find((c) => c.subscriptionId === flow) ?? null)
        : null;
  const running = (counts?.pending ?? 0) + (counts?.running ?? 0) > 0;
  useEffect(() => {
    if (!running || !focused) return;
    const timer = setTimeout(() => readStats.current(), FLOW_STATS_REREAD_MS);
    return () => clearTimeout(timer);
  }, [running, focused, statReads]);

  const def: FlowView | undefined =
    flows.status === 'ready' ? flows.data.flows.find((f) => f.key === flow) : undefined;
  const subscription =
    flows.status === 'ready' && def ? flows.data.subscriptions.find((s) => s.id === def.key) : undefined;
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

  // Turn on is offered only where it can succeed, as the website offers it: every
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
    return <ScreenUnavailable title={errorTitleFor('detail')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (!def || !subscription || flows.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('detail')}
        onRetry={() => flows.reload()}
        body={busyBody(flows)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  const { providers, connections: held } = flows.data;
  const canManage = administers(roleIn(session, flows.loadedFor));
  const connectionOf = (providerId: string) => held.find((connection) => connection.providerId === providerId);

  // A draft has never run: the design's em dash, never "0".
  const draft = subscription.status === 'draft';
  const tile = (value: number | undefined) => (draft ? EMPTY : count(value ?? 0));
  const dash = (v: string) => v === EMPTY;

  // Each step's vendor choice (backend ADR-0040), from the version the flow
  // runs; the catalog's, absent that. A connection is optional only where that
  // version has the choice: a flow on an older version without it (Invoice
  // Processing v1) still needs QuickBooks, and says so (the review of the
  // Invoice Processing screens).
  const vendorFields = connectionFields(subscription.setup ?? entry?.setup ?? []);
  const declared = entry?.requiredConnections ?? [];
  const optional = new Set(vendorFields.length > 0 ? declared.filter((c) => c.optional).map((c) => c.providerId) : []);
  const nameOf = (providerId: string) =>
    declared.find((c) => c.providerId === providerId)?.displayName ?? providers.get(providerId)?.displayName ?? providerId;
  // What it is owed: a chosen vendor not connected, then each account it cannot run without.
  const vendorOwed = vendorFields
    .map((field) => chosenVendor(field, subscription.config))
    .filter((chosen) => chosen !== 'none' && connectionState(connectionOf(chosen)) !== 'connected');
  const owed = def.connections.filter((c) => !optional.has(c.id) && !vendorOwed.includes(c.id));
  const openVendor = (field: string) =>
    router.push({ pathname: '/(tabs)/flows/vendor', params: { flow: def.key, field } });

  // STEPS by the catalog's groups only for the version they were declared for;
  // a flow on another version gets its steps by title, as an ungrouped
  // manifest draws them (spec §3.D) — never another version's groups.
  const plan = flowStepPlan(
    entry?.pipeline,
    entry?.version === subscription.templateVersion ? entry.groups : undefined,
    vendorFields,
  );

  /** The vendor a step writes to: its mark, its name, its state — the whole row opens Connect vendor. */
  const vendorRow = (key: string) => {
    const field = vendorFields.find((candidate) => candidate.key === key)!;
    const chosen = chosenVendor(field, subscription.config);
    const none = chosen === 'none';
    const connected = !none && connectionState(connectionOf(chosen)) === 'connected';
    return (
      <View key={key} style={{ borderTopWidth: 1, borderTopColor: palette.divider }}>
        <ConnectionRow
          testID={`flow-vendor-${key}`}
          accessibilityLabel={`${none ? 'None' : nameOf(chosen)}: change the vendor`}
          mark={none ? <NoneMark /> : <ConnectionMark icon={providers.get(chosen)?.icon} />}
          name={none ? 'None' : nameOf(chosen)}
          line={none ? VENDOR_NONE_SUB : connected ? VENDOR_CONNECTED : VENDOR_NOT_CONNECTED}
          lineTone={none ? 'muted' : connected ? 'ok' : 'warn'}
          right={def.removed ? null : <CaretRight size={15} color={palette.neutral[500]} />}
          onPress={def.removed ? undefined : () => openVendor(key)}
        />
      </View>
    );
  };

  // Step 1: the run's fields and Start run (BUILD-PLAN 25.8.3, inside its step
  // since Build 21); Turn on in Start run's place while the flow is off; and
  // what it is owed, each a tap from where it is fixed.
  const startable = canStartRun(subscription, entry, current === 'Live');
  const turnOn = (
    <PillButton
      testID="flow-step-turn-on"
      label={busy ? SETUP_TURNING_ON : SETUP_TURN_ON}
      variant="primary"
      height={46}
      fontSize={typeScale.label.fontSize}
      icon={RocketLaunch}
      iconSize={iconSize.button}
      disabled={busy || !canGoLive}
      onPress={changeStatus}
    />
  );
  const stepOne = def.removed ? null : (
    <View>
      {startable ? (
        <StartRun
          key={`${subscription.id}:${subscription.templateVersion}`}
          subscriptionId={subscription.id}
          shownWorkspaceId={flows.loadedFor}
          runInput={subscription.runInput ?? []}
          onStarted={(runId) => router.push({ pathname: '/(tabs)/(home)/run', params: { runId } })}
        />
      ) : current !== 'Live' ? (
        (subscription.runInput ?? []).length > 0 ? (
          <StartRun
            key={`${subscription.id}:${subscription.templateVersion}:off`}
            subscriptionId={subscription.id}
            shownWorkspaceId={flows.loadedFor}
            runInput={subscription.runInput ?? []}
            onStarted={(runId) => router.push({ pathname: '/(tabs)/(home)/run', params: { runId } })}
            action={turnOn}
          />
        ) : (
          <View style={styles.stepAction}>{turnOn}</View>
        )
      ) : null}
      {vendorOwed.map((chosen) => {
        const field = vendorFields.find((candidate) => chosenVendor(candidate, subscription.config) === chosen)!;
        return (
          <Text
            key={`owed-${field.key}`}
            testID="flow-vendor-owed"
            accessibilityRole="link"
            onPress={pressed(() => openVendor(field.key))}
            suppressHighlighting
            style={[styles.owed, { color: palette.accentRamp[300] }]}>
            {connectFirstOrNone(nameOf(chosen))}
          </Text>
        );
      })}
      {owed.length > 0 ? (
        <Text
          testID="flow-owed"
          accessibilityRole="link"
          onPress={pressed(() => router.push('/(tabs)/settings/connections'))}
          suppressHighlighting
          style={[styles.owed, { color: palette.accentRamp[300] }]}>
          {connectFirst(owed.map((c) => c.name).join(', '))}
        </Text>
      ) : null}
    </View>
  );

  // CONNECTIONS: every account the flow uses, in the manifest's order, the one row (spec A4) —
  // then any the platform says it is owed that the catalog does not name (a platform from
  // before `requiredConnections`). One this deployment does not list is named in Step 1 only.
  const used = [...new Set([...declared.map((c) => c.providerId), ...subscription.unmetConnections])];
  const connectionRows = used.flatMap((providerId) => {
    const provider = providers.get(providerId);
    return provider ? [toConnectionRow(provider, connectionOf(providerId))] : [];
  });

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}>
      <View style={styles.headerRow}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{def.name}</Text>
          {def.scope ? (
            <Text testID="flow-team" style={[styles.team, { color: palette.neutral[400] }]}>
              {def.scope}
            </Text>
          ) : null}
        </View>
        {def.removed ? (
          <Text style={[styles.removedBadge, { color: palette.neutral[400] }]}>Archived</Text>
        ) : (
          <StatusPill label={current} />
        )}
      </View>

      {/* DASHBOARD: the three tiles open Activity for this flow and that outcome, over all time (24.11.9). */}
      <View testID="flow-dashboard">
        <SectionLabel>{DASHBOARD_LABEL}</SectionLabel>
        <View style={[styles.statsRow, styles.underLabel]}>
          {(
            [
              ['Runs', tile(counts?.total), 'All', undefined],
              ['Successes', tile(counts?.succeeded), 'Success', status.ok],
              ['Failures', tile(counts?.failed), 'Failed', status.err],
            ] as const
          ).map(([label, value, filter, tone]) => (
            <StatTileButton
              key={label}
              testID={`flow-stat-${filter}`}
              accessibilityLabel={`${label}: see these runs in Activity`}
              onPress={() =>
                router.push({ pathname: '/(tabs)/activity', params: { flow: def.key, flowName: def.name, filter } })
              }
              value={value}
              label={label}
              size="sm"
              valueColor={dash(value) ? palette.neutral[500] : tone}
            />
          ))}
        </View>
      </View>

      <View testID="flow-steps">
        <SectionLabel>{STEPS_LABEL}</SectionLabel>
        <SurfaceCard style={styles.underLabel}>
          {/* A flow whose template the catalog no longer lists has no steps to hold Step 1's controls: they stand alone. */}
          {plan.rows.length === 0 ? stepOne : null}
          {plan.rows.map((row, i) => (
            <View
              key={row.id}
              testID={`flow-step-${row.id}`}
              style={i < plan.rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider }}>
              <View style={styles.stepRow}>
                <Text style={[styles.stepLabel, { color: palette.text }]}>{row.label}</Text>
                <Text style={[styles.stepSub, { color: palette.neutral[400] }]}>{row.sub}</Text>
              </View>
              {row.input ? stepOne : null}
              {row.vendorFields.map(vendorRow)}
            </View>
          ))}
        </SurfaceCard>
        {/* A vendor choice its version places in no step (v2, from before `group`): under the steps. */}
        {plan.unplaced.length > 0 ? (
          <SurfaceCard style={styles.gapAbove}>{plan.unplaced.map(vendorRow)}</SurfaceCard>
        ) : null}
      </View>

      {!def.removed && connectionRows.length > 0 ? (
        <View testID="flow-connections">
          <SectionLabel>{CONNECTIONS_LABEL}</SectionLabel>
          <View style={styles.underLabel}>
            <ConnectionsCard
              testID="flow-connections-card"
              rows={connectionRows}
              loadedFor={flows.loadedFor}
              canManage={canManage}
              notice={notice}
              onNotice={setNotice}
              onChanged={flows.refresh}
            />
          </View>
        </View>
      ) : null}

      {def.removed ? (
        // Read-only (24.11.8): no status, no actions. The one thing to do with an
        // archived flow is unarchive it — "Add it again" until the owner's build
        // 12 item 4, the same action: Setup for its template, in the team it had,
        // a fresh setup — or, once the workspace holds it again in any team (D3;
        // item 9: one flow per workspace), open that copy instead.
        <SurfaceCard style={styles.removedCard}>
          {twin ? (
            <>
              <Text style={[styles.note, { color: palette.neutral[400] }]}>{archivedFlowAddedAgainBody(def.removedOn)}</Text>
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
                // Setup for its flow, a fresh setup; it goes to its category's team (ADR-0036).
                onPress={() => router.push({ pathname: '/(tabs)/flows/setup', params: { template: def.templateId } })}
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
          shownWorkspaceId={flows.loadedFor}
          canAdminister={canManage}
          onChanged={flows.reload}
          // To the list, whichever way detail was reached — a cross-tab replace
          // from Setup leaves nothing to go back to.
          onArchived={() => router.dismissTo('/(tabs)/flows')}
          // Pause while it is on; while it is off, Turn on is Step 1's (spec A6), never a second button here.
          statusRow={
            current !== 'Live' ? null : (
              <View style={styles.actions}>
                <PillButton
                  label={busy ? 'Working…' : action.label}
                  variant="secondary"
                  height={46}
                  fontSize={typeScale.label.fontSize}
                  icon={ActionIcon}
                  iconSize={iconSize.button}
                  style={styles.actionBtn}
                  disabled={busy || (goingLive && !canGoLive)}
                  onPress={changeStatus}
                />
              </View>
            )
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
  root: { flex: 1 },
  removedBadge: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  removedCard: { padding: 14, gap: 12 },
  content: { paddingHorizontal: layout.screenX, paddingBottom: 20, gap: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  team: { marginTop: 1, fontFamily: fonts.regular, fontSize: typeScale.body.fontSize },
  statsRow: { flexDirection: 'row', gap: 10 },
  underLabel: { marginTop: 9 },
  gapAbove: { marginTop: 10 },
  stepRow: { gap: 2, paddingVertical: 12, paddingHorizontal: 14 },
  stepLabel: { fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  stepSub: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  stepAction: { paddingHorizontal: 14, paddingBottom: 14 },
  owed: { paddingHorizontal: 14, paddingBottom: 12, fontFamily: fonts.medium, ...typeScale.small },
  actions: { flexDirection: 'row', gap: 10 },
  note: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  actionBtn: { flex: 1 },
});
