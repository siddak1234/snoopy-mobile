import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/**
 * Settings tab stack — the admin areas the website keeps under `/account`
 * (Organization, Teams, Billing, Account, Support) live here as screens
 * so they keep the Settings tab highlighted (ADR-0032, BUILD-PLAN 24.3.8). Each
 * screen registers itself here when it lands. Since build 11 (D1) the index is
 * one grouped page: Account, Connections, Billing, Notifications and Help open
 * pages here, while the Face ID row, the workspace rows and Appearance sit on
 * the index itself — the Security, Workspace and Appearance pages of 24.12
 * went with their routes. Archived flows and the notifications inbox have
 * their own copies here — with the flow page they open — so Back stays in
 * Settings; a run opens in Activity and Back returns here (round 24 P5).
 * A signed document's copy, opened from Organization's DOCUMENTS, since
 * Round 21 stage 2 (C3); and its own copy of the health data agreement, which
 * Start run and Upload open on the flow page here, so Back stays in Settings.
 */
export default function SettingsLayout() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="organization" />
      <Stack.Screen name="documents" />
      <Stack.Screen name="teams" />
      <Stack.Screen name="team" />
      <Stack.Screen name="billing" />
      <Stack.Screen name="account" />
      <Stack.Screen name="data" />
      <Stack.Screen name="support" />
      <Stack.Screen name="connections" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="archived" />
      <Stack.Screen name="archived-flow" />
      <Stack.Screen name="agreement" />
    </Stack>
  );
}
