jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
  putFileToSignedUrl: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { AccessibilityInfo, ActionSheetIOS, Platform } from 'react-native';

import { StartRun } from '@/components/automations/start-run';
import { YourFlows } from '@/components/flows/your-flows';
import { ItemUploadDialog } from '@/components/items/item-upload-dialog';
import type { AutomationRunInputField } from '@/lib/platform/automations';
import type { HomeFlow } from '@/lib/view/home';
import { TEST_WORKSPACE, flowCatalogPayload, sessionAs, subscriptionsPayload } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation, newIdempotencyKey, putFileToSignedUrl } = jest.requireMock('@/lib/platform/client');
/** react-native's own exports (a named import reads them at the call), where `findNodeHandle` is replaced. */
const ReactNative: typeof import('react-native') = jest.requireActual('react-native');

type Init = { params?: { path?: Record<string, string>; header?: Record<string, string> }; body?: unknown };
let sent: { method: string; path: string; body?: unknown }[];
let answers: Record<string, () => unknown>;
let stored: string[];
let sheet: jest.SpyInstance;
let handle: jest.SpyInstance;
let ios: jest.ReplaceProperty<typeof Platform.OS>;
/** The native handle `findNodeHandle` gives Upload's view (the sheet's iPad anchor); any other view has none. */
const UPLOAD_HANDLE = 4242;

const RUNS_PATH = '/v1/workspaces/{workspaceId}/runs';
const COMPLETE_PATH = '/v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete';
const runs = () => sent.filter((request) => request.path === RUNS_PATH);
const uploadsDone = () => sent.filter((request) => request.path === COMPLETE_PATH);

beforeEach(() => {
  ios = jest.replaceProperty(Platform, 'OS', 'ios');
  sent = [];
  stored = [];
  let n = 0;
  let uploads = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  putFileToSignedUrl.mockResolvedValue(undefined);
  answers = {
    'POST /v1/workspaces/{workspaceId}/uploads': () => ({
      uploadSessionId: 'upload-1',
      uploadUrl: 'https://store.example.test/put',
      expiresAt: '2026-11-14T12:00:00Z',
      maximumSizeBytes: 10_000_000,
    }),
    [`POST ${COMPLETE_PATH}`]: () => {
      uploads += 1;
      const filename = stored.shift() ?? 'cv.pdf';
      return { artifact: { artifactId: `artifact-${uploads}`, filename, contentType: 'application/pdf', sizeBytes: 5 } };
    },
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
  pickerGives(['cv.pdf']);
  (File as unknown as jest.Mock).mockImplementation(() => ({ size: 5, bytes: async () => new Uint8Array(5) }));
  (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
  reencodes();
  sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => undefined);
  // Jest has no native views, so no handles: Upload's view is given one, to see that it is what the sheet is anchored to.
  // (react-native exports it through a getter, so the getter is what is replaced.)
  const handleOf = (view: { props?: { testID?: string } } | null) => (/-upload$/u.test(view?.props?.testID ?? '') ? UPLOAD_HANDLE : null);
  handle = jest.spyOn(ReactNative as unknown as { findNodeHandle: unknown }, 'findNodeHandle', 'get').mockReturnValue(handleOf);
});

afterEach(() => {
  sheet.mockRestore();
  handle.mockRestore();
  ios.restore();
});

/** The document picker hands over `names`, each a PDF; the store names them as given. */
function pickerGives(names: string[]) {
  stored = [...names];
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: names.map((name) => ({ uri: `file:///cache/DocumentPicker/${name}`, name, mimeType: 'application/pdf', lastModified: 0 })),
  });
}

/** Apple's photo picker hands over images named `names` (null: no name); the store names them as the field sends them. */
function libraryGives(names: (string | null)[], storedAs: string[]) {
  stored = [...storedAs];
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: names.map((fileName, at) => ({
      uri: `file:///cache/ImagePicker/${at}.heic`,
      width: 100,
      height: 100,
      type: 'image',
      mimeType: 'image/heic',
      fileName,
    })),
  });
}

/** The camera takes one photo. */
function cameraTakes() {
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/ImagePicker/camera.jpg', width: 100, height: 100, type: 'image', mimeType: 'image/jpeg', fileName: null }],
  });
  stored.push('photo.jpg');
}

/** The re-encode hands back a small JPEG. */
function reencodes() {
  const image = { width: 100, height: 100, release: jest.fn(), saveAsync: jest.fn(async () => ({ uri: 'file:///cache/encoded.jpg', width: 100, height: 100 })) };
  const context: { renderAsync: jest.Mock; resize: jest.Mock; release: jest.Mock } = {
    renderAsync: jest.fn(async () => image),
    resize: jest.fn(() => context),
    release: jest.fn(),
  };
  (ImageManipulator.manipulate as jest.Mock).mockReturnValue(context);
}

