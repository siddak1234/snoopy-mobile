import { router } from 'expo-router';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import type { AutomationItems, Item, Run, Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';
import { methodOf, planSubscriptionsPayload, runsPayload } from '@/test/platform';
import { WORKSPACE, answerPlatform, flush, launch, pressTab, signedInOnThisPhone } from '@/test/real-router';

/**
 * A run's page under the real router (builds 37 and 39: the owner's item 10,
 * "When a run starts i want to see the steps 1-x … the meta data … should be
 * through the run details button for a separate page", and his words of
 * 2026-11-06: "this is more of the activity and then once done you are taken
 * to the candidates page with the extracted items and score, when selected
 * back you see all candidates and when pressed back again you see all the
 * jobs"). A run started on Home opens in the Flows tab over its flow's page —
 * and its job's, for a flow with items — on its steps face; once it reads
 * succeeded it turns into its result in place, so Back goes job → flow page.
 * A run opened from Activity is on its steps face while it goes; failed, it
 * stays there; held, it is approved there. Run details holds only its
 * metadata. The flows are made up: no flow's word or id is the app's.
 */

jest.setTimeout(90_000);

/** Which tab the tab bar shows selected. */
function selectedTab(): string | undefined {
  const bar = screen.getByTestId('tab-bar');
  return within(bar)
    .getAllByRole('tab')
    .find((tab) => tab.props.accessibilityState?.selected)?.props.accessibilityLabel;
}

async function settle() {
  await flush(100);
  await flush(1000);
}

/** The top screen's own Back circle (a screen behind it may draw one too). */
async function pressBack() {
  const backs = await screen.findAllByLabelText('Back');
  await fireEvent.press(backs[backs.length - 1]!);
  await settle();
}

const DECLARED: AutomationItems = {
  words: { singular: 'Policy', plural: 'Policies' },
  runWords: { singular: 'Contract', plural: 'Contracts' },
  titleField: 'name',
  fields: [{ key: 'name', title: 'Name', control: 'text', required: true }],
  file: { key: 'policyFile', title: 'Policy file', description: 'A PDF.', acceptedContentTypes: ['application/pdf'] },
};

const NOTE = { key: 'note', title: 'Note', description: 'A line.', control: 'text' as const, required: false };
const BASE = planSubscriptionsPayload().subscriptions[0]!;
const WITH_ITEMS: Subscription = {
  ...BASE,
  id: 'pol-1',
  name: 'Policy Check',
  workspaceId: WORKSPACE,
  templateId: 'policy-check',
  status: 'live',
  projectId: null,
  setup: [],
  runInput: [NOTE],
  items: DECLARED,
};
const WITHOUT_ITEMS: Subscription = {
  ...BASE,
  id: 'sum-1',
  name: 'Summary Writer',
  workspaceId: WORKSPACE,
  templateId: 'summary-writer',
  status: 'live',
  projectId: null,
  setup: [],
  runInput: [NOTE],
};

const PIPELINE = [
  { id: 'receive', kicker: 'TRIGGER' as const, title: 'Contract received', description: 'A contract arrives.' },
  { id: 'score', kicker: 'ACTION' as const, title: 'Contract scored', description: 'It is scored.' },
];
const entry = (templateId: string, name: string, items?: AutomationItems): CatalogEntry => ({
  templateId,
  version: 1,
  name,
  description: `${name}, made up.`,
  category: 'Operations',
  icon: 'Files',
  monthlyPriceUsd: 0,
  subscribed: true,
  available: true,
  usesAi: true,
  requiredConnections: [],
  setup: [],
  pipeline: PIPELINE,
  ...(items ? { items } : {}),
});

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

const run = (id: string, subscriptionId: string, status: Run['status'], over: Partial<Run> = {}): Run => ({
  id,
  workspaceId: WORKSPACE,
  subscriptionId,
  templateId: subscriptionId === 'pol-1' ? 'policy-check' : 'summary-writer',
  templateVersion: 1,
  status,
  origin: 'manual',
  rootRunId: id,
  requestId: `req-${id}`,
  createdAt: '2026-10-21T10:00:00Z',
  updatedAt: '2026-10-21T10:01:00Z',
  ...over,
});

const step = (stepId: string, outcome: 'ok' | 'held' | 'failed', runId: string) => ({
  id: `${runId}-${stepId}`,
  runId,
  workspaceId: WORKSPACE,
  stepId,
  outcome,
  summary: 'made up',
  occurredAt: '2026-10-21T10:00:30Z',
});

/**
 * The platform: the two flows, the item, and each run as `runs` says it is now
 * (a test moves it on). The start answers `started`.
 */
function platform(runs: Record<string, () => unknown>, started?: Run) {
  const reads: string[] = [];
  answerPlatform(
    {
      [`/v1/workspaces/${WORKSPACE}/subscriptions`]: () => ({ subscriptions: [WITH_ITEMS, WITHOUT_ITEMS] }),
      [`/v1/workspaces/${WORKSPACE}/subscriptions/pol-1/items`]: () => ({ items: [ITEM], choices: {} }),
      [`/v1/workspaces/${WORKSPACE}/items/i-1`]: () => {
        reads.push('item');
        return { item: ITEM, runs: [], blocks: [{ type: 'text', text: 'Contracts', style: 'label' }], going: false };
      },
      [`/v1/workspaces/${WORKSPACE}/runs`]: (_path, execute) =>
        methodOf(execute) === 'POST' ? { run: started } : runsPayload(),
      ...Object.fromEntries(Object.entries(runs).map(([id, answer]) => [`/v1/workspaces/${WORKSPACE}/runs/${id}`, answer])),
    },
    {
      '/automations': {
        automations: [entry('policy-check', 'Policy Check', DECLARED), entry('summary-writer', 'Summary Writer')],
        categories: ['All'],
      },
    },
  );
  return reads;
}

/** A run's read: its steps and its page body. */
const detail = (r: Run, steps: ReturnType<typeof step>[], blocks: unknown[] = []) => ({
  run: { ...r, startedAt: r.createdAt, ...(r.status === 'succeeded' || r.status === 'failed' ? { endedAt: r.updatedAt } : {}) },
  steps,
  events: [],
  files: [],
  blocks,
});

it("Home › Start on a flow with items: the steps face; read succeeded, the result in place; Back → the job → the flow page (the owner's 2026-11-06 words)", async () => {
  signedInOnThisPhone();
  let now: 'running' | 'succeeded' = 'running';
  const RUNNING = run('r-1', 'pol-1', 'running', { itemId: 'i-1' });
  const DONE = run('r-1', 'pol-1', 'succeeded', { itemId: 'i-1', title: 'Northwind lease', score: 77 });
  const reads = platform(
    {
      'r-1': () =>
        now === 'running'
          ? detail(RUNNING, [step('receive', 'ok', 'r-1')])
          : detail(DONE, [step('receive', 'ok', 'r-1'), step('score', 'ok', 'r-1')], [{ type: 'text', text: 'Scored 77', style: 'body' }]),
    },
    run('r-1', 'pol-1', 'pending', { itemId: 'i-1' }),
  );
  const view = await launch();
  const form = within(await screen.findByTestId('home-flow-pol-1-form'));
  expect((await screen.findByTestId('home-flow-pol-1-item')).props.accessibilityLabel).toBe('Policy: Leases');
  await fireEvent.press(form.getByTestId('start-run-button'));
  await settle();

  // In the Flows tab, the run on its steps face: the flow's name, the job's title, STEPS, Run details last.
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'run']);
  expect(view.getSearchParams()).toMatchObject({ runId: 'r-1' });
  expect(view.getSearchParams().returnTo).toBeUndefined();
  expect(selectedTab()).toBe('Flows');
  expect((await screen.findByTestId('run-title')).props.children).toBe('Policy Check');
  expect((await screen.findByTestId('run-job')).props.children).toBe('Leases');
  const steps = within(screen.getByTestId('run-progress'));
  expect(steps.getByText('STEPS')).toBeTruthy();
  expect(steps.getByText('1 · Contract received')).toBeTruthy();
  expect(steps.getByText('2 · Contract scored')).toBeTruthy();
  expect(screen.queryByText('View flow')).toBeNull();
  expect(screen.getByText('Cancel run')).toBeTruthy();

  // The run reads succeeded (read again every 2 s): the result face in place — nothing pushed.
  now = 'succeeded';
  await settle();
  await settle();
  await settle();
  expect((await screen.findByTestId('run-title')).props.children).toBe('Northwind lease');
  expect(screen.getByTestId('run-score').props.children).toBe('77');
  expect(screen.queryByTestId('run-progress')).toBeNull();
  expect(screen.getByText('View flow')).toBeTruthy();
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'run']);
  // The job read twice in all: by its page under the run, and once by the run's page — never per re-read.
  expect(reads).toEqual(['item', 'item']);

  // Back: the job (all its candidates), then the flow page (all its jobs).
  await pressBack();
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'item']);
  expect(view.getSearchParams()).toMatchObject({ item: 'i-1' });
  await pressBack();
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'detail']);
  expect(view.getSearchParams()).toMatchObject({ flow: 'pol-1' });
  expect(await screen.findByTestId('flow-item-i-1')).toBeTruthy();
});

