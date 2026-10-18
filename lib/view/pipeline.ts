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

/** What a step's title is read from: its id and title, and since Build 22 its title by connection and its platform. */
export type StepHeading = Pick<StepGroup, 'id' | 'title'> & Partial<Pick<StepGroup, 'titleByConnection' | 'platform'>>;

/** A setup field as the steps read it: its key, its control, the step it names and its default. */
export type StepField = { key: string; control: string; group?: string; defaultValue?: unknown };

/**
 * What a connection setting holds now (backend ADR-0037): the flow's saved
 * value under `key`, else the field's default, else `none` — the rule
 * `chosenVendor` (`components/setup-field.tsx`) applies to a field it has.
 */
export function chosenProvider(
  key: string,
  field: { defaultValue?: unknown } | undefined,
  config: Readonly<Record<string, unknown>> | undefined,
): string {
  const value = config?.[key] ?? field?.defaultValue;
  return typeof value === 'string' && value !== '' ? value : 'none';
}

/**
 * A step's title (Build 22; backend ADR-0041): its `titleByConnection` entry for
 * the provider its connection setting holds now, else its own title — Invoice
 * Processing v4's step 4 is "QuickBooks updated" while QuickBooks is chosen and
 * "Details saved" with None (the session's D3, approved by the owner 21:12Z).
 * With the flow's settings unknown (`config` absent) it is the step's own title.
 */
export function stepTitle(
  group: StepHeading,
  setup: readonly StepField[],
  config: Readonly<Record<string, unknown>> | undefined,
): string {
  const byConnection = group.titleByConnection;
  if (!byConnection || !config) return group.title;
  const chosen = chosenProvider(
    byConnection.field,
    setup.find((field) => field.key === byConnection.field),
    config,
  );
  return byConnection.titles.find((entry) => entry.providerId === chosen)?.title ?? group.title;
}

/**
 * What one row of a flow page's STEPS holds (Build 22, spec §4's generic rules,
 * the same in both clients; backend ADR-0041):
 *
 * - `steps` — a group pipeline steps name (or, without groups, one step):
 *   nothing under its title but Step 1's controls on the row that takes the
 *   run's input;
 * - `setting` — a group no pipeline step names and with no `platform`: the
 *   setup fields that name it (Invoice Processing v4's "Connect integration",
 *   its `vendor` field drawn as the integration row);
 * - `email` — the platform's own email step (`platform: email`): who gets it;
 * - `platform` — a `platform` this build does not know: its title only.
 */
export type FlowStepKind = 'steps' | 'setting' | 'email' | 'platform';

/** One row of a flow page's STEPS: "1 · Upload invoice" — titles only since Build 22 (the session's S20). */
export type FlowStepRow = {
  id: string;
  label: string;
  kind: FlowStepKind;
  /** The row that takes the run's input: Step 1's document and Start run. */
  input: boolean;
  /** A setting step's fields, by key, in the manifest's order. */
  fields: string[];
};

/**
 * A flow page's STEPS (Build 22, P1; the owner's build 21 item 5: "1. Upooad
 * Invoice / 2. Connect integration … / 3. Then something about AI Processing /
 * 4. Quickbooks updated / 5. Email sent"): numbered rows, one per visible group
 * where the manifest declares them, else one per step, each its title only.
 *
 * The input row is the trigger's group (the pipeline's TRIGGER step, else its
 * first), or without groups the first step. A setup field with no `group` is
 * not drawn here — it is on Set up (spec §4). ~~A field naming no step drawn
 * under the steps (`unplaced`), and each group's description under its
 * title~~ until Build 22.
 */
export function flowStepPlan(
  steps: readonly DeclaredStep[] | undefined,
  groups: readonly StepHeading[] | undefined,
  setup: readonly StepField[],
  config: Readonly<Record<string, unknown>> | undefined,
): FlowStepRow[] {
  if (!groups || groups.length === 0) {
    return (steps ?? []).map((step, index) => ({
      id: step.id,
      label: `${index + 1} · ${step.title}`,
      kind: 'steps',
      input: index === 0,
      fields: [],
    }));
  }
  const named = new Set((steps ?? []).flatMap((step) => (step.group ? [step.group] : [])));
  const trigger = (steps ?? []).find((step) => step.kicker === 'TRIGGER') ?? steps?.[0];
  const inputId = groups.find((group) => group.id === trigger?.group)?.id ?? groups[0]!.id;
  return groups.map((group, index) => {
    const kind: FlowStepKind =
      group.platform !== undefined
        ? group.platform === 'email'
          ? 'email'
          : 'platform'
        : named.has(group.id)
          ? 'steps'
          : 'setting';
    return {
      id: group.id,
      label: `${index + 1} · ${stepTitle(group, setup, config)}`,
      kind,
      input: group.id === inputId,
      fields: kind === 'setting' ? setup.filter((field) => field.group === group.id).map((field) => field.key) : [],
    };
  });
}
