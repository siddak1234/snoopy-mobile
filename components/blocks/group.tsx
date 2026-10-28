import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { DividedCard } from '@/components/group';
import { SectionTitle } from '@/components/nocturne/section-label';
import { space } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

import { NotDrawnFallback } from './fallback';
import type { BlockOf } from './look';
import { SectionDropdown } from './section';

/**
 * group (backend ADR-0048 amendment 1, point 12; the owner's Q6 and build 30
 * note F6, "one block with sections that are drop downs inside"): its title
 * (`SectionTitle`, `title` above the card), then one card holding its sections
 * as drop-downs with a divider between each — the first open as the platform
 * sends it, several open at once. A section's blocks are leaves only. A group
 * entry that is not a section is the fallback sentence in its place, logged as
 * `group`, `sections[n].type` (`NotDrawnFallback`), never left out unsaid:
 * `missingField` checks the contract's `const` first, so this is the last
 * guard, as the website's `GroupCard` is.
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
  const { title, sections } = block;
  return (
    <View testID={testID}>
      <SectionTitle testID={`${testID}-title`}>{title}</SectionTitle>
      <Animated.View layout={reduceMotion ? undefined : LinearTransition.duration(200)}>
        <DividedCard testID={`${testID}-card`}>
          {(sections ?? []).map((section, at) =>
            typeof section === 'object' && section !== null && section.type === 'section' && Array.isArray(section.blocks) ? (
              <SectionDropdown key={`${testID}-${at}`} section={section} testID={`${testID}-${at}`} inner={inner} />
            ) : (
              <View key={`${testID}-${at}`} style={styles.entry}>
                <NotDrawnFallback type="group" error={`sections[${at}].type`} testID={`${testID}-${at}-fallback`} />
              </View>
            ),
          )}
        </DividedCard>
      </Animated.View>
    </View>
  );
}

/** A fallback entry pads as a section's row does (`SectionDropdown`'s head). */
const styles = StyleSheet.create({
  entry: { paddingVertical: space.rowY, paddingHorizontal: space.rowX },
});
