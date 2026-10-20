import React from 'react';
import { StyleSheet, View } from 'react-native';

import { PillButton } from '@/components/nocturne/pill-button';
import { typeScale } from '@/constants/theme';
import type { Decision } from '@/hooks/use-approval-decision';
import { APPROVE_LABEL, APPROVING_LABEL, DENYING_LABEL, DENY_LABEL } from '@/lib/content/screen-states';

/**
 * The one Approve / Deny pair (round 24 P6, P7; the owner's build 23 F8: "Deny
 * should be red layout color"): the run's step 4 and a Needs-review card draw
 * it, on `PillButton` — Approve the primary, Deny the danger. One tap each, no
 * confirm; while one saves both wait and the pressed one says so ("Approving…",
 * "Denying…"). ~~Approvals' own outlined pair~~ until round 24.
 *
 * testIDs: `${testID}-approve`, `${testID}-deny`.
 */
export function DecisionButtons({
  testID,
  busy,
  onDecide,
}: {
  testID: string;
  /** The decision being saved, or null. */
  busy: Decision | null;
  onDecide: (decision: Decision) => void;
}) {
  return (
    <View style={styles.row}>
      <PillButton
        testID={`${testID}-approve`}
        label={busy === 'approved' ? APPROVING_LABEL : APPROVE_LABEL}
        variant="primary"
        height={44}
        fontSize={typeScale.label.fontSize}
        disabled={busy !== null}
        style={styles.button}
        onPress={() => onDecide('approved')}
      />
      <PillButton
        testID={`${testID}-deny`}
        label={busy === 'rejected' ? DENYING_LABEL : DENY_LABEL}
        variant="danger"
        height={44}
        fontSize={typeScale.label.fontSize}
        disabled={busy !== null}
        style={styles.button}
        onPress={() => onDecide('rejected')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  button: { flex: 1 },
});
