import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SECTION_LABEL,
  SetupFieldRow,
  bySection,
  missingRequiredSetupFields,
} from '@/components/setup-field';
import { BackCircle } from '@/components/nocturne/back-circle';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import {
  ActionFailure,
  ScreenError,
  ScreenLoading,
  ScreenOffline,
} from '@/components/screen-state';
import { em, fonts, layout, withAlpha } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { UNAVAILABLE_NOTE, errorTitleFor } from '@/lib/content/screen-states';
import { createSubscription, updateSubscription } from '@/lib/platform/automations';
import { readCatalog, readConnectionProviders } from '@/lib/platform/catalog';
import { newIdempotencyKey } from '@/lib/platform/client';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readSubscriptions } from '@/lib/platform/runs';

/** One-time setup generated from the selected manifest. */
export default function SetupScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const workspaceId = activeWorkspaceId(session);
  const { template } = useLocalSearchParams<{ template?: string }>();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [localSubscription, setLocalSubscription] = useState<
    Awaited<ReturnType<typeof createSubscription>>['subscription'] | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createKey = useRef(newIdempotencyKey('subscribe'));
  const updateKey = useRef(newIdempotencyKey('activate'));
  const hasFocused = useRef(false);

  const resource = useWorkspaceResource(
    async (id) => {
      if (!template) throw new PlatformNotConfiguredError();
      const [catalog, subscriptions, providers] = await Promise.all([
        readCatalog(id),
        readSubscriptions(id),
        readConnectionProviders(),
      ]);
      return {
        entry: catalog.automations.find((item) => item.templateId === template),
        subscription: subscriptions.subscriptions.find((item) => item.templateId === template),
        providers: new Map(providers.providers.map((item) => [item.providerId, item.displayName])),
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
    return <ScreenOffline onRetry={resource.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status !== 'ready' || !resource.data.entry || !workspaceId) {
    return (
      <ScreenError
        title={errorTitleFor('setup')}
        onRetry={resource.reload}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const { entry, providers } = resource.data;
  const subscription = localSubscription ?? resource.data.subscription ?? null;
  const unmet = subscription?.unmetConnections ?? [];

  const setField = (key: string, value: unknown) => {
    setConfig((previous) => ({ ...previous, [key]: value }));
    updateKey.current = newIdempotencyKey('activate');
  };

  const activate = async () => {
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
        config[field.key] ?? subscription?.config[field.key] ?? field.defaultValue,
      ]),
    );
    const missing = missingRequiredSetupFields(entry.setup, configured);
    if (missing.length > 0) {
      setActionError(`Complete required setup: ${missing.map((field) => field.title).join(', ')}.`);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      let current = subscription;
      if (!current) {
        const created = await createSubscription(
          workspaceId,
          { templateId: entry.templateId, templateVersion: entry.version },
          createKey.current,
        );
        current = created.subscription;
        setLocalSubscription(current);
        // The create changed what `configured` is computed FROM: a retry now
        // falls back to `created.config` where this attempt fell back to
        // `field.defaultValue`. Same key with a different body is a 409 by
        // contract ("The same key with different input is a conflict, not a
        // replay"), and the person could never escape it. A new basis is a new
        // intent, so it gets a new key.
        updateKey.current = newIdempotencyKey('activate');
        if (current.unmetConnections.length > 0) {
          setActionError('Connect the required providers in Settings, then return to activate.');
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
      // Spent intent; a later edit-and-activate must not replay this one.
      updateKey.current = newIdempotencyKey('activate');
      router.replace({ pathname: '/(tabs)/flows/detail', params: { flow: updated.subscription.id } });
    } catch (error) {
      setActionError(
        error instanceof PlatformError ? error.message : 'The solution could not be activated.',
      );
    } finally {
      setBusy(false);
    }
  };

  const buttonLabel =
    unmet.length > 0
      ? `Connect ${unmet.map((id) => providers.get(id) ?? id).join(', ')} in Settings`
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

      {bySection(entry.setup).map(({ section, fields }) => (
        <View key={section}>
          <SectionLabel>{SECTION_LABEL[section]}</SectionLabel>
          <SurfaceCard style={styles.sectionCard}>
            {fields.map((field, index) => (
              <SetupFieldRow
                key={field.key}
                field={field}
                value={config[field.key] ?? subscription?.config[field.key] ?? field.defaultValue}
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
        disabled={busy}
        onPress={activate}
        style={({ pressed }) => [
          styles.activateBtn,
          { borderColor: palette.accent },
          pressed && { backgroundColor: withAlpha(palette.accent, 0.12) },
        ]}>
        <Text style={[styles.activateLabel, { color: palette.accent }]}>{buttonLabel}</Text>
      </Pressable>
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
    fontSize: 21,
    letterSpacing: em(-0.01, 21),
  },
  subtitle: { marginTop: 1, fontFamily: fonts.regular, fontSize: 12 },
  sectionCard: { marginTop: 9, overflow: 'hidden' },
  activateBtn: {
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  activateLabel: { fontFamily: fonts.medium, fontSize: 15, textAlign: 'center' },
});
