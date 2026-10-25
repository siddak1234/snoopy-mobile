import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Share, StyleSheet } from 'react-native';

import RunDetailScreen from '@/app/(tabs)/activity/run';
import RunFileScreen from '@/app/(tabs)/activity/run-file';
import ItemFileScreen from '@/app/(tabs)/flows/item-file';
import ItemScreen from '@/app/(tabs)/flows/item';
import { status } from '@/constants/theme';
import type { AutomationItems, AutomationRunInputField, Item, Run, RunFile, Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fileLine, itemTiles, runFileRows, viewName } from '@/lib/view/items';
import { fakePlatform, type Answer } from '@/test/fake-platform';
import { TEST_WORKSPACE, planSubscriptionsPayload, runDetailPayload, sessionAs } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn((prefix: string) => `${prefix}-1`),
  downloadSignedFile: jest.fn(),
}));
const { platformOperation, downloadSignedFile } = jest.requireMock('@/lib/platform/client');

/**
 * Build 28's files and tiles (the round's plan §1 and §3, the contract of
 * backend `cf17dbb`): an item's tiles — Total, then its verdict words' counts,
 * green and red (F6) — and the "{File title}" row to the file it was made from,
 * drawn with its sections on a page of its own (F4); a run's "View {file}" rows
 * to each file its job uploaded, on a page of its own (F7). Every word is the
 * made-up flow's own: "Policy", "Contract", "Keep" and "Drop".
 */

const FLOW = 'pol-1';
const ITEM_ONE = '/v1/workspaces/{workspaceId}/items/{itemId}';
const ITEM_FILE = 'GET /v1/workspaces/{workspaceId}/items/{itemId}/file' as const;
const RUN_FILE = 'GET /v1/workspaces/{workspaceId}/runs/{runId}/files/{fileId}' as const;

const DECLARED: AutomationItems = {
  words: { singular: 'Policy', plural: 'Policies' },
  runWords: { singular: 'Contract', plural: 'Contracts' },
  verdictWords: { positive: 'Keep', negative: 'Drop' },
  titleField: 'name',
  fields: [{ key: 'name', title: 'Name', control: 'text', required: true }],
  file: { key: 'policyFile', title: 'Policy file', description: 'A PDF.', acceptedContentTypes: ['application/pdf'] },
};

const CONTRACT_FILE: AutomationRunInputField = {
  key: 'contractFile',
  title: 'Contract file',
  description: 'A PDF.',
  control: 'artifact',
  required: false,
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
    pipeline: [{ id: 'receive', kicker: 'TRIGGER', title: 'Contract received', description: 'A contract arrives.' }],
    items: DECLARED,
  };
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i-1',
    subscriptionId: FLOW,
    title: 'Leases',
    fields: { name: 'Leases' },
    status: 'ready',
    runCount: 5,
    positiveCount: 3,
    negativeCount: 1,
    topScore: 91,
    createdAt: '2026-10-20T10:00:00Z',
    createdByUserId: null,
    archivedAt: null,
    sections: [
      { title: 'Must-haves', entries: [{ title: 'A break clause', text: 'Either side may end it on 90 days.' }] },
      { title: 'Nice to have', entries: [{ title: 'Fixed rent' }] },
    ],
    ...overrides,
  };
}

const file = (id: string, filename: string, contentType = 'application/pdf'): RunFile => ({
  id,
  filename,
  contentType,
  format: 'PDF',
  sizeBytes: 2048,
  pages: 1,
});

const link = (of: RunFile, url = `https://files.example.com/${of.id}?sig=1`): Answer<typeof ITEM_FILE> => ({
  file: of,
  downloadUrl: url,
  expiresAt: '2026-10-24T12:00:00Z',
});

const saved: { name: string; delete: jest.Mock; exists: boolean; uri: string }[] = [];

beforeEach(() => {
  platformOperation.mockReset();
  resetSnapshot();
  saved.length = 0;
  // A view's file in a folder of its own, as `downloadSignedFile`'s `freshFolder` makes one; else the cache.
  downloadSignedFile.mockReset().mockImplementation(async (_url: string, name: string, options?: { freshFolder?: boolean }) => {
    const folder = options?.freshFolder ? `view-${saved.length + 1}/` : '';
    const one = { name, delete: jest.fn(), exists: true, uri: `file:///cache/${folder}${name}` };
    saved.push(one);
    return one;
  });
});

