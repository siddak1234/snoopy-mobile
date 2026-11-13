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
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';

import { StartRun, missingFile } from '@/components/automations/start-run';
import { YourFlows } from '@/components/flows/your-flows';
import { ItemUploadDialog } from '@/components/items/item-upload-dialog';
import { PILL_HEIGHT } from '@/components/nocturne/pill-button';
import { fonts, nocturneDark, space, typeScale, withAlpha } from '@/constants/theme';
import { CHOOSE_FILE_LABEL, TAKE_PHOTO_LABEL, addFileFirst, removeFileLabel } from '@/lib/content/screen-states';
import type { AutomationRunInputField } from '@/lib/platform/automations';
import { PlatformUnreachableError } from '@/lib/platform/problem';
import type { HomeFlow } from '@/lib/view/home';
import { TEST_WORKSPACE, flowCatalogPayload, sessionAs, subscriptionsPayload } from '@/test/platform';
import { renderWithProviders, setTextSize } from '@/test/render';
import { touch } from '@/test/touch';

const { platformOperation, newIdempotencyKey, putFileToSignedUrl } = jest.requireMock('@/lib/platform/client');

/**
 * The owner's build 43 item 17 (2026-11-13): "for the compact card i want two
 * buttons. icon name of flow / upload start. start should be more bolded and
 * colored so easy to click. start throws an error rather than starting if
 * nothing was uploaded when required … when an upload is done, the document
 * should dynamically show up in a horizontal pill with the document name and
 * an x on the right side of the pill in case it needs to be removed." The
 * shared design's T1–T11 (brief-snoopy-mobile.md), each named below.
 */

type Init = { params?: { path?: Record<string, string>; header?: Record<string, string> }; body?: unknown };
let sent: { method: string; path: string; body?: unknown; key?: string }[];
let answers: Record<string, () => unknown>;
/** The names the store gives the files sent, in order (each upload takes the next). */
let stored: string[];

const ITEMS_PATH = '/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items';
const RUNS_PATH = '/v1/workspaces/{workspaceId}/runs';
const runs = () => sent.filter((request) => request.path === RUNS_PATH);

beforeEach(() => {
  sent = [];
  stored = [];
  let n = 0;
  let uploads = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  putFileToSignedUrl.mockResolvedValue(undefined);
  answers = {
    [`GET ${ITEMS_PATH}`]: () => ({ items: [job('j-designer', 'Designer')], choices: {} }),
    'POST /v1/workspaces/{workspaceId}/uploads': () => ({
      uploadSessionId: 'upload-1',
      uploadUrl: 'https://store.example.test/put',
      expiresAt: '2026-11-13T12:00:00Z',
      maximumSizeBytes: 10_000_000,
    }),
    'POST /v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete': () => {
      uploads += 1;
      const filename = stored.shift() ?? 'cv.pdf';
      return { artifact: { artifactId: `artifact-${uploads}`, filename, contentType: 'application/pdf', sizeBytes: 5 } };
    },
    [`POST ${RUNS_PATH}`]: () => ({ run: { id: 'run-1' } }),
  };
  const call = (method: string) => async (path: string, init: Init) => {
    sent.push({ method, path, body: init.body, key: init.params?.header?.['Idempotency-Key'] });
    return { data: answers[`${method} ${path}`]?.() ?? {} };
  };
  const clients = {
    automations: { GET: call('GET'), POST: call('POST'), PATCH: call('PATCH') },
    platform: { PUT: call('PUT') },
  };
  platformOperation.mockImplementation(async (_key: string, execute: Function) => (await execute(clients)).data);
  pickerGives(['cv.pdf']);
  (File as unknown as jest.Mock).mockImplementation(() => ({ size: 5, bytes: async () => new Uint8Array(5) }));
  (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
});

/** The picker hands over `names`, each a PDF; the store names them as given. */
function pickerGives(names: string[]) {
  stored = [...names];
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: names.map((name) => ({ uri: `file:///cache/DocumentPicker/${name}`, name, mimeType: 'application/pdf', lastModified: 0 })),
  });
}

