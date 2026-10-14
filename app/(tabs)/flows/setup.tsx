import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  NumberedSectionLabel,
  SetupFieldRow,
  bySection,
  chosenVendor,
  connectionField,
  missingRequiredSetupFields,
  rowFields,
  sectionLabel,
} from '@/components/setup-field';
import { BackCircle } from '@/components/nocturne/back-circle';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import {
  ActionFailure,
  ScreenError,
  ScreenLoading,
  ScreenOffline,
  ScreenUnavailable,
} from '@/components/screen-state';
import { Pressable } from '@/components/pressable';
import { NoVendorMark, VendorMark } from '@/components/vendor-logo';
import { em, fonts, layout, status, typeScale, withAlpha } from '@/constants/theme';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme } from '@/hooks/use-theme';
import { ALREADY_IN_WORKSPACE, WORKSPACE_CHANGED, turnOnRefusal } from '@/lib/content/refusals';
import {
  CONNECT_VENDOR,
  SETUP_TURN_ON,
  SETUP_TURNING_ON,
  UNAVAILABLE_NOTE,
  VENDOR_NOT_CONNECTED,
  connectFirst,
  connectFirstOrNone,
  enterAnAmount,
  errorTitleFor,
  fillIn,
  teamLine,
} from '@/lib/content/screen-states';
import { createSubscription, updateSubscription } from '@/lib/platform/automations';
import { readCatalog, readConnectionProviders, readConnections } from '@/lib/platform/catalog';
import { newIdempotencyKey } from '@/lib/platform/client';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readProjects } from '@/lib/platform/projects';
import { readSubscriptions, readSubscriptionsNow } from '@/lib/platform/runs';
import { heldAs, scopeLabel, scopeLabels } from '@/lib/view/catalog';

/**
 * One-time setup generated from the selected manifest — and, since the Invoice
 * Processing update (2026-10-14; the spec's §3.B), with no team to pick: a flow
 * goes to the team of its category, which the platform finds or makes (backend
 * ADR-0036; the owner: "theres no choose a team. there will be pre existing
 * teams depending on which flows are added"), so the screen says it — "Team:
 * Accounting" — and sends none. A flow the workspace holds already (the owner's
 * build 12 item 9) is configured where it is, and says its own team.
 *
 * Its sections are numbered steps (spec §3.0 rule 1): 1 · CONNECT, then the
 * manifest's own sections — SOURCE, SETTINGS, EMAIL — in its order. CONNECT
 * holds the flow's vendor choice (backend ADR-0037), its logo or None and
 * "Connect vendor ›" to the flow's own vendor page, and any account the flow
 * cannot run without, with Connected ✓ or Connect ›. Turn on adds the flow and
 * turns it on, in one press, with everything it holds; what it cannot send is
 * said in the spec's words, and nothing is sent.
 */
