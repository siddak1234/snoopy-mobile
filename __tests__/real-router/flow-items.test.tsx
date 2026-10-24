import { router } from 'expo-router';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import type { AutomationItems, Item, Run, Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';
import { planSubscriptionsPayload } from '@/test/platform';
import { WORKSPACE, answerPlatform, flush, launch, signedInOnThisPhone } from '@/test/real-router';

/**
 * A flow's items under the real router (Round 19, plan §5; CLAUDE.md rule 11,
 * README "Verification": the params a screen takes on arrival). A row on the
 * flow page opens the item's page in the Flows tab with the item it takes on
 * arrival; one of its runs opens the run's page in Activity's stack, from
 * Flows; Back from the item comes home to the same flow page. The flow is made
 * up: no flow's word or id is written in the app.
 */

jest.setTimeout(60_000);

const DECLARED: AutomationItems = {
  words: { singular: 'Policy', plural: 'Policies' },
  runWords: { singular: 'Contract', plural: 'Contracts' },
  titleField: 'name',
  fields: [{ key: 'name', title: 'Name', control: 'text', required: true }],
  file: { key: 'policyFile', title: 'Policy file', description: 'A PDF.', acceptedContentTypes: ['application/pdf'] },
};

const FLOW: Subscription = {
  ...planSubscriptionsPayload().subscriptions[0]!,
  id: 'pol-1',
  workspaceId: WORKSPACE,
  templateId: 'policy-check',
  status: 'live',
  setup: [],
  runInput: [{ key: 'contractFile', title: 'Contract file', description: 'A PDF.', control: 'artifact', required: false }],
  items: DECLARED,
};

const ENTRY: CatalogEntry = {
  templateId: 'policy-check',
  version: 1,
  name: 'Policy Check',
  description: 'Reads contracts against a policy.',
  category: 'Operations',
  icon: 'Files',
  monthlyPriceUsd: 0,
  subscribed: true,
  available: true,
  usesAi: true,
  requiredConnections: [],
  setup: [],
  pipeline: [{ id: 'receive', kicker: 'TRIGGER', title: 'Contract received', description: 'A contract arrives.' }],
  items: DECLARED,
};

const ITEM: Item = {
  id: 'i-1',
  subscriptionId: 'pol-1',
  title: 'Leases',
  fields: { name: 'Leases' },
  status: 'ready',
  runCount: 1,
  topScore: 77,
  createdAt: '2026-10-20T10:00:00Z',
  createdByUserId: null,
  archivedAt: null,
};

const RUN: Run = {
  id: 'r-1',
  workspaceId: WORKSPACE,
  subscriptionId: 'pol-1',
  templateId: 'policy-check',
  templateVersion: 1,
  status: 'succeeded',
  origin: 'manual',
  rootRunId: 'r-1',
  requestId: 'req-r-1',
  itemId: 'i-1',
  title: 'Northwind lease',
  score: 77,
  createdAt: '2026-10-21T10:00:00Z',
  updatedAt: '2026-10-21T10:01:00Z',
};

function platformWithItems() {
  answerPlatform(
    {
      [`/v1/workspaces/${WORKSPACE}/subscriptions`]: () => ({ subscriptions: [FLOW] }),
      [`/v1/workspaces/${WORKSPACE}/subscriptions/pol-1/items`]: () => ({ items: [ITEM], choices: {} }),
      [`/v1/workspaces/${WORKSPACE}/items/i-1`]: () => ({ item: ITEM, runs: [RUN] }),
      [`/v1/workspaces/${WORKSPACE}/runs/r-1`]: () => ({ run: RUN, steps: [], events: [] }),
    },
    { '/automations': { automations: [ENTRY], categories: ['All'] } },
  );
}

it("a row opens its item's page in Flows with the item; a run opens in Activity from Flows; Back comes home to the flow", async () => {
  signedInOnThisPhone();
  platformWithItems();
  const view = await launch();
  await act(async () => router.push({ pathname: '/(tabs)/flows/detail', params: { flow: 'pol-1' } }));
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/flows/detail');

  const row = await screen.findByTestId('flow-item-i-1');
  expect(within(row).getByText('1 contract · Top 77')).toBeTruthy();
  await fireEvent.press(row);
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'item']);
  expect(view.getSearchParams()).toMatchObject({ item: 'i-1' });
  expect((await screen.findByTestId('item-title')).props.children).toBe('Leases');

  await fireEvent.press(await screen.findByTestId('item-run-r-1'));
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  expect(view.getSearchParams()).toMatchObject({ runId: 'r-1', returnTo: 'flows' });
  expect((await screen.findByTestId('run-title')).props.children).toBe('Northwind lease');

  await act(async () => router.back());
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'item']);

  await act(async () => router.back());
  await flush(100);
  await flush(1000);
  expect(view.getPathname()).toBe('/flows/detail');
  expect(await screen.findByTestId('flow-item-i-1')).toBeTruthy();
});
