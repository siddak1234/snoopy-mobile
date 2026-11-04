/**
 * Connecting an EHR (Round 21 stage 2, D1; backend ADR-0050): a SMART Backend
 * Services provider's connect refused 400 with a `details.reason` a person can
 * act on, in the session's NEW WORDS, the same on the website.
 *
 * Two of the three are not here: `fhir_address_refused` ("Use the https address
 * your EHR … gave you.") and `ehr_not_activated` ("… Ask your EHR … to activate
 * it.") name the clinic's staff with the word `audit:vocabulary` keeps out of
 * every screen, so they keep the platform's words until the owner words them
 * again (DESIGN-GAPS, stage 2 D1).
 */
export const EHR_CONNECT_REFUSALS: Readonly<Record<string, string>> = {
  fhir_not_answering: "That address didn't answer as a FHIR server.",
};
