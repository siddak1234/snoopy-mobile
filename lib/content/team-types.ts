import {
  Bank,
  Briefcase,
  Calculator,
  Code,
  Cube,
  Database,
  Desktop,
  Flask,
  Gavel,
  Gear,
  Handshake,
  Headset,
  Megaphone,
  ShieldCheck,
  ShoppingCart,
  SquaresFour,
  Users,
  UsersThree,
  type Icon,
} from 'phosphor-react-native';

import type { components } from '@/lib/generated/platform-contracts/automations';

/** The platform's fixed list of categories, each a team kind (backend ADR-0036). */
type CatalogCategory = components['schemas']['AutomationCatalogEntry']['category'];

/**
 * The kinds of team (the owner, build 7: "project types should just be teams or
 * departments" — the list confirmed 2026-10-02; BUILD-PLAN 24.11.7). Since the
 * Invoice Processing update (backend ADR-0036, 2026-10-14) they are the
 * platform's fixed list of flow categories too: a flow goes to the team of its
 * category, which the platform makes when first needed, so no one here creates
 * a team or picks one. Typed against the generated category union both ways, so
 * a kind the platform adds, drops or respells fails `npm run typecheck`.
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
] as const satisfies readonly CatalogCategory[];

export type TeamType = (typeof TEAM_TYPES)[number];

/** Every category the platform publishes is a kind on this list: `true` only while the two agree. */
export const TEAM_TYPES_COVER_EVERY_CATEGORY: [CatalogCategory] extends [TeamType] ? true : never = true;

/**
 * Each kind's icon (the owner's build 13 decision 2, 2026-10-06): Home's team
 * button is an icon only, so the icon is the kind. Typed by the list, so a kind
 * added to it without an icon fails `npm run typecheck`.
 */
export const TEAM_TYPE_ICONS: Record<TeamType, Icon> = {
  HR: Users,
  Accounting: Calculator,
  Finance: Bank,
  Legal: Gavel,
  Compliance: ShieldCheck,
  Data: Database,
  Operations: Gear,
  Sales: Handshake,
  Marketing: Megaphone,
  'Customer Support': Headset,
  IT: Desktop,
  Engineering: Code,
  Product: Cube,
  Procurement: ShoppingCart,
  Administration: Briefcase,
  Research: Flask,
};

/** "Other", and any kind in a person's own words. */
export const OTHER_TEAM_ICON: Icon = UsersThree;

/** No team chosen: "All teams". */
export const ALL_TEAMS_ICON: Icon = SquaresFour;

// Keyed as the platform compares kinds, ignoring case (a team's `type` is
// "unique in the workspace … ignoring case", `CreateProjectRequest`). A Map, not
// the record, so a kind in a person's own words ("constructor") finds no
// Object.prototype member.
const ICON_BY_KIND = new Map<string, Icon>(
  Object.entries(TEAM_TYPE_ICONS).map(([kind, icon]) => [kind.toLowerCase(), icon]),
);

/** A team's icon by its kind, compared as the platform compares kinds; one off the list draws Other's. */
export function teamTypeIcon(type: string): Icon {
  return ICON_BY_KIND.get(type.trim().toLowerCase()) ?? OTHER_TEAM_ICON;
}