/* ───────────────────────────── the rules ───────────────────────────── */

describe("build 28's rules (lib/view/items.ts)", () => {
  it("an item's tiles: Total, then its verdict words' counts, green and red — none for a flow that names no verdicts", () => {
    expect(itemTiles(item(), DECLARED.verdictWords)).toEqual([
      { key: 'total', label: 'Total', value: '5', tone: 'text' },
      { key: 'positive', label: 'Keep', value: '3', tone: 'ok' },
      { key: 'negative', label: 'Drop', value: '1', tone: 'err' },
    ]);
    expect(itemTiles(item(), undefined)).toEqual([]);
  });

  it("a run's files: named by its flow's file fields, in order; files that share a word say which; \"File\" when none", () => {
    const photo = { control: 'artifact' as const, title: 'Photo' };
    const notes = { control: 'text' as const, title: 'Notes' };
    expect(runFileRows([{ id: 'f1' }], [notes, CONTRACT_FILE])).toEqual([{ id: 'f1', title: 'Contract file', label: 'View contract file' }]);
    expect(runFileRows([{ id: 'f1' }, { id: 'f2' }], [photo])).toEqual([
      { id: 'f1', title: 'Photo', label: 'View photo 1 of 2' },
      { id: 'f2', title: 'Photo', label: 'View photo 2 of 2' },
    ]);
    expect(runFileRows([{ id: 'f1' }, { id: 'f2' }], [photo, CONTRACT_FILE]).map((row) => row.label)).toEqual([
      'View photo',
      'View contract file',
    ]);
    expect(runFileRows([{ id: 'f1' }], undefined)).toEqual([{ id: 'f1', title: 'File', label: 'View file' }]);
    expect(runFileRows(undefined, [CONTRACT_FILE])).toEqual([]);
  });

  it('a file is drawn in place by its type alone — a PDF, a JPEG, a PNG, each under its own extension — and said in a line', () => {
    expect(['application/pdf', 'image/jpeg', 'IMAGE/PNG', 'application/pdf; charset=binary'].map(viewName)).toEqual([
      'view.pdf',
      'view.jpg',
      'view.png',
      'view.pdf',
    ]);
    expect(['text/html', 'image/svg+xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ''].map(viewName)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(fileLine({ format: 'PDF', pages: 2, sizeBytes: 24 * 1024 })).toBe('PDF · 2 pages · 24 KB');
    expect(fileLine({ format: 'JPEG', pages: 1, sizeBytes: 1.2 * 1024 * 1024 })).toBe('JPEG · 1 page · 1.2 MB');
    expect(fileLine({ format: 'DOCX', pages: null, sizeBytes: 900 })).toBe('DOCX · 900 bytes');
  });
});

/* ───────────────────────────── the item's page ───────────────────────────── */

async function openItem(read: Answer<`GET ${typeof ITEM_ONE}`>, subscription = flowWithItems()) {
  const fake = fakePlatform(platformOperation);
  fake.always(`GET ${ITEM_ONE}`, read);
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', (sent) => ({
    subscriptions: sent.query?.status === 'archived' ? [] : [subscription],
  }));
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [entry()], categories: ['All'] });
  setMockParams({ item: 'i-1' });
  await renderWithProviders(<ItemScreen />, sessionAs('member'));
  await screen.findByTestId('item-title');
  return fake;
}

