import { CaretRight } from 'phosphor-react-native';
import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, inset, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { httpsLink, type BlockOf } from './look';

/**
 * link: its title, then its host muted under it, opening in the system browser
 * — https only, checked again here (`httpsLink`; ~~`opensOutside`, http or
 * https~~ until Round 21). Any other address is its title alone, with no press.
 */
export function LinkBlock({ block, testID, nested }: { block: BlockOf<'link'>; testID: string; nested: boolean }) {
  const { palette } = useTheme();
  const link = httpsLink(block.url);
  if (!link) {
    return (
      <Text testID={testID} style={[styles.plain, { color: palette.text }]}>
        {block.title}
      </Text>
    );
  }
  const row = (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={`${block.title}, ${link.host}`}
      onPress={() => void Linking.openURL(link.href)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: palette.accentRamp[300] }]}>{block.title}</Text>
        <Text style={[styles.host, { color: palette.neutral[400] }]}>{link.host}</Text>
      </View>
      <CaretRight size={15} color={palette.neutral[500]} />
    </Pressable>
  );
  return nested ? row : <SurfaceCard>{row}</SurfaceCard>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: space.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inner,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
  },
  body: { flex: 1, minWidth: 0, gap: inset.xxs },
  title: { fontFamily: fonts.medium, ...typeScale.label },
  host: { fontFamily: fonts.regular, ...typeScale.small },
  plain: { fontFamily: fonts.regular, ...typeScale.body },
});
