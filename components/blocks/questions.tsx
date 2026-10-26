import React from 'react';
import { View } from 'react-native';

import { Fallback } from './fallback';
import type { BlockOf } from './look';

type QuestionForm = BlockOf<'questions'>['form'];
export type FormKind = QuestionForm['kind'];

/**
 * The page's own forms, each drawn by the component that draws it today, with
 * the page's context and gates (backend ADR-0048 decision 2): approval by
 * `DecisionButtons`, run by `StartRun`, item by the item upload dialog, setup
 * by `SetupField`. A form the page does not offer draws nothing.
 */
export type BlockForms = Partial<Record<FormKind, (form: QuestionForm) => React.ReactNode>>;

const KNOWN_FORMS: readonly string[] = ['approval', 'run', 'item', 'setup'];

/** questions: the page's own form for it — nothing where the page offers none; a form this build does not know, the fallback. */
export function QuestionsBlock({
  block,
  testID,
  forms,
}: {
  block: BlockOf<'questions'>;
  testID: string;
  forms: BlockForms | undefined;
}) {
  const kind: unknown = (block.form as { kind?: unknown } | undefined)?.kind;
  if (typeof kind !== 'string' || !KNOWN_FORMS.includes(kind)) return <Fallback testID={`${testID}-fallback`} />;
  const form = forms?.[kind as FormKind];
  return form ? <View testID={`${testID}-${kind}`}>{form(block.form)}</View> : null;
}
