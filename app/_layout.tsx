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

function RootNavigator() {
  const { palette } = useTheme();
  return (
    <ThemeProvider value={palette.scheme === 'dark' ? navDark : navLight}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
        }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
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
      <SolutionsProvider>
        <WorkflowsProvider>
          <RootNavigator />
        </WorkflowsProvider>
      </SolutionsProvider>
    </NocturneThemeProvider>
  );
}
