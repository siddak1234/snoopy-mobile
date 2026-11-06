import {
  ACCEPTING_RUN,
  ACCEPT_AND_RUN,
  ACCEPT_AND_TURN_ON,
  AGREEMENT_NOT_PUBLISHED,
  ASK_OWNER_TO_ACCEPT,
  TURNING_ON,
} from '@/lib/content/health-agreement';
import { refusalMessage } from '@/lib/content/refusals';
import { PlatformError } from '@/lib/platform/problem';
import type { HealthDataAgreement, WorkspaceHealthDataAgreement } from '@/lib/platform/agreements';
import type { WorkspaceRole } from '@/lib/view/roles';

/**
 * A flow that carries health data, refused for the health data agreement
 * (Round 21 stage 2, C3; backend ADR-0049, `AgreementRequiredDetails`): a
 * run's start (`createRun`), an item's upload (`createItem`, which starts the
 * run that reads it) or a turn-on outside Set up (`updateSubscription` to
 * `live`, the flow page's Turn on; ADR-0049 amendment 2) answered 403
 * `agreement_required` and nothing was made or changed (~~its add~~ until
 * builds 37 and 39, wave 2: an add makes a draft, and Set up asks in its own
 * section, `contractStep`).
 *
 * - The workspace's owner, who alone accepts it, is shown the agreement on its
 *   own screen (`agreementPath`), its button by what is sent again
 *   (`acceptLabel`); once accepted, what was refused is sent again with the
 *   same idempotency key.
 * - Anyone else is told the one line, and nothing more is sent.
 * - No version published (`version` absent): the owner is told it is not
 *   available yet, and no screen opens.
 */

/**
 * What the agreement screen sends again once the owner accepts, its route's
 * `action`: the run that was refused (Start run, an item's upload), or the
 * turn-on (the flow page's Turn on) — the website dialog's `purpose`.
 * ~~`add`~~ until builds 37 and 39, wave 2.
 */
export type AgreementAction = 'run' | 'turn-on';

/**
 * The agreement screen's button, and its word while it sends: "Accept and
 * turn on" and "Turning on…" for a turn-on, else "Accept and start run" and
 * "Starting…" — an `action` this build does not know, or none, is a run's.
 */
export function acceptLabel(action: string | undefined, busy: boolean): string {
  if (action === 'turn-on') return busy ? TURNING_ON : ACCEPT_AND_TURN_ON;
  return busy ? ACCEPTING_RUN : ACCEPT_AND_RUN;
}

/**
 * Where the agreement opens: in the tab of the screen that was refused, so
 * Back — without accepting, or once accepted — stays in it. Home's own copy
 * for Home's YOUR FLOWS (`/(tabs)/(home)/agreement`); Settings' own copy for
 * the live flow page Settings' Archived flows opens (`/(tabs)/settings/agreement`);
 * else the Flows tab's (`/(tabs)/flows/agreement`), as `runStack` keeps a run
 * in its stack.
 */
export type AgreementPath = '/(tabs)/(home)/agreement' | '/(tabs)/settings/agreement' | '/(tabs)/flows/agreement';

export function agreementPath(segments: readonly string[]): AgreementPath {
  if (segments.includes('(home)')) return '/(tabs)/(home)/agreement';
  if (segments.includes('settings')) return '/(tabs)/settings/agreement';
  return '/(tabs)/flows/agreement';
}

export type AgreementRefusal = { open: true } | { open: false; line: string };

/** What a refusal asks of this person; null for any refusal that is not the agreement's. */
export function agreementRefusal(error: unknown, role: WorkspaceRole | undefined): AgreementRefusal | null {
  if (!(error instanceof PlatformError) || error.status !== 403 || error.details?.reason !== 'agreement_required') {
    return null;
  }
  if (role !== 'owner') return { open: false, line: ASK_OWNER_TO_ACCEPT };
  const version = error.details?.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    return { open: false, line: AGREEMENT_NOT_PUBLISHED };
  }
  return { open: true };
}

/** The longest name or title an acceptance takes (the contract's `AgreementAcceptanceRequest`: 1–120, the website's `maxLength`). */
export const SIGNER_FIELD_LIMIT = 120;

