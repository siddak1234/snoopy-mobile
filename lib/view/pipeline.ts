import type { Icon } from 'phosphor-react-native';

/**
 * One step of an automation's pipeline, as the design draws it.
 *
 * The platform's source for this is `manifest.pipeline` — the declared steps a
 * run reports against, which `RunStep.stepId` must match. The manifest names its
 * icon as a string, so building one of these goes through `iconFor`.
 *
 * This is a view model, not a wire type: `icon` is a resolved component and the
 * copy is presentational. It lives here rather than in `lib/fixtures.ts` so the
 * components that render a step do not depend on the prototype's data module.
 */
export type PipelineStep = {
  icon: Icon;
  kicker: string;
  title: string;
  desc: string;
  /** Draws the "and more" affordance when a step summarises several actions. */
  more: boolean;
};
