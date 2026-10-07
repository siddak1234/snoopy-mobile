import type { Icon } from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/pressable';
import { fonts, layout, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A row's height: the lists' own, or the Settings index's roomier one (build 11). */
export type SettingsRowSize = 'regular' | 'roomy';

/**
 * One row of a Settings card: an icon, a title, an optional line under it, and
 * whatever sits on the right. Pressable when it leads somewhere. Moved out of the
 * Settings screen unchanged when Settings became a stack (BUILD-PLAN 24.3.8), so
 * every Settings screen draws its rows the same way. `size="roomy"` is the
 * index's alone (build 11, the owner's "vertically more roomy"): more vertical
 * padding, and the title and line at their scale heights; every other list
 * keeps the row it had.
 *
 * `value` (the owner's build 12 items 2 and 3: the plan's name "closer to the
 * arrow", the organization's name "just like how owner is written") is drawn on
 * the title's line, at its right end — the row's gap before `right` — in the
 * index's value style. Title and value share one wrapping line, so a value that
 * does not fit beside the title moves under it, as an iOS value cell stacks,
 * and the title is never cut or squeezed. A row without `value` draws as before.
 *
 * `detail` is more under the line, for a row that says more than one thing —
 * a Connections row says what the provider is for, then the connection's state
 * and any warning (Gate 24 parity). A row without it draws as before.
 */
export function SettingsRow({
  icon: IconCmp,
  title,
  sub,
  value,
  detail,
  right,
  divider = false,
  onPress,
  testID,
  size = 'regular',
}: {
  icon: Icon;
  title: string;
  sub?: string;
  /** Said on the title's line, before `right`; under the title when the two do not fit side by side. */
  value?: string;
  /** Drawn under `sub`, in the row's body. */
  detail?: React.ReactNode;
  right: React.ReactNode;
  divider?: boolean;
  onPress?: () => void;
  testID?: string;
  size?: SettingsRowSize;
}) {
  const { palette } = useTheme();
  const roomy = size === 'roomy';
  const titleText = (
    <Text style={[styles.rowTitle, roomy && styles.rowTitleRoomy, { color: palette.text }]}>{title}</Text>
  );
  const body = (
    <>
      <IconCmp size={20} color={palette.accentRamp[300]} />
      <View style={styles.rowBody}>
        {value ? (
          <View style={styles.titleLine}>
            {titleText}
            <Text
              testID={testID ? `value-of-${testID}` : undefined}
              style={[styles.rowValue, roomy && styles.rowValueRoomy, { color: palette.neutral[500] }]}>
              {value}
            </Text>
          </View>
        ) : (
          titleText
        )}
        {sub ? (
          <Text style={[styles.rowSub, roomy && styles.rowSubRoomy, { color: palette.neutral[400] }]}>{sub}</Text>
        ) : null}
        {detail}
      </View>
      {right}
    </>
  );
  const rowStyle = [
    styles.row,
    roomy && styles.rowRoomy,
    divider && { borderBottomWidth: 1, borderBottomColor: palette.divider },
  ];
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [rowStyle, pressed && { opacity: 0.7 }]}>
        {body}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={rowStyle}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: layout.rowPadV,
    paddingHorizontal: layout.rowPadH,
  },
  rowRoomy: {
    paddingVertical: layout.rowPadVRoomy,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
  },
  rowTitleRoomy: {
    ...typeScale.label,
  },
  // The title and its value on one line that wraps: side by side when both fit,
  // the value under the title when they do not (a lone item on a line starts it).
  titleLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 12,
  },
  rowValue: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  rowValueRoomy: {
    ...typeScale.small,
  },
  rowSub: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  rowSubRoomy: {
    ...typeScale.small,
  },
});
