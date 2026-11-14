jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
  putFileToSignedUrl: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn() }));
// The field's clip, a stand-in a test can find; every other icon is the real one.
jest.mock('phosphor-react-native', () => {
  const actual = jest.requireActual('phosphor-react-native');
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, ...actual, Paperclip: () => createElement(View, { testID: 'icon-Paperclip' }) };
});

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';

import { YourFlows } from '@/components/flows/your-flows';
import type { AutomationRunInputField } from '@/lib/platform/automations';
import type { HomeFlow } from '@/lib/view/home';
import { TEST_WORKSPACE, flowCatalogPayload, sessionAs, subscriptionsPayload } from '@/test/platform';
import { renderWithProviders, setTextSize } from '@/test/render';

const { platformOperation, newIdempotencyKey, putFileToSignedUrl } = jest.requireMock('@/lib/platform/client');

/**
 * The owner's build 42 item 16 (2026-11-08): "Why is the size of the card so
 * big still … Maybe we dont need the clip icon and document/resume in there …
 * It looks like big squares for a quick access". Home's card is two rows: the
 * icon and name (a flow with jobs' job pill on their right), then Take photo,
 * Upload and Start on one wrapping row, with no Paperclip and no field title
 * for a run input of one file. The flow page's and item page's forms are held
 * by their own tests, untouched.
 */

type Init = { params?: { path?: Record<string, string>; header?: Record<string, string> }; body?: unknown };
let sent: { method: string; path: string; body?: unknown }[];
let answers: Record<string, () => unknown>;

const ITEMS_PATH = '/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items';
const RUNS_PATH = '/v1/workspaces/{workspaceId}/runs';

beforeEach(() => {
  sent = [];
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  putFileToSignedUrl.mockResolvedValue(undefined);
  answers = {
    [`GET ${ITEMS_PATH}`]: () => ({ items: [job('j-designer', 'Designer')], choices: {} }),
    'POST /v1/workspaces/{workspaceId}/uploads': () => ({
      uploadSessionId: 'upload-1',
      uploadUrl: 'https://store.example.test/put',
      expiresAt: '2026-11-08T12:00:00Z',
      maximumSizeBytes: 10_000_000,
    }),
    'POST /v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete': () => ({
      artifact: { artifactId: 'artifact-1', filename: 'cv.pdf', contentType: 'application/pdf', sizeBytes: 5 },
    }),
    [`POST ${RUNS_PATH}`]: () => ({ run: { id: 'run-1' } }),
  };
  const call = (method: string) => async (path: string, init: Init) => {
    sent.push({ method, path, body: init.body });
    return { data: answers[`${method} ${path}`]?.() ?? {} };
  };
  const clients = {
    automations: { GET: call('GET'), POST: call('POST'), PATCH: call('PATCH') },
    platform: { PUT: call('PUT') },
  };
  platformOperation.mockImplementation(async (_key: string, execute: Function) => (await execute(clients)).data);
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/DocumentPicker/cv.pdf', name: 'cv.pdf', mimeType: 'application/pdf', lastModified: 0 }],
  });
  (File as unknown as jest.Mock).mockImplementation(() => ({ size: 5, bytes: async () => new Uint8Array(5) }));
});

const RESUME: AutomationRunInputField = { key: 'resume', title: 'Resume', description: 'The file.', control: 'artifact', required: true };
const RESUMES: AutomationRunInputField = {
  key: 'resumes',
  title: 'Resumes',
  description: 'The files.',
  control: 'artifact',
  required: true,
  multiple: true,
};
const NOTE: AutomationRunInputField = { key: 'note', title: 'Note', description: 'A line.', control: 'text', required: false };
const DECLARED = {
  words: { singular: 'Job', plural: 'Jobs' },
  runWords: { singular: 'Candidate', plural: 'Candidates' },
  titleField: 'title',
  groupField: 'department',
  fields: [{ key: 'title', title: 'Title', control: 'text' as const, required: true }],
  file: { key: 'jobFile', title: 'Job description', description: 'A PDF.', acceptedContentTypes: ['application/pdf'] },
};

function job(id: string, title: string) {
  return {
    id,
    subscriptionId: 'email',
    title,
    fields: { title, department: 'Product' },
    status: 'ready' as const,
    runCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    topScore: null,
    createdAt: '2026-10-20T10:00:00Z',
    createdByUserId: null,
    archivedAt: null,
  };
}

/** A one-file flow (invoice), a two-field flow (kpi: file + Note), the jobs flow (email, one file) and a several-file flow (lead). */
function flows(): HomeFlow[] {
  const catalog = flowCatalogPayload().automations;
  const live = subscriptionsPayload().subscriptions;
  const of = (id: string, over: Record<string, unknown>): HomeFlow => {
    const subscription = { ...live.find((row) => row.id === id)!, status: 'live' as const, ...over };
    return { subscription, entry: catalog.find((entry) => entry.templateId === subscription.templateId) } as HomeFlow;
  };
  return [
    of('email', { runInput: [RESUME], items: DECLARED }),
    of('invoice', { runInput: [RESUME] }),
    of('kpi', { runInput: [RESUME, NOTE] }),
    of('lead', { runInput: [RESUMES] }),
  ];
}

