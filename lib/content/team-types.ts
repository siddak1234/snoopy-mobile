/**
 * The kinds of team a person picks from when creating one (the owner, build 7:
 * "project types should just be teams or departments" — the list confirmed
 * 2026-10-02; BUILD-PLAN 24.11.7). "Other" opens a field for their own words.
 * The platform stores the kind as text (`ProjectSummary.type`, 1–120
 * characters), so a kind not on this list is still a team's own.
 */
export const TEAM_TYPES = [
  'HR',
  'Accounting',
  'Finance',
  'Legal',
  'Compliance',
  'Data',
  'Operations',
  'Sales',
  'Marketing',
  'Customer Support',
  'IT',
  'Engineering',
  'Product',
  'Procurement',
  'Administration',
  'Research',
] as const;

export const OTHER_TEAM_TYPE = 'Other';
