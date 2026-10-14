import { Prohibit } from 'phosphor-react-native';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/pressable';
import { fonts, iconSize, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { brandLogoFor, type BrandLogo } from '@/lib/view/brand-logos';
import { iconFor } from '@/lib/view/icon-registry';

/** How tall a vendor's logo is drawn wherever it labels a row (spec §4.2: 24 pt). */
export const LOGO_HEIGHT = iconSize.row;

/**
 * A vendor's own logo (the Invoice Processing update; `lib/view/brand-logos.ts`):
 * the file as the vendor made it, scaled in proportion to 24 pt tall, on no tile
 * or shape — the dark wordmark on the light theme, the reversed one on the dark.
 * A content component, not a Nocturne primitive; snapshot-pinned in both
 * palettes (`__tests__/vendor-logos.test.tsx`).
 */
export function VendorLogo({ brand, testID }: { brand: BrandLogo; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Image
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={brand.alt}
      source={palette.scheme === 'dark' ? brand.dark : brand.light}
      resizeMode="contain"
      style={{ height: LOGO_HEIGHT, width: LOGO_HEIGHT * brand.aspect }}
    />
  );
}

/**
 * A vendor as a row names it: its logo, which carries its name; or, for a
 * vendor with no logo bundled, its icon (24) and its name.
 */
export function VendorMark({ icon, name, testID }: { icon: string | null | undefined; name: string; testID?: string }) {
  const { palette } = useTheme();
  const brand = brandLogoFor(icon);
  if (brand) return <VendorLogo brand={brand} testID={testID} />;
  const Glyph = iconFor(icon);
  return (
    <View testID={testID} style={styles.mark}>
      <Glyph size={iconSize.row} color={palette.accentRamp[300]} />
      <Text style={[styles.name, { color: palette.text }]}>{name}</Text>
    </View>
  );
}

/** "None": no vendor — the flow saves the details only. */
export function NoVendorMark({ testID }: { testID?: string }) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={styles.mark}>
      <Prohibit size={iconSize.row} color={palette.accentRamp[300]} />
      <Text style={[styles.name, { color: palette.text }]}>None</Text>
    </View>
  );
}

/**
 * The vendor's own Connect button, drawn at its size and never altered
 * (Intuit's technical requirement 1.3: "All Intuit and QuickBooks logos and
 * buttons in your app use the approved and provided images"; its brand rules:
 * "Do not modify the appearance of any button graphics") — so not dimmed when
 * pressed or busy either: a press ticks, and while it connects the provider's
 * sign-in is in front of it. Read aloud as the words on it.
 */
export function VendorConnectButton({
  brand,
  onPress,
  disabled,
  testID,
}: {
  brand: BrandLogo;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={brand.connectLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={styles.connect}>
      <Image
        testID={testID ? `${testID}-image` : undefined}
        source={brand.connectButton}
        resizeMode="contain"
        style={brand.connectSize}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mark: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  name: { flexShrink: 1, fontFamily: fonts.medium, fontSize: typeScale.label.fontSize },
  connect: { alignSelf: 'flex-start' },
});