const onStarted = jest.fn();

/** Every host Text under a drawn element. */
type Node = { type?: unknown; props?: { numberOfLines?: unknown }; children?: unknown[] | null };
function hostTexts(node: unknown): Node[] {
  if (!node || typeof node !== 'object') return [];
  const host = node as Node;
  const own = host.type === 'Text' ? [host] : [];
  return [...own, ...(host.children ?? []).flatMap(hostTexts)];
}

type Drawn = ReturnType<typeof screen.getByTestId>;
/** The styles of `node` and each element above it, up to (not including) the one with testID `stop`, or the root. */
function stylesUp(node: Drawn | null, stop?: string): ViewStyle[] {
  const styles: ViewStyle[] = [];
  for (let at = node; at && (stop === undefined || at.props.testID !== stop); at = at.parent) {
    const style = StyleSheet.flatten(at.props.style) as ViewStyle | undefined;
    if (style) styles.push(style);
  }
  return styles;
}
/** Where the open menu grows from: "top right" opens on the end edge, "top left" on the start. */
const menuOrigin = (testID: string) => stylesUp(screen.getByTestId(`${testID}-menu`)).find((style) => style.transformOrigin)?.transformOrigin;

/**
 * Home's Upload, where the field takes a photo, is a menu since the owner's
 * build 43 item 17: Upload, then Choose file, then the menu gone — iOS says so
 * through the Modal's `onDismiss`, which the test calls as iOS would.
 */
async function chooseFile(card: ReturnType<typeof within>, key: string) {
  await fireEvent.press(card.getByTestId(`run-file-${key}-upload`));
  let modal: Drawn | null = screen.getByTestId(`run-file-${key}-upload-menu`);
  while (modal && typeof modal.props.onDismiss !== 'function') modal = modal.parent;
  const dismissed = modal!.props.onDismiss as () => void;
  await fireEvent.press(screen.getByTestId(`run-file-${key}-file`));
  await act(async () => dismissed());
}

async function renderFlows() {
  return renderWithProviders(
    <YourFlows
      sections={[{ department: 'Finance', flows: flows() }]}
      shownWorkspaceId={TEST_WORKSPACE}
      canManage
      onStarted={onStarted}
      onOpen={jest.fn()}
    />,
    sessionAs('owner'),
  );
}

