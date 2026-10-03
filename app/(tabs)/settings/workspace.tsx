import { useRouter } from 'expo-router';
import {
  Archive,
  Buildings,
  CaretRight,
  DownloadSimple,
  IdentificationBadge,
  Users,
  UsersThree,
} from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { SettingsRow } from '@/components/settings/settings-row';
import { WorkspaceSwitcher } from '@/components/settings/workspace-switcher';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';

/**
 * Settings › Workspace (24.12, the owner's decision 10): the workspace this
 * session is in and switching it, the person's role there, and the areas the
 * website keeps under `/account` — Organization, Teams, Archived flows and
 * Export my data. It reads nothing itself; the switcher reads the workspace
 * collection when it opens.
 */
export default function WorkspaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const currentSession = session.status === 'signed-in' ? session.session : null;
  const activeWorkspace =
    currentSession?.workspaces.find((workspace) => workspace.id === currentSession.user.activeWorkspaceId) ??
    currentSession?.workspaces[0];

  /**
   * Hidden below two workspaces, as the web switcher is — unless the session
   * says its list is truncated, in which case the collection may hold more and
   * only reading it can say. The trigger is the design's own WORKSPACE row.
   */
  const canSwitchWorkspace =
    currentSession !== null &&
    (currentSession.workspaces.length >= 2 || currentSession.workspacesTruncated === true);
  const caret = <CaretRight size={15} color={palette.neutral[500]} />;
  const muted = { color: palette.neutral[500] };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Workspace</Text>
      </View>

      <SurfaceCard>
        <SettingsRow
          icon={Buildings}
          title={activeWorkspace?.name ?? 'Workspace'}
          divider
          testID="workspace-switcher-row"
          onPress={canSwitchWorkspace ? () => setSwitcherOpen(true) : undefined}
          right={
            canSwitchWorkspace ? (
              <View style={styles.right}>
                <Text style={[styles.value, muted]}>{activeWorkspace?.type ?? ''}</Text>
                <CaretRight size={15} color={palette.neutral[500]} testID="workspace-switcher-caret" />
              </View>
            ) : (
              <Text style={[styles.value, muted]}>{activeWorkspace?.type ?? ''}</Text>
            )
          }
        />
        <SettingsRow
          icon={Users}
          title="Your role"
          divider
          right={<Text style={[styles.value, muted]}>{activeWorkspace?.role ?? '—'}</Text>}
        />
        <SettingsRow
          icon={IdentificationBadge}
          title="Organization"
          divider
          testID="settings-organization"
          onPress={() => router.push('/(tabs)/settings/organization')}
          right={caret}
        />
        <SettingsRow
          icon={UsersThree}
          title="Teams"
          sub="Your teams, who is on them, and asking to join one"
          divider
          testID="settings-teams"
          onPress={() => router.push('/(tabs)/settings/teams')}
          right={caret}
        />
        <SettingsRow
          icon={Archive}
          title="Archived flows"
          sub="Kept with their history; add any again"
          divider
          testID="settings-archived-flows"
          // The Settings stack's own copy, so Back returns here (the owner's build 9).
          onPress={() => router.push('/(tabs)/settings/archived')}
          right={caret}
        />
        <SettingsRow
          icon={DownloadSimple}
          title="Export my data"
          sub="A copy of this workspace's records, as a file"
          testID="settings-data"
          onPress={() => router.push('/(tabs)/settings/data')}
          right={caret}
        />
      </SurfaceCard>

      <WorkspaceSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
  right: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  value: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
});
