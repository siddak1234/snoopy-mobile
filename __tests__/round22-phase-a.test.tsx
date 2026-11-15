jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
  putFileToSignedUrl: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
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
import { ActionSheetIOS, Platform } from 'react-native';

import { StartRun } from '@/components/automations/start-run';
import { YourFlows } from '@/components/flows/your-flows';
import { ItemUploadDialog } from '@/components/items/item-upload-dialog';
import { discardUpload, type AutomationRunInputField } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { takesPhotos } from '@/lib/platform/run-image';
import type { HomeFlow } from '@/lib/view/home';
import { TEST_WORKSPACE, flowCatalogPayload, sessionAs, subscriptionsPayload } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation, newIdempotencyKey, putFileToSignedUrl } = jest.requireMock('@/lib/platform/client');

/**
 * Round 22 phase A, the owner's words of 2026-11-15: "go with recommended. delete at once. … / 19. align a-d no
 * assumptions and no laziness." Decision 17 (the app's part): the x, a choice that replaces a file and the job
 * card's Cancel discard the file at once (`discardUpload`), silently; the x held while Start is pending. Decision
 * 19: (a) Upload off Home's card opens Apple's sheet on iOS where the field takes a photo, as Safari's menu opens
 * off the website's; (b) a photo keeps the name its camera or picker gives; (c) "Upload for {title}", "Take photo
 * for {title}"; (d) an empty accept list takes no photo, a JPEG in any case does.
 */

type Init = { params?: { path?: Record<string, string>; header?: Record<string, string> }; body?: unknown };
let sent: { method: string; path: string; body?: unknown; values?: Record<string, string> }[];
let answers: Record<string, () => unknown>;
/** The names the store gives the files sent, in order. */
let stored: string[];

const RUNS_PATH = '/v1/workspaces/{workspaceId}/runs';
const UPLOADS_PATH = '/v1/workspaces/{workspaceId}/uploads';
const COMPLETE_PATH = '/v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete';
const DISCARD_PATH = '/v1/workspaces/{workspaceId}/uploads/{artifactId}';
/** The files discarded, by id, in order. */
const discarded = () => sent.filter((request) => request.method === 'DELETE' && request.path === DISCARD_PATH).map((request) => request.values);
const opened = () => sent.filter((request) => request.path === UPLOADS_PATH).map((request) => request.body as { filename: string });
const runs = () => sent.filter((request) => request.path === RUNS_PATH);

beforeEach(() => {
  sent = [];
  stored = [];
  let n = 0;
  let uploads = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  putFileToSignedUrl.mockResolvedValue(undefined);
  answers = {
    [`POST ${UPLOADS_PATH}`]: () => ({ uploadSessionId: 'upload-1', uploadUrl: 'https://store.example.test/put', expiresAt: '2026-11-15T12:00:00Z', maximumSizeBytes: 10_000_000 }),
    [`POST ${COMPLETE_PATH}`]: () => {
      uploads += 1;
      return { artifact: { artifactId: `artifact-${uploads}`, filename: stored.shift() ?? 'cv.pdf', contentType: 'application/pdf', sizeBytes: 5 } };
    },
    [`POST ${RUNS_PATH}`]: () => ({ run: { id: 'run-1' } }),
    [`DELETE ${DISCARD_PATH}`]: () => undefined,
  };
  const call = (method: string) => async (path: string, init: Init) => {
    sent.push({ method, path, body: init.body, values: init.params?.path });
    return { data: await answers[`${method} ${path}`]?.() };
  };
  const clients = { automations: { GET: call('GET'), POST: call('POST'), PATCH: call('PATCH'), DELETE: call('DELETE') } };
  platformOperation.mockImplementation(async (_key: string, execute: Function) => (await execute(clients)).data);
  pickerGives(['cv.pdf']);
  (File as unknown as jest.Mock).mockImplementation(() => ({ size: 5, bytes: async () => new Uint8Array(5) }));
  (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
  const image = { width: 100, height: 100, release: jest.fn(), saveAsync: jest.fn(async () => ({ uri: 'file:///cache/encoded.jpg', width: 100, height: 100 })) };
  const context: { renderAsync: jest.Mock; resize: jest.Mock; release: jest.Mock } = {
    renderAsync: jest.fn(async () => image),
    resize: jest.fn(() => context),
    release: jest.fn(),
  };
  (ImageManipulator.manipulate as jest.Mock).mockReturnValue(context);
});

/** The document picker hands over `names`, each a PDF; the store names them as given (in place of any names still waiting). */
function pickerGives(names: string[]) {
  stored = [...names];
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: names.map((name) => ({ uri: `file:///cache/DocumentPicker/${name}`, name, mimeType: 'application/pdf', lastModified: 0 })),
  });
}

