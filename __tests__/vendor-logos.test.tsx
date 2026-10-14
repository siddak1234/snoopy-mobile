import { fireEvent, screen } from '@testing-library/react-native';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { StyleSheet } from 'react-native';

import { NoVendorMark, VendorConnectButton, VendorLogo, VendorMark } from '@/components/vendor-logo';
import { iconSize } from '@/constants/theme';
import type { ThemeMode } from '@/hooks/use-theme';
import { BRAND_LOGO_NAMES, brandLogoFor, disconnectLabelFor } from '@/lib/view/brand-logos';
import { iconFor } from '@/lib/view/icon-registry';
import { renderWithProviders } from '@/test/render';

/**
 * The vendors' own marks (the Invoice Processing update, spec §4; the owner's
 * build 19 item 9: "Add the quickbooks logo"), held to Intuit's rules: its
 * files, unaltered — each one's sha256 the value recorded when it was
 * downloaded from Intuit (spec §4.1, 2026-10-14) — the full logo at 24 pt, the
 * dark wordmark on light and the reversed one on dark, and its own Connect
 * button at its size.
 */

const VENDORS = join(__dirname, '..', 'assets', 'vendors');

/**
 * Every bundled vendor file and its sha256. The logos are Intuit's "QuickBooks
 * Logo" page downloads (spec §4.1: preferred `…-black-external.png`, reversed
 * `…-white-external.png`); the buttons are the English tall green
 * `C2QB_green_btn_tall_default` 1x and 2x from Intuit's
 * `Connect_to_QuickBooks_buttons.zip` (that archive's sha256
 * 8f21125be0720874d0c6c90558bbd62565b8a993d1d8f7fb23ce677bb4651a78), renamed only.
 */
const INTUIT_FILES: Record<string, string> = {
  'quickbooks-logo.png': '67fcdc67a032a068feeecddecb0cd9f4d12020dddb199a3c155837abef3cc2eb',
  'quickbooks-logo-reversed.png': '3837c7d32394cc53f9785d02a307cfa71fa5b602b2be159964e02cdcd735b21e',
  'connect-to-quickbooks.png': 'b92aa96c4b6dff65540241b8dbea84fb75d11b8e6068ce708e168ac60ab66479',
  'connect-to-quickbooks@2x.png': 'c9b9802b3b6e8177e4584d5cb5b34b3facb7ec46cc59f273d9417a7bbd9add5b',
};

const sha256 = (file: string) => createHash('sha256').update(readFileSync(join(VENDORS, file))).digest('hex');

describe("the vendors' files are their own, unaltered (spec §4.3 guard M2)", () => {
  it.each(Object.entries(INTUIT_FILES))('%s is the file Intuit provides, byte for byte', (file, expected) => {
    expect(sha256(file)).toBe(expected);
  });

  it('bundles no vendor file the guard does not hold', () => {
    expect(readdirSync(VENDORS).sort()).toEqual(Object.keys(INTUIT_FILES).sort());
  });

  it("the logos are 2345 × 600, as the registry's aspect says, and the button's 1x is 274 × 48", () => {
    const size = (file: string) => {
      const png = readFileSync(join(VENDORS, file));
      return [png.readUInt32BE(16), png.readUInt32BE(20)];
    };
    expect(size('quickbooks-logo.png')).toEqual([2345, 600]);
    expect(size('quickbooks-logo-reversed.png')).toEqual([2345, 600]);
    expect(size('connect-to-quickbooks.png')).toEqual([274, 48]);
    expect(size('connect-to-quickbooks@2x.png')).toEqual([548, 96]);
    expect(brandLogoFor('QuickBooksLogo')!.aspect).toBe(2345 / 600);
  });
});

describe('the registry (lib/view/brand-logos.ts)', () => {
  it('resolves the name the platform sends — a brand before the icon set — and nothing else', () => {
    expect(BRAND_LOGO_NAMES).toEqual(['QuickBooksLogo']);
    const quickbooks = brandLogoFor(' QuickBooksLogo ');
    expect(quickbooks).toMatchObject({
      alt: 'QuickBooks',
      connectLabel: 'Connect to QuickBooks',
      disconnectLabel: 'Disconnect from QuickBooks',
      connectSize: { width: 274, height: 48 },
    });
    for (const name of [undefined, null, '', 'PlugsConnected', 'quickbookslogo', 'constructor', 'toString']) {
      expect([name, brandLogoFor(name)]).toEqual([name, null]);
    }
    // Any other name still falls back in the icon set, as before.
    expect(iconFor('QuickBooksLogo')).toBe(iconFor('no-such-icon'));
  });

  it('says Disconnect in the vendor\'s own words where it has them', () => {
    expect(disconnectLabelFor('QuickBooksLogo')).toBe('Disconnect from QuickBooks');
    expect(disconnectLabelFor('envelope')).toBe('Disconnect');
  });
});

describe.each<ThemeMode>(['dark', 'light'])('the marks — %s palette (snapshot-pinned, spec §4.3)', (mode) => {
  const quickbooks = brandLogoFor('QuickBooksLogo')!;

  it('the logo: 24 pt tall, in proportion, on no tile — the reversed one on dark, the preferred one on light', async () => {
    const { toJSON } = await renderWithProviders(<VendorLogo brand={quickbooks} testID="logo" />, undefined, mode);
    const logo = screen.getByTestId('logo');
    expect(StyleSheet.flatten(logo.props.style)).toEqual({ height: iconSize.row, width: iconSize.row * (2345 / 600) });
    expect(logo.props.source).toBe(mode === 'dark' ? quickbooks.dark : quickbooks.light);
    expect(logo.props.accessibilityLabel).toBe('QuickBooks');
    expect(toJSON()).toMatchSnapshot();
  });

  it('a vendor with no logo bundled: its icon at 24 and its name; None: the prohibit sign and None', async () => {
    const { toJSON } = await renderWithProviders(
      <>
        <VendorMark icon="envelope" name="Gmail" />
        <VendorMark icon="QuickBooksLogo" name="QuickBooks Online" />
        <NoVendorMark />
      </>,
      undefined,
      mode,
    );
    expect(screen.getByText('Gmail')).toBeTruthy();
    expect(screen.getByText('None')).toBeTruthy();
    expect(screen.queryByText('QuickBooks Online')).toBeNull();
    expect(screen.getByTestId(/^phosphor-react-native-prohibit-/u).props.width).toBe(24);
    expect(toJSON()).toMatchSnapshot();
  });

  it("Intuit's Connect button: its own image, at its size, read aloud as its words; a press runs it", async () => {
    const onPress = jest.fn();
    const { toJSON } = await renderWithProviders(
      <VendorConnectButton brand={quickbooks} onPress={onPress} testID="connect" />,
      undefined,
      mode,
    );
    expect(StyleSheet.flatten(screen.getByTestId('connect-image').props.style)).toEqual({ width: 274, height: 48 });
    expect(screen.getByTestId('connect-image').props.source).toBe(quickbooks.connectButton);
    await fireEvent.press(screen.getByLabelText('Connect to QuickBooks'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(toJSON()).toMatchSnapshot();
  });
});
