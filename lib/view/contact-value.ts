/**
 * A list row's text that is exactly one email address or exactly one phone
 * number, whole — the owner's build 39 item 11: "For number when i click or
 * email it should pop up the call or save contact apple card thing". A generic
 * rule over any flow's rows, no flow's code. The website's
 * `snoopy/lib/contact-value.ts` holds the same rule and the same test table.
 *
 * The rule: the text trimmed, at most 254 characters.
 * - An email: `EMAIL`, the website's pattern → `mailto:{value}`.
 * - A phone: only "+", digits, spaces, ".", "-", "(" and ")", the "+" first if
 *   any; 10 to 15 digits, or 8 to 15 when it starts with "+". Without a "+",
 *   every run of digits after the first has at least 3 digits and the last at
 *   least 4 (so a date, a time, an IP address or "123-45-6789" is not one) →
 *   `tel:` + the "+" it starts with + its digits (`dialable`).
 * - Anything else — words around the value, two values — is not one and stays
 *   plain text.
 */
export type ContactValue = { kind: 'email' | 'phone'; value: string };

const MAX_LENGTH = 254;
const EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/u;
const PHONE = /^\+?[\d\s().-]+$/u;
const PHONE_DIGITS = { min: 10, minWithPlus: 8, max: 15 } as const;

export function contactValue(text: string | null | undefined): ContactValue | null {
  const value = (text ?? '').trim();
  if (!value || value.length > MAX_LENGTH) return null;
  if (EMAIL.test(value)) return { kind: 'email', value };
  if (!PHONE.test(value)) return null;
  const plus = value.startsWith('+');
  const runs = value.match(/\d+/gu) ?? [];
  const digits = runs.join('').length;
  if (digits < (plus ? PHONE_DIGITS.minWithPlus : PHONE_DIGITS.min) || digits > PHONE_DIGITS.max) return null;
  if (!plus && (runs.slice(1).some((run) => run.length < 3) || (runs[runs.length - 1] ?? '').length < 4)) return null;
  return { kind: 'phone', value };
}

/** The number as a `tel:` or `sms:` address takes it: its digits, a leading "+" kept. */
export function dialable(phone: string): string {
  const trimmed = phone.trim();
  return `${trimmed.startsWith('+') ? '+' : ''}${trimmed.replace(/\D/g, '')}`;
}
