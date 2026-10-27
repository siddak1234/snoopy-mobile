import { useRouter } from 'expo-router';
import { Plugs } from 'phosphor-react-native';
import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { ConnectionsCard } from '@/components/settings/connections-card';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
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
 *
 * What a connect came back with — completed, or already connected — is said
 * above the rows, as the website says it on the page a connect returns to. It
 * is kept here rather than in the card: the re-read after a change draws the
 * loading state in the card's place.
 */
export default function ConnectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const [notice, setNotice] = useState<string | null>(null);

  const connections = useWorkspaceResource(async (workspaceId) => {
    const [providers, held] = await Promise.all([readConnectionProviders(), readConnections(workspaceId)]);
    return { rows: toConnectionRows(providers.providers, held.connections) };
  });

  if (connections.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (connections.status === 'offline') {
    return <ScreenOffline onRetry={() => connections.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (connections.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('settings')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (connections.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('settings')}
        onRetry={() => connections.reload()}
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
    <Page>
      <PageHeader onBack={() => router.back()} title="Connections" />
      <ConnectionsCard
        rows={connections.data.rows}
        loadedFor={connections.loadedFor}
        canManage={administers(roleIn(session, connections.loadedFor))}
        notice={notice}
        onNotice={setNotice}
        onChanged={connections.reload}
      />
    </Page>
  );
}