const RESUME: AutomationRunInputField = { key: 'resume', title: 'Resume', description: 'The file.', control: 'artifact', required: true };
const RESUMES: AutomationRunInputField = { ...RESUME, key: 'resumes', title: 'Resumes', multiple: true, maxFiles: 3 };
const PDF_ONLY: AutomationRunInputField = { ...RESUME, key: 'contract', title: 'Contract', acceptedContentTypes: ['application/pdf'] };
const DOCUMENT: AutomationRunInputField = { ...RESUME, key: 'invoiceFile', title: 'Document' };

/** A one-file card (invoice), a PDF-only card (email: no photo) and a several-file card (lead). */
function flows(): HomeFlow[] {
  const catalog = flowCatalogPayload().automations;
  const live = subscriptionsPayload().subscriptions;
  const of = (id: string, over: Record<string, unknown>): HomeFlow => {
    const subscription = { ...live.find((row) => row.id === id)!, status: 'live' as const, ...over };
    return { subscription, entry: catalog.find((entry) => entry.templateId === subscription.templateId) } as HomeFlow;
  };
  return [of('invoice', { runInput: [RESUME] }), of('email', { runInput: [PDF_ONLY] }), of('lead', { runInput: [RESUMES] })];
}

const onStarted = jest.fn();

async function renderHome() {
  await renderWithProviders(
    <YourFlows sections={[{ department: 'Finance', flows: flows() }]} shownWorkspaceId={TEST_WORKSPACE} canManage onStarted={onStarted} onOpen={jest.fn()} />,
    sessionAs('owner'),
  );
}

async function renderForm(runInput: AutomationRunInputField[]) {
  await renderWithProviders(
    <StartRun subscriptionId="sub-1" shownWorkspaceId={TEST_WORKSPACE} runInput={runInput} onStarted={onStarted} />,
    sessionAs('owner'),
  );
}

type Scope = ReturnType<typeof within>;

function pillNames(scope: Scope, key: string): string[] {
  const row = scope.queryByTestId(`run-file-${key}-pills`);
  if (!row) return [];
  return within(row)
    .queryAllByTestId(new RegExp(`^run-file-${key}-pill-\\d+$`, 'u'))
    .map((pill) => String(within(pill).getByText(/./u).props.children));
}

/** Upload on a Home card on iOS, then the sheet's row `index` chosen (its callback, as iOS calls it). */
async function sheetChoice(card: Scope, key: string, index: number) {
  sheet.mockClear();
  await fireEvent.press(card.getByTestId(`run-file-${key}-upload`));
  expect(sheet).toHaveBeenCalledTimes(1);
  const choose = sheet.mock.calls[0]![1] as (index: number) => void;
  await waitFor(async () => choose(index));
}

const card = async (id: string) => within(await screen.findByTestId(`home-flow-${id}`));
const announced = () => (AccessibilityInfo.announceForAccessibility as jest.Mock).mock.calls.map((call) => call[0] as string);

/** The view the screen reader's focus was sent to, by its testID, and the event. */
const focusedOn = () =>
  (AccessibilityInfo.sendAccessibilityEvent as jest.Mock).mock.calls.map(
    (call) => `${(call[0] as { props: { testID: string } }).props.testID} ${call[1] as string}`,
  );

/**
 * The owner's build 43 items (2026-11-14) and the follow-up, in the app: item 2 (Home's pair gone: parity-home,
 * tab-screens, real-router/home-links), item 3 (Apple's native selection on Home's card), items 1 and 17 (a
 * required file), and the screen reader's lines and focus (the follow-up, the website's). The brief's tests 2–7.
 */
