jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
  putFileToSignedUrl: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { AutomationActions } from '@/components/automations/automation-actions';
import { nocturneDark, nocturneLight } from '@/constants/theme';
import { useSolutions } from '@/hooks/use-solutions';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import type { AutomationRunInputField, Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';
import { PlatformError, PlatformUnreachableError } from '@/lib/platform/problem';
import { TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation, newIdempotencyKey, putFileToSignedUrl } = jest.requireMock('@/lib/platform/client');

/** Every request the actions sent: its method, path, key and body. */
let sent: { method: string; path: string; key?: string; body?: unknown }[];
/** Answers by `METHOD path`, in order; a function throws or answers per call. */
let answers: Record<string, (() => unknown)[]>;

beforeEach(() => {
  sent = [];
  answers = {};
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  putFileToSignedUrl.mockResolvedValue(undefined);
  const call = (method: string) => async (path: string, init: { params?: { header?: Record<string, string> }; body?: unknown }) => {
    sent.push({ method, path, key: init.params?.header?.['Idempotency-Key'], body: init.body });
    const next = answers[`${method} ${path}`]?.shift();
    return { data: next ? next() : {} };
  };
  const clients = { automations: { GET: call('GET'), POST: call('POST'), PATCH: call('PATCH') } };
  platformOperation.mockImplementation(async (_key: string, execute: Function) => (await execute(clients)).data);
});

function answer(route: string, ...replies: (() => unknown)[]) {
  answers[route] = [...(answers[route] ?? []), ...replies];
}

const SUB_PATH = '/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}';
const RUNS_PATH = '/v1/workspaces/{workspaceId}/runs';
const WEBHOOK_PATH = '/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/webhook';

const NOTE: AutomationRunInputField = { key: 'note', title: 'Note', description: 'What to do', control: 'text', required: true };
const RECEIPT: AutomationRunInputField = { key: 'receipt', title: 'Receipt', description: 'The file to read', control: 'artifact', required: true };

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    workspaceId: TEST_WORKSPACE,
    templateId: 'tpl.invoice',
    templateVersion: 1,
    status: 'live',
    config: { inbox: 'ap@acme.co' },
    unmetConnections: [],
    runInput: [NOTE],
    triggerKind: 'manual',
    projectId: null,
    createdByUserId: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    templateId: 'tpl.invoice',
    version: 1,
    name: 'Invoice triage',
    description: '',
    category: 'Finance',
    icon: 'receipt',
    monthlyPriceUsd: 39,
    subscribed: true,
    available: true,
    setup: [
      { section: 'source', key: 'inbox', title: 'Watch inbox', description: '', control: 'text', required: true },
      { section: 'notifications', key: 'alerts', title: 'Alerts', description: '', control: 'toggle', required: false },
    ],
    ...overrides,
  } as CatalogEntry;
}


const callbacks = { onChanged: jest.fn(), onArchived: jest.fn(), onRunStarted: jest.fn() };

async function renderActions(
  props: {
    sub?: Subscription;
    entry?: CatalogEntry | undefined;
    live?: boolean;
    shown?: string;
    role?: 'owner' | 'admin' | 'member';
    before?: React.ReactNode;
    mode?: 'dark' | 'light';
  } = {},
) {
  const sub = props.sub ?? subscription();
  return renderWithProviders(
    <>
    {props.before}
    <AutomationActions
      name="Invoice triage"
      subscription={sub}
      entry={'entry' in props ? props.entry : entry()}
      live={props.live ?? sub.status === 'live'}
      shownWorkspaceId={props.shown ?? TEST_WORKSPACE}
      canAdminister={(props.role ?? 'owner') !== 'member'}
      statusRow={null}
      {...callbacks}
    />
    </>,
    sessionAs(props.role ?? 'owner'),
    props.mode ?? 'dark',
  );
}

/** The dialog's own button of that name — the last one on screen. */
async function pressLast(label: string) {
  const buttons = await screen.findAllByText(label);
  await fireEvent.press(buttons[buttons.length - 1]!);
}

