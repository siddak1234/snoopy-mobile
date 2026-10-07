import { ArrowCircleUp } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SetupFields, useSetupForm } from '@/components/automations/setup-dialog';
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
 *
 * One dialog, two modes — the question, then the settings in the same sheet:
 * iOS will not present a second modal while the first is still being
 * dismissed, so a settings dialog swapped in for this one in a single render
 * was never shown (the connections card's rule; the review of #49).
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
  const [mode, setMode] = useState<'move' | 'settings'>('move');
  const form = useSetupForm({
    subscriptionId,
    shownWorkspaceId,
    setup: targetSetup,
    config,
    moveTo: to,
    onSaved: () => {
      setOpen(false);
      setMode('move');
      setMisfit(false);
      onMoved();
    },
  });

  const close = () => {
    setOpen(false);
    setMode('move');
  };

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

  const working = mode === 'move' ? busy : form.busy;

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
          setMode('move');
          setOpen(true);
        }}
      />
      <Dialog
        visible={open}
        testID={mode === 'move' ? 'move-version-dialog' : 'setup-dialog'}
        onRequestClose={working ? () => undefined : close}
        title={mode === 'move' ? `Move ${name} to v${to}?` : `Settings for v${to}`}
        body={
          mode === 'move'
            ? `New runs use v${to}; runs v${from} already made are kept as they are. Its settings carry over and are checked against v${to} first.`
            : `v${to} checks its settings differently. Set them for it; saving moves the flow.`
        }
        actions={
          mode === 'move' ? (
            <>
              <DialogButton label="Cancel" disabled={busy} onPress={close} />
              {misfit ? (
                <DialogButton
                  tone="accent"
                  onPress={() => {
                    form.reset();
                    setMode('settings');
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
          ) : (
            <>
              <DialogButton label="Cancel" disabled={form.busy} onPress={close} />
              <DialogButton
                tone="accent"
                disabled={form.busy}
                onPress={() => void form.save()}
                label={form.busy ? 'Moving…' : `Save and move to v${to}`}
              />
            </>
          )
        }>
        {mode === 'move' ? (
          error ? (
            <DialogText tone="error">{error}</DialogText>
          ) : null
        ) : (
          <>
            <SetupFields setup={targetSetup} values={form.values} onChange={form.change} />
            {form.error ? <DialogText tone="error">{form.error}</DialogText> : null}
          </>
        )}
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
    fontSize: typeScale.small.fontSize,
  },
});
