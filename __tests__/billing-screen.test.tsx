jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { AppState, Linking, Platform } from 'react-native';

import SettingsScreen from '@/app/(tabs)/settings';
import BillingScreen from '@/app/(tabs)/settings/billing';
import { PlatformError } from '@/lib/platform/problem';
import type { PurchasablePlan, WorkspaceBilling } from '@/lib/platform/billing';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation } = jest.requireMock('@/lib/platform/client');

// Listed as the platform orders them (by id): Pro before Plus. The cards go by price.
// Each carries the model allowance every plan has since Round 17 (backend 25.2.4, `model.calls`).
const PLANS: { plans: PurchasablePlan[] } = {
  plans: [
    { planId: 'pro', displayName: 'Pro', capabilities: { 'automation.subscribe': 20, 'workspace.rate': 240, 'model.calls': 2500 }, price: { amount: 1000, currency: 'usd', interval: 'month' } },
    { planId: 'team', displayName: 'Plus', capabilities: { 'automation.subscribe': 5, 'workspace.rate': 120, 'model.calls': 250 }, price: { amount: 500, currency: 'usd', interval: 'month' } },
  ],
};
const FREE_FLOOR: WorkspaceBilling = { workspaceId: TEST_WORKSPACE, planId: 'free', displayName: 'Free' };
const ON_PLUS: WorkspaceBilling = { workspaceId: TEST_WORKSPACE, planId: 'team', displayName: 'Plus', status: 'active', currentPeriodEnd: '2026-10-30T12:00:00Z' };
const CHECKOUT = 'POST /v1/workspaces/{workspaceId}/billing/checkout';
const PORTAL = 'POST /v1/workspaces/{workspaceId}/billing/portal';

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

