jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import AgreementScreen from '@/app/(tabs)/flows/agreement';
import SetupScreen from '@/app/(tabs)/flows/setup';
import { StartRun } from '@/components/automations/start-run';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import type { AutomationRunInputField, Subscription } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { awaitAgreement, settleAgreement, todayUtc } from '@/lib/view/health-agreement';
import { fakePlatform } from '@/test/fake-platform';
import {
  TEST_WORKSPACE,
  invoiceProcessingV4Entry,
  planSubscriptionsPayload,
  providersWithQuickBooks,
  runsPayload,
  sessionAs,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

/**
 * Round 21 stage 2, C3 (backend ADR-0049): a flow that carries health data is
 * refused 403 `agreement_required` at a run's start (its turn-on: Set up's own
 * section, below; ~~its add~~ until builds 37 and 39, wave 2) until the
 * workspace's owner accepted the health data agreement. The owner gets the
 * agreement's screen, and what was refused is sent again with the same key;
 * anyone else the one line, and nothing more is sent. The platform names the
 * flow's health data, never the app: any flow's refusal is read the same.
 */

const ASK_OWNER = 'Ask your workspace owner to accept the health data agreement.';
const NOT_PUBLISHED = "The health data agreement isn't available yet.";
const ADD = 'POST /v1/workspaces/{workspaceId}/subscriptions';
const RUN = 'POST /v1/workspaces/{workspaceId}/runs';
const ACCEPT = 'POST /v1/workspaces/{workspaceId}/agreements';
const TEXT = 'GET /v1/agreements/health-data';
const AGREEMENT = { version: 1, text: 'This Business Associate Agreement is made between {Covered Entity} and Autom8x, effective {Effective date}.', sha256: 'a'.repeat(64) };

beforeEach(() => {
  resetSnapshot();
  settleAgreement(false);
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
});

/** 403 `agreement_required`, as the platform answers an add or a run (`AgreementRequiredDetails`); no version while none is published. */
function refusedForAgreement(version?: number) {
  return (): never => {
    throw new PlatformError('Forbidden', 403, 'FORBIDDEN', {
      reason: 'agreement_required',
      kind: 'health-data',
      ...(version === undefined ? {} : { version }),
    });
  };
}

/** The flow Turn on adds: a draft, then turned on. */
const DRAFT: Subscription = {
  ...planSubscriptionsPayload().subscriptions[0]!,
  id: 'ip-1',
  templateId: 'invoice-processing',
  templateVersion: 4,
  status: 'draft',
  config: {},
  unmetConnections: [],
  setup: invoiceProcessingV4Entry().setup,
};

const PATCH = 'PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}';
const READ = 'GET /v1/workspaces/{workspaceId}/agreements/health-data';
const CURRENT = { version: AGREEMENT.version, sha256: AGREEMENT.sha256 };
/** The workspace's acceptance of the current version, as the read and an acceptance answer it. */
const SIGNED = {
  id: '00000000-0000-4000-8000-0000000000d1',
  kind: 'health-data' as const,
  version: 1,
  signerName: 'Dana Reyes',
  signerTitle: 'Practice manager',
  acceptedAt: '2026-11-04T12:00:00Z',
};

/** Set up's reads and writes; `healthData` marks the flow as one that carries health data (wave 2). */
function routeSetup(fake: ReturnType<typeof fakePlatform>, healthData = false) {
  let held: Subscription[] = [];
  const entry = { ...invoiceProcessingV4Entry(), ...(healthData ? { healthData: true as const } : {}) };
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [entry], categories: ['All', 'Accounting'] });
  fake.always('GET /v1/connections/providers', providersWithQuickBooks());
  fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', () => ({ subscriptions: held }));
  fake.always(ADD, () => {
    held = [DRAFT];
    return { subscription: DRAFT };
  });
  fake.always(PATCH, { subscription: { ...DRAFT, status: 'live' } });
  return {
    /** Held already, at this status: Set up opens it where it is. */
    hold(status: Subscription['status']) {
      held = [{ ...DRAFT, status }];
    },
  };
}

