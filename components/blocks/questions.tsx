import React from 'react';
import { View } from 'react-native';

import { SectionTitle } from '@/components/nocturne/section-label';
import { ReviewDecisions } from '@/components/runs/review-decisions';
import { offeredDecisions } from '@/lib/view/runs';

import { NotDrawnFallback } from './fallback';
import type { BlockOf } from './look';

type QuestionForm = BlockOf<'questions'>['form'];
/** The generated kinds: `approval`, `run`, `item`, `setup`, and `review` (block set 3). */
export type FormKind = QuestionForm['kind'];

/**
 * The page's own forms, each drawn by the component that draws it today, with
 * the page's context and gates (backend ADR-0048 decision 2): approval by
 * `DecisionButtons`, run by `StartRun`, item by the item upload dialog, setup
 * by `SetupField`, review (Round 21's platform round, F2; ADR-0048 amendment 2) by
 * `ReviewDecisions`. A form the page does not offer draws nothing.
 */
export type BlockForms = Partial<Record<FormKind, (form: QuestionForm) => React.ReactNode>>;

const KNOWN_FORMS: readonly string[] = ['approval', 'run', 'item', 'setup', 'review'] satisfies readonly FormKind[];

/**
 * What a questions block draws: `unknown` for a form this build does not know
 * (the fallback), else the page's own form for it — null where the page offers
 * none, or its form draws nothing (a member, a flow not live) — but a review's
 * rows, which everyone reads, are drawn read-only then. The block list
 * asks first, so a block that draws nothing takes no room either.
 */
export function questionsForm(block: BlockOf<'questions'>, forms: BlockForms | undefined): React.ReactNode | 'unknown' {
  const kind: unknown = (block.form as { kind?: unknown } | undefined)?.kind;
  if (typeof kind !== 'string' || !KNOWN_FORMS.includes(kind)) return 'unknown';
  const form = forms?.[kind as FormKind];
  const drawn = form ? form(block.form) : null;
  if (drawn !== null && drawn !== undefined && drawn !== false) return drawn;
  // A review's rows are read by everyone (words.md section 3; the block fixture
  // `review-held-waiting`): where the page draws no form for them, read-only.
  const changes = kind === 'review' ? offeredDecisions(block.form) : [];
  return changes.length > 0 ? <ReviewDecisions testID="review-rows" changes={changes} readOnly /> : null;
}

/**
 * questions: the page's own form for it (`questionsForm`), under its title
 * ("Add candidate") as a title over what it heads (`SectionTitle`, `title`
 * above the form, as "CANDIDATES" is above its list: the owner's build 30 note
 * F3; ~~the label block's look, flush on the form~~ until Round 21); a form
 * this build does not know, the fallback, logged as `questions`, `form.kind`
 * (`NotDrawnFallback`), as the website logs it.
 */
export function QuestionsBlock({
  block,
  testID,
  forms,
}: {
  block: BlockOf<'questions'>;
  testID: string;
  forms: BlockForms | undefined;
}) {
  const drawn = questionsForm(block, forms);
  if (drawn === 'unknown') return <NotDrawnFallback type="questions" error="form.kind" testID={`${testID}-fallback`} />;
  if (drawn === null) return null;
  const kind = (block.form as { kind: FormKind }).kind;
  return (
    <View testID={`${testID}-${kind}`}>
      {block.title ? <SectionTitle testID={`${testID}-title`}>{block.title}</SectionTitle> : null}
      {drawn}
    </View>
  );
}
