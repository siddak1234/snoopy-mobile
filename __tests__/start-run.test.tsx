jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
  putFileToSignedUrl: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
// The camera and the re-encode (BUILD-PLAN 25.8.3): what the file field calls, and nothing else.
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn() }));
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

import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import { StartRun } from '@/components/automations/start-run';
import { FLOW_QUEUE_FULL, WORKSPACE_CHANGED } from '@/lib/content/refusals';
import { CAMERA_NOT_OPENED, CAMERA_OFF } from '@/lib/content/screen-states';
import type { AutomationRunInputField } from '@/lib/platform/automations';
import { PlatformError, PlatformRateLimitedError, PlatformUnreachableError } from '@/lib/platform/problem';
import { IMAGE_NOT_READ, boundedResize, isImage, jpegName, reencodeImage } from '@/lib/platform/run-image';
import { TEST_WORKSPACE, flowCatalogPayload, routePlatform, sessionAs, signedInSession, subscriptionsPayload } from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

const { platformOperation, newIdempotencyKey, putFileToSignedUrl } = jest.requireMock('@/lib/platform/client');

/**
 * BUILD-PLAN 25.8.3 (Round 17; the owner's "i like the suggested lets do that",
 * and decision 1 of 2026-10-10). The flow page's start controls at its top —
 * the run's fields and Start run, where the Run button and its dialog were —
 * and a file field offering Take photo beside Upload: every image re-encoded
 * once (upright, its long side at most 2,576 px, a JPEG at 0.9) and sent as
 * `image/jpeg`; a PDF sent as it is; the pickers held to a PDF, a JPEG or a PNG.
 */

/* ───────────────────────────── the fake platform ───────────────────────────── */

type Init = { params?: { path?: Record<string, string>; header?: Record<string, string> }; body?: unknown };
/** Every request the box sent: its method, path (and the ids in it), key and body. */
let sent: { method: string; path: string; ids?: Record<string, string>; key?: string; body?: unknown }[];
/** Answers by `METHOD path`, in order; a function throws or answers per call. */
let answers: Record<string, (() => unknown)[]>;

beforeEach(() => {
  sent = [];
  answers = {};
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  putFileToSignedUrl.mockResolvedValue(undefined);
  const call = (method: string) => async (path: string, init: Init) => {
    sent.push({ method, path, ids: init.params?.path, key: init.params?.header?.['Idempotency-Key'], body: init.body });
    const next = answers[`${method} ${path}`]?.shift();
    return { data: next ? next() : {} };
  };
  const clients = { automations: { GET: call('GET'), POST: call('POST'), PATCH: call('PATCH') } };
  platformOperation.mockImplementation(async (_key: string, execute: Function) => (await execute(clients)).data);
});

function answer(route: string, ...replies: (() => unknown)[]) {
  answers[route] = [...(answers[route] ?? []), ...replies];
}

const RUNS_PATH = '/v1/workspaces/{workspaceId}/runs';
const UPLOADS_PATH = '/v1/workspaces/{workspaceId}/uploads';
const COMPLETE_PATH = '/v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete';

const NOTE: AutomationRunInputField = { key: 'note', title: 'Note', description: 'What to do', control: 'text', required: true };
const RECEIPT: AutomationRunInputField = { key: 'receipt', title: 'Receipt', description: 'The file to read', control: 'artifact', required: true };
const HOLD: AutomationRunInputField = {
  key: 'holdAbove',
  title: 'Hold above',
  description: 'Hold larger ones',
  control: 'money',
  required: false,
  defaultValue: 500,
};

const LEAD =
  'Enter what this run needs. It starts when you submit, or waits its turn if this flow is busy, and its page shows each step as it happens.';

const onStarted = jest.fn();

/** The manipulator's context, as the field uses it. */
type FakeContext = { renderAsync: jest.Mock; resize: jest.Mock; release: jest.Mock };

/** The start controls alone, for flow `sub-1` in the workspace the screen loaded. */
async function renderBox(runInput: AutomationRunInputField[] = [NOTE], shown: string = TEST_WORKSPACE) {
  return renderWithProviders(
    <StartRun subscriptionId="sub-1" shownWorkspaceId={shown} runInput={runInput} onStarted={onStarted} />,
    sessionAs('owner'),
  );
}

