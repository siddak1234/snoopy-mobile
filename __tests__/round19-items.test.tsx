import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator } from 'expo-image-manipulator';
import React from 'react';
import { Linking } from 'react-native';

import RunDetailScreen from '@/app/(tabs)/activity/run';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import ItemScreen from '@/app/(tabs)/flows/item';
import { RunFileField } from '@/components/automations/run-file-field';
import type { SessionContextValue } from '@/hooks/use-session';
import {
  FLOW_QUEUE_FULL,
  ITEM_ARCHIVED,
  ITEM_NOT_READY,
  RUN_REFUSALS,
  UPLOAD_REFUSALS,
  itemRefusal,
  runRefusal,
} from '@/lib/content/refusals';
import { acceptedLine, countOf, inSentence } from '@/lib/content/screen-states';
import type { AutomationItems, AutomationRunInputField, Item, Run, Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';
import { PlatformError, PlatformRateLimitedError } from '@/lib/platform/problem';
import { RUN_FILE_TYPES } from '@/lib/platform/run-image';
import { RUN_REREAD_MS } from '@/lib/view/runs';
import { resetSnapshot } from '@/lib/platform/snapshot';
import {
  OTHER_CHOICE,
  groupItems,
  itemFieldValues,
  itemFieldsComplete,
  itemRowLine,
  itemStatusLine,
  rankedRuns,
  selectChoices,
} from '@/lib/view/items';
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
  it('groups by groupField: its options in order, then typed names A–Z, then none; rows newest first', () => {
    const groups = groupItems(
      [
        item('a', { fields: { region: 'South' }, createdAt: '2026-10-20T10:00:00Z' }),
        item('b', { fields: { region: 'West' }, createdAt: '2026-10-20T11:00:00Z' }),
        item('c', { fields: { region: 'North' }, createdAt: '2026-10-20T09:00:00Z' }),
        item('d', { fields: { region: 'East' }, createdAt: '2026-10-20T12:00:00Z' }),
        item('e', { fields: { region: 'South' }, createdAt: '2026-10-21T10:00:00Z' }),
        item('f', { fields: {}, createdAt: '2026-10-20T08:00:00Z' }),
      ],
      DECLARED,
    );
    expect(groups.map((group) => [group.name, group.items.map((row) => row.id)])).toEqual([
      ['North', ['c']],
      ['South', ['e', 'a']],
      ['East', ['d']],
      ['West', ['b']],
      [null, ['f']],
    ]);
    // A flow that groups nothing: one group, no name.
    expect(groupItems([item('a'), item('b')], { fields: DECLARED.fields })).toEqual([{ name: null, items: [item('a'), item('b')] }]);
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

  it("an item's runs in the platform's order, never sorted again, numbered: Reading…, the score and line, a failure dimmed", () => {
    // An order a sort by score would change: the 64 before the 91, a failure before a run still going.
    const ranked = rankedRuns([
      run('r2', { title: 'Contoso supply', score: 64 }),
      run('r1', { title: 'Northwind lease', score: 91, resultSummary: 'Meets 3 of 3' }),
      run('r4', { status: 'failed', failureReason: 'The file had no text.' }),
      run('r3', { status: 'running' }),
    ]);
    expect(ranked.map(({ id, rank, title, score, line, dim }) => [id, rank, title, score, line, dim])).toEqual([
      ['r2', 1, 'Contoso supply', '64', null, false],
      ['r1', 2, 'Northwind lease', '91', 'Meets 3 of 3', false],
      ['r4', 3, 'Failed', null, 'The file had no text.', true],
      ['r3', 4, 'Reading…', null, null, false],
    ]);
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
    expect(runRefusal(refused(409, 'item_not_ready')).message).toBe(ITEM_NOT_READY);
    expect(runRefusal(refused(409, 'item_archived')).message).toBe(ITEM_ARCHIVED);
    expect(runRefusal(refused(409, 'subscription_not_live')).message).toBe('This flow is not live, so it cannot run.');
  });
});

/* ───────────────────────────── the flow page ───────────────────────────── */

type Listed = Answer<`GET ${typeof LISTED}`>;

async function openFlow(listed: () => Listed, session: SessionContextValue = sessionAs('owner'), subscription = flowWithItems()) {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [entry()], categories: ['All'] });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', (sent) => ({
    subscriptions: sent.query?.status === 'archived' ? [] : [subscription],
  }));
  fake.always('GET /v1/workspaces/{workspaceId}/run-stats', {
    workspace: { total: 0, pending: 0, running: 0, held: 0, succeeded: 0, failed: 0, cancelled: 0 },
    subscriptions: [],
  });
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

  it('lists its items grouped, in the flow\'s words — and draws no run start form', async () => {
    await openFlow(listed);
    await screen.findByText('Leases');
    expect(screen.getByText('POLICIES')).toBeTruthy();
    const groups = [0, 1, 2].map((g) => within(screen.getByTestId(`flow-items-group-${g}`)).getAllByText(/./u).map((node) => node.props.children));
    expect(groups).toEqual([
      ['NORTH', 'Hiring', "Couldn't read"],
      ['SOUTH', 'Leases', '4 contracts · Top 86'],
      ['EAST', 'Supply', 'Reading…'],
    ]);
    // The steps stay; a run of this flow names an item, so it starts on the item's page.
    expect(screen.getByText('1 · Contract received')).toBeTruthy();
    expect(screen.queryByTestId('start-run')).toBeNull();
    expect(screen.queryByText('Start run')).toBeNull();
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
    // Its options, then the name typed before, then Other.
    expect(within(screen.getByTestId('item-field-region')).getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'Region',
      'North',
      'South',
      'East',
      'Other',
    ]);
    // Nothing to send yet: Upload waits for the name and the file.
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    expect(fake.to(`POST ${LISTED}`)).toHaveLength(0);

    await fireEvent.press(card.getByText('Other'));
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
    await fireEvent.press(within(screen.getByTestId('item-field-region')).getByText('East'));
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

const READ_ITEM = (): Answer<`GET ${typeof ONE}`> => ({
  item: item('i-1', {
    title: 'Leases',
    fields: { region: 'South', name: 'Leases' },
    runCount: 4,
    topScore: 91,
    sections: [
      { title: 'Must-haves', entries: [{ title: 'A break clause', text: 'Either side may end it on 90 days.' }] },
      { title: 'Nice to have', entries: [{ title: 'Fixed rent' }] },
    ],
  }),
  // Not in score order, so a page that sorted them again would draw them otherwise.
  runs: [
    run('r2', { title: 'Contoso lease', score: 64 }),
    run('r1', { title: 'Northwind lease', score: 91, resultSummary: 'Meets 3 of 3' }),
    run('r4', { status: 'failed', failureReason: 'The file had no text.' }),
    run('r3', { status: 'running' }),
  ],
});

describe("an item's page (plan §5.3)", () => {
  it('its title, its group and state; its runs drawn as answered, numbered, scored, a failure dimmed', async () => {
    await openItem(READ_ITEM());
    expect(screen.getByTestId('item-title').props.children).toBe('Leases');
    expect(screen.getByTestId('item-status').props.children).toBe('South · Ready');
    expect(screen.getByText('CONTRACTS')).toBeTruthy();
    const row = (id: string) => within(screen.getByTestId(`item-run-${id}`)).getAllByText(/./u).map((node) => node.props.children);
    expect(screen.getAllByTestId(/^item-run-r\d$/u).map((node) => node.props.testID)).toEqual([
      'item-run-r2',
      'item-run-r1',
      'item-run-r4',
      'item-run-r3',
    ]);
    expect(row('r2')).toEqual([1, 'Contoso lease', '64']);
    expect(row('r1')).toEqual([2, 'Northwind lease', 'Meets 3 of 3', '91']);
    expect(row('r4')).toEqual([3, 'Failed', 'The file had no text.']);
    expect(row('r3')).toEqual([4, 'Reading…']);
    expect(screen.getByTestId('item-run-r4-row').props.style).toEqual({ opacity: 0.55 });
    expect(screen.getByTestId('item-run-r1-row').props.style).toBe(false);
    await fireEvent.press(screen.getByTestId('item-run-r1'));
    expect(mockRouter.push).toHaveBeenCalledWith(
      { pathname: '/(tabs)/activity/run', params: { runId: 'r1', returnTo: 'flows' } },
      { withAnchor: true },
    );
  });

  it('an owner adds one: the run names the item, says Start; Back goes back', async () => {
    const fake = await openItem({ ...READ_ITEM(), runs: [] });
    expect(screen.getByText('No contracts yet.')).toBeTruthy();
    expect(screen.getByText('ADD CONTRACT')).toBeTruthy();
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
    expect(fake.to('POST /v1/workspaces/{workspaceId}/runs')[0]!.body).toEqual({
      subscriptionId: FLOW,
      input: { contractFile: 'artifact-2' },
      itemId: 'i-1',
    });
    // It stays here; the read that follows lists the new run.
    await waitFor(() => expect(fake.to(`GET ${ONE}`).length).toBeGreaterThan(1));
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('Add and Archive are an owner\'s or an admin\'s: a member reads the same page without them', async () => {
    await openItem(READ_ITEM(), sessionAs('member'));
    expect(screen.getByTestId('item-runs')).toBeTruthy();
    expect(screen.queryByTestId('item-add-run')).toBeNull();
    expect(screen.queryByTestId('item-archive')).toBeNull();
  });

  it('an item still being read takes no run yet', async () => {
    await openItem({ ...READ_ITEM(), item: item('i-1', { status: 'reading' }), runs: [] });
    expect(screen.getByTestId('item-status').props.children).toBe('North · Reading…');
    expect(screen.queryByTestId('item-add-run')).toBeNull();
  });

  it('What AI read: the sections, each closed until pressed', async () => {
    await openItem(READ_ITEM());
    expect(screen.getByText('WHAT AI READ')).toBeTruthy();
    expect(screen.queryByTestId('item-sections-0-body')).toBeNull();
    expect(screen.queryByTestId('item-sections-1-body')).toBeNull();
    await fireEvent.press(screen.getByTestId('item-sections-0'));
    expect(within(screen.getByTestId('item-sections-0-body')).getByText('Either side may end it on 90 days.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('item-sections-0'));
    expect(screen.queryByTestId('item-sections-0-body')).toBeNull();
  });

  it('Archive asks first, then archives it under a key and goes back; Cancel keeps it', async () => {
    const fake = await openItem(READ_ITEM());
    fake.always('POST /v1/workspaces/{workspaceId}/items/{itemId}/archive', { item: item('i-1', { archivedAt: '2026-10-24T00:00:00Z' }) });
    await fireEvent.press(screen.getByText('Archive policy'));
    expect(screen.getByText('Archive Leases?')).toBeTruthy();
    expect(screen.getByText('It leaves policies and takes no new contracts. Its contracts stay.')).toBeTruthy();
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

describe("a run's page headed by its title and score, its sections the first open (plan §5.4)", () => {
  type Detail = Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'>;

  async function openRun(overrides: Partial<Detail['run']>, sections?: Detail['sections']) {
    const base = runDetailPayload('run-1');
    const detail: Detail = {
      ...base,
      run: { ...base.run, ...run('r1'), ...overrides },
      ...(sections ? { sections } : {}),
    };
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/runs/{runId}', detail);
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [entry()], categories: ['All'] });
    fake.always('GET /v1/workspaces/{workspaceId}/approvals', { approvals: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', { subscriptions: [flowWithItems()] });
    setMockParams({ runId: 'r1' });
    await renderWithProviders(<RunDetailScreen />, sessionAs('owner'));
    await screen.findByTestId('run-title');
  }

  const SECTIONS: Detail['sections'] = [
    {
      title: 'Parties',
      entries: [{ title: 'Northwind Ltd', subtitle: 'Landlord', text: 'Signed 2026.', url: 'https://example.com/northwind' }],
    },
    { title: 'Terms', entries: [{ title: 'Five years', url: 'javascript:alert(1)' }] },
  ];

  it('the title and the score head it; the sections follow, the first open', async () => {
    await openRun({ title: 'Northwind lease', score: 91, resultSummary: 'Meets 3 of 3' }, SECTIONS);
    expect(screen.getByTestId('run-title').props.children).toBe('Northwind lease');
    expect(screen.getByTestId('run-score').props.children).toBe('91');
    expect(screen.getByTestId('run-result').props.children).toBe('Meets 3 of 3');
    const first = within(screen.getByTestId('run-sections-0-body'));
    expect(first.getAllByText(/./u).map((node) => node.props.children)).toEqual([
      'Northwind Ltd',
      'Landlord',
      'Signed 2026.',
      'https://example.com/northwind',
    ]);
    expect(screen.queryByTestId('run-sections-1-body')).toBeNull();
    // Before the steps.
    expect(screen.getAllByTestId(/^run-(sections|progress)$/u).map((node) => node.props.testID)).toEqual([
      'run-sections',
      'run-progress',
    ]);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await fireEvent.press(screen.getByTestId('run-sections-0-link-0'));
    expect(open).toHaveBeenCalledWith('https://example.com/northwind');
    // An address that is not http or https is no link.
    await fireEvent.press(screen.getByTestId('run-sections-1'));
    expect(within(screen.getByTestId('run-sections-1-body')).queryByText('javascript:alert(1)')).toBeNull();
    open.mockRestore();
  });

  it('a run without both is headed by its id, as before, with no score', async () => {
    await openRun({ title: 'Northwind lease' });
    expect(screen.getByTestId('run-title').props.children).toBe('Run r1');
    expect(screen.queryByTestId('run-score')).toBeNull();
    expect(screen.queryByTestId('run-sections')).toBeNull();
  });
});

/* ───────────────────────────── the pickers ───────────────────────────── */

describe('a file field offers the types its field names (plan §5.5)', () => {
  const field = (acceptedContentTypes?: string[]) => ({ key: 'doc', title: 'Document', ...(acceptedContentTypes ? { acceptedContentTypes } : {}) });

  function renderField(accepted?: string[]) {
    return renderWithProviders(
      <RunFileField
        field={field(accepted)}
        shownWorkspaceId={TEST_WORKSPACE}
        subscriptionId={FLOW}
        onValue={jest.fn()}
        onBusyChange={jest.fn()}
        divider={false}
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
