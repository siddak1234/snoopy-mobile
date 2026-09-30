import { CaretRight } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts, status } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import {
  CONNECTIONS_MANAGED_BY,
  REPLACEMENT_WAS_STALE,
  WORKSPACE_CHANGED,
  refusalMessage,
} from '@/lib/content/refusals';
import { connectOAuthProvider, connectProviderWithKey, disconnectConnection } from '@/lib/platform/connections';
import { PlatformError } from '@/lib/platform/problem';
import type { ConnectionView } from '@/lib/view/catalog';

/**
 * Settings' CONNECTIONS card — the website's Connections panel, on the same
 * operations (ADR-0032, BUILD-PLAN 24.4.3).
 *
 * - **Owner or admin only** changes a connection. The Edge refuses a member all
 *   of Connect, Disconnect and Replace (403), so a member sees what is connected
 *   and is told who can change it, and is offered nothing that would be refused.
 * - **Replace account** is its own intent, confirmed first, naming the exact
 *   connection it replaces; the account stays connected until the new sign-in
 *   completes. A connection that changed since the screen read it is 409, said
 *   in words.
 * - **Every action acts on the workspace these rows were read for**
 *   (`workspaceIfShown`); after a switch elsewhere it is refused, not sent.
 * - **One dialog, two modes.** Replace's confirmation is the same sheet with
 *   other words: iOS will not present a second modal while the first is still
 *   being dismissed, so swapping one for another in a single render left the
 *   card with no dialog at all.
 */
export function ConnectionsCard({
  rows,
  loadedFor,
  canManage,
  onChanged,
}: {
  rows: ConnectionView[];
  /** The workspace `rows` were read for. */
  loadedFor: string | null;
  canManage: boolean;
  /** Re-read the connections after something changed, or might have. */
  onChanged: () => void;
}) {
  const { palette } = useTheme();
  const session = useSession();
  const [selected, setSelected] = useState<ConnectionView | null>(null);
  // The same dialog, asking to confirm Replace for `selected`.
  const [replacing, setReplacing] = useState(false);
  // A Replace refused as stale (409): the rows are out of date, and closing the
  // dialog re-reads them, so the next choice is made on what is connected now.
  const [stale, setStale] = useState(false);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A pasted key's key follows its values: the same values resubmitted reuse it.
  const keys = useIntentKeys('connection');

  const close = () => {
    setSelected(null);
    setReplacing(false);
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

  const apply = async () => {
    if (!selected || busy) return;
    const workspaceId = workspaceIfShown(session, loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (selected.connected && selected.connectionId) {
        await disconnectConnection(workspaceId, selected.connectionId);
      } else if (selected.authType === 'oauth2') {
        const outcome = await connectOAuthProvider(workspaceId, selected.provider);
        if (outcome.status === 'cancelled') {
          // Not proof that nothing happened. A system browser sharing a logged-in
          // website session completes the connect AT the website and skips the app
          // handoff (manifest §12.1 #79); the person then closes the sheet and the
          // app sees `cancelled`. Re-reading is the only honest answer.
          close();
          onChanged();
          return;
        }
        if (outcome.status === 'failed') {
          setError(outcome.message);
          return;
        }
      } else {
        const values = Object.fromEntries(
          selected.credentialFields.map((field) => [field.name, credentials[field.name]?.trim() ?? '']),
        );
        if (Object.values(values).some((value) => !value)) {
          setError('Complete every credential field before connecting.');
          return;
        }
        await connectProviderWithKey(workspaceId, selected.providerId, values, keys.keyFor());
      }
      close();
      onChanged();
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The connection was not changed.'));
    } finally {
      setBusy(false);
    }
  };

  const replace = async () => {
    if (!replacing || !selected?.connectionId || busy) return;
    const workspaceId = workspaceIfShown(session, loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await connectOAuthProvider(workspaceId, selected.provider, {
        replaceConnectionId: selected.connectionId,
      });
      if (outcome.status === 'failed') {
        setError(outcome.message);
        return;
      }
      if (outcome.status === 'connected' && outcome.reused) {
        setError(`${outcome.connection.externalAccount.displayName} is still connected — there was nothing to replace.`);
        return;
      }
      close();
      onChanged();
    } catch (caught) {
      const wasStale = caught instanceof PlatformError && caught.status === 409;
      if (wasStale) setStale(true);
      setError(wasStale ? REPLACEMENT_WAS_STALE : refusalMessage(caught, {}, 'The account was not replaced.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <SectionLabel>CONNECTIONS</SectionLabel>
      <SurfaceCard style={styles.sectionCard}>
        {rows.map((c, i) => (
          <SettingsRow
            key={c.providerId}
            icon={c.icon}
            title={c.name}
            sub={c.sub}
            divider={i < rows.length - 1}
            testID={`connection-row-${c.providerId}`}
            onPress={
              canManage
                ? () => {
                    setSelected(c);
                    setError(null);
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
                <Text style={[styles.connectLink, { color: palette.accentRamp[300] }]}>Connect</Text>
              ) : null
            }
          />
        ))}
      </SurfaceCard>
      {canManage ? null : (
        <Text style={[styles.notice, { color: palette.neutral[400] }]}>{CONNECTIONS_MANAGED_BY}</Text>
      )}

      <Dialog
        visible={selected !== null}
        onRequestClose={replacing && busy ? () => undefined : close}
        testID={replacing ? 'replace-account-dialog' : undefined}
        title={
          replacing
            ? `Replace ${selected?.accountName ?? selected?.name ?? ''}?`
            : `${selected?.connected ? 'Disconnect' : 'Connect'} ${selected?.name ?? ''}`
        }
        body={
          replacing
            ? `You will sign in to ${selected?.name ?? ''} with the account every automation that uses this connection should act as from now on. ${selected?.accountName ?? 'The current account'} stays connected until that sign-in completes.`
            : selected?.connected
              ? selected.sub
              : selected?.provider.description
        }
        actions={
          replacing ? (
            <>
              <DialogButton label="Cancel" disabled={busy} onPress={close} />
              <DialogButton tone="accent" disabled={busy} onPress={replace} label={busy ? 'Working…' : 'Replace account'} />
            </>
          ) : (
            <>
              <DialogButton label="Cancel" onPress={close} />
              {selected?.replaceable ? (
                <DialogButton
                  label="Replace account"
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    setReplacing(true);
                  }}
                />
              ) : null}
              <DialogButton
                tone={selected?.connected ? 'danger' : 'accent'}
                disabled={busy}
                onPress={apply}
                label={busy ? 'Working…' : selected?.connected ? 'Disconnect' : 'Connect'}
              />
            </>
          )
        }>
        {!replacing && selected?.authType === 'api-key' && !selected.connected
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
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    marginTop: 9,
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
    fontSize: 13,
  },
  notice: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
});