describe('Run (24.4.1, ADR-0030)', () => {
  it('is offered only on a live, available subscription whose pinned version declares input', async () => {
    const cases: [string, Parameters<typeof renderActions>[0], boolean][] = [
      ['live, declared, available', {}, true],
      ['paused', { sub: subscription({ status: 'paused' }) }, false],
      ['declares nothing', { sub: subscription({ runInput: undefined }) }, false],
      ['not answering its probe', { entry: entry({ available: false }) }, false],
      ['withdrawn from the catalog', { entry: undefined }, false],
    ];
    for (const [, props, offered] of cases) {
      const view = await renderActions(props);
      expect(screen.queryByText('Run') !== null).toBe(offered);
      await view.unmount();
    }
  });

  it('starts a run with the declared values; the same values resubmitted reuse the key, a change is a new run', async () => {
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
    await renderActions();
    await fireEvent.press(screen.getByText('Run'));
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Pay the Acme invoice');
    await pressLast('Start run');
    expect(await screen.findByText('The platform is unreachable')).toBeTruthy();
    await pressLast('Start run');
    await waitFor(() => expect(sent.filter((s) => s.path === RUNS_PATH)).toHaveLength(2));
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Pay the Acme invoice today');
    await pressLast('Start run');
    await waitFor(() => expect(callbacks.onRunStarted).toHaveBeenCalledWith('run-9'));

    const runs = sent.filter((s) => s.path === RUNS_PATH);
    expect(runs[0]!.key).toBe(runs[1]!.key);
    expect(runs[2]!.key).not.toBe(runs[1]!.key);
    expect(runs[2]!.body).toEqual({ subscriptionId: 'sub-1', input: { note: 'Pay the Acme invoice today' } });
  });

  it('says a refused run in words: a 422 is "check the values", a 409 is "not live"', async () => {
    answer(
      `POST ${RUNS_PATH}`,
      () => {
        throw new PlatformError('Unprocessable', 422, 'VALIDATION', { reason: 'undeclared_key' });
      },
      () => {
        throw new PlatformError('Conflict', 409);
      },
    );
    await renderActions();
    await fireEvent.press(screen.getByText('Run'));
    await pressLast('Start run');
    expect(await screen.findByText('The run was not started. Check each value and try again.')).toBeTruthy();
    await pressLast('Start run');
    expect(await screen.findByText('This flow is not live, so it cannot run.')).toBeTruthy();
  });

  it('uploads a chosen file, waits for it, sends only its id — and empties it when the platform no longer takes it', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/invoice.pdf', name: 'invoice.pdf', mimeType: 'application/pdf' }],
    });
    (File as unknown as jest.Mock).mockImplementation(() => ({ size: 5, bytes: async () => new Uint8Array(5) }));
    let arrive: () => void = () => undefined;
    answer(`POST /v1/workspaces/{workspaceId}/uploads`, () => ({
      uploadSessionId: 'upload-1',
      uploadUrl: 'https://store.example.test/put',
      expiresAt: '2026-09-29T12:00:00Z',
      maximumSizeBytes: 100,
    }));
    putFileToSignedUrl.mockImplementation(() => new Promise<void>((resolve) => (arrive = resolve)));
    answer(`POST /v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete`, () => ({
      artifact: { artifactId: 'artifact-1', filename: 'invoice.pdf', contentType: 'application/pdf', sizeBytes: 5 },
    }));
    answer(`POST ${RUNS_PATH}`, () => {
      throw new PlatformError('Unprocessable', 422, 'VALIDATION', { reason: 'artifact_unavailable' });
    });

    await renderActions({ sub: subscription({ runInput: [RECEIPT] }) });
    await fireEvent.press(screen.getByText('Run'));
    await fireEvent.press(screen.getByTestId('run-file-receipt'));
    expect(await screen.findByText('Uploading invoice.pdf…')).toBeTruthy();
    expect(screen.getByText('Uploading…')).toBeTruthy();
    arrive();
    expect(await screen.findByText('Ready: invoice.pdf (5 bytes)')).toBeTruthy();
    expect(putFileToSignedUrl.mock.calls[0][1].byteLength).toBe(5);

    await pressLast('Start run');
    expect(await screen.findByText('That file can no longer be used. Choose it again.')).toBeTruthy();
    expect(sent.find((s) => s.path === RUNS_PATH)!.body).toEqual({
      subscriptionId: 'sub-1',
      input: { receipt: 'artifact-1' },
    });
    expect(screen.queryByText('Ready: invoice.pdf (5 bytes)')).toBeNull();
  });
});

