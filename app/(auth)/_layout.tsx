import { Stack } from 'expo-router';

import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';

/**
 * The auth stack. The Face ID question belongs to an open session — it is asked
 * right after a sign-in — so it is guarded as the tabs are (`app/_layout.tsx`):
 * signed in, and not held by the Face ID lock. Unguarded, a link to it while
 * the lock showed let whoever held the phone answer "Not now" — Face ID off —
 * and the next cold start opened without Face ID (found fixing the build 13
 * review's first finding).
 */
export default function AuthLayout() {
  const { palette } = useTheme();
  const session = useSession();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}>
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Protected guard={session.status === 'signed-in' && !session.locked}>
        <Stack.Screen name="faceid-offer" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Screen name="faceid" options={{ animation: 'fade' }} />
      <Stack.Screen name="account-deleted" options={{ animation: 'fade' }} />
    </Stack>
  );
}
