import React from 'react';
import { screen } from '@testing-library/react-native';

import TemplatesScreen from '@/app/(tabs)/flows/templates';
import SettingsScreen from '@/app/(tabs)/settings';
import type { SessionContextValue } from '@/hooks/use-session';
import { errorTitleFor } from '@/lib/content/screen-states';
import { PlatformError, PlatformUnreachableError } from '@/lib/platform/problem';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * A screen reading the platform, in each state the design draws.
 *
 * Templates is the first screen wired, and it is the pattern the rest follow:
 * one workspace-scoped read and the shared refusal states. Each case below is a
 * different screen in `Screen.dc.html`, which is why they are asserted
 * separately rather than as "not ready".
 */

const WORKSPACE = '11111111-1111-4111-8111-111111111111';

const signedIn: SessionContextValue = {
  status: 'signed-in',
  session: {
    user: { userId: 'u1', email: 'dana@example.com', activeWorkspaceId: WORKSPACE },
    workspaces: [{ id: WORKSPACE, name: 'Acme', role: 'owner' }],
  } as SessionContextValue extends { session: infer S } ? S : never,
  refresh: () => {},
  signIn: async () => ({ status: 'unconfigured', message: '' }),
  signOut: async () => ({ revoked: true }),
};

const unconfigured: SessionContextValue = {
  status: 'unconfigured',
  refresh: () => {},
  signIn: async () => ({ status: 'unconfigured', message: '' }),
  signOut: async () => ({ revoked: true }),
};

const CATALOG = {
  automations: [
    {
      templateId: 'acme.reconcile',
      version: 1,
      name: 'Ledger reconcile',
      description: 'Match the ledger against the bank feed',
      category: 'Finance',
      icon: 'receipt',
      monthlyPriceUsd: 49,
      subscribed: false,
      available: true,
      setup: [],
    },
  ],
  categories: ['All', 'Finance'],
};

beforeEach(() => platformOperation.mockReset());

describe('Templates, wired to the catalog', () => {
  it('renders the platform’s automations and its own category vocabulary', async () => {
    platformOperation.mockResolvedValue(CATALOG);
    await renderWithProviders(<TemplatesScreen />, signedIn);

    // The server's name, not the fixture's — and the fixture's six are gone.
    expect(await screen.findByText('Ledger reconcile')).toBeTruthy();
    expect(screen.queryByText('Invoice capture')).toBeNull();
    // `categories` is rendered rather than invented, as the contract requires.
    // Twice on purpose: once as a filter chip, once as the card's own label.
    expect(screen.getAllByText('Finance')).toHaveLength(2);
    // The fixture's vocabulary had five chips; the server sent two.
    expect(screen.queryByText('Reporting')).toBeNull();
  });

  it('requests the workspace-scoped catalog path', async () => {
    platformOperation.mockResolvedValue(CATALOG);
    await renderWithProviders(<TemplatesScreen />, signedIn);
    await screen.findByText('Ledger reconcile');

    expect(platformOperation).toHaveBeenCalledWith(
      `/v1/workspaces/${WORKSPACE}/automations`,
      expect.any(Function),
    );
  });

  it('shows the loading skeleton while the read is in flight', async () => {
    platformOperation.mockImplementation(() => new Promise(() => {}));
    await renderWithProviders(<TemplatesScreen />, signedIn);
    expect(screen.getByTestId('screen-loading')).toBeTruthy();
  });

  it('shows the offline state when the request never landed', async () => {
    platformOperation.mockRejectedValue(new PlatformUnreachableError());
    await renderWithProviders(<TemplatesScreen />, signedIn);
    expect(await screen.findByTestId('screen-offline')).toBeTruthy();
  });

  it('names what failed when the platform refused', async () => {
    platformOperation.mockRejectedValue(new PlatformError('Service Unavailable', 503));
    await renderWithProviders(<TemplatesScreen />, signedIn);
    expect(await screen.findByTestId('screen-error')).toBeTruthy();
    expect(screen.getByText(errorTitleFor('templates'))).toBeTruthy();
  });

  it('shows the designed failure state when the build has no backend', async () => {
    // Owner decision 2026-08-17: no prototype fallback. A build with no backend
    // genuinely could not load this, and the screen now says so.
    await renderWithProviders(<TemplatesScreen />, unconfigured);
    expect(await screen.findByTestId('screen-error')).toBeTruthy();
    expect(platformOperation).not.toHaveBeenCalled();
  });
});

describe('Settings CONNECTIONS, wired to the platform', () => {
  const PROVIDERS = {
    providers: [
      { providerId: 'gmail', displayName: 'Gmail', description: '', scopes: [], authType: 'oauth2' },
      { providerId: 'slack', displayName: 'Slack', description: '', scopes: [], authType: 'oauth2' },
    ],
  };
  const CONNECTIONS = {
    connections: [
      {
        id: 'c1',
        providerId: 'gmail',
        workspaceId: WORKSPACE,
        externalAccount: { id: 'a1', displayName: 'ap@acme.co' },
        status: 'connected',
        requiredScopes: [],
        grantedScopes: [],
        usedByCount: 2,
      },
    ],
  };

  // Settings makes three reads now — providers, connections and the catalog (the
  // last for the plan totals) — so the mock routes by path rather than answering
  // everything with one body.
  function routeReads() {
    platformOperation.mockImplementation((path: string) => {
      if (path === '/v1/connections/providers') return Promise.resolve(PROVIDERS);
      if (path.endsWith('/automations')) return Promise.resolve(CATALOG);
      return Promise.resolve(CONNECTIONS);
    });
  }

  it('renders usedByCount as the design words it, and pluralises', async () => {
    routeReads();
    await renderWithProviders(<SettingsScreen />, signedIn);
    // `usedByCount` is the one field no single service can answer, and it is
    // exactly the design's "used by 2 solutions" — so nothing is invented here.
    expect(await screen.findByText('Connected · used by 2 solutions')).toBeTruthy();
  });

  it('shows a provider with no connection at all, which the connections read omits', async () => {
    routeReads();
    await renderWithProviders(<SettingsScreen />, signedIn);
    // Driven by the provider list for this reason: Slack has no connection row,
    // and the design still draws it as "Not connected".
    expect(await screen.findByText('Slack')).toBeTruthy();
    expect(screen.getByText('Not connected')).toBeTruthy();
  });

  it('replaces the screen when the read fails, per the design', async () => {
    platformOperation.mockRejectedValue(new PlatformError('Service Unavailable', 503));
    await renderWithProviders(<SettingsScreen />, signedIn);
    expect(await screen.findByTestId('screen-error')).toBeTruthy();
    expect(screen.getByText(errorTitleFor('settings'))).toBeTruthy();
  });

  it('shows the designed failure state when the build has no backend', async () => {
    await renderWithProviders(<SettingsScreen />, unconfigured);
    expect(await screen.findByTestId('screen-error')).toBeTruthy();
    expect(platformOperation).not.toHaveBeenCalled();
  });
});
