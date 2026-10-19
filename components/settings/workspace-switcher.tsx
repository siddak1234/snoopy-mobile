import { Buildings, User } from 'phosphor-react-native';
import React, { useEffect, useRef, useState } from 'react';

import { Dropdown } from '@/components/dropdown';
import { useSession } from '@/hooks/use-session';
import { newIdempotencyKey } from '@/lib/platform/client';
import { readWorkspaces, selectActiveWorkspace, type WorkspaceSummary } from '@/lib/platform/workspaces';

/**
 * The switcher's own read of the workspace collection, in the menu's states.
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
 *
 * Since round 23 a drop-down on its trigger (the owner's build 22 items 3–4;
 * ~~a card~~): the header's workspace circle or Settings' workspace row, which
 * `trigger` draws. Titled Workspace, each row the workspace's name and Personal
 * or Organization; the switching row says Switching… and nothing closes it
 * until the switch is done; Reload session at its foot when the switch landed
 * but the session could not be read again.
 */
export function WorkspaceSwitcher({
  open,
  onOpenChange,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The page's own control, whose press opens it (`onOpenChange(true)`). */
  trigger: React.ReactNode;
}) {
  const session = useSession();
  const onClose = () => onOpenChange(false);
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

  const status =
    choices.status === 'loading'
      ? { text: 'Loading…', testID: 'workspace-switcher-loading' }
      : choices.status === 'error'
        ? { text: choices.message, tone: 'error' as const, testID: 'workspace-switcher-error' }
        : switchError
          ? { text: switchError, tone: 'error' as const, testID: 'workspace-switch-error' }
          : null;

  return (
    <Dropdown
      testID="workspace-switcher"
      title="Workspace"
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      trigger={trigger}
      options={
        choices.status === 'ready'
          ? choices.workspaces.map((workspace) => ({
              value: workspace.id,
              label: workspace.name,
              sub: WORKSPACE_TYPE_LABEL[workspace.type],
              icon: workspace.type === 'personal' ? User : Buildings,
              testID: `workspace-option-${workspace.id}`,
            }))
          : []
      }
      value={choices.status === 'ready' ? (choices.activeWorkspaceId ?? null) : null}
      onChange={(id) => {
        const workspace = choices.status === 'ready' ? choices.workspaces.find((w) => w.id === id) : undefined;
        if (workspace) void chooseWorkspace(workspace);
      }}
      busyValue={switching}
      busyLabel="Switching…"
      locked={switching !== null}
      status={status}
      footer={{ label: 'Reload session', onPress: retrySessionReload, testID: 'workspace-reload', hidden: !reloadOwed }}
    />
  );
}
