import React, { useState } from 'react';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { TextField } from '@/components/nocturne/text-field';
import { refusalMessage } from '@/lib/content/refusals';

/**
 * Asks first, then does one thing — the website's `ConfirmRemoveButton` and the
 * confirmations around it (remove a member, a team's access, delete a project).
 * `run` throws when the platform refuses; the refusal is said in place and the
 * dialog stays. `typed` asks for a word before the action is offered, as the
 * website's Leave project asks for DELETE. Mounted only while open.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busyLabel,
  fallback,
  refusals,
  typed,
  tone = 'danger',
  testID,
  run,
  onClose,
  onDone,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel: string;
  /** The words for a failure the platform did not name. */
  fallback: string;
  refusals?: Readonly<Record<string, string>>;
  /** A word the person types to unlock the action. */
  typed?: string;
  tone?: 'danger' | 'accent';
  testID?: string;
  run: () => Promise<unknown>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const unlocked = !typed || text.trim().toUpperCase() === typed;

  const confirm = async () => {
    if (busy || !unlocked) return;
    setBusy(true);
    setError(null);
    try {
      await run();
      onDone();
    } catch (caught) {
      setError(refusalMessage(caught, refusals, fallback));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible
      testID={testID}
      onRequestClose={busy ? () => undefined : onClose}
      title={title}
      body={body}
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy} onPress={onClose} />
          <DialogButton tone={tone} disabled={busy || !unlocked} onPress={confirm} label={busy ? busyLabel : confirmLabel} />
        </>
      }>
      {typed ? (
        <TextField label="Confirmation" value={text} onChangeText={setText} placeholder={`Type ${typed}`} />
      ) : null}
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}
