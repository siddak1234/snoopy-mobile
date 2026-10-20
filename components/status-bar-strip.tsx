import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass-surface';

/**
 * The strip behind the status bar (round 24 P11; seen in the owner's build 23
 * screenshots fb09, fb10, fb15, fb16: content scrolled under the clock). One
 * glass surface with the page-colour backing (`GlassSurface backing="page"`),
 * as tall as the top safe area, over the top of every screen and never in the
 * way of a touch. Rendered once by `app/(tabs)/_layout.tsx` and once by
 * `app/(auth)/_layout.tsx` (Sign in scrolls), so no screen draws its own. A new
 * primitive, snapshot-pinned in both palettes.
 */
export function StatusBarStrip() {
  const insets = useSafeAreaInsets();
  if (insets.top <= 0) return null;
  return (
    <View pointerEvents="none" style={[styles.strip, { height: insets.top }]}>
      <GlassSurface radius={0} backing="page" testID="status-bar-strip" style={styles.fill} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { position: 'absolute', top: 0, left: 0, right: 0 },
  fill: { flex: 1, borderWidth: 0 },
});
