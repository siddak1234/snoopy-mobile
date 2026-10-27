import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SectionTitle } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A group on a page (Round 21; the owner's build 30 note F3 and Q8): its title
 * (`SectionTitle`, `title` above the card) and its card. `padded`, the card's
 * `card` padding for words and buttons; off, a card of rows that pad
 * themselves. Every "LABEL then its card" on a page is one, so every label
 * sits the same distance above its card.
 */
export function Group({
  title,
  children,
  padded = false,
  testID,
  right,
}: {
  title?: string | null;
  children: React.ReactNode;
  padded?: boolean;
  testID?: string;
  /** Beside the title (a list's upload button): drawn on the title's line. */
  right?: React.ReactNode;
}) {
  return (
    <View testID={testID}>
      {title ? (
        right ? (
          <View style={styles.head}>
            <View style={styles.grow}>
              <SectionTitle flush>{title}</SectionTitle>
            </View>
            {right}
          </View>
        ) : (
          <SectionTitle>{title}</SectionTitle>
        )
      ) : null}
      <SurfaceCard padded={padded}>{children}</SurfaceCard>
    </View>
  );
}

/**
 * One card of parts with a divider between each (checklist C, "One card with
 * drop-downs inside"; the rule "a group of related rows is one card with
 * dividers"): the group block's sections (`GroupCard`), a flow's item groups
 * and a flow's steps. ~~Drawn by hand on flow-items.tsx and detail.tsx~~ until
 * Round 21.
 */
export function DividedCard({
  children,
  testID,
  style,
}: {
  children: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  // Each part keeps its own key; nothing drawn (null, false) is no part.
  const parts = React.Children.toArray(children);
  return (
    <SurfaceCard style={style}>
      <View testID={testID}>
        {parts.map((child, at) => (
          <View
            key={React.isValidElement(child) && child.key !== null ? child.key : at}
            style={at > 0 ? [styles.divider, { borderTopColor: palette.divider }] : undefined}>
            {child}
          </View>
        ))}
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.inner, marginBottom: space.title },
  grow: { flex: 1, minWidth: 0 },
  divider: { borderTopWidth: 1 },
});
