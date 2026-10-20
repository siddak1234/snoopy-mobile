import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VendorChoice } from '@/components/flows/vendor-choice';
import { BackCircle } from '@/components/nocturne/back-circle';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { chosenVendor, connectionFields, fieldProviders } from '@/components/setup-field';
import { Text } from '@/components/text';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { roleIn, useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { VENDOR_SAVE_FAILED, VENDOR_TITLE, errorTitleFor, vendorFor } from '@/lib/content/screen-states';
import { updateSubscription } from '@/lib/platform/automations';
import { readCatalog, readConnectionProviders, readConnections } from '@/lib/platform/catalog';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readSubscriptions } from '@/lib/platform/runs';
import { administers } from '@/lib/view/roles';

/**
 * Connect integration (Build 22; ~~Connect vendor~~) — one step's vendor for one
 * flow (the owner's build 19 item 1; backend ADR-0037, ADR-0040; Build 21's A2).
 * Opened from the flow page's integration row with `flow` and `field` (the connection
 * setting's key — a flow may choose one vendor per step, ADR-0040).
 *
 * **A tap is the choice, saved, and back** (the owner's build 20 item 2: "When
 * i click one of the choices like none i shouldnt need to press done or the
 * back arrow. It should just take me back … and be saved. If i need to connect
 * then after i click and connection happens then it shoukd take me back"):
 *
 * - a connected vendor, or None → PATCH `config[field]` → back;
 * - a vendor not connected, for an owner or admin → its sign-in, through the
 *   provider at once; connected → PATCH → back; cancelled or not completed →
 *   stay, said in the existing words; a key provider is connected where its
 *   key is pasted, Settings › Connections;
 * - for a member, a vendor not connected is not a choice: "Ask an owner or
 *   admin to connect it.";
 * - while it saves, the tapped row says "Saving…" and the rest wait; a save
 *   refused says "Could not save. Try again." under the card, and stays.
 *
 * Each vendor is the one connection row (spec A4) with the check (24) on the
 * chosen one in place of a button. ~~Done, Save, Intuit's Connect button image
 * and "Disconnect from QuickBooks"~~ until Build 21 — disconnecting is
 * Connections' (the session's S13).
 */
export default function ConnectVendorScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { flow, field: fieldKey } = useLocalSearchParams<{ flow?: string; field?: string }>();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keys = useIntentKeys('vendor');

  const resource = useWorkspaceResource(
    async (id) => {
      if (!flow) throw new PlatformNotConfiguredError();
      const [subscriptions, catalog, providers, connections] = await Promise.all([
        readSubscriptions(id),
        readCatalog(id),
        readConnectionProviders(),
        readConnections(id),
      ]);
      const subscription = subscriptions.subscriptions.find((item) => item.id === flow);
      return {
        subscription,
        entry: subscription ? catalog.automations.find((item) => item.templateId === subscription.templateId) : undefined,
        providers: new Map(providers.providers.map((item) => [item.providerId, item])),
        connections: connections.connections,
      };
    },
    [flow],
  );

  if (resource.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (resource.status === 'offline') {
    return <ScreenOffline onRetry={() => resource.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('vendor')} onBack={() => router.back()} topInset={insets.top} />;
  }
  const ready = resource.status === 'ready' ? resource.data : null;
  // The settings of the version the flow runs; the catalog's when the platform sent none.
  const fields = ready?.subscription ? connectionFields(ready.subscription.setup ?? ready.entry?.setup ?? []) : [];
  // The field the link names, or — a link from before `field`, or a version with one — its only one.
  const field = fields.find((candidate) => candidate.key === fieldKey) ?? (fieldKey ? undefined : fields[0]);
  // A flow named and not found (archived since, say), or no such choice, is no page to choose for.
  if (!ready?.subscription || !field) {
    return (
      <ScreenError
        title={errorTitleFor('vendor')}
        onRetry={() => resource.reload()}
        body={busyBody(resource)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const { subscription, entry, providers, connections } = ready;
  const vendors = fieldProviders(field, entry?.requiredConnections ?? []);
  const saved = chosenVendor(field, subscription.config);
  const canManage = administers(roleIn(session, resource.loadedFor));

  /** Save the choice, then back where the person came from; unchanged, straight back. */
  const save = async (choice: string) => {
    // A member never saves here (round 23, B3): the rows are inert for them.
    if (saving || !canManage) return;
    if (choice === saved) {
      router.back();
      return;
    }
    const workspaceId = workspaceIfShown(session, resource.loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setSaving(choice);
    setError(null);
    try {
      await updateSubscription(
        workspaceId,
        subscription.id,
        { config: { ...subscription.config, [field.key]: choice } },
        keys.keyFor(`${field.key}:${choice}`),
      );
      keys.settle(`${field.key}:${choice}`);
      router.back();
    } catch (caught) {
      // A member's refusal in its own words (403, backend ADR-0043); anything else, the save's.
      setError(caught instanceof PlatformError && caught.status === 403 ? refusalMessage(caught) : VENDOR_SAVE_FAILED);
    } finally {
      setSaving(null);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{VENDOR_TITLE}</Text>
          <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>
            {vendorFor(subscription.name ?? entry?.name ?? subscription.templateId)}
          </Text>
        </View>
      </View>

      <SurfaceCard>
        <VendorChoice
          vendors={vendors}
          providers={providers}
          connections={connections}
          chosen={saved}
          canManage={canManage}
          shownWorkspaceId={resource.loadedFor}
          saving={saving}
          onChoose={(choice) => void save(choice)}
          onConnectionsChanged={() => resource.refresh()}
          readOnly={!canManage}
        />
      </SurfaceCard>

      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: status.err }]}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  subtitle: { marginTop: 1, fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  error: { fontFamily: fonts.regular, ...typeScale.small },
});
