import React from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A signed-in screen's page (Round 21; the owner's build 30 note F3 and Q8):
 * the theme's ground, the safe area plus the design's top, the table's `edge`
 * on both sides, `group` between its parts and `bottom` under the last. Every
 * screen that scrolls is one; `fill` is a page that does not scroll and gives
 * its last part the rest of the height (a file drawn over the page). No screen
 * types its own wrapper again: ~~the scroll view, `insets.top + (74 − 59)`,
 * gaps of 14, 16 or 18 and bottoms of 20, 24 or 32~~ until Round 21.
 */
export function Page({
  children,
  testID,
  fill = false,
  keyboardShouldPersistTaps,
  automaticallyAdjustKeyboardInsets,
  style,
}: {
  children: React.ReactNode;
  testID?: string;
  /** A page that does not scroll: its parts fill the screen. */
  fill?: boolean;
  /** A page with a form: a tap outside the field still presses what it lands on. */
  keyboardShouldPersistTaps?: 'handled';
  /** A field low on the page: the page makes room for the keyboard and brings it into view. */
  automaticallyAdjustKeyboardInsets?: boolean;
  /** The page's own look beyond the table (none sets a spacing: `audit:spacing`). */
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const top = { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) };
  if (fill) {
    return (
      <View testID={testID} style={[styles.fill, styles.content, top, { backgroundColor: palette.bg }, style]}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      testID={testID}
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, top, style]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: space.edge, paddingBottom: space.bottom, gap: space.group },
});
