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
import type { AnsweredDecision, DecisionAnswer, OfferedDecision } from '@/lib/platform/automations';
import { reviewGroups } from '@/lib/view/runs';

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
 * still needs every answer. `headings={false}` draws them as one list: the
 * page body's read-only rows, whose words are the block fixtures' (their
 * `review-held-grouped` reads no heading; DESIGN-GAPS, Round 21 platform
 * round 2).
 *
 * testIDs: a heading `${testID}-group-${n}`, a row `${testID}-row-${id}`, its pills `${testID}-accept-${id}` and
 * `${testID}-deny-${id}`, `${testID}-unanswered`, `${testID}-save`.
 */
export function ReviewDecisions({
  testID,
  changes,
  saving = false,
  onSave,
  readOnly = false,
  headings = true,
}: {
  testID: string;
  changes: readonly OfferedDecision[];
  saving?: boolean;
  onSave?: (answers: AnsweredDecision[]) => void;
  readOnly?: boolean;
  /** Draw each group's heading over its changes (B3); false, one list in the order sent. */
  headings?: boolean;
}) {
  const { palette } = useTheme();
  const [answers, setAnswers] = useState<Record<string, DecisionAnswer>>({});
  const answer = (id: string, decision: DecisionAnswer) => setAnswers((before) => ({ ...before, [id]: decision }));
  const complete = changes.every((change) => answers[change.id] !== undefined);

  /** One change: its line, and its two pills unless read-only. */
  const drawRow = (change: OfferedDecision) => {
    const chosen = answers[change.id];
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
        {readOnly ? null : (
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
        )}
      </View>
    );
  };

  const groups = headings ? reviewGroups(changes) : [{ heading: null, changes: [...changes] }];

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
          onPress={() => onSave?.(changes.map((change) => ({ id: change.id, decision: answers[change.id]! })))}
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
  note: { fontFamily: fonts.regular, ...typeScale.small },
  heading: { fontFamily: fonts.medium, ...typeScale.small, paddingTop: space.inner },
});