describe("item 3: Upload on Home's card opens Apple's action sheet on iOS", () => {
  it('test 2: once, with Safari\'s three rows then Cancel, cancel at 3, anchored to Upload; no menu drawn', async () => {
    await renderHome();
    const invoice = await card('invoice');
    await fireEvent.press(invoice.getByTestId('run-file-resume-upload'));
    expect(sheet).toHaveBeenCalledTimes(1);
    expect(sheet.mock.calls[0]![0]).toEqual({
      options: ['Photo Library', 'Take Photo', 'Choose File', 'Cancel'],
      cancelButtonIndex: 3,
      anchor: UPLOAD_HANDLE,
    });
    expect(typeof sheet.mock.calls[0]![0].anchor).toBe('number');
    expect(screen.queryByTestId('run-file-resume-upload-menu')).toBeNull();
    // Nothing opens until a row is chosen; Start stays after Upload (no auto-start).
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
    expect(runs()).toHaveLength(0);
  });

  it('a field that cannot take a photo opens the document picker at once, no sheet', async () => {
    await renderHome();
    const contract = await card('email');
    await fireEvent.press(contract.getByTestId('run-file-contract-upload'));
    expect(sheet).not.toHaveBeenCalled();
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
  });

  it('test 3: 0 is Photo Library — one upload, its pill; nothing else opens', async () => {
    libraryGives(['IMG_0001.HEIC'], ['IMG_0001.jpg']);
    await renderHome();
    const invoice = await card('invoice');
    await sheetChoice(invoice, 'resume', 0);
    await waitFor(() => expect(pillNames(invoice, 'resume')).toEqual(['IMG_0001.jpg']));
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
    expect(uploadsDone()).toHaveLength(1);
    // Sent as a photo is: re-encoded, under its own name as a .jpg.
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///cache/ImagePicker/0.heic');
    expect(sent.find((request) => request.path === '/v1/workspaces/{workspaceId}/uploads')?.body).toMatchObject({
      filename: 'IMG_0001.jpg',
      contentType: 'image/jpeg',
    });
    // An image with no name: PHOTO_NAME.
    libraryGives([null], ['photo.jpg']);
    await sheetChoice(invoice, 'resume', 0);
    await waitFor(() => expect(uploadsDone()).toHaveLength(2));
    expect(sent.filter((request) => request.path === '/v1/workspaces/{workspaceId}/uploads')[1]?.body).toMatchObject({ filename: 'photo.jpg' });
  });

  it('test 3: a cancelled library keeps what the field held', async () => {
    await renderHome();
    const invoice = await card('invoice');
    await sheetChoice(invoice, 'resume', 2);
    await waitFor(() => expect(pillNames(invoice, 'resume')).toEqual(['cv.pdf']));
    await sheetChoice(invoice, 'resume', 0);
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
    expect(pillNames(invoice, 'resume')).toEqual(['cv.pdf']);
    expect(uploadsDone()).toHaveLength(1);
  });

  it('test 3: 1 is Take Photo (the permission, then the camera), 2 Choose File, 3 nothing', async () => {
    await renderHome();
    const invoice = await card('invoice');
    await sheetChoice(invoice, 'resume', 1);
    await waitFor(() => expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1));
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();

    await sheetChoice(invoice, 'resume', 2);
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();

    await sheetChoice(invoice, 'resume', 3);
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});

describe('test 4: a several-file field on iOS — every choice from the card replaces', () => {
  it('"Choose Files"; Photo Library asks for up to maxFiles and its choice replaces the files held', async () => {
    pickerGives(['a.pdf', 'b.pdf']);
    await renderHome();
    const lead = await card('lead');
    await sheetChoice(lead, 'resumes', 2);
    expect(sheet.mock.calls[0]![0].options).toEqual(['Photo Library', 'Take Photo', 'Choose Files', 'Cancel']);
    await waitFor(() => expect(pillNames(lead, 'resumes')).toEqual(['a.pdf', 'b.pdf']));

    libraryGives(['one.png', 'two.heic'], ['one.jpg', 'two.jpg']);
    await sheetChoice(lead, 'resumes', 0);
    await waitFor(() => expect(pillNames(lead, 'resumes')).toEqual(['one.jpg', 'two.jpg']));
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 3,
    });
    await fireEvent.press(lead.getByTestId('start-run-button'));
    await waitFor(() => expect(runs()).toHaveLength(1));
    expect(runs()[0]!.body).toEqual({ subscriptionId: 'lead', input: { resumes: ['artifact-3', 'artifact-4'] } });
  });

  it('past maxFiles: "Add up to 3 files at a time." and nothing sent; a cancelled library keeps the pills', async () => {
    pickerGives(['a.pdf', 'b.pdf']);
    await renderHome();
    const lead = await card('lead');
    await sheetChoice(lead, 'resumes', 2);
    await waitFor(() => expect(pillNames(lead, 'resumes')).toEqual(['a.pdf', 'b.pdf']));

    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    await sheetChoice(lead, 'resumes', 0);
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
    expect(pillNames(lead, 'resumes')).toEqual(['a.pdf', 'b.pdf']);

    libraryGives(['1.jpg', '2.jpg', '3.jpg', '4.jpg'], []);
    await sheetChoice(lead, 'resumes', 0);
    expect(await lead.findByText('Add up to 3 files at a time.')).toBeTruthy();
    expect(uploadsDone()).toHaveLength(2);
    expect(pillNames(lead, 'resumes')).toEqual([]);
  });

  it("the sheet's Take Photo with two pills held leaves one, the photo; the side-by-side Take photo off the card still adds", async () => {
    pickerGives(['a.pdf', 'b.pdf']);
    await renderHome();
    const lead = await card('lead');
    await sheetChoice(lead, 'resumes', 2);
    await waitFor(() => expect(pillNames(lead, 'resumes')).toEqual(['a.pdf', 'b.pdf']));
    cameraTakes();
    await sheetChoice(lead, 'resumes', 1);
    await waitFor(() => expect(pillNames(lead, 'resumes')).toEqual(['photo.jpg']));

    pickerGives(['a.pdf', 'b.pdf']);
    await renderForm([RESUMES]);
    const box = within(screen.getByTestId('start-run'));
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['a.pdf', 'b.pdf']));
    cameraTakes();
    await fireEvent.press(box.getByTestId('run-file-resumes-photo'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['a.pdf', 'b.pdf', 'photo.jpg']));
    expect(sheet).toHaveBeenCalledTimes(1);
  });
});

