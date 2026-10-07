import { ArrowCircleUp } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SetupDialog } from '@/components/automations/setup-dialog';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { PillButton } from '@/components/nocturne/pill-button';
import { fonts, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import type { SetupField } from '@/components/setup-field';
import { MOVE_REFUSALS, WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import { updateSubscription } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';

/**
 * A subscription runs the version it PINNED (backend ADR-0030); this moves it
 * to the catalog's newest (backend §12.1 #126, BUILD-PLAN 24.4.1) — the
 * website's version note and `MoveVersionButton`.
 *
 * The platform re-checks the settings and connected accounts against the
 * version it moves to, and refuses while an approval still waits on the one it
 * runs now; each refusal a person can act on is said in words (`MOVE_REFUSALS`).
 * Runs already made stay the old version's, and nothing is re-added.
 *
 * **Settings that do not fit the new version are set for it here** (backend
 * §12.1 #185): refused `invalid_config`, the dialog offers that version's
 * fields — seeded from what the flow holds — and saving them moves the flow in
 * the same change. Set up cannot do it: it draws the version the flow runs.
 */
export function MoveVersion({
  name,
  subscriptionId,
  shownWorkspaceId,
  from,
  to,
  config,
  targetSetup,
  onMoved,
}: {
  name: string;
  subscriptionId: string;
  /** The workspace the screen loaded; the move is refused once it is not active. */
  shownWorkspaceId: string | null;
  from: number;
  to: number;
  /** What the flow holds now: the seed for the new version's settings. */
  config: Record<string, unknown>;
  /** The setup fields of the version it moves to. */
  targetSetup: SetupField[];
  onMoved: () => void;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const keys = useIntentKeys('version');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The settings do not fit `to`: offer to set them for it.
  const [misfit, setMisfit] = useState(false);
  const [settingFor, setSettingFor] = useState(false);

  const confirm = async () => {
    if (busy) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    setMisfit(false);
    try {
      // Keyed by the version it moves to: a later move elsewhere is a new intent.
      await updateSubscription(workspaceId, subscriptionId, { templateVersion: to }, keys.keyFor(String(to)));
      keys.settle(String(to));
      setOpen(false);
      onMoved();
    } catch (caught) {
      setError(refusalMessage(caught, MOVE_REFUSALS, 'The flow was not moved.'));
      setMisfit(caught instanceof PlatformError && caught.details?.reason === 'invalid_config' && targetSetup.length > 0);
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
        fontSize={typeScale.body.fontSize}
        icon={ArrowCircleUp}
        iconSize={15}
        onPress={() => {
          setError(null);
          setMisfit(false);
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
            {misfit ? (
              <DialogButton
                tone="accent"
                onPress={() => {
                  setOpen(false);
                  setSettingFor(true);
                }}
                label={`Set them for v${to}`}
              />
            ) : (
              <DialogButton
                tone="accent"
                disabled={busy}
                onPress={confirm}
                label={busy ? 'Moving…' : `Move to v${to}`}
              />
            )}
          </>
        }>
        {error ? <DialogText tone="error">{error}</DialogText> : null}
      </Dialog>
      {settingFor ? (
        <SetupDialog
          subscriptionId={subscriptionId}
          shownWorkspaceId={shownWorkspaceId}
          setup={targetSetup}
          config={config}
          moveTo={to}
          onClose={() => setSettingFor(false)}
          onSaved={() => {
            setSettingFor(false);
            setMisfit(false);
            onMoved();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    gap: 8,
  },
  noteText: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
});