/** The upload's two answers: a signed place for the file, then the file the store measured. */
function answerUpload(filename: string, contentType: string, sizeBytes: number) {
  answer(`POST ${UPLOADS_PATH}`, () => ({
    uploadSessionId: 'upload-1',
    uploadUrl: 'https://store.example.test/put',
    expiresAt: '2026-10-10T12:00:00Z',
    maximumSizeBytes: 10_000_000,
  }));
  answer(`POST ${COMPLETE_PATH}`, () => ({ artifact: { artifactId: 'artifact-1', filename, contentType, sizeBytes } }));
}

/** A file on disk of `size` bytes, wherever it is opened. */
function filesOf(size: number) {
  (File as unknown as jest.Mock).mockImplementation(() => ({ size, bytes: async () => new Uint8Array(size) }));
}

/** What the upload opened: the name, type and size the platform was told. */
const opened = () => sent.find((request) => request.path === UPLOADS_PATH)?.body;

/**
 * The manipulator, for an image `width` × `height` as it is displayed: each
 * call it was given, in order, and every native image it handed out — each must
 * be released.
 */
function manipulator(width: number, height: number, savedAt = 'file:///cache/ImageManipulator/encoded.jpg') {
  const calls: unknown[][] = [];
  const handed: { release: jest.Mock }[] = [];
  const image = (w: number, h: number) => {
    const ref = {
      width: w,
      height: h,
      release: jest.fn(),
      saveAsync: jest.fn(async (options: unknown) => {
        calls.push(['saveAsync', options]);
        return { uri: savedAt, width: w, height: h };
      }),
    };
    handed.push(ref);
    return ref;
  };
  let size = { width, height };
  const context: FakeContext = {
    renderAsync: jest.fn(async () => {
      calls.push(['renderAsync']);
      return image(size.width, size.height);
    }),
    resize: jest.fn((to: { width?: number; height?: number }) => {
      calls.push(['resize', to]);
      size = to.width ? { width: to.width, height: Math.round((to.width * height) / width) } : { width: Math.round((to.height! * width) / height), height: to.height! };
      return context;
    }),
    release: jest.fn(),
  };
  (ImageManipulator.manipulate as jest.Mock).mockImplementation((uri: string) => {
    calls.push(['manipulate', uri]);
    return context;
  });
  return { calls, handed, context };
}

/** The camera, allowed and answering one photo of `width` × `height`. */
function cameraTakes(width: number, height: number, uri = 'file:///cache/ImagePicker/camera.jpg') {
  (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true, expires: 'never' });
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri, width, height, type: 'image', mimeType: 'image/jpeg', fileName: null }],
  });
}

/** The document picker, answering one file. */
function pickerGives(name: string, mimeType: string | undefined, uri = `file:///cache/DocumentPicker/${name}`) {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri, name, ...(mimeType ? { mimeType } : {}), lastModified: 0 }],
  });
}

/* ───────────────────────────── on the flow page ───────────────────────────── */

const WS = `/v1/workspaces/${TEST_WORKSPACE}`;

/** A request the page sent that changes something: its method, path, key and body. */
type Write = { method: string; path: string; key?: string; body?: unknown };

/**
 * The page's reads from the shared fixture, and every write kept and answered
 * from `replies` by "METHOD path" — the way `presses-flows` runs a page.
 */
function keepWrites(replies: Record<string, () => unknown> = {}): Write[] {
  const writes: Write[] = [];
  const routed = platformOperation.getMockImplementation();
  platformOperation.mockImplementation(async (path: string, execute: Function) => {
    let method = 'GET';
    const call = (verb: string) => async (_route: string, init?: Init) => {
      method = verb;
      if (verb !== 'GET') writes.push({ method: verb, path, key: init?.params?.header?.['Idempotency-Key'], body: init?.body });
      return { data: {} };
    };
    const client = { GET: call('GET'), POST: call('POST'), PATCH: call('PATCH'), PUT: call('PUT'), DELETE: call('DELETE') };
    await execute({ automations: client, platform: client, connections: client }, new AbortController().signal);
    const reply = replies[`${method} ${path}`];
    return reply ? reply() : routed?.(path, execute);
  });
  return writes;
}

