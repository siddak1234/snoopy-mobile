import { CaretRight } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts, status, typeScale } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import {
  CONNECTION_COMPLETED,
  CONNECTION_NEEDS_ATTENTION,
  CONNECTIONS_MANAGED_BY,
  KEY_REQUEST_IN_PROGRESS,
  PROVIDERS_CONFIGURED,
  REPLACEMENT_WAS_STALE,
  WORKSPACE_CHANGED,
  alreadyConnected,
  connectionIncomplete,
  refusalMessage,
} from '@/lib/content/refusals';
import { connectOAuthProvider, connectProviderWithKey, disconnectConnection } from '@/lib/platform/connections';
import { PlatformError } from '@/lib/platform/problem';
import type { ConnectionView } from '@/lib/view/catalog';

/** The action under way, so only its button says "Working…". */
type Working = 'connect' | 'reconnect' | 'disconnect' | 'replace';

/**
 * Settings' CONNECTIONS card — the website's Connections panel, on the same
 * operations (ADR-0032, BUILD-PLAN 24.4.3).
 *
 * - **Owner or admin only** changes a connection. The Edge refuses a member all
 *   of Connect, Disconnect and Replace (403), so a member sees what is connected
 *   and is told who can change it, and is offered nothing that would be refused.
 * - **A row is a provider, and says what the website's two lists say** (Gate
 *   24 parity): what connecting it lets flows do, then the account the
 *   connection acts as, its state and the live flows that use it, and the
 *   website's warning when the connection has an error code. Under the rows,
 *   for everyone, that only the providers configured here are listed.
 * - **Connect, or Reconnect.** A provider the workspace holds a connection to —
 *   connected, or needing reauthorization — opens its actions: Reconnect,
 *   Replace account (OAuth only) and Disconnect; any other opens Connect.
 *   Reconnect keeps the account (backend ADR-0019 §4): through the provider for
 *   OAuth, which asks consent only when the grant lacks something; by a key
 *   pasted again for a key provider.
 * - **What a connect came back with is said**, as the website says it on the
 *   page it returns to: completed; already connected with everything it needs
 *   (`reused` — nothing was asked); or not completed, saying whether the
 *   connection the provider had is still active. The screen keeps the notice
 *   (`notice`), since the re-read draws the loading state in this card's place.
 * - **A pasted key answered 409** may still be verifying: Retry verification
 *   sends it again under the same key, Refresh connections reads the rows
 *   again — never a new request in its place.
 * - **Replace account** is its own intent, confirmed first, naming the exact
 *   connection it replaces; the account stays connected until the new sign-in
 *   completes. A connection that changed since the screen read it is 409, said
 *   in words.
 * - **Every action acts on the workspace these rows were read for**
 *   (`workspaceIfShown`); after a switch elsewhere it is refused, not sent.
 * - **One dialog, three modes** — a held connection's actions, Connect, and
 *   Replace's confirmation — the same sheet with other words: iOS will not
 *   present a second modal while the first is still being dismissed, so
 *   swapping one for another in a single render left the card with no dialog
 *   at all.
 */