const RESUME: AutomationRunInputField = { key: 'resume', title: 'Resume', description: 'The file.', control: 'artifact', required: true };
const RESUMES: AutomationRunInputField = { ...RESUME, key: 'resumes', title: 'Resumes', multiple: true, maxFiles: 3 };
const PDF_ONLY: AutomationRunInputField = { ...RESUME, key: 'contract', title: 'Contract', acceptedContentTypes: ['application/pdf'] };
const OPTIONAL: AutomationRunInputField = { ...RESUME, key: 'notes', title: 'Clinical notes', required: false };
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

/** One-file cards (invoice; contract, PDF only, so no photo), a two-field card (kpi) and a several-file card (lead). */
function flows(): HomeFlow[] {
  const catalog = flowCatalogPayload().automations;
  const live = subscriptionsPayload().subscriptions;
  const of = (id: string, over: Record<string, unknown>): HomeFlow => {
    const subscription = { ...live.find((row) => row.id === id)!, status: 'live' as const, ...over };
    return { subscription, entry: catalog.find((entry) => entry.templateId === subscription.templateId) } as HomeFlow;
  };
  return [
    of('invoice', { runInput: [RESUME] }),
    of('email', { runInput: [PDF_ONLY] }),
    of('kpi', { runInput: [RESUME, NOTE] }),
    of('lead', { runInput: [RESUMES] }),
  ];
}

const onStarted = jest.fn();

