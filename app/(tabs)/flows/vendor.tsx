import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable, pressed } from '@/components/pressable';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { chosenVendor, connectionField } from '@/components/setup-field';
import { NoVendorMark, VendorConnectButton, VendorMark } from '@/components/vendor-logo';
import { em, fonts, iconSize, layout, status, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { roleIn, useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, connectionIncomplete, refusalMessage } from '@/lib/content/refusals';
import {
  VENDOR_ASK_ADMIN,
  VENDOR_CONNECTED,
  VENDOR_DISCONNECT_BODY,
  VENDOR_DONE,
  VENDOR_NONE_SUB,
  VENDOR_SAVE,
  VENDOR_SAVE_FAILED,
  VENDOR_SAVING,
  VENDOR_TITLE,
  errorTitleFor,
  vendorFor,
} from '@/lib/content/screen-states';
import { updateSubscription } from '@/lib/platform/automations';
import { readCatalog, readConnectionProviders, readConnections, type ConnectionProvider } from '@/lib/platform/catalog';
import { connectOAuthProvider, disconnectConnection } from '@/lib/platform/connections';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readSubscriptions } from '@/lib/platform/runs';
import { invalidateShared } from '@/lib/platform/snapshot';
import { brandLogoFor } from '@/lib/view/brand-logos';
import { administers } from '@/lib/view/roles';

/** The choice that saves the details only: no vendor (backend `CONNECTION_NONE`). */
const NONE = 'none';

/**
 * Connect vendor — one flow's vendors (the owner's build 19 item 1: "There
 * should be a connect vendor button and takes it to a page specific for this
 * flows vendors. If already connected you can choose which vendor or just a
 * none."; backend ADR-0037; the spec's §3.C). Opened from the flow's CONNECT row
 * on Set up (`template`) or on its page (`template` and `flow`).
 *
 * Every optional connection of the flow, in the manifest's order, as its logo —
 * or its icon and name where no logo is bundled — then None, last. A connected
 * vendor, or None, is chosen with a tap; a vendor not connected is connected
 * first — through its own button, Intuit's "Connect to QuickBooks" for
 * QuickBooks — by an owner or admin, and is chosen once that returns. A member
 * is told who connects it. Connected, an owner or admin can disconnect it here,
 * in the vendor's own words ("Disconnect from QuickBooks"), confirmed first.
 *
 * The choice is the flow's `connection` setting: for a flow not added yet, Done
 * takes it back to Set up, which sends it with the rest; for an added flow,
 * Save sends it (PATCH `config`) and goes back.
 */