/** The live "invoice" flow's page, its subscription changed by `invoice` and the catalog by `catalog`. */
async function openFlowPage(
  invoice: Record<string, unknown>,
  options: { catalog?: ReturnType<typeof flowCatalogPayload>; replies?: Record<string, () => unknown> } = {},
) {
  const subscriptions = subscriptionsPayload().subscriptions.map((row) => (row.id === 'invoice' ? { ...row, ...invoice } : row));
  routePlatform(platformOperation, { '/automations': options.catalog ?? flowCatalogPayload(), '/subscriptions': { subscriptions } });
  const writes = keepWrites(options.replies);
  setMockParams({ flow: 'invoice' });
  const view = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
  expect(await screen.findByText('Invoice triage')).toBeTruthy();
  return { writes, view };
}

/** What is on screen in reading order: each test id, and each line of text as `text:<words>`. */
function readingOrder(tree: unknown): string[] {
  const order: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      order.push(`text:${node}`);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const { props, children } = node as { props?: { testID?: unknown }; children?: unknown[] | null };
    if (typeof props?.testID === 'string') order.push(props.testID);
    children?.forEach(walk);
  };
  walk(tree);
  return order;
}

describe("the flow page's start controls (25.8.3)", () => {
  it('are drawn first under the flow\'s name — above the tiles, the rest of the page in its order — and the Run button and its dialog are gone', async () => {
    const { view } = await openFlowPage({ runInput: [NOTE] });
    const order = readingOrder(view.toJSON());
    const at = (entry: string) => {
      const index = order.indexOf(entry);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    // The header, then the box, then the tiles, then the page as it was.
    expect(at('text:Invoice triage')).toBeLessThan(at('start-run'));
    expect(at('start-run')).toBeLessThan(at('flow-stat-All'));
    expect(at('flow-stat-All')).toBeLessThan(at('text:CONNECTIONS'));
    expect(at('text:CONNECTIONS')).toBeLessThan(at('text:PIPELINE'));
    expect(at('text:PIPELINE')).toBeLessThan(at('text:Pause'));
    expect(at('text:Pause')).toBeLessThan(at('archive-flow'));
    // The box holds the run's fields and Start run; nothing at the bottom opens a dialog any more.
    const box = screen.getByTestId('start-run');
    expect(within(box).getByLabelText('Note')).toBeTruthy();
    expect(within(box).getByText('Start run')).toBeTruthy();
    expect(screen.queryByText('Run')).toBeNull();
    expect(screen.queryByTestId('run-dialog')).toBeNull();
  });

  it.each([
    ['live, its version declaring input, its automation available', true, { runInput: [NOTE] }, undefined],
    ['paused', false, { runInput: [NOTE], status: 'paused' }, undefined],
    ['a draft', false, { runInput: [NOTE], status: 'draft', unmetConnections: [] }, undefined],
    ['its version declaring nothing', false, { runInput: undefined }, undefined],
    ['its automation not answering its probe', false, { runInput: [NOTE] }, 'unavailable'],
    ['its template withdrawn from the catalog', false, { runInput: [NOTE] }, 'withdrawn'],
  ] as const)('are offered only where the Run button was — %s: %s', async (_case, offered, invoice, catalogChange) => {
    const catalog = flowCatalogPayload();
    if (catalogChange === 'unavailable') {
      catalog.automations = catalog.automations.map((entry) => (entry.templateId === 'tplflow.invoice' ? { ...entry, available: false } : entry));
    }
    if (catalogChange === 'withdrawn') {
      catalog.automations = catalog.automations.filter((entry) => entry.templateId !== 'tplflow.invoice');
    }
    await openFlowPage(invoice, { catalog });
    expect(screen.queryByTestId('start-run') !== null).toBe(offered);
    expect(screen.queryByText('Start run') !== null).toBe(offered);
  });

  it("are not drawn on an archived flow's page, which is read-only", async () => {
    await openFlowPage({ runInput: [NOTE], status: 'archived' });
    expect(await screen.findByText('Archived')).toBeTruthy();
    expect(screen.queryByTestId('start-run')).toBeNull();
  });

  it("Start run starts this flow's run with the declared values, opens the run's page, and leaves the box fresh: the defaults, and a new key for the next run", async () => {
    let runs = 0;
    const { writes } = await openFlowPage(
      { runInput: [NOTE, HOLD] },
      { replies: { [`POST ${WS}/runs`]: () => ({ run: { id: `run-${++runs}` } }) } },
    );
    // The money field starts at its declared default.
    expect(screen.getByLabelText('Hold above').props.value).toBe('500.00');
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Pay the Acme invoice');
    await fireEvent.changeText(screen.getByLabelText('Hold above'), '75000');
    expect(screen.getByLabelText('Hold above').props.value).toBe('750.00');
    await fireEvent.press(screen.getByText('Start run'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(home)/run', params: { runId: 'run-1' } }),
    );
    expect(writes).toEqual([
      {
        method: 'POST',
        path: `${WS}/runs`,
        key: 'run-1',
        body: { subscriptionId: 'invoice', input: { note: 'Pay the Acme invoice', holdAbove: 750 } },
      },
    ]);

    // Fresh for the next run: the note empty, the amount its default again.
    await waitFor(() => expect(screen.getByLabelText('Note').props.value).toBe(''));
    expect(screen.getByLabelText('Hold above').props.value).toBe('500.00');
    // The same values again are a new run, under a new key — the first was spent.
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Pay the Acme invoice');
    await fireEvent.changeText(screen.getByLabelText('Hold above'), '75000');
    await fireEvent.press(screen.getByText('Start run'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(home)/run', params: { runId: 'run-2' } }),
    );
    expect(writes[1]!.body).toEqual(writes[0]!.body);
    expect(writes[1]!.key).not.toBe(writes[0]!.key);
  });
});

/* ───────────────────────────── the form ───────────────────────────── */

describe('the start controls, as the Run dialog was (24.4.1, ADR-0030)', () => {
  it("say, before a run starts, that it may wait its turn at a busy flow — the website's sentence (backend 25.2.10)", async () => {
    await renderBox();
    expect(within(screen.getByTestId('start-run')).getByText(LEAD)).toBeTruthy();
  });

  it('start a run with the declared values; the same values resubmitted reuse the key, a change is a new run', async () => {
    answer(
      `POST ${RUNS_PATH}`,
      () => {
        throw new PlatformUnreachableError();
      },
      () => {
        throw new PlatformUnreachableError();
      },
      () => ({ run: { id: 'run-9' } }),
    );
    await renderBox();
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Pay the Acme invoice');
    await fireEvent.press(screen.getByText('Start run'));
    expect(await screen.findByText('The platform is unreachable')).toBeTruthy();
    await fireEvent.press(screen.getByText('Start run'));
    await waitFor(() => expect(sent.filter((s) => s.path === RUNS_PATH)).toHaveLength(2));
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Pay the Acme invoice today');
    await fireEvent.press(screen.getByText('Start run'));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('run-9'));

    const runs = sent.filter((s) => s.path === RUNS_PATH);
    expect(runs[0]!.key).toBe(runs[1]!.key);
    expect(runs[2]!.key).not.toBe(runs[1]!.key);
    expect(runs[2]!.body).toEqual({ subscriptionId: 'sub-1', input: { note: 'Pay the Acme invoice today' } });
  });

  it('say a refused run in words: a 422 is "check the values", a 409 is "not live"', async () => {
    answer(
      `POST ${RUNS_PATH}`,
      () => {
        throw new PlatformError('Unprocessable', 422, 'VALIDATION', { reason: 'undeclared_key' });
      },
      () => {
        throw new PlatformError('Conflict', 409);
      },
    );
    await renderBox();
    await fireEvent.press(screen.getByText('Start run'));
    expect(await screen.findByText('The run was not started. Check each value and try again.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Start run'));
    expect(await screen.findByText('This flow is not live, so it cannot run.')).toBeTruthy();
    expect(onStarted).not.toHaveBeenCalled();
  });

  it('say a run refused over the plan in its numbers (decision 7a3)', async () => {
    answer(`POST ${RUNS_PATH}`, () => {
      throw new PlatformError('Access is forbidden', 403, 'FORBIDDEN', { reason: 'over_plan_limit', limit: 2, live: 3 });
    });
    await renderBox();
    await fireEvent.press(screen.getByText('Start run'));
    expect(
      await screen.findByText(
        'Your plan allows 2 flows; this workspace has 3. No flow can start a run until you archive 1. Paused and draft flows count.',
      ),
    ).toBeTruthy();
  });

  it("say a run refused because the flow and its queue are full in the flow's words; any other 429 keeps the platform's (backend 25.2.10)", async () => {
    answer(
      `POST ${RUNS_PATH}`,
      () => {
        // As the transport projects the contract's 429: its busy words, and the reason beside them.
        throw new PlatformRateLimitedError('The platform is busy right now. Try again in a moment.', undefined, {
          reason: 'max_concurrent_runs',
          limit: '2',
        });
      },
      () => {
        throw new PlatformRateLimitedError('The platform is busy right now. Try again in 30 seconds.', 30, {
          reason: 'over_workspace_quota',
        });
      },
    );
    await renderBox();
    await fireEvent.press(screen.getByText('Start run'));
    expect(await screen.findByText(FLOW_QUEUE_FULL)).toBeTruthy();
    await fireEvent.press(screen.getByText('Start run'));
    expect(await screen.findByText('The platform is busy right now. Try again in 30 seconds.')).toBeTruthy();
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("keep the platform's busy words for a run refused because the flow's runs could not be counted in time — never the full-queue sentence, as on the website (backend 25.2.10, creation_contended)", async () => {
    answer(`POST ${RUNS_PATH}`, () => {
      throw new PlatformRateLimitedError('The platform is busy right now. Try again in a moment.', undefined, {
        reason: 'creation_contended',
      });
    });
    await renderBox();
    await fireEvent.press(screen.getByText('Start run'));
    expect(await screen.findByText('The platform is busy right now. Try again in a moment.')).toBeTruthy();
    expect(screen.queryByText(FLOW_QUEUE_FULL)).toBeNull();
    expect(onStarted).not.toHaveBeenCalled();
  });

  it('upload a file at once, hold Start run while it uploads, send only its id — and empty it when the platform no longer takes it, the next run a new key', async () => {
    pickerGives('invoice.pdf', 'application/pdf');
    filesOf(5);
    let arrive: () => void = () => undefined;
    putFileToSignedUrl.mockImplementation(() => new Promise<void>((resolve) => (arrive = resolve)));
    answerUpload('invoice.pdf', 'application/pdf', 5);
    answer(
      `POST ${RUNS_PATH}`,
      () => {
        throw new PlatformError('Unprocessable', 422, 'VALIDATION', { reason: 'artifact_unavailable' });
      },
      () => ({ run: { id: 'run-2' } }),
    );

    await renderBox([RECEIPT]);
    await fireEvent.press(screen.getByTestId('run-file-receipt-upload'));
    expect(await screen.findByText('Uploading invoice.pdf…')).toBeTruthy();
    // Held: a run cannot start on a file still on its way.
    expect(screen.getByText('Uploading…')).toBeTruthy();
    await fireEvent.press(screen.getByText('Uploading…'));
    expect(sent.filter((s) => s.path === RUNS_PATH)).toHaveLength(0);
    arrive();
    expect(await screen.findByText('Ready: invoice.pdf (5 bytes)')).toBeTruthy();
    expect(putFileToSignedUrl.mock.calls[0][1].byteLength).toBe(5);

    await fireEvent.press(screen.getByText('Start run'));
    expect(await screen.findByText('That file can no longer be used. Choose it again.')).toBeTruthy();
    expect(sent.find((s) => s.path === RUNS_PATH)!.body).toEqual({ subscriptionId: 'sub-1', input: { receipt: 'artifact-1' } });
    // The file is emptied to choose again, and what is sent next is a new run.
    expect(screen.queryByText('Ready: invoice.pdf (5 bytes)')).toBeNull();
    await fireEvent.press(screen.getByText('Start run'));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('run-2'));
    const [refused, next] = sent.filter((s) => s.path === RUNS_PATH);
    expect(next!.body).toEqual({ subscriptionId: 'sub-1', input: {} });
    expect(next!.key).not.toBe(refused!.key);
  });

  it('leave the box fresh after a start: the file emptied, the values the declared ones, a new key', async () => {
    pickerGives('invoice.pdf', 'application/pdf');
    filesOf(5);
    answerUpload('invoice.pdf', 'application/pdf', 5);
    answer(`POST ${RUNS_PATH}`, () => ({ run: { id: 'run-1' } }), () => ({ run: { id: 'run-2' } }));

    await renderBox([NOTE, RECEIPT]);
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Pay it');
    await fireEvent.press(screen.getByTestId('run-file-receipt-upload'));
    expect(await screen.findByText('Ready: invoice.pdf (5 bytes)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Start run'));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('run-1'));

    await waitFor(() => expect(screen.queryByText('Ready: invoice.pdf (5 bytes)')).toBeNull());
    expect(screen.getByLabelText('Note').props.value).toBe('');
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Pay it');
    await fireEvent.press(screen.getByText('Start run'));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('run-2'));
    const [first, second] = sent.filter((s) => s.path === RUNS_PATH);
    expect(first!.body).toEqual({ subscriptionId: 'sub-1', input: { note: 'Pay it', receipt: 'artifact-1' } });
    expect(second!.body).toEqual({ subscriptionId: 'sub-1', input: { note: 'Pay it' } });
    expect(second!.key).not.toBe(first!.key);
  });

  it('are refused in words, and send nothing, once another workspace is active — Start run, Take photo and Upload alike', async () => {
    await renderBox([NOTE, RECEIPT], 'another-workspace');
    await fireEvent.press(screen.getByText('Start run'));
    expect(await screen.findByText(WORKSPACE_CHANGED)).toBeTruthy();
    for (const action of ['run-file-receipt-photo', 'run-file-receipt-upload']) {
      await fireEvent.press(screen.getByTestId(action));
      expect(await screen.findAllByText(WORKSPACE_CHANGED)).toHaveLength(2);
    }
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
});

/* ───────────────────────────── the file field ───────────────────────────── */

describe('a run\'s file field: Take photo beside Upload (25.8.3; the owner\'s decision 1 of 2026-10-10)', () => {
  it('offers both, each named for its field', async () => {
    await renderBox([RECEIPT]);
    const photo = screen.getByTestId('run-file-receipt-photo');
    const upload = screen.getByTestId('run-file-receipt-upload');
    expect(within(photo).getByText('Take photo')).toBeTruthy();
    expect(within(upload).getByText('Upload')).toBeTruthy();
    expect(photo.props.accessibilityLabel).toBe('Take a photo for Receipt');
    expect(upload.props.accessibilityLabel).toBe('Upload a file for Receipt');
    expect(screen.queryByText('Choose file')).toBeNull();
  });

  it('Upload asks the picker for a PDF, a JPEG or a PNG — exactly those three — one file, copied where it can be read', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    await renderBox([RECEIPT]);
    await fireEvent.press(screen.getByTestId('run-file-receipt-upload'));
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    // Closing the picker sends nothing and keeps the field as it was.
    expect(sent).toEqual([]);
    expect(screen.queryByText(/^Uploading /u)).toBeNull();
  });

  it('sends a PDF as it is: never re-encoded, under its own name and type', async () => {
    const { calls } = manipulator(1000, 1000);
    pickerGives('invoice.pdf', 'application/pdf');
    filesOf(4096);
    answerUpload('invoice.pdf', 'application/pdf', 4096);
    await renderBox([RECEIPT]);
    await fireEvent.press(screen.getByTestId('run-file-receipt-upload'));
    expect(await screen.findByText('Ready: invoice.pdf (4 KB)')).toBeTruthy();
    expect(calls).toEqual([]);
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
    expect(File).toHaveBeenCalledWith('file:///cache/DocumentPicker/invoice.pdf');
    expect(opened()).toEqual({ subscriptionId: 'sub-1', filename: 'invoice.pdf', contentType: 'application/pdf', sizeBytes: 4096 });
    expect(putFileToSignedUrl.mock.calls[0][2]).toBe('application/pdf');
  });

  it.each([
    ['a PNG chosen by Upload', 'statement.png', 'image/png', 'statement.jpg'],
    ['a JPEG chosen by Upload', 'receipt.jpeg', 'image/jpeg', 'receipt.jpg'],
    ['an image chosen by Upload that the picker could not type, known by its name', 'scan.PNG', undefined, 'scan.jpg'],
  ])('re-encodes %s once — upright, never enlarged, a JPEG at 0.9 — and sends it as image/jpeg under a .jpg name', async (_what, name, mimeType, sentAs) => {
    const { calls, handed, context } = manipulator(1600, 1200);
    pickerGives(name, mimeType);
    filesOf(2048);
    answerUpload(sentAs, 'image/jpeg', 2048);
    await renderBox([RECEIPT]);
    await fireEvent.press(screen.getByTestId('run-file-receipt-upload'));
    expect(await screen.findByText(`Ready: ${sentAs} (2 KB)`)).toBeTruthy();
    // Within the bound: drawn upright and saved, never resized up.
    expect(calls).toEqual([
      ['manipulate', `file:///cache/DocumentPicker/${name}`],
      ['renderAsync'],
      ['saveAsync', { format: 'jpeg', compress: 0.9 }],
    ]);
    expect(context.resize).not.toHaveBeenCalled();
    expect(File).toHaveBeenCalledWith('file:///cache/ImageManipulator/encoded.jpg');
    expect(opened()).toEqual({ subscriptionId: 'sub-1', filename: sentAs, contentType: 'image/jpeg', sizeBytes: 2048 });
    expect(putFileToSignedUrl.mock.calls[0][2]).toBe('image/jpeg');
    for (const image of handed) expect(image.release).toHaveBeenCalled();
    expect(context.release).toHaveBeenCalled();
  });

  it('re-encodes a large image chosen by Upload down to a long side of 2,576 px', async () => {
    const { calls } = manipulator(5000, 3000);
    pickerGives('ledger.png', 'image/png');
    filesOf(2048);
    answerUpload('ledger.jpg', 'image/jpeg', 2048);
    await renderBox([RECEIPT]);
    await fireEvent.press(screen.getByTestId('run-file-receipt-upload'));
    expect(await screen.findByText('Ready: ledger.jpg (2 KB)')).toBeTruthy();
    expect(calls).toEqual([
      ['manipulate', 'file:///cache/DocumentPicker/ledger.png'],
      ['renderAsync'],
      ['resize', { width: 2576 }],
      ['renderAsync'],
      ['saveAsync', { format: 'jpeg', compress: 0.9 }],
    ]);
  });

  it.each([
    ['held sideways', 4032, 3024, { width: 2576 }],
    ['held upright', 3024, 4032, { height: 2576 }],
  ])('takes a photo %s, re-encodes it with its long side bound at 2,576 px, and sends it as image/jpeg — the run carrying only its id', async (_how, width, height, resize) => {
    const { calls, handed, context } = manipulator(width, height);
    cameraTakes(width, height);
    filesOf(812 * 1024);
    answerUpload('photo.jpg', 'image/jpeg', 812 * 1024);
    answer(`POST ${RUNS_PATH}`, () => ({ run: { id: 'run-1' } }));
    await renderBox([RECEIPT]);
    await fireEvent.press(screen.getByTestId('run-file-receipt-photo'));
    expect(await screen.findByText('Ready: photo.jpg (812 KB)')).toBeTruthy();

    // Asked first, then the camera, for images only.
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
    // Upright as loaded, measured, bounded, saved once.
    expect(calls).toEqual([
      ['manipulate', 'file:///cache/ImagePicker/camera.jpg'],
      ['renderAsync'],
      ['resize', resize],
      ['renderAsync'],
      ['saveAsync', { format: 'jpeg', compress: 0.9 }],
    ]);
    expect(handed).toHaveLength(2);
    for (const image of handed) expect(image.release).toHaveBeenCalled();
    expect(context.release).toHaveBeenCalled();
    // The re-encoded file is what is measured, read and sent.
    expect(File).toHaveBeenCalledWith('file:///cache/ImageManipulator/encoded.jpg');
    expect(opened()).toEqual({ subscriptionId: 'sub-1', filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: 812 * 1024 });
    expect(putFileToSignedUrl.mock.calls[0][2]).toBe('image/jpeg');
    expect(putFileToSignedUrl.mock.calls[0][1].byteLength).toBe(812 * 1024);

    await fireEvent.press(screen.getByText('Start run'));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('run-1'));
    expect(sent.find((s) => s.path === RUNS_PATH)!.body).toEqual({ subscriptionId: 'sub-1', input: { receipt: 'artifact-1' } });
  });

  it('asks for the camera at the press; refused, the field says where to turn it on and that Upload still works — nothing opened, nothing sent', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
      expires: 'never',
    });
    await renderBox([RECEIPT]);
    await fireEvent.press(screen.getByTestId('run-file-receipt-photo'));
    expect(await screen.findByText(CAMERA_OFF)).toBeTruthy();
    expect(CAMERA_OFF).toBe('Camera access for Autom8x is off in Settings. Turn it on there, or use Upload.');
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
    // The field still works: Upload is there to press.
    expect(screen.getByTestId('run-file-receipt-upload')).toBeTruthy();
  });

  it('keeps what the field held when the camera is closed, and says so when the camera cannot open', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true, expires: 'never' });
    (ImagePicker.launchCameraAsync as jest.Mock)
      .mockResolvedValueOnce({ canceled: true, assets: null })
      .mockRejectedValueOnce(new Error('No camera on this device'));
    await renderBox([RECEIPT]);
    await fireEvent.press(screen.getByTestId('run-file-receipt-photo'));
    await waitFor(() => expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/^Uploading /u)).toBeNull();
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('run-file-receipt-photo'));
    expect(await screen.findByText(CAMERA_NOT_OPENED)).toBeTruthy();
    // Never the native message.
    expect(screen.queryByText('No camera on this device')).toBeNull();
    expect(sent).toEqual([]);
  });

  it('sends nothing for an image that cannot be re-encoded, and says so in one sentence', async () => {
    (ImageManipulator.manipulate as jest.Mock).mockImplementation(() => ({
      renderAsync: jest.fn(async () => {
        throw new Error('Could not decode the image at file:///cache/DocumentPicker/broken.png');
      }),
      release: jest.fn(),
    }));
    pickerGives('broken.png', 'image/png');
    await renderBox([RECEIPT]);
    await fireEvent.press(screen.getByTestId('run-file-receipt-upload'));
    expect(await screen.findByText(IMAGE_NOT_READ)).toBeTruthy();
    expect(screen.queryByText(/Could not decode/u)).toBeNull();
    expect(sent).toEqual([]);
    expect(screen.queryByText(/^Ready: /u)).toBeNull();
  });
});

