import { GithubLogo, Globe, LinkedinLogo, XLogo, type Icon } from 'phosphor-react-native';
import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { PillButton } from '@/components/nocturne/pill-button';
import { Text } from '@/components/text';
import { fonts, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { httpsLink, type BlockOf } from './look';

/**
 * A links button's mark, by its `brand` (backend ADR-0048 amendment 5): the
 * icon set's LinkedIn, GitHub and X logos, bundled with the app; `site`, no
 * brand, or one with no logo here (`huggingface`), the globe — as the website
 * draws them.
 */
const BRAND_ICONS: Readonly<Record<string, Icon>> = {
  linkedin: LinkedinLogo,
  github: GithubLogo,
  x: XLogo,
};

export function brandIcon(brand: unknown): Icon {
  return typeof brand === 'string' && Object.hasOwn(BRAND_ICONS, brand) ? BRAND_ICONS[brand]! : Globe;
}

/**
 * links (backend ADR-0048 amendment 5): full-width pill buttons, one under
 * another `inner` apart, each its brand's mark and its label, opening in the
 * system browser as a link does — https only, checked again here
 * (`httpsLink`); any other address is its label alone, with no press.
 */
export function LinksBlock({ block, testID }: { block: BlockOf<'links'>; testID: string }) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={styles.column}>
      {block.items.map((item, index) => {
        const link = httpsLink(item.url);
        const key = `${testID}-${index}`;
        return link ? (
          <PillButton
            key={key}
            testID={key}
            variant="secondary"
            icon={brandIcon(item.brand)}
            label={item.label}
            accessibilityLabel={`${item.label}, ${link.host}`}
            onPress={() => void Linking.openURL(link.href)}
          />
        ) : (
          <Text key={key} testID={key} style={[styles.plain, { color: palette.text }]}>
            {item.label}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.inner },
  plain: { fontFamily: fonts.regular, ...typeScale.body },
});
