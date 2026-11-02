import { screen } from '@testing-library/react-native';
import React from 'react';

import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import SetupScreen from '@/app/(tabs)/flows/setup';
import ConnectVendorScreen from '@/app/(tabs)/flows/vendor';
import { UNARCHIVE_LABEL, errorTitleFor } from '@/lib/content/screen-states';
import type { Subscription } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fakePlatform } from '@/test/fake-platform';
import {
  invoiceProcessingV4Entry,
  planSubscriptionsPayload,
  providersWithQuickBooks,
  recipientsPayload,
  signedInSession,
} from '@/test/platform';
import { renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));

const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * §12.1 #319 step 2: the flow's page, Setup and the vendor page take the flow
 * they show — and its setup — from the flow's own read (`readSubscription`,
 * GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}), never the
 * list row. Here the LIST row carries no `setup` (as it will not once #319
 * step 3 lands) and the catalog's entry declares none, so only the single
 * read's setup can draw the vendor step: a screen that reads the list again
 * draws no step and fails.
 */

const ONE = 'GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}';

/** Invoice Processing v4, live, holding `vendor: none`: as the single read answers it, with its setup. */
const read: Subscription = {
  ...planSubscriptionsPayload().subscriptions[0]!,
  id: 'ip-1',
  templateId: 'invoice-processing',
  templateVersion: 4,
  status: 'live',
  config: { vendor: 'none', holdAboveAmount: 500 },
  setup: invoiceProcessingV4Entry().setup,
};
/** The same flow as a list row with no setup. */
const { setup: _setup, ...listRow } = read;

function route() {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces/{workspaceId}/automations', {
    automations: [{ ...invoiceProcessingV4Entry(), setup: [] }],
    categories: ['All', 'Accounting'],
  });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', (sent) => ({
    subscriptions: sent.query?.status === 'archived' ? [] : [listRow],
  }));
  fake.always(ONE, (sent) => {
    expect(sent.values.subscriptionId).toBe('ip-1');
    return { subscription: read };
  });
  fake.always('GET /v1/workspaces/{workspaceId}/run-stats', {
    workspace: counts(),
    subscriptions: [{ subscriptionId: 'ip-1', ...counts() }],
  });
  fake.always('GET /v1/connections/providers', providersWithQuickBooks());
  fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/project-directory', { projects: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/email-recipients', recipientsPayload());
  return fake;
}

function counts() {
  return { total: 0, pending: 0, running: 0, held: 0, succeeded: 0, failed: 0, cancelled: 0 };
}

beforeEach(() => {
  resetSnapshot();
});

describe("one flow's own read draws its setup when the list row carries none (§12.1 #319 step 2)", () => {
  it("the flow's page: step 2's integration row, from the single read", async () => {
    const fake = route();
    setMockParams({ flow: 'ip-1' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await screen.findByTestId('flow-vendor-vendor')).toBeTruthy();
    expect(fake.to(ONE)).toHaveLength(1);
  });

  it('Setup, for the flow Edit setup names: its vendor step, from the single read', async () => {
    const fake = route();
    setMockParams({ template: 'invoice-processing', flow: 'ip-1' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByTestId('setup-vendor-vendor')).toBeTruthy();
    expect(fake.to(ONE)).toHaveLength(1);
  });

  it("the vendor page: the step's vendors, from the single read", async () => {
    const fake = route();
    setMockParams({ flow: 'ip-1', field: 'vendor' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    expect(await screen.findByTestId('vendor-quickbooks')).toBeTruthy();
    expect(screen.getByTestId('vendor-none')).toBeTruthy();
    expect(fake.to(ONE)).toHaveLength(1);
  });
});

describe("one flow's own read, the cases the list cannot answer (§12.1 #319 step 2)", () => {
  /** The same flow, archived, as the single read answers it. */
  const archived: Subscription = { ...read, status: 'archived' };

  it("the flow's page: an archived flow neither list carries is drawn from its own read, read-only", async () => {
    const fake = route();
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', { subscriptions: [] });
    fake.always(ONE, { subscription: archived });
    setMockParams({ flow: 'ip-1' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await screen.findByText(/^This flow was archived/u)).toBeTruthy();
    expect(screen.getByText(UNARCHIVE_LABEL)).toBeTruthy();
  });

  it('Setup: a named flow this person cannot see (404) is none named; the template held in the workspace is shown', async () => {
    const fake = route();
    // The list holds the template's flow with its setup; the named one answers 404.
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', (sent) => ({
      subscriptions: sent.query?.status === 'archived' ? [] : [read],
    }));
    fake.always(ONE, () => {
      throw new PlatformError('Subscription not found', 404);
    });
    setMockParams({ template: 'invoice-processing', flow: 'ip-gone' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByTestId('setup-vendor-vendor')).toBeTruthy();
    expect(fake.to(ONE)).toHaveLength(1);
  });

  it('the vendor page: an archived single read is no flow to choose for — the error page with Back', async () => {
    const fake = route();
    fake.always(ONE, { subscription: archived });
    setMockParams({ flow: 'ip-1', field: 'vendor' });
    await renderWithProviders(<ConnectVendorScreen />, signedInSession);
    expect(await screen.findByText(errorTitleFor('vendor'))).toBeTruthy();
    expect(screen.queryByTestId('vendor-quickbooks')).toBeNull();
  });
});
