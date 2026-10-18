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
 * How far a row of `rowWidth` draws the page's controls from their full width
 * (the session's S26; the Build 22 review's M11): 0, every word; 1, 2, … each a
 * step narrower, as the page draws them (`right(level)`), up to `levels`.
 * Measured, never guessed: the room is what the title and the two circles
 * leave, with 8 pt before the controls, and the first step whose measured width
 * fits it is drawn — a step not yet measured is drawn to be measured, and the
 * last is drawn whatever it measures. `null` (not laid out yet) draws the full
 * form. On Flows a 375-pt phone draws Archived as its icon (level 1) and a
 * 320-pt one New too (level 2); Activity's time range is its icon at 320 pt.
 */
export function titleRowLevel(
  rowWidth: number | null,
  titleWidth: number | null,
  rightWidths: readonly (number | undefined)[],
  levels: number,
): number {
  if (rowWidth === null || titleWidth === null) return 0;
  const room = rowWidth - (titleWidth + TITLE_ROW_GAP + CIRCLES_WIDTH + TITLE_ROW_GAP);
  for (let level = 0; level < levels; level += 1) {
    const width = rightWidths[level];
    if (width === undefined || width <= room) return level;
  }
  return levels;
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
 * `right` is drawn at the `level` the row has room for (`titleRowLevel`, by
 * `onLayout`; `levels` the page's narrower forms): Flows draws Archived as its
 * icon alone, then New too; Activity its time range as its icon. Every item
 * stays on the one line at 320 pt (the Build 22 review's M11; ~~Archived the
 * one narrower form, so the row ran past a 320-pt screen's edge~~). ~~The scope
 * control's labelled pills above the title~~ until Build 22.
 */
export function TitleRow({
  title,
  right,
  levels = 1,
  testID = 'title-row',
}: {
  title: string;
  right: (level: number) => React.ReactNode;
  levels?: number;
  testID?: string;
}) {
  const { palette } = useTheme();
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const [titleWidth, setTitleWidth] = useState<number | null>(null);
  // Each form's width as it was last drawn, kept while another is drawn, so a wider row draws the words again.
  const [rightWidths, setRightWidths] = useState<readonly (number | undefined)[]>([]);
  const level = titleRowLevel(rowWidth, titleWidth, rightWidths, levels);
  const width = (set: (value: number) => void) => (event: LayoutChangeEvent) => set(event.nativeEvent.layout.width);
  const measureRight = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    setRightWidths((known) => {
      if (known[level] === measured) return known;
      const next = [...known];
      next[level] = measured;
      return next;
    });
  };

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
      <View testID={`${testID}-right`} style={styles.right} onLayout={measureRight}>
        {right(level)}
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
