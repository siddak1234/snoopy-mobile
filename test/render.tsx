import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionContext, type SessionContextValue } from '@/hooks/use-session';
import { SolutionsProvider } from '@/hooks/use-solutions';
import { NocturneThemeProvider, type ThemeMode } from '@/hooks/use-theme';
import { WorkflowsProvider } from '@/hooks/use-workflows';

/** iPhone 16 Pro metrics — the design canvas device (402×874, 59pt notch). */
const initialMetrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

/**
 * Session state is supplied directly rather than by mounting `SessionProvider`.
 *
 * The real provider resolves its state from a request; letting every suite make
 * one would trade a deterministic render for an async state update in fifteen
 * files. Suites that care about the session state say so; the rest get
 * `unconfigured`, which is the design prototype's normal state and leaves the
 * route guard open.
 */
const defaultSession: SessionContextValue = {
  status: 'unconfigured',
  refresh: () => {},
  signIn: async () => ({ status: 'unconfigured', message: 'no backend in tests' }),
  signOut: async () => ({ revoked: true }),
};

/** RTL v14 render is async — always await this. */
export function renderWithProviders(
  ui: React.ReactElement,
  session: SessionContextValue = defaultSession,
  themeMode: ThemeMode = 'dark',
) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <NocturneThemeProvider initialMode={themeMode}>
        <SessionContext.Provider value={session}>
          <SolutionsProvider>
            <WorkflowsProvider>{ui}</WorkflowsProvider>
          </SolutionsProvider>
        </SessionContext.Provider>
      </NocturneThemeProvider>
    </SafeAreaProvider>,
  );
}

export { mockRedirect, mockRouter, setMockParams } from '@/test/mocks/expo-router';