/** The camera takes one photo, named as the platform names it (`fileName`). */
function cameraTakes(fileName: string | null) {
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/ImagePicker/camera.jpg', width: 100, height: 100, type: 'image', mimeType: 'image/jpeg', fileName }],
  });
  stored.push('photo-stored.jpg');
}

const RESUME: AutomationRunInputField = { key: 'resume', title: 'Resume', description: 'The file.', control: 'artifact', required: true };
const RESUMES: AutomationRunInputField = { ...RESUME, key: 'resumes', title: 'Resumes', multiple: true, maxFiles: 3 };
const PDF_ONLY: AutomationRunInputField = { ...RESUME, key: 'contract', title: 'Contract', acceptedContentTypes: ['application/pdf'] };
const onStarted = jest.fn();

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

function jobCard(accepted: string[], onClose = jest.fn()) {
  return renderWithProviders(
    <ItemUploadDialog
      items={{
        words: { singular: 'Job', plural: 'Jobs' },
        runWords: { singular: 'Candidate', plural: 'Candidates' },
        titleField: 'title',
        fields: [{ key: 'title', title: 'Title', control: 'text', required: true }],
        file: { key: 'jobFile', title: 'Job description', description: 'The file.', acceptedContentTypes: accepted },
      }}
      choices={{}}
      subscriptionId="email"
      shownWorkspaceId={TEST_WORKSPACE}
      onClose={onClose}
      onMade={jest.fn()}
    />,
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

/** Apple's sheet (the harness answers Choose File by default): its calls, and the row the next one chooses. */
const sheet = () => ActionSheetIOS.showActionSheetWithOptions as jest.Mock;
function sheetChooses(index: number) {
  sheet().mockImplementationOnce((_options: unknown, choose: (index: number) => void) => choose(index));
}

describe('decision 19 (a): off Home\'s card, Upload on iOS opens Apple\'s sheet where the field takes a photo', () => {
  it("the flow page: Take photo beside Upload; Upload opens the sheet — Safari's rows, Cancel at 3 — and Choose File the picker", async () => {
    await renderForm([RESUME]);
    const box = within(screen.getByTestId('start-run'));
    expect(box.getByTestId('run-file-resume-photo')).toBeTruthy();
    await fireEvent.press(box.getByTestId('run-file-resume-upload'));
    expect(sheet()).toHaveBeenCalledTimes(1);
    expect(sheet().mock.calls[0]![0]).toMatchObject({ options: ['Photo Library', 'Take Photo', 'Choose File', 'Cancel'], cancelButtonIndex: 3 });
    await waitFor(() => expect(pillNames(box, 'resume')).toEqual(['cv.pdf']));
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
  });

  it('the item page and the job upload card open it too; Photo Library is Apple\'s photo picker, Take Photo the camera', async () => {
    const item = await renderForm([RESUME], true);
    sheetChooses(0);
    await fireEvent.press(screen.getByTestId('run-file-resume-upload'));
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
    await item.unmount();

    await jobCard(['application/pdf', 'image/jpeg']);
    sheetChooses(1);
    await fireEvent.press(screen.getByTestId('run-file-jobFile-upload'));
    await waitFor(() => expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1));
    expect(sheet()).toHaveBeenCalledTimes(2);
  });

  it('a field that takes no photo: Upload opens the picker at once, no sheet and no Take photo', async () => {
    await renderForm([PDF_ONLY]);
    await fireEvent.press(screen.getByTestId('run-file-contract-upload'));
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
    expect(sheet()).not.toHaveBeenCalled();
    expect(screen.queryByTestId('run-file-contract-photo')).toBeNull();
  });

  it("a several-file field: the sheet says Choose Files, its Take Photo replaces the files held; the side-by-side Take photo adds", async () => {
    pickerGives(['a.pdf', 'b.pdf']);
    await renderForm([RESUMES]);
    const box = within(screen.getByTestId('start-run'));
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    expect(sheet().mock.calls[0]![0]).toMatchObject({ options: ['Photo Library', 'Take Photo', 'Choose Files', 'Cancel'] });
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['a.pdf', 'b.pdf']));
    cameraTakes(null);
    sheetChooses(1);
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['photo-stored.jpg']));
    cameraTakes(null);
    await fireEvent.press(box.getByTestId('run-file-resumes-photo'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['photo-stored.jpg', 'photo-stored.jpg']));
  });

  it('Android: unchanged — Take photo beside Upload, Upload the document picker at once', async () => {
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await renderForm([RESUME]);
      expect(screen.getByTestId('run-file-resume-photo')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('run-file-resume-upload'));
      await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
      expect(sheet()).not.toHaveBeenCalled();
      expect(screen.queryByTestId('run-file-resume-upload-menu')).toBeNull();
    } finally {
      android.restore();
    }
  });
});

