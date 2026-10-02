import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/** Flows tab stack — the flow page, the catalog ("New") and Setup live here so
 *  they keep the Flows tab highlighted: one tab for everything a flow is
 *  (BUILD-PLAN 24.9.3, the owner's feedback 4 of 2026-10-02). */
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
      <Stack.Screen name="add" />
      <Stack.Screen name="setup" />
    </Stack>
  );
}
