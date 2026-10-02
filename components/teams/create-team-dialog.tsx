import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { TextField } from '@/components/nocturne/text-field';
import { SelectField } from '@/components/select-field';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useResource } from '@/hooks/use-resource';
import { refusalMessage } from '@/lib/content/refusals';
import { OTHER_TEAM_TYPE, TEAM_TYPES } from '@/lib/content/team-types';
import { createProject, type Project } from '@/lib/platform/projects';
import { readWorkspaces } from '@/lib/platform/workspaces';

const KIND_OPTIONS = [...TEAM_TYPES, OTHER_TEAM_TYPE].map((kind) => ({ value: kind, label: kind }));

/**
 * Create a team (BUILD-PLAN 24.11.7). The person picks where it goes — each
 * organization they are in, or their personal workspace — and its kind from the
 * list, with "Other" opening a field for their own words. The workspace is named
 * explicitly, so nothing here depends on which workspace happens to be active.
 * Mounted only while open; the scope control and Settings › Teams both open it.
 */
export function CreateTeamDialog({
  initialWorkspaceId,
  onClose,
  onCreated,
}: {
  /** Preselected: the workspace the person is looking at. */
  initialWorkspaceId: string | null;
  onClose: () => void;
  /** The team made, once the person has seen that it was. */
  onCreated: (team: Project) => void;
}) {
  const keys = useIntentKeys('team-create');
  const workspaces = useResource(async () => (await readWorkspaces()).workspaces, []);
  const [workspaceId, setWorkspaceId] = useState<string | null>(initialWorkspaceId);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Project | null>(null);

  const list = workspaces.status === 'ready' ? workspaces.data : [];
  // The one chosen while it is still one this person is in; else an
  // organization, where teams usually go; else the personal workspace.
  const where =
    list.find((workspace) => workspace.id === workspaceId) ??
    list.find((workspace) => workspace.type === 'organization') ??
    list[0];
  const places = list.map((workspace) => ({
    value: workspace.id,
    label: workspace.type === 'personal' ? 'Personal — just you' : workspace.name,
  }));

  // Any edit is a new intent: a retry of the same form keeps its key.
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      keys.settle();
    };

  const create = async () => {
    if (busy) return;
    const teamName = name.trim();
    const type = kind === OTHER_TEAM_TYPE ? other.trim() : (kind ?? '');
    if (!where) return setError('Your workspaces could not be read. Close this and try again.');
    if (teamName.length < 2 || teamName.length > 60) return setError('A team name is 2 to 60 characters.');
    if (!kind) return setError('Pick the kind of team.');
    if (!type || type.length > 120) return setError('Say what kind of team it is, in up to 120 characters.');
    setBusy(true);
    setError(null);
    try {
      const answer = await createProject(
        where.id,
        { name: teamName, type, ...(description.trim() ? { description: description.trim() } : {}) },
        keys.keyFor(),
      );
      keys.settle();
      setCreated(answer.project);
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The team could not be created.'));
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
        body={`${created.name} is ready${where ? ` in ${where.type === 'personal' ? 'your personal workspace' : where.name}` : ''}. Add people on its page.`}
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
      body="A team has its own flows and its own people."
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy} onPress={onClose} />
          <DialogButton tone="accent" label={busy ? 'Creating…' : 'Create team'} disabled={busy} onPress={create} />
        </>
      }>
      <ScrollView style={styles.fields} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.gap}>
        {workspaces.status === 'loading' ? <DialogText>Loading your workspaces…</DialogText> : null}
        {places.length > 0 ? (
          <SelectField
            label="Organization"
            testID="team-workspace"
            options={places}
            selected={where?.id ?? null}
            placeholder="Choose where"
            onSelect={edit(setWorkspaceId)}
          />
        ) : null}
        <TextField label="Team name" value={name} onChangeText={edit(setName)} placeholder="Accounts payable" />
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
        <TextField
          label="Description (optional)"
          value={description}
          onChangeText={edit(setDescription)}
          placeholder="What this team does"
        />
      </ScrollView>
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  fields: { maxHeight: 460 },
  gap: { gap: 12 },
});