export function ConnectionsCard({
  rows,
  loadedFor,
  canManage,
  notice,
  onNotice,
  onChanged,
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
}) {
  const { palette } = useTheme();
  const session = useSession();
  const [selected, setSelected] = useState<ConnectionView | null>(null);
  // The same dialog, asking to confirm Replace for `selected`.
  const [replacing, setReplacing] = useState(false);
  // A key provider's Reconnect: the same dialog, with its key fields.
  const [rekeying, setRekeying] = useState(false);
  // A Replace refused as stale (409): the rows are out of date, and closing the
  // dialog re-reads them, so the next choice is made on what is connected now.
  const [stale, setStale] = useState(false);
  // A pasted key answered 409: its first request may still be verifying.
  const [keyPending, setKeyPending] = useState(false);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Working | null>(null);
  // A pasted key's key follows its values: the same values resubmitted reuse it.
  const keys = useIntentKeys('connection');

  const close = () => {
    setSelected(null);
    setReplacing(false);
    setRekeying(false);
    setKeyPending(false);
    setCredentials({});
    setError(null);
    keys.settle();
    if (stale) {
      setStale(false);
      onChanged();
    }
  };

  const updateCredential = (name: string, value: string) => {
    setCredentials((previous) => ({ ...previous, [name]: value }));
    keys.settle();
  };

  /**
   * One action at a time, on the workspace these rows were read for; a refusal
   * is said in the dialog and the rows are left as they are.
   */
  const act = async (working: Working, run: (workspaceId: string, row: ConnectionView) => Promise<void>) => {
    const row = selected;
    if (!row || busy) return;
    const workspaceId = workspaceIfShown(session, loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(working);
    setError(null);
    try {
      await run(workspaceId, row);
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The connection was not changed.'));
    } finally {
      setBusy(null);
    }
  };

  /** Connect or Reconnect through the provider — one call, as on the website. */
  const authorize = async (workspaceId: string, row: ConnectionView) => {
    const outcome = await connectOAuthProvider(workspaceId, row.provider);
    if (outcome.status === 'failed') {
      setError(outcome.message);
      return;
    }
    if (outcome.status === 'incomplete') {
      setError(connectionIncomplete(row.connected));
      return;
    }
    if (outcome.status === 'connected') {
      onNotice(
        outcome.reused ? alreadyConnected(row.name, outcome.connection.externalAccount.displayName) : CONNECTION_COMPLETED,
      );
    }
    // `cancelled` is not proof that nothing happened. A system browser sharing a
    // logged-in website session completes the connect AT the website and skips
    // the app handoff (manifest §12.1 #79); the person then closes the sheet and
    // the app sees `cancelled`. Re-reading is the only honest answer.
    close();
    onChanged();
  };

  /** Connect's own button: through the provider, or with the pasted key. */
  const apply = () =>
    act('connect', async (workspaceId, row) => {
      if (row.authType === 'oauth2') return authorize(workspaceId, row);
      const values = Object.fromEntries(
        row.credentialFields.map((field) => [field.name, credentials[field.name]?.trim() ?? '']),
      );
      if (Object.values(values).some((value) => !value)) {
        setError('Complete every credential field before connecting.');
        return;
      }
      setKeyPending(false);
      try {
        await connectProviderWithKey(workspaceId, row.providerId, values, keys.keyFor());
      } catch (caught) {
        // The key was reused with other values, or its first request is still
        // verifying: the contract's way on is the same key again, never a new
        // one for an uncertain request — so the key is kept.
        setKeyPending(caught instanceof PlatformError && caught.status === 409);
        throw caught;
      }
      close();
      onChanged();
    });

  /** Reconnect keeps the account: through the provider, or a key pasted again. */
  const reconnect = async () => {
    if (selected?.authType === 'api-key') {
      setError(null);
      setRekeying(true);
      return;
    }
    await act('reconnect', authorize);
  };

  const disconnect = () =>
    act('disconnect', async (workspaceId, row) => {
      if (!row.connectionId) return;
      await disconnectConnection(workspaceId, row.connectionId);
      close();
      onChanged();
    });

  /** After a 409 on a pasted key: the rows as the platform holds them now, so a connect that did finish shows. */
  const refreshAfterConflict = () => {
    close();
    onChanged();
  };

  const replace = async () => {
    if (!replacing || !selected?.connectionId || busy) return;
    const workspaceId = workspaceIfShown(session, loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy('replace');
    setError(null);
    try {
      const outcome = await connectOAuthProvider(workspaceId, selected.provider, {
        replaceConnectionId: selected.connectionId,
      });
      if (outcome.status === 'failed') {
        setError(outcome.message);
        return;
      }
      if (outcome.status === 'incomplete') {
        setError(connectionIncomplete(selected.connected));
        return;
      }
      if (outcome.status === 'connected' && outcome.reused) {
        setError(`${outcome.connection.externalAccount.displayName} is still connected — there was nothing to replace.`);
        return;
      }
      if (outcome.status === 'connected') onNotice(CONNECTION_COMPLETED);
      close();
      onChanged();
    } catch (caught) {
      const wasStale = caught instanceof PlatformError && caught.status === 409;
      if (wasStale) setStale(true);
      setError(wasStale ? REPLACEMENT_WAS_STALE : refusalMessage(caught, {}, 'The account was not replaced.'));
    } finally {
      setBusy(null);
    }
  };

  // A connection the workspace holds opens its actions; Reconnect for a key
  // provider turns the dialog into its key fields.
  const held = !replacing && Boolean(selected?.reconnectable) && !rekeying;
  const keyForm = !replacing && !held && selected?.authType === 'api-key';
  // Replace account is offered wherever the account can be replaced — beside
  // Connect too, for a connection still authorizing.
  const replaceOffered = !replacing && Boolean(selected?.replaceable);
  const connectLabel = keyForm
    ? busy === 'connect'
      ? 'Verifying…'
      : keyPending
        ? 'Retry verification'
        : 'Verify and connect'
    : busy === 'connect'
      ? 'Working…'
      : 'Connect';
  const replaceButton = (
    <DialogButton
      label="Replace account"
      disabled={busy !== null}
      onPress={() => {
        setError(null);
        setReplacing(true);
      }}
    />
  );

  return (
    <View>
      {notice ? (
        <Text testID="connections-notice" style={[styles.noticeLine, { color: status.ok }]}>
          {notice}
        </Text>
      ) : null}
      <SectionLabel>CONNECTIONS</SectionLabel>
      <SurfaceCard style={styles.sectionCard}>
        {rows.map((c, i) => (
          <SettingsRow
            key={c.providerId}
            icon={c.icon}
            title={c.name}
            sub={c.provider.description}
            detail={
              <>
                <Text style={[styles.rowLine, { color: palette.neutral[400] }]}>{c.sub}</Text>
                {c.attention ? (
                  <Text style={[styles.rowLine, { color: status.warnText }]}>{CONNECTION_NEEDS_ATTENTION}</Text>
                ) : null}
              </>
            }
            divider={i < rows.length - 1}
            testID={`connection-row-${c.providerId}`}
            onPress={
              canManage
                ? () => {
                    setSelected(c);
                    setError(null);
                    onNotice(null);
                  }
                : undefined
            }
            right={
              c.connected ? (
                <View style={styles.connectedRight}>
                  <View style={[styles.greenDot, { backgroundColor: status.ok }]} />
                  {canManage ? <CaretRight size={15} color={palette.neutral[500]} /> : null}
                </View>
              ) : canManage ? (
                <Text style={[styles.connectLink, { color: palette.accentRamp[300] }]}>
                  {c.reconnectable ? 'Reconnect' : 'Connect'}
                </Text>
              ) : null
            }
          />
        ))}
      </SurfaceCard>
      <Text style={[styles.notice, { color: palette.neutral[400] }]}>{PROVIDERS_CONFIGURED}</Text>
      {canManage ? null : (
        <Text style={[styles.notice, { color: palette.neutral[400] }]}>{CONNECTIONS_MANAGED_BY}</Text>
      )}

      <Dialog
        visible={selected !== null}
        onRequestClose={replacing && busy ? () => undefined : close}
        testID={replacing ? 'replace-account-dialog' : 'connection-dialog'}
        // A held connection offers three or four actions, Connect beside Replace
        // account three, and a key answered 409 three; a row wrapped the third
        // onto its own line (feedback #2), so they stack.
        actionsLayout={held || replaceOffered || (keyForm && keyPending) ? 'stack' : 'row'}
        title={
          replacing
            ? `Replace ${selected?.accountName ?? selected?.name ?? ''}?`
            : held
              ? (selected?.name ?? '')
              : `Connect ${selected?.name ?? ''}`
        }
        body={
          replacing
            ? `You will sign in to ${selected?.name ?? ''} with the account every flow that uses this connection should act as from now on. ${selected?.accountName ?? 'The current account'} stays connected until that sign-in completes.`
            : held
              ? selected?.sub
              : selected?.provider.description
        }
        actions={
          replacing ? (
            <>
              <DialogButton label="Cancel" disabled={busy !== null} onPress={close} />
              <DialogButton
                tone="accent"
                disabled={busy !== null}
                onPress={replace}
                label={busy === 'replace' ? 'Working…' : 'Replace account'}
              />
            </>
          ) : held ? (
            <>
              <DialogButton label="Cancel" onPress={close} />
              <DialogButton
                tone="accent"
                disabled={busy !== null}
                onPress={reconnect}
                label={busy === 'reconnect' ? 'Working…' : 'Reconnect'}
              />
              {replaceOffered ? replaceButton : null}
              <DialogButton
                tone="danger"
                disabled={busy !== null}
                onPress={disconnect}
                label={busy === 'disconnect' ? 'Working…' : 'Disconnect'}
              />
            </>
          ) : (
            <>
              <DialogButton label="Cancel" onPress={close} />
              <DialogButton tone="accent" disabled={busy !== null} onPress={apply} label={connectLabel} />
              {replaceOffered ? replaceButton : null}
              {keyForm && keyPending ? (
                <DialogButton label="Refresh connections" disabled={busy !== null} onPress={refreshAfterConflict} />
              ) : null}
            </>
          )
        }>
        {keyForm && selected
          ? selected.credentialFields.map((field) => (
              <TextField
                key={field.name}
                label={field.label}
                value={credentials[field.name] ?? ''}
                onChangeText={(value) => updateCredential(field.name, value)}
                secure={field.secret}
                placeholder={field.help}
              />
            ))
          : null}
        {error ? <DialogText tone="error">{error}</DialogText> : null}
        {keyForm && keyPending ? <DialogText>{KEY_REQUEST_IN_PROGRESS}</DialogText> : null}
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    marginTop: 9,
  },
  rowLine: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  connectedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  connectLink: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body.fontSize,
  },
  noticeLine: {
    marginBottom: 12,
    fontFamily: fonts.regular,
    ...typeScale.small,
  },
  notice: {
    marginTop: 8,
    fontFamily: fonts.regular,
    ...typeScale.small,
  },
});
