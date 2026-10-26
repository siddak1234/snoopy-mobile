import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator } from 'expo-image-manipulator';
import React from 'react';
import { Linking, StyleSheet } from 'react-native';

import RunDetailScreen from '@/app/(tabs)/activity/run';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import ItemScreen from '@/app/(tabs)/flows/item';
import { RunFileField } from '@/components/automations/run-file-field';
import { nocturneDark } from '@/constants/theme';
import type { SessionContextValue } from '@/hooks/use-session';
import {
  FLOW_QUEUE_FULL,
  ITEM_ARCHIVED,
  RUN_REFUSALS,
  UPLOAD_REFUSALS,
  itemRefusal,
  runRefusal,
} from '@/lib/content/refusals';
import { acceptedLine, allOf, countOf, inSentence } from '@/lib/content/screen-states';
import type { AutomationItems, AutomationRunInputField, Item, Run, Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';
import { PlatformError, PlatformRateLimitedError } from '@/lib/platform/problem';
import { RUN_FILE_TYPES } from '@/lib/platform/run-image';
import { RUN_REREAD_MS } from '@/lib/view/runs';
import { resetSnapshot } from '@/lib/platform/snapshot';
import {
  ALL_GROUPS,
  OTHER_CHOICE,
  groupItems,
  itemGroupChoices,
  itemFieldValues,
  itemFieldsComplete,
  itemRowLine,
  itemStatusLine,
  selectChoices,
  shownGroup,
} from '@/lib/view/items';
import { fixtureBlocks, visibleWords } from '@/test/blocks';
import { fakePlatform, type Answer } from '@/test/fake-platform';
import {
  TEST_WORKSPACE,
  planSubscriptionsPayload,
  providersWithQuickBooks,
  recipientsPayload,
  runDetailPayload,
  sessionAs,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

// Hoisted above the imports by babel-jest: the transport, and the pickers the file field calls.
jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
  putFileToSignedUrl: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
// The flow page's tiles read again at 20 ms here, so a read that should not be made shows at once.
jest.mock('@/lib/view/runs', () => ({ ...jest.requireActual('@/lib/view/runs'), FLOW_STATS_REREAD_MS: 20 }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const { platformOperation, newIdempotencyKey, putFileToSignedUrl } = jest.requireMock('@/lib/platform/client');

/**
 * Round 19 (backend ADR-0046, plan §5): a flow's items — things a person makes
 * once, from a file, that the flow's runs then belong to — drawn from the
 * platform's words alone. The flow here is made up ("Policy", "Contract",
 * "Region"), as no flow's own word or id may be written in the app: the flow
 * page lists its items grouped and offers Upload to owners and admins in place
 * of the run's start form; the upload card's select offers its options, the
 * names typed before and "Other"; the item page ranks its runs, offers Add and
 * Archive to owners and admins, and keeps "What AI read" closed; the run page
 * is headed by the run's title and score, its sections the first open; and a
 * file field offers the types its field names.
 */

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FLOW = 'pol-1';
const LISTED = '/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items';
const ONE = '/v1/workspaces/{workspaceId}/items/{itemId}';

const DECLARED: AutomationItems = {
  words: { singular: 'Policy', plural: 'Policies' },
  runWords: { singular: 'Contract', plural: 'Contracts' },
  titleField: 'name',
  groupField: 'region',
  fields: [
    { key: 'region', title: 'Region', control: 'select', options: ['North', 'South'], allowOther: true, defaultValue: 'North', required: true },
    { key: 'name', title: 'Name', control: 'text', maxLength: 60, required: true },
  ],
  file: { key: 'policyFile', title: 'Policy file', description: 'A PDF or Word file.', acceptedContentTypes: ['application/pdf', DOCX] },
};

const CONTRACT_FILE: AutomationRunInputField = {
  key: 'contractFile',
  title: 'Contract file',
  description: 'A PDF or Word file.',
  control: 'artifact',
  required: false,
  acceptedContentTypes: ['application/pdf', DOCX],
};

function flowWithItems(overrides: Partial<Subscription> = {}): Subscription {
  return {
    ...planSubscriptionsPayload().subscriptions[0]!,
    id: FLOW,
    templateId: 'policy-check',
    templateVersion: 1,
    status: 'live',
    setup: [],
    runInput: [CONTRACT_FILE],
    items: DECLARED,
    ...overrides,
  };
}

function entry(): CatalogEntry {
  return {
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
    pipeline: [
      { id: 'receive', kicker: 'TRIGGER', title: 'Contract received', description: 'A contract arrives.' },
      { id: 'review', kicker: 'AI STEP', title: 'Contract reviewed', description: 'AI reads it against the policy.' },
    ],
    items: DECLARED,
  };
}

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    subscriptionId: FLOW,
    title: `Policy ${id}`,
    fields: { region: 'North', name: `Policy ${id}` },
    status: 'ready',
    runCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    topScore: null,
    createdAt: '2026-10-20T10:00:00Z',
    createdByUserId: null,
    archivedAt: null,
    ...overrides,
  };
}

function run(id: string, overrides: Partial<Run> = {}): Run {
  return {
    id,
    workspaceId: TEST_WORKSPACE,
    subscriptionId: FLOW,
    templateId: 'policy-check',
    templateVersion: 1,
    status: 'succeeded',
    origin: 'manual',
    rootRunId: id,
    requestId: `req-${id}`,
    itemId: 'i-1',
    createdAt: '2026-10-21T10:00:00Z',
    updatedAt: '2026-10-21T10:01:00Z',
    ...overrides,
  };
}

let keys = 0;
beforeEach(() => {
  platformOperation.mockReset();
  resetSnapshot();
  keys = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++keys}`);
  putFileToSignedUrl.mockResolvedValue(undefined);
  (File as unknown as jest.Mock).mockImplementation(() => ({ size: 12, bytes: async () => new Uint8Array(12) }));
});

/* ───────────────────────────── the rules, on their own ───────────────────────────── */

describe("the items' rules (lib/view/items.ts)", () => {
  it('groups by groupField: the values A–Z, then none; each group A–Z by title — whatever the options\' order or the newest (build 28, F2–F3)', () => {
    // An order the options' (North, South) and the newest-first rule would each change.
    const items = [
      item('a', { title: 'Zoning', fields: { region: 'South' }, createdAt: '2026-10-20T10:00:00Z' }),
      item('b', { title: 'Wharf', fields: { region: 'West' }, createdAt: '2026-10-20T11:00:00Z' }),
      item('c', { title: 'Harbour', fields: { region: 'North' }, createdAt: '2026-10-20T09:00:00Z' }),
      item('d', { title: 'Docks', fields: { region: 'East' }, createdAt: '2026-10-20T12:00:00Z' }),
      item('e', { title: 'Allotments', fields: { region: 'South' }, createdAt: '2026-10-19T10:00:00Z' }),
      item('f', { title: 'Bridges', fields: {}, createdAt: '2026-10-20T08:00:00Z' }),
    ];
    const groups = groupItems(items, DECLARED);
    expect(groups.map((group) => [group.name, group.items.map((row) => row.title)])).toEqual([
      ['East', ['Docks']],
      ['North', ['Harbour']],
      ['South', ['Allotments', 'Zoning']],
      ['West', ['Wharf']],
      [null, ['Bridges']],
    ]);
    // A value chosen: that group alone; all of them, every group.
    expect(groupItems(items, DECLARED, 'South').map((group) => [group.name, group.items.map((row) => row.title)])).toEqual([
      ['South', ['Allotments', 'Zoning']],
    ]);
    expect(groupItems(items, DECLARED, ALL_GROUPS)).toEqual(groups);
    // A flow that groups nothing: one group, no name, A–Z.
    expect(groupItems([item('a', { title: 'Zoning' }), item('b', { title: 'Docks' })], {})).toEqual([
      { name: null, items: [item('b', { title: 'Docks' }), item('a', { title: 'Zoning' })] },
    ]);
  });

  it('the filter: "All {values}" in the field\'s own word, then the values the items hold, A–Z; a value gone reads as all', () => {
    const items = [
      item('a', { fields: { region: 'South' } }),
      item('b', { fields: { region: 'East' } }),
      item('c', { fields: { region: 'South' } }),
      item('d', { fields: {} }),
    ];
    const choices = itemGroupChoices(items, DECLARED);
    expect(choices).toEqual([
      { value: ALL_GROUPS, label: 'All regions' },
      { value: 'East', label: 'East' },
      { value: 'South', label: 'South' },
    ]);
    // Nothing to filter: a flow that groups nothing, or no items yet.
    expect(itemGroupChoices(items, { fields: DECLARED.fields })).toEqual([]);
    expect(itemGroupChoices([], DECLARED)).toEqual([]);
    expect(shownGroup(choices, 'East')).toBe('East');
    expect(shownGroup(choices, 'North')).toBe(ALL_GROUPS);
    // The field's word, made many.
    expect([allOf('Department'), allOf('Category'), allOf('Branch'), allOf('PO'), allOf('Address')]).toEqual([
      'All departments',
      'All categories',
      'All branches',
      'All POs',
      'All addresses',
    ]);
  });

  it("a row's line: the count in the flow's run words and the top score; Reading…; Couldn't read", () => {
    expect(itemRowLine(item('a', { runCount: 4, topScore: 86 }), DECLARED.runWords)).toBe('4 contracts · Top 86');
    expect(itemRowLine(item('a', { runCount: 1, topScore: null }), DECLARED.runWords)).toBe('1 contract');
    expect(itemRowLine(item('a', { status: 'reading' }), DECLARED.runWords)).toBe('Reading…');
    expect(itemRowLine(item('a', { status: 'failed' }), DECLARED.runWords)).toBe("Couldn't read");
    expect(itemStatusLine(item('a'), 'region')).toBe('North · Ready');
    expect(itemStatusLine(item('a', { status: 'failed', failureReason: 'No text found.' }), 'region')).toBe(
      "North · Couldn't read: No text found.",
    );
  });

  it('the flow\'s words in a sentence: lower-case, an abbreviation kept', () => {
    expect(inSentence('Contract')).toBe('contract');
    expect(inSentence('PDF')).toBe('PDF');
    expect(countOf(2, { singular: 'PO', plural: 'POs' })).toBe('2 POs');
  });

  it('a select offers its options, then the names typed before, then Other — typed names saved, Other sends what was typed', () => {
    const field = DECLARED.fields[0]!;
    expect(selectChoices(field, ['East', 'North', 'East']).map((choice) => choice.label)).toEqual(['North', 'South', 'East', 'Other']);
    // Each choice is sent as its own words; only Other stands for what is typed.
    expect(selectChoices(field, ['East']).map((choice) => choice.value)).toEqual(['North', 'South', 'East', OTHER_CHOICE]);
    expect(selectChoices({ ...field, allowOther: false }, ['East']).map((choice) => choice.label)).toEqual(['North', 'South', 'East']);
    expect(itemFieldValues(DECLARED.fields, { region: OTHER_CHOICE, name: '  Data  ' }, { region: ' West ' })).toEqual({
      region: 'West',
      name: 'Data',
    });
    // "Other" with nothing typed is no value; a required field without one is not complete.
    expect(itemFieldsComplete(DECLARED.fields, { region: OTHER_CHOICE, name: 'Data' }, {})).toBe(true); // the default stands in
    expect(itemFieldsComplete(DECLARED.fields, { region: 'North', name: ' ' }, {})).toBe(false);
  });

  it('a file field says its types in words', () => {
    expect(acceptedLine(['application/pdf', DOCX, 'image/jpeg', 'image/png'])).toBe('PDF, Word file or photo');
    expect(acceptedLine(['application/pdf', DOCX])).toBe('PDF or Word file');
    expect(acceptedLine(['text/csv'])).toBeNull();
    expect(acceptedLine(undefined)).toBeNull();
  });

  it("a refused item, and a run refused for its item, in the upload's and the run's words", () => {
    const refused = (status: number, reason: string) => new PlatformError('refused', status, undefined, { reason });
    expect(itemRefusal(refused(422, 'artifact_unavailable'))).toEqual({
      message: RUN_REFUSALS.artifact_unavailable,
      fileGone: true,
      fields: [],
    });
    expect(itemRefusal(refused(409, 'subscription_not_live'))).toEqual({
      message: UPLOAD_REFUSALS.subscription_not_live,
      fileGone: false,
      fields: [],
    });
    // The fields its problems name, read as `fields.<key>` against the item's own; nothing else.
    const problems = [
      { path: 'fields.name', message: 'must be at most 60 characters' },
      { path: 'fields.colour', message: 'was never declared in the manifest items' },
      { path: 'file', message: 'is required' },
    ];
    expect(itemRefusal(new PlatformError('refused', 422, undefined, { problems }), ['region', 'name'])).toEqual({
      message: 'Nothing was uploaded. Check each value and try again.',
      fileGone: false,
      fields: ['name'],
    });
    // A full queue (backend ADR-0046: the item's reading run is admitted as a run is) in the run's words.
    expect(
      itemRefusal(new PlatformRateLimitedError('busy', undefined, { reason: 'max_concurrent_runs', limit: '2' })).message,
    ).toBe(FLOW_QUEUE_FULL);
    expect(runRefusal(refused(409, 'item_not_ready')).message).toBe('Try again in a moment.');
    expect(runRefusal(refused(409, 'item_archived')).message).toBe(ITEM_ARCHIVED);
    expect(runRefusal(refused(409, 'subscription_not_live')).message).toBe('This flow is not live, so it cannot run.');
  });
});

/* ───────────────────────────── the flow page ───────────────────────────── */

type Listed = Answer<`GET ${typeof LISTED}`>;
type Stats = Answer<'GET /v1/workspaces/{workspaceId}/run-stats'>;
const NO_RUNS: Stats = {
  workspace: { total: 0, pending: 0, running: 0, held: 0, succeeded: 0, failed: 0, cancelled: 0 },
  subscriptions: [],
};

async function openFlow(
  listed: () => Listed,
  session: SessionContextValue = sessionAs('owner'),
  subscription = flowWithItems(),
  runStats: Stats = NO_RUNS,
) {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [entry()], categories: ['All'] });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', (sent) => ({
    subscriptions: sent.query?.status === 'archived' ? [] : [subscription],
  }));
  fake.always('GET /v1/workspaces/{workspaceId}/run-stats', runStats);
  fake.always('GET /v1/connections/providers', providersWithQuickBooks());
  fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/email-recipients', recipientsPayload());
  fake.always(`GET ${LISTED}`, () => listed());
  setMockParams({ flow: FLOW });
  await renderWithProviders(<WorkflowDetailScreen />, session);
  await screen.findByTestId('flow-items');
  return fake;
}

describe('the flow page of a flow with items (plan §5.1)', () => {
  const listed = (): Listed => ({
    items: [
      item('i-1', { title: 'Leases', fields: { region: 'South', name: 'Leases' }, runCount: 4, topScore: 86 }),
      item('i-2', { title: 'Supply', fields: { region: 'East', name: 'Supply' }, status: 'reading' }),
      item('i-3', { title: 'Hiring', fields: { region: 'North', name: 'Hiring' }, status: 'failed' }),
    ],
    choices: { region: ['East'] },
  });

  it('lists its items grouped A–Z, in the flow\'s words — no dashboard, no steps and no run start form (build 28, F2–F3)', async () => {
    await openFlow(listed);
    await screen.findByText('Leases');
    expect(screen.getByText('POLICIES')).toBeTruthy();
    const groups = [0, 1, 2].map((g) => within(screen.getByTestId(`flow-items-group-${g}`)).getAllByText(/./u).map((node) => node.props.children));
    expect(groups).toEqual([
      ['EAST', 'Supply', 'Reading…'],
      ['NORTH', 'Hiring', "Couldn't read"],
      ['SOUTH', 'Leases', '4 contracts · Top 86'],
    ]);
    // "Just the jobs and upload job": no tiles, no steps; a run of this flow names an item, so it starts on the item's page.
    expect(screen.queryByTestId('flow-dashboard')).toBeNull();
    expect(screen.queryByText('Runs')).toBeNull();
    expect(screen.queryByTestId('flow-steps')).toBeNull();
    expect(screen.queryByText('1 · Contract received')).toBeNull();
    expect(screen.queryByTestId('start-run')).toBeNull();
    expect(screen.queryByText('Start run')).toBeNull();
    // Live, so nothing stands where Turn on would.
    expect(screen.queryByTestId('flow-turn-on')).toBeNull();
    // Its actions stay at the bottom.
    expect(screen.getByTestId('archive-flow')).toBeTruthy();
  });

  it('no tiles, so a run of it going on reads no counts again', async () => {
    const running = { subscriptionId: FLOW, total: 1, pending: 0, running: 1, held: 0, succeeded: 0, failed: 0, cancelled: 0 };
    const fake = await openFlow(listed, sessionAs('owner'), flowWithItems(), { workspace: running, subscriptions: [running] });
    await screen.findByText('Leases');
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(fake.to('GET /v1/workspaces/{workspaceId}/run-stats')).toHaveLength(1);
  });

  it('off: Turn on stands alone, where the steps were, and turns the flow on', async () => {
    const fake = await openFlow(listed, sessionAs('owner'), flowWithItems({ status: 'paused' }));
    fake.always('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', { subscription: flowWithItems({ status: 'live' }) });
    expect(screen.queryByTestId('flow-steps')).toBeNull();
    await fireEvent.press(within(screen.getByTestId('flow-turn-on')).getByTestId('flow-step-turn-on'));
    await waitFor(() => expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')).toHaveLength(1));
    expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')[0]!.body).toEqual({ status: 'live' });
  });

  it('the filter: a drop-down of "All regions", then the values A–Z; a value chosen lists its items alone, A–Z, under no heading', async () => {
    const more = (): Listed => ({
      items: [...listed().items, item('i-4', { title: 'Allotments', fields: { region: 'South', name: 'Allotments' } })],
      choices: {},
    });
    await openFlow(more);
    await screen.findByText('Leases');
    expect(screen.getByTestId('flow-items-filter').props.accessibilityLabel).toBe('Region: All regions');
    await fireEvent.press(screen.getByTestId('flow-items-filter'));
    const menu = within(screen.getByTestId('flow-items-filter-menu'));
    expect(menu.getAllByText(/./u).map((node) => node.props.children)).toEqual(['REGION', 'All regions', 'East', 'North', 'South']);
    await fireEvent.press(menu.getByText('South'));
    expect(screen.queryByTestId('flow-items-filter-menu')).toBeNull();
    expect(screen.getByTestId('flow-items-filter').props.accessibilityLabel).toBe('Region: South');
    expect(within(screen.getByTestId('flow-items')).queryByText('SOUTH')).toBeNull();
    expect(screen.getAllByTestId(/^flow-item-i-\d$/u).map((node) => node.props.testID)).toEqual(['flow-item-i-4', 'flow-item-i-1']);
    expect(screen.queryByTestId('flow-item-i-2')).toBeNull();
    // All of them again.
    await fireEvent.press(screen.getByTestId('flow-items-filter'));
    await fireEvent.press(within(screen.getByTestId('flow-items-filter-menu')).getByText('All regions'));
    expect(screen.getAllByTestId(/^flow-item-i-\d$/u)).toHaveLength(4);
    // The outside closes it, nothing chosen.
    await fireEvent.press(screen.getByTestId('flow-items-filter'));
    await fireEvent.press(screen.getByTestId('flow-items-filter-backdrop'));
    expect(screen.queryByTestId('flow-items-filter-menu')).toBeNull();
  });

  it('a flow that groups nothing has no filter', async () => {
    await openFlow(listed, sessionAs('owner'), flowWithItems({ items: { ...DECLARED, groupField: undefined } }));
    await screen.findByText('Leases');
    expect(screen.queryByTestId('flow-items-filter')).toBeNull();
    // One list, A–Z by title.
    expect(screen.getAllByTestId(/^flow-item-i-\d$/u).map((node) => node.props.testID)).toEqual(['flow-item-i-3', 'flow-item-i-1', 'flow-item-i-2']);
  });

  it('a row opens its item', async () => {
    await openFlow(listed);
    await fireEvent.press(await screen.findByTestId('flow-item-i-1'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/item', params: { item: 'i-1' } });
  });

  it('Upload is an owner\'s or an admin\'s: a member sees the list without it', async () => {
    await openFlow(listed, sessionAs('member'));
    await screen.findByText('Leases');
    expect(screen.queryByTestId('flow-items-upload')).toBeNull();
    expect(screen.queryByText('Upload policy')).toBeNull();
  });

  it('none yet: "No policies yet."', async () => {
    await openFlow(() => ({ items: [], choices: {} }));
    expect(await screen.findByText('No policies yet.')).toBeTruthy();
    expect(screen.getByText('Upload policy')).toBeTruthy();
  });

  it('the upload card: the options, the name typed before and Other; a typed name and the file go up, the card closes, the row reads Reading…', async () => {
    const made = item('i-9', { title: 'Data', fields: { region: 'West', name: 'Data' }, status: 'reading' });
    let afterUpload = false;
    const fake = await openFlow(() => (afterUpload ? { items: [made, ...listed().items], choices: { region: ['East', 'West'] } } : listed()));
    fake.always('POST /v1/workspaces/{workspaceId}/uploads', {
      uploadSessionId: 'upload-1',
      uploadUrl: 'https://store.example.test/put',
      expiresAt: '2026-10-24T12:00:00Z',
      maximumSizeBytes: 10_000_000,
    });
    fake.always('POST /v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete', {
      artifact: { artifactId: 'artifact-1', filename: 'data.docx', contentType: DOCX, sizeBytes: 12 },
    });
    fake.always(`POST ${LISTED}`, () => {
      afterUpload = true;
      return { item: made };
    });
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked/data.docx', name: 'data.docx', mimeType: DOCX, size: 12 }],
    });

    await fireEvent.press(await screen.findByText('Upload policy'));
    const card = within(screen.getByTestId('item-upload-dialog'));
    // The select is a drop-down, never chips (build 28, decision 7): its title over a pill saying its default.
    expect(within(screen.getByTestId('item-field-region')).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'Region',
      'North',
    ]);
    expect(screen.getByTestId('item-field-region-choice').props.accessibilityLabel).toBe('Region: North');
    // Opened: its options, then the name typed before, then Other.
    await fireEvent.press(screen.getByTestId('item-field-region-choice'));
    const menu = within(screen.getByTestId('item-field-region-choice-menu'));
    expect(menu.getAllByText(/./u).map((node) => node.props.children)).toEqual(['REGION', 'North', 'South', 'East', 'Other']);
    // Nothing to send yet: Upload waits for the name and the file.
    await fireEvent.press(screen.getByTestId('item-field-region-choice-backdrop'));
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    expect(fake.to(`POST ${LISTED}`)).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('item-field-region-choice'));
    await fireEvent.press(within(screen.getByTestId('item-field-region-choice-menu')).getByText('Other'));
    expect(screen.queryByTestId('item-field-region-choice-menu')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Other'), 'West');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Data');
    expect(card.getByText('PDF or Word file')).toBeTruthy();
    // A Word file only, so no photo.
    expect(screen.queryByTestId('run-file-policyFile-photo')).toBeNull();
    await fireEvent.press(screen.getByTestId('run-file-policyFile-upload'));
    await card.findByText('Ready: data.docx (12 bytes)');
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: ['application/pdf', DOCX] }),
    );
    // Sent as it is, never re-encoded.
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
    expect(fake.to('POST /v1/workspaces/{workspaceId}/uploads')[0]!.body).toEqual({
      subscriptionId: FLOW,
      filename: 'data.docx',
      contentType: DOCX,
      sizeBytes: 12,
    });

    await fireEvent.press(screen.getByTestId('item-upload-send'));
    await waitFor(() => expect(screen.queryByTestId('item-upload-dialog')).toBeNull());
    const [sent] = fake.to(`POST ${LISTED}`);
    expect(sent!.values).toEqual({ workspaceId: TEST_WORKSPACE, subscriptionId: FLOW });
    expect(sent!.body).toEqual({ fields: { region: 'West', name: 'Data' }, file: 'artifact-1' });
    expect(sent!.key).toMatch(/^item-/u);
    expect(await screen.findByText('WEST')).toBeTruthy();
    expect(within(screen.getByTestId('flow-item-i-9')).getByText('Reading…')).toBeTruthy();
  });

  /** The upload of a PDF the card's file field sends: opened, put, completed. */
  function answerUpload(fake: ReturnType<typeof fakePlatform>) {
    fake.always('POST /v1/workspaces/{workspaceId}/uploads', {
      uploadSessionId: 'upload-1',
      uploadUrl: 'https://store.example.test/put',
      expiresAt: '2026-10-24T12:00:00Z',
      maximumSizeBytes: 10_000_000,
    });
    fake.always('POST /v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete', {
      artifact: { artifactId: 'artifact-1', filename: 'p.pdf', contentType: 'application/pdf', sizeBytes: 12 },
    });
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked/p.pdf', name: 'p.pdf', mimeType: 'application/pdf', size: 12 }],
    });
  }

  it('a saved name is sent as itself; a file the platform will not take is said in the run\'s words and chosen again; Cancel closes the card', async () => {
    const fake = await openFlow(listed);
    answerUpload(fake);
    fake.always(`POST ${LISTED}`, () => {
      throw new PlatformError('gone', 422, undefined, { reason: 'artifact_unavailable' });
    });
    await fireEvent.press(await screen.findByTestId('flow-items-upload'));
    // The name typed for an earlier item, offered again, chosen.
    await fireEvent.press(screen.getByTestId('item-field-region-choice'));
    await fireEvent.press(within(screen.getByTestId('item-field-region-choice-menu')).getByText('East'));
    expect(screen.getByTestId('item-field-region-choice').props.accessibilityLabel).toBe('Region: East');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Data');
    await fireEvent.press(screen.getByTestId('run-file-policyFile-upload'));
    await screen.findByText('Ready: p.pdf (12 bytes)');
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    expect(await screen.findByText(RUN_REFUSALS.artifact_unavailable!)).toBeTruthy();
    expect(fake.to(`POST ${LISTED}`)[0]!.body).toEqual({ fields: { region: 'East', name: 'Data' }, file: 'artifact-1' });
    expect(screen.queryByText('Ready: p.pdf (12 bytes)')).toBeNull();
    await fireEvent.press(screen.getByTestId('item-upload-cancel'));
    expect(screen.queryByTestId('item-upload-dialog')).toBeNull();
  });

  it('an item made here is listed as the reads list it: once listed and then left out (archived), it is gone and the reads stop', async () => {
    const made = item('i-9', { title: 'Data', fields: { region: 'North', name: 'Data' }, status: 'reading' });
    // Before the upload: none. The read after it lists the new item; every read after that leaves it out.
    let phase: 'before' | 'made' | 'archived' = 'before';
    const fake = await openFlow(() => {
      if (phase === 'made') {
        phase = 'archived';
        return { items: [made], choices: {} };
      }
      return { items: [], choices: {} };
    });
    answerUpload(fake);
    fake.always(`POST ${LISTED}`, () => {
      phase = 'made';
      return { item: made };
    });
    await fireEvent.press(await screen.findByText('Upload policy'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Data');
    await fireEvent.press(screen.getByTestId('run-file-policyFile-upload'));
    await screen.findByText('Ready: p.pdf (12 bytes)');
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    expect(await screen.findByTestId('flow-item-i-9')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('flow-item-i-9')).toBeNull(), { timeout: RUN_REREAD_MS * 3 });
    expect(screen.getByText('No policies yet.')).toBeTruthy();
    const reads = fake.to(`GET ${LISTED}`).length;
    await act(() => new Promise((resolve) => setTimeout(resolve, RUN_REREAD_MS + 500)));
    expect(fake.to(`GET ${LISTED}`)).toHaveLength(reads);
  }, 20_000);

  it('a refused value is said under the form and "Check this value." under its field; a full queue in the run\'s words', async () => {
    const fake = await openFlow(listed);
    answerUpload(fake);
    fake.once(`POST ${LISTED}`, () => {
      throw new PlatformError('refused', 422, undefined, {
        problems: [{ path: 'fields.name', message: 'must be at most 60 characters' }],
      });
    });
    fake.once(`POST ${LISTED}`, () => {
      throw new PlatformRateLimitedError('busy', undefined, { reason: 'max_concurrent_runs', limit: '2' });
    });
    await fireEvent.press(await screen.findByTestId('flow-items-upload'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Data');
    await fireEvent.press(screen.getByTestId('run-file-policyFile-upload'));
    await screen.findByText('Ready: p.pdf (12 bytes)');
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    expect(await screen.findByText('Nothing was uploaded. Check each value and try again.')).toBeTruthy();
    expect(within(screen.getByTestId('item-field-name')).getByText('Check this value.')).toBeTruthy();
    expect(within(screen.getByTestId('item-field-region')).queryByText('Check this value.')).toBeNull();
    // The file stays: the value is what to fix. Sent again, a full queue says so, and no field.
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    expect(await screen.findByText(FLOW_QUEUE_FULL)).toBeTruthy();
    expect(screen.queryByText('Check this value.')).toBeNull();
  });
});

/* ───────────────────────────── the item page ───────────────────────────── */

async function openItem(read: Answer<`GET ${typeof ONE}`>, session: SessionContextValue = sessionAs('owner')) {
  const fake = fakePlatform(platformOperation);
  fake.always(`GET ${ONE}`, read);
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', (sent) => ({
    subscriptions: sent.query?.status === 'archived' ? [] : [flowWithItems()],
  }));
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [entry()], categories: ['All'] });
  setMockParams({ item: 'i-1' });
  await renderWithProviders(<ItemScreen />, session);
  await screen.findByTestId('item-title');
  return fake;
}

// Its page body as the platform composes it (backend ADR-0048): the candidate-reviewer v2 item fixture.
const READ_ITEM = (blocks = fixtureBlocks('reviewer-item')): Answer<`GET ${typeof ONE}`> => ({
  item: item('i-1', {
    title: 'Leases',
    fields: { region: 'South', name: 'Leases' },
    runCount: 4,
    topScore: 91,
    blocks: fixtureBlocks('reviewer-item-reading'),
  }),
  // The ranked runs are a block (`shape=blocks` sends `runs` as []).
  runs: [],
  blocks,
  going: false,
});

/** The list block of the item fixture: its rows, by place. */
const RUNS = 'item-blocks-5';

describe("an item's page (plan §5.3; its blocks since Round 21)", () => {
  it('its title, its group and state; its runs drawn as sent, numbered, scored — "Score" read first — a failure muted, each row rank, title, score and arrow (build 28, F5)', async () => {
    await openItem(READ_ITEM());
    expect(screen.getByTestId('item-title').props.children).toBe('Leases');
    expect(screen.getByTestId('item-status').props.children).toBe('South · Ready');
    expect(screen.getByText('Candidates')).toBeTruthy();
    const row = (at: number) => within(screen.getByTestId(`${RUNS}-row-${at}`)).getAllByText(/./u).map((node) => node.props.children);
    expect(row(0)).toEqual(['1', 'Dana Whitfield', '88']);
    expect(row(1)).toEqual(['2', 'Omar Reyes', '41']);
    expect(row(2)).toEqual(['3', 'Reading…']);
    expect(row(3)).toEqual(['4', 'Failed']);
    // NEW on the app (the website's already): the score is read as "Score 88".
    expect(screen.getByTestId(`${RUNS}-row-0-value`).props.accessibilityLabel).toBe('Score 88');
    expect(within(screen.getByTestId(`${RUNS}-row-0`)).getByTestId(/^phosphor-react-native-caret-right-/u)).toBeTruthy();
    // The height of a drop-down's row: 44 at least, 11 above and below, 14 a side — never the 64 of a connection row.
    expect(StyleSheet.flatten(screen.getByTestId(`${RUNS}-row-0`).props.style)).toMatchObject({
      minHeight: 44,
      paddingVertical: 11,
      paddingHorizontal: 14,
    });
    // The score at the row's type, not the heading's.
    expect(StyleSheet.flatten(screen.getByTestId(`${RUNS}-row-0-value`).props.style)).toMatchObject({ fontSize: 16 });
    // A failure in the muted tone, never faded (AA); the others in the text colour.
    const color = (node: { props: Record<string, unknown> }) => (StyleSheet.flatten(node.props.style as never) as { color?: string }).color;
    expect(color(within(screen.getByTestId(`${RUNS}-row-3`)).getByText('Failed'))).toBe(nocturneDark.neutral[400]);
    expect(color(within(screen.getByTestId(`${RUNS}-row-0`)).getByText('Dana Whitfield'))).toBe(nocturneDark.text);
    expect(color(screen.getByTestId(`${RUNS}-row-0-value`))).toBe(nocturneDark.text);
    for (const at of [0, 1, 2, 3]) {
      expect(StyleSheet.flatten(screen.getByTestId(`${RUNS}-row-${at}`).props.style ?? {})).not.toHaveProperty('opacity');
    }
    await fireEvent.press(screen.getByTestId(`${RUNS}-row-0`));
    expect(mockRouter.push).toHaveBeenCalledWith(
      { pathname: '/(tabs)/activity/run', params: { runId: 'r1', returnTo: 'flows' } },
      { withAnchor: true },
    );
  });

  it('an owner adds one: the run names the item, says Start; Back goes back', async () => {
    const fake = await openItem(READ_ITEM(fixtureBlocks('empty-item')));
    expect(screen.getByText('No candidates yet.')).toBeTruthy();
    // The platform's label, then its run form, drawn by `StartRun` for an owner.
    expect(screen.getByText('Add candidate')).toBeTruthy();
    expect(screen.getByTestId('item-add-run')).toBeTruthy();
    // The item page's run field says its types, as the website's does.
    expect(screen.getByTestId('run-file-contractFile-types').props.children).toBe('PDF or Word file');
    fake.always('POST /v1/workspaces/{workspaceId}/uploads', {
      uploadSessionId: 'upload-1',
      uploadUrl: 'https://store.example.test/put',
      expiresAt: '2026-10-24T12:00:00Z',
      maximumSizeBytes: 10_000_000,
    });
    fake.always('POST /v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete', {
      artifact: { artifactId: 'artifact-2', filename: 'c.pdf', contentType: 'application/pdf', sizeBytes: 12 },
    });
    fake.always('POST /v1/workspaces/{workspaceId}/runs', { run: run('r9', { status: 'running' }) });
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked/c.pdf', name: 'c.pdf', mimeType: 'application/pdf', size: 12 }],
    });
    await fireEvent.press(screen.getByTestId('run-file-contractFile-upload'));
    await screen.findByText('Ready: c.pdf (12 bytes)');
    await fireEvent.press(screen.getByText('Start'));
    await waitFor(() => expect(fake.to('POST /v1/workspaces/{workspaceId}/runs')).toHaveLength(1));
    // The run names the item the form names.
    expect(fake.to('POST /v1/workspaces/{workspaceId}/runs')[0]!.body).toEqual({
      subscriptionId: FLOW,
      input: { contractFile: 'artifact-2' },
      itemId: '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b',
    });
    // It stays here; the read that follows lists the new run.
    await waitFor(() => expect(fake.to(`GET ${ONE}`).length).toBeGreaterThan(1));
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('Add and Archive are an owner\'s or an admin\'s: a member reads the same page without them', async () => {
    await openItem(READ_ITEM(), sessionAs('member'));
    expect(screen.getByTestId(RUNS)).toBeTruthy();
    expect(screen.queryByTestId('item-add-run')).toBeNull();
    expect(screen.queryByTestId('item-archive')).toBeNull();
  });

  it('an item still being read takes no run yet', async () => {
    await openItem({ ...READ_ITEM(fixtureBlocks('empty-item')), item: item('i-1', { status: 'reading' }) });
    expect(screen.getByTestId('item-status').props.children).toBe('North · Reading…');
    expect(screen.queryByTestId('item-add-run')).toBeNull();
  });

  it('no "What AI read" here: the item\'s reading is on the page of its file (build 28, F4)', async () => {
    await openItem(READ_ITEM());
    expect(screen.queryByText('WHAT AI READ')).toBeNull();
    expect(screen.queryByText('Must haves')).toBeNull();
    expect(screen.queryByText('Nice to haves')).toBeNull();
  });

  it('Archive asks first, then archives it under a key and goes back; Cancel keeps it', async () => {
    const fake = await openItem(READ_ITEM());
    fake.always('POST /v1/workspaces/{workspaceId}/items/{itemId}/archive', { item: item('i-1', { archivedAt: '2026-10-24T00:00:00Z' }) });
    await fireEvent.press(screen.getByText('Archive policy'));
    expect(screen.getByText('Archive Leases?')).toBeTruthy();
    expect(screen.getByText('It leaves the list and takes no new contracts. Its contracts stay.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(fake.to('POST /v1/workspaces/{workspaceId}/items/{itemId}/archive')).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('item-archive'));
    await fireEvent.press(screen.getByTestId('item-archive-confirm'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    const [sent] = fake.to('POST /v1/workspaces/{workspaceId}/items/{itemId}/archive');
    expect(sent!.values).toEqual({ workspaceId: TEST_WORKSPACE, itemId: 'i-1' });
    expect(sent!.key).toMatch(/^item-archive-/u);
  });

  it('an archive refused says so in the dialog and stays', async () => {
    const fake = await openItem(READ_ITEM());
    fake.always('POST /v1/workspaces/{workspaceId}/items/{itemId}/archive', () => {
      throw new PlatformError('It was not archived.', 503);
    });
    await fireEvent.press(screen.getByTestId('item-archive'));
    await fireEvent.press(screen.getByTestId('item-archive-confirm'));
    expect(await screen.findByText('It was not archived.')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

/* ───────────────────────────── the run page ───────────────────────────── */

describe("a run's page headed by its title and score, its body the platform's blocks (plan §5.4; build 28, F7–F9; backend ADR-0048)", () => {
  type Detail = Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'>;

  async function openRun(overrides: Partial<Detail['run']>, blocks: Detail['blocks'] = fixtureBlocks('reviewer-candidate')) {
    const base = runDetailPayload('run-1');
    const detail: Detail = { ...base, run: { ...base.run, ...run('r1'), ...overrides }, blocks };
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/runs/{runId}', detail);
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [entry()], categories: ['All'] });
    fake.always('GET /v1/workspaces/{workspaceId}/approvals', { approvals: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', (sent) => ({
      subscriptions: sent.query?.status === 'archived' ? [] : [flowWithItems()],
    }));
    setMockParams({ runId: 'r1' });
    await renderWithProviders(<RunDetailScreen />, sessionAs('owner'));
    await screen.findByTestId('run-title');
    return fake;
  }

  it('the title and the score head it; then its blocks — "View resume", "CANDIDATE DETAILS" over its sections, the first open; then Run details and View flow', async () => {
    const fake = await openRun({ title: 'Northwind lease', score: 91, resultSummary: 'Meets 3 of 3' });
    expect(fake.to('GET /v1/workspaces/{workspaceId}/runs/{runId}')[0]!.query).toEqual({ shape: 'blocks' });
    expect(screen.getByTestId('run-title').props.children).toBe('Northwind lease');
    expect(screen.getByTestId('run-score').props.children).toBe('91');
    // F8: "Then it should be the section candidate details. Instead of strong match 6 of 6." — the platform leaves the line out.
    expect(screen.queryByText('Meets 3 of 3')).toBeNull();
    const words = visibleWords(screen.toJSON());
    expect(words.slice(words.indexOf('View resume'), words.indexOf('Run details'))).toEqual([
      'View resume',
      'Candidate details',
      'Experience',
      'Payroll Lead',
      'Fernwood Foods · 2019–2025',
      'Ran payroll for 400 people.',
      'Education',
    ]);
    expect(screen.queryByTestId('run-blocks-3-body')).toBeNull();
    // Then Run details — its steps, tiles and facts a page away (F9) — then View flow.
    expect(screen.queryByTestId('run-progress')).toBeNull();
    expect(screen.queryByText('Duration')).toBeNull();
    expect(screen.queryByTestId('run-fact-Run ID')).toBeNull();
    expect(screen.getByText('View flow')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('run-open-details'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/activity/run-details', params: { runId: 'r1' } });
    // A closed section opens on its own; its https address opens in the system browser.
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await fireEvent.press(screen.getByTestId('run-blocks-3-toggle'));
    await fireEvent.press(screen.getByTestId('run-blocks-3-0-row-0-link'));
    expect(open).toHaveBeenCalledWith('https://school.example.test/accounting');
    open.mockRestore();
  });

  it('a run without both is headed by its id, as before, with no score; Run details still there', async () => {
    await openRun({ title: 'Northwind lease' }, []);
    expect(screen.getByTestId('run-title').props.children).toBe('Run r1');
    expect(screen.queryByTestId('run-score')).toBeNull();
    expect(screen.getByTestId('run-open-details')).toBeTruthy();
  });
});

/* ───────────────────────────── the pickers ───────────────────────────── */

describe('a file field offers the types its field names (plan §5.5)', () => {
  const field = (acceptedContentTypes?: string[]) => ({ key: 'doc', title: 'Document', ...(acceptedContentTypes ? { acceptedContentTypes } : {}) });

  function renderField(accepted?: string[], showTypes = true) {
    return renderWithProviders(
      <RunFileField
        field={field(accepted)}
        shownWorkspaceId={TEST_WORKSPACE}
        subscriptionId={FLOW}
        onValue={jest.fn()}
        onBusyChange={jest.fn()}
        divider={false}
        showTypes={showTypes}
      />,
      sessionAs('owner'),
    );
  }

  it('named: the picker offers those, a line says them, no photo without a JPEG, another type refused in those words', async () => {
    fakePlatform(platformOperation);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked/a.csv', name: 'a.csv', mimeType: 'text/csv', size: 12 }],
    });
    await renderField(['application/pdf', DOCX]);
    expect(screen.getByText('PDF or Word file')).toBeTruthy();
    expect(screen.queryByTestId('run-file-doc-photo')).toBeNull();
    await fireEvent.press(screen.getByTestId('run-file-doc-upload'));
    expect(await screen.findByText('Choose a PDF or Word file.')).toBeTruthy();
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: ['application/pdf', DOCX] }));
    expect(platformOperation).not.toHaveBeenCalled();
  });

  it('named with a JPEG: Take photo stays', async () => {
    await renderField(['application/pdf', 'image/jpeg']);
    expect(screen.getByTestId('run-file-doc-photo')).toBeTruthy();
    expect(screen.getByText('PDF or photo')).toBeTruthy();
  });

  it('the line only where the page asks: a field left to itself names no types, though its picker and refusal keep them', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked/a.csv', name: 'a.csv', mimeType: 'text/csv', size: 12 }],
    });
    await renderField(['application/pdf', DOCX], false);
    expect(screen.queryByTestId('run-file-doc-types')).toBeNull();
    await fireEvent.press(screen.getByTestId('run-file-doc-upload'));
    expect(await screen.findByText('Choose a PDF or Word file.')).toBeTruthy();
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: ['application/pdf', DOCX] }));
  });

  it("Step 1 of a flow without items stays titles only, with the types the platform names on every file field (Build 21, A6)", async () => {
    const fake = fakePlatform(platformOperation);
    // A flow without items whose manifest declares `artifacts`: its file field names the types.
    const plain = flowWithItems({
      items: undefined,
      runInput: [{ ...CONTRACT_FILE, acceptedContentTypes: ['application/pdf', 'image/jpeg', 'image/png'] }],
    });
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [{ ...entry(), items: undefined }], categories: ['All'] });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', (sent) => ({
      subscriptions: sent.query?.status === 'archived' ? [] : [plain],
    }));
    fake.always('GET /v1/workspaces/{workspaceId}/run-stats', {
      workspace: { total: 0, pending: 0, running: 0, held: 0, succeeded: 0, failed: 0, cancelled: 0 },
      subscriptions: [],
    });
    fake.always('GET /v1/connections/providers', providersWithQuickBooks());
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/email-recipients', recipientsPayload());
    setMockParams({ flow: FLOW });
    await renderWithProviders(<WorkflowDetailScreen />, sessionAs('owner'));
    expect(await screen.findByTestId('run-file-contractFile-upload')).toBeTruthy();
    expect(screen.getByTestId('run-file-contractFile-photo')).toBeTruthy();
    expect(screen.queryByTestId('run-file-contractFile-types')).toBeNull();
    expect(screen.queryByText('PDF or photo')).toBeNull();
  });

  it('none named: a PDF, a JPEG or a PNG, Take photo, and no line — as before', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    await renderField();
    expect(screen.getByTestId('run-file-doc-photo')).toBeTruthy();
    expect(screen.queryByText(/^PDF/u)).toBeNull();
    await fireEvent.press(screen.getByTestId('run-file-doc-upload'));
    await waitFor(() =>
      expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: RUN_FILE_TYPES })),
    );
  });
});
