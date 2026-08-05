import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/** Flows tab stack — Workflow detail and Templates live here so they keep the
 *  Flows tab highlighted, matching the design's tab map. */
export default function FlowsLayout() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="detail" />
      <Stack.Screen name="templates" />
    </Stack>
  );
}
