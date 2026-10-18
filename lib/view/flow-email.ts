import { EMAIL_STARTER, andMore } from '@/lib/content/screen-states';
import type { FlowEmailRecipients } from '@/lib/platform/automations';

/**
 * Who a flow's run emails go to, as the app draws it (Build 22, P1 and P5; spec
 * §4; backend ADR-0041). The workspace's owners and admins and the person who
 * starts each run always get it — the session's D1, approved by the owner
 * (21:12Z) — and an owner or admin may add more addresses on the flow's email
 * screen.
 */

/**
 * One email address, as the platform checks it (`FlowEmailAddress` in the
 * contract's `automations.yaml`): one `@`, before it at most 64 characters with
 * no space or `<>,;"()[]\`, after it a domain with a dot. 3–254 characters.
 */
export const FLOW_EMAIL_PATTERN =
  /^[^\s@<>,;"()[\]\\]{1,64}@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/u;

/** Whether `address`, trimmed, is one the platform takes. */
export function isFlowEmail(address: string): boolean {
  const trimmed = address.trim();
  return trimmed.length >= 3 && trimmed.length <= 254 && FLOW_EMAIL_PATTERN.test(trimmed);
}

/** Every address listed, in order: the owners, then the admins (the platform's order), then the extra ones. */
export function listedAddresses(recipients: Pick<FlowEmailRecipients, 'people' | 'extra'>): string[] {
  return [...recipients.people.map((person) => person.email), ...recipients.extra];
}

/**
 * What an Add would be refused with, before anything is sent (the session's
 * S30): not an address, or one already listed — compared without case, as the
 * platform compares them.
 */
export function addProblem(
  address: string,
  recipients: Pick<FlowEmailRecipients, 'people' | 'extra'>,
): 'invalid' | 'duplicate' | null {
  if (!isFlowEmail(address)) return 'invalid';
  const wanted = address.trim().toLowerCase();
  return listedAddresses(recipients).some((listed) => listed.toLowerCase() === wanted) ? 'duplicate' : null;
}

/**
 * The flow page's step 5 row (the session's S22): the first address listed and
 * "and {n} more" for the rest. With nobody listed — a workspace whose members
 * this person may not read, and no extra address — the one who always gets it:
 * the person who starts the run.
 */
export function recipientsLine(recipients: Pick<FlowEmailRecipients, 'people' | 'extra'>): {
  first: string;
  more: string | null;
} {
  const listed = listedAddresses(recipients);
  if (listed.length === 0) return { first: EMAIL_STARTER, more: null };
  return { first: listed[0]!, more: listed.length > 1 ? andMore(listed.length - 1) : null };
}
