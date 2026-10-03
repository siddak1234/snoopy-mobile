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
 */
export function SettingsRow({
  icon: IconCmp,
  title,
  sub,
  right,
  divider = false,
  onPress,
  testID,
  size = 'regular',
}: {
  icon: Icon;
  title: string;
  sub?: string;
  right: React.ReactNode;
  divider?: boolean;
  onPress?: () => void;
  testID?: string;
  size?: SettingsRowSize;
}) {
  const { palette } = useTheme();
  const roomy = size === 'roomy';
  const body = (
    <>
      <IconCmp size={20} color={palette.accentRamp[300]} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, roomy && styles.rowTitleRoomy, { color: palette.text }]}>{title}</Text>
        {sub ? (
          <Text style={[styles.rowSub, roomy && styles.rowSubRoomy, { color: palette.neutral[400] }]}>{sub}</Text>
        ) : null}
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
  rowSub: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
  rowSubRoomy: {
    ...typeScale.small,
  },
});
