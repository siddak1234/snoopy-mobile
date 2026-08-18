import {
  ArrowClockwise,
  BellRinging,
  Camera,
  ChartLine,
  CheckCircle,
  CircleDashed,
  CrownSimple,
  EnvelopeOpen,
  EnvelopeSimple,
  GitBranch,
  HandPalm,
  Lightning,
  PlugsConnected,
  Receipt,
  SlackLogo,
  Sparkle,
  Table,
  Timer,
  Tray,
  UserPlus,
  UsersThree,
  XCircle,
  type Icon,
} from 'phosphor-react-native';

/**
 * The backend's `icon` string, resolved to a component.
 *
 * `AutomationCatalogEntry.icon` is documented in the contract as "An icon name
 * the clients resolve. Never an asset URL." The prototype's fixtures instead
 * held a live Phosphor component on every entity, which no API can send — so
 * this registry is the seam between the two.
 *
 * The map is explicit rather than a namespace import of `phosphor-react-native`.
 * A namespace import would resolve every possible name at the cost of bundling
 * the entire icon set into the app; these are the icons the design actually
 * draws, and they stay tree-shakeable.
 *
 * An unknown name resolves to `FALLBACK_ICON` rather than throwing. Manifests
 * are reviewed data files owned by the backend, and a new automation naming an
 * icon this build has never heard of must render as an automation, not a crash.
 */

/** Neutral placeholder — reads as "something is here" without asserting what. */
const FALLBACK_ICON: Icon = CircleDashed;

const ICONS: Record<string, Icon> = {
  ArrowClockwise,
  BellRinging,
  Camera,
  ChartLine,
  CheckCircle,
  CircleDashed,
  CrownSimple,
  EnvelopeOpen,
  EnvelopeSimple,
  GitBranch,
  HandPalm,
  Lightning,
  PlugsConnected,
  Receipt,
  SlackLogo,
  Sparkle,
  Table,
  Timer,
  Tray,
  UserPlus,
  UsersThree,
  XCircle,
};

export function iconFor(name: string | null | undefined): Icon {
  if (!name) return FALLBACK_ICON;
  return ICONS[name.trim()] ?? FALLBACK_ICON;
}

/** True when the registry can draw this name — for tests and diagnostics. */
export function hasIcon(name: string | null | undefined): boolean {
  return Boolean(name && name.trim() in ICONS);
}
