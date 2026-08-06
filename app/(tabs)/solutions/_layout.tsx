import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/** Solutions tab stack — the Setup wizard lives here so it keeps the
 *  Solutions tab highlighted, matching the design's tab map (setup → solutions). */
export default function SolutionsLayout() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="setup" />
    </Stack>
  );
}
