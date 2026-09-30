import { useRouter } from 'expo-router';
import { CaretRight, FolderSimple, Plus } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { em, fonts, layout } from '@/constants/theme';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { errorTitleFor } from '@/lib/content/screen-states';
import { readAccessibleProjects, type Project } from '@/lib/platform/projects';

const ROLE: Record<Project['viewerRole'], string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

/**
 * Settings → Projects (BUILD-PLAN 24.5.2) — the website's projects page: every
 * project this person can see, in every workspace they are in, grouped by
 * workspace, and creating one. An archived (deleted) project is not listed.
 * Read again when the active workspace changes, because a team project is made
 * in the active organization.
 */
export default function ProjectsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const [creating, setCreating] = useState(false);

  const projects = useWorkspaceResource(async (workspaceId) => {
    const { workspaces, items } = await readAccessibleProjects();
    const groups = new Map<string, { title: string; items: Project[] }>();
    for (const { workspace, project } of items) {
      if (project.status === 'archived') continue;
      const group = groups.get(workspace.id) ?? {
        title: workspace.type === 'organization' ? `${workspace.name} Team Projects` : workspace.name,
        items: [],
      };
      group.items.push(project);
      groups.set(workspace.id, group);
    }
    const active = workspaces.find((workspace) => workspace.id === workspaceId);
    return {
      groups: [...groups.entries()],
      personal: workspaces.find((workspace) => workspace.type === 'personal'),
      teamWorkspace: active?.type === 'organization' ? active : null,
      inOrganization: workspaces.some((workspace) => workspace.type === 'organization'),
    };
  });

  if (projects.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (projects.status === 'offline') {
    return <ScreenOffline onRetry={projects.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (projects.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('projects')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (projects.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor('projects')}
        onRetry={projects.reload}
        body={busyBody(projects)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const data = projects.data;
  const muted = { color: palette.neutral[400] };
  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>Projects</Text>
          <Text style={[styles.subtitle, muted]}>
            {data.groups.length > 1 ? 'Manage your projects across all organizations' : 'Manage your projects'}
          </Text>
        </View>
      </View>

      <PillButton label="Create project" variant="primary" height={46} icon={Plus} iconSize={16} onPress={() => setCreating(true)} />

      {data.groups.length === 0 ? (
        <SurfaceCard style={styles.note}>
          <Text style={[styles.text, { color: palette.text }]}>No projects yet.</Text>
          <Text style={[styles.text, muted]}>
            Create a project to get started, or join an organization to access team projects.
          </Text>
        </SurfaceCard>
      ) : null}
      {data.groups.map(([workspaceId, group]) => (
        <View key={workspaceId}>
          <SectionLabel>{group.title.toUpperCase()}</SectionLabel>
          <SurfaceCard style={styles.card}>
            {group.items.map((project, index) => (
              <SettingsRow
                key={project.id}
                testID={`project-${project.id}`}
                icon={FolderSimple}
                title={project.name}
                sub={project.status === 'active' ? project.type : `${project.type} · ${project.status}`}
                divider={index < group.items.length - 1}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/settings/project', params: { projectId: project.id, workspaceId } })
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
        </View>
      ))}

      {creating ? (
        <CreateProjectDialog
          personal={data.personal}
          teamWorkspace={data.teamWorkspace}
          inOrganization={data.inOrganization}
          shownWorkspaceId={projects.loadedFor}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            projects.reload();
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
  title: { fontFamily: fonts.medium, fontSize: 21, letterSpacing: em(-0.01, 21) },
  subtitle: { fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  card: { marginTop: 9 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  role: { fontFamily: fonts.regular, fontSize: 12.5 },
  note: { padding: 14, gap: 4 },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
