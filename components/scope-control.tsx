import { Buildings, CaretDown, Check, Plus, Stack, UsersThree } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SettingsRow } from '@/components/settings/settings-row';
import { WorkspaceSwitcher } from '@/components/settings/workspace-switcher';
import { CreateTeamDialog } from '@/components/teams/create-team-dialog';
import { fonts, layout, typeScale, withAlpha } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { readProjects } from '@/lib/platform/projects';
import { administers } from '@/lib/view/roles';

/**
 * The scope control at the top of Home, Flows and Activity (BUILD-PLAN 24.9.2;
 * teams since 24.11.7): the workspace, then "All teams" or one team. The
 * workspace pill opens the switcher. The team pill is always there — with no
 * team yet it still offers "Create a team", which is where a person starts one
 * (the owner, build 7) — and a team made from it is the scope at once. A team
 * is named by its kind (24.12). Creating one is an owner's or an admin's in an
 * organization, so a plain member is not offered it; in a personal workspace
 * the person is its owner.
 *
 * Teams come from the shared snapshot, so three screens drawing this read the
 * list once.
 */
export function ScopeControl() {
  const { palette } = useTheme();
  const session = useSession();
  const { projectId, setProjectId } = useScope();
  const [open, setOpen] = useState<'workspace' | 'team' | 'create' | null>(null);

  const currentSession = session.status === 'signed-in' ? session.session : null;
  const activeWorkspace =
    currentSession?.workspaces.find((workspace) => workspace.id === currentSession.user.activeWorkspaceId) ??
    currentSession?.workspaces[0];
  const canSwitchWorkspace =
    currentSession !== null &&
    (currentSession.workspaces.length >= 2 || currentSession.workspacesTruncated === true);
  const canCreateTeam = administers(activeWorkspace?.role);

  const teams = useWorkspaceResource(async (workspaceId) =>
    (await readProjects(workspaceId)).filter((project) => project.status !== 'archived'),
  );
  const openTeams = teams.status === 'ready' ? teams.data : [];
  const chosen = openTeams.find((project) => project.id === projectId);
  // A stored team that is gone (deleted, left, or another workspace's) reads as all.
  const teamLabel = chosen ? chosen.type : 'All teams';

  const pill = (pressed: boolean) => [
    styles.pill,
    { borderColor: palette.neutral[800], backgroundColor: withAlpha(palette.surface, pressed ? 0.9 : 0.6) },
  ];

  return (
    <View style={styles.row} testID="scope-control">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Workspace: ${activeWorkspace?.name ?? 'Workspace'}`}
        onPress={canSwitchWorkspace ? () => setOpen('workspace') : undefined}
        style={({ pressed }) => pill(pressed)}>
        <Buildings size={15} color={palette.accentRamp[300]} />
        <Text numberOfLines={1} style={[styles.pillLabel, { color: palette.text }]}>
          {activeWorkspace?.name ?? 'Workspace'}
        </Text>
        {canSwitchWorkspace ? <CaretDown size={12} color={palette.neutral[500]} /> : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Team: ${teamLabel}`}
        onPress={() => setOpen('team')}
        style={({ pressed }) => pill(pressed)}>
        {chosen ? (
          <UsersThree size={15} color={palette.accentRamp[300]} />
        ) : (
          <Stack size={15} color={palette.accentRamp[300]} />
        )}
        <Text numberOfLines={1} style={[styles.pillLabel, { color: palette.text }]}>
          {teamLabel}
        </Text>
        <CaretDown size={12} color={palette.neutral[500]} />
      </Pressable>

      <WorkspaceSwitcher open={open === 'workspace'} onClose={() => setOpen(null)} />
      <Dialog
        visible={open === 'team'}
        onRequestClose={() => setOpen(null)}
        testID="scope-team-dialog"
        title="Show"
        body="Flows, runs and approvals follow the team you pick. Connections and billing are the workspace's."
        actions={<DialogButton label="Done" onPress={() => setOpen(null)} />}>
        <View style={styles.list}>
          <SettingsRow
            icon={Stack}
            title="All teams"
            divider={openTeams.length > 0 || canCreateTeam}
            testID="scope-option-all"
            onPress={() => {
              setProjectId(null);
              setOpen(null);
            }}
            right={projectId === null || !chosen ? <Check size={16} color={palette.accent} /> : null}
          />
          {openTeams.map((project, index) => (
            <SettingsRow
              key={project.id}
              icon={UsersThree}
              title={project.type}
              divider={canCreateTeam || index < openTeams.length - 1}
              testID={`scope-option-${project.id}`}
              onPress={() => {
                setProjectId(project.id);
                setOpen(null);
              }}
              right={project.id === projectId ? <Check size={16} color={palette.accent} /> : null}
            />
          ))}
          {canCreateTeam ? (
            <SettingsRow
              icon={Plus}
              title="Create a team"
              testID="scope-create-team"
              // The picker closes first: a dialog shown over another is not
              // presented reliably on iOS.
              onPress={() => setOpen('create')}
              right={null}
            />
          ) : null}
        </View>
        {teams.status === 'error' ? <DialogText tone="error">{teams.message}</DialogText> : null}
      </Dialog>
      {open === 'create' ? (
        <CreateTeamDialog
          onClose={() => setOpen(null)}
          onCreated={(team) => {
            setOpen(null);
            teams.reload();
            // Made in the workspace being looked at: it is the scope now.
            if (team.workspaceId === activeWorkspaceId(session)) setProjectId(team.id);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // At the bigger type (24.12) two long names no longer share one line: the
  // team pill goes under the workspace's rather than off the screen's edge.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    // A name is cut short only where it is wider than the whole row; capped at
    // 60% it lost its last few letters at the bigger type.
    maxWidth: '100%',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillLabel: {
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: typeScale.body.fontSize,
  },
  list: {
    marginHorizontal: -layout.rowPadH,
  },
});
