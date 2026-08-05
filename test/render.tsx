import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SolutionsProvider } from '@/hooks/use-solutions';
import { NocturneThemeProvider } from '@/hooks/use-theme';

/** iPhone 16 Pro metrics — the design canvas device (402×874, 59pt notch). */
const initialMetrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

/** RTL v14 render is async — always await this. */
export function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <NocturneThemeProvider>
        <SolutionsProvider>{ui}</SolutionsProvider>
      </NocturneThemeProvider>
    </SafeAreaProvider>,
  );
}

export { mockRouter, setMockParams } from '@/test/mocks/expo-router';
