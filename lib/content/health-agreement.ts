/**
 * The health data agreement's words (Round 21 stage 2, C3; backend ADR-0049):
 * the acceptance screen an owner meets when a flow that carries health data is
 * added or run before the workspace accepted the agreement, and the
 * organization's Documents list. The session's NEW WORDS for the owner, the
 * same on the website; the owner may change them.
 */

/** The acceptance screen's title. */
export const AGREEMENT_TITLE = 'Health data agreement';

/** Under the title: the version the text is. */
export function agreementVersion(version: number): string {
  return `Version ${version}`;
}

/** The checkbox: the person confirms they may sign for the workspace. */
export function authorizedFor(organization: string): string {
  return `I'm authorized to sign for ${organization}`;
}

export const SIGNER_NAME_LABEL = 'Full name';
export const SIGNER_TITLE_LABEL = 'Title';

/** The button: it accepts, then sends again what was refused — an add, or a run's start. */
export const ACCEPT_AND_ADD = 'Accept and add flow';
export const ACCEPT_AND_RUN = 'Accept and start run';

/**
 * Said in the button's place while the acceptance is sent, and then the add or
 * the run: the website's words, and the app's own for Turn on's add and Start
 * run (~~"Working…", Connections' word~~ until the review's finding 3).
 */
export const ACCEPTING_ADD = 'Adding…';
export const ACCEPTING_RUN = 'Starting…';

/** Said to anyone but the workspace's owner, who alone accepts it; nothing more is sent. */
export const ASK_OWNER_TO_ACCEPT = 'Ask your workspace owner to accept the health data agreement.';

/** No version is published yet (a lawyer has not approved the text): nothing can be accepted. */
export const AGREEMENT_NOT_PUBLISHED = "The health data agreement isn't available yet.";

/** The organization's Documents section, in the app's capitals ("Documents" on the website). */
export const DOCUMENTS_LABEL = 'DOCUMENTS';

/** A signed health data agreement's row, and its copy's title: which agreement, and its version. */
export function documentTitle(version: number): string {
  return `Business Associate Agreement · Version ${version}`;
}

/** Under it: who accepted it, and the day. */
export function acceptedBy(name: string, date: string): string {
  return `Accepted by ${name} on ${date}`;
}

/** The Documents section with nothing signed. */
export const NO_DOCUMENTS = 'No documents yet.';
