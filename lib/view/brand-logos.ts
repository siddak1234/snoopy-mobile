import type { ImageSourcePropType } from 'react-native';

/**
 * A vendor's own approved marks, by the icon name the platform sends
 * (`ConnectionProvider.icon`, backend BUILD-PLAN 25.4.18: "It may name a
 * vendor's brand mark, such as `QuickBooksLogo`, which a client draws from the
 * vendor's own approved image, bundled with the client, before it falls back to
 * its icon set — still a name, never a URL"). The owner's build 19 item 9: "Add
 * the quickbooks logo. Every connection should have a logo for the vendor."
 *
 * Each file is the vendor's, byte for byte, and a test holds its sha256
 * (`__tests__/vendor-logos.test.tsx`). QuickBooks's rules (Intuit's naming and
 * logo guidelines, its technical requirements 1.1–1.4 and its co-branding
 * guidelines of September 2025, read 2026-10-14): the full logo, never the
 * round symbol alone, unaltered and scaled only in proportion — the dark
 * wordmark on a light theme, the reversed one on a dark theme — on no tile or
 * shape; Intuit's own green "Connect to QuickBooks" button, at its size, where
 * QuickBooks is not connected; once connected, "Disconnect from QuickBooks" in
 * its place; and "QuickBooks" spelled out, never "QB".
 */
export type BrandLogo = {
  /** The logo for a light theme: Intuit's preferred, dark wordmark. */
  light: ImageSourcePropType;
  /** The logo for a dark theme: Intuit's reversed, white wordmark. */
  dark: ImageSourcePropType;
  /** Width over height of the logo files (2345 × 600). */
  aspect: number;
  /** What a screen reader says for the logo. */
  alt: string;
  /** The vendor's own Connect button (Intuit's tall green, 274 × 48 pt). */
  connectButton: ImageSourcePropType;
  /** Width and height of the Connect button, in points: drawn at its size, never scaled. */
  connectSize: { width: number; height: number };
  /** The Connect button's accessibility label: the words drawn on it. */
  connectLabel: string;
  /** The words of the way to disconnect once connected (Intuit's required words). */
  disconnectLabel: string;
};

const BRAND_LOGOS: Readonly<Record<string, BrandLogo>> = {
  QuickBooksLogo: {
    light: require('@/assets/vendors/quickbooks-logo.png'),
    dark: require('@/assets/vendors/quickbooks-logo-reversed.png'),
    aspect: 2345 / 600,
    alt: 'QuickBooks',
    connectButton: require('@/assets/vendors/connect-to-quickbooks.png'),
    connectSize: { width: 274, height: 48 },
    connectLabel: 'Connect to QuickBooks',
    disconnectLabel: 'Disconnect from QuickBooks',
  },
};

/**
 * The vendor's brand marks for an icon name, or null: a brand name resolves
 * before the icon set (`iconFor`), and any other name still falls back there.
 * Own keys only, so a provider naming `constructor` has no brand.
 */
export function brandLogoFor(name: string | null | undefined): BrandLogo | null {
  const key = name?.trim();
  if (!key || !Object.prototype.hasOwnProperty.call(BRAND_LOGOS, key)) return null;
  return BRAND_LOGOS[key] ?? null;
}

/** The names that draw a vendor's own logo — for tests and diagnostics. */
export const BRAND_LOGO_NAMES: readonly string[] = Object.keys(BRAND_LOGOS);

/** The way to disconnect a vendor, in its own words where it has them: "Disconnect from QuickBooks", else "Disconnect". */
export function disconnectLabelFor(name: string | null | undefined): string {
  return brandLogoFor(name)?.disconnectLabel ?? 'Disconnect';
}
