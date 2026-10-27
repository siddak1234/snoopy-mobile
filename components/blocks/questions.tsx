import React from 'react';
import { View } from 'react-native';

import { SectionTitle } from '@/components/nocturne/section-label';

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

/**
 * What a questions block draws: `unknown` for a form this build does not know
 * (the fallback), else the page's own form for it — null where the page offers
 * none, or its form draws nothing (a member, a flow not live). The block list
 * asks first, so a block that draws nothing takes no room either.
 */
export function questionsForm(block: BlockOf<'questions'>, forms: BlockForms | undefined): React.ReactNode | 'unknown' {
  const kind: unknown = (block.form as { kind?: unknown } | undefined)?.kind;
  if (typeof kind !== 'string' || !KNOWN_FORMS.includes(kind)) return 'unknown';
  const form = forms?.[kind as FormKind];
  const drawn = form ? form(block.form) : null;
  return drawn === null || drawn === undefined || drawn === false ? null : drawn;
}

/**
 * questions: the page's own form for it (`questionsForm`), under its title
 * ("Add candidate") as a title over what it heads (`SectionTitle`, `title`
 * above the form, as "CANDIDATES" is above its list: the owner's build 30 note
 * F3; ~~the label block's look, flush on the form~~ until Round 21); a form
 * this build does not know, the fallback.
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
  if (drawn === 'unknown') return <Fallback testID={`${testID}-fallback`} />;
  if (drawn === null) return null;
  const kind = (block.form as { kind: FormKind }).kind;
  return (
    <View testID={`${testID}-${kind}`}>
      {block.title ? <SectionTitle testID={`${testID}-title`}>{block.title}</SectionTitle> : null}
      {drawn}
    </View>
  );
}
