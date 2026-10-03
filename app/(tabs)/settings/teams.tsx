import { useRouter } from 'expo-router';
import { CaretRight, Plus, UsersThree } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { ScreenEmpty, ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { CreateTeamDialog } from '@/components/teams/create-team-dialog';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { activeWorkspaceId, roleIn, useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { refusalMessage } from '@/lib/content/refusals';
import { TEAMS_EMPTY_BODY, TEAMS_EMPTY_TITLE, errorTitleFor } from '@/lib/content/screen-states';
import {
  cancelAccessRequest,
  readAccessRequests,
  readProjects,
  requestAccess,
  teamDirectoryIfThere,
  type Project,
  type TeamDirectoryEntry,
} from '@/lib/platform/projects';
import { readWorkspaces, type WorkspaceSummary } from '@/lib/platform/workspaces';
import { administers } from '@/lib/view/roles';

const ROLE: Record<Project['viewerRole'], string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

/**
 * Settings → Teams (BUILD-PLAN 24.11.7). A team is a sub-organization with its
 * own flows — a project, in the platform's contract. Every team this person is
 * on, in every workspace they are in, grouped by workspace (an organization's
 * owners and admins see all of its teams); Create a team; and, in each
 * organization, the teams they could ask to join, with Request, or Requested
 * and a way to withdraw. A deleted (archived) team is not listed. A team is
 * named by its kind (24.12). Create makes one in the active workspace, and is
 * not offered to a plain member of an organization. With nothing to list, the
 * screen is the empty-state standard (the owner's build 9).
 */
export default function TeamsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const keys = useIntentKeys('team-access');
  const [creating, setCreating] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<{ workspace: WorkspaceSummary; entry: TeamDirectoryEntry } | null>(
    null,
  );

  const teams = useWorkspaceResource(async () => {
    const { workspaces } = await readWorkspaces();
    const groups = await Promise.all(
      workspaces.map(async (workspace) => {
        // The directory where the platform has one: a 404 is nothing to ask
        // onto, and the teams this person is on are still listed.
        const [visible, directory] = await Promise.all([
          readProjects(workspace.id),
          workspace.type === 'organization' ? teamDirectoryIfThere(workspace.id) : Promise.resolve([]),
        ]);
        const mine = visible.filter((project) => project.status !== 'archived');
        const onIt = new Set(mine.map((project) => project.id));
        const askable = directory.filter((entry) => entry.access !== 'member' && !onIt.has(entry.id));
        return { workspace, mine, askable };
      }),
    );
    return { groups };
  });

  const ask = async (workspace: WorkspaceSummary, entry: TeamDirectoryEntry) => {
    if (asking) return;
    setAsking(entry.id);
    setAskError(null);
    try {
      await requestAccess(workspace.id, entry.id, keys.keyFor(entry.id));
      keys.settle(entry.id);
      teams.reload();
    } catch (caught) {
      setAskError(refusalMessage(caught, {}, 'Your request could not be sent.'));
    } finally {
      setAsking(null);
    }
  };

  if (teams.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (teams.status === 'offline') {
    return <ScreenOffline onRetry={teams.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (teams.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('teams')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (teams.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('teams')}
        onRetry={teams.reload}
        body={busyBody(teams)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const { groups } = teams.data;
  const shown = groups.filter((group) => group.mine.length > 0 || group.askable.length > 0);
  const organizations = groups.filter((group) => group.workspace.type === 'organization').length;
  const active = activeWorkspaceId(session);
  const canCreate = administers(
    groups.find((group) => group.workspace.id === active)?.workspace.role ?? roleIn(session, active),
  );
  const muted = { color: palette.neutral[400] };

  const createDialog = creating ? (
    <CreateTeamDialog
      onClose={() => setCreating(false)}
      onCreated={(team) => {
        setCreating(false);
        teams.reload();
        router.push({ pathname: '/(tabs)/settings/team', params: { projectId: team.id, workspaceId: team.workspaceId } });
      }}
    />
  ) : null;

  if (shown.length === 0) {
    return (
      <>
        <ScreenEmpty
          icon={<UsersThree size={40} color={palette.accentRamp[300]} />}
          title={TEAMS_EMPTY_TITLE}
          body={TEAMS_EMPTY_BODY}
          {...(canCreate ? { action: { label: 'Create a team', icon: Plus, onPress: () => setCreating(true) } } : {})}
          onBack={() => router.back()}
          topInset={insets.top}
        />
        {createDialog}
      </>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>Teams</Text>
          <Text style={[styles.subtitle, muted]}>
            {organizations > 1 ? 'Your teams across all organizations' : 'Your teams, and the ones you can ask to join'}
          </Text>
        </View>
      </View>

      {canCreate ? (
        <PillButton
          label="Create a team"
          variant="primary"
          height={46}
          icon={Plus}
          iconSize={16}
          onPress={() => setCreating(true)}
        />
      ) : null}

      {askError ? <Text style={[styles.text, { color: status.err }]}>{askError}</Text> : null}

      {shown.map(({ workspace, mine, askable }) => (
        <View key={workspace.id} style={styles.group}>
          <SectionLabel>{(workspace.type === 'personal' ? 'Personal' : workspace.name).toUpperCase()}</SectionLabel>
          <SurfaceCard style={styles.card}>
            {mine.length === 0 ? (
              <Text style={[styles.text, styles.pad, muted]}>You are not on a team here yet.</Text>
            ) : null}
            {mine.map((project, index) => (
              <SettingsRow
                key={project.id}
                testID={`team-${project.id}`}
                icon={UsersThree}
                title={project.type}
                divider={index < mine.length - 1}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/settings/team',
                    params: { projectId: project.id, workspaceId: workspace.id },
                  })
                }
                right={
                  <View style={styles.right}>
                    <Text style={[styles.role, { color: palette.neutral[500] }]}>{ROLE[project.viewerRole]}</Text>
                    <CaretRight size={15} color={palette.neutral[500]} />
                  </View>
                }
              />
            ))}
          </SurfaceCard>
          {askable.length > 0 ? (
            <View>
              <SectionLabel>ASK TO JOIN</SectionLabel>
              <SurfaceCard style={styles.card}>
                {askable.map((entry, index) => (
                  <SettingsRow
                    key={entry.id}
                    testID={`askable-${entry.id}`}
                    icon={UsersThree}
                    title={entry.type}
                    divider={index < askable.length - 1}
                    right={
                      entry.access === 'requested' ? (
                        <Pressable testID={`requested-${entry.id}`} onPress={() => setWithdrawing({ workspace, entry })}>
                          <Text style={[styles.link, { color: palette.neutral[400] }]}>Requested</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          testID={`request-${entry.id}`}
                          disabled={asking !== null}
                          onPress={() => ask(workspace, entry)}>
                          <Text style={[styles.link, { color: palette.accentRamp[300] }]}>
                            {asking === entry.id ? 'Asking…' : 'Request'}
                          </Text>
                        </Pressable>
                      )
                    }
                  />
                ))}
              </SurfaceCard>
            </View>
          ) : null}
        </View>
      ))}

      {createDialog}
      {withdrawing ? (
        <ConfirmDialog
          testID="withdraw-request-dialog"
          title={`Withdraw your request to join ${withdrawing.entry.type}?`}
          body="You can ask again any time."
          confirmLabel="Withdraw"
          busyLabel="Withdrawing…"
          fallback="Your request could not be withdrawn."
          run={async () => {
            const { workspace, entry } = withdrawing;
            // Anyone but a manager reads only their own requests, so the pending one is theirs.
            const pending = (await readAccessRequests(workspace.id, entry.id)).find(
              (request) => request.status === 'pending',
            );
            if (pending) await cancelAccessRequest(workspace.id, entry.id, pending.id, keys.keyFor(`withdraw-${entry.id}`));
            keys.settle(`withdraw-${entry.id}`);
          }}
          onClose={() => setWithdrawing(null)}
          onDone={() => {
            setWithdrawing(null);
            teams.reload();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
  subtitle: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize, marginTop: 1 },
  group: { gap: 12 },
  card: { marginTop: 9 },
  pad: { padding: 14 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  role: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  link: { fontFamily: fonts.medium, fontSize: typeScale.body.fontSize },
  text: { fontFamily: fonts.regular, ...typeScale.body },
});