export default function ConnectVendorScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { template, flow, vendor } = useLocalSearchParams<{ template?: string; flow?: string; vendor?: string }>();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'connect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<{ provider: ConnectionProvider; connectionId: string } | null>(
    null,
  );
  const keys = useIntentKeys('vendor');

  const resource = useWorkspaceResource(
    async (id) => {
      if (!template) throw new PlatformNotConfiguredError();
      const [catalog, subscriptions, providers, connections] = await Promise.all([
        readCatalog(id),
        flow ? readSubscriptions(id) : Promise.resolve(null),
        readConnectionProviders(),
        readConnections(id),
      ]);
      return {
        entry: catalog.automations.find((item) => item.templateId === template),
        subscription: flow ? subscriptions?.subscriptions.find((item) => item.id === flow) : undefined,
        providers: new Map(providers.providers.map((item) => [item.providerId, item])),
        connections: connections.connections,
      };
    },
    [template, flow],
  );

  if (resource.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (resource.status === 'offline') {
    return <ScreenOffline onRetry={() => resource.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('vendor')} onBack={() => router.back()} topInset={insets.top} />;
  }
  const ready = resource.status === 'ready' ? resource.data : null;
  // A flow named and not found (archived since, say) is no page to choose for.
  if (!ready?.entry || (flow && !ready.subscription)) {
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

  const { entry, subscription, providers, connections } = ready;
  // The settings of the version the flow runs, when it is added; the catalog's, when not yet.
  const field = connectionField(subscription?.setup ?? entry.setup);
  const vendors = (entry.requiredConnections ?? []).filter((connection) => connection.optional);
  const saved = chosenVendor(field, subscription?.config);
  const choice = picked ?? (vendor && !subscription ? vendor : saved);
  const canManage = administers(roleIn(session, resource.loadedFor));
  const connectedId = (providerId: string) =>
    connections.find((connection) => connection.providerId === providerId && connection.status === 'connected')?.id;

  const choose = (next: string) => {
    setPicked(next);
    setError(null);
  };

  /** Connect a vendor not connected yet, then choose it once it is (the spec: "chosen after its connect returns"). */
  const connect = async (provider: ConnectionProvider) => {
    if (busy) return;
    const workspaceId = workspaceIfShown(session, resource.loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy('connect');
    setError(null);
    try {
      const outcome = await connectOAuthProvider(workspaceId, provider);
      if (outcome.status === 'failed') setError(outcome.message);
      else if (outcome.status === 'incomplete') setError(connectionIncomplete(false));
      else if (outcome.status === 'connected') setPicked(provider.providerId);
      // `cancelled` may still have connected at the website (§12.1 #79): read
      // again either way, past the snapshot, keeping the page.
      invalidateShared(workspaceId, ['connections', 'subscriptions']);
      resource.refresh();
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The connection was not changed.'));
    } finally {
      setBusy(null);
    }
  };

  /** Done (a flow not added yet) or Save (an added one). */
  const finish = async () => {
    if (busy) return;
    if (!subscription || !field) {
      router.dismissTo({ pathname: '/(tabs)/flows/setup', params: { template: entry.templateId, vendor: choice } });
      return;
    }
    if (choice === saved) {
      router.back();
      return;
    }
    const workspaceId = workspaceIfShown(session, resource.loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await updateSubscription(
        workspaceId,
        subscription.id,
        { config: { ...subscription.config, [field.key]: choice } },
        keys.keyFor(choice),
      );
      keys.settle(choice);
      router.back();
    } catch {
      setError(VENDOR_SAVE_FAILED);
    } finally {
      setBusy(null);
    }
  };

  const check = (on: boolean) =>
    on ? <CheckCircle testID="vendor-chosen" size={iconSize.row} weight="fill" color={palette.accent} /> : null;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{VENDOR_TITLE}</Text>
          <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>{vendorFor(subscription?.name ?? entry.name)}</Text>
        </View>
      </View>

      <SurfaceCard>
        {vendors.map((connection) => {
          const provider = providers.get(connection.providerId);
          const connectionId = connectedId(connection.providerId);
          const brand = brandLogoFor(provider?.icon);
          const chosen = choice === connection.providerId;
          return (
            <Pressable
              key={connection.providerId}
              testID={`vendor-${connection.providerId}`}
              accessibilityRole="radio"
              accessibilityLabel={connection.displayName}
              accessibilityState={{ selected: chosen, disabled: !connectionId }}
              onPress={connectionId ? () => choose(connection.providerId) : undefined}
              style={({ pressed: down }) => [
                styles.row,
                { borderBottomWidth: 1, borderBottomColor: palette.divider },
                down && connectionId ? { opacity: 0.7 } : null,
              ]}>
              <View style={styles.rowBody}>
                <VendorMark icon={provider?.icon} name={connection.displayName} />
                {connectionId ? (
                  <Text style={[styles.line, { color: status.ok }]}>{VENDOR_CONNECTED}</Text>
                ) : canManage && provider ? (
                  brand ? (
                    <VendorConnectButton
                      brand={brand}
                      testID={`vendor-connect-${connection.providerId}`}
                      disabled={busy !== null}
                      onPress={() => connect(provider)}
                    />
                  ) : (
                    <PillButton
                      testID={`vendor-connect-${connection.providerId}`}
                      label="Connect"
                      variant="secondary"
                      height={40}
                      fontSize={typeScale.body.fontSize}
                      disabled={busy !== null}
                      style={styles.connectPill}
                      onPress={() => connect(provider)}
                    />
                  )
                ) : (
                  <Text style={[styles.line, { color: palette.neutral[400] }]}>{VENDOR_ASK_ADMIN}</Text>
                )}
                {connectionId && canManage && provider ? (
                  <Text
                    testID={`vendor-disconnect-${connection.providerId}`}
                    accessibilityRole="link"
                    suppressHighlighting
                    onPress={pressed(() => setDisconnecting({ provider, connectionId }))}
                    style={[styles.link, { color: palette.accentRamp[300] }]}>
                    {brand?.disconnectLabel ?? 'Disconnect'}
                  </Text>
                ) : null}
              </View>
              {check(chosen)}
            </Pressable>
          );
        })}
        <Pressable
          testID="vendor-none"
          accessibilityRole="radio"
          accessibilityLabel="None"
          accessibilityState={{ selected: choice === NONE }}
          onPress={() => choose(NONE)}
          style={({ pressed: down }) => [styles.row, down && { opacity: 0.7 }]}>
          <View style={styles.rowBody}>
            <NoVendorMark />
            <Text style={[styles.line, { color: palette.neutral[400] }]}>{VENDOR_NONE_SUB}</Text>
          </View>
          {check(choice === NONE)}
        </Pressable>
      </SurfaceCard>

      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: status.err }]}>
          {error}
        </Text>
      ) : null}

      <PillButton
        testID="vendor-finish"
        label={subscription ? (busy === 'save' ? VENDOR_SAVING : VENDOR_SAVE) : VENDOR_DONE}
        variant="primary"
        height={52}
        fontSize={typeScale.lead.fontSize}
        disabled={busy !== null}
        onPress={finish}
      />

      {disconnecting ? (
        <ConfirmDialog
          testID="vendor-disconnect-dialog"
          title={`${brandLogoFor(disconnecting.provider.icon)?.disconnectLabel ?? `Disconnect ${disconnecting.provider.displayName}`}?`}
          body={VENDOR_DISCONNECT_BODY}
          confirmLabel="Disconnect"
          busyLabel="Disconnecting…"
          fallback="The connection was not changed."
          run={async () => {
            const workspaceId = workspaceIfShown(session, resource.loadedFor);
            if (!workspaceId) throw new Error(WORKSPACE_CHANGED);
            await disconnectConnection(workspaceId, disconnecting.connectionId);
            // What it changed is read again, past the snapshot.
            invalidateShared(workspaceId, ['connections', 'subscriptions']);
          }}
          onClose={() => setDisconnecting(null)}
          onDone={() => {
            // A vendor no longer connected is no choice: None until it is connected again.
            if (choice === disconnecting.provider.providerId) setPicked(NONE);
            setDisconnecting(null);
            resource.refresh();
          }}
        />
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
  // The logo's clear space (Intuit: half its symbol's height; 12 here) on every side.
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 14 },
  rowBody: { flex: 1, minWidth: 0, gap: 12, alignItems: 'flex-start' },
  line: { fontFamily: fonts.regular, ...typeScale.small },
  link: { fontFamily: fonts.medium, fontSize: typeScale.body.fontSize },
  connectPill: { paddingHorizontal: 18 },
  error: { fontFamily: fonts.regular, ...typeScale.small },
});