describe('test 5: Android keeps item 17\'s menu', () => {
  it('Upload opens the menu (Take photo, Choose file), never the sheet', async () => {
    ios.replaceValue('android');
    await renderHome();
    const invoice = await card('invoice');
    await fireEvent.press(invoice.getByTestId('run-file-resume-upload'));
    const menu = within(screen.getByTestId('run-file-resume-upload-menu'));
    expect(menu.getByText('Take photo')).toBeTruthy();
    expect(menu.getByText('Choose file')).toBeTruthy();
    expect(sheet).not.toHaveBeenCalled();
  });
});

describe('test 6: the screen reader hears an upload end and a file go (the follow-up)', () => {
  it('one file: "Uploaded resume.pdf."; its x: "Removed resume.pdf.", the focus then on Upload', async () => {
    pickerGives(['resume.pdf']);
    await renderForm([RESUME]);
    await fireEvent.press(screen.getByTestId('run-file-resume-upload'));
    await waitFor(() => expect(announced()).toEqual(['Uploaded resume.pdf.']));
    await fireEvent.press(screen.getByTestId('run-file-resume-remove-0'));
    expect(announced()).toEqual(['Uploaded resume.pdf.', 'Removed resume.pdf.']);
    expect(focusedOn()).toEqual(['run-file-resume-upload focus']);
  });

  it('three in one choice: "Uploaded 3 files."; x on the middle: the new middle x; on the last: the one before; on the only one: Upload; then one file: "Uploaded d.pdf."', async () => {
    pickerGives(['a.pdf', 'b.pdf', 'c.pdf']);
    await renderForm([RESUMES]);
    const box = within(screen.getByTestId('start-run'));
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['a.pdf', 'b.pdf', 'c.pdf']));
    expect(announced()).toEqual(['Uploaded 3 files.']);

    await fireEvent.press(box.getByTestId('run-file-resumes-remove-1'));
    expect(pillNames(box, 'resumes')).toEqual(['a.pdf', 'c.pdf']);
    expect(announced().at(-1)).toBe('Removed b.pdf.');
    expect(focusedOn()).toEqual(['run-file-resumes-remove-1 focus']);
    // The x now at that place is c.pdf's.
    expect(box.getByTestId('run-file-resumes-remove-1').props.accessibilityLabel).toBe('Remove c.pdf');

    await fireEvent.press(box.getByTestId('run-file-resumes-remove-1'));
    expect(announced().at(-1)).toBe('Removed c.pdf.');
    expect(focusedOn().at(-1)).toBe('run-file-resumes-remove-0 focus');

    await fireEvent.press(box.getByTestId('run-file-resumes-remove-0'));
    expect(announced().at(-1)).toBe('Removed a.pdf.');
    expect(focusedOn().at(-1)).toBe('run-file-resumes-upload focus');

    // One file in a choice on this several-file field: its name, never "Uploaded 1 files."
    pickerGives(['d.pdf']);
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['d.pdf']));
    expect(announced().at(-1)).toBe('Uploaded d.pdf.');
  });

  it('the job upload card announces nothing new', async () => {
    await renderWithProviders(
      <ItemUploadDialog
        items={{
          words: { singular: 'Job', plural: 'Jobs' },
          runWords: { singular: 'Candidate', plural: 'Candidates' },
          titleField: 'title',
          groupField: 'department',
          fields: [{ key: 'title', title: 'Title', control: 'text' as const, required: true }],
          file: { key: 'jobFile', title: 'Job description', description: 'A PDF.', acceptedContentTypes: ['application/pdf'] },
        }}
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
    expect(announced()).toEqual([]);
  });
});

describe('test 7: a required file (items 1 and 17)', () => {
  it('one required file titled "Document": Start says "Add Document first." and starts nothing', async () => {
    await renderForm([DOCUMENT]);
    await fireEvent.press(screen.getByText('Start run'));
    expect(await screen.findByText('Add Document first.')).toBeTruthy();
    expect(runs()).toHaveLength(0);
  });
});
