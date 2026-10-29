import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InlineBoundary } from '@/components/dialog-boundary';
import { NONE, VendorChoice } from '@/components/flows/vendor-choice';
import {
  NumberedSectionLabel,
  SetupFieldRow,
  bySection,
  chosenVendor,
  connectionFields,
  fieldProviders,
  isSelectField,
  missingRequiredSetupFields,
  rowFields,
  sectionLabel,
} from '@/components/setup-field';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import {
  ActionFailure,
  ScreenError,
  ScreenLoading,
  ScreenOffline,
  ScreenUnavailable,
} from '@/components/screen-state';
import { Pressable } from '@/components/pressable';
import { ConnectionsCard } from '@/components/settings/connections-card';
import { Text } from '@/components/text';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { fonts, space, typeScale, withAlpha } from '@/constants/theme';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { roleIn, useSession, workspaceIfShown } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme } from '@/hooks/use-theme';
import { ALREADY_IN_WORKSPACE, WORKSPACE_CHANGED, turnOnRefusal } from '@/lib/content/refusals';
import {
  CHOOSE_AT_LEAST_ONE,
  SETUP_SAVE,
  SETUP_SAVE_FAILED,
  SETUP_SAVING,
  SETUP_TURN_ON,
  SETUP_TURNING_ON,
  UNAVAILABLE_NOTE,
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
import {
  connectionState,
  heldAs,
  scopeLabel,
  scopeLabels,
  toConnectionRow,
  withoutArchived,
} from '@/lib/view/catalog';
import { administers } from '@/lib/view/roles';

/**
 * Set up — ONE simple page, once, with everything on it (Build 21; the owner's
 * AM4 of 2026-10-15 ~22:15Z: "set up page is initial, after that flow page is
 * the run page. set up should be made simple. vendor connections can be
 * specific but everything is there … they can have a edit settings/flow/setup
 * thing in the bottom of the flow page in case they want to change how it was
 * set up"). Add opens it for a flow not added yet; the flow page's "Edit setup"
 * opens it again for the flow (`flow`).
 *
 * Under its title the team the flow goes to — its category's (backend
 * ADR-0036) — or the one it is in. Then, numbered:
 *
 * 1. **CONNECT** — each step's vendor choice (one `connection` field per step,
 *    backend ADR-0040), drawn right here: each vendor the step names, then
 *    None; a tap chooses, and a vendor not connected is connected first, for an
 *    owner or admin, through its provider at once (~~a Connect vendor button to
 *    a page of its own~~ until Build 21). Then each account the flow cannot run
 *    without, the one connection row with its Connect.
 * 2. … its settings, by the manifest's sections, the title and the input only —
 *    **no help line** (the owner's build 20 items 3 and 9).
 *
 * Then one button: **Turn on** for a flow not added, or a draft — it adds the
 * flow and turns it on with everything on the page, in one press — or **Save**
 * for a flow already on or paused, which keeps its status. What it cannot send
 * is said in the spec's words, and nothing is sent.
 */
export default function SetupScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { setActive } = useSolutions();
  // `flow`: the flow page's "Edit setup" names the flow it edits.
  const { template, flow } = useLocalSearchParams<{ template?: string; flow?: string }>();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  // The vendor each step's choice holds on this page, by the field's key, until Turn on or Save sends it.
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [localSubscription, setLocalSubscription] = useState<
    Awaited<ReturnType<typeof createSubscription>>['subscription'] | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The required dropdowns left empty on the last save, each said under its field (F1).
  const [emptyChoices, setEmptyChoices] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
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
      // The flow "Edit setup" names; else where the workspace holds it, in any
      // team (the owner's build 12 item 9). An archived one is gone: unarchiving
      // makes a new subscription.
      const named = flow ? withoutArchived(subscriptions.subscriptions).find((item) => item.id === flow) : undefined;
      return {
        entry: catalog.automations.find((item) => item.templateId === template),
        subscriptions: named ? [named] : heldAs(template, subscriptions.subscriptions),
        providers: new Map(providers.providers.map((item) => [item.providerId, item])),
        // Every team's name, an archived team's too: a held flow says where it is.
        labels: scopeLabels(projects),
        connections: connections.connections,
      };
    },
    [template, flow],
  );
  const reloadResource = resource.reload;
  const refreshResource = resource.refresh;

  // A connection happens on Settings or through a vendor's sign-in and changes
  // what is connected. Re-read when this screen regains focus so returning
  // advances the same draft instead of trapping the person in a stale connect loop.
  useFocusEffect(
    useCallback(() => {
      if (hasFocused.current) {
        // A local draft predates the connection made elsewhere. Let the
        // refreshed server subscription become authoritative again.
        setLocalSubscription(null);
        reloadResource();
      } else hasFocused.current = true;
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
        onRetry={() => resource.reload()}
        body={busyBody(resource)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const { entry, providers, labels, connections: held } = resource.data;
  const connected = new Set(
    held.filter((connection) => connectionState(connection) === 'connected').map((connection) => connection.providerId),
  );
  const canManage = administers(roleIn(session, resource.loadedFor));
  // The copy the workspace holds already (the owner's build 12 item 9), or the
  // one this screen added — held from that moment, a draft still owed an
  // account or one whose activation failed: Set up configures it, where it is.
  const placed = localSubscription ?? resource.data.subscriptions[0];
  // On, or paused: Save keeps its status. Not added, or a draft: Turn on.
  const editing = placed !== undefined && placed.status !== 'draft';
  // A held flow's settings are the version it runs (`Subscription.setup`,
  // backend §12.1 #185) — another version's keys are refused as undeclared (the
  // review of the Invoice Processing screens); a flow not added yet, the
  // catalog's, the version Turn on adds.
  const setup = placed ? (placed.setup ?? entry.setup) : entry.setup;
  // Each step's vendor choice (ADR-0040), and the vendors each names. An
  // `optional` account is a step's to choose, or not (ADR-0037) — where the
  // version has the choice; the rest the flow cannot run without. A platform
  // from before the field sent none of it: then nothing is drawn, and the
  // platform still refuses an activation that lacks an account.
  const vendorFields = connectionFields(setup);
  const connections = entry.requiredConnections ?? [];
  const optional = new Set(
    vendorFields.length > 0 ? connections.filter((connection) => connection.optional).map((c) => c.providerId) : [],
  );
  const required = connections.filter((connection) => !optional.has(connection.providerId));
  const choiceOf = (field: (typeof setup)[number]) => choices[field.key] ?? chosenVendor(field, placed?.config);
  const nameOf = (providerId: string) =>
    connections.find((connection) => connection.providerId === providerId)?.displayName ??
    providers.get(providerId)?.displayName ??
    providerId;
  const requiredRows = required.flatMap((connection) => {
    const provider = providers.get(connection.providerId);
    return provider ? [toConnectionRow(provider, held.find((c) => c.providerId === connection.providerId))] : [];
  });
  const hasConnect = vendorFields.length > 0 || requiredRows.length > 0;
  const sectionOffset = hasConnect ? 1 : 0;

  const newIntent = () => {
    updateKey.current = newIdempotencyKey('activate');
  };
  const setField = (key: string, value: unknown) => {
    setConfig((previous) => ({ ...previous, [key]: value }));
    setEmptyChoices((previous) => previous.filter((other) => other !== key));
    newIntent();
  };
  const choose = (key: string, value: string) => {
    setChoices((previous) => ({ ...previous, [key]: value }));
    setActionError(null);
    newIntent();
  };

  const valueOf = (field: (typeof setup)[number]) =>
    field.control === 'connection'
      ? choiceOf(field)
      : field.key in config
        ? config[field.key]
        : (placed?.config[field.key] ?? field.defaultValue);

  /** What cannot be sent, said; null when everything can. */
  const refusal = (configured: Record<string, unknown>): string | null => {
    // Reachability is the platform's evidence, not this client's guess: a flow
    // that is not answering only defers the failure to the first run.
    if (!editing && !entry.available) return UNAVAILABLE_NOTE;
    // Each vendor chosen must be connected; None needs nothing. Save checks
    // only a choice this page changed: a flow on can keep what it holds.
    for (const field of vendorFields) {
      const chosen = choiceOf(field);
      const changed = !editing || chosen !== chosenVendor(field, placed?.config);
      if (changed && chosen !== NONE && !connected.has(chosen)) return connectFirstOrNone(nameOf(chosen));
    }
    if (!editing) {
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
      if (owed.size > 0) return connectFirst([...owed.values()].join(', '));
    }
    const missing = missingRequiredSetupFields(setup, configured);
    if (missing.length > 0) return fillIn(missing.map((field) => field.title).join(', '));
    // A money field holds a number or nothing can be sent: an empty amount
    // would silently fall back to the flow's own default.
    const blankMoney = setup.filter(
      (field) => field.control === 'money' && (configured[field.key] === undefined || configured[field.key] === ''),
    );
    if (blankMoney.length > 0) return enterAnAmount(blankMoney.map((field) => field.title).join(', '));
    return null;
  };

  const submit = async () => {
    if (busy) return;
    // A field this person cleared stays cleared: `??` read a cleared field as
    // untouched and put the default back under their thumb (24.7.3 attempt 2).
    const configured = Object.fromEntries(setup.map((field) => [field.key, valueOf(field)]));
    // A required dropdown left empty (F1): "Choose at least one." under it, and nothing is sent.
    const empty = missingRequiredSetupFields(setup, configured).filter(isSelectField);
    setEmptyChoices(empty.map((field) => field.key));
    if (empty.length > 0) {
      setActionError(null);
      return;
    }
    const refused = refusal(configured);
    if (refused) {
      setActionError(refused);
      return;
    }
    const workspaceId = workspaceIfShown(session, resource.loadedFor);
    if (!workspaceId) {
      setActionError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setActionError(null);
    if (editing && placed) {
      // Save: the settings, the flow's status kept; then back to its page.
      try {
        await updateSubscription(workspaceId, placed.id, { config: configured }, updateKey.current);
        newIntent();
        router.back();
      } catch {
        setActionError(SETUP_SAVE_FAILED);
      } finally {
        setBusy(false);
      }
      return;
    }
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
        // (backend ADR-0036) and puts this person on it. No version either: a
        // new flow runs the newest (Build 22, backend ADR-0041).
        adding = true;
        const created = await createSubscription(workspaceId, { templateId: entry.templateId }, createKey.current);
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
        newIntent();
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
      newIntent();
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

  const sections = bySection(rowFields(setup));
  const label = busy ? (editing ? SETUP_SAVING : SETUP_TURNING_ON) : editing ? SETUP_SAVE : SETUP_TURN_ON;

  return (
    <Page>
      {/* Its team under its title: where it is, once added; where it goes, its category's, until then. */}
      <PageHeader
        onBack={() => router.back()}
        title={`Set up ${entry.name}`}
        subtitle={placed ? scopeLabel(placed.projectId, labels) : teamLine(entry.category)}
        subtitleTestID="setup-team"
      />

      {/* Inside a boundary (BUILD-PLAN 25.8.1, kept from the Set up dialog): the rows
          are drawn from a manifest the platform may publish after this build
          shipped, and one that cannot be drawn ends in "Couldn't load this setup"
          with Try again, never a white screen. */}
      <InlineBoundary title={errorTitleFor('setup')}>
        <View style={styles.form}>
          {hasConnect ? (
            <View testID="setup-connect">
              <NumberedSectionLabel>{sectionLabel(1, 'connections')}</NumberedSectionLabel>
              {vendorFields.map((field) => (
                <View key={field.key} testID={`setup-vendor-${field.key}`}>
                  {/* A flow that chooses a vendor for more than one step names each step's choice. */}
                  {vendorFields.length > 1 ? (
                    <Text style={[styles.fieldTitle, { color: palette.neutral[400] }]}>{field.title}</Text>
                  ) : null}
                  <SurfaceCard>
                    <VendorChoice
                      vendors={fieldProviders(field, connections)}
                      providers={providers}
                      connections={held}
                      chosen={choiceOf(field)}
                      canManage={canManage}
                      shownWorkspaceId={resource.loadedFor}
                      saving={null}
                      onChoose={(choice) => choose(field.key, choice)}
                      onConnectionsChanged={refreshResource}
                      readOnly={!canManage && editing}
                    />
                  </SurfaceCard>
                </View>
              ))}
              {requiredRows.length > 0 ? (
                <View>
                  <ConnectionsCard
                    testID="setup-required"
                    rows={requiredRows}
                    loadedFor={resource.loadedFor}
                    canManage={canManage}
                    notice={notice}
                    onNotice={setNotice}
                    onChanged={refreshResource}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {/* In the manifest's order, as the website draws them; it can come back to a section, so its place keys it. */}
          {sections.map(({ section, fields }, position) => (
            <View key={`${section}-${position}`}>
              <NumberedSectionLabel>{sectionLabel(position + 1 + sectionOffset, section)}</NumberedSectionLabel>
              <SurfaceCard>
                {fields.map((field, index) => (
                  <SetupFieldRow
                    key={field.key}
                    field={field}
                    value={valueOf(field)}
                    onChange={(next) => setField(field.key, next)}
                    divider={index < fields.length - 1}
                    error={emptyChoices.includes(field.key) ? CHOOSE_AT_LEAST_ONE : null}
                  />
                ))}
              </SurfaceCard>
            </View>
          ))}

          {actionError ? <ActionFailure message={actionError} retryLabel="Try again" onRetry={submit} /> : null}

          {/* A button to a screen reader, as it is to the eye (the Build 21 review). */}
          <Pressable
            testID="setup-turn-on"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={submit}
            style={({ pressed }) => [
              styles.activateBtn,
              { borderColor: palette.accent },
              pressed && { backgroundColor: withAlpha(palette.accent, 0.12) },
            ]}>
            <Text style={[styles.activateLabel, { color: palette.accent }]}>{label}</Text>
          </Pressable>
        </View>
      </InlineBoundary>
    </Page>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.group },
  fieldTitle: { marginBottom: space.title, fontFamily: fonts.medium, ...typeScale.small },
  activateBtn: {
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.rowX,
  },
  activateLabel: { fontFamily: fonts.medium, fontSize: typeScale.lead.fontSize, textAlign: 'center' },
});