describe("decision 19 (b): a photo keeps the name its camera gives, as a .jpg; none, image.jpg", () => {
  it.each([
    ['iOS gives none', null, 'image.jpg'],
    ["Android's cache file", '2b1f6c0e-6c8a-4a43-9a4b-0f3e2d1c5b7a.jpg', '2b1f6c0e-6c8a-4a43-9a4b-0f3e2d1c5b7a.jpg'],
    ['a HEIC', 'IMG_0042.HEIC', 'IMG_0042.jpg'],
  ])('%s', async (_case, fileName, sentAs) => {
    await renderForm([RESUME]);
    cameraTakes(fileName);
    await fireEvent.press(screen.getByTestId('run-file-resume-photo'));
    await waitFor(() => expect(opened()).toHaveLength(1));
    expect(opened()[0]).toMatchObject({ filename: sentAs, contentType: 'image/jpeg' });
  });
});

describe('decision 19 (c): the spoken names are the visible word, then the field', () => {
  it('"Take photo for {title}" and "Upload for {title}", one file or several, on the page and on Home\'s card', async () => {
    const form = await renderForm([RESUME, RESUMES]);
    expect(screen.getByTestId('run-file-resume-photo').props.accessibilityLabel).toBe('Take photo for Resume');
    expect(screen.getByTestId('run-file-resume-upload').props.accessibilityLabel).toBe('Upload for Resume');
    expect(screen.getByTestId('run-file-resumes-photo').props.accessibilityLabel).toBe('Take photo for Resumes');
    expect(screen.getByTestId('run-file-resumes-upload').props.accessibilityLabel).toBe('Upload for Resumes');
    await form.unmount();
    await renderHome();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    expect(card.getByTestId('run-file-resume-upload').props.accessibilityLabel).toBe('Upload for Resume');
  });
});

describe('decision 19 (d): an empty accept list takes no photo; a JPEG in any case does', () => {
  it('the rule', () => {
    expect(takesPhotos(undefined)).toBe(true);
    expect(takesPhotos([])).toBe(false);
    expect(takesPhotos(['application/pdf'])).toBe(false);
    expect(takesPhotos(['application/pdf', 'image/jpeg'])).toBe(true);
    expect(takesPhotos(['application/pdf', 'IMAGE/JPEG'])).toBe(true);
  });

  it('a field naming "image/JPEG" draws Take photo and opens the sheet', async () => {
    await renderForm([{ ...RESUME, acceptedContentTypes: ['application/pdf', 'image/JPEG'] }]);
    expect(screen.getByTestId('run-file-resume-photo')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('run-file-resume-upload'));
    expect(sheet()).toHaveBeenCalledTimes(1);
  });
});

