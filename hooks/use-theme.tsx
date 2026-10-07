import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  elevation,
  nocturneDark,
  nocturneLight,
  type Elevation,
  type NocturnePalette,
} from '@/constants/theme';

export type ThemeMode = 'dark' | 'light' | 'auto';

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  palette: NocturnePalette;
  elevation: Elevation;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The design's appearance control defaults to Dark (Settings → Appearance),
 *  with Light and Auto selectable.
 *
 *  `initialMode` exists so a caller can mount straight into an appearance
 *  rather than mounting dark and switching: the visual-regression suite, to
 *  capture both palettes, and since Gate 24 the app, with the appearance this
 *  device kept (`app/_layout.tsx`, read before the first frame). `onModeChange`
 *  is told each choice, which the app keeps (`lib/platform/appearance-store.ts`;
 *  Gate 24 parity, G2) — until then every cold launch returned to Dark. */
export function NocturneThemeProvider({
  children,
  initialMode = 'dark',
  onModeChange,
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode;
  onModeChange?: (mode: ThemeMode) => void;
}) {
  const system = useColorScheme();
  const [mode, setChosenMode] = useState<ThemeMode>(initialMode);
  const setMode = useCallback(
    (next: ThemeMode) => {
      setChosenMode(next);
      onModeChange?.(next);
    },
    [onModeChange],
  );

  const value = useMemo(() => {
    const resolved = mode === 'auto' ? (system === 'light' ? 'light' : 'dark') : mode;
    const palette = resolved === 'light' ? nocturneLight : nocturneDark;
    return { mode, setMode, palette, elevation: elevation(palette) };
  }, [mode, setMode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside NocturneThemeProvider');
  return ctx;
}