describe("an item's page (build 28, F4–F6)", () => {
  it('its tiles — Total, Keep in green, Drop in red — then the "Policy file" row, then its runs', async () => {
    await openItem({ item: item(), runs: [] });
    const tiles = within(screen.getByTestId('item-tiles')).getAllByText(/./u);
    expect(tiles.map((node) => node.props.children)).toEqual(['5', 'Total', '3', 'Keep', '1', 'Drop']);
    const color = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style as never) as { color?: string }).color;
    expect(color(tiles[2]!)).toBe(status.ok);
    expect(color(tiles[4]!)).toBe(status.err);
    expect(screen.getAllByTestId(/^item-(tiles|open-file|runs)$/u).map((node) => node.props.testID)).toEqual([
      'item-tiles',
      'item-open-file',
      'item-runs',
    ]);
    expect(within(screen.getByTestId('item-open-file')).getByText('Policy file')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('item-open-file'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/item-file', params: { item: 'i-1' } });
  });

  it('no tiles for a flow whose items name no verdicts; the file row stays', async () => {
    const { verdictWords: _none, ...plain } = DECLARED;
    await openItem({ item: item(), runs: [] }, flowWithItems({ items: plain }));
    expect(screen.queryByTestId('item-tiles')).toBeNull();
    expect(screen.queryByText('Total')).toBeNull();
    expect(screen.getByTestId('item-open-file')).toBeTruthy();
  });
});

/* ───────────────────────────── the item's file ───────────────────────────── */

async function openItemFile(answer: () => Answer<typeof ITEM_FILE> | Promise<Answer<typeof ITEM_FILE>>, read = item()) {
  const fake = fakePlatform(platformOperation);
  fake.always(`GET ${ITEM_ONE}`, { item: read, runs: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', (sent) => ({
    subscriptions: sent.query?.status === 'archived' ? [] : [flowWithItems()],
  }));
  fake.always(ITEM_FILE, () => answer());
  setMockParams({ item: 'i-1' });
  const view = await renderWithProviders(<ItemFileScreen />, sessionAs('member'));
  await screen.findByTestId('item-file-title');
  return { fake, view };
}

