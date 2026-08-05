import React, { createContext, useContext, useMemo, useState } from 'react';
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
 *  with Light and Auto selectable. */
export function NocturneThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('dark');

  const value = useMemo(() => {
    const resolved = mode === 'auto' ? (system === 'light' ? 'light' : 'dark') : mode;
    const palette = resolved === 'light' ? nocturneLight : nocturneDark;
    return { mode, setMode, palette, elevation: elevation(palette) };
  }, [mode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside NocturneThemeProvider');
  return ctx;
}
