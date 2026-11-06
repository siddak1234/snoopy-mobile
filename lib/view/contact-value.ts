/**
 * A list row's text that is exactly one email address or exactly one phone
 * number, whole (trimmed) — the owner's build 39 item 11: "For number when i
 * click or email it should pop up the call or save contact apple card thing".
 * A generic rule over any flow's rows, no flow's code: text holding anything
 * else — words around the value, two values, a date range such as
 * "2019 - 2021" — is not one, and stays plain text. Nor is a date
 * ("2026-11-06", "15.01.2021"), a space-grouped amount ("1 000 000") or bare
 * digits with no "+" or separator ("1234567890" may be an NPI or an invoice).
 */
export type ContactValue = { kind: 'email' | 'phone'; value: string };

const EMAIL = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[A-Za-z]{2,}$/;
// An optional "+" and country code, then groups of digits each split by at most
// one space, dot or hyphen; an area code may sit in brackets.
const PHONE = /^\+?(\d{1,3}[\s.-]?)?(\(\d{1,4}\)|\d{1,4})([\s.-]?\d{2,4}){1,4}$/;
/** E.164 allows at most 15 digits; fewer than 7 is not a number anyone dials. */
const PHONE_DIGITS = { min: 7, max: 15 } as const;
/** A date, year first or year last, split by "-", "." or "/". */
const DATE = /^(\d{4}[\s./-]\d{1,2}[\s./-]\d{1,2}|\d{1,2}[\s./-]\d{1,2}[\s./-]\d{4})$/;
/** An amount in groups of three: "1 000 000", "1.000.000". */
const THOUSANDS = /^\d{1,3}([\s.,]\d{3})+$/;

export function contactValue(text: string | null | undefined): ContactValue | null {
  const value = (text ?? '').trim();
  if (!value) return null;
  if (EMAIL.test(value)) return { kind: 'email', value };
  if (PHONE.test(value)) {
    const digits = value.replace(/\D/g, '').length;
    const plus = value.startsWith('+');
    if (!plus && (DATE.test(value) || THOUSANDS.test(value))) return null;
    // A year range ("2019-2021") is two groups and bare digits are one: a number is "+…" or three groups or more.
    const groups = value.split(/[\s.()-]+/u).filter(Boolean).length;
    const shaped = plus || groups >= 3;
    if (shaped && digits >= PHONE_DIGITS.min && digits <= PHONE_DIGITS.max) return { kind: 'phone', value };
  }
  return null;
}

/** The number as a `tel:` or `sms:` address takes it: its digits, a leading "+" kept. */
export function dialable(phone: string): string {
  const trimmed = phone.trim();
  return `${trimmed.startsWith('+') ? '+' : ''}${trimmed.replace(/\D/g, '')}`;
}
