import { CaretRight, UsersThree } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { PickerDialog } from '@/components/picker-dialog';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts, status } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useTheme } from '@/hooks/use-theme';
import { refusalMessage } from '@/lib/content/refusals';
import { grantTeam, revokeTeam, type ProjectTeamGrant } from '@/lib/platform/projects';
import type { Team } from '@/lib/platform/teams';

const GRANT_ROLES = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
] as const;

/**
 * Which teams have access to a team project (24.5.2, backend §12.1 #173–#176)
 * — the website's "Teams with access" section and `ProjectTeamGrantForm`. Anyone
 * on the project reads the grants; a team this person cannot see reads as one.
 * The project's owner or admin gives a team they can see a role — never
 * ownership — or takes a team's access away.
 */
export function ProjectTeams({
  workspaceId,
  projectId,
  projectName,
  grants,
  teams,
  canManage,
  administersWorkspace,
  onChanged,
  onOpenTeams,
}: {
  workspaceId: string;
  projectId: string;
  projectName: string;
  grants: ProjectTeamGrant[];
  /** The teams this person can see. */
  teams: Team[];
  canManage: boolean;
  administersWorkspace: boolean;
  onChanged: () => void;
  onOpenTeams: () => void;
}) {
  const { palette } = useTheme();
  const keys = useIntentKeys('project-team');
  const [revoking, setRevoking] = useState<ProjectTeamGrant | null>(null);
  const teamName = new Map(teams.map((team) => [team.id, team.name]));
  const muted = { color: palette.neutral[400] };

  return (
    <View>
      <SectionLabel>TEAMS WITH ACCESS</SectionLabel>
      <SurfaceCard style={styles.card}>
        {grants.length === 0 ? <Text style={[styles.text, styles.pad, muted]}>No team has access to this project.</Text> : null}
        {grants.map((grant, index) => (
          <SettingsRow
            key={grant.teamId}
            testID={`grant-${grant.teamId}`}
            icon={UsersThree}
            title={teamName.get(grant.teamId) ?? 'A team you are not on'}
            divider={index < grants.length - 1}
            onPress={canManage ? () => setRevoking(grant) : undefined}
            right={
              <View style={styles.right}>
                <Text style={[styles.role, { color: palette.neutral[500] }]}>{grant.role}</Text>
                {canManage ? <CaretRight size={15} color={palette.neutral[500]} /> : null}
              </View>
            }
          />
        ))}
      </SurfaceCard>
      {canManage && teams.length > 0 ? (
        <GrantForm
          teams={teams}
          grant={async (body) => {
            const intent = `${body.teamId}:${body.role}`;
            await grantTeam(workspaceId, projectId, body, keys.keyFor(intent));
            keys.settle(intent);
          }}
          onGranted={onChanged}
        />
      ) : null}
      {canManage && teams.length === 0 ? (
        administersWorkspace ? (
          <Text style={[styles.text, styles.below, muted]}>
            This organization has no teams yet. Teams are made on the{' '}
            <Text style={{ color: palette.accentRamp[300] }} onPress={onOpenTeams}>
              Teams screen
            </Text>
            .
          </Text>
        ) : (
          <Text style={[styles.text, styles.below, muted]}>
            You can give access to a team you can see — the teams you are on. The organization&apos;s owners and admins see every team.
          </Text>
        )
      ) : null}

      {revoking ? (
        <ConfirmDialog
          testID="revoke-team-dialog"
          title={`Remove ${teamName.get(revoking.teamId) ?? 'this team'}'s access to ${projectName}?`}
          body="Its members keep any access they hold on their own. You can give the team access again."
          confirmLabel="Remove access"
          busyLabel="Removing…"
          fallback="The team's access could not be removed."
          run={async () => {
            await revokeTeam(workspaceId, projectId, revoking.teamId, keys.keyFor(`revoke-${revoking.teamId}`));
            keys.settle(`revoke-${revoking.teamId}`);
          }}
          onClose={() => setRevoking(null)}
          onDone={() => {
            setRevoking(null);
            onChanged();
          }}
        />
      ) : null}
    </View>
  );
}

function GrantForm({
  teams,
  grant,
  onGranted,
}: {
  teams: Team[];
  grant: (body: { teamId: string; role: ProjectTeamGrant['role'] }) => Promise<unknown>;
  onGranted: () => void;
}) {
  const { palette } = useTheme();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [role, setRole] = useState<ProjectTeamGrant['role']>('member');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = teams.find((team) => team.id === teamId);

  const give = async () => {
    if (busy) return;
    if (!teamId) {
      setError('Choose a team.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await grant({ teamId, role });
      onGranted();
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The team could not be given access.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceCard style={[styles.card, styles.form]}>
      <SettingsRow
        icon={UsersThree}
        title={chosen?.name ?? 'Choose a team'}
        testID="grant-team"
        onPress={() => setPicking(true)}
        right={<CaretRight size={15} color={palette.neutral[500]} />}
      />
      <View style={styles.pad}>
        <ChoiceChips label="Role on this project" options={GRANT_ROLES} value={role} onChange={setRole} />
      </View>
      {error ? <Text style={[styles.text, styles.pad, { color: status.err }]}>{error}</Text> : null}
      <View style={styles.pad}>
        <PillButton label={busy ? 'Saving…' : 'Give access'} variant="primary" height={42} disabled={busy} onPress={give} />
      </View>
      {picking ? (
        <PickerDialog
          title="Team"
          options={teams.map((team) => ({ value: team.id, label: team.name, ...(team.description ? { sub: team.description } : {}) }))}
          selected={teamId ?? undefined}
          empty="No teams to choose from."
          onPick={(value) => {
            setTeamId(value);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 9 },
  pad: { paddingHorizontal: 14, paddingVertical: 6 },
  below: { marginTop: 10 },
  form: { paddingBottom: 8 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  role: { fontFamily: fonts.regular, fontSize: 12.5, textTransform: 'capitalize' },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