describe('Move to a newer version (24.4.1, backend §12.1 #126)', () => {
  it('is offered only when the catalog has a newer version, and moves on confirm', async () => {
    const view = await renderActions();
    expect(screen.queryByText(/is available/)).toBeNull();
    await view.unmount();

    await renderActions({ entry: entry({ version: 2 }) });
    expect(screen.getByText('This runs v1; v2 is available.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Move to v2'));
    expect(await screen.findByText('Move Invoice triage to v2?')).toBeTruthy();
    await pressLast('Move to v2');
    await waitFor(() => expect(callbacks.onChanged).toHaveBeenCalled());
    expect(sent).toEqual([expect.objectContaining({ method: 'PATCH', path: SUB_PATH, body: { templateVersion: 2 } })]);
  });

  it('says a refusal a person can act on in words', async () => {
    answer(`PATCH ${SUB_PATH}`, () => {
      throw new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'runs_in_flight' });
    });
    await renderActions({ entry: entry({ version: 2 }) });
    await fireEvent.press(screen.getByText('Move to v2'));
    await pressLast('Move to v2');
    expect(
      await screen.findByText('A run of this flow is still going. Wait for it to finish, then move.'),
    ).toBeTruthy();
    expect(callbacks.onChanged).not.toHaveBeenCalled();
  });
});

