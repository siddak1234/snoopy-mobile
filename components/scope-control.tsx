import { Buildings, CaretDown, Check, Plus, Stack, User, UsersThree, type Icon } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { Pressable } from '@/components/pressable';
import { SettingsRow } from '@/components/settings/settings-row';
import { WorkspaceSwitcher } from '@/components/settings/workspace-switcher';
import { CreateTeamDialog } from '@/components/teams/create-team-dialog';
import { fonts, layout, typeScale, withAlpha } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { activeWorkspaceId, useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { ALL_TEAMS_ICON, teamTypeIcon } from '@/lib/content/team-types';
import { readProjects } from '@/lib/platform/projects';
import { administers } from '@/lib/view/roles';

/**
 * What the scope control reads and which of its cards is open, shared by its two
 * forms: the labelled pills (Flows, Activity) and Home's icons.
 *
 * Teams come from the shared snapshot, so every screen drawing a form reads the
 * list once.
 */
function useScopeChoices() {
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
  const workspaceLabel = activeWorkspace?.name ?? 'Workspace';

  return {
    session,
    projectId,
    setProjectId,
    open,
    setOpen,
    activeWorkspace,
    workspaceLabel,
    canSwitchWorkspace,
    canCreateTeam,
    teams,
    openTeams,
    chosen,
    teamLabel,
  };
}

type ScopeChoices = ReturnType<typeof useScopeChoices>;

/**
 * The cards both forms open: the workspace switcher, Show (the team list), and
 * Create a team. One set, so a choice made from Home's icons is made exactly as
 * from the pills.
 */
function ScopeCards({ scope }: { scope: ScopeChoices }) {
  const { palette } = useTheme();
  const { session, projectId, setProjectId, open, setOpen, canCreateTeam, teams, openTeams, chosen } = scope;
  return (
    <>
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
    </>
  );
}

/**
 * A pill that says what is chosen and, with a caret, opens the choice: the
 * scope control's two, and Activity's time range beside its title (the owner's
 * build 13 decision 4), which chooses what that screen shows as these do. With
 * no `onPress` it is not a button and draws no caret.
 */
export function ScopePill({
  icon: IconCmp,
  label,
  accessibilityLabel,
  onPress,
  testID,
}: {
  icon: Icon;
  label: string;
  /** What it is and what is chosen: a pill is read aloud as "Team: Legal". */
  accessibilityLabel: string;
  onPress?: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: palette.neutral[800], backgroundColor: withAlpha(palette.surface, pressed ? 0.9 : 0.6) },
      ]}>
      <IconCmp size={15} color={palette.accentRamp[300]} />
      <Text numberOfLines={1} style={[styles.pillLabel, { color: palette.text }]}>
        {label}
      </Text>
      {onPress ? <CaretDown size={12} color={palette.neutral[500]} /> : null}
    </Pressable>
  );
}

/**
 * The scope control at the top of Flows and Activity (BUILD-PLAN 24.9.2;
 * teams since 24.11.7): the workspace, then "All teams" or one team. The
 * workspace pill opens the switcher. The team pill is always there — with no
 * team yet it still offers "Create a team", which is where a person starts one
 * (the owner, build 7) — and a team made from it is the scope at once. A team
 * is named by its kind (24.12). Creating one is an owner's or an admin's in an
 * organization, so a plain member is not offered it; in a personal workspace
 * the person is its owner. Home draws the same control as two icons
 * (`ScopeIcons`, the owner's build 13 decision 2).
 */
export function ScopeControl() {
  const scope = useScopeChoices();
  const { setOpen, workspaceLabel, canSwitchWorkspace, chosen, teamLabel } = scope;

  return (
    <View style={styles.row} testID="scope-control">
      <ScopePill
        icon={Buildings}
        label={workspaceLabel}
        accessibilityLabel={`Workspace: ${workspaceLabel}`}
        onPress={canSwitchWorkspace ? () => setOpen('workspace') : undefined}
      />
      <ScopePill
        icon={chosen ? UsersThree : Stack}
        label={teamLabel}
        accessibilityLabel={`Team: ${teamLabel}`}
        onPress={() => setOpen('team')}
      />
      <ScopeCards scope={scope} />
    </View>
  );
}

/**
 * Home's scope control: two icons beside the bell, the words gone (the owner's
 * build 13 decision 2, 2026-10-06). The workspace is a person (Personal) or a
 * building (an organization); the team is its kind's icon (`teamTypeIcon`), or
 * four squares for All teams. An icon cannot say which workspace or team is
 * chosen, so each is read aloud as what it is and what is chosen ("Workspace:
 * Acme", "Team: Legal"), and each opens the card the pills open, where the words
 * are — the workspace's with any number of workspaces, since only the card can
 * name the one there is. Drawn as the bell beside them, and like it, every press
 * ticks.
 */
export function ScopeIcons() {
  const { palette } = useTheme();
  const scope = useScopeChoices();
  const { setOpen, activeWorkspace, workspaceLabel, chosen, teamLabel } = scope;
  const WorkspaceIcon = activeWorkspace?.type === 'personal' ? User : Buildings;
  const TeamIcon = chosen ? teamTypeIcon(chosen.type) : ALL_TEAMS_ICON;
  const button = ({ pressed }: { pressed: boolean }) => [
    styles.iconButton,
    { borderColor: palette.neutral[800] },
    pressed && { backgroundColor: withAlpha(palette.text, 0.07) },
  ];

  return (
    <>
      <Pressable
        testID="home-scope-workspace"
        accessibilityRole="button"
        accessibilityLabel={`Workspace: ${workspaceLabel}`}
        onPress={() => setOpen('workspace')}
        style={button}>
        <WorkspaceIcon size={19} color={palette.neutral[300]} weight="regular" />
      </Pressable>
      <Pressable
        testID="home-scope-team"
        accessibilityRole="button"
        accessibilityLabel={`Team: ${teamLabel}`}
        onPress={() => setOpen('team')}
        style={button}>
        <TeamIcon size={19} color={palette.neutral[300]} weight="regular" />
      </Pressable>
      <ScopeCards scope={scope} />
    </>
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
  // Home's bell, exactly: the header's four buttons are one row of circles.
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    marginHorizontal: -layout.rowPadH,
  },
});
