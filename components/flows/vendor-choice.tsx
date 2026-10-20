import { useRouter } from 'expo-router';
import { CheckCircle } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConnectionMark, ConnectionRow, NoneMark } from '@/components/connection-row';
import { Text } from '@/components/text';
import { fonts, iconSize, status, typeScale } from '@/constants/theme';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED, connectionIncomplete, refusalMessage } from '@/lib/content/refusals';
import { VENDOR_ADMIN_ONLY, VENDOR_ASK_ADMIN, VENDOR_NONE_SUB, VENDOR_SAVING } from '@/lib/content/screen-states';
import type { Connection, ConnectionProvider } from '@/lib/platform/catalog';
import { connectOAuthProvider } from '@/lib/platform/connections';
import { invalidateShared } from '@/lib/platform/snapshot';
import { connectionLine, connectionState } from '@/lib/view/catalog';

/** The choice that saves the details only: no vendor (backend `CONNECTION_NONE`). */
export const NONE = 'none';

/**
 * One step's vendor choice (backend ADR-0037, ADR-0040; Build 21's A2): a row
 * for each vendor the connection field names, in the manifest's order, then
 * None. Each row is the one connection row (spec A4) — the vendor's mark, its
 * name, the account's email or its state under it — and the whole row is the
 * control; a check (24) marks the chosen one, in place of a button. Drawn on
 * Connect integration, where a tap is saved at once, and on Set up, where a tap is
 * the choice its Turn on or Save sends (the owner's AM4: "set up should be made
 * simple. vendor connections can be specific but everything is there").
 *
 * A tap on a connected vendor or None is the choice (`onChoose`). A vendor not
 * connected is connected first, for an owner or admin, through the provider at
 * once — then chosen; cancelled or not completed, it stays unchosen and says
 * so under its row, in the existing words (the owner's build 20 item 2: "If i
 * need to connect then after i click and connection happens then it shoukd
 * take me back"). A vendor that takes a pasted key is connected where its key
 * is pasted, Settings › Connections. For a member a vendor not connected is no
 * choice: "Ask an owner or admin to connect it."
 *
 * `readOnly` (round 23, B3 — only an organization's owners and admins change a
 * flow's integration; backend ADR-0043): no row is a choice, None and connected
 * vendors too, and the list ends "Only an owner or admin can change the
 * integration." Connect integration passes it for a member; Set up for a member
 * changing a flow already on (adding a flow stays any member's, ADR-0036).
 */
