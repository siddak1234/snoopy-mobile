import { CaretRight, UserCircle, UserPlus } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts, status } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useTheme } from '@/hooks/use-theme';
import { refusalMessage } from '@/lib/content/refusals';
import type { WorkspaceMember } from '@/lib/platform/organization';
import {
  removeProjectMember,
  setProjectMember,
  type ProjectMembership,
  type ProjectRole,
} from '@/lib/platform/projects';

const ROLES = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
] as const;

/**
 * Who is on a team project, and their roles (24.5.2) — the website's
 * `ProjectMemberList` and `ProjectMemberPicker`, by its rules: an owner's row is
 * not changed; a person leaves from their own row; an owner or admin removes
 * others, an owner changes any role, an admin only a member's. Everything acts
 * on the project's own workspace.
 */
export function ProjectMembers({
  workspaceId,
  projectId,
  viewerUserId,
  viewerRole,
  members,
  available,
  onChanged,
  onLeft,
}: {
  workspaceId: string;
  projectId: string;
  viewerUserId: string | null;
  viewerRole: ProjectRole;
  members: ProjectMembership[];
  /** Workspace members not on the project yet — offered to an owner or admin only. */
  available: WorkspaceMember[];
  onChanged: () => void;
  onLeft: () => void;
}) {
  const { palette } = useTheme();
  const keys = useIntentKeys('project-member');
  // One key per intent, settled once the platform accepted it.
  const once = async (intent: string, send: (key: string) => Promise<unknown>) => {
    await send(keys.keyFor(intent));
    keys.settle(intent);
  };
  const [open, setOpen] = useState<ProjectMembership | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const manager = viewerRole === 'owner' || viewerRole === 'admin';
  const nameOf = (member: { displayName?: string; email: string }) => member.displayName || member.email;

  return (
    <View>
      <SectionLabel>{`TEAM · ${members.length} ${members.length === 1 ? 'MEMBER' : 'MEMBERS'}`}</SectionLabel>
      <SurfaceCard style={styles.card}>
        {members.length === 0 ? <Text style={[styles.text, styles.pad, { color: palette.neutral[400] }]}>No members yet.</Text> : null}
        {members.map((member, index) => {
          const own = member.userId === viewerUserId;
          const ownerRow = member.role === 'owner';
          const manageable = !ownerRow && !own && manager;
          return (
            <SettingsRow
              key={member.userId}
              testID={`project-member-${member.userId}`}
              icon={UserCircle}
              title={`${nameOf(member)}${own ? ' (you)' : ''}`}
              sub={member.displayName ? member.email : undefined}
              divider={index < members.length - 1}
              onPress={ownerRow ? undefined : own ? () => setLeaving(true) : manageable ? () => setOpen(member) : undefined}
              right={
                <View style={styles.right}>
                  <Text style={[styles.role, { color: palette.neutral[500] }]}>{member.role}</Text>
                  {!ownerRow && (own || manageable) ? <CaretRight size={15} color={palette.neutral[500]} /> : null}
                </View>
              }
            />
          );
        })}
      </SurfaceCard>
      {manager ? (
        <PillButton label="Add team members" variant="secondary" height={42} icon={UserPlus} iconSize={15} style={styles.add} onPress={() => setAdding(true)} />
      ) : null}

      {open ? (
        <MemberDialog
          member={open}
          canChangeRole={viewerRole === 'owner' || (viewerRole === 'admin' && open.role === 'member')}
          run={{
            role: (role) =>
              once(`${open.userId}:${role}`, (key) => setProjectMember(workspaceId, projectId, { userId: open.userId, role }, key)),
            remove: () => once(`remove-${open.userId}`, (key) => removeProjectMember(workspaceId, projectId, open.userId, key)),
          }}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            onChanged();
          }}
        />
      ) : null}
      {leaving ? (
        <ConfirmDialog
          testID="leave-project-row-dialog"
          title="Leave this project?"
          body="You will lose access immediately."
          confirmLabel="Leave"
          busyLabel="Leaving…"
          fallback="You could not leave this project."
          run={() => once('leave', (key) => removeProjectMember(workspaceId, projectId, viewerUserId ?? '', key))}
          onClose={() => setLeaving(false)}
          onDone={() => {
            setLeaving(false);
            onLeft();
          }}
        />
      ) : null}
      {adding ? (
        <AddMembersDialog
          available={available}
          add={(userId, role) => once(`add-${userId}:${role}`, (key) => setProjectMember(workspaceId, projectId, { userId, role }, key))}
          onClose={(added) => {
            setAdding(false);
            if (added) onChanged();
          }}
        />
      ) : null}
    </View>
  );
}

