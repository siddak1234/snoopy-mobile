import type { OrganizationDomain } from '@/lib/platform/organization';

/** What the line reads of a domain. */
type JoinLinkDomain = Pick<OrganizationDomain, 'domain' | 'status' | 'joinPolicy' | 'discoveryEnabled'>;

/**
 * The line under Share join link (24.12, the owner's decision 5): what the link
 * does for the people it is for, in the website's words (`snoopy/lib/join-link.ts`).
 * The platform takes a request through the join page only from someone whose
 * verified email is at a domain the organization has verified AND shows for
 * matching emails (backend `requireEligibleDomain` needs both), and that
 * domain's joining policy decides what follows.
 */
export function joinLinkLine(domains: readonly JoinLinkDomain[]): string {
  const verified = domains.filter((entry) => entry.status === 'verified');
  const shown = verified.find((entry) => entry.discoveryEnabled);
  if (shown?.joinPolicy === 'automatic') {
    return `People at ${shown.domain} join as soon as they open it.`;
  }
  if (shown?.joinPolicy === 'invite_only') {
    return `Joining at ${shown.domain} is invite only, so the link lets no one in.`;
  }
  if (shown) {
    return `People at ${shown.domain} can ask to join. You approve them here.`;
  }
  // Verified, but not shown for matching emails: nobody at it can find the
  // organization, so the join page lets no one ask.
  const hidden = verified[0];
  if (hidden) {
    return `People at ${hidden.domain} cannot find it until "Show for matching verified email domains" is on.`;
  }
  return 'Verify your email domain first — only people at it can ask to join.';
}
