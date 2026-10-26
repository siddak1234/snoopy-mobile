import { CaretDown } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, iconSize, typeScale } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';

import { Chip } from './badge';
import type { BlockOf } from './look';

/**
 * section: a drop-down on its own card (the document card's toggle, ~~one card
 * for every section~~ until Round 21; backend ADR-0048 decision 9), closed
 * unless `open`, that opens and closes on its own: a 44-pt bar — its title,
 * its subtitle muted under it, its chip and the caret — a button that says
 * whether it is open; open, its blocks under it, fading in while the page
 * makes room (none under Reduce Motion). The bar is the same for every
 * section, a document's too.
 */
export function SectionBlock({
  block,
  testID,
  inner,
}: {
  block: BlockOf<'section'>;
  testID: string;
  inner: (blocks: readonly unknown[], prefix: string) => React.ReactNode;
}) {
  const { palette } = useTheme();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(block.open === true);
  return (
    <Animated.View testID={testID} layout={reduceMotion ? undefined : LinearTransition.duration(200)}>
      <SurfaceCard>
        <Pressable
          testID={`${testID}-toggle`}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={[block.title, block.subtitle, block.badge?.text].filter(Boolean).join(', ')}
          onPress={() => setOpen((was) => !was)}
          style={({ pressed }) => [styles.bar, pressed && { opacity: 0.7 }]}>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: palette.text }]}>{block.title}</Text>
            {block.subtitle ? (
              <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>{block.subtitle}</Text>
            ) : null}
          </View>
          {block.badge ? <Chip badge={block.badge} testID={`${testID}-badge`} /> : null}
          <CaretDown
            size={iconSize.button}
            color={palette.neutral[400]}
            style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
          />
        </Pressable>
        {open ? (
          <Animated.View
            testID={`${testID}-body`}
            entering={reduceMotion ? undefined : FadeIn.duration(200)}
            style={styles.body}>
            {inner(block.blocks, testID)}
          </Animated.View>
        ) : null}
      </SurfaceCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  heading: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.medium, ...typeScale.label },
  subtitle: { fontFamily: fonts.regular, ...typeScale.small },
  body: { paddingHorizontal: 14, paddingBottom: 14 },
});