describe("an item's file, on a page of its own (build 28, F4)", () => {
  const policy = file('file-1', 'policy.pdf');

  it("the flow's word for it and the item's title; the original drawn, then its name and line, then Download, then the sections, each closed", async () => {
    const { fake } = await openItemFile(() => link(policy));
    expect(screen.getByTestId('item-file-title').props.children).toBe('Policy file');
    expect(screen.getByTestId('item-file-item').props.children).toBe('Leases');
    const web = await screen.findByTestId('item-file-webview');
    expect(web.props.source).toEqual({ uri: 'file:///cache/view-1/view.pdf' });
    expect(screen.getByTestId('item-file-name').props.children).toBe('policy.pdf');
    expect(screen.getByTestId('item-file-line').props.children).toBe('PDF · 1 page · 2 KB');
    expect(
      screen.getAllByTestId(/^item-(file-webview|file-about|file-download|sections)$/u).map((node) => node.props.testID),
    ).toEqual(['item-file-webview', 'item-file-about', 'item-file-download', 'item-sections']);
    // The item's own file, in the workspace the page loaded.
    expect(fake.to(ITEM_FILE)[0]!.values).toEqual({ workspaceId: TEST_WORKSPACE, itemId: 'i-1' });
    // Under it, the item's sections as drop-downs, none open.
    expect(screen.queryByTestId('item-sections-0-body')).toBeNull();
    await fireEvent.press(screen.getByTestId('item-sections-0'));
    expect(within(screen.getByTestId('item-sections-0-body')).getByText('Either side may end it on 90 days.')).toBeTruthy();
    expect(screen.getByTestId('item-sections-1')).toBeTruthy();
  });

  it('"Opening the file…" while it comes; the cached copy is deleted when the page closes', async () => {
    let release: () => void = () => undefined;
    const { view } = await openItemFile(() => new Promise((done) => (release = () => done(link(policy)))));
    // Nothing named yet.
    expect(screen.queryByTestId('item-file-name')).toBeNull();
    expect(screen.getByText('Opening the file…')).toBeTruthy();
    await act(async () => release());
    await screen.findByTestId('item-file-webview');
    expect(saved[0]!.delete).not.toHaveBeenCalled();
    await view.unmount();
    expect(saved[0]!.delete).toHaveBeenCalledTimes(1);
  });

  it('Download asks for a fresh link and hands the file to the share sheet; refused, "Could not download. Try again."', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    let reads = 0;
    const { fake } = await openItemFile(() => {
      reads += 1;
      if (reads === 3) throw new PlatformError('Bad Gateway', 502);
      return link(policy, `https://files.example.com/file-1?sig=${reads}`);
    });
    await screen.findByTestId('item-file-webview');
    await fireEvent.press(screen.getByTestId('item-file-download'));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ url: 'file:///cache/policy.pdf' }));
    expect(downloadSignedFile).toHaveBeenLastCalledWith('https://files.example.com/file-1?sig=2', 'policy.pdf');
    expect(fake.to(ITEM_FILE)).toHaveLength(2);
    // The shared copy is removed once shared; the drawn one stays.
    expect(saved[1]!.delete).toHaveBeenCalledTimes(1);
    expect(saved[0]!.delete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('item-file-download'));
    expect(await screen.findByText('Could not download. Try again.')).toBeTruthy();
    share.mockRestore();
  });

  it('a link that is not https, or a store that does not answer: "Could not open the file. Try again." — and Try again reads it again', async () => {
    let reads = 0;
    const { fake } = await openItemFile(() => {
      reads += 1;
      if (reads === 1) return link(policy, 'http://files.example.com/file-1');
      if (reads === 2) throw new PlatformError('Bad Gateway', 502);
      return link(policy);
    });
    expect(await screen.findByText('Could not open the file. Try again.')).toBeTruthy();
    expect(downloadSignedFile).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('item-file-retry'));
    expect(await screen.findByText('Could not open the file. Try again.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('item-file-retry'));
    expect(await screen.findByTestId('item-file-webview')).toBeTruthy();
    expect(fake.to(ITEM_FILE)).toHaveLength(3);
  });

  it("security (build 28's review, finding 5): saved by its type in a folder of its own for each view, never under the uploader's name; no JavaScript, and nothing read past that folder", async () => {
    // A PDF its uploader named as a web page: the name never decides how it is drawn.
    const disguised = file('file-2', 'cv.html');
    const { view } = await openItemFile(() => link(disguised));
    const web = await screen.findByTestId('item-file-webview');
    expect(downloadSignedFile).toHaveBeenCalledWith('https://files.example.com/file-2?sig=1', 'view.pdf', { freshFolder: true });
    expect(web.props.javaScriptEnabled).toBe(false);
    expect(web.props.allowingReadAccessToURL).toBe('file:///cache/view-1/');
    expect(web.props.source.uri.startsWith(web.props.allowingReadAccessToURL)).toBe(true);
    // Viewed again: another folder.
    await view.unmount();
    expect(saved[0]!.delete).toHaveBeenCalledTimes(1);
    resetSnapshot();
    await openItemFile(() => link(disguised));
    expect((await screen.findByTestId('item-file-webview')).props.allowingReadAccessToURL).toBe('file:///cache/view-2/');
  });

  it('a type not drawn in place — a web page, a Word file — says "Download it to open it.", is not saved, and still offers Download', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await openItemFile(() => link(file('file-3', 'policy.pdf', 'text/html')));
    expect(await screen.findByText('Download it to open it.')).toBeTruthy();
    expect(screen.queryByTestId('item-file-webview')).toBeNull();
    expect(downloadSignedFile).not.toHaveBeenCalled();
    expect(screen.getByTestId('item-file-name').props.children).toBe('policy.pdf');
    await fireEvent.press(screen.getByTestId('item-file-download'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    share.mockRestore();
  });

  it('Back goes back', async () => {
    await openItemFile(() => link(policy));
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('a file the store no longer keeps (404): "This file is no longer kept.", no Download and no Try again; the sections still there', async () => {
    await openItemFile(() => {
      throw new PlatformError('Not Found', 404);
    });
    expect(await screen.findByText('This file is no longer kept.')).toBeTruthy();
    expect(screen.queryByTestId('item-file-download')).toBeNull();
    expect(screen.queryByTestId('item-file-retry')).toBeNull();
    expect(screen.getByTestId('item-sections-0')).toBeTruthy();
  });
});

/* ───────────────────────────── a run's files ───────────────────────────── */

type Detail = Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'>;

function runOf(overrides: Partial<Run> = {}): Run {
  return {
    ...runDetailPayload('run-0').run,
    id: 'r1',
    subscriptionId: FLOW,
    templateId: 'policy-check',
    templateVersion: 1,
    status: 'succeeded',
    origin: 'manual',
    rootRunId: 'r1',
    itemId: 'i-1',
    title: 'Northwind lease',
    score: 91,
    ...overrides,
  };
}

function routeRun(detail: Detail) {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces/{workspaceId}/runs/{runId}', detail);
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [entry()], categories: ['All'] });
  fake.always('GET /v1/workspaces/{workspaceId}/approvals', { approvals: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', (sent) => ({
    subscriptions: sent.query?.status === 'archived' ? [] : [flowWithItems()],
  }));
  fake.always('GET /v1/workspaces', {
    workspaces: [{ id: TEST_WORKSPACE, name: 'Acme Operations', type: 'organization', role: 'member' }],
    activeWorkspaceId: TEST_WORKSPACE,
  } as never);
  return fake;
}