async function openSetup(role: 'owner' | 'admin' | 'member' = 'owner') {
  setMockParams({ template: 'invoice-processing' });
  await renderWithProviders(<SetupScreen />, sessionAs(role));
  await screen.findByText('Set up Invoice Processing');
}

function turnOnButton() {
  return screen.getByTestId('setup-turn-on');
}

function contractLine() {
  return within(screen.getByTestId('setup-contract')).getByTestId('setup-contract-line').props.children;
}

async function sign(parts: { box?: boolean; name?: string; title?: string } = {}) {
  const { box = true, name = ' Dana Reyes ', title = 'Practice manager' } = parts;
  if (box) await fireEvent.press(within(screen.getByTestId('setup-contract-authorized')).getByRole('switch'));
  await fireEvent.changeText(screen.getByLabelText('Full name'), name);
  await fireEvent.changeText(screen.getByLabelText('Title'), title);
}

const DETAIL = { pathname: '/(tabs)/flows/detail', params: { flow: 'ip-1' } };

/**
 * Builds 37 and 39, wave 2 (the owner's item 9: "Where is the BAA contract to
 * view prefilled and checkmark to accept below it … 4. Contract and accept";
 * backend ADR-0049 amendment 2): a health flow's Set up asks for the agreement
 * in its own numbered section, and Turn on waits for it.
 */
