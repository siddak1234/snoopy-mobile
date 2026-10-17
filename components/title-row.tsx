import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { ScopeIcons } from '@/components/scope-control';
import { em, fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The row's height: the circles' 38, so every item in it is centred on one line (F3). */
export const TITLE_ROW_HEIGHT = 38;
/** The space after the title, between the circles, and the least space before the page's own controls. */
export const TITLE_ROW_GAP = 8;
/** The two scope circles and the gap between them: 38 + 8 + 38. */
const CIRCLES_WIDTH = 38 + TITLE_ROW_GAP + 38;

/**
 * Whether a row of `rowWidth` has too little room for the title, the circles
 * and the page's controls at their full width (the session's S26): measured,
 * never guessed — `null` until all three are known, which draws the full form.
 */
export function titleRowCompact(
  rowWidth: number | null,
  titleWidth: number | null,
  rightWidth: number | null,
): boolean {
  if (rowWidth === null || titleWidth === null || rightWidth === null) return false;
  return rowWidth < titleWidth + TITLE_ROW_GAP + CIRCLES_WIDTH + TITLE_ROW_GAP + rightWidth;
}

/**
 * The first row of Flows and Activity (Build 22, F1–F3; the owner's build 21
 * items 2–4: "Flows and activity ahould have the headed buttons on top circle
 * icons like home instead … the logos same as home for organization and team
 * then to its right the box for archived and then +new can stay as is" /
 * "Ensure icons for activity and flows after change are in the same height on
 * the page next to the section name … Symmetry and standard"): the title, Home's
 * two scope circles 8 pt to its right and 8 pt apart (`ScopeIcons`), flexible
 * space, then the page's own controls. One component on both pages, the row 38
 * tall with every item centred, first under the safe area on both, so the
 * circles sit at the same height on each.
 *
 * `right` is drawn `compact` when the row is too narrow for it at its full
 * width (`titleRowCompact`, by `onLayout`): Flows then draws Archived as its
 * icon alone. ~~The scope control's labelled pills above the title~~ until
 * Build 22.
 */
export function TitleRow({
  title,
  right,
  testID = 'title-row',
}: {
  title: string;
  right: (compact: boolean) => React.ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const [titleWidth, setTitleWidth] = useState<number | null>(null);
  // The controls' width at full size, kept while they are drawn compact.
  const [rightWidth, setRightWidth] = useState<number | null>(null);
  const compact = titleRowCompact(rowWidth, titleWidth, rightWidth);
  const width = (set: (value: number) => void) => (event: LayoutChangeEvent) => set(event.nativeEvent.layout.width);

  return (
    <View testID={testID} style={styles.row} onLayout={width(setRowWidth)}>
      <Text
        testID={`${testID}-title`}
        numberOfLines={1}
        onLayout={width(setTitleWidth)}
        style={[styles.title, { color: palette.text }]}>
        {title}
      </Text>
      <View testID={`${testID}-scope`} style={styles.circles}>
        <ScopeIcons testIDPrefix="title-scope" />
      </View>
      <View style={styles.space} />
      <View
        testID={`${testID}-right`}
        style={styles.right}
        onLayout={compact ? undefined : width(setRightWidth)}>
        {right(compact)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: TITLE_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flexShrink: 0,
    fontFamily: fonts.medium,
    fontSize: typeScale.display.fontSize,
    letterSpacing: em(-0.015, typeScale.display.fontSize),
  },
  circles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TITLE_ROW_GAP,
    marginLeft: TITLE_ROW_GAP,
  },
  space: {
    flexGrow: 1,
    minWidth: TITLE_ROW_GAP,
  },
  right: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: TITLE_ROW_GAP,
  },
});
