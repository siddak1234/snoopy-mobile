import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { RunFileField } from '@/components/automations/run-file-field';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { DialogBoundary } from '@/components/dialog-boundary';
import { SetupFieldRow, declaredValues } from '@/components/setup-field';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { WORKSPACE_CHANGED, runRefusal } from '@/lib/content/refusals';
import { RUN_FORM_ERROR_TITLE } from '@/lib/content/screen-states';
import { createRun, type AutomationRunInputField } from '@/lib/platform/automations';

type RunDialogProps = {
  name: string;
  subscriptionId: string;
  /** The workspace the screen loaded; the run is refused once it is not active. */
  shownWorkspaceId: string | null;
  runInput: AutomationRunInputField[];
  onClose: () => void;
  onStarted: (runId: string) => void;
};

/**
 * Start a run from what the subscription's PINNED version declares (backend
 * ADR-0030, BUILD-PLAN 24.4.1) — the website's Run dialog.
 *
 * Mounted only while open, so every opening starts with the declared defaults,
 * empty file fields and a new idempotency key. The key is also renewed whenever
 * a value changes, so only a resubmission of the same values — after a lost
 * answer — reuses it, and the platform returns the run it already started
 * instead of starting a second.
 *
 * Inside `DialogBoundary` (BUILD-PLAN 25.8.1): the rows are drawn from a
 * manifest the platform may publish after this build shipped, and a row that
 * cannot be drawn ends in the failed dialog's words, never a white screen. The
 * boundary is around the whole dialog, its hooks included.
 */
export function RunDialog(props: RunDialogProps) {
  return (
    <DialogBoundary title={RUN_FORM_ERROR_TITLE} onClose={props.onClose}>
      <RunDialogBody {...props} />
    </DialogBoundary>
  );
}

function RunDialogBody({ name, subscriptionId, shownWorkspaceId, runInput, onClose, onStarted }: RunDialogProps) {
  const session = useSession();
  const keys = useIntentKeys('run');
  const [values, setValues] = useState<Record<string, unknown>>(() => declaredDefaults(runInput));
  const [uploading, setUploading] = useState<ReadonlySet<string>>(() => new Set());
  // Bumped to empty the file fields when the platform will not take a file.
  const [fileRound, setFileRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = useCallback(
    (key: string, value: unknown) => {
      setValues((previous) => ({ ...previous, [key]: value }));
      keys.settle();
    },
    [keys],
  );
  const onBusyChange = useCallback((key: string, isBusy: boolean) => {
    setUploading((current) => {
      if (isBusy === current.has(key)) return current;
      const next = new Set(current);
      if (isBusy) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const start = async () => {
    if (busy || uploading.size > 0) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { run } = await createRun(workspaceId, subscriptionId, keys.keyFor(), declaredValues(runInput, values));
      keys.settle();
      onStarted(run.id);
    } catch (caught) {
      const refused = runRefusal(caught);
      setError(refused.message);
      if (refused.fileGone) {
        // A file already used, or gone: its field is emptied to choose again,
        // and the changed input is a new run.
        setValues((previous) => withoutFiles(runInput, previous));
        setFileRound((round) => round + 1);
        keys.settle();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible
      testID="run-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title={`Run ${name}`}
      body="Enter what this run needs. It starts as soon as you submit, and its page shows each step as it happens."
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy} onPress={onClose} />
          <DialogButton
            tone="accent"
            disabled={busy || uploading.size > 0}
            onPress={start}
            label={busy ? 'Starting…' : uploading.size > 0 ? 'Uploading…' : 'Start run'}
          />
        </>
      }>
      <ScrollView style={styles.fields} keyboardShouldPersistTaps="handled">
        {runInput.map((field, index) => {
          const divider = index < runInput.length - 1;
          return field.control === 'artifact' ? (
            <RunFileField
              key={`${field.key}:${fileRound}`}
              field={field}
              shownWorkspaceId={shownWorkspaceId}
              subscriptionId={subscriptionId}
              onValue={change}
              onBusyChange={onBusyChange}
              divider={divider}
            />
          ) : (
            <SetupFieldRow
              key={field.key}
              // Not a file, by the branch: text, money, a toggle, an address — or a control newer than this build (25.8.1).
              field={field}
              value={values[field.key]}
              onChange={(next) => change(field.key, next)}
              divider={divider}
            />
          );
        })}
      </ScrollView>
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

/** Each field starts at the default its manifest declares; a file has none. */
function declaredDefaults(runInput: AutomationRunInputField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of runInput) {
    if (field.control !== 'artifact' && field.defaultValue !== undefined) values[field.key] = field.defaultValue;
  }
  return values;
}

function withoutFiles(runInput: AutomationRunInputField[], values: Record<string, unknown>) {
  const next = { ...values };
  for (const field of runInput) if (field.control === 'artifact') delete next[field.key];
  return next;
}

const styles = StyleSheet.create({
  fields: {
    maxHeight: 360,
  },
});
