import { Buildings, Check } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts, layout } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { newIdempotencyKey } from '@/lib/platform/client';
import { readWorkspaces, selectActiveWorkspace, type WorkspaceSummary } from '@/lib/platform/workspaces';

/**
 * The switcher's own read of the workspace collection, in the dialog's states.
 *
 * Read on open rather than taken from the session: the session's `workspaces`
 * is a bounded first page (`workspacesTruncated`), and the contract says to page
 * the documented collection rather than infer non-membership from it.
 */
type WorkspaceChoices =
  | { status: 'loading' }
  | { status: 'ready'; workspaces: WorkspaceSummary[]; activeWorkspaceId?: string }
  | { status: 'error'; message: string };

const WORKSPACE_TYPE_LABEL: Record<WorkspaceSummary['type'], string> = {
  personal: 'Personal',
  organization: 'Organization',
};

/**
 * Switch the session's active workspace (Round 7.5M), moved out of the Settings
 * screen whole when Settings became a stack (BUILD-PLAN 24.3.8). The active
 * workspace lives in the backend session, so switching is a mutation plus a
 * re-read of `/v1/session`; this keeps no workspace state of its own.
 */
export function WorkspaceSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { palette } = useTheme();
  const session = useSession();
  const currentSession = session.status === 'signed-in' ? session.session : null;
  const [choices, setChoices] = useState<WorkspaceChoices>({ status: 'loading' });
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // The PATCH landed but `/v1/session` could not be re-read; offer the read again.
  const [reloadOwed, setReloadOwed] = useState(false);
  const choicesRequest = useRef(0);
  const activeAtOpen = currentSession?.user.activeWorkspaceId;

  useEffect(() => {
    if (!open) return;
    const requestId = ++choicesRequest.current;
    setSwitchError(null);
    setReloadOwed(false);
    setChoices({ status: 'loading' });
    readWorkspaces()
      .then((response) => {
        if (choicesRequest.current !== requestId) return;
        setChoices({
          status: 'ready',
          workspaces: response.workspaces,
          activeWorkspaceId: response.activeWorkspaceId ?? activeAtOpen,
        });
      })
      .catch((error: unknown) => {
        if (choicesRequest.current !== requestId) return;
        setChoices({
          status: 'error',
          message: error instanceof Error ? error.message : 'Workspaces could not be loaded.',
        });
      });
    // Read once per opening; the session's active id is only the fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dismiss = () => {
    choicesRequest.current += 1;
    setSwitchError(null);
    setReloadOwed(false);
    setChoices({ status: 'loading' });
    onClose();
  };

  const close = () => {
    if (switching) return;
    dismiss();
  };

  /** Re-read `/v1/session` so the screens follow the server's active workspace. */
  const adoptSwitchedSession = async () => {
    const outcome = await session.reload();
    if (outcome.status === 'signed-in') {
      dismiss();
      return;
    }
    if (outcome.status === 'unavailable') {
      setReloadOwed(true);
      setSwitchError(`The workspace was switched, but this session could not be reloaded. ${outcome.message}`);
    }
    // `signed-out`: the credential is gone and the route guard fails closed.
  };

  const chooseWorkspace = async (workspace: WorkspaceSummary) => {
    if (switching) return;
    const activeId = choices.status === 'ready' ? choices.activeWorkspaceId : undefined;
    if (workspace.id === activeId) {
      close();
      return;
    }
    setSwitching(workspace.id);
    setSwitchError(null);
    try {
      // One intent, one key: each selection is a new body, so a new key.
      await selectActiveWorkspace(workspace.id, newIdempotencyKey('workspace-activate'));
      await adoptSwitchedSession();
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : 'The workspace was not switched.');
    } finally {
      setSwitching(null);
    }
  };

  const retrySessionReload = async () => {
    if (switching) return;
    setSwitching('reload');
    try {
      await adoptSwitchedSession();
    } finally {
      setSwitching(null);
    }
  };

  return (
    <Dialog
      visible={open}
      onRequestClose={close}
      testID="workspace-switcher-dialog"
      title="Switch workspace"
      body="Every screen reads from the active workspace. Connections and solutions are workspace-wide."
      actions={
        <>
          <DialogButton label={reloadOwed ? 'Close' : 'Cancel'} disabled={switching !== null} onPress={close} />
          {reloadOwed ? (
            <DialogButton
              tone="accent"
              label={switching === 'reload' ? 'Working…' : 'Reload session'}
              disabled={switching !== null}
              onPress={retrySessionReload}
            />
          ) : null}
        </>
      }>
      {choices.status === 'loading' ? <DialogText>Loading workspaces…</DialogText> : null}
      {choices.status === 'error' ? <DialogText tone="error">{choices.message}</DialogText> : null}
      {choices.status === 'ready' ? (
        <View style={styles.switcherList}>
          {choices.workspaces.map((workspace, i) => {
            const active = workspace.id === choices.activeWorkspaceId;
            return (
              <SettingsRow
                key={workspace.id}
                icon={Buildings}
                title={workspace.name}
                sub={WORKSPACE_TYPE_LABEL[workspace.type]}
                divider={i < choices.workspaces.length - 1}
                testID={`workspace-option-${workspace.id}`}
                onPress={switching ? undefined : () => chooseWorkspace(workspace)}
                right={
                  switching === workspace.id ? (
                    <Text style={[styles.note, { color: palette.neutral[500] }]}>Switching…</Text>
                  ) : active ? (
                    <Check size={16} color={palette.accent} testID={`workspace-active-${workspace.id}`} />
                  ) : null
                }
              />
            );
          })}
        </View>
      ) : null}
      {switchError ? (
        <DialogText tone="error" testID="workspace-switch-error">
          {switchError}
        </DialogText>
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  switcherList: {
    marginHorizontal: -layout.rowPadH,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
});
