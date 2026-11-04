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
