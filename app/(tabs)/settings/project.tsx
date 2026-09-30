import { useLocalSearchParams, useRouter } from 'expo-router';
import { SignOut, Trash } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { ProjectMembers } from '@/components/projects/project-members';
import { ProjectTeams } from '@/components/projects/project-teams';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { em, fonts, layout } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useResource } from '@/hooks/use-resource';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { errorTitleFor } from '@/lib/content/screen-states';
import { readWorkspaceMembers } from '@/lib/platform/organization';
import { PlatformError, PlatformNotConfiguredError } from '@/lib/platform/problem';
import {
  archiveProject,
  readProject,
  readProjectMembers,
  readTeamGrants,
  removeProjectMember,
} from '@/lib/platform/projects';
import { readTeams } from '@/lib/platform/teams';
import { readWorkspaces } from '@/lib/platform/workspaces';
import { administers } from '@/lib/view/roles';

/**
 * One project (BUILD-PLAN 24.5.2) — the website's project page. Every action
 * acts on the project's OWN workspace, which this screen read it from: a
 * project can live in a workspace other than the active one, as the website's
 * projects page shows. A team project (in an organization) also has members and
 * teams with access; a personal one has only itself. Its owner deletes it (it is
 * archived, and its data reattaches to a new project of the same type); anyone
 * else leaves it, typing DELETE first.
 */
export default function ProjectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const keys = useIntentKeys('project');
  const { projectId, workspaceId } = useLocalSearchParams<{ projectId?: string; workspaceId?: string }>();
  const [ending, setEnding] = useState(false);
  const viewerUserId = session.status === 'signed-in' ? session.session.user.userId : null;

  const detail = useResource(async () => {
    if (!projectId || !workspaceId) throw new PlatformNotConfiguredError();
    const [{ workspaces }, project] = await Promise.all([readWorkspaces(), readProject(workspaceId, projectId)]);
    const workspace = workspaces.find((entry) => entry.id === workspaceId);
    if (!workspace) throw new PlatformError('The requested resource is unavailable.', 404);
    const team = workspace.type === 'organization';
    const canManage = project.viewerRole === 'owner' || project.viewerRole === 'admin';
    const [members, grants, teams, people] = await Promise.all([
      team ? readProjectMembers(workspaceId, projectId) : [],
      team ? readTeamGrants(workspaceId, projectId) : [],
      team ? readTeams(workspaceId) : [],
      team && canManage ? readWorkspaceMembers(workspaceId) : [],
    ]);
    return { workspace, project, team, canManage, members, grants, teams, people };
  }, [projectId, workspaceId]);

  if (detail.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (detail.status === 'offline') {
    return <ScreenOffline onRetry={detail.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (detail.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('project')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (detail.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('project')}
        onRetry={detail.reload}
        body={busyBody(detail)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const { workspace, project, team, canManage, members, grants, teams, people } = detail.data;
  const owner = project.viewerRole === 'owner';
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
          <Text style={[styles.title, { color: palette.text }]}>{project.name}</Text>
          <Text style={[styles.subtitle, muted]}>
            {[project.type, workspace.name, `You are its ${project.viewerRole}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      {project.description ? <Text style={[styles.text, muted]}>{project.description}</Text> : null}

      {team ? (
        <>
          <ProjectMembers
            workspaceId={workspace.id}
            projectId={project.id}
            viewerUserId={viewerUserId}
            viewerRole={project.viewerRole}
            members={members}
            available={people.filter((person) => !onList.has(person.userId))}
            onChanged={detail.reload}
            onLeft={() => router.back()}
          />
          <ProjectTeams
            workspaceId={workspace.id}
            projectId={project.id}
            projectName={project.name}
            grants={grants}
            teams={teams}
            canManage={canManage}
            administersWorkspace={administers(workspace.role)}
            onChanged={detail.reload}
            onOpenTeams={() => router.push('/(tabs)/settings/teams')}
          />
        </>
      ) : null}

      <PillButton
        label={owner ? 'Delete project' : 'Leave project'}
        variant="secondary"
        height={44}
        icon={owner ? Trash : SignOut}
        iconSize={16}
        onPress={() => setEnding(true)}
      />

      {ending ? (
        owner ? (
          <ConfirmDialog
            testID="delete-project-dialog"
            title={`Delete "${project.name}"?`}
            body="You can restore it later by creating a project of the same type — your data will reattach."
            confirmLabel="Delete"
            busyLabel="Deleting…"
            fallback="The project could not be archived."
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
            testID="leave-project-dialog"
            title={`Leave “${project.name}”?`}
            body="You will be removed from this project. To confirm, type DELETE."
            confirmLabel="Leave project"
            busyLabel="Leaving…"
            fallback="You could not leave this project."
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
  title: { fontFamily: fonts.medium, fontSize: 21, letterSpacing: em(-0.01, 21) },
  subtitle: { fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
