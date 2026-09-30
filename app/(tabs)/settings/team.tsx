import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretRight, UserCircle } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceChips } from '@/components/choice-chips';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { PickerDialog } from '@/components/picker-dialog';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { SettingsRow } from '@/components/settings/settings-row';
import { em, fonts, layout, status } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { errorTitleFor } from '@/lib/content/screen-states';
import { readWorkspaceMembers, type WorkspaceMember } from '@/lib/platform/organization';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readTeamMembers, readTeams, removeTeamMember, setTeamMember, type TeamRole } from '@/lib/platform/teams';
import { readWorkspaces } from '@/lib/platform/workspaces';
import { administers } from '@/lib/view/roles';

const TEAM_ROLES = [
  { value: 'member', label: 'Member' },
  { value: 'manager', label: 'Manager' },
] as const;

/**
 * One team (BUILD-PLAN 24.5.3) — the website's team page. Who is on it is read
 * by an owner, an admin or the team's manager, and the platform refuses anyone
 * else; names are joined from the workspace's members, because a membership
 * carries only an id. Adding someone and changing their role are one control,
 * as they are one operation; taking someone off is each row's own.
 */
export default function TeamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const session = useSession();
  const { teamId } = useLocalSearchParams<{ teamId?: string }>();
  const [removing, setRemoving] = useState<{ userId: string; label: string } | null>(null);
  const removeKeys = useIntentKeys('team-member-remove');
  const viewerId = session.status === 'signed-in' ? session.session.user.userId : null;

  const detail = useWorkspaceResource(
    async (workspaceId) => {
      if (!teamId) throw new PlatformNotConfiguredError();
      const { workspaces } = await readWorkspaces();
      const active = workspaces.find((workspace) => workspace.id === workspaceId);
      // A team the person may not see is absent from their list, as the platform answers it.
      const team =
        active?.type === 'organization' ? (await readTeams(workspaceId)).find((entry) => entry.id === teamId) : undefined;
      if (!active || !team) return { team: null };
      const admin = administers(active.role);
      const canManage = admin || team.viewerRole === 'manager';
      const [memberships, people] = canManage
        ? await Promise.all([readTeamMembers(workspaceId, team.id), readWorkspaceMembers(workspaceId)])
        : [[], []];
      return { team, admin, canManage, memberships, people };
    },
    [teamId],
  );

  if (detail.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (detail.status === 'offline') {
    return <ScreenOffline onRetry={detail.reload} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (detail.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('team')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (detail.status === 'error' || !detail.data.team) {
    return (
      <ScreenError
        title={errorTitleFor('team')}
        onRetry={detail.reload}
        body={detail.status === 'error' ? busyBody(detail) : 'This team is not one you can see.'}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const { team, admin, canManage, memberships, people } = detail.data;
  const person = new Map((people as WorkspaceMember[]).map((member) => [member.userId, member]));
  const label = (userId: string) => {
    const member = person.get(userId);
    return member?.displayName ?? member?.email ?? 'A former member';
  };
  const muted = { color: palette.neutral[400] };

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{team.name}</Text>
          {team.description ? <Text style={[styles.subtitle, muted]}>{team.description}</Text> : null}
        </View>
      </View>

      {!canManage ? (
        <SurfaceCard style={styles.note}>
          <Text style={[styles.text, muted]}>
            Only this team&apos;s managers, and the organization&apos;s owners and admins, can see who is on it.
          </Text>
        </SurfaceCard>
      ) : (
        <>
          <View>
            <SectionLabel>MEMBERS</SectionLabel>
            <SurfaceCard style={styles.card}>
              {memberships.length === 0 ? (
                <Text style={[styles.text, styles.note, muted]}>No one is on this team yet.</Text>
              ) : null}
              {memberships.map((membership, index) => (
                <SettingsRow
                  key={membership.userId}
                  testID={`team-member-${membership.userId}`}
                  icon={UserCircle}
                  title={label(membership.userId)}
                  sub={person.get(membership.userId)?.displayName ? person.get(membership.userId)?.email : undefined}
                  divider={index < memberships.length - 1}
                  onPress={() => setRemoving({ userId: membership.userId, label: label(membership.userId) })}
                  right={
                    <View style={styles.right}>
                      <Text style={[styles.role, { color: palette.neutral[500] }]}>{membership.role}</Text>
                      <CaretRight size={15} color={palette.neutral[500]} />
                    </View>
                  }
                />
              ))}
            </SurfaceCard>
          </View>
          <TeamMemberForm
            teamId={team.id}
            people={(people as WorkspaceMember[]).map((member) => ({
              value: member.userId,
              label: member.displayName ? `${member.displayName} (${member.email})` : member.email,
            }))}
            shownWorkspaceId={detail.loadedFor}
            onSaved={detail.reload}
          />
        </>
      )}

      {removing ? (
        <ConfirmDialog
          testID="remove-team-member-dialog"
          title={`Remove ${removing.label} from ${team.name}?`}
          body="They lose any project access the team gave them. You can add them again."
          confirmLabel="Remove"
          busyLabel="Removing…"
          fallback="The team member could not be removed."
          run={async () => {
            const workspaceId = workspaceIfShown(session, detail.loadedFor);
            if (!workspaceId) throw new Error(WORKSPACE_CHANGED);
            await removeTeamMember(workspaceId, team.id, removing.userId, removeKeys.keyFor(removing.userId));
            removeKeys.settle(removing.userId);
          }}
          onClose={() => setRemoving(null)}
          onDone={() => {
            const leftSight = removing.userId === viewerId && !admin;
            setRemoving(null);
            // A manager who is not an owner or admin sees this team only while on it.
            if (leftSight) router.back();
            else detail.reload();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function TeamMemberForm({
  teamId,
  people,
  shownWorkspaceId,
  onSaved,
}: {
  teamId: string;
  people: { value: string; label: string }[];
  shownWorkspaceId: string | null;
  onSaved: () => void;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const keys = useIntentKeys('team-member');
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<TeamRole>('member');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = people.find((entry) => entry.value === userId);

  const save = async () => {
    if (busy) return;
    if (!userId) {
      setError('Choose who to add to the team.');
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
      await setTeamMember(workspaceId, teamId, { userId, role }, keys.keyFor(`${userId}:${role}`));
      keys.settle(`${userId}:${role}`);
      onSaved();
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The team member could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <SectionLabel>ADD SOMEONE, OR CHANGE THEIR ROLE</SectionLabel>
      <SurfaceCard style={[styles.card, styles.form]}>
        <SettingsRow
          icon={UserCircle}
          title={chosen?.label ?? 'Choose a person'}
          testID="team-member-person"
          onPress={() => setPicking(true)}
          right={<CaretRight size={15} color={palette.neutral[500]} />}
        />
        <ChoiceChips label="Team role" options={TEAM_ROLES} value={role} onChange={setRole} />
        <Text style={[styles.hint, { color: palette.neutral[400] }]}>
          A manager can add people to this team and change their roles.
        </Text>
        {error ? <Text style={[styles.text, { color: status.err }]}>{error}</Text> : null}
        <PillButton label={busy ? 'Saving…' : 'Add or change role'} variant="primary" height={46} disabled={busy} onPress={save} />
      </SurfaceCard>
      {picking ? (
        <PickerDialog
          title="Person"
          options={people}
          selected={userId ?? undefined}
          empty="This workspace has no one else to add."
          onPick={(value) => {
            setUserId(value);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
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
  form: { paddingVertical: 4, paddingHorizontal: 0, gap: 12, paddingBottom: 14 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  role: { fontFamily: fonts.regular, fontSize: 12.5, textTransform: 'capitalize' },
  note: { padding: 14 },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, paddingHorizontal: 14 },
  hint: { fontFamily: fonts.regular, fontSize: 12, paddingHorizontal: 14 },
});
