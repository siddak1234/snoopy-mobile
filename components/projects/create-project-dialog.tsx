import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { TextField } from '@/components/nocturne/text-field';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { createProject } from '@/lib/platform/projects';
import type { WorkspaceSummary } from '@/lib/platform/workspaces';

type Scope = 'personal' | 'team';

/**
 * Create a project (24.5.2) — the website's `CreateProjectDialog`. A personal
 * project goes to the person's personal workspace. A team project goes to the
 * organization they are working in — the active workspace, and only while it is
 * still the one this screen loaded — never to the first organization on a list.
 * Mounted only while open.
 */
export function CreateProjectDialog({
  personal,
  teamWorkspace,
  inOrganization,
  shownWorkspaceId,
  onClose,
  onCreated,
}: {
  personal: WorkspaceSummary | undefined;
  /** The active workspace, when it is an organization. */
  teamWorkspace: WorkspaceSummary | null;
  inOrganization: boolean;
  shownWorkspaceId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const session = useSession();
  const keys = useIntentKeys('project-create');
  const [scope, setScope] = useState<Scope>('personal');
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    keys.settle();
  };

  const create = async () => {
    if (busy) return;
    if (!name.trim()) return setError('Project name is required.');
    if (!type.trim()) return setError('Project type is required.');
    let workspaceId: string | null | undefined = personal?.id;
    if (scope === 'team') {
      workspaceId = workspaceIfShown(session, shownWorkspaceId);
      if (!workspaceId) return setError(WORKSPACE_CHANGED);
      if (workspaceId !== teamWorkspace?.id) {
        return setError('Switch to your organization to create a team project in it.');
      }
    }
    if (!workspaceId) return setError('No personal workspace is available.');
    setBusy(true);
    setError(null);
    try {
      await createProject(
        workspaceId,
        { name: name.trim(), type: type.trim(), ...(description.trim() ? { description: description.trim() } : {}) },
        keys.keyFor(),
      );
      keys.settle();
      setCreated(true);
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The project could not be created.'));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Dialog
        visible
        testID="project-created-dialog"
        onRequestClose={onCreated}
        title="Create project"
        body="Your project was created. Use its project page to add team members."
        actions={<DialogButton tone="accent" label="Done" onPress={onCreated} />}
      />
    );
  }

  return (
    <Dialog
      visible
      testID="create-project-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title="Create project"
      body="Add a new project to your workspace."
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy} onPress={onClose} />
          <DialogButton tone="accent" label={busy ? 'Creating…' : 'Create project'} disabled={busy} onPress={create} />
        </>
      }>
      <ScrollView style={styles.fields} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.gap}>
        <ChoiceChips
          label="Project scope"
          options={
            teamWorkspace
              ? [
                  { value: 'personal', label: 'Personal' },
                  { value: 'team', label: 'Team' },
                ]
              : [{ value: 'personal', label: 'Personal' }]
          }
          value={scope}
          onChange={(next) => {
            setScope(next);
            keys.settle();
          }}
        />
        <DialogText>
          {teamWorkspace
            ? scope === 'team'
              ? `Created in ${teamWorkspace.name}.`
              : `Created in ${personal?.name ?? 'your personal workspace'}.`
            : inOrganization
              ? 'Switch to your organization to create a team project in it.'
              : 'Join an organization to enable team projects.'}
        </DialogText>
        <TextField label="Project name" value={name} onChangeText={edit(setName)} placeholder="My project" />
        <TextField label="Project type" value={type} onChangeText={edit(setType)} placeholder="Invoice processing" />
        <TextField label="Description (optional)" value={description} onChangeText={edit(setDescription)} placeholder="Describe this project" />
      </ScrollView>
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  fields: { maxHeight: 420 },
  gap: { gap: 12 },
});
