import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ConnectionButton, ConnectionMark, ConnectionRow } from '@/components/connection-row';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { Text } from '@/components/text';
import { fonts, space, status, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import {
  CONNECTION_COMPLETED,
  CONNECTIONS_MANAGED_BY,
  KEY_REQUEST_IN_PROGRESS,
  WORKSPACE_CHANGED,
  alreadyConnected,
  connectionIncomplete,
  refusalMessage,
} from '@/lib/content/refusals';
import { DISCONNECTING_LABEL, DISCONNECT_LABEL, disconnectBody, disconnectTitle } from '@/lib/content/screen-states';
import { connectOAuthProvider, connectProviderWithKey, disconnectConnection } from '@/lib/platform/connections';
import { PlatformError } from '@/lib/platform/problem';
import { invalidateShared } from '@/lib/platform/snapshot';
import { connectionAction, type ConnectionView } from '@/lib/view/catalog';

/**
 * The connections a screen lists, each the one row (Build 21, spec A4): Settings
 * › Connections, and a flow page's CONNECTIONS — the website's Connections
 * panel, on the same operations (ADR-0032, BUILD-PLAN 24.4.3).
 *
 * - **One row for every provider** (the owner's build 20 items 6 and 7): its
 *   mark, its name, the account's email or its state under it, and for an owner
 *   or admin one button of ours — Connect, Reconnect or Disconnect. A member
 *   sees the rows and is told who can change them; the Edge refuses a member
 *   all three (403). ~~What connecting it lets flows do, "used by N live
 *   flows", a CONNECTIONS label under the title, Intuit's Connect button image,
 *   "Disconnect from QuickBooks" and Replace account~~ until Build 21 (the
 *   platform's replace route stays, unused).
 * - **Connect and Reconnect go through the provider at once**, no dialog — the
 *   account kept on a Reconnect (no `replaceConnectionId`, backend ADR-0019
 *   §4); a key provider's opens its key form instead.
 * - **What a connect came back with is said**, as the website says it:
 *   completed, or already connected (`reused`), above the rows (`notice`, kept
 *   by the screen across the re-read); not completed, under its row.
 * - **Disconnect asks first**, saying what it stops: "{n} live flows use it.
 *   They stop until you connect it again." (spec A4).
 * - **A pasted key answered 409** may still be verifying: Retry verification
 *   sends it again under the same key, Refresh connections reads the rows
 *   again — never a new request in its place.
 * - **Every action acts on the workspace these rows were read for**
 *   (`workspaceIfShown`); after a switch elsewhere it is refused, not sent.
 */
export function ConnectionsCard({
  rows,
  loadedFor,
  canManage,
  notice,
  onNotice,
  onChanged,
  testID = 'connections-card',
}: {
  rows: ConnectionView[];
  /** The workspace `rows` were read for. */
  loadedFor: string | null;
  canManage: boolean;
  /** What the last connect came back with, said above the rows. */
  notice: string | null;
  onNotice: (notice: string | null) => void;
  /** Re-read the connections after something changed, or might have. */
  onChanged: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const session = useSession();
  // A key provider's Connect or Reconnect: its key fields, in a dialog.
  const [keying, setKeying] = useState<ConnectionView | null>(null);
  const [disconnecting, setDisconnecting] = useState<ConnectionView | null>(null);
  // A pasted key answered 409: its first request may still be verifying.
  const [keyPending, setKeyPending] = useState(false);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [keyError, setKeyError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // What a connect came back with, under its row.
  const [rowError, setRowError] = useState<{ providerId: string; message: string } | null>(null);
  // A pasted key's key follows its values: the same values resubmitted reuse it.
  const keys = useIntentKeys('connection');

  /**
   * Something changed, or might have: the workspace's connections and flows are
   * dropped from the shared snapshot first, then the screen reads them again.
   * A screen that re-reads keeping its rows (`refresh` — the flow page, Set up)
   * would otherwise be answered from the snapshot for its 15 s window, and a
   * Disconnect would still say "Disconnect" (the Build 21 review).
   */
  const reread = () => {
    if (loadedFor) invalidateShared(loadedFor, ['connections', 'subscriptions']);
    onChanged();
  };

  const closeKey = () => {
    setKeying(null);
    setKeyPending(false);
    setCredentials({});
    setKeyError(null);
    keys.settle();
  };

  const updateCredential = (name: string, value: string) => {
    setCredentials((previous) => ({ ...previous, [name]: value }));
    keys.settle();
  };

  /** Connect or Reconnect through the provider, at once, on the workspace these rows were read for. */
  const authorize = async (row: ConnectionView) => {
    if (busy) return;
    const workspaceId = workspaceIfShown(session, loadedFor);
    if (!workspaceId) {
      setRowError({ providerId: row.providerId, message: WORKSPACE_CHANGED });
      return;
    }
    setBusy(row.providerId);
    setRowError(null);
    onNotice(null);
    try {
      const outcome = await connectOAuthProvider(workspaceId, row.provider);
      if (outcome.status === 'failed') {
        setRowError({ providerId: row.providerId, message: outcome.message });
        return;
      }
      if (outcome.status === 'incomplete') {
        setRowError({ providerId: row.providerId, message: connectionIncomplete(row.active) });
        return;
      }
      if (outcome.status === 'connected') {
        onNotice(
          outcome.reused ? alreadyConnected(row.name, outcome.connection.externalAccount.displayName) : CONNECTION_COMPLETED,
        );
      }
      // `cancelled` is not proof that nothing happened. A system browser sharing a
      // logged-in website session completes the connect AT the website and skips
      // the app handoff (manifest §12.1 #79); re-reading is the only honest answer.
      reread();
    } catch (caught) {
      setRowError({ providerId: row.providerId, message: refusalMessage(caught, {}, 'The connection was not changed.') });
    } finally {
      setBusy(null);
    }
  };

  /** The row's one button. What the last one came back with goes as the next is pressed. */
  const press = (row: ConnectionView) => {
    setRowError(null);
    onNotice(null);
    if (row.state === 'connected') {
      setDisconnecting(row);
      return;
    }
    if (row.authType === 'api-key') {
      setKeyError(null);
      setKeying(row);
      return;
    }
    void authorize(row);
  };

  /** The key form's Verify and connect: the pasted values, under one key per values. */
  const submitKey = async () => {
    const row = keying;
    if (!row || busy) return;
    const workspaceId = workspaceIfShown(session, loadedFor);
    if (!workspaceId) {
      setKeyError(WORKSPACE_CHANGED);
      return;
    }
    const values = Object.fromEntries(
      row.credentialFields.map((field) => [field.name, credentials[field.name]?.trim() ?? '']),
    );
    if (Object.values(values).some((value) => !value)) {
      setKeyError('Complete every credential field before connecting.');
      return;
    }
    setBusy(row.providerId);
    setKeyError(null);
    setKeyPending(false);
    try {
      await connectProviderWithKey(workspaceId, row.providerId, values, keys.keyFor());
      closeKey();
      reread();
    } catch (caught) {
      // The key was reused with other values, or its first request is still
      // verifying: the contract's way on is the same key again, never a new one
      // for an uncertain request — so the key is kept.
      setKeyPending(caught instanceof PlatformError && caught.status === 409);
      setKeyError(refusalMessage(caught, {}, 'The connection was not changed.'));
    } finally {
      setBusy(null);
    }
  };

  /** After a 409 on a pasted key: the rows as the platform holds them now, so a connect that did finish shows. */
  const refreshAfterConflict = () => {
    closeKey();
    reread();
  };

  return (
    <View testID={testID}>
      {notice ? (
        <Text testID="connections-notice" style={[styles.noticeLine, { color: status.ok }]}>
          {notice}
        </Text>
      ) : null}
      <SurfaceCard>
        {rows.map((row, index) => (
          <View key={row.providerId}>
            <ConnectionRow
              testID={`connection-row-${row.providerId}`}
              mark={<ConnectionMark icon={row.iconName} testID={`connection-mark-${row.providerId}`} />}
              name={row.name}
              line={row.line}
              lineTone={row.lineTone}
              divider={index < rows.length - 1 && rowError?.providerId !== row.providerId}
              right={
                canManage ? (
                  <ConnectionButton
                    testID={`connection-action-${row.providerId}`}
                    label={busy === row.providerId && row.state !== 'connected' ? 'Working…' : connectionAction(row.state)}
                    accessibilityLabel={`${connectionAction(row.state)} ${row.name}`}
                    disabled={busy !== null}
                    onPress={() => press(row)}
                  />
                ) : null
              }
            />
            {rowError?.providerId === row.providerId ? (
              <Text
                accessibilityRole="alert"
                style={[
                  styles.rowError,
                  { color: status.err },
                  index < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider },
                ]}>
                {rowError.message}
              </Text>
            ) : null}
          </View>
        ))}
      </SurfaceCard>
      {canManage ? null : (
        <Text style={[styles.notice, { color: palette.neutral[400] }]}>{CONNECTIONS_MANAGED_BY}</Text>
      )}

      {keying ? (
        <Dialog
          visible
          onRequestClose={busy ? () => undefined : closeKey}
          testID="connection-dialog"
          actionsLayout={keyPending ? 'stack' : 'row'}
          title={`Connect ${keying.name}`}
          actions={
            <>
              <DialogButton label="Cancel" disabled={busy !== null} onPress={closeKey} />
              <DialogButton
                tone="accent"
                disabled={busy !== null}
                onPress={() => void submitKey()}
                label={busy !== null ? 'Verifying…' : keyPending ? 'Retry verification' : 'Verify and connect'}
              />
              {keyPending ? (
                <DialogButton label="Refresh connections" disabled={busy !== null} onPress={refreshAfterConflict} />
              ) : null}
            </>
          }>
          {keying.credentialFields.map((field) => (
            <TextField
              key={field.name}
              label={field.label}
              value={credentials[field.name] ?? ''}
              onChangeText={(value) => updateCredential(field.name, value)}
              secure={field.secret}
              placeholder={field.help}
            />
          ))}
          {keyError ? <DialogText tone="error">{keyError}</DialogText> : null}
          {keyPending ? <DialogText>{KEY_REQUEST_IN_PROGRESS}</DialogText> : null}
        </Dialog>
      ) : null}

      {disconnecting ? (
        <ConfirmDialog
          testID="disconnect-dialog"
          title={disconnectTitle(disconnecting.name)}
          body={disconnectBody(disconnecting.liveFlows)}
          confirmLabel={DISCONNECT_LABEL}
          busyLabel={DISCONNECTING_LABEL}
          fallback="The connection was not changed."
          run={async () => {
            const workspaceId = workspaceIfShown(session, loadedFor);
            if (!workspaceId) throw new Error(WORKSPACE_CHANGED);
            if (disconnecting.connectionId) await disconnectConnection(workspaceId, disconnecting.connectionId);
          }}
          onClose={() => setDisconnecting(null)}
          onDone={() => {
            setDisconnecting(null);
            onNotice(null);
            reread();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rowError: {
    paddingHorizontal: space.rowX,
    paddingBottom: space.rowY,
    fontFamily: fonts.regular,
    ...typeScale.small,
  },
  noticeLine: {
    marginBottom: space.inner,
    fontFamily: fonts.regular,
    ...typeScale.small,
  },
  notice: {
    marginTop: space.inner,
    fontFamily: fonts.regular,
    ...typeScale.small,
  },
});
