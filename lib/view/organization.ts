import type { components } from '@/lib/generated/platform-contracts/platform';

type WorkspaceSummary = components['schemas']['WorkspaceSummary'];

/**
 * What the Settings index's Organization row says on its right (the owner's
 * build 12 item 3: "Just like how owner is written in organization on the right
 * hand side can we put the organization name. That way the user knows as well
 * before clicking."), from the session alone — no request: the index reads only
 * the plan.
 *
 * In an organization, its name, whatever the person's role. In a personal
 * workspace, the organizations the session lists: the one by name, several as a
 * count, none as "None". The session lists a bounded first page of workspaces;
 * when it says its list is cut off and shows no organization, one may lie past
 * the cut, so nothing is said rather than a "None" that could be wrong.
 */
export function organizationValue(
  workspaces: readonly WorkspaceSummary[],
  active: WorkspaceSummary | undefined,
  truncated: boolean | undefined,
): string | undefined {
  if (active?.type === 'organization') return active.name;
  const organizations = workspaces.filter((workspace) => workspace.type === 'organization');
  if (organizations.length === 1) return organizations[0].name;
  if (organizations.length > 1) return `${organizations.length} organizations`;
  return truncated ? undefined : 'None';
}
