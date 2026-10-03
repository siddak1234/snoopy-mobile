import { useRouter } from 'expo-router';
import { Plugs } from 'phosphor-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { ConnectionsCard } from '@/components/settings/connections-card';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { roleIn, useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { CONNECTIONS_EMPTY_TITLE, errorTitleFor } from '@/lib/content/screen-states';
import { readConnectionProviders, readConnections } from '@/lib/platform/catalog';
import { toConnectionRows } from '@/lib/view/catalog';
import { administers } from '@/lib/view/roles';

/**
 * Settings › Connections (24.12, the owner's decision 9): the third-party
 * integrations this workspace's flows use — nothing else; sign-in accounts are
 * Account's. The card the old single Settings screen drew, with its read and
 * its load states, now a page of its own.
 *
 * Driven by the provider list rather than the connection list: the connections
 * read omits a provider with no connection at all, and that row ("Slack · Not
 * connected") is drawn too.
 */
export default function ConnectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();

  const connections = useWorkspaceResource(async (workspaceId) => {
    const [providers, held] = await Promise.all([readConnectionProviders(), readConnections(workspaceId)]);
    return { rows: toConnectionRows(providers.providers, held.connections) };
  });

  if (connections.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (connections.status === 'offline') {
    return <ScreenOffline onRetry={connections.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (connections.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('settings')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (connections.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('settings')}
        onRetry={connections.reload}
        body={busyBody(connections)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }
  if (connections.data.rows.length === 0) {
    return (
      <ScreenEmpty
        icon={<Plugs size={40} color={palette.accentRamp[300]} />}
        title={CONNECTIONS_EMPTY_TITLE}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Connections</Text>
      </View>
      <ConnectionsCard
        rows={connections.data.rows}
        loadedFor={connections.loadedFor}
        canManage={administers(roleIn(session, connections.loadedFor))}
        onChanged={connections.reload}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
});