/** One member: their role, or taking them off — one dialog, two steps for Remove. */
function MemberDialog({
  member,
  canChangeRole,
  run,
  onClose,
  onDone,
}: {
  member: ProjectMembership;
  canChangeRole: boolean;
  run: { role: (role: ProjectRole) => Promise<unknown>; remove: () => Promise<unknown> };
  onClose: () => void;
  onDone: () => void;
}) {
  const [role, setRole] = useState<'member' | 'admin'>(member.role === 'admin' ? 'admin' : 'member');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = member.displayName || member.email;

  const act = async (action: () => Promise<unknown>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (caught) {
      setError(refusalMessage(caught, {}, fallback));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible
      testID="project-member-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title={confirming ? `Remove ${name} from this project?` : name}
      body={confirming ? undefined : canChangeRole ? 'Role on this project' : `Role on this project: ${member.role}`}
      actions={
        confirming ? (
          <>
            <DialogButton label="Cancel" disabled={busy} onPress={() => setConfirming(false)} />
            <DialogButton tone="danger" label={busy ? 'Removing…' : 'Remove'} disabled={busy} onPress={() => act(run.remove, 'The member could not be removed.')} />
          </>
        ) : (
          <>
            <DialogButton label="Close" disabled={busy} onPress={onClose} />
            <DialogButton tone="danger" label="Remove" disabled={busy} onPress={() => setConfirming(true)} />
            {canChangeRole ? (
              <DialogButton
                tone="accent"
                label={busy ? 'Saving…' : 'Save role'}
                disabled={busy || role === member.role}
                onPress={() => act(() => run.role(role), 'The member role could not be updated.')}
              />
            ) : null}
          </>
        )
      }>
      {!confirming && canChangeRole ? <ChoiceChips options={ROLES} value={role} onChange={setRole} /> : null}
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

/** Workspace members to add, one tap each; the list keeps what is left. */
function AddMembersDialog({
  available,
  add,
  onClose,
}: {
  available: WorkspaceMember[];
  add: (userId: string, role: ProjectRole) => Promise<unknown>;
  /** Whether anyone was added, so the screen reads again. */
  onClose: (added: boolean) => void;
}) {
  const { palette } = useTheme();
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [left, setLeft] = useState(available);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addOne = async (userId: string) => {
    if (addingId) return;
    setAddingId(userId);
    setErrors((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    try {
      await add(userId, role);
      setLeft((current) => current.filter((member) => member.userId !== userId));
      setAdded(true);
    } catch (caught) {
      setErrors((current) => ({ ...current, [userId]: refusalMessage(caught, {}, 'The member could not be added.') }));
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog
      visible
      testID="add-project-members-dialog"
      onRequestClose={addingId ? () => undefined : () => onClose(added)}
      title="Add team members"
      body="Select workspace members to add to this project."
      actions={<DialogButton label="Done" disabled={addingId !== null} onPress={() => onClose(added)} />}>
      <ChoiceChips label="Add as" options={ROLES} value={role} onChange={setRole} />
      {left.length === 0 ? <DialogText>All workspace members are already in this project.</DialogText> : null}
      <ScrollView style={styles.list}>
        {left.map((member) => (
          <View key={member.userId} style={[styles.addRow, { borderBottomColor: palette.divider }]}>
            <View style={styles.addBody}>
              <Text style={[styles.addName, { color: palette.text }]}>{member.displayName || member.email}</Text>
              {member.displayName ? <Text style={[styles.text, { color: palette.neutral[400] }]}>{member.email}</Text> : null}
              {errors[member.userId] ? <Text style={[styles.text, { color: status.err }]}>{errors[member.userId]}</Text> : null}
            </View>
            <Pressable testID={`add-${member.userId}`} disabled={addingId !== null} onPress={() => addOne(member.userId)}>
              <Text style={[styles.addLink, { color: palette.accentRamp[300] }]}>{addingId === member.userId ? 'Adding…' : 'Add'}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 9 },
  pad: { padding: 14 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  role: { fontFamily: fonts.regular, fontSize: 12.5, textTransform: 'capitalize' },
  text: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  add: { marginTop: 10 },
  list: { maxHeight: 320 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  addBody: { flex: 1, minWidth: 0 },
  addName: { fontFamily: fonts.medium, fontSize: 14 },
  addLink: { fontFamily: fonts.medium, fontSize: 13 },
});
