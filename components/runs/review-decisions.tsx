import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PillButton } from '@/components/nocturne/pill-button';
import { Text } from '@/components/text';
import { fonts, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  ACCEPT_LABEL,
  ANSWER_EVERY_CHANGE,
  DENY_LABEL,
  SAVE_REVIEW_LABEL,
  reviewRowLabel,
} from '@/lib/content/screen-states';
import type { AnsweredDecision, DecisionAnswer, OfferedDecision } from '@/lib/platform/pending-contract';

/** What a screen reader says for a row's pill: its answer and which change ("Deny: Add Z99.2"). */
const reviewPillA11y = (answer: string, change: OfferedDecision) => `${answer}: ${change.label}`;

/**
 * A review of each change a held run offers (Round 21's platform round, F2;
 * ICD-10 Code Check's words.md section 3): each change a row, "{label} ·
 * {detail}", with Accept (the primary pill) and Deny (the danger pill, as an
 * approval's Deny is); once a row is answered the other pill goes quiet
 * (`secondary`), and a press of it changes the answer. A screen reader hears
 * each pill with its change ("Accept: {label}") and the chosen one selected,
 * not only its colour. "Save review" is
 * offered once every row has an answer — until then "Accept or deny each
 * change." — and sends every answer at once (`onSave`); while it saves the
 * pills and Save wait. A plain held run, with no changes, keeps
 * `DecisionButtons`.
 *
 * testIDs: a row `${testID}-row-${id}`, its pills `${testID}-accept-${id}` and
 * `${testID}-deny-${id}`, `${testID}-unanswered`, `${testID}-save`.
 */
export function ReviewDecisions({
  testID,
  changes,
  saving,
  onSave,
}: {
  testID: string;
  changes: readonly OfferedDecision[];
  saving: boolean;
  onSave: (answers: AnsweredDecision[]) => void;
}) {
  const { palette } = useTheme();
  const [answers, setAnswers] = useState<Record<string, DecisionAnswer>>({});
  const answer = (id: string, decision: DecisionAnswer) => setAnswers((before) => ({ ...before, [id]: decision }));
  const complete = changes.every((change) => answers[change.id] !== undefined);

  return (
    <View style={styles.list}>
      {changes.map((change) => {
        const chosen = answers[change.id];
        return (
          <View key={change.id} testID={`${testID}-row-${change.id}`} style={[styles.row, { borderBottomColor: palette.divider }]}>
            <Text style={[styles.label, { color: palette.text }]}>{reviewRowLabel(change)}</Text>
            <View style={styles.pills}>
              <PillButton
                testID={`${testID}-accept-${change.id}`}
                label={ACCEPT_LABEL}
                accessibilityLabel={reviewPillA11y(ACCEPT_LABEL, change)}
                selected={chosen === 'accepted'}
                variant={chosen === 'denied' ? 'secondary' : 'primary'}
                fontSize={typeScale.label.fontSize}
                disabled={saving}
                style={styles.pill}
                onPress={() => answer(change.id, 'accepted')}
              />
              <PillButton
                testID={`${testID}-deny-${change.id}`}
                label={DENY_LABEL}
                accessibilityLabel={reviewPillA11y(DENY_LABEL, change)}
                selected={chosen === 'denied'}
                variant={chosen === 'accepted' ? 'secondary' : 'danger'}
                fontSize={typeScale.label.fontSize}
                disabled={saving}
                style={styles.pill}
                onPress={() => answer(change.id, 'denied')}
              />
            </View>
          </View>
        );
      })}
      {complete ? null : (
        <Text testID={`${testID}-unanswered`} style={[styles.note, { color: palette.neutral[400] }]}>
          {ANSWER_EVERY_CHANGE}
        </Text>
      )}
      <PillButton
        testID={`${testID}-save`}
        label={SAVE_REVIEW_LABEL}
        variant="primary"
        fontSize={typeScale.label.fontSize}
        disabled={!complete || saving}
        onPress={() => onSave(changes.map((change) => ({ id: change.id, decision: answers[change.id]! })))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.inner },
  row: { gap: space.inner, paddingBottom: space.inner, borderBottomWidth: 1 },
  label: { fontFamily: fonts.medium, ...typeScale.label },
  pills: { flexDirection: 'row', gap: space.inner },
  pill: { flex: 1 },
  note: { fontFamily: fonts.regular, ...typeScale.small },
});