const contract = file('file-9', 'northwind.pdf');

describe("a run's files (build 28, F7)", () => {
  it('a "View contract file" row under its name and score, before "CONTRACT DETAILS", opening the file\'s page', async () => {
    routeRun({
      run: runOf(),
      steps: [],
      events: [],
      files: [contract],
      sections: [{ title: 'Parties', entries: [{ title: 'Northwind Ltd' }] }],
    });
    setMockParams({ runId: 'r1' });
    await renderWithProviders(<RunDetailScreen />, sessionAs('member'));
    const row = await screen.findByTestId('run-open-file-file-9');
    expect(within(row).getByText('View contract file')).toBeTruthy();
    expect(screen.getAllByTestId(/^run-(open-file-file-9|sections-block|open-details)$/u).map((node) => node.props.testID)).toEqual([
      'run-open-file-file-9',
      'run-sections-block',
      'run-open-details',
    ]);
    await fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/activity/run-file',
      params: { runId: 'r1', fileId: 'file-9' },
    });
  });

  it('a run of no item — an Invoice Processing run — has no View row, whatever files its job uploaded', async () => {
    routeRun({ run: runOf({ itemId: undefined }), steps: [], events: [], files: [contract] });
    setMockParams({ runId: 'r1' });
    await renderWithProviders(<RunDetailScreen />, sessionAs('member'));
    await screen.findByTestId('run-open-details');
    expect(screen.queryByTestId(/^run-open-file-/u)).toBeNull();
    expect(screen.queryByText('View contract file')).toBeNull();
  });

  it('a run with no files has no View row', async () => {
    routeRun({ run: runOf(), steps: [], events: [] });
    setMockParams({ runId: 'r1' });
    await renderWithProviders(<RunDetailScreen />, sessionAs('member'));
    await screen.findByTestId('run-open-details');
    expect(screen.queryByTestId(/^run-open-file-/u)).toBeNull();
  });

  it("its page: the file's word and the run's title; the file drawn, its name and line; Download hands it on; the job's own file, in the run's workspace", async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const fake = routeRun({ run: runOf(), steps: [], events: [], files: [contract] });
    fake.always(RUN_FILE, link(contract));
    setMockParams({ runId: 'r1', fileId: 'file-9' });
    await renderWithProviders(<RunFileScreen />, sessionAs('member'));
    expect((await screen.findByTestId('run-file-title')).props.children).toBe('Contract file');
    // Under the word, the run's title; the file's name and line under the file.
    expect(screen.getByTestId('run-file-run').props.children).toBe('Northwind lease');
    const web = await screen.findByTestId('run-file-webview');
    expect(web.props.source).toEqual({ uri: 'file:///cache/view-1/view.pdf' });
    expect(screen.getByTestId('run-file-name').props.children).toBe('northwind.pdf');
    expect(screen.getByTestId('run-file-line').props.children).toBe('PDF · 1 page · 2 KB');
    expect(fake.to(RUN_FILE)[0]!.values).toEqual({ workspaceId: TEST_WORKSPACE, runId: 'r1', fileId: 'file-9' });
    await fireEvent.press(screen.getByTestId('run-file-download'));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ url: 'file:///cache/northwind.pdf' }));
    share.mockRestore();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('its page without a file id is unavailable: Back, no Retry', async () => {
    routeRun({ run: runOf(), steps: [], events: [], files: [contract] });
    setMockParams({ runId: 'r1' });
    await renderWithProviders(<RunFileScreen />, sessionAs('member'));
    expect(await screen.findByTestId('screen-unavailable')).toBeTruthy();
  });
});
