import { CaretRight, UserCircle, UserPlus } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { DECISION_REFUSALS, WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import {
  decideJoinRequest,
  removeWorkspaceMember,
  type JoinRequest,
  type WorkspaceMember,
} from '@/lib/platform/organization';
import { relativeTimeAgo } from '@/lib/view/format';

/**
 * The person asking to join, by name or address (backend 24.12.4): an owner or
 * admin approves a person, not an id. The id only when the platform sends
 * neither, as one from before 24.12 does.
 */
function askerOf(request: JoinRequest): string {
  return request.displayName || request.email || request.userId;
}

/**
 * The organization's members and its pending join requests (24.5.1) — the
 * website's `OrgMemberList` and `OrgJoinRequestList`. Anyone but an owner or
 * the person themselves can be removed, after a confirmation; a request is
 * approved or rejected. The Edge decides; this offers only what it allows.
 */
export function OrgPeople({
  orgName,
  viewerUserId,
  members,
  requests,
  shownWorkspaceId,
  onChanged,
}: {
  orgName: string;
  viewerUserId: string | null;
  members: WorkspaceMember[];
  requests: JoinRequest[];
  /** The workspace the screen loaded; every change is refused once it is not active. */
  shownWorkspaceId: string | null;
  onChanged: () => void;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const removeKeys = useIntentKeys('workspace-member');
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const [deciding, setDeciding] = useState<JoinRequest | null>(null);
  const pending = requests.filter((request) => request.status === 'pending');
  const nameOf = (member: WorkspaceMember) => member.displayName || member.email;

  return (
    <>
      <View>
        <SectionLabel>MEMBERS</SectionLabel>
        <SurfaceCard style={styles.card}>
          {members.map((member, index) => {
            const removable = member.role !== 'owner' && member.userId !== viewerUserId;
            return (
              <SettingsRow
                key={member.userId}
                testID={`member-${member.userId}`}
                icon={UserCircle}
                title={`${nameOf(member)}${member.userId === viewerUserId ? ' (you)' : ''}`}
                sub={member.displayName ? member.email : undefined}
                divider={index < members.length - 1}
                onPress={removable ? () => setRemoving(member) : undefined}
                right={
                  <View style={styles.right}>
                    <Text style={[styles.role, { color: palette.neutral[500] }]}>{member.role}</Text>
                    {removable ? <CaretRight size={15} color={palette.neutral[500]} /> : null}
                  </View>
                }
              />
            );
          })}
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>JOIN REQUESTS</SectionLabel>
        <SurfaceCard style={styles.card}>
          {pending.length === 0 ? (
            <Text style={[styles.empty, { color: palette.neutral[400] }]}>No pending requests.</Text>
          ) : null}
          {pending.map((request, index) => (
            <SettingsRow
              key={request.id}
              testID={`join-request-${request.id}`}
              icon={UserPlus}
              title={askerOf(request)}
              // Under a name, the address too, as Members draws it.
              sub={
                request.displayName && request.email
                  ? `${request.email} · Asked ${relativeTimeAgo(request.createdAt)}`
                  : `Asked ${relativeTimeAgo(request.createdAt)}`
              }
              divider={index < pending.length - 1}
              onPress={() => setDeciding(request)}
              right={<CaretRight size={15} color={palette.neutral[500]} />}
            />
          ))}
        </SurfaceCard>
      </View>

      {removing ? (
        <ConfirmDialog
          testID="remove-member-dialog"
          title={`Remove ${nameOf(removing)}?`}
          body={`${nameOf(removing)} will be removed from ${orgName} and from this organization. This cannot be undone.`}
          confirmLabel="Remove member"
          busyLabel="Removing…"
          fallback="The member could not be removed."
          run={async () => {
            const workspaceId = workspaceIfShown(session, shownWorkspaceId);
            if (!workspaceId) throw new Error(WORKSPACE_CHANGED);
            await removeWorkspaceMember(workspaceId, removing.userId, removeKeys.keyFor(removing.userId));
            removeKeys.settle(removing.userId);
          }}
          onClose={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            onChanged();
          }}
        />
      ) : null}
      {deciding ? (
        <DecideDialog
          request={deciding}
          shownWorkspaceId={shownWorkspaceId}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function DecideDialog({
  request,
  shownWorkspaceId,
  onClose,
  onDone,
}: {
  request: JoinRequest;
  shownWorkspaceId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const session = useSession();
  const keys = useIntentKeys(`join-request-${request.id}`);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'approve' | 'reject') => {
    if (busy) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      await decideJoinRequest(workspaceId, request.id, decision, keys.keyFor(decision));
      keys.settle(decision);
      onDone();
    } catch (caught) {
      setError(refusalMessage(caught, DECISION_REFUSALS, 'The join request could not be updated.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      visible
      testID="join-request-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title="Join request"
      body={`${askerOf(request)} asked ${relativeTimeAgo(request.createdAt)} to join this organization.`}
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy !== null} onPress={onClose} />
          <DialogButton
            label={busy === 'reject' ? 'Updating…' : 'Reject'}
            disabled={busy !== null}
            onPress={() => decide('reject')}
          />
          <DialogButton
            tone="accent"
            label={busy === 'approve' ? 'Updating…' : 'Approve'}
            disabled={busy !== null}
            onPress={() => decide('approve')}
          />
        </>
      }>
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 9 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  role: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize, textTransform: 'capitalize' },
  empty: { fontFamily: fonts.regular, fontSize: typeScale.body.fontSize, padding: 14 },
});
