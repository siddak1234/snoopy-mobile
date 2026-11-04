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
  OTHER_CODE,
  SAVE_REVIEW_LABEL,
  changedTo,
  reviewRowLabel,
} from '@/lib/content/screen-states';
import type { AnsweredDecision, OfferedDecision } from '@/lib/platform/automations';
import { otherValues, reviewGroups } from '@/lib/view/runs';

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
 * `readOnly` (words.md section 3: the rows to everyone, the pills to those
 * who may approve): the rows alone — no pills, no note, no Save — for a
 * member, anyone else the approval does not name, and a `review` form the
 * page draws no form for (`questionsForm`, as the block fixtures read it).
 *
 * Grouped (Round 21 platform round 2, B3): changes that carry `group` are
 * drawn under their group's heading, the groups in the order first sent
 * (`reviewGroups`), every group open, up to the platform's 400; "Save review"
 * still needs every answer. The read-only rows (`questionsForm`) are grouped
 * the same way.
 *
 * Other values (the stage 1 spec's S1-B3, backend ADR-0048 amendment 5): a
 * change that offers `options` (at most 3, `otherValues`) has a third pill,
 * "Other code", which opens their short list under the row, one row's at a
 * time; the one picked is that row's answer (`other`, its value), the list
 * closes, both other pills go quiet and the row says "Changed to {code}" until
 * Accept or Deny is pressed instead — as the website's. Read-only rows draw
 * none of it.
 *
 * testIDs: a heading `${testID}-group-${n}`, a row `${testID}-row-${id}`, its pills `${testID}-accept-${id}`,
 * `${testID}-deny-${id}` and `${testID}-other-${id}`, the short list `${testID}-others-${id}` and its
 * `${testID}-option-${id}-${n}`, `${testID}-changed-${id}`, `${testID}-unanswered`, `${testID}-save`.
 */
export function ReviewDecisions({
  testID,
  changes,
  saving = false,
  onSave,
  readOnly = false,
}: {
  testID: string;
  changes: readonly OfferedDecision[];
  saving?: boolean;
  onSave?: (answers: AnsweredDecision[]) => void;
  readOnly?: boolean;
}) {
  const { palette } = useTheme();
  const [answers, setAnswers] = useState<Record<string, Omit<AnsweredDecision, 'id'>>>({});
  // The change whose other values are open under its row, if any.
  const [othersOf, setOthersOf] = useState<string | null>(null);
  const answer = (id: string, next: Omit<AnsweredDecision, 'id'>) => {
    setOthersOf(null);
    setAnswers((before) => ({ ...before, [id]: next }));
  };
  const complete = changes.every((change) => answers[change.id] !== undefined);

  /** One change: its line, and its pills unless read-only — Other code and its short list when it offers other values. */
  const drawRow = (change: OfferedDecision) => {
    const chosen = answers[change.id]?.decision;
    const other = answers[change.id]?.other;
    const answered = answers[change.id] !== undefined;
    const options = otherValues(change.options);
    return (
      <View key={change.id} testID={`${testID}-row-${change.id}`} style={[styles.row, { borderBottomColor: palette.divider }]}>
        {/* "{label} · {detail}": the dot is drawn, not a word, so the label and the detail are each
            the flow's own words, as the block fixtures read them (the website's `ReviewRows`); a
            screen reader hears the line whole. */}
        <View accessible accessibilityLabel={reviewRowLabel(change)} style={styles.labelLine}>
          <Text style={[styles.label, { color: palette.text }]}>{change.label}</Text>
          {change.detail ? (
            <>
              <View style={[styles.dot, { backgroundColor: palette.text }]} />
              <Text style={[styles.label, { color: palette.text }]}>{change.detail}</Text>
            </>
          ) : null}
        </View>
        {other === undefined ? null : (
          <Text testID={`${testID}-changed-${change.id}`} style={[styles.note, { color: palette.neutral[400] }]}>
            {changedTo(other)}
          </Text>
        )}
        {readOnly ? null : (
          <View style={styles.pills}>
            <PillButton
              testID={`${testID}-accept-${change.id}`}
              label={ACCEPT_LABEL}
              accessibilityLabel={reviewPillA11y(ACCEPT_LABEL, change)}
              selected={chosen === 'accepted'}
              variant={answered && chosen !== 'accepted' ? 'secondary' : 'primary'}
              fontSize={typeScale.label.fontSize}
              disabled={saving}
              style={styles.pill}
              onPress={() => answer(change.id, { decision: 'accepted' })}
            />
            <PillButton
              testID={`${testID}-deny-${change.id}`}
              label={DENY_LABEL}
              accessibilityLabel={reviewPillA11y(DENY_LABEL, change)}
              selected={chosen === 'denied'}
              variant={answered && chosen !== 'denied' ? 'secondary' : 'danger'}
              fontSize={typeScale.label.fontSize}
              disabled={saving}
              style={styles.pill}
              onPress={() => answer(change.id, { decision: 'denied' })}
            />
            {options.length > 0 ? (
              <PillButton
                testID={`${testID}-other-${change.id}`}
                label={OTHER_CODE}
                accessibilityLabel={reviewPillA11y(OTHER_CODE, change)}
                selected={other !== undefined}
                variant="secondary"
                fontSize={typeScale.label.fontSize}
                disabled={saving}
                style={styles.pill}
                onPress={() => setOthersOf((open) => (open === change.id ? null : change.id))}
              />
            ) : null}
          </View>
        )}
        {othersOf === change.id && options.length > 0 ? (
          <View testID={`${testID}-others-${change.id}`} style={styles.others}>
            {options.map((option, index) => (
              <PillButton
                key={option.value}
                testID={`${testID}-option-${change.id}-${index}`}
                label={option.label}
                selected={other === option.value}
                variant="secondary"
                fontSize={typeScale.label.fontSize}
                disabled={saving}
                onPress={() => answer(change.id, { other: option.value })}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const groups = reviewGroups(changes);

  return (
    <View style={styles.list}>
      {groups.flatMap((group, at) => [
        group.heading === null ? null : (
          <Text
            key={`group-${at}`}
            testID={`${testID}-group-${at}`}
            accessibilityRole="header"
            style={[styles.heading, { color: palette.neutral[400] }]}>
            {group.heading}
          </Text>
        ),
        ...group.changes.map(drawRow),
      ])}
      {readOnly || complete ? null : (
        <Text testID={`${testID}-unanswered`} style={[styles.note, { color: palette.neutral[400] }]}>
          {ANSWER_EVERY_CHANGE}
        </Text>
      )}
      {readOnly ? null : (
        <PillButton
          testID={`${testID}-save`}
          label={SAVE_REVIEW_LABEL}
          variant="primary"
          fontSize={typeScale.label.fontSize}
          disabled={!complete || saving}
          onPress={() => onSave?.(changes.map((change) => ({ id: change.id, ...answers[change.id]! })))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.inner },
  row: { gap: space.inner, paddingBottom: space.inner, borderBottomWidth: 1 },
  labelLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.inner },
  label: { fontFamily: fonts.medium, ...typeScale.label },
  dot: { width: 3, height: 3, borderRadius: 99 },
  pills: { flexDirection: 'row', gap: space.inner },
  pill: { flex: 1 },
  others: { gap: space.inner },
  note: { fontFamily: fonts.regular, ...typeScale.small },
  heading: { fontFamily: fonts.medium, ...typeScale.small, paddingTop: space.inner },
});
