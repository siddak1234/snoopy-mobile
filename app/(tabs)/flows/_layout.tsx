import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/** Flows tab stack — the flow page, the catalog ("New"), Setup, a flow's
 *  choices page (Connect integration) and its email screen live here so they
 *  keep the Flows tab highlighted: one tab for everything a flow is
 *  (BUILD-PLAN 24.9.3, the owner's feedback 4 of 2026-10-02; the choices page
 *  since the Invoice Processing update, the email screen since Build 22). */
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
      <Stack.Screen name="vendor" />
      <Stack.Screen name="email" />
      <Stack.Screen name="archived" />
    </Stack>
  );
}
