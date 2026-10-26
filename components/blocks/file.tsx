import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { OpenRow } from '@/components/open-row';
import { Text } from '@/components/text';
import { fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { openRoute, type BlockOf, type BlockPlace } from './look';

/**
 * file: its row (`OpenRow`), its title alone ("View resume", "Job
 * description"), opening its page — a run's file or an item's; a target this
 * build does not know, the row with no press.
 */
export function FileBlock({
  block,
  testID,
  nested,
  place,
}: {
  block: BlockOf<'file'>;
  testID: string;
  nested: boolean;
  place: BlockPlace;
}) {
  const router = useRouter();
  const { palette } = useTheme();
  const route = openRoute(block.open, place);
  const row = route ? (
    <OpenRow
      testID={testID}
      title={block.title}
      onPress={() => router.push(route.href, route.withAnchor ? { withAnchor: true } : undefined)}
    />
  ) : (
    <View testID={testID} style={styles.row}>
      <Text style={[styles.title, { color: palette.text }]}>{block.title}</Text>
    </View>
  );
  return nested ? row : <SurfaceCard>{row}</SurfaceCard>;
}

const styles = StyleSheet.create({
  // `OpenRow`'s row, without the press or the arrow.
  row: { minHeight: 44, justifyContent: 'center', paddingVertical: 11, paddingHorizontal: 14 },
  title: { fontFamily: fonts.medium, ...typeScale.label },
});
