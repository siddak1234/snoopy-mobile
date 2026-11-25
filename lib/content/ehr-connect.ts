/**
 * Connecting an EHR (Round 21 stage 2, D1; backend ADR-0050): a SMART Backend
 * Services provider's connect refused 400 with a `details.reason` a person can
 * act on, in the session's NEW WORDS, the same on the website — all three, so
 * none says the platform's "Bad Request". "EHR team" is the clinic's own EHR
 * staff, not a department: `audit:vocabulary` allows that exact phrase.
 */
export const EHR_CONNECT_REFUSALS: Readonly<Record<string, string>> = {
  fhir_address_refused: 'Use the https address your EHR team gave you.',
  fhir_not_answering: "That address didn't answer as a FHIR server.",
  ehr_not_activated: "Your EHR hasn't turned on Autom8x yet. Ask your EHR team to activate it.",
};

/**
 * Signing in to an EHR (Round 22; backend ADR-0054, `smart-launch`): the
 * reasons a sign-in is refused with, in the words the backend's
 * `snoopy-backend/docs/openapi/connections.yaml` defines once — `authorize`'s 400
 * (`fhir_address_refused`, `fhir_not_answering`, `ehr_sign_in_unsupported`)
 * and the callback's (`no_refresh_token` and the same two addresses), which
 * reach the app as `/v1/connections/native/complete`'s 401 with that reason.
 * The website's `EHR_SIGN_IN_REFUSALS` and `EHR_SIGN_IN_RETURNS`, in one table
 * here, since the app reads both as a refusal's `details.reason`.
 * `credential_invalid` has no words there and keeps the platform's.
 */
export const EHR_SIGN_IN_REFUSALS: Readonly<Record<string, string>> = {
  fhir_address_refused: EHR_CONNECT_REFUSALS.fhir_address_refused!,
  fhir_not_answering: EHR_CONNECT_REFUSALS.fhir_not_answering!,
  ehr_sign_in_unsupported: "That EHR doesn't offer the sign-in Autom8x uses. Ask your EHR team.",
  no_refresh_token: 'Your EHR team needs to allow a lasting sign-in for Autom8x. Ask them, then sign in again.',
};

/**
 * `authorize`'s 409 `account_mismatch` (ADR-0054): another FHIR address than
 * the one the workspace is signed in to. Nothing was started. connections.yaml
 * says it as one line, the refusal and its question; the form asks the
 * question — its button Replace (`EHR_REPLACE`, the session's word, as the
 * website's), which begins again with the form's values naming the
 * workspace's connection — only when it holds that connection's id, and says
 * the refusal alone when it does not (the session's parity decision D3).
 */
export const EHR_ACCOUNT_MISMATCH_REFUSAL = 'This workspace is signed in to another EHR address.';
export const EHR_ACCOUNT_MISMATCH = `${EHR_ACCOUNT_MISMATCH_REFUSAL} Replace it?`;
export const EHR_REPLACE = 'Replace';

/** The sign-in form's button before a vendor is chosen (`signInLabel`; D1), the website's `SIGN_IN`. */
export const EHR_SIGN_IN = 'Sign in';

/**
 * The sign-in form's button while it goes: "Working…", the website's word
 * (the session's parity decision D2). ~~"Signing in…"~~ until the review of
 * Round 22's app lane.
 */
export const EHR_WORKING = 'Working…';
