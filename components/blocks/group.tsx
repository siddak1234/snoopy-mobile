import React from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { DividedCard } from '@/components/group';
import { SectionTitle } from '@/components/nocturne/section-label';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

import type { BlockOf } from './look';
import { SectionDropdown } from './section';

/**
 * group (backend ADR-0048 amendment 1, point 12; the owner's Q6 and build 30
 * note F6, "one block with sections that are drop downs inside"): its title
 * (`SectionTitle`, `title` above the card), then one card holding its sections
 * as drop-downs with a divider between each — the first open as the platform
 * sends it, several open at once. A section's blocks are leaves only; a
 * section this build cannot read is left out of the card, as an unknown block
 * is drawn as the fallback, never as a press.
 */
export function GroupCard({
  block,
  testID,
  inner,
}: {
  block: BlockOf<'group'>;
  testID: string;
  inner: (blocks: readonly unknown[], prefix: string) => React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const { title, sections: sent } = block;
  const sections = (sent ?? []).filter(
    (section) => typeof section === 'object' && section !== null && section.type === 'section' && Array.isArray(section.blocks),
  );
  return (
    <View testID={testID}>
      <SectionTitle testID={`${testID}-title`}>{title}</SectionTitle>
      <Animated.View layout={reduceMotion ? undefined : LinearTransition.duration(200)}>
        <DividedCard testID={`${testID}-card`}>
          {sections.map((section, at) => (
            <SectionDropdown key={`${testID}-${at}`} section={section} testID={`${testID}-${at}`} inner={inner} />
          ))}
        </DividedCard>
      </Animated.View>
    </View>
  );
}
