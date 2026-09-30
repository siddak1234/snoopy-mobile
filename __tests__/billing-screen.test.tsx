jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AppState, Linking, Platform } from 'react-native';

import BillingScreen from '@/app/(tabs)/settings/billing';
import { PlatformError } from '@/lib/platform/problem';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation } = jest.requireMock('@/lib/platform/client');

const PLANS = {
  plans: [
    { planId: 'free', displayName: 'Free', capabilities: { 'automation.subscribe': 1 } },
    { planId: 'team', displayName: 'Team', capabilities: { 'automation.subscribe': 10, 'workspace.rate': 120 }, price: { amount: 4900, currency: 'usd', interval: 'month' } },
    { planId: 'custom', displayName: 'Custom', capabilities: {}, price: { amount: 100, currency: 'bhd' } },
  ],
};

let openURL: jest.SpyInstance;
let listen: jest.SpyInstance;
let changed: ((state: string) => void) | undefined;
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  changed = undefined;
  listen = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    changed = handler as (state: string) => void;
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => {
  openURL.mockRestore();
  listen.mockRestore();
});

function route(role: 'owner' | 'member', billing: unknown = { workspaceId: TEST_WORKSPACE, planId: 'free', displayName: 'Free' }) {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces', {
    workspaces: [{ id: TEST_WORKSPACE, name: 'Acme', type: 'organization', role }],
    activeWorkspaceId: TEST_WORKSPACE,
  });
  fake.always('GET /v1/plans', PLANS);
  fake.always('GET /v1/workspaces/{workspaceId}/billing', billing);
  return fake;
}

function on(os: 'ios' | 'android') {
  return jest.replaceProperty(Platform, 'OS', os);
}

describe('Billing (24.6.1, ADR-0032 option B)', () => {
  it('shows every platform the plan, its price and status — and Android no purchase control or call to action', async () => {
    const android = on('android');
    route('owner', { workspaceId: TEST_WORKSPACE, planId: 'team', displayName: 'Team', status: 'past_due' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Status: past due')).toBeTruthy();
    expect(screen.getByText('$49.00 per month')).toBeTruthy();
    expect(screen.queryByText('Manage billing')).toBeNull();
    expect(screen.queryByText('Choose plan')).toBeNull();
    expect(screen.queryByText(/use Manage billing/)).toBeNull();
    expect(screen.queryByText('Price shown at checkout')).toBeNull();
    android.restore();
  });

  it('on iOS, opens the hosted checkout in the system browser, and nothing but https', async () => {
    const ios = on('ios');
    const fake = route('owner');
    fake.once('POST /v1/workspaces/{workspaceId}/billing/checkout', { url: 'https://checkout.stripe.com/c/abc', expiresAt: '2026-09-30T00:00:00Z' });
    fake.once('POST /v1/workspaces/{workspaceId}/billing/checkout', { url: 'javascript:alert(1)', expiresAt: '2026-09-30T00:00:00Z' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findAllByText('Price shown at checkout')).toHaveLength(2);

    const choose = screen.getAllByText('Choose plan');
    await fireEvent.press(choose[0]!);
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://checkout.stripe.com/c/abc'));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/billing/checkout')[0]!.body).toEqual({ planId: 'team' });

    // Back from the browser: the controls are live again, and a bad address is refused.
    await act(async () => changed?.('active'));
    await fireEvent.press((await screen.findAllByText('Choose plan'))[0]!);
    expect(await screen.findByText('The billing service answered an unusable address.')).toBeTruthy();
    expect(openURL).toHaveBeenCalledTimes(1);
    ios.restore();
  });

  it('on iOS, sends a workspace with no billing account from the portal to a plan', async () => {
    const ios = on('ios');
    const fake = route('owner');
    fake.always('POST /v1/workspaces/{workspaceId}/billing/portal', () => {
      throw new PlatformError('No billing account', 409);
    });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByText('Manage billing'));
    expect(await screen.findByText('This workspace has no billing account yet. Choose a plan below to start one.')).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
    ios.restore();
  });

  it('reads billing again when the app comes back from the hosted page', async () => {
    const ios = on('ios');
    const fake = route('owner');
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    await screen.findByText('CURRENT PLAN');
    const reads = fake.to('GET /v1/workspaces/{workspaceId}/billing').length;
    await act(async () => changed?.('active'));
    await waitFor(() => expect(fake.to('GET /v1/workspaces/{workspaceId}/billing').length).toBe(reads + 1));
    ios.restore();
  });

  it("is an owner's or admin's: a member is told who manages it, and nothing is read", async () => {
    const fake = route('member');
    await renderWithProviders(<BillingScreen />, sessionAs('member'));
    expect(await screen.findByText('Billing is managed by the owners and admins of this workspace.')).toBeTruthy();
    expect(fake.to('GET /v1/workspaces/{workspaceId}/billing')).toHaveLength(0);
    expect(fake.to('GET /v1/plans')).toHaveLength(0);
  });

  it('says billing is unavailable when no provider is configured, never a false plan', async () => {
    const fake = route('owner');
    fake.always('GET /v1/plans', () => {
      throw new PlatformError('Not configured', 503);
    });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Billing is unavailable right now.')).toBeTruthy();
  });
});
