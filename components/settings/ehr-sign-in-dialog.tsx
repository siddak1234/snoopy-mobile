import React, { useState } from 'react';

import { ChoiceChips } from '@/components/choice-chips';
import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { TextField } from '@/components/nocturne/text-field';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import {
  EHR_ACCOUNT_MISMATCH,
  EHR_ACCOUNT_MISMATCH_REFUSAL,
  EHR_REPLACE,
  EHR_SIGN_IN_REFUSALS,
  EHR_WORKING,
} from '@/lib/content/ehr-connect';
import { WORKSPACE_CHANGED, connectionIncomplete, refusalMessage } from '@/lib/content/refusals';
import { connectOAuthProvider, type ConnectionOutcome } from '@/lib/platform/connections';
import { PlatformError } from '@/lib/platform/problem';
import type { ConnectionView } from '@/lib/view/catalog';
import { preChosenVendor, signInLabel, smartVendors } from '@/lib/view/ehr-connection';

/** What ends the form: signed in (or the live sign-in reused), or the EHR's page closed by the person. */
export type SignInEnded = Extract<ConnectionOutcome, { status: 'connected' | 'cancelled' }>;

/**
 * An EHR's sign-in form (`smart-launch`, Round 22; backend ADR-0054): the one
 * form wherever the sign-in starts — a Connections row (`ConnectionsCard`:
 * Settings › Connections, a flow page's CONNECTIONS, Set up's CONNECT) and a
 * flow's EHR connection field (`VendorChoice`: Set up, Connect integration) —
 * so it comes back to the screen it started on, as an OAuth connect does (the
 * session's parity decision D4).
 *
 * The vendor chips for two or more vendors, none chosen until the person
 * picks one, and the FHIR address with its help; the button "Sign in" until a
 * vendor is chosen, then "Sign in with {its full label}" (`signInLabel`; D1),
 * and "Working…" while it goes (D2). The two go to `authorize` as
 * `credentials`, and the EHR's own sign-in page opens in the system auth
 * session (`connectOAuthProvider`).
 *
 * Every refusal is said here, by its reason (`EHR_SIGN_IN_REFUSALS`).
 * Another address than the workspace's (409 `account_mismatch`) asks
 * "Replace it?" when `row` holds the workspace's connection, and Replace
 * begins again with the form's values as they are, naming that connection;
 * any change to the form takes the offer back. Without the connection's id,
 * the refusal alone, and Refresh connections — as for any other 409 (D3).
 */
export function EhrSignInDialog({
  row,
  loadedFor,
  onClose,
  onEnded,
  onRefresh,
  testID = 'connection-dialog',
}: {
  /** The EHR's row as the screen's last read holds it: its connection is the one Replace names. */
  row: ConnectionView;
  /** The workspace the screen read; a sign-in is refused, not sent, once it is not the active one. */
  loadedFor: string | null;
  /** Cancel. */
  onClose: () => void;
  /** Signed in, or the EHR's page closed: the caller closes the form, says what came back and reads its connections again. */
  onEnded: (outcome: SignInEnded) => void;
  /** Refresh connections, after a 409 Replace cannot answer: the caller closes the form and reads its connections again. */
  onRefresh: () => void;
  testID?: string;
}) {
  const session = useSession();
  const vendors = smartVendors(row.provider);
  const [vendor, setVendor] = useState<string | null>(() => preChosenVendor(row.provider));
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // 409 `account_mismatch` with the workspace's connection known: the button is Replace until the form changes.
  const [replacing, setReplacing] = useState(false);
  // Another 409, or a mismatch whose connection the row does not hold: the rows must be read again.
  const [refreshOwed, setRefreshOwed] = useState(false);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (busy) return;
    const workspaceId = workspaceIfShown(session, loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return;
    }
    const typed = Object.fromEntries(row.credentialFields.map((field) => [field.name, values[field.name]?.trim() ?? '']));
    if (!vendor || Object.values(typed).some((value) => !value)) {
      setError('Complete every credential field before connecting.');
      return;
    }
    const replaceConnectionId = replacing ? row.connectionId : undefined;
    setBusy(true);
    setError(null);
    setRefreshOwed(false);
    try {
      const outcome = await connectOAuthProvider(workspaceId, row.provider, {
        credentials: { vendor, fhirBaseUrl: typed.fhirBaseUrl ?? '' },
        ...(replaceConnectionId ? { replaceConnectionId } : {}),
      });
      setReplacing(false);
      if (outcome.status === 'failed') setError(outcome.message);
      else if (outcome.status === 'incomplete') setError(connectionIncomplete(row.active));
      // `cancelled` is not proof nothing happened, as an OAuth connect's: the caller reads again.
      else onEnded(outcome);
    } catch (caught) {
      const conflict = caught instanceof PlatformError && caught.status === 409;
      const mismatched = conflict && caught.details?.reason === 'account_mismatch';
      const replaceable = mismatched && row.connectionId !== undefined;
      setReplacing(replaceable);
      // Another 409 — the connection Replace named changed since the read — or a
      // mismatch whose connection the row does not hold: Refresh connections
      // reads the rows as the platform holds them now.
      setRefreshOwed(conflict && !replaceable);
      setError(
        replaceable
          ? EHR_ACCOUNT_MISMATCH
          : mismatched
            ? EHR_ACCOUNT_MISMATCH_REFUSAL
            : refusalMessage(caught, EHR_SIGN_IN_REFUSALS, 'The connection was not changed.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible
      onRequestClose={busy ? () => undefined : onClose}
      testID={testID}
      actionsLayout={refreshOwed ? 'stack' : 'row'}
      title={`Connect ${row.name}`}
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy} onPress={onClose} />
          <DialogButton
            tone="accent"
            disabled={busy}
            onPress={() => void signIn()}
            label={busy ? EHR_WORKING : replacing ? EHR_REPLACE : signInLabel(row.provider, vendor)}
          />
          {refreshOwed ? <DialogButton label="Refresh connections" disabled={busy} onPress={onRefresh} /> : null}
        </>
      }>
      {vendors.length > 1 ? (
        <ChoiceChips
          options={vendors.map((each) => ({ value: each.id, label: each.label }))}
          value={vendor ?? ''}
          onChange={(next) => {
            setVendor(next);
            setReplacing(false);
          }}
        />
      ) : null}
      {row.credentialFields.map((field) => (
        <TextField
          key={field.name}
          label={field.label}
          value={values[field.name] ?? ''}
          onChangeText={(value) => {
            setValues((previous) => ({ ...previous, [field.name]: value }));
            setReplacing(false);
          }}
          secure={field.secret}
          placeholder={field.help}
        />
      ))}
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}
