import React, { useState } from 'react';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { TextField } from '@/components/nocturne/text-field';
import { SelectField } from '@/components/select-field';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { activeWorkspaceId, useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED, teamCreateRefusal } from '@/lib/content/refusals';
import { OTHER_TEAM_TYPE, TEAM_TYPES } from '@/lib/content/team-types';
import { createProject, type Project } from '@/lib/platform/projects';

const KIND_OPTIONS = [...TEAM_TYPES, OTHER_TEAM_TYPE].map((kind) => ({ value: kind, label: kind }));

/**
 * Create a team (BUILD-PLAN 24.11.7; reshaped by the owner's decisions of
 * 2026-10-02, 24.12). A team IS its kind: the person picks it from the list —
 * "Other" opens a field for their own words, 2 to 60 characters — and the kind
 * is sent as both the team's name and its type. It is made in the workspace the
 * dialog was opened in — the one the person is in, personal included — which
 * the one line under the title names: no picker, no name, no description. If
 * another workspace becomes active while it is open, Create is refused in words
 * (`WORKSPACE_CHANGED`) and nothing is sent (CLAUDE.md rule 10). A workspace
 * holds one team of each kind, and a second is refused in words. Mounted only
 * while open; the scope control and Settings › Teams open it, and neither
 * offers it to a plain member of an organization.
 */
export function CreateTeamDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** The team made, once the person has seen that it was. */
  onCreated: (team: Project) => void;
}) {
  const session = useSession();
  const keys = useIntentKeys('team-create');
  const [kind, setKind] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Project | null>(null);

  // The workspace it was opened in, kept: a switch made elsewhere while it is
  // open does not move the team into the new one.
  const [shown] = useState(() => activeWorkspaceId(session));
  const workspace =
    session.status === 'signed-in' ? session.session.workspaces.find((entry) => entry.id === shown) : undefined;
  const personal = workspace?.type === 'personal';
  const where = workspace ? (personal ? 'In your personal workspace.' : `In ${workspace.name}.`) : undefined;

  // Any edit is a new intent: a retry of the same form keeps its key.
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      keys.settle();
    };

  const create = async () => {
    if (busy) return;
    if (!shown) return setError('Your workspaces could not be read. Close this and try again.');
    // The workspace it was opened in, and only while it is still the active one.
    const workspaceId = workspaceIfShown(session, shown);
    if (!workspaceId) return setError(WORKSPACE_CHANGED);
    const chosen = kind === OTHER_TEAM_TYPE ? other.trim() : (kind ?? '');
    if (!kind) return setError('Pick the kind of team.');
    if (chosen.length < 2 || chosen.length > 60) {
      return setError('Say what kind of team it is, in 2 to 60 characters.');
    }
    setBusy(true);
    setError(null);
    try {
      const answer = await createProject(workspaceId, { name: chosen, type: chosen }, keys.keyFor());
      keys.settle();
      setCreated(answer.project);
    } catch (caught) {
      setError(teamCreateRefusal(caught, chosen));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Dialog
        visible
        testID="team-created-dialog"
        onRequestClose={() => onCreated(created)}
        title="Team created"
        body={personal ? 'Your team is ready.' : 'Your team is ready. Add people on its page.'}
        actions={<DialogButton tone="accent" label="Done" onPress={() => onCreated(created)} />}
      />
    );
  }

  return (
    <Dialog
      visible
      testID="create-team-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title="Create a team"
      body={where}
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy} onPress={onClose} />
          <DialogButton tone="accent" label={busy ? 'Creating…' : 'Create team'} disabled={busy} onPress={create} />
        </>
      }>
      <SelectField
        label="Kind of team"
        testID="team-kind"
        options={KIND_OPTIONS}
        selected={kind}
        placeholder="Choose a kind"
        onSelect={edit(setKind)}
      />
      {kind === OTHER_TEAM_TYPE ? (
        <TextField label="What kind of team" value={other} onChangeText={edit(setOther)} placeholder="Facilities" />
      ) : null}
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}
