import React from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { fonts, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FALLBACK } from '@/lib/content/screen-states';

/**
 * The one sentence for a part this build cannot draw (backend ADR-0048
 * decision 10): an unknown block, form or page part, at the top level or inside
 * a section, and a page whose blocks did not come (`FALLBACK`).
 */
export function Fallback({ testID = 'block-fallback' }: { testID?: string }) {
  const { palette } = useTheme();
  return (
    <Text testID={testID} style={[styles.line, { color: palette.neutral[400] }]}>
      {FALLBACK}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: fonts.regular, ...typeScale.small },
});
