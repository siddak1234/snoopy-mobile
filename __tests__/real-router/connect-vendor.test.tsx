import { router } from 'expo-router';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { invoiceProcessingEntry, providersWithQuickBooks } from '@/test/platform';
import { WORKSPACE, answerPlatform, flush, launch, press, signedInOnThisPhone } from '@/test/real-router';

/**
 * Set up → Connect vendor → Done, under the real router (CLAUDE.md rule 11: the
 * params a screen takes on arrival): the vendor page opens with the flow's
 * template and the choice Set up holds, and Done returns to that same Set up —
 * not a second one — carrying the choice, which Set up then draws (the
 * Invoice Processing update, spec §3.B, §3.C).
 */

jest.setTimeout(60_000);

const CONNECTED = {
  connections: [
    {
      id: 'c-qb',
      providerId: 'quickbooks',
      workspaceId: WORKSPACE,
      externalAccount: { id: 'realm-1', displayName: 'Acme Books' },
      status: 'connected' as const,
      requiredScopes: [],
      grantedScopes: [],
      usedByCount: 0,
    },
  ],
};

it("Done on Connect vendor returns to the flow's Set up with the vendor chosen", async () => {
  signedInOnThisPhone();
  answerPlatform(
    {},
    {
      '/automations': { automations: [invoiceProcessingEntry()], categories: ['All', 'Accounting'] },
      '/subscriptions': { subscriptions: [] },
      '/connections/providers': providersWithQuickBooks(),
      [`${WORKSPACE}/connections`]: CONNECTED,
    },
  );
  const view = await launch();
  // Setup for the flow, as Add opens it.
  await act(async () => router.push({ pathname: '/(tabs)/flows/setup', params: { template: 'invoice-processing' } }));
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/flows/setup');
  expect(within(await screen.findByTestId('setup-vendor')).getByText('None')).toBeTruthy();

  await press('Connect vendor ›');
  expect(view.getPathname()).toBe('/flows/vendor');
  expect(view.getSearchParams()).toMatchObject({ template: 'invoice-processing', vendor: 'none' });
  expect(screen.getByText('For Invoice Processing')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('vendor-quickbooks-choice'));
  await flush(100);
  await press('Done');
  expect(view.getPathname()).toBe('/flows/setup');
  expect(view.getSearchParams()).toMatchObject({ template: 'invoice-processing', vendor: 'quickbooks' });
  const vendor = await screen.findByTestId('setup-vendor');
  expect(within(vendor).getByLabelText('QuickBooks')).toBeTruthy();
  expect(within(vendor).queryByText('None')).toBeNull();
  // The one Set up, not a second over it: the vendor page is gone from the stack.
  expect(screen.queryByText('For Invoice Processing')).toBeNull();
});
