import type { ImageSourcePropType } from 'react-native';

import type { OAuthProvider } from '@/components/nocturne/oauth-button';

/**
 * A vendor's mark on the one connection row, by the icon name the platform
 * sends (`ConnectionProvider.icon`, backend BUILD-PLAN 25.4.18: a name "a client
 * draws from the vendor's own approved image, bundled with the client, before
 * it falls back to its icon set — still a name, never a URL").
 *
 * **Build 21 (spec A4; the session's S12).** Every connection is the same row —
 * a 24 × 24 mark, the name beside it, the account's email under it — and our
 * own Connect / Disconnect (the owner's build 20 items 6 and 7, and his ~04:15Z:
 * "we will list on apples app store not intuits. so we do not need that"):
 *
 * - `QuickBooksLogo` — the round QuickBooks symbol, cropped square from Intuit's
 *   preferred logo file the app already bundled, its pixels unchanged
 *   (`QUICKBOOKS_SYMBOL` records the source and the crop; the asset test holds
 *   both files' sha256). ~~The full logo, Intuit's "Connect to QuickBooks"
 *   button image and "Disconnect from QuickBooks"~~ until Build 21: Intuit's
 *   rules bind apps listed on the QuickBooks App Store, and this app is not.
 * - `GoogleLogo` — the design's own Google glyph (`ProviderGlyph`, the sign-in
 *   button's), in the row's text colour (backend `providers/google.json`, the
 *   session's S29).
 * - Any other name: the icon set, as before (`iconFor`).
 */
export type BrandMark =
  | { kind: 'image'; source: ImageSourcePropType; alt: string }
  | { kind: 'glyph'; provider: OAuthProvider; alt: string };

/**
 * Where the QuickBooks symbol came from: the left square of Intuit's preferred
 * logo (2345 × 600), whose round symbol is exactly 536 × 536 at its top-left
 * corner — measured, not assumed: its green and white pixels span columns and
 * rows 0–535, and the wordmark begins at column 610. The spec named a 600 ×
 * 600 box; the symbol's own square keeps it centred in the row's 24 × 24 mark
 * (a 600 box sits it 32 px off-centre), so the crop is 536 × 536.
 */
export const QUICKBOOKS_SYMBOL = {
  file: 'assets/vendors/quickbooks-symbol.png',
  source: 'assets/vendors/quickbooks-logo.png',
  sourceSha256: '67fcdc67a032a068feeecddecb0cd9f4d12020dddb199a3c155837abef3cc2eb',
  crop: { left: 0, top: 0, width: 536, height: 536 },
} as const;

const BRAND_MARKS: Readonly<Record<string, BrandMark>> = {
  QuickBooksLogo: { kind: 'image', source: require('@/assets/vendors/quickbooks-symbol.png'), alt: 'QuickBooks' },
  GoogleLogo: { kind: 'glyph', provider: 'google', alt: 'Google' },
};

/**
 * The vendor's mark for an icon name, or null: a brand name resolves before the
 * icon set (`iconFor`), and any other name still falls back there. Own keys
 * only, so a provider naming `constructor` has no mark.
 */
export function brandMarkFor(name: string | null | undefined): BrandMark | null {
  const key = name?.trim();
  if (!key || !Object.prototype.hasOwnProperty.call(BRAND_MARKS, key)) return null;
  return BRAND_MARKS[key] ?? null;
}

/** The names that draw a vendor's own mark — for tests and diagnostics. */
export const BRAND_MARK_NAMES: readonly string[] = Object.keys(BRAND_MARKS);
