import { useLocalSearchParams, useRouter } from 'expo-router';
import { SignOut, Trash } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { TeamMembers } from '@/components/teams/team-members';
import { TeamRequests } from '@/components/teams/team-requests';
import { em, fonts, layout, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useResource } from '@/hooks/use-resource';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { errorTitleFor } from '@/lib/content/screen-states';
import { readWorkspaceMembers } from '@/lib/platform/organization';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';
import {
  archiveProject,
  readAccessRequests,
  readProject,
  readProjectMembers,
  removeProjectMember,
  type AccessRequest,
} from '@/lib/platform/projects';
import { readWorkspaces } from '@/lib/platform/workspaces';

/** The requests, where the platform has them (404 before the SEVENTEENTH promotion). */
async function requestsIfThere(workspaceId: string, projectId: string): Promise<AccessRequest[]> {
  try {
    return await readAccessRequests(workspaceId, projectId);
  } catch (error) {
    if (error instanceof PlatformError && error.status === 404) return [];
    throw error;
  }
}

/**
 * One team (BUILD-PLAN 24.11.7). Every action acts on the team's OWN workspace,
 * which this screen read it from: a team can live in a workspace other than the
 * active one. In an organization a team has members, and — for those who decide:
 * its owner or admin, and the organization's — the people asking to join. A
 * personal workspace's team has only its owner. The owner deletes it (archived:
 * it leaves every team list, and its flows keep running until archived in
 * Flows); anyone else on it leaves, typing DELETE first. Its title is its kind
 * (24.12), said once.
 */
export default function TeamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const keys = useIntentKeys('team');
  const { projectId, workspaceId } = useLocalSearchParams<{ projectId?: string; workspaceId?: string }>();
  const [ending, setEnding] = useState(false);
  const viewerUserId = session.status === 'signed-in' ? session.session.user.userId : null;

  const detail = useResource(async () => {
    if (!projectId || !workspaceId) throw new PlatformNotConfiguredError();
    const [{ workspaces }, project] = await Promise.all([readWorkspaces(), readProject(workspaceId, projectId)]);
    const workspace = workspaces.find((entry) => entry.id === workspaceId);
    if (!workspace) throw new PlatformError('The requested resource is unavailable.', 404);
    const organization = workspace.type === 'organization';
    const canManage = project.viewerRole === 'owner' || project.viewerRole === 'admin';
    const [members, people, requests] = await Promise.all([
      organization ? readProjectMembers(workspaceId, projectId) : [],
      organization && canManage ? readWorkspaceMembers(workspaceId) : [],
      organization && canManage ? requestsIfThere(workspaceId, projectId) : [],
    ]);
    return { workspace, project, organization, canManage, members, people, requests };
  }, [projectId, workspaceId]);

  if (detail.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (detail.status === 'offline') {
    return <ScreenOffline onRetry={detail.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (detail.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('team')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (detail.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('team')}
        onRetry={detail.reload}
        body={busyBody(detail)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const { workspace, project, organization, canManage, members, people, requests } = detail.data;
  const owner = project.viewerRole === 'owner';
  // An organization owner or admin sees every team without being on it; they
  // have nothing to leave.
  const onTeam = owner || members.some((member) => member.userId === viewerUserId);
  const onList = new Set(members.map((member) => member.userId));
  const muted = { color: palette.neutral[400] };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{project.type}</Text>
          <Text style={[styles.subtitle, muted]}>
            {[
              workspace.type === 'personal' ? 'Personal' : workspace.name,
              onTeam ? `You are its ${project.viewerRole}` : 'You see every team as an organization admin',
            ].join(' · ')}
          </Text>
        </View>
      </View>
      {project.description ? <Text style={[styles.text, muted]}>{project.description}</Text> : null}

      {organization ? (
        <TeamMembers
          workspaceId={workspace.id}
          projectId={project.id}
          viewerUserId={viewerUserId}
          viewerRole={project.viewerRole}
          members={members}
          available={people.filter((person) => !onList.has(person.userId))}
          onChanged={detail.reload}
          onLeft={() => router.back()}
        />
      ) : null}

      {organization && canManage ? (
        <TeamRequests
          workspaceId={workspace.id}
          projectId={project.id}
          teamName={project.type}
          requests={requests}
          onChanged={detail.reload}
        />
      ) : null}

      {owner || onTeam ? (
        <PillButton
          label={owner ? 'Delete team' : 'Leave team'}
          variant="secondary"
          height={44}
          icon={owner ? Trash : SignOut}
          iconSize={16}
          onPress={() => setEnding(true)}
        />
      ) : null}

      {ending ? (
        owner ? (
          <ConfirmDialog
            testID="delete-team-dialog"
            title={`Delete "${project.type}"?`}
            body="It leaves every team list. Its flows keep running until you archive them in Flows."
            confirmLabel="Delete team"
            busyLabel="Deleting…"
            fallback="The team could not be deleted."
            run={async () => {
              await archiveProject(workspace.id, project.id, keys.keyFor('delete'));
              keys.settle('delete');
            }}
            onClose={() => setEnding(false)}
            onDone={() => {
              setEnding(false);
              router.back();
            }}
          />
        ) : (
          <ConfirmDialog
            testID="leave-team-dialog"
            title={`Leave “${project.type}”?`}
            body="You will be removed from this team and stop seeing its flows. To confirm, type DELETE."
            confirmLabel="Leave team"
            busyLabel="Leaving…"
            fallback="You could not leave this team."
            typed="DELETE"
            run={async () => {
              await removeProjectMember(workspace.id, project.id, viewerUserId ?? '', keys.keyFor('leave'));
              keys.settle('leave');
            }}
            onClose={() => setEnding(false)}
            onDone={() => {
              setEnding(false);
              router.back();
            }}
          />
        )
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
  text: { fontFamily: fonts.regular, ...typeScale.body },
});
