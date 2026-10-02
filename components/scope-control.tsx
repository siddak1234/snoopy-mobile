import { Buildings, CaretDown, Check, FolderSimple, Stack } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SettingsRow } from '@/components/settings/settings-row';
import { WorkspaceSwitcher } from '@/components/settings/workspace-switcher';
import { fonts, layout, withAlpha } from '@/constants/theme';
import { useWorkspaceResource } from '@/hooks/use-resource';
import { useScope } from '@/hooks/use-scope';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { readProjects } from '@/lib/platform/projects';

/**
 * The scope control at the top of Home, Flows and Activity (BUILD-PLAN
 * 24.9.2): the workspace, then "All projects" or one project. The workspace
 * pill opens the switcher that lived under Settings until 2026-10-02 — the
 * owner's feedback 2: "create and select a project should be in home". The
 * project pill is drawn only where the workspace has an open project; a
 * workspace without projects reads as it always has.
 *
 * Projects come from the shared snapshot, so three screens drawing this read
 * the list once.
 */
export function ScopeControl() {
  const { palette } = useTheme();
  const session = useSession();
  const { projectId, setProjectId } = useScope();
  const [open, setOpen] = useState<'workspace' | 'project' | null>(null);

  const currentSession = session.status === 'signed-in' ? session.session : null;
  const activeWorkspace =
    currentSession?.workspaces.find((workspace) => workspace.id === currentSession.user.activeWorkspaceId) ??
    currentSession?.workspaces[0];
  const canSwitchWorkspace =
    currentSession !== null &&
    (currentSession.workspaces.length >= 2 || currentSession.workspacesTruncated === true);

  const projects = useWorkspaceResource(async (workspaceId) =>
    (await readProjects(workspaceId)).filter((project) => project.status !== 'archived'),
  );
  const openProjects = projects.status === 'ready' ? projects.data : [];
  const chosen = openProjects.find((project) => project.id === projectId);
  // A stored project that is gone (archived, or another workspace's) reads as all.
  const projectLabel = chosen ? chosen.name : 'All projects';

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
      {openProjects.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Project: ${projectLabel}`}
          onPress={() => setOpen('project')}
          style={({ pressed }) => pill(pressed)}>
          {chosen ? (
            <FolderSimple size={15} color={palette.accentRamp[300]} />
          ) : (
            <Stack size={15} color={palette.accentRamp[300]} />
          )}
          <Text numberOfLines={1} style={[styles.pillLabel, { color: palette.text }]}>
            {projectLabel}
          </Text>
          <CaretDown size={12} color={palette.neutral[500]} />
        </Pressable>
      ) : null}

      <WorkspaceSwitcher open={open === 'workspace'} onClose={() => setOpen(null)} />
      <Dialog
        visible={open === 'project'}
        onRequestClose={() => setOpen(null)}
        testID="scope-project-dialog"
        title="Show"
        body="Flows, runs and approvals follow the project you pick. Connections and billing are the workspace's."
        actions={<DialogButton label="Done" onPress={() => setOpen(null)} />}>
        <View style={styles.list}>
          <SettingsRow
            icon={Stack}
            title="All projects"
            divider
            testID="scope-option-all"
            onPress={() => {
              setProjectId(null);
              setOpen(null);
            }}
            right={projectId === null || !chosen ? <Check size={16} color={palette.accent} /> : null}
          />
          {openProjects.map((project, index) => (
            <SettingsRow
              key={project.id}
              icon={FolderSimple}
              title={project.name}
              sub={project.description || undefined}
              divider={index < openProjects.length - 1}
              testID={`scope-option-${project.id}`}
              onPress={() => {
                setProjectId(project.id);
                setOpen(null);
              }}
              right={project.id === projectId ? <Check size={16} color={palette.accent} /> : null}
            />
          ))}
        </View>
        {projects.status === 'error' ? <DialogText tone="error">{projects.message}</DialogText> : null}
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    maxWidth: '60%',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillLabel: {
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  list: {
    marginHorizontal: -layout.rowPadH,
  },
});