export function VendorChoice({
  vendors,
  providers,
  connections,
  chosen,
  canManage,
  shownWorkspaceId,
  saving,
  onChoose,
  onConnectionsChanged,
  readOnly = false,
}: {
  /** The vendors this field chooses among, in the manifest's order. */
  vendors: readonly { providerId: string; displayName: string }[];
  providers: ReadonlyMap<string, ConnectionProvider>;
  connections: readonly Connection[];
  /** The vendor chosen now, or `none`. */
  chosen: string;
  canManage: boolean;
  /** The workspace the screen loaded; a connect is refused once it is not active. */
  shownWorkspaceId: string | null;
  /** The choice being saved: its row says "Saving…" and the rest wait. */
  saving: string | null;
  onChoose: (choice: string) => void;
  /** A connect finished, either way: the screen reads its connections again. */
  onConnectionsChanged?: () => void;
  /** A member who may not change the integration: every row inert, and the line that says so. */
  readOnly?: boolean;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ providerId: string; message: string } | null>(null);
  const busy = saving ?? connecting;
  const connectionOf = (providerId: string) => connections.find((connection) => connection.providerId === providerId);

  const tap = async (choice: string, provider?: ConnectionProvider) => {
    if (busy) return;
    setRowError(null);
    if (choice === NONE || connectionState(connectionOf(choice)) === 'connected') {
      onChoose(choice);
      return;
    }
    if (!provider) return;
    if (provider.authType !== 'oauth2') {
      router.push('/(tabs)/settings/connections');
      return;
    }
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setRowError({ providerId: choice, message: WORKSPACE_CHANGED });
      return;
    }
    setConnecting(choice);
    let outcome: Awaited<ReturnType<typeof connectOAuthProvider>>;
    try {
      outcome = await connectOAuthProvider(workspaceId, provider);
    } catch (caught) {
      setConnecting(null);
      setRowError({ providerId: choice, message: refusalMessage(caught, {}, 'The connection was not changed.') });
      return;
    }
    setConnecting(null);
    // What changed is read again, past the snapshot, whatever came back: a
    // `cancelled` sheet may still have connected at the website (§12.1 #79).
    invalidateShared(workspaceId, ['connections', 'subscriptions']);
    onConnectionsChanged?.();
    if (outcome.status === 'connected') {
      onChoose(choice);
      return;
    }
    if (outcome.status === 'failed') setRowError({ providerId: choice, message: outcome.message });
    else if (outcome.status === 'incomplete') setRowError({ providerId: choice, message: connectionIncomplete(false) });
  };

  const check = (on: boolean, testID: string) =>
    on ? <CheckCircle testID={testID} size={iconSize.row} weight="fill" color={palette.accent} /> : null;

  return (
    <View testID="vendor-choice">
      {vendors.map((vendor) => {
        const provider = providers.get(vendor.providerId);
        const connection = connectionOf(vendor.providerId);
        const connected = connectionState(connection) === 'connected';
        const isChosen = chosen === vendor.providerId;
        // Connected, or connectable by this person: the row is the choice — never when read-only.
        const tappable = !readOnly && (connected || (Boolean(provider) && canManage));
        const line =
          busy === vendor.providerId
            ? { text: VENDOR_SAVING, tone: 'muted' as const }
            : !connected && provider && !canManage
              ? { text: VENDOR_ASK_ADMIN, tone: 'muted' as const }
              : connectionLine(connection);
        return (
          <View key={vendor.providerId} style={{ borderBottomWidth: 1, borderBottomColor: palette.divider }}>
            <ConnectionRow
              testID={`vendor-${vendor.providerId}`}
              accessibilityRole="radio"
              accessibilityLabel={provider?.displayName ?? vendor.displayName}
              accessibilityState={{ selected: isChosen, disabled: !tappable || (busy !== null && busy !== vendor.providerId) }}
              mark={<ConnectionMark icon={provider?.icon} testID={`vendor-mark-${vendor.providerId}`} />}
              name={provider?.displayName ?? vendor.displayName}
              line={line.text}
              lineTone={line.tone}
              disabled={!tappable || busy !== null}
              onPress={tappable ? () => void tap(vendor.providerId, provider) : undefined}
              right={check(isChosen, `vendor-chosen-${vendor.providerId}`)}
            />
            {rowError?.providerId === vendor.providerId ? (
              <Text accessibilityRole="alert" style={[styles.rowError, { color: status.err }]}>
                {rowError.message}
              </Text>
            ) : null}
          </View>
        );
      })}
      <ConnectionRow
        testID="vendor-none"
        accessibilityRole="radio"
        accessibilityLabel="None"
        accessibilityState={{ selected: chosen === NONE, disabled: readOnly || (busy !== null && busy !== NONE) }}
        mark={<NoneMark />}
        name="None"
        line={busy === NONE ? VENDOR_SAVING : VENDOR_NONE_SUB}
        disabled={readOnly || busy !== null}
        onPress={readOnly ? undefined : () => void tap(NONE)}
        right={check(chosen === NONE, 'vendor-chosen-none')}
      />
      {readOnly ? (
        <Text testID="vendor-read-only" style={[styles.readOnly, { color: palette.neutral[400] }]}>
          {VENDOR_ADMIN_ONLY}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rowError: { paddingHorizontal: 14, paddingBottom: 12, fontFamily: fonts.regular, ...typeScale.small },
  readOnly: { paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.regular, ...typeScale.small },
});