/**
 * A refused acceptance, in the website's words (its `acceptHealthAgreement`):
 * 403 — the person is no longer the workspace's owner, by its membership — the
 * line anyone but the owner is told; 503 `agreement_not_published` — no text
 * is current — that none is available yet; any other, the platform's words.
 */
export function acceptanceRefusal(error: unknown): string {
  if (error instanceof PlatformError && error.status === 503 && error.details?.reason === 'agreement_not_published') {
    return AGREEMENT_NOT_PUBLISHED;
  }
  if (error instanceof PlatformError && error.status === 403) return ASK_OWNER_TO_ACCEPT;
  return refusalMessage(error);
}

/**
 * The screen that was refused waits for the agreement screen's answer: one
 * ask at a time, held in memory for the process's life, as `return-to.ts`
 * holds a screen. `true` once the owner accepted; `false` when the screen was
 * left without it, or another ask replaced this one.
 */
let waiting: ((accepted: boolean) => void) | null = null;

/** Opens the agreement screen (`open`), and answers once it closes. */
export function awaitAgreement(open: () => void): Promise<boolean> {
  settleAgreement(false);
  return new Promise<boolean>((resolve) => {
    waiting = resolve;
    open();
  });
}

/** The agreement screen's answer, once: accepted, or left without accepting. Nothing waiting: nothing happens. */
export function settleAgreement(accepted: boolean): void {
  const resolve = waiting;
  waiting = null;
  resolve?.(accepted);
}

/**
 * Set up's "Contract and accept" section (builds 37 and 39, wave 2: the
 * owner's item 9, "Where is the BAA contract to view prefilled and checkmark
 * to accept below it … 4. Contract and accept"; backend ADR-0049 amendment 2),
 * for a flow whose catalog entry says `healthData`:
 *
 * - `hidden`: not a health flow — no section, Turn on as today;
 * - `unavailable`: a read failed — "Unavailable", Turn on disabled;
 * - `finalizing`: nothing published (`current` null, or the text's 503) —
 *   "The agreement is being finalized.", Turn on disabled;
 * - `accepted`: the workspace accepted the current version — its line and
 *   signer, Turn on enabled;
 * - `sign`: the owner, not accepted — the text to read, the box and the two
 *   fields; Turn on accepts first, then turns the flow on;
 * - `ask-owner`: an admin or member, not accepted — "Ask your workspace owner
 *   to accept the health data agreement.", Turn on disabled. A member is never
 *   read (403 by contract).
 *
 * In that order after `hidden`: the website's `contractStep`, row for row
 * (`__tests__/fb39-wave2.test.ts`, its `snoopy/test/fb39-wave2.test.mjs`).
 */
export type ContractStep = 'hidden' | 'unavailable' | 'finalizing' | 'accepted' | 'sign' | 'ask-owner';

export function contractStep(input: {
  role: WorkspaceRole | undefined;
  healthData: boolean | undefined;
  /** The workspace's acceptance read (owner or admin only); undefined when not read. */
  read: WorkspaceHealthDataAgreement | undefined;
  /** The text (the owner's, while not accepted); `unpublished` for its 503 `agreement_not_published`. */
  text: HealthDataAgreement | 'unpublished' | undefined;
  /** Any read refused or unanswered, but the text's 503. */
  readFailed: boolean;
}): ContractStep {
  const { role, healthData, read, text, readFailed } = input;
  if (healthData !== true) return 'hidden';
  if (readFailed) return 'unavailable';
  if ((read && read.current === null) || (role === 'owner' && text === 'unpublished')) return 'finalizing';
  if (read?.acceptance) return 'accepted';
  if (role === 'owner') return read && text && text !== 'unpublished' ? 'sign' : 'unavailable';
  return 'ask-owner';
}

/** Today's date as the platform writes it in the signed copy: UTC, `YYYY-MM-DD`. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The text as the owner reads it before signing (wave 2, plan 2): every
 * `{Covered Entity}` the workspace's name, every `{Effective date}` today's
 * (`todayUtc`). For display only: the sha256 sent is the unfilled text's, and
 * the platform fills the signed copy itself at acceptance.
 */
export function fillForDisplay(text: string, organization: string, todayIso: string): string {
  return text.replaceAll('{Covered Entity}', organization).replaceAll('{Effective date}', todayIso);
}
