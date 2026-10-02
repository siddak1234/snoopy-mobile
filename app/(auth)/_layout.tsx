import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function AuthLayout() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}>
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Screen name="faceid-offer" options={{ animation: 'fade' }} />
      <Stack.Screen name="faceid" options={{ animation: 'fade' }} />
      <Stack.Screen name="account-deleted" options={{ animation: 'fade' }} />
    </Stack>
  );
}