describe("Set up's Contract and accept", () => {
  it('a flow without healthData: no section, nothing read for it, Turn on as before', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake);
    await openSetup();
    expect(screen.queryByTestId('setup-contract')).toBeNull();
    expect(fake.to(READ)).toEqual([]);
    await fireEvent.press(turnOnButton());
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(DETAIL));
    expect(fake.to(ACCEPT)).toEqual([]);
  });

  it("not published (current null): the next numbered section says it is being finalized, and Turn on is disabled and sends nothing", async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    fake.always(READ, { kind: 'health-data', current: null, acceptance: null });
    await openSetup();
    const numbered = screen.getAllByTestId(/^setup-section-\d+$/u).map((each) => Number(each.props.testID.split('-')[2]));
    expect(within(screen.getByTestId('setup-contract')).getByText(`${Math.max(...numbered) + 1} · Contract and accept`)).toBeTruthy();
    expect(contractLine()).toBe('The agreement is being finalized.');
    expect(turnOnButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(turnOnButton());
    expect(fake.to(ADD)).toEqual([]);
    expect(fake.to(TEXT)).toEqual([]);
  });

  it('accepted: the version, the day and the signer; Turn on enabled, and it turns on without accepting again', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    fake.always(READ, { kind: 'health-data', current: CURRENT, acceptance: SIGNED });
    await openSetup();
    expect(contractLine()).toBe('Accepted · Version 1 · Nov 4, 2026');
    expect(screen.getByTestId('setup-contract-signer').props.children).toBe('Dana Reyes, Practice manager');
    expect(turnOnButton().props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(turnOnButton());
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(DETAIL));
    expect(fake.to(ACCEPT)).toEqual([]);
    expect(fake.to(TEXT)).toEqual([]);
  });

  it("the owner: the text filled for display in its box, then the box and two fields; one press accepts, THEN adds and turns on, and opens the flow — never the agreement screen", async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    fake.always(READ, { kind: 'health-data', current: CURRENT, acceptance: null });
    fake.always(TEXT, AGREEMENT);
    fake.always(ACCEPT, { document: SIGNED });
    await openSetup('owner');
    expect(within(screen.getByTestId('setup-contract-text')).getByText(
      `This Business Associate Agreement is made between Acme Operations and Autom8x, effective ${todayUtc()}.`,
    )).toBeTruthy();
    expect(screen.getByText("I'm authorized to sign for Acme Operations")).toBeTruthy();
    expect(screen.getByLabelText('Full name').props.maxLength).toBe(120);
    expect(screen.getByLabelText('Title').props.maxLength).toBe(120);
    expect(turnOnButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    await sign();
    expect(turnOnButton().props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(turnOnButton());
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(DETAIL));
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/(tabs)/flows/agreement' }));
    const writes = fake.sent.filter((each) => each.method !== 'GET').map((each) => `${each.method} ${each.path}`);
    expect(writes).toEqual([ACCEPT, ADD, PATCH]);
    expect(fake.to(ACCEPT)).toEqual([
      expect.objectContaining({
        values: { workspaceId: TEST_WORKSPACE },
        key: expect.stringMatching(/^agreement-/u),
        body: {
          kind: 'health-data',
          version: 1,
          sha256: AGREEMENT.sha256,
          signerName: 'Dana Reyes',
          signerTitle: 'Practice manager',
          authorized: true,
        },
      }),
    ]);
  });

  it('accepted, then the turn-on fails: the section says accepted, and Try again turns on without a second acceptance', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    fake.always(READ, { kind: 'health-data', current: CURRENT, acceptance: null });
    fake.always(TEXT, AGREEMENT);
    fake.always(ACCEPT, { document: SIGNED });
    fake.once(PATCH, () => {
      throw new PlatformError('Bad Gateway', 502, 'DEPENDENCY_FAILURE');
    });
    await openSetup('owner');
    await screen.findByTestId('setup-contract-text');
    await sign();
    await fireEvent.press(turnOnButton());
    await waitFor(() => expect(contractLine()).toBe('Accepted · Version 1 · Nov 4, 2026'));
    expect(mockRouter.push).not.toHaveBeenCalledWith(DETAIL);
    await fireEvent.press(turnOnButton());
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(DETAIL));
    expect(fake.to(ACCEPT)).toHaveLength(1);
    expect(fake.to(PATCH)).toHaveLength(2);
  });

  it.each([
    ['the box unticked', { box: false }],
    ['Full name empty', { name: '  ' }],
    ['Title empty', { title: '' }],
  ])('%s: Turn on stays disabled and sends nothing', async (_case, parts) => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    fake.always(READ, { kind: 'health-data', current: CURRENT, acceptance: null });
    fake.always(TEXT, AGREEMENT);
    await openSetup('owner');
    await screen.findByTestId('setup-contract-text');
    await sign(parts);
    expect(turnOnButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(turnOnButton());
    expect(fake.sent.filter((each) => each.method !== 'GET')).toEqual([]);
  });

  it('a text changed since it was read (409 agreement_changed): read again, the box unticked and the name kept, nothing else sent; the next press accepts the new text with a new key', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    fake.once(READ, { kind: 'health-data', current: CURRENT, acceptance: null });
    fake.always(READ, { kind: 'health-data', current: { version: 2, sha256: 'b'.repeat(64) }, acceptance: null });
    fake.once(TEXT, AGREEMENT);
    fake.always(TEXT, { ...AGREEMENT, version: 2, sha256: 'b'.repeat(64), text: 'Version two for {Covered Entity}.' });
    fake.once(ACCEPT, () => {
      throw new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'agreement_changed', version: 2 });
    });
    fake.always(ACCEPT, { document: { ...SIGNED, version: 2 } });
    await openSetup('owner');
    await screen.findByTestId('setup-contract-text');
    await sign();
    await fireEvent.press(turnOnButton());
    expect(await screen.findByText('Version two for Acme Operations.')).toBeTruthy();
    expect(within(screen.getByTestId('setup-contract-authorized')).getByRole('switch').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );
    expect(screen.getByLabelText('Full name').props.value).toBe(' Dana Reyes ');
    expect(turnOnButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(fake.to(ADD)).toEqual([]);
    expect(fake.to(PATCH)).toEqual([]);

    await fireEvent.press(within(screen.getByTestId('setup-contract-authorized')).getByRole('switch'));
    await fireEvent.press(turnOnButton());
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(DETAIL));
    const [first, second] = fake.to(ACCEPT);
    expect(second!.body).toEqual(expect.objectContaining({ version: 2, sha256: 'b'.repeat(64) }));
    expect(second!.key).not.toBe(first!.key);
  });

  it('a turn-on refused for the agreement (403 agreement_required): the section is read again, and no agreement screen opens', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    fake.once(READ, { kind: 'health-data', current: CURRENT, acceptance: SIGNED });
    fake.always(READ, { kind: 'health-data', current: { version: 2, sha256: 'b'.repeat(64) }, acceptance: null });
    fake.always(TEXT, { ...AGREEMENT, version: 2, sha256: 'b'.repeat(64) });
    fake.once(PATCH, refusedForAgreement(2));
    await openSetup('owner');
    await fireEvent.press(turnOnButton());
    expect(await screen.findByTestId('setup-contract-text')).toBeTruthy();
    expect(fake.to(READ)).toHaveLength(2);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(turnOnButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('signed and accepted, then the turn-on refused 403 for a newer version: the box unticked again, Turn on disabled', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    fake.once(READ, { kind: 'health-data', current: CURRENT, acceptance: null });
    fake.always(READ, { kind: 'health-data', current: { version: 2, sha256: 'b'.repeat(64) }, acceptance: null });
    fake.once(TEXT, AGREEMENT);
    fake.always(TEXT, { ...AGREEMENT, version: 2, sha256: 'b'.repeat(64), text: 'Version two for {Covered Entity}.' });
    fake.always(ACCEPT, { document: SIGNED });
    fake.once(PATCH, refusedForAgreement(2));
    await openSetup('owner');
    await screen.findByTestId('setup-contract-text');
    await sign();
    await fireEvent.press(turnOnButton());
    expect(await screen.findByText('Version two for Acme Operations.')).toBeTruthy();
    expect(within(screen.getByTestId('setup-contract-authorized')).getByRole('switch').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );
    expect(turnOnButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(fake.to(ACCEPT)).toHaveLength(1);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('an admin: the read, then "ask your owner", Turn on disabled; no text read', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    fake.always(READ, { kind: 'health-data', current: CURRENT, acceptance: null });
    await openSetup('admin');
    expect(contractLine()).toBe(ASK_OWNER);
    expect(turnOnButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(fake.to(TEXT)).toEqual([]);
  });

  it('a member: never read (403 by contract), "ask your owner", and no Turn on', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    await openSetup('member');
    expect(contractLine()).toBe(ASK_OWNER);
    expect(fake.to(READ)).toEqual([]);
    expect(screen.queryByTestId('setup-turn-on')).toBeNull();
  });

  it('a failed read: "Unavailable" in the section, the rest of Set up drawn, Turn on disabled', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true);
    fake.always(READ, () => {
      throw new PlatformError('Bad Gateway', 502, 'DEPENDENCY_FAILURE');
    });
    await openSetup('owner');
    expect(contractLine()).toBe('Unavailable');
    expect(screen.getAllByTestId(/^setup-section-\d+$/u).length).toBeGreaterThan(0);
    expect(turnOnButton().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it("a live flow's Save is not gated: the section is drawn, Save sends the settings without accepting", async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake, true).hold('live');
    fake.always(READ, { kind: 'health-data', current: CURRENT, acceptance: null });
    fake.always(TEXT, AGREEMENT);
    await openSetup('owner');
    await screen.findByTestId('setup-contract-text');
    expect(within(turnOnButton()).getByText('Save')).toBeTruthy();
    expect(turnOnButton().props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(turnOnButton());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(fake.to(ACCEPT)).toEqual([]);
    expect(fake.to(PATCH)).toHaveLength(1);
  });
});

const AGREEMENT_SCREEN = {
  pathname: '/(tabs)/flows/agreement',
  params: { workspace: TEST_WORKSPACE },
};

describe('Start run, refused for the agreement', () => {
  const NOTE: AutomationRunInputField = { key: 'note', title: 'Note', description: 'What to do', control: 'text', required: false };
  const onStarted = jest.fn();

  async function start(role: 'owner' | 'admin' | 'member') {
    await renderWithProviders(
      <StartRun subscriptionId="ip-1" shownWorkspaceId={TEST_WORKSPACE} runInput={[NOTE]} onStarted={onStarted} />,
      sessionAs(role),
    );
    await fireEvent.press(screen.getByTestId('start-run-button'));
  }

  it('an owner: the agreement opens for the run; accepted, the run is sent again with the same key and started', async () => {
    const fake = fakePlatform(platformOperation);
    fake.once(RUN, refusedForAgreement(2));
    fake.always(RUN, { run: { ...runsPayload().runs[0]!, id: 'run-9', status: 'pending' } });
    await start('owner');
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(AGREEMENT_SCREEN));
    expect(onStarted).not.toHaveBeenCalled();
    await act(async () => settleAgreement(true));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('run-9'));
    const runs = fake.to(RUN);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.key).toBe(runs[0]!.key);
  });

  it.each(['admin', 'member'] as const)('%s: the one line under Start run, and nothing more sent', async (role) => {
    const fake = fakePlatform(platformOperation);
    fake.always(RUN, refusedForAgreement(2));
    await start(role);
    expect(await screen.findByText(ASK_OWNER)).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(fake.to(RUN)).toHaveLength(1);
  });
});

