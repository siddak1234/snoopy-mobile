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
import { awaitAgreement, settleAgreement } from '@/lib/view/health-agreement';
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
 * refused 403 `agreement_required` at its add and at a run's start until the
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
const AGREEMENT = { version: 1, text: 'This Business Associate Agreement is made between {Covered Entity} and Autom8x.', sha256: 'a'.repeat(64) };

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

function routeSetup(fake: ReturnType<typeof fakePlatform>) {
  let held: Subscription[] = [];
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingV4Entry()], categories: ['All', 'Accounting'] });
  fake.always('GET /v1/connections/providers', providersWithQuickBooks());
  fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/subscriptions', () => ({ subscriptions: held }));
  fake.always(ADD, () => {
    held = [DRAFT];
    return { subscription: DRAFT };
  });
  fake.always('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}', { subscription: { ...DRAFT, status: 'live' } });
}

async function turnOn(role: 'owner' | 'admin' = 'owner') {
  setMockParams({ template: 'invoice-processing' });
  await renderWithProviders(<SetupScreen />, sessionAs(role));
  await fireEvent.press(await screen.findByText('Turn on'));
}

const AGREEMENT_SCREEN = (action: 'add' | 'run') => ({
  pathname: '/(tabs)/flows/agreement',
  params: { action, workspace: TEST_WORKSPACE },
});

describe("Set up's Turn on, refused for the agreement", () => {
  it('an owner: the agreement opens; accepted, the add is sent again with the same key and the flow turned on — nothing read for it before', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake);
    fake.once(ADD, refusedForAgreement(1));
    await turnOn();
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(AGREEMENT_SCREEN('add')));
    expect(fake.to(ADD)).toHaveLength(1);
    expect(fake.to(TEXT)).toEqual([]);
    expect(screen.queryByText(ASK_OWNER)).toBeNull();

    await act(async () => settleAgreement(true));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'ip-1' } }),
    );
    const adds = fake.to(ADD);
    expect(adds).toHaveLength(2);
    expect(adds[1]!.key).toBe(adds[0]!.key);
    expect(adds[1]!.body).toEqual({ templateId: 'invoice-processing' });
    expect(fake.to('PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}')).toHaveLength(1);
  });

  it('an owner who leaves the agreement without accepting: nothing more is sent, no line, and Turn on is offered again', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake);
    fake.once(ADD, refusedForAgreement(1));
    await turnOn();
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(AGREEMENT_SCREEN('add')));
    await act(async () => settleAgreement(false));
    expect(await screen.findByText('Turn on')).toBeTruthy();
    expect(fake.to(ADD)).toHaveLength(1);
    expect(screen.queryByText(ASK_OWNER)).toBeNull();
    expect(screen.queryByText('Could not turn it on. Try again.')).toBeNull();
  });

  it('an admin (only the owner accepts it): the one line, no agreement, and nothing more sent', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake);
    fake.once(ADD, refusedForAgreement(1));
    await turnOn('admin');
    expect(await screen.findByText(ASK_OWNER)).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalledWith(AGREEMENT_SCREEN('add'));
    expect(fake.to(ADD)).toHaveLength(1);
  });

  it('none published (no version): the owner is told it is not available yet, and no screen opens', async () => {
    const fake = fakePlatform(platformOperation);
    routeSetup(fake);
    fake.once(ADD, refusedForAgreement());
    await turnOn();
    expect(await screen.findByText(NOT_PUBLISHED)).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalledWith(AGREEMENT_SCREEN('add'));
  });
});

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
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(AGREEMENT_SCREEN('run')));
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
  function routeAgreement(fake: ReturnType<typeof fakePlatform>) {
    fake.always(TEXT, AGREEMENT);
    fake.always(ACCEPT, {
      document: {
        id: '00000000-0000-4000-8000-0000000000d1',
        kind: 'health-data',
        version: 1,
        signerName: 'Dana Reyes',
        signerTitle: 'Practice manager',
        acceptedAt: '2026-11-04T10:00:00Z',
      },
    });
  }

  async function fill() {
    await fireEvent.press(within(screen.getByTestId('agreement-authorized')).getByRole('switch'));
    await fireEvent.changeText(screen.getByLabelText('Full name'), ' Dana Reyes ');
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Practice manager');
  }

  it('the title, the version, the text, the checkbox and two fields; Accept pressable once all three are given; it accepts the text read, then goes back and the add is sent again', async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    const answered = awaitAgreement(() => undefined);
    setMockParams({ action: 'add', workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));

    expect(await screen.findByText('Health data agreement')).toBeTruthy();
    expect(screen.getByTestId('agreement-version').props.children).toBe('Version 1');
    expect(screen.getByTestId('agreement-text').props.children).toBe(AGREEMENT.text);
    expect(screen.getByText("I'm authorized to sign for Acme Operations")).toBeTruthy();
    const accept = screen.getByTestId('agreement-accept');
    expect(within(accept).getByText('Accept and add flow')).toBeTruthy();
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

  it('on Start run its button says "Accept and start run"', async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    setMockParams({ action: 'run', workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    expect(within(await screen.findByTestId('agreement-accept')).getByText('Accept and start run')).toBeTruthy();
  });

  it('left without accepting: the screen that was refused is told, and nothing was sent', async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    const answered = awaitAgreement(() => undefined);
    setMockParams({ action: 'add', workspace: TEST_WORKSPACE });
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
    setMockParams({ action: 'add', workspace: TEST_WORKSPACE });
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

  it("a refused acceptance says the platform's words, stays, and tells the refused screen nothing", async () => {
    const fake = fakePlatform(platformOperation);
    routeAgreement(fake);
    fake.always(ACCEPT, () => {
      throw new PlatformError('Forbidden', 403, 'FORBIDDEN', { requiredRole: 'owner' });
    });
    let told: boolean | null = null;
    void awaitAgreement(() => undefined).then((accepted) => (told = accepted));
    setMockParams({ action: 'add', workspace: TEST_WORKSPACE });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    await screen.findByTestId('agreement-text');
    await fill();
    await fireEvent.press(screen.getByTestId('agreement-accept'));
    expect(await screen.findByText('Forbidden')).toBeTruthy();
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
    setMockParams({ action: 'add', workspace: TEST_WORKSPACE });
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
    setMockParams({ action: 'add', workspace: '00000000-0000-4000-8000-0000000000ff' });
    await renderWithProviders(<AgreementScreen />, sessionAs('owner'));
    await screen.findByTestId('agreement-text');
    await fill();
    await fireEvent.press(screen.getByTestId('agreement-accept'));
    expect(await screen.findByText(WORKSPACE_CHANGED)).toBeTruthy();
    expect(fake.to(ACCEPT)).toEqual([]);
  });
});