async function renderHome() {
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

/** The flow page's Step 1 form (detail.tsx draws it so), or the item page's (`itemId`, "Start", types shown). */
async function renderForm(runInput: AutomationRunInputField[], item = false) {
  return renderWithProviders(
    <StartRun
      subscriptionId="sub-1"
      shownWorkspaceId={TEST_WORKSPACE}
      runInput={runInput}
      onStarted={onStarted}
      {...(item ? { itemId: 'i-1', startLabel: 'Start', showTypes: true } : {})}
    />,
    sessionAs('owner'),
  );
}

type Scope = ReturnType<typeof within>;
type Drawn = ReturnType<typeof screen.getByTestId>;

/** The names a field's pills show, in order (none: an empty list). */
function pillNames(scope: Scope, key: string): string[] {
  const row = scope.queryByTestId(`run-file-${key}-pills`);
  if (!row) return [];
  return within(row)
    .queryAllByTestId(new RegExp(`^run-file-${key}-pill-\\d+$`, 'u'))
    .map((pill) => String(within(pill).getByText(/./u).props.children));
}

/** Upload's menu (Home): opened, `choice` pressed, then gone — iOS's `onDismiss`, which the test calls as iOS would. */
async function chooseFromUpload(card: Scope, key: string, choice: 'photo' | 'file') {
  await fireEvent.press(card.getByTestId(`run-file-${key}-upload`));
  let modal: Drawn | null = screen.getByTestId(`run-file-${key}-upload-menu`);
  while (modal && typeof modal.props.onDismiss !== 'function') modal = modal.parent;
  const dismissed = modal!.props.onDismiss as () => void;
  await fireEvent.press(within(screen.getByTestId(`run-file-${key}-upload-menu`)).getByTestId(`run-file-${key}-${choice}`));
  await act(async () => dismissed());
}

/** The buttons in a row, in order: the file's and Start. */
const buttonsIn = (row: Drawn) =>
  within(row)
    .queryAllByTestId(/^(run-file-[a-z]+-(photo|upload)|start-run-button)$/u)
    .map((button) => button.props.testID as string);

const flat = (node: Drawn) => StyleSheet.flatten(node.props.style) as ViewStyle;

describe('missingFile (D4: the pure rule)', () => {
  it('the first required file field with no file, in run-input order; an optional one, or one that holds a file, never', () => {
    expect(missingFile([NOTE, RESUME], {})).toBe(RESUME);
    expect(missingFile([RESUME], { resume: '' })).toBe(RESUME);
    expect(missingFile([RESUMES], { resumes: [] })).toBe(RESUMES);
    expect(missingFile([RESUME], { resume: 'artifact-1' })).toBeNull();
    expect(missingFile([RESUMES], { resumes: ['artifact-1'] })).toBeNull();
    expect(missingFile([OPTIONAL, NOTE], {})).toBeNull();
    expect(missingFile([RESUME, PDF_ONLY], { resume: 'a' })).toBe(PDF_ONLY);
    // A required control that is not a file: today's behaviour, never this check.
    expect(missingFile([{ ...NOTE, required: true }], {})).toBeNull();
    expect(addFileFirst('Resume')).toBe('Add Resume first.');
  });
});

describe("Home's quick-access card (the owner's build 43 item 17)", () => {
  it('T7 one file field: exactly two buttons, Upload then Start; no Take photo on the card', async () => {
    await renderHome();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    const row = card.getByTestId('run-file-resume-actions');
    expect(buttonsIn(row)).toEqual(['run-file-resume-upload', 'start-run-button']);
    expect(card.queryByTestId('run-file-resume-photo')).toBeNull();
    // A card whose input is anything else keeps its fields with their titles, then Start.
    const kpi = within(screen.getByTestId('home-flow-kpi'));
    expect(kpi.getByText('Resume')).toBeTruthy();
    expect(kpi.queryByTestId('run-file-resume-actions')).toBeNull();
  });

  it('T7 Upload opens a menu — Take photo, then Choose file; Take photo reaches the camera only once the menu is gone', async () => {
    await renderHome();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    await fireEvent.press(card.getByTestId('run-file-resume-upload'));
    const menu = within(screen.getByTestId('run-file-resume-upload-menu'));
    expect(menu.getAllByRole('menuitem').map((row) => row.props.testID)).toEqual(['run-file-resume-photo', 'run-file-resume-file']);
    expect(menu.getByText(TAKE_PHOTO_LABEL)).toBeTruthy();
    expect(menu.getByText(CHOOSE_FILE_LABEL)).toBeTruthy();
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    // A press outside closes it with nothing done.
    await fireEvent.press(screen.getByTestId('run-file-resume-upload-backdrop'));
    expect(screen.queryByTestId('run-file-resume-upload-menu')).toBeNull();
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();

    // Take photo: nothing opens while the menu hides; once it is gone (iOS's onDismiss), the camera.
    await fireEvent.press(card.getByTestId('run-file-resume-upload'));
    let modal: Drawn | null = screen.getByTestId('run-file-resume-upload-menu');
    while (modal && typeof modal.props.onDismiss !== 'function') modal = modal.parent;
    const dismissed = modal!.props.onDismiss as () => void;
    await fireEvent.press(within(screen.getByTestId('run-file-resume-upload-menu')).getByTestId('run-file-resume-photo'));
    expect(screen.queryByTestId('run-file-resume-upload-menu')).toBeNull();
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    await act(async () => dismissed());
    await waitFor(() => expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1));
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
  });

  it('T7 Choose file opens the picker; a field that cannot take a photo opens the picker at once, no menu', async () => {
    await renderHome();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    await chooseFromUpload(card, 'resume', 'file');
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();

    const contract = within(screen.getByTestId('home-flow-email'));
    expect(buttonsIn(contract.getByTestId('run-file-contract-actions'))).toEqual([
      'run-file-contract-upload',
      'start-run-button',
    ]);
    await fireEvent.press(contract.getByTestId('run-file-contract-upload'));
    expect(screen.queryByTestId('run-file-contract-upload-menu')).toBeNull();
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(2));
  });

  it('T7 a choice runs once: after Choose file, a later press outside the menu does nothing (D2)', async () => {
    await renderHome();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    await chooseFromUpload(card, 'resume', 'file');
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
    // Upload again, then a press outside: gone (iOS's onDismiss) with nothing done.
    await fireEvent.press(card.getByTestId('run-file-resume-upload'));
    let modal: Drawn | null = screen.getByTestId('run-file-resume-upload-menu');
    while (modal && typeof modal.props.onDismiss !== 'function') modal = modal.parent;
    const dismissed = modal!.props.onDismiss as () => void;
    await fireEvent.press(screen.getByTestId('run-file-resume-upload-backdrop'));
    expect(screen.queryByTestId('run-file-resume-upload-menu')).toBeNull();
    await act(async () => dismissed());
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  });

  it('T8 Start is filled on the card — the accent fill, the label in the page colour, semibold — and said "Start run"', async () => {
    await renderHome();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    const start = card.getByTestId('start-run-button');
    expect(flat(start)).toMatchObject({ backgroundColor: nocturneDark.accent, borderColor: nocturneDark.accent });
    const label = within(start).getByText('Start');
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({ color: nocturneDark.bg, fontFamily: 'Inter_600SemiBold' });
    expect(start.props.accessibilityLabel).toBe('Start run');
    // The two-field card's Start too: the card's, whatever its input.
    expect(flat(within(screen.getByTestId('home-flow-kpi')).getByTestId('start-run-button')).backgroundColor).toBe(nocturneDark.accent);
  });

  it('T1 a required file missing: Start sends nothing and says "Add Resume first." in the card, Start still pressable; T2 given, one start with its id', async () => {
    await renderHome();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    const start = card.getByTestId('start-run-button');
    await fireEvent.press(start);
    expect(await card.findByText('Add Resume first.')).toBeTruthy();
    expect(card.getByText('Add Resume first.').props.accessibilityRole).toBe('alert');
    expect(runs()).toHaveLength(0);
    expect(start.props.accessibilityState?.disabled).toBeFalsy();

    await chooseFromUpload(card, 'resume', 'file');
    await waitFor(() => expect(pillNames(card, 'resume')).toEqual(['cv.pdf']));
    // The line went when the upload started.
    expect(card.queryByText('Add Resume first.')).toBeNull();
    await fireEvent.press(card.getByTestId('start-run-button'));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith({ runId: 'run-1', subscriptionId: 'invoice' }));
    expect(runs().map((request) => request.body)).toEqual([{ subscriptionId: 'invoice', input: { resume: 'artifact-1' } }]);
    // D7: fresh after a start, no pills, no error.
    await waitFor(() => expect(pillNames(card, 'resume')).toEqual([]));
    expect(card.queryByText('Add Resume first.')).toBeNull();
  });

  it('T3 the x takes the file out; none left, Start gives the error again and sends nothing; the same file can be chosen again', async () => {
    await renderHome();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    await chooseFromUpload(card, 'resume', 'file');
    await waitFor(() => expect(pillNames(card, 'resume')).toEqual(['cv.pdf']));
    await fireEvent.press(card.getByTestId('run-file-resume-remove-0'));
    expect(pillNames(card, 'resume')).toEqual([]);
    await fireEvent.press(card.getByTestId('start-run-button'));
    expect(await card.findByText('Add Resume first.')).toBeTruthy();
    expect(runs()).toHaveLength(0);
    pickerGives(['cv.pdf']);
    await chooseFromUpload(card, 'resume', 'file');
    await waitFor(() => expect(pillNames(card, 'resume')).toEqual(['cv.pdf']));
    await fireEvent.press(card.getByTestId('start-run-button'));
    await waitFor(() => expect(runs()).toHaveLength(1));
    expect(runs()[0]!.body).toEqual({ subscriptionId: 'invoice', input: { resume: 'artifact-2' } });
  });

  it('T6 while it uploads Start waits and no pill shows; done, the pill; a failed upload says its words and draws no pill', async () => {
    let arrive: () => void = () => undefined;
    putFileToSignedUrl.mockImplementationOnce(() => new Promise<void>((resolve) => (arrive = resolve)));
    await renderHome();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    await chooseFromUpload(card, 'resume', 'file');
    expect(await card.findByText('Uploading cv.pdf…')).toBeTruthy();
    expect(card.queryByTestId('run-file-resume-pills')).toBeNull();
    const held = card.getByTestId('start-run-button');
    expect(within(held).getByText('Uploading…')).toBeTruthy();
    await fireEvent.press(held);
    expect(runs()).toHaveLength(0);
    expect(card.queryByText('Add Resume first.')).toBeNull();
    await act(async () => arrive());
    await waitFor(() => expect(pillNames(card, 'resume')).toEqual(['cv.pdf']));
    expect(card.queryByText('Uploading cv.pdf…')).toBeNull();

    putFileToSignedUrl.mockRejectedValueOnce(new PlatformUnreachableError());
    await chooseFromUpload(card, 'resume', 'file');
    expect(await card.findByText('The platform is unreachable')).toBeTruthy();
    expect(card.queryByTestId('run-file-resume-pills')).toBeNull();
  });

  it('T4 several files on the card: one pill per file in order, under the buttons, the row sideways', async () => {
    pickerGives(['a.pdf', 'b.pdf']);
    await renderHome();
    const lead = within(await screen.findByTestId('home-flow-lead'));
    await chooseFromUpload(lead, 'resumes', 'file');
    await waitFor(() => expect(pillNames(lead, 'resumes')).toEqual(['a.pdf', 'b.pdf']));
    expect(lead.getByTestId('run-file-resumes-pills').props.horizontal).toBe(true);
    expect(within(lead.getByTestId('run-file-resumes-actions')).queryByTestId('run-file-resumes-pills')).toBeNull();
  });
});

