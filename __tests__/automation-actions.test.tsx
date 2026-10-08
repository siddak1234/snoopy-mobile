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
import { SessionContext, type SessionContextValue } from '@/hooks/use-session';
import { useSolutions } from '@/hooks/use-solutions';
import { FLOW_QUEUE_FULL, WORKSPACE_CHANGED } from '@/lib/content/refusals';
import type { AutomationRunInputField, Subscription } from '@/lib/platform/automations';
import type { CatalogEntry } from '@/lib/platform/catalog';
import type { SetupField } from '@/components/setup-field';
import { PlatformError, PlatformRateLimitedError, PlatformUnreachableError } from '@/lib/platform/problem';
import { TEST_WORKSPACE, sessionAs } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

const { platformOperation, newIdempotencyKey, putFileToSignedUrl } = jest.requireMock('@/lib/platform/client');

/** Every request the actions sent: its method, path (and the ids in it), key and body. */
let sent: { method: string; path: string; ids?: Record<string, string>; key?: string; body?: unknown }[];
/** Answers by `METHOD path`, in order; a function throws or answers per call. */
let answers: Record<string, (() => unknown)[]>;

beforeEach(() => {
  sent = [];
  answers = {};
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  putFileToSignedUrl.mockResolvedValue(undefined);
  type Init = { params?: { path?: Record<string, string>; header?: Record<string, string> }; body?: unknown };
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

const SUB_PATH = '/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}';
const RUNS_PATH = '/v1/workspaces/{workspaceId}/runs';
const WEBHOOK_PATH = '/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/webhook';

const NOTE: AutomationRunInputField = { key: 'note', title: 'Note', description: 'What to do', control: 'text', required: true };
const INBOX: SetupField = { section: 'source', key: 'inbox', title: 'Watch inbox', description: '', control: 'text', required: true };
const ALERTS: SetupField = { section: 'notifications', key: 'alerts', title: 'Alerts', description: '', control: 'toggle', required: false };
const DIGEST: SetupField = { section: 'notifications', key: 'digest', title: 'Daily digest to', description: '', control: 'email', required: false };
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
    // The pinned version's settings (backend §12.1 #185): what Set up draws.
    setup: [INBOX, ALERTS],
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
    requiredConnections: [],
    setup: [INBOX, ALERTS],
    pipeline: [],
    ...overrides,
  };
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

  it('says a run refused over the plan in its numbers (decision 7a3)', async () => {
    answer(`POST ${RUNS_PATH}`, () => {
      throw new PlatformError('Access is forbidden', 403, 'FORBIDDEN', { reason: 'over_plan_limit', limit: 2, live: 3 });
    });
    await renderActions();
    await fireEvent.press(screen.getByText('Run'));
    await pressLast('Start run');
    expect(
      await screen.findByText(
        'Your plan allows 2 flows; this workspace has 3. No flow can start a run until you archive 1. Paused and draft flows count.',
      ),
    ).toBeTruthy();
  });

  it("says a run refused because the flow and its queue are full in the flow's words; any other 429 keeps the platform's (backend 25.2.10)", async () => {
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
    await renderActions();
    await fireEvent.press(screen.getByText('Run'));
    await pressLast('Start run');
    expect(
      await screen.findByText(
        'This flow is busy and its queue is full, so the run was not started. Try again once one of its runs has ended.',
      ),
    ).toBeTruthy();
    await pressLast('Start run');
    expect(await screen.findByText('The platform is busy right now. Try again in 30 seconds.')).toBeTruthy();
    expect(callbacks.onRunStarted).not.toHaveBeenCalled();
  });

  it("keeps the platform's busy words for a run refused because the flow's runs could not be counted in time — never the full-queue sentence, as on the website (backend 25.2.10, creation_contended)", async () => {
    answer(`POST ${RUNS_PATH}`, () => {
      // As the transport projects the contract's 429: its busy words, no wait stated, and the reason beside them.
      throw new PlatformRateLimitedError('The platform is busy right now. Try again in a moment.', undefined, {
        reason: 'creation_contended',
      });
    });
    await renderActions();
    await fireEvent.press(screen.getByText('Run'));
    await pressLast('Start run');
    expect(await screen.findByText('The platform is busy right now. Try again in a moment.')).toBeTruthy();
    expect(screen.queryByText(FLOW_QUEUE_FULL)).toBeNull();
    expect(callbacks.onRunStarted).not.toHaveBeenCalled();
  });

  it("says, before a run starts, that it may wait its turn at a busy flow — the website's sentence (backend 25.2.10)", async () => {
    await renderActions();
    await fireEvent.press(screen.getByText('Run'));
    expect(
      within(screen.getByTestId('run-dialog')).getByText(
        'Enter what this run needs. It starts when you submit, or waits its turn if this flow is busy, and its page shows each step as it happens.',
      ),
    ).toBeTruthy();
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

/** A second workspace the same person owns. */
const OTHER_WORKSPACE = '00000000-0000-4000-8000-000000000002';

/** The signed-in owner, with `workspaceId` the active workspace — the one the screen loaded. */
function ownerIn(workspaceId: string): SessionContextValue {
  const owner = sessionAs('owner');
  if (owner.status !== 'signed-in') throw new Error('fixture');
  return {
    ...owner,
    session: {
      ...owner.session,
      user: { ...owner.session.user, activeWorkspaceId: workspaceId },
      workspaces: [
        ...owner.session.workspaces,
        { id: OTHER_WORKSPACE, name: 'Acme Labs', type: 'organization', role: 'owner' },
      ],
    },
  };
}

/**
 * One flow's actions, which hold its webhook secret's key, showing each of
 * `flows` in turn in place (`show-next`): the flow they show next — another
 * one, or the same id in another workspace — must never be sent the key of the
 * flow before it.
 */
function ActionsInTurn({ flows }: { flows: Subscription[] }) {
  const [turn, setTurn] = React.useState(0);
  const flow = flows[turn % flows.length]!;
  return (
    <SessionContext.Provider value={ownerIn(flow.workspaceId)}>
      <Pressable testID="show-next" onPress={() => setTurn((n) => n + 1)}>
        <Text>Show the next flow</Text>
      </Pressable>
      <AutomationActions
        name="Invoice triage"
        subscription={flow}
        entry={entry()}
        live
        shownWorkspaceId={flow.workspaceId}
        canAdminister
        statusRow={null}
        {...callbacks}
      />
    </SessionContext.Provider>
  );
}

/** Opens the Webhook address dialog and presses Make a new secret. */
async function makeANewSecret() {
  await fireEvent.press(screen.getByTestId('manage-webhook'));
  await fireEvent.press(await screen.findByText('Make a new secret'));
}

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
    // The press's own key (backend §12.1 #240; no key until Round 17).
    expect(sent.find((s) => s.method === 'POST')!.key).toBe('webhook-1');

    await fireEvent.press(screen.getByText('Close'));
    await fireEvent.press(screen.getByTestId('manage-webhook'));
    expect(await screen.findByText('https://hooks.example.test/e/endpoint-1')).toBeTruthy();
    expect(screen.queryByText('whsec_shown_once')).toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('sends a press an Idempotency-Key of the published shape, the same one on its retry after a lost answer, and a new one for the next press (backend §12.1 #240)', async () => {
    // The real key, so its shape is the one the Edge holds a key to.
    newIdempotencyKey.mockImplementation(jest.requireActual('@/lib/platform/client').newIdempotencyKey);
    const address = { endpointId: 'endpoint-1', url: 'https://hooks.example.test/e/endpoint-1', createdAt: '2026-09-29T00:00:00Z' };
    answer(`GET ${WEBHOOK_PATH}`, () => address);
    answer(
      `POST ${WEBHOOK_PATH}`,
      // The answer is lost: the platform may already have stopped the old secret.
      () => {
        throw new PlatformUnreachableError();
      },
      // Pressed again, under the same key: the secret the lost answer carried.
      () => ({ ...address, secret: 'whsec_the_lost_answers', rotated: true }),
      // A later press is a new secret.
      () => ({ ...address, secret: 'whsec_the_next', rotated: true }),
    );
    await renderActions({ sub: subscription({ triggerKind: 'webhook' }) });
    await fireEvent.press(screen.getByTestId('manage-webhook'));

    await fireEvent.press(await screen.findByText('Make a new secret'));
    expect(await screen.findByText('The platform is unreachable')).toBeTruthy();
    await fireEvent.press(screen.getByText('Make a new secret'));
    expect(await screen.findByText('whsec_the_lost_answers')).toBeTruthy();
    await fireEvent.press(screen.getByText('Make a new secret'));
    expect(await screen.findByText('whsec_the_next')).toBeTruthy();

    const keys = sent.filter((s) => s.method === 'POST' && s.path === WEBHOOK_PATH).map((s) => s.key);
    expect(keys).toHaveLength(3);
    // The contract's shape: 16-128 letters, numbers, dot, underscore, tilde, colon or hyphen.
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9._~:-]{16,128}$/u);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  const ADDRESS = { endpointId: 'endpoint-1', url: 'https://hooks.example.test/e/endpoint-1', createdAt: '2026-09-29T00:00:00Z' };
  /** The key each Make a new secret sent, in order. */
  const issueKeys = () => sent.filter((s) => s.method === 'POST' && s.path === WEBHOOK_PATH).map((s) => s.key);

  it("keeps a press's key through the dialog closing, as the website does: after a lost answer, a close and a reopen, the next press sends the same key and shows the secret the lost answer carried — the key never stored (backend §12.1 #240)", async () => {
    answer(`GET ${WEBHOOK_PATH}`, () => ADDRESS, () => ADDRESS);
    answer(
      `POST ${WEBHOOK_PATH}`,
      // The answer is lost: the platform may already have stopped the old secret.
      () => {
        throw new PlatformUnreachableError();
      },
      // Pressed again under the same key, in a new opening: the secret the lost answer carried.
      () => ({ ...ADDRESS, secret: 'whsec_the_lost_answers', rotated: true }),
    );
    await renderActions({ sub: subscription({ triggerKind: 'webhook' }) });

    await makeANewSecret();
    expect(await screen.findByText('The platform is unreachable')).toBeTruthy();
    await fireEvent.press(screen.getByText('Close'));
    expect(screen.queryByTestId('webhook-dialog')).toBeNull();
    await makeANewSecret();
    expect(await screen.findByText('whsec_the_lost_answers')).toBeTruthy();

    expect(issueKeys()).toEqual(['webhook-1', 'webhook-1']);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('spends a key once its secret is shown, though the dialog is closed and opened again: the next press is a new secret under a new key (backend §12.1 #240)', async () => {
    answer(`GET ${WEBHOOK_PATH}`, () => ADDRESS, () => ADDRESS);
    answer(
      `POST ${WEBHOOK_PATH}`,
      () => ({ ...ADDRESS, secret: 'whsec_shown', rotated: true }),
      () => ({ ...ADDRESS, secret: 'whsec_the_next', rotated: true }),
    );
    await renderActions({ sub: subscription({ triggerKind: 'webhook' }) });

    await makeANewSecret();
    expect(await screen.findByText('whsec_shown')).toBeTruthy();
    await fireEvent.press(screen.getByText('Close'));
    await makeANewSecret();
    expect(await screen.findByText('whsec_the_next')).toBeTruthy();

    expect(issueKeys()).toEqual(['webhook-1', 'webhook-2']);
  });

  it("never sends one flow's key for another: shown another flow, or the same flow's id in another workspace, the actions make that one its own key, and the first flow's press still carries its own (backend §12.1 #240)", async () => {
    answer(`GET ${WEBHOOK_PATH}`, () => ADDRESS, () => ADDRESS, () => ADDRESS, () => ADDRESS);
    answer(
      `POST ${WEBHOOK_PATH}`,
      () => {
        throw new PlatformUnreachableError();
      },
      () => ({ ...ADDRESS, secret: 'whsec_another_flow', rotated: true }),
      () => ({ ...ADDRESS, secret: 'whsec_another_workspace', rotated: true }),
      () => ({ ...ADDRESS, secret: 'whsec_the_lost_answers', rotated: true }),
    );
    await renderWithProviders(
      <ActionsInTurn
        flows={[
          subscription({ triggerKind: 'webhook' }),
          subscription({ id: 'sub-2', triggerKind: 'webhook' }),
          subscription({ workspaceId: OTHER_WORKSPACE, triggerKind: 'webhook' }),
        ]}
      />,
      sessionAs('owner'),
    );

    // The first flow's press, its answer lost.
    await makeANewSecret();
    expect(await screen.findByText('The platform is unreachable')).toBeTruthy();
    await fireEvent.press(screen.getByText('Close'));
    // Another flow, then the first one's id in another workspace: each its own press.
    for (const secret of ['whsec_another_flow', 'whsec_another_workspace']) {
      await fireEvent.press(screen.getByTestId('show-next'));
      await makeANewSecret();
      expect(await screen.findByText(secret)).toBeTruthy();
      await fireEvent.press(screen.getByText('Close'));
    }
    // The first flow again: its own key, kept, so the lost answer's secret.
    await fireEvent.press(screen.getByTestId('show-next'));
    await makeANewSecret();
    expect(await screen.findByText('whsec_the_lost_answers')).toBeTruthy();

    const presses = sent.filter((s) => s.method === 'POST' && s.path === WEBHOOK_PATH);
    expect(presses.map(({ ids, key }) => ({ ...ids, key }))).toEqual([
      { workspaceId: TEST_WORKSPACE, subscriptionId: 'sub-1', key: 'webhook-1' },
      { workspaceId: TEST_WORKSPACE, subscriptionId: 'sub-2', key: 'webhook-2' },
      { workspaceId: OTHER_WORKSPACE, subscriptionId: 'sub-1', key: 'webhook-3' },
      { workspaceId: TEST_WORKSPACE, subscriptionId: 'sub-1', key: 'webhook-1' },
    ]);
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

describe('Set up draws the version the flow runs, not the newest (backend §12.1 #185)', () => {
  it("shows the pinned version's settings when a newer version changes them", async () => {
    await renderActions({ sub: subscription({ setup: [INBOX] }), entry: entry({ version: 2, setup: [INBOX, ALERTS, DIGEST] }) });
    await fireEvent.press(screen.getByTestId('manage-setup'));
    expect(screen.getByLabelText('Watch inbox')).toBeTruthy();
    expect(screen.queryByText('Alerts')).toBeNull();
    expect(screen.queryByText('Daily digest to')).toBeNull();
    await pressLast('Save setup');
    await waitFor(() => expect(callbacks.onChanged).toHaveBeenCalled());
    expect(sent).toEqual([expect.objectContaining({ body: { config: { inbox: 'ap@acme.co' } } })]);
  });

  it('offers no Set up when the version it runs declares none, though the newest does', async () => {
    await renderActions({ sub: subscription({ setup: undefined }), entry: entry({ version: 2 }) });
    expect(screen.queryByTestId('manage-setup')).toBeNull();
  });
});

describe('a move whose settings do not fit is answered with the new version\'s settings (backend §12.1 #185)', () => {
  it('offers that version\'s fields, seeded from what the flow holds, and saving moves it in one change', async () => {
    answer(`PATCH ${SUB_PATH}`, () => {
      throw new PlatformError('Unprocessable', 422, 'VALIDATION_FAILED', { reason: 'invalid_config' });
    });
    await renderActions({ sub: subscription({ setup: [INBOX] }), entry: entry({ version: 2, setup: [INBOX, ALERTS, DIGEST] }) });
    await fireEvent.press(screen.getByText('Move to v2'));
    await pressLast('Move to v2');
    expect(await screen.findByText('Its settings do not fit that version. Set them for it to move.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Set them for v2'));

    expect(await screen.findByText('Settings for v2')).toBeTruthy();
    // The new version's fields, the flow's own value carried over.
    expect(screen.getByLabelText('Watch inbox').props.value).toBe('ap@acme.co');
    await fireEvent.changeText(screen.getByLabelText('Daily digest to'), 'ops@acme.co');
    await pressLast('Save and move to v2');
    await waitFor(() => expect(callbacks.onChanged).toHaveBeenCalled());
    expect(sent.map((call) => call.body)).toEqual([
      { templateVersion: 2 },
      { config: { inbox: 'ap@acme.co', alerts: false, digest: 'ops@acme.co' }, templateVersion: 2 },
    ]);
  });

  it('cancelling the new version\'s settings sends nothing and leaves the flow where it is', async () => {
    answer(`PATCH ${SUB_PATH}`, () => {
      throw new PlatformError('Unprocessable', 422, 'VALIDATION_FAILED', { reason: 'invalid_config' });
    });
    await renderActions({ sub: subscription({ setup: [INBOX] }), entry: entry({ version: 2, setup: [INBOX, DIGEST] }) });
    await fireEvent.press(screen.getByText('Move to v2'));
    await pressLast('Move to v2');
    await fireEvent.press(await screen.findByText('Set them for v2'));
    expect(await screen.findByText('Settings for v2')).toBeTruthy();
    await pressLast('Cancel');
    await waitFor(() => expect(screen.queryByText('Settings for v2')).toBeNull());
    expect(sent.map((call) => call.body)).toEqual([{ templateVersion: 2 }]);
    expect(callbacks.onChanged).not.toHaveBeenCalled();
  });

  it("draws the new version's settings in the sheet that asked — no second modal, which iOS would not present while the first dismisses (the review of #49)", async () => {
    answer(`PATCH ${SUB_PATH}`, () => {
      throw new PlatformError('Unprocessable', 422, 'VALIDATION_FAILED', { reason: 'invalid_config' });
    });
    await renderActions({ sub: subscription({ setup: [INBOX] }), entry: entry({ version: 2, setup: [INBOX, DIGEST] }) });
    await fireEvent.press(screen.getByText('Move to v2'));
    await pressLast('Move to v2');
    await screen.findByText('Set them for v2');
    const sheet = screen.getByTestId('move-version-dialog');

    await fireEvent.press(screen.getByText('Set them for v2'));
    expect(await screen.findByText('Settings for v2')).toBeTruthy();
    // The very element that asked now holds the fields — its id moved with its words — not
    // a second sheet mounted as the first one left.
    expect(screen.getByTestId('setup-dialog')).toBe(sheet);
    expect(screen.queryByTestId('move-version-dialog')).toBeNull();
    expect(screen.getByLabelText('Watch inbox').props.value).toBe('ap@acme.co');
  });

  it('offers nothing to set for any other refusal', async () => {
    answer(`PATCH ${SUB_PATH}`, () => {
      throw new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'runs_in_flight' });
    });
    await renderActions({ entry: entry({ version: 2 }) });
    await fireEvent.press(screen.getByText('Move to v2'));
    await pressLast('Move to v2');
    expect(await screen.findByText('A run of this flow is still going. Wait for it to finish, then move.')).toBeTruthy();
    expect(screen.queryByText('Set them for v2')).toBeNull();
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
