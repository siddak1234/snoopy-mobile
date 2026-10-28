import { type ErrorBoundaryProps } from 'expo-router';
import React, { useEffect } from 'react';

import { notDrawn } from '@/components/blocks/not-drawn';
import { ScreenError } from '@/components/screen-state';
import { NocturneThemeProvider } from '@/hooks/use-theme';
import { FALLBACK_ERROR_TITLE } from '@/lib/content/screen-states';

/**
 * The app's last boundary (round 21, design D2.6), exported by the root layout
 * as its `ErrorBoundary`: Expo Router wraps that layout, and so every screen
 * without a nearer one, in it. A screen that throws draws the failed-load state
 * here — "Couldn't load this", the session kept, Retry — instead of closing the
 * app, and the error is logged once (`notDrawn`, type `unknown`). Retry draws
 * the screens again. It is outside the root's providers, so it brings its own
 * theme, in the design's default Dark. Kept out of `app/_layout.tsx`, which the
 * coverage leaves out, so `audit:presses` sees its Retry pressed.
 */
export function RootBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => notDrawn('unknown', error), [error]);
  return (
    <NocturneThemeProvider>
      <ScreenError title={FALLBACK_ERROR_TITLE} onRetry={() => void retry()} />
    </NocturneThemeProvider>
  );
}
