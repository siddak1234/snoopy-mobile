import { Buildings, CaretDown, Check, Stack, User, UsersThree, type Icon } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { Pressable } from '@/components/pressable';
import { SettingsRow } from '@/components/settings/settings-row';
import { WorkspaceSwitcher } from '@/components/settings/workspace-switcher';
import { fonts, layout, typeScale, withAlpha } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { ALL_TEAMS_ICON, teamTypeIcon } from '@/lib/content/team-types';
import { readProjects } from '@/lib/platform/projects';

/**
 * What the scope control reads and which of its cards is open: its two icons,
 * on Home beside the bell and on Flows and Activity beside the title (Build 22).
 *
 * Teams come from the shared snapshot, so every screen drawing a form reads the
 * list once.
 */
function useScopeChoices() {
  const session = useSession();
  const { projectId, setProjectId } = useScope();
  const [open, setOpen] = useState<'workspace' | 'team' | null>(null);

  const currentSession = session.status === 'signed-in' ? session.session : null;
  const activeWorkspace =
    currentSession?.workspaces.find((workspace) => workspace.id === currentSession.user.activeWorkspaceId) ??
    currentSession?.workspaces[0];

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
    teams,
    openTeams,
    chosen,
    teamLabel,
  };
}

type ScopeChoices = ReturnType<typeof useScopeChoices>;

/**
 * The cards the icons open: the workspace switcher and Show (the team list).
 * No Create a team since the Invoice Processing update (backend ADR-0036): the
 * platform makes a flow's team when it is first needed.
 */
function ScopeCards({ scope }: { scope: ScopeChoices }) {
  const { palette } = useTheme();
  const { projectId, setProjectId, open, setOpen, teams, openTeams, chosen } = scope;
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
            divider={openTeams.length > 0}
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
              divider={index < openTeams.length - 1}
              testID={`scope-option-${project.id}`}
              onPress={() => {
                setProjectId(project.id);
                setOpen(null);
              }}
              right={project.id === projectId ? <Check size={16} color={palette.accent} /> : null}
            />
          ))}
        </View>
        {teams.status === 'error' ? <DialogText tone="error">{teams.message}</DialogText> : null}
      </Dialog>
    </>
  );
}

/**
 * A pill that says what is chosen and, with a caret, opens the choice:
 * Activity's time range beside its title (the owner's build 13 decision 4).
 * With no `onPress` it is not a button and draws no caret. ~~The scope
 * control's two pills on Flows and Activity~~ until Build 22.
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
 * One circle of the header row: Home's bell, exactly — 38 across, a hairline
 * ring, the glyph at 19 — every press ticking. The scope's two icons are drawn
 * with it, and since Build 22 a title row's own controls when the row has no
 * room for their words (the session's S26; the Build 22 review's M11): Flows'
 * Archived, then its New — `accent`, New's accent ring and glyph, as its pill
 * is drawn — and Activity's time range, so every circle in a header row is the
 * same.
 */
export function CircleButton({
  icon: Glyph,
  accessibilityLabel,
  onPress,
  testID,
  tone = 'neutral',
}: {
  icon: Icon;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
  tone?: 'neutral' | 'accent';
}) {
  const { palette } = useTheme();
  const accent = tone === 'accent';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { borderColor: accent ? palette.accent : palette.neutral[800] },
        pressed && { backgroundColor: accent ? withAlpha(palette.accent, 0.12) : withAlpha(palette.text, 0.07) },
      ]}>
      <Glyph size={19} color={accent ? palette.accent : palette.neutral[300]} weight="regular" />
    </Pressable>
  );
}

/**
 * The scope control (BUILD-PLAN 24.9.2; teams since 24.11.7): two icons, the
 * words gone (the owner's build 13 decision 2, 2026-10-06) — on Home beside
 * the bell, and since Build 22 on Flows and Activity beside the title
 * (`TitleRow`; the owner's build 21 items 2–4: "the logos same as home for
 * organization and team"). The workspace is a person (Personal) or a building
 * (an organization); the team is its kind's icon (`teamTypeIcon`), or four
 * squares for All teams. An icon cannot say which workspace or team is chosen,
 * so each is read aloud as what it is and what is chosen ("Workspace: Acme",
 * "Team: Legal"), and each opens its card, where the words are — the
 * workspace's with any number of workspaces, since only the card can name the
 * one there is. Drawn as the bell beside them, and like it, every press ticks.
 * ~~`ScopeControl`, the labelled pills above Flows' and Activity's titles~~
 * until Build 22 ("This looks odd").
 *
 * `testIDPrefix` names where it is drawn: `home-scope` (Home) or `title-scope`
 * (a title row).
 */
export function ScopeIcons({ testIDPrefix = 'home-scope' }: { testIDPrefix?: string }) {
  const scope = useScopeChoices();
  const { setOpen, activeWorkspace, workspaceLabel, chosen, teamLabel } = scope;
  const WorkspaceIcon = activeWorkspace?.type === 'personal' ? User : Buildings;
  const TeamIcon = chosen ? teamTypeIcon(chosen.type) : ALL_TEAMS_ICON;

  return (
    <>
      <CircleButton
        testID={`${testIDPrefix}-workspace`}
        icon={WorkspaceIcon}
        accessibilityLabel={`Workspace: ${workspaceLabel}`}
        onPress={() => setOpen('workspace')}
      />
      <CircleButton
        testID={`${testIDPrefix}-team`}
        icon={TeamIcon}
        accessibilityLabel={`Team: ${teamLabel}`}
        onPress={() => setOpen('team')}
      />
      <ScopeCards scope={scope} />
    </>
  );
}

const styles = StyleSheet.create({
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
