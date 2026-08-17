/**
 * The words the shared data states render, transcribed from the design.
 *
 * One grammar covers every fetching screen (`gLoad` / `gErr` / `gOff` in
 * `Screen.dc.html`): a skeleton in the screen's own layout, a failed load with
 * Retry and Go back, and an offline hero. Only the failed-load *title* differs
 * per screen, so only that is a map.
 *
 * The design ratified the boundary between the two kinds of failure, and it is
 * worth restating because it decides which treatment a screen reaches for:
 * `gErr` and `gOff` are **load** states, shown when there is nothing on screen
 * yet. A failure of an *action* on data that did load is **always inline** — a
 * callout naming what did not happen, with the data left in place. Nothing the
 * person was reading is destroyed in order to report an error.
 */

/** Screens that fetch, keyed as the design keys them. */
export type ScreenKey =
  | 'run'
  | 'detail'
  | 'approvals'
  | 'notifications'
  | 'settings'
  | 'flows'
  | 'activity'
  | 'solutions'
  | 'templates'
  | 'setup'
  | 'configure'
  | 'builder';

/** `gErrTitle` — the design names the thing that failed, never the mechanism. */
const ERROR_TITLES: Record<ScreenKey, string> = {
  run: "Couldn't load this run",
  detail: "Couldn't load this workflow",
  approvals: "Couldn't load approvals",
  notifications: "Couldn't load notifications",
  settings: "Couldn't load settings",
  flows: "Couldn't load your workflows",
  activity: "Couldn't load activity",
  solutions: "Couldn't load solutions",
  templates: "Couldn't load templates",
  setup: "Couldn't load this setup",
  configure: "Couldn't load this template",
  builder: "Couldn't load this workflow",
};

/** The design's own fallback for a screen not in the map. */
export const FALLBACK_ERROR_TITLE = "Couldn't load this";

export function errorTitleFor(screen: ScreenKey | string | undefined): string {
  if (!screen) return FALLBACK_ERROR_TITLE;
  return ERROR_TITLES[screen as ScreenKey] ?? FALLBACK_ERROR_TITLE;
}

/** Shared body copy — identical on every screen, so it is written once. */
export const ERROR_BODY =
  "Nothing was lost — it's safe in the cloud. Retry now or come back in a moment.";

export const OFFLINE_TITLE = "You're offline";
export const OFFLINE_BODY =
  "Your agents keep running in the cloud. This screen will sync as soon as you're back.";

export const RETRY_LABEL = 'Retry';
export const BACK_LABEL = 'Go back';
