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
 * Flows; Back from the item comes home to the same flow page. Since build 28
 * the item's "{File title}" row opens its file's page in Flows with the item,
 * and a run's "View {file}" row its file's page in Activity with the run and
 * the file (F4, F7). Since Round 21 those rows are the platform's blocks
 * (backend ADR-0048), and a block's press goes where its typed target says.
 * The flow is made up: no flow's word or id is written in the app.
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
  positiveCount: 0,
  negativeCount: 0,
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

const POLICY = { id: 'f-1', filename: 'policy.pdf', contentType: 'application/pdf', format: 'PDF', sizeBytes: 2048, pages: 1 };
const CONTRACT = { ...POLICY, id: 'f-9', filename: 'northwind.pdf' };

/** The item's body: its file row, then its runs, each opening its run. */
const ITEM_BLOCKS = [
  { type: 'file', title: 'Policy file', open: { target: 'item-file', itemId: 'i-1' } },
  { type: 'text', text: 'Contracts', style: 'label' },
  { type: 'list', items: [{ lead: '1', title: 'Northwind lease', value: '77', valueLabel: 'Score', open: { target: 'run', runId: 'r-1' } }] },
];
/** The run's body: its "View contract file" row. */
const RUN_BLOCKS = [{ type: 'file', title: 'View contract file', open: { target: 'run-file', runId: 'r-1', fileId: 'f-9' } }];

function platformWithItems() {
  answerPlatform(
    {
      [`/v1/workspaces/${WORKSPACE}/subscriptions`]: () => ({ subscriptions: [FLOW] }),
      [`/v1/workspaces/${WORKSPACE}/subscriptions/pol-1/items`]: () => ({ items: [ITEM], choices: {} }),
      // Their page bodies, as the platform composes them (`shape=blocks`).
      [`/v1/workspaces/${WORKSPACE}/items/i-1`]: () => ({ item: ITEM, runs: [], blocks: ITEM_BLOCKS, going: false }),
      [`/v1/workspaces/${WORKSPACE}/runs/r-1`]: () => ({ run: RUN, steps: [], events: [], files: [CONTRACT], blocks: RUN_BLOCKS }),
      [`/v1/workspaces/${WORKSPACE}/items/i-1/file`]: () => ({ file: POLICY, downloadUrl: 'https://files.example.com/p?sig=1', expiresAt: '2026-10-24T12:00:00Z' }),
      [`/v1/workspaces/${WORKSPACE}/runs/r-1/files/f-9`]: () => ({ file: CONTRACT, downloadUrl: 'https://files.example.com/c?sig=1', expiresAt: '2026-10-24T12:00:00Z' }),
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

  await fireEvent.press(await screen.findByTestId('item-blocks-2-row-0'));
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

it("the item's file opens in Flows with the item, and a run's file in Activity with the run and the file; Back returns to each (build 28)", async () => {
  signedInOnThisPhone();
  platformWithItems();
  const view = await launch();
  await act(async () => router.push({ pathname: '/(tabs)/flows/item', params: { item: 'i-1' } }));
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'item']);

  await fireEvent.press(await screen.findByTestId('item-blocks-0'));
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'item-file']);
  expect(view.getSearchParams()).toMatchObject({ item: 'i-1' });
  expect((await screen.findByTestId('item-file-title')).props.children).toBe('Policy file');
  await act(async () => router.back());
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'item']);

  await fireEvent.press(await screen.findByTestId('item-blocks-2-row-0'));
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  await fireEvent.press(await screen.findByTestId('run-blocks-0'));
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run-file']);
  expect(view.getSearchParams()).toMatchObject({ runId: 'r-1', fileId: 'f-9' });
  expect((await screen.findByTestId('run-file-title')).props.children).toBe('Contract file');
  await act(async () => router.back());
  await flush(100);
  await flush(1000);
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
});
