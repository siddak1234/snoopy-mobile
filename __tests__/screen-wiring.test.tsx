import React from 'react';
import { screen } from '@testing-library/react-native';

import TemplatesScreen from '@/app/(tabs)/flows/templates';
import type { SessionContextValue } from '@/hooks/use-session';
import { errorTitleFor } from '@/lib/content/screen-states';
import { PlatformError, PlatformUnreachableError } from '@/lib/platform/problem';
import { renderWithProviders } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({ platformJson: jest.fn() }));
const { platformJson } = jest.requireMock('@/lib/platform/client');

/**
 * A screen reading the platform, in each state the design draws.
 *
 * Templates is the first screen wired, and it is the pattern the rest follow:
 * one workspace-scoped read, the three shared states, and the prototype's own
 * content left in place for an unconfigured build. Each case below is a
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

beforeEach(() => platformJson.mockReset());

describe('Templates, wired to the catalog', () => {
  it('renders the platform’s automations and its own category vocabulary', async () => {
    platformJson.mockResolvedValue(CATALOG);
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
    platformJson.mockResolvedValue(CATALOG);
    await renderWithProviders(<TemplatesScreen />, signedIn);
    await screen.findByText('Ledger reconcile');

    expect(platformJson).toHaveBeenCalledWith(`/v1/workspaces/${WORKSPACE}/automations`);
  });

  it('shows the loading skeleton while the read is in flight', async () => {
    platformJson.mockImplementation(() => new Promise(() => {}));
    await renderWithProviders(<TemplatesScreen />, signedIn);
    expect(screen.getByTestId('screen-loading')).toBeTruthy();
  });

  it('shows the offline state when the request never landed', async () => {
    platformJson.mockRejectedValue(new PlatformUnreachableError());
    await renderWithProviders(<TemplatesScreen />, signedIn);
    expect(await screen.findByTestId('screen-offline')).toBeTruthy();
  });

  it('names what failed when the platform refused', async () => {
    platformJson.mockRejectedValue(new PlatformError('Service Unavailable', 503));
    await renderWithProviders(<TemplatesScreen />, signedIn);
    expect(await screen.findByTestId('screen-error')).toBeTruthy();
    expect(screen.getByText(errorTitleFor('templates'))).toBeTruthy();
  });

  it('keeps the prototype browsable when the build has no backend', async () => {
    // The unconfigured case is why the fixture import still exists. If this ever
    // fails, the design prototype has stopped being browsable without a backend
    // — which is a decision, not a bug fix. See DESIGN-CONTRACT.md.
    await renderWithProviders(<TemplatesScreen />, unconfigured);
    expect(await screen.findByText('Invoice capture')).toBeTruthy();
    expect(platformJson).not.toHaveBeenCalled();
  });
});
