/**
 * The account's answer to "AI reads your documents" (backend ADR-0038, BUILD-PLAN
 * 25.4.21; the owner's build 19 item 4: "Shouldnt this happen at the time of
 * signing up for the account on autom8x. Why are we asking users this at all
 * here."). Asked once, by a card after sign-in, of every account that has not
 * answered — new and existing — and changed in Settings. It replaces the
 * per-run "AI reads this file" dialog of 2026-10-13. The words are the spec's
 * (§3.G, §3.H), the website's byte for byte.
 */
export const AI_READING_TITLE = 'AI reads your documents';
export const AI_READING_BODY =
  "Some flows send a document you add to AI models, through OpenRouter, to read it. They don't keep it.";
/**
 * The line under it, around its link: "Privacy Policy" opens the website's
 * `/privacy` where the app knows the website's origin, and is plain words where
 * it does not.
 */
export const AI_READING_POLICY = ['See our ', 'Privacy Policy', '.'] as const;
export const AI_READING_ALLOW = 'Allow';
export const AI_READING_NOT_NOW = 'Not now';
export const AI_READING_CARD_FAILED = 'Could not save your choice. Try again.';

/** Settings › SECURITY, below Face ID: on is allowed. */
export const AI_READING_SETTING = 'AI reads documents';
export const AI_READING_SETTING_FAILED = 'Could not save. Try again.';

/** Under Start run, on a flow that uses AI, once the account said Not now. */
export const AI_READING_OFF = 'AI reading is off.';
export const AI_READING_TURN_ON = 'Turn on';