describe('Archive (24.4.1, backend §12.1 #92; "Archive flow" since 24.12)', () => {
  it("is reached only through its one-way confirmation, which says it can be unarchived later (the owner's build 12 item 4)", async () => {
    await renderActions();
    expect(screen.getByLabelText('Archive Invoice triage')).toBeTruthy();
    expect(screen.getByText('Archive flow')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('archive-flow'));
    expect(await screen.findByText('Archive Invoice triage?')).toBeTruthy();
    expect(
      screen.getByText(
        'It stops and moves to Archived flows. Its runs stay in Activity, and you can unarchive it later.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(sent).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('archive-flow'));
    await pressLast('Archive');
    await waitFor(() => expect(callbacks.onArchived).toHaveBeenCalled());
    expect(sent).toEqual([expect.objectContaining({ method: 'PATCH', path: SUB_PATH, body: { status: 'archived' } })]);
  });
});

describe("Archive flow is red in either theme (24.9.4; the owner's build 12 item 5)", () => {
  it.each(['dark', 'light'] as const)("draws Archive flow and its confirm in the theme's red (%s)", async (mode) => {
    const palette = mode === 'dark' ? nocturneDark : nocturneLight;
    const color = (style: unknown) => StyleSheet.flatten(style) as { color?: string; borderColor?: string };
    await renderActions({ mode });
    const archive = screen.getByTestId('archive-flow');
    expect(color(archive.props.style).borderColor).toBe(palette.danger);
    expect(color(within(archive).getByText('Archive flow').props.style).color).toBe(palette.danger);
    expect(within(archive).getByTestId(/^phosphor-react-native-archive-/u).props.color).toBe(palette.danger);
    await fireEvent.press(archive);
    const confirm = within(await screen.findByTestId('archive-dialog')).getByText('Archive');
    expect(color(confirm.props.style).color).toBe(palette.danger);
  });
});

describe('Archive and the plan', () => {
  it('lets the subscription list answer Added again, whatever this device stated before', async () => {
    // Setup's Activate states the solution active; an Archive must not leave
    // that standing over the list, which no longer holds the subscription.
    function PlanProbe() {
      const { isActive, setActive } = useSolutions();
      return (
        <>
          <Text testID="added">{String(isActive('tpl.invoice', false))}</Text>
          <Pressable testID="activate" onPress={() => setActive('tpl.invoice', true)}>
            <Text>activate</Text>
          </Pressable>
        </>
      );
    }
    await renderActions({ before: <PlanProbe /> });
    await fireEvent.press(screen.getByTestId('activate'));
    expect(screen.getByTestId('added')).toHaveTextContent('true');

    await fireEvent.press(screen.getByTestId('archive-flow'));
    await pressLast('Archive');
    await waitFor(() => expect(callbacks.onArchived).toHaveBeenCalled());
    expect(screen.getByTestId('added')).toHaveTextContent('false');
  });
});

describe('Webhook address (24.4.1, backend §12.1 #91, #109)', () => {
  it('is offered to an owner or admin of a webhook-started automation, and to no one else', async () => {
    const webhookSub = subscription({ triggerKind: 'webhook' });
    for (const [props, offered] of [
      [{ sub: webhookSub, role: 'admin' as const }, true],
      [{ sub: webhookSub, role: 'owner' as const }, true],
      [{ sub: webhookSub, role: 'member' as const }, false],
      [{ sub: subscription({ triggerKind: 'manual' }), role: 'owner' as const }, false],
    ] as const) {
      const view = await renderActions(props);
      expect(screen.queryByTestId('manage-webhook') !== null).toBe(offered);
      await view.unmount();
    }
  });

  it('shows the secret once, in the dialog, and stores it nowhere', async () => {
    answer(`GET ${WEBHOOK_PATH}`, () => {
      throw new PlatformError('Not found', 404);
    });
    answer(`POST ${WEBHOOK_PATH}`, () => ({
      endpointId: 'endpoint-1',
      url: 'https://hooks.example.test/e/endpoint-1',
      createdAt: '2026-09-29T00:00:00Z',
      secret: 'whsec_shown_once',
      rotated: false,
    }));
    answer(`GET ${WEBHOOK_PATH}`, () => ({
      endpointId: 'endpoint-1',
      url: 'https://hooks.example.test/e/endpoint-1',
      createdAt: '2026-09-29T00:00:00Z',
    }));
    await renderActions({ sub: subscription({ triggerKind: 'webhook' }) });

    await fireEvent.press(screen.getByTestId('manage-webhook'));
    expect(await screen.findByText('This flow has no address yet.')).toBeTruthy();
    // What the address is for, first (owner, build 7; 24.11.9).
    expect(screen.getByText(/^Where a service sends the events that start this flow — /u)).toBeTruthy();
    await fireEvent.press(screen.getByText('Create address'));
    expect(await screen.findByText('whsec_shown_once')).toBeTruthy();
    expect(screen.getByText('Secret — shown this once. Copy it now.')).toBeTruthy();
    expect(sent.find((s) => s.method === 'POST')!.key).toBeUndefined();

    await fireEvent.press(screen.getByText('Close'));
    await fireEvent.press(screen.getByTestId('manage-webhook'));
    expect(await screen.findByText('https://hooks.example.test/e/endpoint-1')).toBeTruthy();
    expect(screen.queryByText('whsec_shown_once')).toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

describe('Set up (24.4.1)', () => {
  it('saves the settings only — going live stays its own action', async () => {
    await renderActions();
    await fireEvent.press(screen.getByTestId('manage-setup'));
    await fireEvent.changeText(screen.getByLabelText('Watch inbox'), 'invoices@acme.co');
    await pressLast('Save setup');
    await waitFor(() => expect(callbacks.onChanged).toHaveBeenCalled());
    expect(sent).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        path: SUB_PATH,
        body: { config: { inbox: 'invoices@acme.co', alerts: false } },
      }),
    ]);
  });
});

describe('every action acts on the workspace the screen loaded (24.3.6)', () => {
  it('is refused in words, and sends nothing, once another workspace is active', async () => {
    await renderActions({ shown: 'another-workspace', entry: entry({ version: 2 }) });
    await fireEvent.press(screen.getByTestId('archive-flow'));
    await pressLast('Archive');
    expect(await screen.findByText(WORKSPACE_CHANGED)).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel'));

    await fireEvent.press(screen.getByText('Move to v2'));
    await pressLast('Move to v2');
    expect(await screen.findByText(WORKSPACE_CHANGED)).toBeTruthy();
    expect(sent).toHaveLength(0);
  });
});
