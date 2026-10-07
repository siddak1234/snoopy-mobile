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
import { Stack, useRootNavigationState, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { fonts, nocturneDark, nocturneLight } from '@/constants/theme';
import { ScopeProvider } from '@/hooks/use-scope';
import { SessionProvider, useSession, type SessionContextValue } from '@/hooks/use-session';
import { SolutionsProvider } from '@/hooks/use-solutions';
import { NocturneThemeProvider, useTheme, type ThemeMode } from '@/hooks/use-theme';
import { WorkflowsProvider } from '@/hooks/use-workflows';
import { readAppearance, writeAppearance } from '@/lib/platform/appearance-store';
import { noteOpenScreen } from '@/lib/view/return-to';

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
 * The auth boundary (DESIGN-CONTRACT.md): the tabs exist only for `signed-in`,
 * and only once the Face ID lock, where the owner turned it on, has opened.
 *
 * `Stack.Protected` (expo-router's protected routes) removes them in every
 * other state — restoring, signed out, unconfigured, unavailable — and when
 * they go while open, the stack lands on its anchor, the cover (`index`). So
 * Sign out, an ended session and Delete account's "Sign in again" only end the
 * session; none navigates. "/" is no way to the cover from inside the tabs:
 * there it names Home, and build 12's Sign out, aimed at it, was dropped while
 * the tab layout's redirect to it replaced the tabs with themselves (the
 * owner's build 12 item 6).
 *
 * Signed in and `locked`, the tabs are removed too: a link to one that arrives
 * while the Face ID lock shows (snoopymobile:///settings from Safari) is
 * dropped by expo-router, which opens no route this stack does not hold. Until
 * the build 13 review the guard read `signed-in` alone, and such a link opened
 * the tab without Face ID.
 */
function RootNavigator() {
  const { palette } = useTheme();
  const session = useSession();
  useOpenScreen(session);
  return (
    <ThemeProvider value={palette.scheme === 'dark' ? navDark : navLight}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
        }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Protected guard={session.status === 'signed-in' && !session.locked}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
      <StatusBar style={palette.scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

/** A navigator's state, as far as the screen in front: the focused route at each level. */
type FocusedState = { index?: number; routes: readonly { params?: object; state?: FocusedState }[] };

/**
 * The params the screen in front was given, from the navigation state itself.
 * Not the address's (`useGlobalSearchParams`): a screen a sign-in replaced its
 * way to is given its params, while the address keeps none of them. A navigator
 * not yet in the state carries where it goes as `{ screen, params }`, followed
 * down to the screen's own.
 */
function focusedParams(state: FocusedState | undefined): Record<string, string> {
  let route = state?.routes[state.index ?? state.routes.length - 1];
  while (route?.state) route = route.state.routes[route.state.index ?? route.state.routes.length - 1];
  let params = route?.params as Record<string, unknown> | undefined;
  while (typeof params?.screen === 'string' && typeof params.params === 'object' && params.params !== null) {
    params = params.params as Record<string, unknown>;
  }
  return Object.fromEntries(
    Object.entries(params ?? {}).filter(
      (entry): entry is [string, string] => entry[0] !== 'screen' && typeof entry[1] === 'string',
    ),
  );
}

/**
 * The tab screen in front, kept for the person whose session is open, so that a
 * sign-in after the session ends returns to it (Gate 24 parity, G4;
 * `lib/view/return-to.ts`). Any other screen — Sign in, the Face ID question —
 * is none. Signed out, nothing is kept: the end has already been noted, by the
 * session, before the guard took the tabs away.
 */
function useOpenScreen(session: SessionContextValue) {
  const segments = useSegments();
  const navigation = useRootNavigationState() as FocusedState | undefined;
  const userId = session.status === 'signed-in' && !session.locked ? session.session.user.userId : null;
  const pathname = `/${segments.join('/')}`;
  // The params as text, so the effect runs when they change, not at every render.
  const query = JSON.stringify(focusedParams(navigation));
  useEffect(() => {
    if (!userId) {
      noteOpenScreen(null);
      return;
    }
    noteOpenScreen(pathname.startsWith('/(tabs)') ? { userId, pathname, params: JSON.parse(query) } : null);
  }, [userId, pathname, query]);
}

export default function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  // The appearance this device kept (Settings › Appearance; Gate 24 parity,
  // G2), read before the first frame — the splash stays until it is — so the
  // app never opens in another and switches, as the website applies its stored
  // theme before first paint. Dark when none was kept, the design's default.
  const [appearance, setAppearance] = useState<ThemeMode | null>(null);

  useEffect(() => {
    void readAppearance().then(setAppearance);
  }, []);

  useEffect(() => {
    if (loaded && appearance) SplashScreen.hideAsync();
  }, [loaded, appearance]);

  if (!loaded || !appearance) return null;

  return (
    <NocturneThemeProvider initialMode={appearance} onModeChange={writeAppearance}>
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
