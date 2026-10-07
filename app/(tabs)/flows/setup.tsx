import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from 'phosphor-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  sectionLabel,
  SetupFieldRow,
  bySection,
  missingRequiredSetupFields,
} from '@/components/setup-field';
import { SelectField } from '@/components/select-field';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import {
  ActionFailure,
  ScreenError,
  ScreenLoading,
  ScreenOffline,
  ScreenUnavailable,
} from '@/components/screen-state';
import { Pressable } from '@/components/pressable';
import { CreateTeamDialog } from '@/components/teams/create-team-dialog';
import { em, fonts, layout, status, typeScale, withAlpha } from '@/constants/theme';
import { useWorkspaceResource, busyBody } from '@/hooks/use-resource';
import { roleIn, useSession, workspaceIfShown } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, addRefusalMessage } from '@/lib/content/refusals';
import {
  SETUP_ADDED_TO,
  SETUP_ASK_TO_JOIN_A_TEAM_FIRST,
  SETUP_CREATE_A_TEAM,
  SETUP_CREATE_A_TEAM_FIRST,
  SETUP_FIRST_TEAM_IS_AN_ADMINS,
  SETUP_PICK_A_TEAM,
  SETUP_SEE_TEAMS,
  UNAVAILABLE_NOTE,
  errorTitleFor,
} from '@/lib/content/screen-states';
import { createSubscription, updateSubscription } from '@/lib/platform/automations';
import { readCatalog, readConnectionProviders, readConnections } from '@/lib/platform/catalog';
import { newIdempotencyKey } from '@/lib/platform/client';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readProjects, teamDirectoryIfThere } from '@/lib/platform/projects';
import { readSubscriptions } from '@/lib/platform/runs';
import { heldAs, scopeLabel, scopeLabels } from '@/lib/view/catalog';
import { administers } from '@/lib/view/roles';

