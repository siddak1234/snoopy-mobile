import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from '@expo-google-fonts/inter';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { fonts, nocturneDark, nocturneLight } from '@/constants/theme';
import { ScopeProvider } from '@/hooks/use-scope';
import { SessionProvider, useSession } from '@/hooks/use-session';
import { SolutionsProvider } from '@/hooks/use-solutions';
import { NocturneThemeProvider, useTheme } from '@/hooks/use-theme';
import { WorkflowsProvider } from '@/hooks/use-workflows';

export const unstable_settings = {
  anchor: 'index',
};

SplashScreen.preventAutoHideAsync();

const navDark: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: nocturneDark.accent,
    background: nocturneDark.bg,
    card: nocturneDark.surface,
    text: nocturneDark.text,
    border: nocturneDark.divider,
  },
  fonts: {
    ...DarkTheme.fonts,
    regular: { fontFamily: fonts.regular, fontWeight: '400' },
    medium: { fontFamily: fonts.medium, fontWeight: '500' },
  },
};

const navLight: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: nocturneLight.accent,
    background: nocturneLight.bg,
    card: nocturneLight.surface,
    text: nocturneLight.text,
    border: nocturneLight.divider,
  },
  fonts: navDark.fonts,
};

/**
 * The auth boundary (DESIGN-CONTRACT.md): the tabs exist only for `signed-in`.
 *
 * `Stack.Protected` (expo-router's protected routes) removes them in every
 * other state — restoring, signed out, unconfigured, unavailable — and when
 * they go while open, the stack lands on its anchor, the cover (`index`). So
 * Sign out, an ended session and Delete account's "Sign in again" only end the
 * session; none navigates. "/" is no way to the cover from inside the tabs:
 * there it names Home, and build 12's Sign out, aimed at it, was dropped while
 * the tab layout's redirect to it replaced the tabs with themselves (the
 * owner's build 12 item 6).
 */
function RootNavigator() {
  const { palette } = useTheme();
  const session = useSession();
  return (
    <ThemeProvider value={palette.scheme === 'dark' ? navDark : navLight}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
        }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Protected guard={session.status === 'signed-in'}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
      <StatusBar style={palette.scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <NocturneThemeProvider>
      <SessionProvider>
        <ScopeProvider>
          <SolutionsProvider>
            <WorkflowsProvider>
              <RootNavigator />
            </WorkflowsProvider>
          </SolutionsProvider>
        </ScopeProvider>
      </SessionProvider>
    </NocturneThemeProvider>
  );
}
