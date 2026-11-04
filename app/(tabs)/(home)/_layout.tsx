import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/** Home tab stack: Home and its Notifications. ~~Run detail~~ lives in
 *  Activity's since round 24 (P5; the owner's build 23 F4, F5). Since Round 21
 *  stage 2 (C3) its own copy of the health data agreement, which a Start run
 *  in YOUR FLOWS opens, so Back stays on Home. */
export default function HomeLayout() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="agreement" />
    </Stack>
  );
}