export default function SetupScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { setActive } = useSolutions();
  // `vendor`: the choice Connect vendor's Done brought back, for a flow not added yet.
  const { template, vendor } = useLocalSearchParams<{ template?: string; vendor?: string }>();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [localSubscription, setLocalSubscription] = useState<
    Awaited<ReturnType<typeof createSubscription>>['subscription'] | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createKey = useRef(newIdempotencyKey('subscribe'));
  // An add was sent and no answer came back — offline, or a 5xx: it may have
  // been made. Try again replays it with the same key, and the platform answers
  // with the flow it made, rather than this screen refusing a flow it added
  // itself as "already in this workspace".
  const addUnanswered = useRef(false);
  const updateKey = useRef(newIdempotencyKey('activate'));
  const hasFocused = useRef(false);

  const resource = useWorkspaceResource(
    async (id) => {
      if (!template) throw new PlatformNotConfiguredError();
      const [catalog, subscriptions, providers, projects, connections] = await Promise.all([
        readCatalog(id),
        readSubscriptions(id),
        readConnectionProviders(),
        readProjects(id),
        readConnections(id),
      ]);
      return {
        entry: catalog.automations.find((item) => item.templateId === template),
        // Where the workspace holds it, in any team (the owner's build 12 item
        // 9): one copy, or two added before the rule. An archived one is gone:
        // unarchiving makes a new subscription.
        subscriptions: heldAs(template, subscriptions.subscriptions),
        providers: new Map(providers.providers.map((item) => [item.providerId, item])),
        // Every team's name, an archived team's too: a held flow says where it is.
        labels: scopeLabels(projects),
        // The accounts this workspace holds: the CONNECT step reads its state here.
        connected: new Set(
          connections.connections
            .filter((connection) => connection.status === 'connected')
            .map((connection) => connection.providerId),
        ),
      };
    },
    [template],
  );
  const reloadResource = resource.reload;

  // A connection happens on Settings or the vendor page and changes what is
  // connected. Re-read when this screen regains focus so returning advances the
  // same draft instead of trapping the person in a stale connect loop.
  useFocusEffect(
    useCallback(() => {
      if (hasFocused.current) {
        // A local draft predates the connection made elsewhere. Let the
        // refreshed server subscription become authoritative again.
        setLocalSubscription(null);
        reloadResource();
      }
      else hasFocused.current = true;
    }, [reloadResource]),
  );

  if (resource.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (resource.status === 'offline') {
    return <ScreenOffline onRetry={() => resource.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status === 'unconfigured') {
    // No backend, no workspace, or no flow named: a second attempt cannot change
    // that, so no Retry (the unavailable state, as every fetching screen has).
    return <ScreenUnavailable title={errorTitleFor('setup')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status !== 'ready' || !resource.data.entry) {
    return (
      <ScreenError
        title={errorTitleFor('setup')}
        onRetry={() => resource.reload()} body={busyBody(resource)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const { entry, providers, labels, connected } = resource.data;
  // The copy the workspace holds already (the owner's build 12 item 9), or the
  // one this screen added — held from that moment, a draft still owed an
  // account or one whose activation failed: Setup configures it, where it is.
  const placed = localSubscription ?? resource.data.subscriptions[0];
  // The catalog's settings — the version Turn on adds, and the one a held flow
  // on that version runs — but a held flow on another version keeps its own:
  // the newest version's keys are refused as undeclared (the review of the
  // Invoice Processing screens).
  const setup =
    placed && placed.templateVersion !== entry.version ? (placed.setup ?? entry.setup) : entry.setup;
  // The accounts the flow names. An `optional` one is the flow's to choose, or
  // not (backend ADR-0037) — where its version has the choice; the rest it
  // cannot run without. A platform from before the field sent none of it: then
  // nothing is drawn, and the platform still refuses an activation that lacks
  // an account.
  const vendorField = connectionField(setup);
  const connections = entry.requiredConnections ?? [];
  const optional = new Set(
    vendorField ? connections.filter((connection) => connection.optional).map((c) => c.providerId) : [],
  );
  const required = connections.filter((connection) => !optional.has(connection.providerId));
  // What Connect vendor brought back counts only when it is one of this flow's
  // choices — None or one of its vendors — never a name a link made up.
  const brought = vendor && (vendor === 'none' || optional.has(vendor)) ? vendor : undefined;
  // The vendor chosen: what Connect vendor brought back for a flow not added
  // yet, else what the flow holds, else its default — None.
  const chosen = !placed && brought ? brought : chosenVendor(vendorField, placed?.config);
  const chosenName =
    connections.find((connection) => connection.providerId === chosen)?.displayName ??
    providers.get(chosen)?.displayName ??
    chosen;
  const hasConnect = vendorField !== undefined || required.length > 0;
  const sectionOffset = hasConnect ? 1 : 0;

  const setField = (key: string, value: unknown) => {
    setConfig((previous) => ({ ...previous, [key]: value }));
    updateKey.current = newIdempotencyKey('activate');
  };

  const valueOf = (field: (typeof setup)[number]) =>
    field === vendorField
      ? chosen
      : field.key in config
        ? config[field.key]
        : (placed?.config[field.key] ?? field.defaultValue);

  const activate = async () => {
    // Reachability is the platform's evidence, not this client's guess: a flow
    // that is not answering only defers the failure to the first run.
    if (!entry.available) {
      setActionError(UNAVAILABLE_NOTE);
      return;
    }
    // The vendor chosen must be connected; None needs nothing.
    if (vendorField && chosen !== 'none' && !connected.has(chosen)) {
      setActionError(connectFirstOrNone(chosenName));
      return;
    }
    // Every account it cannot run without that is not connected: what the
    // catalog names, and what a flow it holds is still owed — a platform from
    // before `requiredConnections` names none, and the subscription still says.
    const owed = new Map(
      required
        .filter((connection) => !connected.has(connection.providerId))
        .map((connection) => [connection.providerId, connection.displayName]),
    );
    for (const providerId of placed?.unmetConnections ?? []) {
      if (!optional.has(providerId) && !connected.has(providerId) && !owed.has(providerId)) {
        owed.set(providerId, providers.get(providerId)?.displayName ?? providerId);
      }
    }
    if (owed.size > 0) {
      setActionError(connectFirst([...owed.values()].join(', ')));
      return;
    }
    // A field this person cleared stays cleared: `??` read a cleared field as
    // untouched and put the default back under their thumb (24.7.3 attempt 2).
    const configured = Object.fromEntries(setup.map((field) => [field.key, valueOf(field)]));
    const missing = missingRequiredSetupFields(setup, configured);
    if (missing.length > 0) {
      setActionError(fillIn(missing.map((field) => field.title).join(', ')));
      return;
    }
    // A money field holds a number or nothing can be turned on: an empty amount
    // would silently fall back to the flow's own default.
    const blankMoney = setup.filter(
      (field) =>
        field.control === 'money' && (configured[field.key] === undefined || configured[field.key] === ''),
    );
    if (blankMoney.length > 0) {
      setActionError(enterAnAmount(blankMoney.map((field) => field.title).join(', ')));
      return;
    }
    const workspaceId = workspaceIfShown(session, resource.loadedFor);
    if (!workspaceId) {
      setActionError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setActionError(null);
    let adding = false;
    try {
      let current = placed;
      if (!current) {
        // A workspace holds each flow once (the owner's build 12 item 9): a copy
        // another person or screen added since this screen read the flows is
        // refused here, in the website's words, and nothing is sent. Read
        // afresh: the snapshot's answer can be 15 s old. Not after an add that
        // went unanswered: the copy found may be that add's own, and its replay
        // (the same key) is what says so.
        if (!addUnanswered.current) {
          const { subscriptions } = await readSubscriptionsNow(workspaceId);
          if (heldAs(entry.templateId, subscriptions).length > 0) {
            setActionError(ALREADY_IN_WORKSPACE);
            return;
          }
        }
        // No team is sent: the platform puts the flow in its category's team
        // (backend ADR-0036) and puts this person on it.
        adding = true;
        const created = await createSubscription(
          workspaceId,
          { templateId: entry.templateId, templateVersion: entry.version },
          createKey.current,
        );
        adding = false;
        addUnanswered.current = false;
        current = created.subscription;
        setLocalSubscription(current);
        // Spent: a later Turn on here — after this subscription is archived,
        // say — is a new intent, and replaying this one would answer with a
        // subscription that no longer counts.
        createKey.current = newIdempotencyKey('subscribe');
        // The create changed what `configured` falls back to; the same key with a
        // different body is a 409 by contract, so a new basis is a new intent.
        updateKey.current = newIdempotencyKey('activate');
        // Added, and still owed an account the catalog did not name: said, and
        // held where it is — Turn on again, once connected, turns on this copy.
        const stillOwed = current.unmetConnections.filter(
          (providerId) => !optional.has(providerId) && !connected.has(providerId),
        );
        if (stillOwed.length > 0) {
          setActionError(connectFirst(stillOwed.map((id) => providers.get(id)?.displayName ?? id).join(', ')));
          return;
        }
      }

      const updated = await updateSubscription(
        workspaceId,
        current.id,
        { config: configured, status: 'live' },
        updateKey.current,
      );
      setLocalSubscription(updated.subscription);
      // The platform accepted `live`: the plan membership shared with the
      // catalog and Settings is stated, not flipped.
      setActive(entry.templateId, true);
      // Spent intent; a later edit-and-turn-on must not replay this one.
      updateKey.current = newIdempotencyKey('activate');
      // Leave Flows at its root before opening the flow: a `replace` across
      // tabs left this screen in its history (24.7.3 attempt 2, feedback #3).
      router.dismissTo('/(tabs)/flows');
      router.push({ pathname: '/(tabs)/flows/detail', params: { flow: updated.subscription.id } });
    } catch (error) {
      // No answer to the add (offline, a 5xx): Try again replays it. Any other
      // answer was the platform's word, and the next press checks afresh.
      if (adding) addUnanswered.current = !(error instanceof PlatformError) || error.status >= 500;
      setActionError(turnOnRefusal(error, adding));
    } finally {
      setBusy(false);
    }
  };

  const openVendors = () =>
    router.push({
      pathname: '/(tabs)/flows/vendor',
      params: {
        template: entry.templateId,
        // An added flow saves its own choice there; one not added yet brings it back here.
        ...(placed ? { flow: placed.id } : { vendor: chosen }),
      },
    });

  const sections = bySection(rowFields(setup));

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>Set up {entry.name}</Text>
          {/* Its team: where it is, once added; where it goes, its category's, until then. */}
          <Text testID="setup-team" style={[styles.subtitle, { color: palette.neutral[400] }]}>
            {placed ? scopeLabel(placed.projectId, labels) : teamLine(entry.category)}
          </Text>
        </View>
      </View>

      {hasConnect ? (
        <View>
          <NumberedSectionLabel>{sectionLabel(1, 'connections')}</NumberedSectionLabel>
          <SurfaceCard style={styles.sectionCard}>
            {vendorField ? (
              <View
                testID="setup-vendor"
                style={[
                  styles.connectionRow,
                  required.length > 0 && { borderBottomWidth: 1, borderBottomColor: palette.divider },
                ]}>
                <View style={styles.connectionText}>
                  {chosen === 'none' ? (
                    <NoVendorMark />
                  ) : (
                    <VendorMark icon={providers.get(chosen)?.icon} name={chosenName} />
                  )}
                  {chosen !== 'none' && !connected.has(chosen) ? (
                    <Text style={[styles.connectionLine, { color: status.warnText }]}>{VENDOR_NOT_CONNECTED}</Text>
                  ) : null}
                </View>
                <Pressable
                  testID="setup-connect-vendor"
                  accessibilityRole="button"
                  accessibilityLabel={`Connect vendor for ${entry.name}`}
                  onPress={openVendors}
                  style={({ pressed }) => [
                    styles.connectBtn,
                    { borderColor: palette.accent },
                    pressed && { backgroundColor: withAlpha(palette.accent, 0.12) },
                  ]}>
                  <Text style={[styles.connectLabel, { color: palette.accent }]}>{CONNECT_VENDOR}</Text>
                </Pressable>
              </View>
            ) : null}
            {required.map((connection, index) => (
              <View
                key={connection.providerId}
                style={[
                  styles.connectionRow,
                  index < required.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider },
                ]}>
                <View style={styles.connectionText}>
                  <VendorMark icon={providers.get(connection.providerId)?.icon} name={connection.displayName} />
                </View>
                {connected.has(connection.providerId) ? (
                  <Text style={[styles.connectionState, { color: status.ok }]}>Connected ✓</Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Connect ${connection.displayName}`}
                    onPress={() => router.push('/(tabs)/settings/connections')}
                    style={({ pressed }) => [
                      styles.connectBtn,
                      { borderColor: palette.accent },
                      pressed && { backgroundColor: withAlpha(palette.accent, 0.12) },
                    ]}>
                    <Text style={[styles.connectLabel, { color: palette.accent }]}>Connect ›</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </SurfaceCard>
        </View>
      ) : null}

      {/* In the manifest's order, as the website draws them; it can come back to a section, so its place keys it. */}
      {sections.map(({ section, fields }, position) => (
        <View key={`${section}-${position}`}>
          <NumberedSectionLabel>{sectionLabel(position + 1 + sectionOffset, section)}</NumberedSectionLabel>
          <SurfaceCard style={styles.sectionCard}>
            {fields.map((field, index) => (
              <SetupFieldRow
                key={field.key}
                field={field}
                value={valueOf(field)}
                onChange={(next) => setField(field.key, next)}
                divider={index < fields.length - 1}
              />
            ))}
          </SurfaceCard>
        </View>
      ))}

      {actionError ? (
        <ActionFailure message={actionError} retryLabel="Try again" onRetry={activate} />
      ) : null}

      <Pressable
        testID="setup-turn-on"
        disabled={busy}
        onPress={activate}
        style={({ pressed }) => [
          styles.activateBtn,
          { borderColor: palette.accent },
          pressed && { backgroundColor: withAlpha(palette.accent, 0.12) },
        ]}>
        <Text style={[styles.activateLabel, { color: palette.accent }]}>{busy ? SETUP_TURNING_ON : SETUP_TURN_ON}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 18,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  subtitle: { marginTop: 1, fontFamily: fonts.regular, fontSize: typeScale.body.fontSize },
  sectionCard: { marginTop: 9 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  // The logo's clear space (Intuit: half its symbol's height; 12 here) to the line under it.
  connectionText: { flex: 1, minWidth: 0, gap: 12, alignItems: 'flex-start' },
  connectionLine: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  connectionState: { fontFamily: fonts.medium, fontSize: typeScale.body.fontSize },
  connectBtn: { borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  connectLabel: { fontFamily: fonts.medium, fontSize: typeScale.body.fontSize },
  activateBtn: {
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  activateLabel: { fontFamily: fonts.medium, fontSize: typeScale.lead.fontSize, textAlign: 'center' },
});
