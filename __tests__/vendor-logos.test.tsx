import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { BRAND_MARK_NAMES, QUICKBOOKS_SYMBOL, brandMarkFor } from '@/lib/view/brand-logos';
import { iconFor } from '@/lib/view/icon-registry';

/**
 * The vendors' own marks (Build 21, spec A4; the session's S12): every
 * connection row is the same — a 24 × 24 mark — so QuickBooks is drawn by its
 * round symbol, cropped square from Intuit's preferred logo file the app
 * already bundled, its pixels unchanged, and Google by the design's own glyph.
 * ~~Intuit's "Connect to QuickBooks" button images~~ are gone (the owner,
 * ~04:15Z: "we will list on apples app store not intuits. so we do not need
 * that"): every connection has our own Connect and Disconnect.
 */

const VENDORS = join(__dirname, '..', 'assets', 'vendors');

/**
 * Every bundled vendor file and its sha256. The logos are Intuit's "QuickBooks
 * Logo" page downloads (the Invoice Processing update, spec §4.1: preferred
 * `…-black-external.png`, reversed `…-white-external.png`), kept as the
 * symbol's source; the symbol is the preferred logo's top-left 536 × 536 —
 * the round symbol's own square, measured: its pixels span columns and rows
 * 0–535 and the wordmark begins at column 610 — cut with nothing recoloured or
 * rescaled (checked pixel for pixel against the source when it was cut,
 * 2026-10-15/16; DESIGN-GAPS "Build 21").
 */
const VENDOR_FILES: Record<string, string> = {
  'quickbooks-logo.png': '67fcdc67a032a068feeecddecb0cd9f4d12020dddb199a3c155837abef3cc2eb',
  'quickbooks-logo-reversed.png': '3837c7d32394cc53f9785d02a307cfa71fa5b602b2be159964e02cdcd735b21e',
  'quickbooks-symbol.png': '616e1f163e195b6267d2ff92735a40db13f83ca04c42af97060b702694ecaf9b',
};

const sha256 = (file: string) => createHash('sha256').update(readFileSync(join(VENDORS, file))).digest('hex');
const size = (file: string) => {
  const png = readFileSync(join(VENDORS, file));
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe("the vendors' files (spec A4; guard M2 of the Invoice Processing update)", () => {
  it.each(Object.entries(VENDOR_FILES))('%s is the file recorded, byte for byte', (file, expected) => {
    expect(sha256(file)).toBe(expected);
  });

  it('bundles no vendor file the guard does not hold — no Connect button image', () => {
    expect(readdirSync(VENDORS).sort()).toEqual(Object.keys(VENDOR_FILES).sort());
  });

  it('the symbol is the square the registry records, cut from the file it names', () => {
    expect(QUICKBOOKS_SYMBOL.source).toBe('assets/vendors/quickbooks-logo.png');
    expect(QUICKBOOKS_SYMBOL.sourceSha256).toBe(sha256('quickbooks-logo.png'));
    expect(QUICKBOOKS_SYMBOL.file).toBe('assets/vendors/quickbooks-symbol.png');
    expect(QUICKBOOKS_SYMBOL.crop).toEqual({ left: 0, top: 0, width: 536, height: 536 });
    expect(size('quickbooks-symbol.png')).toEqual([536, 536]);
    expect(size('quickbooks-logo.png')).toEqual([2345, 600]);
  });
});

describe('the registry (lib/view/brand-logos.ts)', () => {
  it('resolves the names the platform sends — a brand before the icon set — and nothing else', () => {
    expect([...BRAND_MARK_NAMES].sort()).toEqual(['GoogleLogo', 'QuickBooksLogo']);
    expect(brandMarkFor(' QuickBooksLogo ')).toMatchObject({ kind: 'image', alt: 'QuickBooks' });
    expect(brandMarkFor('GoogleLogo')).toEqual({ kind: 'glyph', provider: 'google', alt: 'Google' });
    for (const name of [undefined, null, '', 'PlugsConnected', 'quickbookslogo', 'constructor', 'toString']) {
      expect([name, brandMarkFor(name)]).toEqual([name, null]);
    }
    // Any other name still falls back in the icon set, as before.
    expect(iconFor('QuickBooksLogo')).toBe(iconFor('no-such-icon'));
  });

  it("names no vendor button, label or size — Connect and Disconnect are the app's own", () => {
    const quickbooks = brandMarkFor('QuickBooksLogo')!;
    expect(Object.keys(quickbooks).sort()).toEqual(['alt', 'kind', 'source']);
  });
});