describe('the start forms on the flow page and the item page (default 5: the same pills, x and error)', () => {
  it("T9 the flow page's form keeps its layout — title line, Take photo and Upload side by side — and gains the pill, the x and the error; T8 Start stays primary", async () => {
    await renderForm([RESUME]);
    const box = within(screen.getByTestId('start-run'));
    expect(box.getByTestId('icon-Paperclip')).toBeTruthy();
    expect(box.getByText('Resume')).toBeTruthy();
    expect(box.getByTestId('run-file-resume-photo')).toBeTruthy();
    expect(box.getByTestId('run-file-resume-upload')).toBeTruthy();
    const start = box.getByTestId('start-run-button');
    expect(flat(start)).toMatchObject({ backgroundColor: 'transparent', borderColor: nocturneDark.accent });
    expect(StyleSheet.flatten(within(start).getByText('Start run').props.style)).toMatchObject({ color: nocturneDark.accent });

    await fireEvent.press(start);
    expect(await box.findByText('Add Resume first.')).toBeTruthy();
    expect(runs()).toHaveLength(0);
    await fireEvent.press(box.getByTestId('run-file-resume-upload'));
    await waitFor(() => expect(pillNames(box, 'resume')).toEqual(['cv.pdf']));
    expect(box.queryByText(/^Ready: /u)).toBeNull();
    await fireEvent.press(box.getByTestId('run-file-resume-remove-0'));
    await fireEvent.press(box.getByText('Start run'));
    expect(await box.findByText('Add Resume first.')).toBeTruthy();
    expect(runs()).toHaveLength(0);
  });

  it("T8 the item page's Start stays primary and its form has the same error", async () => {
    await renderForm([RESUME], true);
    const start = screen.getByTestId('start-run-button');
    expect(flat(start).backgroundColor).toBe('transparent');
    await fireEvent.press(start);
    expect(await screen.findByText('Add Resume first.')).toBeTruthy();
    expect(runs()).toHaveLength(0);
  });

  it('T5 an optional file field left empty: Start goes', async () => {
    await renderForm([OPTIONAL]);
    await fireEvent.press(screen.getByText('Start run'));
    await waitFor(() => expect(runs()).toHaveLength(1));
    expect(runs()[0]!.body).toEqual({ subscriptionId: 'sub-1', input: {} });
    expect(screen.queryByText('Add Clinical notes first.')).toBeNull();
  });

  it('T4 several: removing one keeps the others in order; T3 the x renews the key; over maxFiles refused as today', async () => {
    pickerGives(['a.pdf', 'b.pdf', 'c.pdf']);
    answers[`POST ${RUNS_PATH}`] = () => {
      throw new PlatformUnreachableError();
    };
    await renderForm([RESUMES]);
    const box = within(screen.getByTestId('start-run'));
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['a.pdf', 'b.pdf', 'c.pdf']));
    await fireEvent.press(box.getByText('Start run'));
    await waitFor(() => expect(runs()).toHaveLength(1));
    // The same input again reuses the key; the x changes the input, so a new key.
    await fireEvent.press(box.getByText('Start run'));
    await waitFor(() => expect(runs()).toHaveLength(2));
    expect(runs()[1]!.key).toBe(runs()[0]!.key);
    await fireEvent.press(box.getByTestId('run-file-resumes-remove-1'));
    expect(pillNames(box, 'resumes')).toEqual(['a.pdf', 'c.pdf']);
    await fireEvent.press(box.getByText('Start run'));
    await waitFor(() => expect(runs()).toHaveLength(3));
    expect(runs()[2]!.body).toEqual({ subscriptionId: 'sub-1', input: { resumes: ['artifact-1', 'artifact-3'] } });
    expect(runs()[2]!.key).not.toBe(runs()[1]!.key);

    // Every one out: the field is empty, and Start says so.
    await fireEvent.press(box.getByTestId('run-file-resumes-remove-0'));
    await fireEvent.press(box.getByTestId('run-file-resumes-remove-0'));
    expect(box.queryByTestId('run-file-resumes-pills')).toBeNull();
    await fireEvent.press(box.getByText('Start run'));
    expect(await box.findByText('Add Resumes first.')).toBeTruthy();
    expect(runs()).toHaveLength(3);

    pickerGives(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']);
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    expect(await box.findByText('Add up to 3 files at a time.')).toBeTruthy();
    expect(box.queryByTestId('run-file-resumes-pills')).toBeNull();
  });

  it("T10 the x: a real button, said \"Remove {name}\", a 44 target, its tint pressed; T10 the largest text size: one sideways row, a long name cut, the pill no wider than the row", async () => {
    const restore = setTextSize(3.571);
    try {
      const long = 'a-very-long-curriculum-vitae-file-name-for-the-designer-role-2026.pdf';
      pickerGives([long, 'b.pdf']);
      await renderForm([RESUMES]);
      const box = within(screen.getByTestId('start-run'));
      await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
      await waitFor(() => expect(pillNames(box, 'resumes')).toEqual([long, 'b.pdf']));
      const x = box.getByTestId('run-file-resumes-remove-0');
      expect(x.props.accessibilityRole).toBe('button');
      expect(x.props.accessibilityLabel).toBe(removeFileLabel(long));
      expect(x.props.accessibilityLabel).toBe(`Remove ${long}`);
      expect(flat(x)).toMatchObject({ width: PILL_HEIGHT, height: PILL_HEIGHT });
      expect(PILL_HEIGHT).toBeGreaterThanOrEqual(44);
      expect(flat(x).backgroundColor).toBeUndefined();
      await fireEvent(x, 'responderGrant', touch('onResponderGrant'));
      expect(flat(box.getByTestId('run-file-resumes-remove-0')).backgroundColor).toBe(withAlpha(nocturneDark.text, 0.07));
      const row = box.getByTestId('run-file-resumes-pills');
      expect(row.props.horizontal).toBe(true);
      await fireEvent(row, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 280, height: 60 } } });
      const pill = box.getByTestId('run-file-resumes-pill-0');
      // The pill's look (D5), held here as the website's test holds its own: the neutral outline,
      // the row's left step, the name at the small size in the regular face and the text colour.
      expect(flat(pill)).toMatchObject({
        maxWidth: 280,
        minHeight: PILL_HEIGHT,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: nocturneDark.neutral[700],
        paddingLeft: space.rowX,
      });
      const name = within(pill).getByText(long);
      expect(name.props.numberOfLines).toBe(1);
      expect(name.props.ellipsizeMode).toBe('tail');
      expect(flat(name)).toMatchObject({ fontSize: typeScale.small.fontSize, fontFamily: fonts.regular, color: nocturneDark.text });
      // Let go: the press runs, and that file is out.
      await fireEvent(x, 'responderRelease', touch('onResponderRelease'));
      await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['b.pdf']));
    } finally {
      await act(async () => {
        restore();
      });
    }
  });
});

describe('the job upload card (T11: unchanged)', () => {
  it('keeps its "Ready:" line, and no pill and no x', async () => {
    await renderWithProviders(
      <ItemUploadDialog
        items={DECLARED}
        choices={{}}
        subscriptionId="email"
        shownWorkspaceId={TEST_WORKSPACE}
        onClose={jest.fn()}
        onMade={jest.fn()}
      />,
      sessionAs('owner'),
    );
    await fireEvent.press(screen.getByTestId('run-file-jobFile-upload'));
    expect(await screen.findByText('Ready: cv.pdf (5 bytes)')).toBeTruthy();
    expect(screen.queryByTestId('run-file-jobFile-pills')).toBeNull();
    expect(screen.queryByTestId('run-file-jobFile-remove-0')).toBeNull();
  });
});
