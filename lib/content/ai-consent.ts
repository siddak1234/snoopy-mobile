/**
 * The consent asked before AI reads a run's file — Apple's App Review Guideline
 * 5.1.2(i): "You must clearly disclose where personal data will be shared with
 * third parties, including with third-party AI, and obtain explicit permission
 * before doing so." A flow that has AI read its run's file sends the file to
 * OpenRouter, which passes it to a model's provider (the Privacy Policy's
 * "Documents read by AI").
 *
 * The words live here, in one module, so the website can say them byte for
 * byte. `AI_CONSENT_VERSION` names them: a person agrees to a version, and words
 * that say something new are a new version, asked for again
 * (`lib/platform/ai-consent-store.ts`).
 */
export const AI_CONSENT_VERSION = 1;

export const AI_CONSENT_TITLE = 'AI reads this file';
export const AI_CONSENT_BODY =
  'To read the file you give this run, Autom8x sends it to OpenRouter, which passes it to an AI model provider in the United States, using only endpoints that OpenRouter lists as zero data retention.';
/**
 * The second line, around its link: "Privacy Policy" opens the website's
 * `/privacy` where the app knows the website's origin, and is plain words where
 * it does not.
 */
export const AI_CONSENT_POLICY = ['Our ', 'Privacy Policy', ' names the providers and explains what may be kept.'] as const;
export const AI_CONSENT_AGREE = 'Agree and start';
export const AI_CONSENT_CANCEL = 'Cancel';
