import { CaretRight, UserCircle } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Dialog, DialogButton, DialogText } from '@/components/dialog';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { SettingsRow } from '@/components/settings/settings-row';
import { fonts } from '@/constants/theme';
import { useIntentKeys } from '@/hooks/use-intent-keys';
import { useTheme } from '@/hooks/use-theme';
import { refusalMessage } from '@/lib/content/refusals';
import { decideAccessRequest, type AccessRequest } from '@/lib/platform/projects';
import { relativeTimeAgo } from '@/lib/view/format';

/**
 * Who is asking to join this team (BUILD-PLAN 24.11.7, backend 24.11.2), for
 * those who decide: the team's owner or admin, and the organization's. Each
 * pending request opens one decision — Approve puts the person on the team as a
 * member; Deny leaves them off, and they may ask again. Acts on the team's own
 * workspace, as everything on its page does.
 */
export function TeamRequests({
  workspaceId,
  projectId,
  teamName,
  requests,
  onChanged,
}: {
  workspaceId: string;
  projectId: string;
  teamName: string;
  requests: AccessRequest[];
  onChanged: () => void;
}) {
  const { palette } = useTheme();
  const [deciding, setDeciding] = useState<AccessRequest | null>(null);
  const pending = requests.filter((request) => request.status === 'pending');
  const nameOf = (request: AccessRequest) => request.displayName || request.email;

  return (
    <View>
      <SectionLabel>{`ASKING TO JOIN · ${pending.length}`}</SectionLabel>
      <SurfaceCard style={styles.card}>
        {pending.length === 0 ? (
          <Text style={[styles.empty, { color: palette.neutral[400] }]}>No one is asking to join.</Text>
        ) : null}
        {pending.map((request, index) => (
          <SettingsRow
            key={request.id}
            testID={`team-request-${request.id}`}
            icon={UserCircle}
            title={nameOf(request)}
            sub={`Asked ${relativeTimeAgo(request.createdAt)}`}
            divider={index < pending.length - 1}
            onPress={() => setDeciding(request)}
            right={<CaretRight size={15} color={palette.neutral[500]} />}
          />
        ))}
      </SurfaceCard>
      {deciding ? (
        <DecideDialog
          workspaceId={workspaceId}
          projectId={projectId}
          teamName={teamName}
          request={deciding}
          name={nameOf(deciding)}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            onChanged();
          }}
        />
      ) : null}
    </View>
  );
}

function DecideDialog({
  workspaceId,
  projectId,
  teamName,
  request,
  name,
  onClose,
  onDone,
}: {
  workspaceId: string;
  projectId: string;
  teamName: string;
  request: AccessRequest;
  name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const keys = useIntentKeys(`team-request-${request.id}`);
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'approve' | 'deny') => {
    if (busy) return;
    setBusy(decision);
    setError(null);
    try {
      await decideAccessRequest(workspaceId, projectId, request.id, decision, keys.keyFor(decision));
      keys.settle(decision);
      onDone();
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'The request could not be answered.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      visible
      testID="team-request-dialog"
      onRequestClose={busy ? () => undefined : onClose}
      title="Request to join"
      body={`${name} asked ${relativeTimeAgo(request.createdAt)} to join ${teamName}.`}
      actions={
        <>
          <DialogButton label="Cancel" disabled={busy !== null} onPress={onClose} />
          <DialogButton label={busy === 'deny' ? 'Updating…' : 'Deny'} disabled={busy !== null} onPress={() => decide('deny')} />
          <DialogButton
            tone="accent"
            label={busy === 'approve' ? 'Updating…' : 'Approve'}
            disabled={busy !== null}
            onPress={() => decide('approve')}
          />
        </>
      }>
      {error ? <DialogText tone="error">{error}</DialogText> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 9 },
  empty: { fontFamily: fonts.regular, fontSize: 13, padding: 14 },
});
