/**
 * An email's domain, for what the screen offers — ported from
 * `snoopy/lib/domain-utils.ts`. Presentation only: which organizations a person
 * can find, and what a domain may claim, are the platform's answers.
 */
const PUBLIC_DOMAINS: readonly string[] = [
  'gmail.com',
  'outlook.com',
  'yahoo.com',
  'hotmail.com',
  'icloud.com',
  'aol.com',
  'protonmail.com',
  'live.com',
  'msn.com',
  'me.com',
  'googlemail.com',
  'ymail.com',
  'yahoo.co.uk',
  'outlook.co.uk',
  'mail.com',
  'zoho.com',
  'gmx.com',
  'fastmail.com',
  'tutanota.com',
  'hey.com',
];

/** `acme.co` from `alex@acme.co`; empty for anything that is not an address. */
export function emailDomain(email: string | null | undefined): string {
  if (typeof email !== 'string') return '';
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1) return '';
  const domain = trimmed.slice(at + 1);
  if (!domain || !domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return '';
  return domain;
}

/** A mailbox provider's domain, which no organization can be set up on. */
export function isPublicDomain(domain: string): boolean {
  return PUBLIC_DOMAINS.includes(domain.trim().toLowerCase());
}
