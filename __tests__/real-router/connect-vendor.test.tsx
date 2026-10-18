jest.mock('@/lib/platform/connections', () => ({
  ...jest.requireActual('@/lib/platform/connections'),
  connectOAuthProvider: jest.fn(),
}));

import { router } from 'expo-router';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import type { Subscription } from '@/lib/platform/automations';
import type { Connection } from '@/lib/platform/catalog';
import { connectOAuthProvider } from '@/lib/platform/connections';
import { invoiceProcessingV4Entry, planSubscriptionsPayload, providersWithQuickBooks } from '@/test/platform';
import { WORKSPACE, answerPlatform, flush, launch, signedInOnThisPhone } from '@/test/real-router';

/**
 * The flow page's integration row (step 2 since Build 22) → Connect integration
 * (~~Connect vendor~~) → a tap → back, under the real
 * router (CLAUDE.md rule 11: the params a screen takes on arrival): the vendor
 * page opens with the flow and the step's field, a tap saves the choice and
 * goes back to the same flow page — no Done, no second page — which reads the
 * flow again and draws what was saved (Build 21, spec A2; the owner's build 20
 * item 2: "It should just take me back to the set up page and be saved. If i
 * need to connect then after i click and connection happens then it shoukd
 * take me back").
 */

jest.setTimeout(60_000);

const mockConnect = connectOAuthProvider as jest.Mock;

const quickbooks: Connection = {
  id: 'c-qb',
  providerId: 'quickbooks',
  workspaceId: WORKSPACE,
  externalAccount: { id: 'realm-1', displayName: 'books@example.com' },
  status: 'connected',
  requiredScopes: [],
  grantedScopes: [],
  usedByCount: 0,
};

/** Invoice Processing v4, live, holding `vendor`; the platform keeps what a save sends (`saved`), and the connections it is told. */
function platformHolding(vendor: string, connections: Connection[], saved: string) {
  const flow: Subscription = {
    ...planSubscriptionsPayload().subscriptions[0]!,
    id: 'ip-1',
    workspaceId: WORKSPACE,
    templateId: 'invoice-processing',
    templateVersion: 4,
    status: 'live',
    config: { vendor, holdAboveAmount: 500 },
    setup: invoiceProcessingV4Entry().setup,
  };
  const state = { flow, connections, saves: 0 };
  answerPlatform(
    {
      [`/v1/workspaces/${WORKSPACE}/subscriptions`]: () => ({ subscriptions: [state.flow] }),
      [`/v1/workspaces/${WORKSPACE}/subscriptions/ip-1`]: () => {
        state.saves += 1;
        state.flow = { ...state.flow, config: { ...state.flow.config, vendor: saved } };
        return { subscription: state.flow };
      },
      [`/v1/workspaces/${WORKSPACE}/connections`]: () => ({ connections: state.connections }),
    },
    {
      '/automations': { automations: [invoiceProcessingV4Entry()], categories: ['All', 'Accounting'] },
      '/connections/providers': providersWithQuickBooks(),
    },
  );
  return state;
}

async function openFlowPage() {
  const view = await launch();
  await act(async () => router.push({ pathname: '/(tabs)/flows/detail', params: { flow: 'ip-1' } }));
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/flows/detail');
  return view;
}

it("a tap on None saves it and comes back to the same flow page, which draws it — no Done, no Save", async () => {
  signedInOnThisPhone();
  const state = platformHolding('quickbooks', [quickbooks], 'none');
  const view = await openFlowPage();
  const vendor = await screen.findByTestId('flow-vendor-vendor');
  expect(within(vendor).getByText('Connected')).toBeTruthy();

  await fireEvent.press(vendor);
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/flows/vendor');
  expect(view.getSearchParams()).toMatchObject({ flow: 'ip-1', field: 'vendor' });
  expect(screen.getByText('For Invoice Processing')).toBeTruthy();
  expect(screen.queryByText('Done')).toBeNull();

  await fireEvent.press(screen.getByTestId('vendor-none'));
  await flush(100);
  await flush(1000);
  expect(state.saves).toBe(1);
  expect(view.getPathname()).toBe('/flows/detail');
  // The flow read again on return: None, as saved.
  const after = await screen.findByTestId('flow-vendor-vendor');
  expect(await within(after).findByText('Save the details only.')).toBeTruthy();
  expect(screen.queryByText('For Invoice Processing')).toBeNull();
});

it('a vendor not connected: the tap signs in, then saves it and comes back — the flow page says it is connected', async () => {
  signedInOnThisPhone();
  const state = platformHolding('none', [], 'quickbooks');
  mockConnect.mockImplementation(async () => {
    state.connections = [quickbooks];
    return { status: 'connected', connection: quickbooks };
  });
  const view = await openFlowPage();
  await fireEvent.press(await screen.findByTestId('flow-vendor-vendor'));
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/flows/vendor');

  await fireEvent.press(screen.getByTestId('vendor-quickbooks'));
  await flush(100);
  await flush(1000);
  expect(mockConnect).toHaveBeenCalledTimes(1);
  expect(state.saves).toBe(1);
  expect(view.getPathname()).toBe('/flows/detail');
  const after = await screen.findByTestId('flow-vendor-vendor');
  expect(await within(after).findByText('QuickBooks Online')).toBeTruthy();
  expect(within(after).getByText('Connected')).toBeTruthy();
});

/**
 * Build 22 (P1, P5; the owner's build 21 item 5: "When i select this step it
 * should take me to the page where i can edit in a screen the email it should
 * send to"): step 5's row opens Who gets the email in the Flows tab with the
 * flow it takes on arrival, and Back comes home to the same flow page.
 */
it('step 5 opens Who gets the email for this flow, and Back comes back to the flow page', async () => {
  signedInOnThisPhone();
  platformHolding('none', [], 'none');
  const view = await openFlowPage();
  const email = await screen.findByTestId('flow-email');
  expect(await within(email).findByText('owner@example.com')).toBeTruthy();
  expect(within(email).getByText('and 2 more')).toBeTruthy();

  await fireEvent.press(email);
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/flows/email');
  expect(view.getSearchParams()).toMatchObject({ flow: 'ip-1' });
  expect(await screen.findByText('Who gets the email')).toBeTruthy();
  expect(screen.getByText('For Invoice Processing')).toBeTruthy();

  await act(async () => router.back());
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/flows/detail');
  expect(await screen.findByTestId('flow-email')).toBeTruthy();
});