it('Home › Start on a flow without items: the run in Flows over its flow page; Back → the flow page', async () => {
  signedInOnThisPhone();
  const RUNNING = run('r-2', 'sum-1', 'running');
  platform({ 'r-2': () => detail(RUNNING, [step('receive', 'ok', 'r-2')]) }, run('r-2', 'sum-1', 'pending'));
  const view = await launch();
  const form = within(await screen.findByTestId('home-flow-sum-1-form'));
  await fireEvent.press(form.getByTestId('start-run-button'));
  await settle();
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'run']);
  expect((await screen.findByTestId('run-title')).props.children).toBe('Summary Writer');
  expect(screen.queryByTestId('run-job')).toBeNull();
  expect(await screen.findByTestId('run-progress')).toBeTruthy();
  await pressBack();
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'detail']);
  expect(view.getSearchParams()).toMatchObject({ flow: 'sum-1' });
  expect(selectedTab()).toBe('Flows');
});

it("a flow page's Start run: the run in the Flows stack over it; Back → the flow page", async () => {
  signedInOnThisPhone();
  const RUNNING = run('r-3', 'sum-1', 'running');
  platform({ 'r-3': () => detail(RUNNING, [step('receive', 'ok', 'r-3')]) }, run('r-3', 'sum-1', 'pending'));
  const view = await launch();
  await act(async () => router.push({ pathname: '/(tabs)/flows/detail', params: { flow: 'sum-1' } }));
  await settle();
  await fireEvent.press(await screen.findByTestId('start-run-button'));
  await settle();
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'run']);
  expect(view.getSearchParams()).toMatchObject({ runId: 'r-3' });
  expect(await screen.findByTestId('run-progress')).toBeTruthy();
  await pressBack();
  expect(view.getSegments()).toEqual(['(tabs)', 'flows', 'detail']);
  expect(view.getSearchParams()).toMatchObject({ flow: 'sum-1' });
});

