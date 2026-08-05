import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The auth screens' "or" separator: hairline · label · hairline. */
export function OrDivider() {
  const { palette } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.line, { backgroundColor: palette.neutral[800] }]} />
      <Text style={[styles.label, { color: palette.neutral[500] }]}>or</Text>
      <View style={[styles.line, { backgroundColor: palette.neutral[800] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 18,
  },
  line: {
    flex: 1,
    height: 1,
  },
  label: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
  },
});
