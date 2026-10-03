import type { Icon } from 'phosphor-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, layout, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * One row of a Settings card: an icon, a title, an optional line under it, and
 * whatever sits on the right. Pressable when it leads somewhere. Moved out of the
 * Settings screen unchanged when Settings became a stack (BUILD-PLAN 24.3.8), so
 * every Settings screen draws its rows the same way.
 */
export function SettingsRow({
  icon: IconCmp,
  title,
  sub,
  right,
  divider = false,
  onPress,
  testID,
}: {
  icon: Icon;
  title: string;
  sub?: string;
  right: React.ReactNode;
  divider?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const body = (
    <>
      <IconCmp size={20} color={palette.accentRamp[300]} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: palette.text }]}>{title}</Text>
        {sub ? <Text style={[styles.rowSub, { color: palette.neutral[400] }]}>{sub}</Text> : null}
      </View>
      {right}
    </>
  );
  const rowStyle = [styles.row, divider && { borderBottomWidth: 1, borderBottomColor: palette.divider }];
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
    paddingVertical: 13,
    paddingHorizontal: layout.rowPadH,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fonts.medium,
    fontSize: typeScale.label.fontSize,
  },
  rowSub: {
    fontFamily: fonts.regular,
    fontSize: typeScale.small.fontSize,
  },
});