describe('the re-encode itself (lib/platform/run-image.ts)', () => {
  it.each([
    [4032, 3024, { width: 2576 }],
    [3024, 4032, { height: 2576 }],
    [3000, 3000, { width: 2576 }],
    [2577, 100, { width: 2576 }],
    [2576, 1932, null],
    [1932, 2576, null],
    [800, 600, null],
  ])('bounds %i × %i to %p — the long side at most 2,576 px, never enlarged', (width, height, resize) => {
    expect(boundedResize(width, height)).toEqual(resize);
  });

  it.each([
    ['invoice.png', 'invoice.jpg'],
    ['scan.JPEG', 'scan.jpg'],
    ['receipt.jpg', 'receipt.jpg'],
    ['IMG_0001', 'IMG_0001.jpg'],
    ['march.statement.png', 'march.statement.jpg'],
    ['.png', 'image.jpg'],
  ])('names %s as %s once it is a JPEG', (name, jpeg) => {
    expect(jpegName(name)).toBe(jpeg);
  });

  it('knows an image by the type the picker names, and by its name only when it names none', () => {
    expect(isImage({ name: 'a.pdf', mimeType: 'image/png' })).toBe(true);
    expect(isImage({ name: 'a.png', mimeType: 'application/pdf' })).toBe(false);
    expect(isImage({ name: 'a.jpg' })).toBe(true);
    expect(isImage({ name: 'a.JPEG', mimeType: null })).toBe(true);
    expect(isImage({ name: 'a.pdf' })).toBe(false);
  });

  it('releases the context and every native image, and answers only its own sentence, when saving fails', async () => {
    const upright = { width: 4000, height: 3000, release: jest.fn(), saveAsync: jest.fn() };
    const bounded = {
      width: 2576,
      height: 1932,
      release: jest.fn(),
      saveAsync: jest.fn(async () => {
        throw new Error('disk full');
      }),
    };
    const context: FakeContext = {
      renderAsync: jest.fn().mockResolvedValueOnce(upright).mockResolvedValueOnce(bounded),
      resize: jest.fn(() => context),
      release: jest.fn(),
    };
    (ImageManipulator.manipulate as jest.Mock).mockImplementation(() => context);
    await expect(reencodeImage('file:///cache/big.png')).rejects.toThrow(IMAGE_NOT_READ);
    expect(context.resize).toHaveBeenCalledWith({ width: 2576 });
    expect(upright.saveAsync).not.toHaveBeenCalled();
    expect(upright.release).toHaveBeenCalledTimes(1);
    expect(bounded.release).toHaveBeenCalledTimes(1);
    expect(context.release).toHaveBeenCalledTimes(1);
  });
});