describe("Home's compact quick-access card (the owner's build 42 item 16)", () => {
  it('(a) a one-file card has no Paperclip and no field title; a two-field card keeps both titles', async () => {
    await renderFlows();
    const invoice = await screen.findByTestId('home-flow-invoice');
    expect(within(invoice).queryByTestId('icon-Paperclip')).toBeNull();
    expect(within(invoice).queryByText('Resume')).toBeNull();
    const kpi = screen.getByTestId('home-flow-kpi');
    expect(within(kpi).getAllByTestId('icon-Paperclip')).toHaveLength(1);
    expect(within(kpi).getByText('Resume')).toBeTruthy();
    expect(within(kpi).getByText('Note')).toBeTruthy();
    // Two fields: Start keeps its own row, outside the file's buttons.
    expect(within(within(kpi).getByTestId('home-flow-kpi-form')).getByTestId('start-run-button')).toBeTruthy();
    expect(within(kpi).queryByTestId('run-file-resume-actions')).toBeNull();
  });

  it('(b) Upload and Start sit on one row; (e) Start reads "Start", said "Start run", Upload names the field', async () => {
    await renderFlows();
    const invoice = within(await screen.findByTestId('home-flow-invoice'));
    const row = within(invoice.getByTestId('run-file-resume-actions'));
    // ~~Take photo, Upload and Start~~ until the owner's build 43 item 17: Take photo is inside Upload's menu.
    expect(row.queryByTestId('run-file-resume-photo')).toBeNull();
    const upload = row.getByTestId('run-file-resume-upload');
    const start = row.getByTestId('start-run-button');
    expect(within(start).getByText('Start')).toBeTruthy();
    expect(start.props.accessibilityLabel).toBe('Start run');
    expect(upload.props.accessibilityLabel).toContain('Resume');
    // The row wraps rather than clipping a label.
    expect((StyleSheet.flatten(invoice.getByTestId('run-file-resume-actions').props.style) as ViewStyle).flexWrap).toBe('wrap');
  });

  it("(c) a flow with jobs has its job pill in the card's title row, and Start in the file's row", async () => {
    await renderFlows();
    const top = within(await screen.findByTestId('home-flow-email-top'));
    expect((await top.findByTestId('home-flow-email-item')).props.accessibilityLabel).toBe('Job: Designer');
    const form = within(screen.getByTestId('home-flow-email-form'));
    expect(within(form.getByTestId('run-file-resume-actions')).getByTestId('start-run-button')).toBeTruthy();
  });

  it('(d) no line before a pick; "Uploading {name}…" with Start held while it uploads; then the file\'s pill', async () => {
    let arrive: () => void = () => undefined;
    putFileToSignedUrl.mockImplementation(() => new Promise<void>((resolve) => (arrive = resolve)));
    await renderFlows();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    expect(card.queryByText(/^Uploading /u)).toBeNull();
    expect(card.queryByTestId('run-file-resume-pills')).toBeNull();
    await chooseFile(card, 'resume');
    expect(await card.findByText('Uploading cv.pdf…')).toBeTruthy();
    const held = card.getByTestId('start-run-button');
    expect(within(held).getByText('Uploading…')).toBeTruthy();
    expect(held.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(held);
    expect(sent.filter((request) => request.path === RUNS_PATH)).toHaveLength(0);
    await act(async () => arrive());
    // ~~"Ready: cv.pdf (5 bytes)"~~ until the owner's build 43 item 17: the file's pill.
    expect(within(await card.findByTestId('run-file-resume-pill-0')).getByText('cv.pdf')).toBeTruthy();
    await fireEvent.press(card.getByTestId('start-run-button'));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith({ runId: 'run-1', subscriptionId: 'invoice' }));
    expect(sent.find((request) => request.path === RUNS_PATH)!.body).toEqual({ subscriptionId: 'invoice', input: { resume: 'artifact-1' } });
  });

  it('(a2) a several-file card is compact too: no Paperclip, no title, Start in its row, the pills under the row after a pick', async () => {
    await renderFlows();
    const lead = within(await screen.findByTestId('home-flow-lead'));
    expect(lead.queryByTestId('icon-Paperclip')).toBeNull();
    expect(lead.queryByText('Resumes')).toBeNull();
    const row = within(lead.getByTestId('run-file-resumes-actions'));
    // ~~Take photo in the row~~ until build 43 item 17: inside Upload's menu.
    expect(row.queryByTestId('run-file-resumes-photo')).toBeNull();
    expect(row.getByTestId('run-file-resumes-upload')).toBeTruthy();
    expect(within(row.getByTestId('start-run-button')).getByText('Start')).toBeTruthy();
    expect(lead.queryByTestId('run-file-resumes-pills')).toBeNull();
    await chooseFile(lead, 'resumes');
    // ~~The count line `run-file-resumes-count`, "Ready: cv.pdf (5 bytes)"~~ until build 43 item 17: a pill, under the row.
    expect(within(await lead.findByTestId('run-file-resumes-pill-0')).getByText('cv.pdf')).toBeTruthy();
    expect(row.queryByTestId('run-file-resumes-pills')).toBeNull();
    expect(within(lead.getByTestId('home-flow-lead-form')).getByTestId('run-file-resumes-pills')).toBeTruthy();
  });

  it('(f) at the default size the title row is a row, the job pill at most half of it, its menu on the end edge', async () => {
    await renderFlows();
    const top = await screen.findByTestId('home-flow-email-top');
    expect((StyleSheet.flatten(top.props.style) as ViewStyle).flexDirection).toBe('row');
    const pill = await within(top).findByTestId('home-flow-email-item');
    expect(stylesUp(pill, 'home-flow-email-top')).toContainEqual(expect.objectContaining({ maxWidth: '50%', flexShrink: 1 }));
    await fireEvent.press(pill);
    expect(menuOrigin('home-flow-email-item')).toMatch(/ right$/u);
  });

  it('(f) at the largest text size the buttons and the title row stack, the job menu on the start edge, and no label is cut to one line', async () => {
    const restore = setTextSize(3.571);
    try {
      await renderFlows();
      const top = await screen.findByTestId('home-flow-email-top');
      expect((StyleSheet.flatten(top.props.style) as ViewStyle).flexDirection).toBe('column');
      // Stacked under the name, the pill sits on the start side, and so does its menu.
      await fireEvent.press(await within(top).findByTestId('home-flow-email-item'));
      expect(menuOrigin('home-flow-email-item')).toMatch(/ left$/u);
      const row = (await screen.findAllByTestId('run-file-resume-actions'))[0]!;
      expect((StyleSheet.flatten(row.props.style) as ViewStyle).flexDirection).toBe('column');
      const labels = hostTexts(row);
      // Upload and Start (~~three, with Take photo~~ until build 43 item 17).
      expect(labels.length).toBeGreaterThanOrEqual(2);
      for (const label of labels) expect(label.props?.numberOfLines).toBeUndefined();
    } finally {
      await act(async () => {
        restore();
      });
    }
  });

  it('(g) no ready job: "No jobs yet." and Upload job on one row, in the card', async () => {
    answers[`GET ${ITEMS_PATH}`] = () => ({ items: [], choices: {} });
    await renderFlows();
    const row = within(await screen.findByTestId('home-flow-email-empty-row'));
    expect(row.getByTestId('home-flow-email-items-line').props.children).toBe('No jobs yet.');
    expect(within(row.getByTestId('home-flow-email-upload')).getByText('Upload job')).toBeTruthy();
    expect(within(screen.getByTestId('home-flow-email')).getByTestId('home-flow-email-empty-row')).toBeTruthy();
  });
});
