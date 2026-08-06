import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/** Home tab stack — Run detail lives here so it keeps the Home tab
 *  highlighted, matching the design's tab map (run → home). */
export default function HomeLayout() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="run" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