function homeFlows(): HomeFlow[] {
  const catalog = flowCatalogPayload().automations;
  const live = subscriptionsPayload().subscriptions;
  const subscription = { ...live.find((row) => row.id === 'invoice')!, status: 'live' as const, runInput: [RESUME] };
  return [{ subscription, entry: catalog.find((entry) => entry.templateId === subscription.templateId) } as HomeFlow];
}

async function renderHome() {
  return renderWithProviders(
    <YourFlows sections={[{ department: 'Finance', flows: homeFlows() }]} shownWorkspaceId={TEST_WORKSPACE} canManage onStarted={onStarted} onOpen={jest.fn()} />,
    sessionAs('owner'),
  );
}

describe('decision 17: delete at once', () => {
  it('the x on one file: the pill goes at once and that file is discarded in the background; a 409 says nothing', async () => {
    let answer!: () => void;
    answers[`DELETE ${DISCARD_PATH}`] = () =>
      new Promise((_resolve, reject) => {
        answer = () => reject(new PlatformError('File in use', 409, undefined, { reason: 'file_in_use' }));
      });
    await renderForm([RESUME]);
    const box = within(screen.getByTestId('start-run'));
    await fireEvent.press(box.getByTestId('run-file-resume-upload'));
    await waitFor(() => expect(pillNames(box, 'resume')).toEqual(['cv.pdf']));
    await fireEvent.press(box.getByTestId('run-file-resume-remove-0'));
    // Gone before the platform answers.
    expect(pillNames(box, 'resume')).toEqual([]);
    expect(discarded()).toEqual([{ workspaceId: TEST_WORKSPACE, artifactId: 'artifact-1' }]);
    answer();
    await waitFor(() => expect(box.queryByText('File in use')).toBeNull());
    expect(screen.queryByText(/could not|in use|not found/iu)).toBeNull();
  });

  it("Home's card: its x discards too", async () => {
    await renderHome();
    const card = within(await screen.findByTestId('home-flow-invoice'));
    await fireEvent.press(card.getByTestId('run-file-resume-upload'));
    await waitFor(() => expect(pillNames(card, 'resume')).toEqual(['cv.pdf']));
    await fireEvent.press(card.getByTestId('run-file-resume-remove-0'));
    expect(discarded()).toEqual([{ workspaceId: TEST_WORKSPACE, artifactId: 'artifact-1' }]);
  });

  it('a new choice replaces the file held: the old one discarded, the new one kept', async () => {
    await renderForm([RESUME]);
    const box = within(screen.getByTestId('start-run'));
    await fireEvent.press(box.getByTestId('run-file-resume-upload'));
    await waitFor(() => expect(pillNames(box, 'resume')).toEqual(['cv.pdf']));
    pickerGives(['cv-2.pdf']);
    await fireEvent.press(box.getByTestId('run-file-resume-upload'));
    await waitFor(() => expect(pillNames(box, 'resume')).toEqual(['cv-2.pdf']));
    expect(discarded()).toEqual([{ workspaceId: TEST_WORKSPACE, artifactId: 'artifact-1' }]);
    await fireEvent.press(box.getByTestId('start-run-button'));
    await waitFor(() => expect(runs()).toHaveLength(1));
    expect(runs()[0]!.body).toEqual({ subscriptionId: 'sub-1', input: { resume: 'artifact-2' } });
  });

  it('several files: an x discards that one; a choice discards those it replaces; a photo that adds discards none; a refused choice discards those held', async () => {
    pickerGives(['a.pdf', 'b.pdf', 'c.pdf']);
    await renderForm([RESUMES]);
    const box = within(screen.getByTestId('start-run'));
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['a.pdf', 'b.pdf', 'c.pdf']));
    await fireEvent.press(box.getByTestId('run-file-resumes-remove-1'));
    expect(discarded().map((each) => each?.artifactId)).toEqual(['artifact-2']);

    pickerGives(['d.pdf']);
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['d.pdf']));
    expect(discarded().map((each) => each?.artifactId)).toEqual(['artifact-2', 'artifact-1', 'artifact-3']);

    cameraTakes(null);
    await fireEvent.press(box.getByTestId('run-file-resumes-photo'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['d.pdf', 'photo-stored.jpg']));
    expect(discarded()).toHaveLength(3);

    pickerGives(['e.pdf', 'f.pdf', 'g.pdf', 'h.pdf']);
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    expect(await box.findByText('Add up to 3 files at a time.')).toBeTruthy();
    expect(discarded().map((each) => each?.artifactId)).toEqual(['artifact-2', 'artifact-1', 'artifact-3', 'artifact-4', 'artifact-5']);
  });

  it('an upload that ends after its field has gone is discarded', async () => {
    let complete!: () => void;
    answers[`POST ${COMPLETE_PATH}`] = () =>
      new Promise((resolve) => {
        complete = () => resolve({ artifact: { artifactId: 'artifact-late', filename: 'cv.pdf', contentType: 'application/pdf', sizeBytes: 5 } });
      });
    const form = await renderForm([RESUME]);
    await fireEvent.press(screen.getByTestId('run-file-resume-upload'));
    await waitFor(() => expect(complete).toBeDefined());
    await form.unmount();
    complete();
    await waitFor(() => expect(discarded()).toEqual([{ workspaceId: TEST_WORKSPACE, artifactId: 'artifact-late' }]));
  });

  it('while Start is pending the x and the buttons are held, and nothing is discarded under the run', async () => {
    answers[`POST ${RUNS_PATH}`] = () => new Promise(() => undefined);
    await renderForm([RESUME]);
    const box = within(screen.getByTestId('start-run'));
    await fireEvent.press(box.getByTestId('run-file-resume-upload'));
    await waitFor(() => expect(pillNames(box, 'resume')).toEqual(['cv.pdf']));
    await fireEvent.press(box.getByTestId('start-run-button'));
    await waitFor(() => expect(runs()).toHaveLength(1));
    const x = box.getByTestId('run-file-resume-remove-0');
    expect(x.props.accessibilityState).toEqual({ disabled: true });
    expect(box.getByTestId('run-file-resume-upload').props.accessibilityState).toEqual({ disabled: true });
    expect(box.getByTestId('run-file-resume-photo').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(x);
    expect(pillNames(box, 'resume')).toEqual(['cv.pdf']);
    expect(discarded()).toEqual([]);
  });

  it("the job upload card: Cancel with a file held discards it; without one, nothing; a new choice discards the one it replaces", async () => {
    const onClose = jest.fn();
    const empty = await jobCard(['application/pdf'], onClose);
    await fireEvent.press(screen.getByTestId('item-upload-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(discarded()).toEqual([]);
    await empty.unmount();

    await jobCard(['application/pdf'], onClose);
    await fireEvent.press(screen.getByTestId('run-file-jobFile-upload'));
    expect(await screen.findByText('Ready: cv.pdf (5 bytes)')).toBeTruthy();
    pickerGives(['jd-2.pdf']);
    await fireEvent.press(screen.getByTestId('run-file-jobFile-upload'));
    expect(await screen.findByText('Ready: jd-2.pdf (5 bytes)')).toBeTruthy();
    expect(discarded()).toEqual([{ workspaceId: TEST_WORKSPACE, artifactId: 'artifact-1' }]);
    await fireEvent.press(screen.getByTestId('item-upload-cancel'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(discarded()).toEqual([
      { workspaceId: TEST_WORKSPACE, artifactId: 'artifact-1' },
      { workspaceId: TEST_WORKSPACE, artifactId: 'artifact-2' },
    ]);
  });

  it('discardUpload: one DELETE through the generated client, its path and the two ids, no body and no key', async () => {
    const del = jest.fn(async () => ({ data: undefined, response: { ok: true } }));
    platformOperation.mockImplementationOnce(async (key: string, execute: Function) => {
      expect(key).toBe(`/v1/workspaces/${TEST_WORKSPACE}/uploads/artifact-9`);
      return (await execute({ automations: { DELETE: del } }, 'signal')).data ?? null;
    });
    await expect(discardUpload(TEST_WORKSPACE, 'artifact-9')).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith(DISCARD_PATH, { params: { path: { workspaceId: TEST_WORKSPACE, artifactId: 'artifact-9' } }, signal: 'signal' });
  });
});

describe('decision 17: the files a field lets go of in other ways', () => {
  it('several files: a photo that adds and then fails empties the field, and the files it held are discarded', async () => {
    pickerGives(['a.pdf', 'b.pdf']);
    await renderForm([RESUMES]);
    const box = within(screen.getByTestId('start-run'));
    await fireEvent.press(box.getByTestId('run-file-resumes-upload'));
    await waitFor(() => expect(pillNames(box, 'resumes')).toEqual(['a.pdf', 'b.pdf']));
    cameraTakes(null);
    answers[`POST ${COMPLETE_PATH}`] = () => {
      throw new PlatformError('The file could not be measured.', 400, undefined, { reason: 'file_unreadable' });
    };
    await fireEvent.press(box.getByTestId('run-file-resumes-photo'));
    await waitFor(() => expect(discarded().map((each) => each?.artifactId)).toEqual(['artifact-1', 'artifact-2']));
    expect(pillNames(box, 'resumes')).toEqual([]);
  });

  it('several files: a choice whose last upload ends after its field has gone discards every file it sent', async () => {
    let complete!: () => void;
    let n = 0;
    answers[`POST ${COMPLETE_PATH}`] = () => {
      n += 1;
      const artifact = { artifactId: `artifact-${n}`, filename: `${n}.pdf`, contentType: 'application/pdf', sizeBytes: 5 };
      if (n === 1) return { artifact };
      return new Promise((resolve) => {
        complete = () => resolve({ artifact });
      });
    };
    pickerGives(['a.pdf', 'b.pdf']);
    const form = await renderForm([RESUMES]);
    await fireEvent.press(screen.getByTestId('run-file-resumes-upload'));
    await waitFor(() => expect(complete).toBeDefined());
    await form.unmount();
    complete();
    await waitFor(() => expect(discarded().map((each) => each?.artifactId)).toEqual(['artifact-1', 'artifact-2']));
  });

  it("the job upload card: the system's back is Cancel, and discards the file held", async () => {
    const onClose = jest.fn();
    await jobCard(['application/pdf'], onClose);
    await fireEvent.press(screen.getByTestId('run-file-jobFile-upload'));
    expect(await screen.findByText('Ready: cv.pdf (5 bytes)')).toBeTruthy();
    // The Modal holding the card: the nearest one up from it with the system's close.
    let modal = screen.getByTestId('item-upload-dialog');
    while (!modal.props.onRequestClose) modal = modal.parent!;
    await fireEvent(modal, 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(discarded()).toEqual([{ workspaceId: TEST_WORKSPACE, artifactId: 'artifact-1' }]);
  });

  it('the job upload card: while its Upload is pending the file field is held', async () => {
    answers['POST /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/items'] = () => new Promise(() => undefined);
    await jobCard(['application/pdf']);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Designer');
    await fireEvent.press(screen.getByTestId('run-file-jobFile-upload'));
    expect(await screen.findByText('Ready: cv.pdf (5 bytes)')).toBeTruthy();
    expect(screen.getByTestId('run-file-jobFile-upload').props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(screen.getByTestId('item-upload-send'));
    await waitFor(() => expect(screen.getByTestId('run-file-jobFile-upload').props.accessibilityState?.disabled).toBe(true));
  });
});
