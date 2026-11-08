import type { Icon } from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconTile } from '@/components/nocturne/icon-tile';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Text } from '@/components/text';
import { fonts, iconSize, inset, layout, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The one flow card (the owner's builds 37 items 1 and 4: "Make a standard for
 * flow cards. It should be a reusable block. Icon, short deacription and live.
 * Not meta data under."): the flow's icon (the catalog's `icon`, `iconFor`),
 * its name, its short description (the catalog's `description`) and, on the
 * right, what the place says of it — its status pill (Live / Paused / Draft),
 * "Archived {date}", or Add / "Added ✓". No line under the description: the
 * "{department} · {runs}" line went from every card (~~Flows, Archived~~ until
 * builds 37 and 39); the department is the section's heading and the run
 * counts are the flow's own page's.
 *
 * Drawn wherever a flow is a card: Flows, Flows › Archived and Settings ›
 * Archived (`ArchivedFlows`), Add a flow, and Home's YOUR FLOWS, which puts
 * the flow's start form inside the card under it (`children`). `note` is a
 * line under the description (Add a flow's "unavailable"); `stacked` puts the
 * right slot under the words at iOS's accessibility sizes (Add a flow's rule).
 * `description` is optional: none (or '') draws no line. `compact` is Home's
 * quick-access card (the owner's build 41 item 14: "Just the logo, title, then
 * the buttons and items. We do not need the description and live."): the
 * table's row steps for padding (`space.rowY` top and bottom, `space.rowX` the
 * sides) instead of `layout.cardPad`; nothing else changes size. Home's
 * layout: `YourFlows`.
 *
 * testIDs: the card `${testID}`, its top row `${testID}-top`, its name
 * `${testID}-name`, its description `${testID}-description`, its icon
 * `${testID}-icon`.
 */
export function FlowCard({
  testID,
  icon,
  name,
  description,
  right,
  note,
  stacked = false,
  compact = false,
  onPress,
  children,
  style,
}: {
  testID: string;
  icon: Icon;
  name: string;
  /** None, or '', draws no line. */
  description?: string;
  /** The pill, "Archived {date}", or the Add action. */
  right?: React.ReactNode;
  note?: React.ReactNode;
  stacked?: boolean;
  /** Home's quick-access card: the row steps for padding (build 41 item 14). */
  compact?: boolean;
  /** The whole card opens the flow; a card holding a form (`children`) takes none. */
  onPress?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  const top = (
    <View testID={`${testID}-top`} style={[styles.top, stacked && styles.topStacked]}>
      <View testID={`${testID}-icon`}>
        <IconTile icon={icon} size={42} iconSize={iconSize.row} borderRadius={12} bordered />
      </View>
      <View style={stacked ? styles.bodyStacked : styles.body}>
        <Text testID={`${testID}-name`} style={[styles.name, { color: palette.text }]}>
          {name}
        </Text>
        {description ? (
          <Text testID={`${testID}-description`} style={[styles.description, { color: palette.neutral[400] }]}>
            {description}
          </Text>
        ) : null}
        {note}
      </View>
      {right}
    </View>
  );
  return (
    <View testID={testID}>
      <SurfaceCard onPress={onPress} style={[styles.card, compact && styles.compact, style]}>
        {top}
        {children}
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: layout.cardPad, gap: space.inner },
  compact: { paddingVertical: space.rowY, paddingHorizontal: space.rowX },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.inner },
  // At iOS's accessibility sizes the words keep the card's width (round 24's audit on Add a flow).
  topStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  body: { flex: 1, minWidth: 0 },
  bodyStacked: { alignSelf: 'stretch' },
  name: { fontFamily: fonts.medium, fontSize: typeScale.lead.fontSize },
  description: { fontFamily: fonts.regular, fontSize: typeScale.small.fontSize, marginTop: inset.xxs },
});