describe('the agreement screen', () => {
  /** What an acceptance answers: the signed document's row. */
  const ACCEPTED = {
    document: {
      id: '00000000-0000-4000-8000-0000000000d1',
      kind: 'health-data' as const,
      version: 1,
      signerName: 'Dana Reyes',
      signerTitle: 'Practice manager',
      acceptedAt: '2026-11-04T10:00:00Z',
    },
  };

  function routeAgreement(fake: ReturnType<typeof fakePlatform>) {
    fake.always(TEXT, AGREEMENT);
    fake.always(ACCEPT, ACCEPTED);
  }

  async function fill() {
    await fireEvent.press(within(screen.getByTestId('agreement-authorized')).getByRole('switch'));
    await fireEvent.changeText(screen.getByLabelText('Full name'), ' Dana Reyes ');
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Practice manager');
  }

  it('the title, the version, the text, the checkbox and two fields; Accept pressable once all three are given; it accepts the text read, then goes back and the run is sent again', async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    const answered = awaitAgreement(() => undefined);
    setMockParams({ workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));

    expect(await screen.findByText('Health data agreement')).toBeTruthy();
    expect(screen.getByTestId('agreement-version').props.children).toBe('Version 1');
    expect(screen.getByTestId('agreement-text').props.children).toBe(AGREEMENT.text);
    expect(screen.getByText("I'm authorized to sign for Acme Operations")).toBeTruthy();
    const accept = screen.getByTestId('agreement-accept');
    expect(within(accept).getByText('Accept and start run')).toBeTruthy();
    expect(accept.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(accept);
    expect(fake.to(ACCEPT)).toEqual([]);

    await fill();
    expect(screen.getByTestId('agreement-accept').props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(screen.getByTestId('agreement-accept'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(fake.to(ACCEPT)).toEqual([
      expect.objectContaining({
        values: { workspaceId: TEST_WORKSPACE },
        key: expect.stringMatching(/^agreement-/u),
        body: {
          kind: 'health-data',
          version: 1,
          sha256: AGREEMENT.sha256,
          signerName: 'Dana Reyes',
          signerTitle: 'Practice manager',
          authorized: true,
        },
      }),
    ]);
    await expect(answered).resolves.toBe(true);
  });

  it("\"Full name\" and \"Title\" each take at most 120 characters — the contract's bound, the website's maxLength — so a longer one is never sent", async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    setMockParams({ workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    await screen.findByTestId('agreement-text');
    expect(screen.getByLabelText('Full name').props.maxLength).toBe(120);
    expect(screen.getByLabelText('Title').props.maxLength).toBe(120);
  });

  it('on Start run its button says "Accept and start run"', async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    setMockParams({ workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    expect(within(await screen.findByTestId('agreement-accept')).getByText('Accept and start run')).toBeTruthy();
  });

  it("while an acceptance is sent, its button says \"Starting…\" — the website's words, never \"Working…\" (~~\"Adding…\" for an add~~ until wave 2)", async () => {
    const busy = 'Starting…';
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    let answer: () => void = () => undefined;
    fake.always(ACCEPT, () => new Promise<typeof ACCEPTED>((resolve) => (answer = () => resolve(ACCEPTED))));
    setMockParams({ workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    await screen.findByTestId('agreement-text');
    await fill();
    await fireEvent.press(screen.getByTestId('agreement-accept'));
    expect(await within(screen.getByTestId('agreement-accept')).findByText(busy)).toBeTruthy();
    expect(screen.queryByText('Working…')).toBeNull();
    await act(async () => answer());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });

  it('left without accepting: the screen that was refused is told, and nothing was sent', async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    const answered = awaitAgreement(() => undefined);
    setMockParams({ workspace: TEST_WORKSPACE });
    const view = await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    await screen.findByTestId('agreement-text');
    await view.unmount();
    await expect(answered).resolves.toBe(false);
    expect(fake.to(ACCEPT)).toEqual([]);
  });

  it('none published (503 agreement_not_published): it says so, and offers nothing to accept', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always(TEXT, () => {
      throw new PlatformError('Not Configured', 503, 'NOT_CONFIGURED', { reason: 'agreement_not_published' });
    });
    setMockParams({ workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    expect((await screen.findByTestId('agreement-line')).props.children).toBe(NOT_PUBLISHED);
    expect(screen.queryByTestId('agreement-accept')).toBeNull();
  });

  it('anyone but the owner: the one line, and no form', async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    await renderWithProviders(<AgreementScreen />, sessionAs('admin'));
    expect((await screen.findByTestId('agreement-line')).props.children).toBe(ASK_OWNER);
    expect(screen.queryByTestId('agreement-accept')).toBeNull();
  });

  it.each([
    ['403, no longer the owner', new PlatformError('Forbidden', 403, 'FORBIDDEN', { requiredRole: 'owner' }), ASK_OWNER],
    [
      '503 agreement_not_published',
      new PlatformError('Service Unavailable', 503, 'NOT_CONFIGURED', { reason: 'agreement_not_published' }),
      NOT_PUBLISHED,
    ],
  ])("a refused acceptance (%s) says the website's line, never the platform's title, stays, and tells the refused screen nothing", async (_case, refusal, line) => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    fake.always(ACCEPT, () => {
      throw refusal;
    });
    let told: boolean | null = null;
    void awaitAgreement(() => undefined).then((accepted) => (told = accepted));
    setMockParams({ workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    await screen.findByTestId('agreement-text');
    await fill();
    await fireEvent.press(screen.getByTestId('agreement-accept'));
    expect(await screen.findByText(line)).toBeTruthy();
    expect(screen.queryByText(refusal.message)).toBeNull();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(told).toBeNull();
  });

  it('a text changed since it was read (409 agreement_changed): the current one is read again and the checkbox asked again', async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    fake.once(ACCEPT, () => {
      throw new PlatformError('Conflict', 409, 'CONFLICT', { reason: 'agreement_changed', version: 2 });
    });
    fake.once(TEXT, AGREEMENT);
    fake.once(TEXT, { ...AGREEMENT, version: 2, sha256: 'b'.repeat(64) });
    setMockParams({ workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    await screen.findByTestId('agreement-text');
    await fill();
    await fireEvent.press(screen.getByTestId('agreement-accept'));
    await waitFor(() => expect(screen.getByTestId('agreement-version').props.children).toBe('Version 2'));
    expect(fake.to(TEXT)).toHaveLength(2);
    expect(within(screen.getByTestId('agreement-authorized')).getByRole('switch').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );
    expect(screen.getByTestId('agreement-accept').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('for a workspace that is no longer the active one: refused in words, nothing sent', async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    setMockParams({ workspace: '00000000-0000-4000-8000-0000000000ff' });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    await screen.findByTestId('agreement-text');
    await fill();
    await fireEvent.press(screen.getByTestId('agreement-accept'));
    expect(await screen.findByText(WORKSPACE_CHANGED)).toBeTruthy();
    expect(fake.to(ACCEPT)).toEqual([]);
  });
});
