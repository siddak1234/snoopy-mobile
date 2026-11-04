import { router } from 'expo-router';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { PlatformError } from '@/lib/platform/problem';
import { flowCatalogPayload, methodOf, runsPayload, subscriptionsPayload } from '@/test/platform';
import { WORKSPACE, answerPlatform, asInProduction, flush, launch, pressTab, signedInOnThisPhone } from '@/test/real-router';

/**
 * The health data agreement under the real router (Round 21 stage 2, C3;
 * CLAUDE.md rule 11, README "Verification": the params a screen takes on
 * arrival). Opened over the screen whose add or run was refused, it is a
 * screen of the Flows tab with what was refused and for which workspace;
 * accepted, it goes back to that screen. Opened from Home's YOUR FLOWS, it is
 * Home's own copy, so Back stays on Home (the review's finding 7).
 */

jest.setTimeout(60_000);

/** Which tab the tab bar shows selected. */
function selectedTab(): string | undefined {
  const bar = screen.getByTestId('tab-bar');
  return within(bar)
    .getAllByRole('tab')
    .find((tab) => tab.props.accessibilityState?.selected)?.props.accessibilityLabel;
}

const AGREEMENT = { version: 1, text: 'This Business Associate Agreement is made between {Covered Entity} and Autom8x.', sha256: 'a'.repeat(64) };
/** What the acceptance answers. */
const DOCUMENT = {
  id: '00000000-0000-4000-8000-0000000000d1',
  kind: 'health-data',
  version: 1,
  signerName: 'Dana Reyes',
  signerTitle: 'Practice manager',
  acceptedAt: '2026-11-03T15:00:00Z',
};

it('opens in the Flows tab with what was refused; accepted, it goes back to the screen that opened it', async () => {
  signedInOnThisPhone();
  const accepted: string[] = [];
  answerPlatform({
    '/v1/agreements/health-data': () => AGREEMENT,
    [`/v1/workspaces/${WORKSPACE}/agreements`]: (_path, execute) => {
      accepted.push(methodOf(execute) ?? '');
      return { document: DOCUMENT };
    },
  });
  const view = await launch();
  await act(async () => router.push('/(tabs)/flows'));
  await flush(100);
  await flush(1000);
  await act(async () => router.push({ pathname: '/(tabs)/flows/agreement', params: { action: 'run', workspace: WORKSPACE } }));
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'agreement']);
  expect(view.getSearchParams()).toMatchObject({ action: 'run', workspace: WORKSPACE });
  expect(selectedTab()).toBe('Flows');
  expect(await screen.findByText('Accept and start run')).toBeTruthy();
  expect(screen.getByText("I'm authorized to sign for Acme")).toBeTruthy();

  await fireEvent.press(within(screen.getByTestId('agreement-authorized')).getByRole('switch'));
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Dana Reyes');
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Practice manager');
  await fireEvent.press(screen.getByTestId('agreement-accept'));
  await flush(100);
  await flush(1000);
  expect(accepted).toEqual(['POST']);
  expect(view.getPathname()).toBe('/flows');
});

it("opened by a Start run on Home's YOUR FLOWS, it is Home's own screen: Back without accepting stays on Home, nothing more sent", async () => {
  signedInOnThisPhone();
  const NOTE = { key: 'note', title: 'Note', description: 'A line.', control: 'text' as const, required: false };
  // Invoice triage live, with one field of its run's: its row opens to Start run.
  const subscriptions = subscriptionsPayload();
  subscriptions.subscriptions = subscriptions.subscriptions.map((row) => (row.id === 'invoice' ? { ...row, runInput: [NOTE] } : row));
  const catalog = flowCatalogPayload();
  catalog.automations = catalog.automations.map((entry) => ({ ...entry, subscribed: true }));
  const starts: string[] = [];
  answerPlatform(
    {
      '/v1/agreements/health-data': () => AGREEMENT,
      [`/v1/workspaces/${WORKSPACE}/runs`]: (_path, execute) => {
        if (methodOf(execute) !== 'POST') return runsPayload();
        starts.push('POST');
        throw new PlatformError('Forbidden', 403, 'FORBIDDEN', { reason: 'agreement_required', kind: 'health-data', version: 1 });
      },
    },
    { '/automations': catalog, '/subscriptions': subscriptions },
  );
  const view = await launch();
  // The Flows tab visited first, as a person does: its stack holds its list, where a Back in it would land.
  await pressTab('Flows');
  await pressTab('Home');
  await fireEvent.press(await screen.findByTestId('home-flow-invoice'));
  await flush(100);
  const form = within(screen.getByTestId('home-flow-invoice-form'));
  await fireEvent.changeText(form.getByLabelText('Note'), 'From Home');
  await fireEvent.press(form.getByTestId('start-run-button'));
  await flush(100);
  await flush(1000);
  expect(await screen.findByText('Accept and start run')).toBeTruthy();
  const opened = { segments: view.getSegments(), params: view.getSearchParams(), tab: selectedTab() };

  await asInProduction(async () => {
    await fireEvent.press(screen.getAllByLabelText('Back')[0]!);
    await flush(100);
    await flush(1000);
  });
  const back = { pathname: view.getPathname(), segments: view.getSegments(), tab: selectedTab() };
  expect({ opened, back }).toEqual({
    opened: { segments: ['(tabs)', '(home)', 'agreement'], params: expect.objectContaining({ action: 'run', workspace: WORKSPACE }), tab: 'Home' },
    back: { pathname: '/', segments: ['(tabs)', '(home)'], tab: 'Home' },
  });
  expect(starts).toEqual(['POST']);
  expect(screen.getByTestId('home-flow-invoice-form')).toBeTruthy();
});