it("Activity: a running run's row opens its steps face; Run details shows only the metadata — no STEPS", async () => {
  signedInOnThisPhone();
  const RUNNING = run('r-4', 'sum-1', 'running');
  platform({ 'r-4': () => detail(RUNNING, [step('receive', 'ok', 'r-4')]) });
  const view = await launch();
  await pressTab('Activity');
  await act(async () => router.push({ pathname: '/(tabs)/activity/run', params: { runId: 'r-4' } }));
  await settle();
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  expect((await screen.findByTestId('run-title')).props.children).toBe('Summary Writer');
  expect(within(screen.getByTestId('run-progress')).getByText('1 · Contract received')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('run-open-details'));
  await settle();
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run-details']);
  expect(await screen.findByTestId('run-fact-Run ID')).toBeTruthy();
  for (const fact of ['Started', 'Ended', 'Trigger']) expect(screen.getByTestId(`run-fact-${fact}`)).toBeTruthy();
  expect(screen.getByText('Duration')).toBeTruthy();
  expect(screen.getByText('Steps done')).toBeTruthy();
  expect(screen.queryByTestId('run-progress')).toBeNull();
  expect(screen.queryByText('STEPS')).toBeNull();
});

it('a failed run stays on its steps face: the step that failed, and no result', async () => {
  signedInOnThisPhone();
  const FAILED = run('r-5', 'sum-1', 'failed', { failureReason: 'The file could not be read.' });
  platform({ 'r-5': () => detail(FAILED, [step('receive', 'failed', 'r-5')]) });
  const view = await launch();
  await act(async () => router.push({ pathname: '/(tabs)/activity/run', params: { runId: 'r-5' } }));
  await settle();
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  const steps = within(await screen.findByTestId('run-progress'));
  expect(steps.getByText('1 · Contract received')).toBeTruthy();
  expect(steps.getByText('The file could not be read.')).toBeTruthy();
  expect(screen.queryByText('View flow')).toBeNull();
  expect(screen.queryByText('Cancel run')).toBeNull();
  expect(screen.getByTestId('run-open-details')).toBeTruthy();
});

it('a held run is approved from its steps face', async () => {
  signedInOnThisPhone();
  let decided = false;
  const HELD = run('r-6', 'sum-1', 'held');
  const RUNNING = run('r-6', 'sum-1', 'running');
  const decisions: string[] = [];
  platform({
    'r-6': () =>
      decided
        ? detail(RUNNING, [step('receive', 'ok', 'r-6')])
        : detail(HELD, [step('receive', 'held', 'r-6')], [
            { type: 'questions', form: { kind: 'approval', approvalId: 'ap-6', eligibleRoles: ['owner', 'admin'] } },
          ]),
  });
  const view = await launch();
  await act(async () => router.push({ pathname: '/(tabs)/activity/run', params: { runId: 'r-6' } }));
  await settle();
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
  expect(await screen.findByTestId('run-progress')).toBeTruthy();
  const approve = await screen.findByTestId('run-decision-approve');
  answerPlatformDecision(decisions, () => {
    decided = true;
  });
  await fireEvent.press(approve);
  await settle();
  expect(decisions).toEqual(['ap-6']);
  expect(screen.queryByTestId('run-decision-approve')).toBeNull();
  expect(await screen.findByTestId('run-progress')).toBeTruthy();
  expect(view.getSegments()).toEqual(['(tabs)', 'activity', 'run']);
});

/** The decision route, answered on top of what the platform already answers. */
function answerPlatformDecision(decisions: string[], onDecide: () => void) {
  const { platformOperation } = jest.requireMock('@/lib/platform/client') as { platformOperation: jest.Mock };
  const before = platformOperation.getMockImplementation()!;
  platformOperation.mockImplementation(async (path: string, execute: unknown) => {
    const decision = /\/approvals\/([^/]+)\/decision$/u.exec(path);
    if (decision) {
      decisions.push(decision[1]!);
      onDecide();
      return { approval: { id: decision[1], status: 'approved' } };
    }
    return before(path, execute);
  });
}
