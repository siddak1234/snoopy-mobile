/**
 * The health data agreement's words (Round 21 stage 2, C3; backend ADR-0049):
 * Set up's "Contract and accept" section for a flow that carries health data
 * (builds 37 and 39, wave 2: the owner's item 9, "Where is the BAA contract to
 * view prefilled and checkmark to accept below it"), the acceptance screen an
 * owner meets when such a flow's run is started before the workspace accepted
 * the agreement (~~or its add~~ until wave 2), and the organization's Documents
 * list. The session's NEW WORDS for the owner, the same on the website; the
 * owner may change them.
 */

/** Set up's section for the agreement, after the flow's own (wave 2, plan 5). */
export const CONTRACT_SECTION = 'Contract and accept';

/** Nothing published yet (`current` null): Turn on waits for it. */
export const AGREEMENT_FINALIZING = 'The agreement is being finalized.';

/** The workspace accepted the current version: which, and the day (`calendarDate`). */
export function agreementAccepted(version: number, date: string): string {
  return `Accepted · Version ${version} · ${date}`;
}

/** Under it: who signed, and as what. */
export function signerLine(name: string, title: string): string {
  return `${name}, ${title}`;
}

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

/**
 * The button: it accepts, then sends again the run's start that was refused
 * (~~"Accept and add flow"~~ until wave 2: Set up accepts in its own section).
 */
export const ACCEPT_AND_RUN = 'Accept and start run';

/**
 * Said in the button's place while the acceptance is sent, and then the run:
 * the website's words (~~"Working…", Connections' word~~ until the review's
 * finding 3; ~~"Adding…" for Turn on's add~~ until wave 2).
 */
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
