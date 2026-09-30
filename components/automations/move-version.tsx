import { ArrowCircleUp } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { fonts } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { MOVE_REFUSALS, WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { updateSubscription } from '@/lib/platform/automations';

/**
 * A subscription runs the version it PINNED (backend ADR-0030); this moves it
 * to the catalog's newest (backend §12.1 #126, BUILD-PLAN 24.4.1) — the
 * website's version note and `MoveVersionButton`.
 *
 * The platform re-checks the settings and connected accounts against the
 * version it moves to, and refuses while an approval still waits on the one it
 * runs now; each refusal a person can act on is said in words (`MOVE_REFUSALS`).
 * Runs already made stay the old version's, and nothing is re-added.
 */
export function MoveVersion({
  name,
  subscriptionId,
  shownWorkspaceId,
  from,
  to,
  onMoved,
}: {
  name: string;
  subscriptionId: string;
  /** The workspace the screen loaded; the move is refused once it is not active. */
  shownWorkspaceId: string | null;
  from: number;
  to: number;
  onMoved: () => void;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const keys = useIntentKeys('version');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Keyed by the version it moves to: a later move elsewhere is a new intent.
      await updateSubscription(workspaceId, subscriptionId, { templateVersion: to }, keys.keyFor(String(to)));
      keys.settle(String(to));
      setOpen(false);
      onMoved();
    } catch (caught) {
      setError(refusalMessage(caught, MOVE_REFUSALS, 'The automation was not moved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.note}>
      <Text style={[styles.noteText, { color: palette.neutral[400] }]}>
        This runs v{from}; v{to} is available.
      </Text>
      <PillButton
        label={`Move to v${to}`}
        variant="secondary"
        height={36}
        fontSize={13}
        icon={ArrowCircleUp}
        iconSize={15}
        onPress={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <Dialog
        visible={open}
        testID="move-version-dialog"
        onRequestClose={busy ? () => undefined : () => setOpen(false)}
        title={`Move ${name} to v${to}?`}
        body={`New runs use v${to}; runs v${from} already made are kept as they are. Its settings carry over and are checked against v${to} first.`}
        actions={
          <>
            <DialogButton label="Cancel" disabled={busy} onPress={() => setOpen(false)} />
            <DialogButton
              tone="accent"
              disabled={busy}
              onPress={confirm}
              label={busy ? 'Moving…' : `Move to v${to}`}
            />
          </>
        }>
        {error ? <DialogText tone="error">{error}</DialogText> : null}
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    gap: 8,
  },
  noteText: {
    fontFamily: fonts.regular,
    fontSize: 12,
  },
});
