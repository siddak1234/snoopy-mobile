import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/** Activity tab stack — the Approvals inbox lives here so it keeps the
 *  Activity tab highlighted, matching the design's tab map. */
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
    </Stack>
  );
}
