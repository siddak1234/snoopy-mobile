import { useRouter } from 'expo-router';
import { CaretRight, UsersThree } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { em, fonts, layout, status } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { errorTitleFor } from '@/lib/content/screen-states';
import { createTeam, readTeams } from '@/lib/platform/teams';
import { readWorkspaces } from '@/lib/platform/workspaces';
import { administers } from '@/lib/view/roles';

/**
 * Settings → Teams (BUILD-PLAN 24.5.3, backend ADR-0010) — the website's teams
 * page. Teams belong to an organization: an owner or admin sees every one and
 * creates them; anyone else sees the teams they are on. A team's manager may be
 * a plain member of the workspace, which is why teams are their own screen and
 * not a section of Organization, which is for owners and admins.
 */
export default function TeamsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();

  const teams = useWorkspaceResource(async (workspaceId) => {
    const { workspaces } = await readWorkspaces();
    const active = workspaces.find((workspace) => workspace.id === workspaceId);
    if (active?.type !== 'organization') return { inOrganization: false as const };
    return { inOrganization: true as const, canCreate: administers(active.role), teams: await readTeams(workspaceId) };
  });

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

  const data = teams.data;
  const muted = { color: palette.neutral[400] };
  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>Teams</Text>
          <Text style={[styles.subtitle, muted]}>
            {!data.inOrganization
              ? 'Groups of people in an organization'
              : data.canCreate
                ? 'Every team in this organization'
                : 'The teams you are on'}
          </Text>
        </View>
      </View>

      {!data.inOrganization ? (
        <SurfaceCard style={styles.note}>
          <Text style={[styles.text, muted]}>
            Teams belong to an organization workspace. Switch to one to see its teams.
          </Text>
        </SurfaceCard>
      ) : (
        <>
          <SurfaceCard>
            {data.teams.length === 0 ? (
              <Text style={[styles.text, styles.note, muted]}>
                {data.canCreate ? 'No teams yet.' : 'You are not on a team yet.'}
              </Text>
            ) : null}
            {data.teams.map((team, index) => (
              <SettingsRow
                key={team.id}
                testID={`team-${team.id}`}
                icon={UsersThree}
                title={team.name}
                sub={[team.description, team.viewerRole ? `You are its ${team.viewerRole}.` : null]
                  .filter(Boolean)
                  .join(' · ') || undefined}
                divider={index < data.teams.length - 1}
                onPress={() => router.push({ pathname: '/(tabs)/settings/team', params: { teamId: team.id } })}
                right={<CaretRight size={15} color={palette.neutral[500]} />}
              />
            ))}
          </SurfaceCard>
          {data.canCreate ? <CreateTeam shownWorkspaceId={teams.loadedFor} onCreated={teams.reload} /> : null}
        </>
      )}
    </ScrollView>
  );
}

/** An owner's or admin's; the screen draws it for no one else. */
function CreateTeam({ shownWorkspaceId, onCreated }: { shownWorkspaceId: string | null; onCreated: () => void }) {
  const session = useSession();
  const keys = useIntentKeys('team-create');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (busy) return;
    // The contract's own bound, said before a request is spent on it.
    if (name.trim().length < 2) {
      setError('A team name needs at least two characters.');
      return;
    }
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTeam(
        workspaceId,
        { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) },
        keys.keyFor(),
      );
      keys.settle();
      setName('');
      setDescription('');
      onCreated();
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The team could not be created.'));
    } finally {
      setBusy(false);
    }
  };

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    keys.settle();
  };

  return (
    <View>
      <SectionLabel>CREATE A TEAM</SectionLabel>
      <SurfaceCard style={[styles.card, styles.form]}>
        <TextField label="Team name" value={name} onChangeText={edit(setName)} />
        <TextField label="Description (optional)" value={description} onChangeText={edit(setDescription)} />
        {error ? <Text style={[styles.text, { color: status.err }]}>{error}</Text> : null}
        <PillButton label={busy ? 'Creating…' : 'Create team'} variant="primary" height={46} disabled={busy} onPress={create} />
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.medium, fontSize: 21, letterSpacing: em(-0.01, 21) },
  subtitle: { fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  card: { marginTop: 9 },
  form: { padding: 14, gap: 12 },
  note: { padding: 14 },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
