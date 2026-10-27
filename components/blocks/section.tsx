import { CaretDown } from 'phosphor-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, iconSize, inset, space, typeScale } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';

import { Chip } from './badge';
import type { BlockOf } from './look';

/** A section as a group's and a section block's drop-down draw it. */
type Section = Pick<BlockOf<'section'>, 'title' | 'subtitle' | 'badge' | 'blocks'> & { open?: boolean };

/**
 * One drop-down: a 44-pt bar — its title, its subtitle muted under it, its
 * chip and the caret — a button that says whether it is open; open, its
 * blocks under it, fading in while the page makes room (none under Reduce
 * Motion). Closed unless `open`, it opens and closes on its own, so several may
 * be open at once. A section block draws it on a card of its own; a group, on
 * the group's one card (`GroupCard`). The table's row and card padding since
 * Round 21 (~~11/14 and 14~~).
 */
export function SectionDropdown({
  section,
  testID,
  inner,
}: {
  section: Section;
  testID: string;
  inner: (blocks: readonly unknown[], prefix: string) => React.ReactNode;
}) {
  const { palette } = useTheme();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(section.open === true);
  return (
    <>
      <Pressable
        testID={`${testID}-toggle`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={[section.title, section.subtitle, section.badge?.text].filter(Boolean).join(', ')}
        onPress={() => setOpen((was) => !was)}
        style={({ pressed }) => [styles.bar, pressed && { opacity: 0.7 }]}>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: palette.text }]}>{section.title}</Text>
          {section.subtitle ? (
            <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>{section.subtitle}</Text>
          ) : null}
        </View>
        {section.badge ? <Chip badge={section.badge} testID={`${testID}-badge`} /> : null}
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
          {inner(section.blocks, testID)}
        </Animated.View>
      ) : null}
    </>
  );
}

/**
 * section: a drop-down on its own card (the document card's toggle, ~~one card
 * for every section~~ until Round 21; backend ADR-0048 decision 9). The bar is
 * the same for every section, a document's and a group's too.
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
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View testID={testID} layout={reduceMotion ? undefined : LinearTransition.duration(200)}>
      <SurfaceCard>
        <SectionDropdown section={block} testID={testID} inner={inner} />
      </SurfaceCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: space.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inner,
    paddingVertical: space.rowY,
    paddingHorizontal: space.rowX,
  },
  heading: { flex: 1, minWidth: 0, gap: inset.xxs },
  title: { fontFamily: fonts.medium, ...typeScale.label },
  subtitle: { fontFamily: fonts.regular, ...typeScale.small },
  body: { paddingHorizontal: space.rowX, paddingBottom: space.card },
});