/** One-time setup generated from the selected manifest. */
export default function SetupScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { setActive } = useSolutions();
  const { template, project } = useLocalSearchParams<{ template?: string; project?: string }>();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [localSubscription, setLocalSubscription] = useState<
    Awaited<ReturnType<typeof createSubscription>>['subscription'] | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Where it is added: a team's id, always (build 11, D4 — the owner's build
  // 10 item 7: "Each flow has to be in a team"); there is no whole-workspace
  // choice. The catalog passes the team the scope control had chosen (24.9.3),
  // so it is not chosen twice; under All teams, and for a whole-workspace flow
  // unarchived, it is unset until the person picks one here. A flow the
  // workspace holds already has no choice: it stays where it is (item 9).
  const [chosenScope, setChosenScope] = useState<string | undefined>(project || undefined);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const createKey = useRef(newIdempotencyKey('subscribe'));
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
      // The teams a flow can be added to, so only the people who can see one
      // see its flows (18.6.2); a flow is added to a team, never to the whole
      // workspace (D4), as on the website.
      const open = projects.filter((project) => project.status !== 'archived');
      // With none, whether the organization has a team this person could ask
      // to join: the directory lists one they are not on (F84, the website's
      // `canAskToJoin`). Read only in that state. The role is not read here —
      // this read is keyed on the template, so its closure would keep a stale
      // one; an owner or admin, who sees every team, reads an empty directory,
      // and their own line is drawn first anyway.
      const askable =
        open.length === 0 && (await teamDirectoryIfThere(id)).some((entry) => entry.access !== 'member');
      return {
        entry: catalog.automations.find((item) => item.templateId === template),
        // Where the workspace holds it, in any team (the owner's build 12 item
        // 9): one copy, or two added before the rule. An archived one is gone:
        // unarchiving makes a new subscription.
        subscriptions: heldAs(template, subscriptions.subscriptions),
        providers: new Map(providers.providers.map((item) => [item.providerId, item.displayName])),
        projects: open,
        // Every team's name, an archived team's too: a held flow says where it is.
        labels: scopeLabels(projects),
        askable,
        // The accounts this workspace holds: the Connections step reads its state here.
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

  // A provider connection happens on Settings and changes unmetConnections.
  // Re-read when this screen regains focus so returning actually advances the
  // same draft instead of trapping the person in a stale connect loop.
  useFocusEffect(
    useCallback(() => {
      if (hasFocused.current) {
        // A local draft predates the provider connection made in Settings. Let
        // the refreshed server subscription become authoritative again.
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

  const { entry, providers, projects, labels, askable, connected } = resource.data;
  // Step 1 is the accounts the automation needs, when it needs any (24.7.3
  // attempt 4, feedback #5: every step numbered 1…N, connections included). The
  // entry publishes them since 2026-10-02. A platform from before that date —
  // production until the SEVENTEENTH promotion — sends the entry without the
  // field: then no step is drawn, and a subscription's `unmetConnections` still
  // refuses an activation that lacks an account.
  const required = entry.requiredConnections ?? [];
  const sectionOffset = required.length > 0 ? 1 : 0;
  const scopes = projects.map((project) => ({ value: project.id, label: `Team: ${project.type}` }));
  // The copy the workspace holds already (the owner's build 12 item 9): Setup
  // configures that one, where it is, and adds no second — so no team choice.
  const held = resource.data.subscriptions[0];
  // A chosen team that has since gone (archived on a re-read) is no choice; none is chosen for the person.
  const scope =
    chosenScope !== undefined && scopes.some((option) => option.value === chosenScope) ? chosenScope : undefined;
  // Where this flow is: the copy the workspace held, or the one this screen
  // added. Added here, it is held from that moment — a draft still owed an
  // account, or one whose activation failed — so it too is "Added to" its
  // team, with no team choice: picking another team made a second copy (the
  // build 13 review).
  const placed = localSubscription ?? held;
  const unmet = placed?.unmetConnections ?? [];
  // With no team yet, an owner or admin makes one here; a plain member cannot
  // (in an organization its owners and admins create teams, 24.12), and asks
  // to join one where the organization has one (`askable`, F84).
  const canCreateTeam = administers(roleIn(session, resource.loadedFor));

  const setField = (key: string, value: unknown) => {
    setConfig((previous) => ({ ...previous, [key]: value }));
    updateKey.current = newIdempotencyKey('activate');
  };

  const activate = async () => {
    // A team first (D4): nothing is added without one. A flow the workspace
    // holds, or added on this screen already, is configured where it is.
    if (!placed && !scope) {
      setActionError(SETUP_PICK_A_TEAM);
      return;
    }
    if (unmet.length > 0) {
      router.push('/(tabs)/settings');
      return;
    }
    // Reachability is the platform's evidence, not this client's guess. The web
    // client disables Go live on the same field; activating an automation that
    // is not answering only defers the failure to the first run.
    if (!entry.available) {
      setActionError(UNAVAILABLE_NOTE);
      return;
    }
    const configured = Object.fromEntries(
      entry.setup.map((field) => [
        field.key,
        // A field this person cleared stays cleared: `??` read a cleared field
        // as untouched and put the default back under their thumb (24.7.3
        // attempt 2, feedback #4).
        field.key in config ? config[field.key] : (placed?.config[field.key] ?? field.defaultValue),
      ]),
    );
    const missing = missingRequiredSetupFields(entry.setup, configured);
    if (missing.length > 0) {
      setActionError(`Complete required setup: ${missing.map((field) => field.title).join(', ')}.`);
      return;
    }
    // A money field holds a number or nothing can be activated: an empty amount
    // would silently fall back to the automation's own default.
    const blankMoney = entry.setup.filter(
      (field) =>
        field.control === 'money' && (configured[field.key] === undefined || configured[field.key] === ''),
    );
    if (blankMoney.length > 0) {
      setActionError(`Enter a number for ${blankMoney.map((field) => field.title).join(', ')}.`);
      return;
    }
    const workspaceId = workspaceIfShown(session, resource.loadedFor);
    if (!workspaceId) {
      setActionError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      let current = placed;
      if (!current) {
        const created = await createSubscription(
          workspaceId,
          { templateId: entry.templateId, templateVersion: entry.version, projectId: scope },
          createKey.current,
        );
        current = created.subscription;
        setLocalSubscription(current);
        // Spent: a later Activate on this screen — after this subscription is
        // archived, say — is a new intent, and replaying this one would answer
        // with a subscription that no longer counts.
        createKey.current = newIdempotencyKey('subscribe');
        // The create changed what `configured` is computed FROM: a retry now
        // falls back to `created.config` where this attempt fell back to
        // `field.defaultValue`. Same key with a different body is a 409 by
        // contract ("The same key with different input is a conflict, not a
        // replay"), and the person could never escape it. A new basis is a new
        // intent, so it gets a new key.
        updateKey.current = newIdempotencyKey('activate');
        if (current.unmetConnections.length > 0) {
          setActionError('Connect the required providers in Settings › Connections, then return to activate.');
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
      // marketplace and Settings is stated, not flipped, so an earlier pause
      // override cannot outlive the activation that superseded it.
      setActive(entry.templateId, true);
      // Spent intent; a later edit-and-activate must not replay this one.
      updateKey.current = newIdempotencyKey('activate');
      // Leave Solutions at its root before opening the workflow: a `replace`
      // across tabs left this screen in Solutions' history, so coming back
      // showed Setup again with "Activate solution" (24.7.3 attempt 2, feedback #3).
      router.dismissTo('/(tabs)/flows');
      router.push({ pathname: '/(tabs)/flows/detail', params: { flow: updated.subscription.id } });
    } catch (error) {
      setActionError(addRefusalMessage(error, 'The solution could not be activated.'));
    } finally {
      setBusy(false);
    }
  };

  const buttonLabel =
    unmet.length > 0
      ? `Connect ${unmet.map((id) => providers.get(id) ?? id).join(', ')} in Settings › Connections`
      : busy
        ? 'Activating…'
        : 'Activate solution';

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
          <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>One-time setup</Text>
        </View>
      </View>

      {placed ? (
        <View testID="setup-held" style={styles.held}>
          <Text style={[styles.heldLabel, { color: palette.neutral[400] }]}>{SETUP_ADDED_TO}</Text>
          <Text style={[styles.heldWhere, { color: palette.text }]}>{scopeLabel(placed.projectId, labels)}</Text>
        </View>
      ) : projects.length > 0 ? (
        // A full-width dropdown of the open teams (the owner, build 13 #5), as
        // Create team's kind is chosen.
        <SelectField
          label="Add to"
          testID="setup-team"
          options={scopes}
          selected={scope ?? null}
          placeholder="Choose a team"
          onSelect={(next) => {
            // Nothing is added yet — the choice goes once it is — so another team
            // is a new intent from the start: a create that failed for one
            // team is not replayed, under its key, for another.
            setChosenScope(next);
            setActionError(null);
            createKey.current = newIdempotencyKey('subscribe');
            updateKey.current = newIdempotencyKey('activate');
          }}
        />
      ) : canCreateTeam ? (
        <View style={styles.noTeam}>
          <Text style={[styles.noTeamLine, { color: palette.neutral[400] }]}>{SETUP_CREATE_A_TEAM_FIRST}</Text>
          <PillButton
            label={SETUP_CREATE_A_TEAM}
            variant="primary"
            height={40}
            fontSize={typeScale.body.fontSize}
            icon={Plus}
            iconSize={14}
            gap={5}
            onPress={() => setCreatingTeam(true)}
          />
        </View>
      ) : askable ? (
        // A plain member on no team, where the organization has one to ask
        // onto: Teams is where they ask (F84, the website's words).
        <View style={styles.noTeam}>
          <Text style={[styles.noTeamLine, { color: palette.neutral[400] }]}>{SETUP_ASK_TO_JOIN_A_TEAM_FIRST}</Text>
          <PillButton
            label={SETUP_SEE_TEAMS}
            variant="secondary"
            height={40}
            fontSize={typeScale.body.fontSize}
            onPress={() => router.push('/(tabs)/settings/teams')}
          />
        </View>
      ) : (
        <Text style={[styles.noTeamLine, { color: palette.neutral[400] }]}>{SETUP_FIRST_TEAM_IS_AN_ADMINS}</Text>
      )}

      {required.length > 0 ? (
        <View>
          <SectionLabel>{sectionLabel(1, 'connections')}</SectionLabel>
          <SurfaceCard style={styles.sectionCard}>
            {required.map((connection, index) => {
              const isConnected = connected.has(connection.providerId);
              return (
                <View
                  key={connection.providerId}
                  style={[
                    styles.connectionRow,
                    index < required.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider },
                  ]}>
                  <View style={styles.connectionText}>
                    <Text style={[styles.connectionName, { color: palette.text }]}>{connection.displayName}</Text>
                    <Text style={[styles.connectionPurpose, { color: palette.neutral[400] }]}>{connection.purpose}</Text>
                  </View>
                  {isConnected ? (
                    <Text style={[styles.connectionState, { color: status.ok }]}>Connected ✓</Text>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Connect ${connection.displayName}`}
                      onPress={() => router.push('/(tabs)/settings')}
                      style={({ pressed }) => [
                        styles.connectBtn,
                        { borderColor: palette.accent },
                        pressed && { backgroundColor: withAlpha(palette.accent, 0.12) },
                      ]}>
                      <Text style={[styles.connectLabel, { color: palette.accent }]}>Connect ›</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </SurfaceCard>
        </View>
      ) : null}

      {bySection(entry.setup).map(({ section, fields }, position) => (
        <View key={section}>
          <SectionLabel>{sectionLabel(position + 1 + sectionOffset, section)}</SectionLabel>
          <SurfaceCard style={styles.sectionCard}>
            {fields.map((field, index) => (
              <SetupFieldRow
                key={field.key}
                field={field}
                value={
                  field.key in config
                    ? config[field.key]
                    : (placed?.config[field.key] ?? field.defaultValue)
                }
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

      {/* No Activate for a member with no team to add to and nothing held: nothing can be sent. */}
      {placed || projects.length > 0 || canCreateTeam ? (
        <Pressable
          disabled={busy}
          onPress={activate}
          style={({ pressed }) => [
            styles.activateBtn,
            { borderColor: palette.accent },
            pressed && { backgroundColor: withAlpha(palette.accent, 0.12) },
          ]}>
          <Text style={[styles.activateLabel, { color: palette.accent }]}>{buttonLabel}</Text>
        </Pressable>
      ) : null}

      {creatingTeam ? (
        <CreateTeamDialog
          onClose={() => setCreatingTeam(false)}
          onCreated={(team) => {
            setCreatingTeam(false);
            setActionError(null);
            // Made in the workspace this setup loaded: it is the team the flow
            // is added to. The create dropped the teams from the snapshot, so
            // the re-read lists it, keeping what is on screen.
            if (team.workspaceId === resource.loadedFor) setChosenScope(team.id);
            resource.refresh();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenX,
    paddingBottom: 20,
    gap: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  subtitle: { marginTop: 1, fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  held: { gap: 6 },
  heldLabel: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  heldWhere: { fontFamily: fonts.medium, fontSize: typeScale.body.fontSize },
  noTeam: { gap: 10, alignItems: 'flex-start' },
  noTeamLine: { fontFamily: fonts.regular, ...typeScale.body },
  sectionCard: { marginTop: 9 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  connectionText: { flex: 1, minWidth: 0, gap: 2 },
  connectionName: { fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  connectionPurpose: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
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
