import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { fonts } from '@/constants/theme';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WEBHOOK_ISSUE_REFUSALS, WORKSPACE_CHANGED, refusalMessage } from '@/lib/content/refusals';
import {
  issueWebhookAddress,
  readWebhookAddress,
  type IssuedWebhookEndpoint,
  type WebhookEndpoint,
} from '@/lib/platform/automations';
import { relativeTimeAgo } from '@/lib/view/format';

/**
 * Where a vendor sends the events that start this automation (backend §12.1
 * #91, #109; BUILD-PLAN 24.4.1) — the website's `WebhookAddressButton` dialog.
 * Owner or admin only: the screen offers it to no one else, and the platform
 * refuses anyone else.
 *
 * **The secret is shown once and stored nowhere.** It arrives in the answer to
 * making one, lives in this component's state while the dialog is open, and
 * goes when the dialog unmounts — no storage, no Keychain, no log (CLAUDE.md
 * rule 6). Selectable, so it can be copied. Making a new one keeps the address
 * and stops the old secret at once. Mounted only while open, so each opening
 * reads the address afresh.
 */
export function WebhookAddressDialog({
  subscriptionId,
  shownWorkspaceId,
  onClose,
}: {
  subscriptionId: string;
  /** The workspace the screen loaded; both calls are refused once it is not active. */
  shownWorkspaceId: string | null;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const session = useSession();
  // `undefined` until read; `null` when no address has been made yet.
  const [endpoint, setEndpoint] = useState<WebhookEndpoint | null | undefined>(undefined);
  const [issued, setIssued] = useState<IssuedWebhookEndpoint | null>(null);
  // Making a secret holds the dialog open; reading the address does not.
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One read per opening, bound to the workspace the screen loaded when opened.
  const [openedFor] = useState(() => workspaceIfShown(session, shownWorkspaceId));
  useEffect(() => {
    if (!openedFor) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    let cancelled = false;
    readWebhookAddress(openedFor, subscriptionId)
      .then((read) => {
        if (!cancelled) setEndpoint(read);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(refusalMessage(caught, {}, 'The address could not be read.'));
      });
    return () => {
      cancelled = true;
    };
  }, [openedFor, subscriptionId]);

  const issue = async () => {
    if (issuing) return;
    const workspaceId = workspaceIfShown(session, shownWorkspaceId);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    setIssuing(true);
    setError(null);
    try {
      const made = await issueWebhookAddress(workspaceId, subscriptionId);
      setIssued(made);
      setEndpoint({
        endpointId: made.endpointId,
        createdAt: made.createdAt,
        ...(made.url ? { url: made.url } : {}),
      });
    } catch (caught) {
      setError(refusalMessage(caught, WEBHOOK_ISSUE_REFUSALS, 'The address was not made.'));
    } finally {
      setIssuing(false);
    }
  };

  const address = issued?.url ?? endpoint?.url;
  const muted = { color: palette.neutral[400] };

  return (
    <Dialog
      visible
      testID="webhook-dialog"
      // Held open while a secret is being made: the platform stops the old one
      // when it answers, and the new one exists only in that answer.
      onRequestClose={issuing ? () => undefined : onClose}
      title="Webhook address"
      // One sentence on what it is for (owner, build 7; 24.11.9): only a
      // webhook-started flow has one, and the row that opens this says so too.
      body="Where a service sends the events that start this flow — give it this address and the secret, which it sends as the x-autom8x-webhook-secret header."
      actions={
        <>
          <DialogButton label="Close" disabled={issuing} onPress={onClose} />
          {endpoint !== undefined ? (
            <DialogButton
              tone="accent"
              disabled={issuing}
              onPress={issue}
              label={issuing ? 'Working…' : endpoint === null ? 'Create address' : 'Make a new secret'}
            />
          ) : null}
        </>
      }>
      {endpoint === undefined && !error ? <DialogText>Loading…</DialogText> : null}
      {address ? (
        <View>
          <Text style={[styles.label, muted]}>Address</Text>
          <Text selectable style={[styles.value, { color: palette.text }]}>
            {address}
          </Text>
        </View>
      ) : null}
      {endpoint && !address ? (
        <Text selectable style={[styles.value, { color: palette.text }]}>
          Address id {endpoint.endpointId}
        </Text>
      ) : null}
      {endpoint?.lastDeliveryAt ? (
        <Text style={[styles.label, muted]}>
          Last delivery {relativeTimeAgo(endpoint.lastDeliveryAt)}
          {endpoint.lastOutcome ? `: ${endpoint.lastOutcome.replace(/_/g, ' ')}` : ''}
        </Text>
      ) : null}
      {issued ? (
        <View testID="webhook-secret" style={[styles.secret, { borderColor: palette.neutral[700] }]}>
          <Text style={[styles.label, muted]}>Secret — shown this once. Copy it now.</Text>
          <Text selectable style={[styles.value, { color: palette.text }]}>
            {issued.secret}
          </Text>
        </View>
      ) : null}
      {endpoint === null ? <DialogText>This flow has no address yet.</DialogText> : null}
      {endpoint ? (
        <Text style={[styles.label, muted]}>
          A new secret keeps the address and stops the old secret at once.
        </Text>
      ) : null}
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  value: {
    fontFamily: fonts.medium,
    fontSize: 13,
    marginTop: 2,
  },
  secret: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
});
