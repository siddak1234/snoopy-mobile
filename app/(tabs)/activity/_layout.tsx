import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/**
 * Activity's index under every screen of its stack when a push from another
 * tab, a notification or a link asks for it (`withAnchor`) — so Back from a run
 * opened that way pops to Activity, and the swipe has a page to go to (round 24
 * P5).
 */
export const unstable_settings = { anchor: 'index' };

/** Activity tab stack — the Approvals inbox and, since round 24 (P5; the owner's
 *  build 23 F4, F5), the one run page and its package (P12) live here so they
 *  keep the Activity tab highlighted. */
export default function ActivityLayout() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="approvals" />
      <Stack.Screen name="run" />
      <Stack.Screen name="package" />
    </Stack>
  );
}
