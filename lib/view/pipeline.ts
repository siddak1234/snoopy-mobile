import { GitBranch, Lightning, PlugsConnected, Sparkle, type Icon } from 'phosphor-react-native';

import type { components } from '@/lib/generated/platform-contracts/automations';

/**
 * One step of an automation's pipeline, as the design draws it.
 *
 * The platform's source is `manifest.pipeline`, published by Round 6.6 as
 * `AutomationCatalogEntry.pipeline`. This is a view model, not a wire type:
 * `icon` is a resolved component and the copy is presentational.
 */
export type PipelineStep = {
  /** Stable manifest-step identity; required by the published schema. */
  id: string;
  icon: Icon;
  kicker: string;
  title: string;
  desc: string;
  /**
   * Whether a connector is drawn below this step.
   *
   * True for every step but the last. The name is the prototype's and the
   * comment here used to claim it meant "this step summarises several actions",
   * which reading the two call sites disproves: `builder.tsx:85` and
   * `detail.tsx:109` both render a stem and a plus-circle *between* rows, and
   * the fixtures set it true-true-true-false on every four-step workflow. It is
   * a position, not a property of the step.
   */
  more: boolean;
};

export type DeclaredStep = components['schemas']['AutomationDeclaredStep'];

/**
 * Kicker → glyph, and an honest note about what is lost.
 *
 * `AutomationDeclaredStep` is `{id, kicker, title, description}` — it publishes
 * **no icon**, unlike `AutomationCatalogEntry`, which does. The design draws a
 * different glyph per step according to what the step *does*: an envelope for a
 * mail trigger, a clock for a scheduled one, a table for a Sheets read. A
 * kicker-keyed map cannot reproduce that, because three kickers cannot carry
 * that many distinctions. This is the closest faithful render available, and the
 * gap is filed in DESIGN-CONTRACT.md rather than papered over.
 */
const KICKER_ICON: Record<string, Icon> = {
  TRIGGER: Lightning,
  'AI STEP': Sparkle,
  ACTION: PlugsConnected,
};

/**
 * Unknown kickers render rather than throw.
 *
 * The enum is closed at `[TRIGGER, AI STEP, ACTION]`, so an unrecognised value
 * means the platform widened it — which is a reviewed change this client may
 * hear about late. `BRANCH` is the live case: the design draws it and the enum
 * cannot express it (DESIGN-CONTRACT.md), so it arrives here if it arrives at all.
 */
const FALLBACK_ICON: Icon = GitBranch;

export function toPipelineStep(step: DeclaredStep, isLast: boolean): PipelineStep {
  return {
    id: step.id,
    icon: KICKER_ICON[step.kicker] ?? FALLBACK_ICON,
    kicker: step.kicker,
    title: step.title,
    desc: step.description,
    more: !isLast,
  };
}

/** `manifest.pipeline`, in manifest order, as the design's step rows. */
export function toPipelineSteps(steps: DeclaredStep[] | undefined): PipelineStep[] {
  if (!steps) return [];
  return steps.map((step, i) => toPipelineStep(step, i === steps.length - 1));
}

export type StepGroup = components['schemas']['AutomationStepGroup'];

/** One row of a flow page's STEPS: "1 · Received", and what happens in it. */
export type FlowStepRow = { id: string; label: string; sub: string };

/**
 * A flow page's STEPS (the Invoice Processing update, spec §3.D; the owner's
 * build 19 item 7: "This flow is so long and messed up"): numbered rows, the
 * number in the label — one per visible group where the manifest declares them
 * (backend ADR-0037: "Received · Read · Checked · Done · Emailed" for Invoice
 * Processing v2), else one per step — each with what it does under it. No
 * kickers ("TRIGGER", "AI STEP", "ACTION"), no step cards.
 */
export function flowStepRows(
  steps: readonly DeclaredStep[] | undefined,
  groups: readonly StepGroup[] | undefined,
): FlowStepRow[] {
  if (groups && groups.length > 0) {
    return groups.map((group, index) => ({ id: group.id, label: `${index + 1} · ${group.title}`, sub: group.description }));
  }
  return (steps ?? []).map((step, index) => ({ id: step.id, label: `${index + 1} · ${step.title}`, sub: step.description }));
}