function route(role: 'owner' | 'member', billing: WorkspaceBilling = FREE_FLOOR) {
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

/** A card's own words, by its plan id. */
const card = (planId: string) => within(screen.getByTestId(`plan-${planId}`));

describe('Billing (24.6.1, ADR-0032 option B; the cards since 24.12)', () => {
  it('shows Free, Plus and Pro in that order, each its name and price only — the workspace\'s own "Enrolled" with its status', async () => {
    const android = on('android');
    route('owner', { ...ON_PLUS, status: 'past_due' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    // The status is the website's pill (Gate 24's parity pass, G25; "Status: past due" until then).
    expect(await screen.findByText('Past due')).toBeTruthy();
    expect(screen.getAllByTestId(/^plan-/u).map((element) => element.props.testID)).toEqual([
      'plan-free',
      'plan-team',
      'plan-pro',
    ]);
    expect(card('free').getByText('Free')).toBeTruthy();
    expect(card('free').getByText('$0.00 per month')).toBeTruthy();
    expect(card('team').getByText('Plus')).toBeTruthy();
    expect(card('team').getByText('$5.00 per month')).toBeTruthy();
    expect(card('pro').getByText('$10.00 per month')).toBeTruthy();
    expect(card('team').getByText('Enrolled')).toBeTruthy();
    expect(card('team').getByText('Past due')).toBeTruthy();
    expect(screen.getAllByText('Enrolled')).toHaveLength(1);
    // No capability lines: name and price only.
    expect(screen.queryByText(/^Flows /u)).toBeNull();
    expect(screen.queryByText(/Requests per minute/u)).toBeNull();
    // Nor the model allowance (backend 25.2.4): no key drawn unlabelled, and no figure.
    expect(screen.queryByText(/model|calls/iu)).toBeNull();
    expect(screen.queryByText(/\b2,?500\b|\b250\b/u)).toBeNull();
    android.restore();
  });

  it('on Android offers no purchase control or call to action: a card does nothing', async () => {
    const android = on('android');
    const fake = route('owner');
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByText('Pro'));
    await fireEvent.press(screen.getByText('Plus'));
    expect(fake.to(CHECKOUT)).toHaveLength(0);
    expect(fake.to(PORTAL)).toHaveLength(0);
    expect(screen.queryByText('Manage billing')).toBeNull();
    expect(screen.queryByText('Price shown at checkout')).toBeNull();
    expect(openURL).not.toHaveBeenCalled();
    android.restore();
  });

  it("on iOS, not paying: a paid plan's card opens the hosted checkout for THAT plan, and nothing but https", async () => {
    const ios = on('ios');
    const fake = route('owner');
    fake.once(CHECKOUT, { url: 'https://checkout.stripe.com/c/pro', expiresAt: '2026-09-30T00:00:00Z' });
    fake.once(CHECKOUT, { url: 'https://checkout.stripe.com/c/plus', expiresAt: '2026-09-30T00:00:00Z' });
    fake.once(CHECKOUT, { url: 'javascript:alert(1)', expiresAt: '2026-09-30T00:00:00Z' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    // On the free floor: Free is the one enrolled, and there is nothing to manage yet.
    expect(card('free').getByText('Enrolled')).toBeTruthy();
    expect(screen.queryByText('Manage billing')).toBeNull();

    await fireEvent.press(await screen.findByText('Pro'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://checkout.stripe.com/c/pro'));
    expect(fake.to(CHECKOUT)[0]!.body).toEqual({ planId: 'pro' });

    // Back from the browser: the cards are live again.
    await act(async () => changed?.('active'));
    await fireEvent.press(await screen.findByText('Plus'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://checkout.stripe.com/c/plus'));
    expect(fake.to(CHECKOUT)[1]!.body).toEqual({ planId: 'team' });

    await act(async () => changed?.('active'));
    await fireEvent.press(await screen.findByText('Pro'));
    expect(await screen.findByText('The billing service answered an unusable address.')).toBeTruthy();
    expect(openURL).toHaveBeenCalledTimes(2);
    expect(fake.to(PORTAL)).toHaveLength(0);
    ios.restore();
  });

  it('on iOS, paying: another card opens Manage billing — the portal — never a second checkout', async () => {
    const ios = on('ios');
    const fake = route('owner', ON_PLUS);
    fake.always(PORTAL, { url: 'https://billing.stripe.com/p/session', expiresAt: '2026-09-30T00:00:00Z' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Enrolled')).toBeTruthy();
    expect(card('team').getByText('Enrolled')).toBeTruthy();
    expect(card('team').getByText(/^Renews /u)).toBeTruthy();
    expect(card('team').getByText('Manage billing')).toBeTruthy();
    // Free is cancelling the paid plan in the portal (build 13 decision 7c).
    expect(card('free').getByText('To move to Free, cancel Plus in Manage billing.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Pro'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://billing.stripe.com/p/session'));
    await act(async () => changed?.('active'));
    await fireEvent.press(await screen.findByText('Free'));
    await waitFor(() => expect(fake.to(PORTAL)).toHaveLength(2));
    await act(async () => changed?.('active'));
    await fireEvent.press(await screen.findByText('Manage billing'));
    await waitFor(() => expect(fake.to(PORTAL)).toHaveLength(3));
    expect(fake.to(CHECKOUT)).toHaveLength(0);
    ios.restore();
  });

  it("says an active plan's status too, as the website's pill does — every status while the plan lasts (Gate 24's parity pass, G25)", async () => {
    const android = on('android');
    route('owner', ON_PLUS);
    const active = await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Active')).toBeTruthy();
    expect(card('team').getByText('Active')).toBeTruthy();
    // Until G25 an active plan said no status, and any other said "Status: …".
    expect(screen.queryByText(/^Status: /u)).toBeNull();
    await active.unmount();

    route('owner', { ...ON_PLUS, status: 'trialing' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Trialing')).toBeTruthy();
    expect(card('team').getByText('Trialing')).toBeTruthy();
    android.restore();
  });

  it('incomplete: the pill says Incomplete on the enrolled paid plan — the fourth status while a plan lasts (G25; the review of #50)', async () => {
    const android = on('android');
    route('owner', { ...ON_PLUS, status: 'incomplete' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Incomplete')).toBeTruthy();
    expect(card('team').getByText('Incomplete')).toBeTruthy();
    expect(card('team').getByText('Enrolled')).toBeTruthy();
    android.restore();
  });

  it('unpaid: Free is enrolled and has Manage billing, which opens the portal, never a checkout; cancelled, nothing to manage; Android, no control (G25)', async () => {
    const ios = on('ios');
    const fake = route('owner', { ...ON_PLUS, status: 'unpaid' });
    fake.always(PORTAL, { url: 'https://billing.stripe.com/p/session', expiresAt: '2026-09-30T00:00:00Z' });
    const unpaid = await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Manage billing')).toBeTruthy();
    // Access has ended, so Free is the enrolled card — the website's Free card, with Manage billing.
    expect(card('free').getByText('Enrolled')).toBeTruthy();
    expect(card('free').getByText('Manage billing')).toBeTruthy();
    expect(card('team').queryByText('Enrolled')).toBeNull();
    // No pill for a status that ended access, and no line about moving to Free.
    expect(screen.queryByText(/^Unpaid$/iu)).toBeNull();
    expect(screen.queryByText(/^To move to Free/u)).toBeNull();
    await fireEvent.press(card('free').getByText('Manage billing'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://billing.stripe.com/p/session'));
    expect(fake.to(PORTAL)).toHaveLength(1);
    expect(fake.to(CHECKOUT)).toHaveLength(0);
    await unpaid.unmount();

    route('owner', { ...ON_PLUS, status: 'canceled' });
    const cancelled = await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Enrolled')).toBeTruthy();
    expect(card('free').getByText('Enrolled')).toBeTruthy();
    expect(screen.queryByText('Manage billing')).toBeNull();
    await cancelled.unmount();
    ios.restore();

    const android = on('android');
    route('owner', { ...ON_PLUS, status: 'unpaid' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Enrolled')).toBeTruthy();
    expect(screen.queryByText('Manage billing')).toBeNull();
    android.restore();
  });

  it('on iOS, a checkout refused because the workspace already has a plan (409 plan_exists) opens Manage billing', async () => {
    const ios = on('ios');
    const fake = route('owner');
    fake.always(CHECKOUT, () => {
      throw new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'plan_exists' });
    });
    fake.always(PORTAL, { url: 'https://billing.stripe.com/p/session', expiresAt: '2026-09-30T00:00:00Z' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    await fireEvent.press(await screen.findByText('Plus'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://billing.stripe.com/p/session'));
    expect(fake.to(CHECKOUT)).toHaveLength(1);
    expect(fake.to(PORTAL)).toHaveLength(1);
    expect(screen.queryByText('Conflict')).toBeNull();
    ios.restore();
  });

  it('on iOS, sends a workspace the portal has no billing account for to a plan', async () => {
    const ios = on('ios');
    const fake = route('owner', ON_PLUS);
    fake.always(PORTAL, () => {
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
    await screen.findByText('Enrolled');
    const reads = fake.to('GET /v1/workspaces/{workspaceId}/billing').length;
    await act(async () => changed?.('active'));
    await waitFor(() => expect(fake.to('GET /v1/workspaces/{workspaceId}/billing').length).toBe(reads + 1));
    ios.restore();
  });

  it("reads the workspace's billing afresh at every visit — twice inside the 120 s window is two GETs — while the Settings index's plan line reads once through the snapshot (the build 11 review)", async () => {
    const fake = route('owner', ON_PLUS);
    const reads = () => fake.to('GET /v1/workspaces/{workspaceId}/billing').length;

    // The index's quiet line (D1), opened twice: one request, shared.
    for (let visit = 0; visit < 2; visit += 1) {
      const index = await renderWithProviders(<SettingsScreen />, sessionAs('owner'));
      expect(await index.findByText('Plus')).toBeTruthy();
      await index.unmount();
    }
    expect(reads()).toBe(1);

    // The page, opened twice inside the window: a real request each time, as at
    // daef007 — a plan read before Stripe's webhook landed is not kept for it.
    for (let visit = 0; visit < 2; visit += 1) {
      const page = await renderWithProviders(<BillingScreen />, sessionAs('owner'));
      expect(await page.findByText('Enrolled')).toBeTruthy();
      await page.unmount();
    }
    expect(reads()).toBe(3);

    // What the page read serves the line: no request of its own.
    const index = await renderWithProviders(<SettingsScreen />, sessionAs('owner'));
    expect(await index.findByText('Plus')).toBeTruthy();
    expect(reads()).toBe(3);
  });

  it("shows a member the cards without actions and who manages billing; this workspace's billing is not read", async () => {
    const ios = on('ios');
    const fake = route('member');
    await renderWithProviders(<BillingScreen />, sessionAs('member'));
    expect(await screen.findByText('Billing is managed by the owners and admins of this workspace.')).toBeTruthy();
    expect(card('pro').getByText('$10.00 per month')).toBeTruthy();
    expect(screen.queryByText('Enrolled')).toBeNull();
    await fireEvent.press(screen.getByText('Pro'));
    expect(fake.to(CHECKOUT)).toHaveLength(0);
    expect(screen.queryByText('Manage billing')).toBeNull();
    expect(fake.to('GET /v1/workspaces/{workspaceId}/billing')).toHaveLength(0);
    // The plans are anyone's to read; the workspace's plan and status are not.
    expect(fake.to('GET /v1/plans')).toHaveLength(1);
    ios.restore();
  });

  // The platform lists Plus only — production until Pro's price exists: Pro is the app's, drawn at the owner's price.
  const PLUS_ONLY = { plans: [PLANS.plans[1]!] };
  const HOSTED = { url: 'https://checkout.stripe.com/c/x', expiresAt: '2026-09-30T00:00:00Z' };

  it('draws Pro at $10.00 per month after Plus when the platform does not list it, and that card does nothing on iOS — not paying, it opens no checkout (build 11, D2)', async () => {
    const ios = on('ios');
    const fake = route('owner');
    fake.always('GET /v1/plans', PLUS_ONLY);
    fake.always(CHECKOUT, HOSTED);
    fake.always(PORTAL, HOSTED);
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Enrolled')).toBeTruthy();
    expect(screen.getAllByTestId(/^plan-/u).map((element) => element.props.testID)).toEqual(['plan-free', 'plan-team', 'plan-pro']);
    expect(card('pro').getByText('Pro')).toBeTruthy();
    expect(card('pro').getByText('$10.00 per month')).toBeTruthy();
    expect(card('pro').queryByText('Price shown at checkout')).toBeNull();
    expect(screen.queryByText('No plans are available to purchase right now.')).toBeNull();
    await fireEvent.press(screen.getByText('Pro'));
    expect(fake.to(CHECKOUT)).toHaveLength(0);
    expect(fake.to(PORTAL)).toHaveLength(0);
    expect(openURL).not.toHaveBeenCalled();
    // Plus, listed, still checks out: the drawn card is the only inert one.
    await fireEvent.press(screen.getByText('Plus'));
    await waitFor(() => expect(fake.to(CHECKOUT)).toHaveLength(1));
    expect(fake.to(CHECKOUT)[0]!.body).toEqual({ planId: 'team' });
    ios.restore();
  });

  it('the drawn Pro opens no portal while paying either — the portal has no Pro to switch to', async () => {
    const ios = on('ios');
    const fake = route('owner', ON_PLUS);
    fake.always('GET /v1/plans', PLUS_ONLY);
    fake.always(PORTAL, { url: 'https://billing.stripe.com/p/session', expiresAt: '2026-09-30T00:00:00Z' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Manage billing')).toBeTruthy();
    await fireEvent.press(screen.getByText('Pro'));
    expect(fake.to(PORTAL)).toHaveLength(0);
    expect(openURL).not.toHaveBeenCalled();
    // Free, a listed plan's rule: another card opens Manage billing.
    await fireEvent.press(screen.getByText('Free'));
    await waitFor(() => expect(fake.to(PORTAL)).toHaveLength(1));
    ios.restore();
  });

  it('draws the Pro on Android too, inert like every card there', async () => {
    const android = on('android');
    const fake = route('owner');
    fake.always('GET /v1/plans', PLUS_ONLY);
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByTestId('plan-pro')).toBeTruthy();
    expect(card('pro').getByText('$10.00 per month')).toBeTruthy();
    await fireEvent.press(screen.getByText('Pro'));
    expect(fake.to(CHECKOUT)).toHaveLength(0);
    expect(fake.to(PORTAL)).toHaveLength(0);
    android.restore();
  });

  it('draws the Pro for a member too, inert, with the workspace\'s billing still not read', async () => {
    const ios = on('ios');
    const fake = route('member');
    fake.always('GET /v1/plans', PLUS_ONLY);
    await renderWithProviders(<BillingScreen />, sessionAs('member'));
    expect(await screen.findByText('Billing is managed by the owners and admins of this workspace.')).toBeTruthy();
    expect(card('pro').getByText('$10.00 per month')).toBeTruthy();
    await fireEvent.press(screen.getByText('Pro'));
    expect(fake.to(CHECKOUT)).toHaveLength(0);
    expect(fake.to('GET /v1/workspaces/{workspaceId}/billing')).toHaveLength(0);
    ios.restore();
  });

  it('a Pro the platform lists replaces the drawn one: three cards, the listed price, a real checkout', async () => {
    const ios = on('ios');
    const fake = route('owner');
    fake.once(CHECKOUT, { url: 'https://checkout.stripe.com/c/pro', expiresAt: '2026-09-30T00:00:00Z' });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Enrolled')).toBeTruthy();
    expect(screen.getAllByTestId(/^plan-/u)).toHaveLength(3);
    expect(screen.getAllByText('Pro')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Pro'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://checkout.stripe.com/c/pro'));
    expect(fake.to(CHECKOUT)[0]!.body).toEqual({ planId: 'pro' });
    ios.restore();
  });

  it('with nothing listed: Free and the drawn Pro, and the line that nothing can be bought right now', async () => {
    const ios = on('ios');
    const fake = route('owner');
    fake.always('GET /v1/plans', { plans: [] });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('No plans are available to purchase right now.')).toBeTruthy();
    expect(screen.getAllByTestId(/^plan-/u).map((element) => element.props.testID)).toEqual(['plan-free', 'plan-pro']);
    ios.restore();
  });

  it('says billing is unavailable when no provider is configured, never a false plan', async () => {
    const fake = route('owner');
    fake.always('GET /v1/plans', () => {
      throw new PlatformError('Not configured', 503);
    });
    await renderWithProviders(<BillingScreen />, sessionAs('owner'));
    expect(await screen.findByText('Billing is unavailable right now.')).toBeTruthy();
    expect(screen.queryByTestId('plan-free')).toBeNull();
  });
});
