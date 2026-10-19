import { Buildings, CaretDown, Stack, User, type Icon } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Dropdown } from '@/components/dropdown';
import { GlassSurface } from '@/components/glass-surface';
import { Pressable } from '@/components/pressable';
import { WorkspaceSwitcher } from '@/components/settings/workspace-switcher';
import { fonts, typeScale, withAlpha } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { ALL_TEAMS_ICON, teamTypeIcon } from '@/lib/content/team-types';
import { readProjects } from '@/lib/platform/projects';

/**
 * What the scope control reads: its two icons, on Home beside the bell and on
 * Flows and Activity in the title row (Build 22).
 *
 * Departments come from the shared snapshot, so every screen drawing a form
 * reads the list once.
 */
function useScopeChoices() {
  const session = useSession();
  const { projectId, setProjectId } = useScope();

  const currentSession = session.status === 'signed-in' ? session.session : null;
  const activeWorkspace =
    currentSession?.workspaces.find((workspace) => workspace.id === currentSession.user.activeWorkspaceId) ??
    currentSession?.workspaces[0];

  const teams = useWorkspaceResource(async (workspaceId) =>
    (await readProjects(workspaceId)).filter((project) => project.status !== 'archived'),
  );
  const openTeams = teams.status === 'ready' ? teams.data : [];
  const chosen = openTeams.find((project) => project.id === projectId);
  // A stored department that is gone (deleted, left, or another workspace's) reads as all.
  const teamLabel = chosen ? chosen.type : 'All departments';
  const workspaceLabel = activeWorkspace?.name ?? 'Workspace';

  return { projectId, setProjectId, activeWorkspace, workspaceLabel, teams, openTeams, chosen, teamLabel };
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
  /** What it is and what is chosen: a pill is read aloud as "Time range: Today". */
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
 * One circle of the header row: 38 across, the glyph at 19, every press
 * ticking. The scope's two icons are drawn with it, and since Build 22 a title
 * row's own controls when the row has no room for their words (the session's
 * S26; the Build 22 review's M11) — Flows' Archived always, its New — `accent`,
 * New's accent glyph and tint — and Activity's time range, so every circle in a
 * header row is the same. On Liquid Glass since round 23 (`GlassSurface`,
 * interactive; the owner's build 22 items 5–6; ~~a hairline ring~~), as Home's
 * bell and the back circle are.
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
    <GlassSurface radius={999} interactive tone={tone} style={styles.iconButton}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          styles.iconPress,
          pressed && { backgroundColor: accent ? withAlpha(palette.accent, 0.12) : withAlpha(palette.text, 0.07) },
        ]}>
        <Glyph size={19} color={accent ? palette.accent : palette.neutral[300]} weight="regular" />
      </Pressable>
    </GlassSurface>
  );
}

/**
 * The scope control (BUILD-PLAN 24.9.2; departments since 24.11.7): two
 * icons, the words gone (the owner's build 13 decision 2, 2026-10-06) — on
 * Home beside the bell, and since Build 22 in Flows' and Activity's title rows
 * (`TitleRow`; the owner's build 21 items 2–4). The workspace is a person
 * (Personal) or a building (an organization); the department is its kind's
 * icon (`teamTypeIcon`), or four squares for All departments. An icon cannot
 * say which workspace or department is chosen, so each is read aloud as what
 * it is and what is chosen ("Workspace: Acme", "Department: Legal"), and each
 * opens its drop-down, where the words are (round 23, the owner's build 22
 * items 3–4; ~~its card~~): the workspace's (`WorkspaceSwitcher`), and
 * Department — All departments, then each — with a load error in it. The
 * card's explanatory sentence went with the card (S3: the title says what the
 * menu is). Every press ticks. ~~`ScopeControl`, the labelled pills above
 * Flows' and Activity's titles~~ until Build 22 ("This looks odd").
 *
 * `testIDPrefix` names where it is drawn: `home-scope` (Home) or `title-scope`
 * (a title row).
 */
export function ScopeIcons({ testIDPrefix = 'home-scope' }: { testIDPrefix?: string }) {
  const { projectId, setProjectId, activeWorkspace, workspaceLabel, teams, openTeams, chosen, teamLabel } =
    useScopeChoices();
  const WorkspaceIcon = activeWorkspace?.type === 'personal' ? User : Buildings;
  const TeamIcon = chosen ? teamTypeIcon(chosen.type) : ALL_TEAMS_ICON;
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  return (
    <>
      <WorkspaceSwitcher
        open={workspaceOpen}
        onOpenChange={setWorkspaceOpen}
        trigger={
          <CircleButton
            testID={`${testIDPrefix}-workspace`}
            icon={WorkspaceIcon}
            accessibilityLabel={`Workspace: ${workspaceLabel}`}
            onPress={() => setWorkspaceOpen(true)}
          />
        }
      />
      <Dropdown
        testID="scope-team"
        title="Department"
        options={[
          { value: 'all', label: 'All departments', icon: Stack, testID: 'scope-option-all' },
          ...openTeams.map((project) => ({
            value: project.id,
            label: project.type,
            icon: teamTypeIcon(project.type),
            testID: `scope-option-${project.id}`,
          })),
        ]}
        value={projectId === null || !chosen ? 'all' : projectId}
        open={teamOpen}
        onOpenChange={setTeamOpen}
        onChange={(value) => {
          setProjectId(value === 'all' ? null : value);
          setTeamOpen(false);
        }}
        status={teams.status === 'error' ? { text: teams.message, tone: 'error', testID: 'scope-team-error' } : null}
        trigger={
          <CircleButton
            testID={`${testIDPrefix}-team`}
            icon={TeamIcon}
            accessibilityLabel={`Department: ${teamLabel}`}
            onPress={() => setTeamOpen(true)}
          />
        }
      />
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
  },
  iconPress: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
