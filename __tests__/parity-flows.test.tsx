import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import SolutionsScreen from '@/app/(tabs)/flows/add';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import SetupScreen from '@/app/(tabs)/flows/setup';
import type { SetupField } from '@/components/setup-field';
import type { Subscription } from '@/lib/platform/automations';
import { PlatformError, PlatformUnreachableError } from '@/lib/platform/problem';
import { catalogPrice, toSolution } from '@/lib/view/catalog';
import { fakePlatform } from '@/test/fake-platform';
import {
  catalogPayload,
  flowCatalogPayload,
  planSubscriptionsPayload,
  projectsPayload,
  routePlatform,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(),
}));
const { platformOperation, newIdempotencyKey } = jest.requireMock('@/lib/platform/client');

/**
 * Gate 24's parity line for the flows — "every signed-in web feature present on
 * mobile, checked against snoopy's page list screen by screen" — G8 to G11 of
 * its audit: each does on the phone what the website's Flows page does, in its
 * words (`snoopy` `app/account/flows`).
 */
beforeEach(() => {
  platformOperation.mockReset();
  let n = 0;
  newIdempotencyKey.mockImplementation((prefix: string) => `${prefix}-${++n}`);
  routePlatform(platformOperation);
});

describe('G8 — a catalog card says its category and its price as the website does — no version (the spec\'s S9)', () => {
  it('says its category — the team it goes to — and "Included" for a flow that costs nothing', async () => {
    const catalog = catalogPayload();
    // Weekly KPI digest, a Data flow: its third version, at no charge.
    catalog.automations = catalog.automations.map((entry, index) =>
      index === 3 ? { ...entry, version: 3, monthlyPriceUsd: 0 } : entry,
    );
    routePlatform(platformOperation, { '/automations': catalog, '/subscriptions': planSubscriptionsPayload() });
    await renderWithProviders(<SolutionsScreen />, signedInSession);
    expect(await screen.findByText('Data · Included')).toBeTruthy();
    expect(screen.getAllByText('Finance · $39/mo').length).toBeGreaterThan(0);
    expect(screen.getByText('Sales · $49/mo')).toBeTruthy();
    expect(screen.queryByText(/ · v\d+ · /u)).toBeNull();
    expect(screen.queryByText(/\$0\/mo/u)).toBeNull();
  });

  it('reads the version from the catalog entry, and words the price the website’s way', () => {
    expect(toSolution({ ...catalogPayload().automations[0]!, version: 4 }, false).version).toBe(4);
    expect(catalogPrice(0)).toBe('Included');
    expect(catalogPrice(9)).toBe('$9/mo');
    expect(catalogPrice(39)).toBe('$39/mo');
  });
});

describe('G9 — the accounts a flow is owed link to Settings › Connections', () => {
  it('a flow page owed an account says to connect it first, and the words open Settings › Connections', async () => {
    setMockParams({ flow: 'lead' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await screen.findByText('Connect HubSpot first.')).toBeTruthy();
    // Said in Step 1 alone: ~~"Required before publishing"~~, and ~~CONNECTIONS' "Not
    // connected" row~~ until Build 22 (the owner's build 21 item 7: "Remove the connections").
    expect(screen.queryByText('Not connected')).toBeNull();
    expect(screen.queryByText('CONNECTIONS')).toBeNull();
    expect(screen.queryByText('Required before publishing')).toBeNull();
    await fireEvent.press(screen.getByText('Connect HubSpot first.'));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/connections');
  });

  it('names every account owed, by the provider’s name', async () => {
    const rows = subscriptionsPayload().subscriptions.map((row) =>
      row.id === 'lead' ? { ...row, unmetConnections: ['hubspot', 'slack'] } : row,
    );
    routePlatform(platformOperation, { '/subscriptions': { subscriptions: rows } });
    setMockParams({ flow: 'lead' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    // Slack has no provider listed here, so it keeps its id, as the row above it does.
    expect(await screen.findByText('Connect HubSpot, slack first.')).toBeTruthy();
  });

  it('a flow owed nothing says nothing of it', async () => {
    setMockParams({ flow: 'invoice' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await screen.findByText('Invoice triage')).toBeTruthy();
    expect(screen.queryByText(/^Connect .* first\./u)).toBeNull();
    expect(screen.queryByTestId('flow-connect')).toBeNull();
  });

  it('an archived flow, which goes live no more, is owed nothing', async () => {
    const base = subscriptionsPayload().subscriptions;
    const gone: Subscription = {
      ...base[0]!,
      id: 'gone',
      name: 'Old intake',
      status: 'archived',
      unmetConnections: ['hubspot'],
      updatedAt: '2026-09-30T12:00:00Z',
    };
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/subscriptions': { subscriptions: [...base.filter((row) => row.id !== 'invoice'), gone] },
    });
    setMockParams({ flow: 'gone' });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await screen.findByText('Old intake')).toBeTruthy();
    expect(screen.queryByText(/^Connect .* first\./u)).toBeNull();
  });
});

describe('G10 — Turn on reads the workspace’s flows again before it adds one (the owner’s build 12 item 9)', () => {
  const SUBSCRIPTIONS = 'GET /v1/workspaces/{workspaceId}/subscriptions';
  const CREATE = 'POST /v1/workspaces/{workspaceId}/subscriptions';
  const SAVE = 'PATCH /v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}';

  /** Setup for tpl.0 with nothing to fill in, and the flows it first reads: none. No team is chosen (ADR-0036). */
  function routeSetupReads() {
    const fake = fakePlatform(platformOperation);
    const catalog = catalogPayload();
    catalog.automations = catalog.automations.map((entry) => ({ ...entry, setup: [] }));
    fake.always('GET /v1/workspaces/{workspaceId}/automations', catalog);
    fake.always('GET /v1/connections/providers', { providers: [] });
    fake.always('GET /v1/workspaces/{workspaceId}/projects', projectsPayload('Finance', 'Sales'));
    fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [] });
    fake.once(SUBSCRIPTIONS, { subscriptions: [] });
    const made = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'made-here', status: 'draft' as const };
    fake.always(CREATE, { subscription: { ...made, projectId: 'project-1' } });
    fake.always(SAVE, { subscription: { ...made, projectId: 'project-1', status: 'live' } });
    return fake;
  }

  async function activateInFinance() {
    setMockParams({ template: 'tpl.0' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    await fireEvent.press(await screen.findByText('Turn on'));
  }

  it('refuses a copy added since Setup read the flows — in another team — in the website’s words, and sends nothing', async () => {
    const fake = routeSetupReads();
    // Added to Sales by someone else, after this screen read the flows and within the snapshot's 15 s.
    const elsewhere: Subscription = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'added-elsewhere', projectId: 'project-2', status: 'draft' };
    fake.always(SUBSCRIPTIONS, { subscriptions: [elsewhere] });
    await activateInFinance();

    expect(await screen.findByText('This flow is already in this workspace.')).toBeTruthy();
    // Read afresh at the press, not answered from the snapshot.
    expect(fake.to(SUBSCRIPTIONS)).toHaveLength(2);
    expect(fake.to(CREATE)).toHaveLength(0);
    expect(fake.to(SAVE)).toHaveLength(0);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('with nothing added since, the fresh read finds none and Turn on adds it — no team sent', async () => {
    const fake = routeSetupReads();
    fake.always(SUBSCRIPTIONS, { subscriptions: [] });
    await activateInFinance();

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'made-here' } }),
    );
    expect(fake.to(SUBSCRIPTIONS)).toHaveLength(2);
    // No version is sent: a new flow runs the newest (Build 22, P4; backend ADR-0041).
    expect(fake.to(CREATE).map((sent) => sent.body)).toEqual([{ templateId: 'tpl.0' }]);
    expect(fake.to(SAVE)).toHaveLength(1);
    expect(screen.queryByText('This flow is already in this workspace.')).toBeNull();
  });

  it('an add whose answer was lost: Try again replays it with the same key — never "already in this workspace" for its own copy — then turns it on', async () => {
    const fake = routeSetupReads();
    fake.always(SUBSCRIPTIONS, { subscriptions: [] });
    const made: Subscription = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'made-here', status: 'draft', projectId: 'project-1' };
    // The add commits, and its answer never arrives: the next read lists the flow.
    fake.once(CREATE, () => {
      fake.always(SUBSCRIPTIONS, { subscriptions: [made] });
      throw new PlatformUnreachableError();
    });
    await activateInFinance();
    expect(await screen.findByText('Could not add this flow. Try again.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'made-here' } }),
    );
    const adds = fake.to(CREATE);
    expect(adds).toHaveLength(2);
    expect(adds[1]!.key).toBe(adds[0]!.key);
    expect(fake.to(SAVE)).toHaveLength(1);
    expect(screen.queryByText('This flow is already in this workspace.')).toBeNull();
  });

  it('an add the platform refused in words is not replayed: the next press reads the flows afresh again', async () => {
    const fake = routeSetupReads();
    fake.always(SUBSCRIPTIONS, { subscriptions: [] });
    fake.once(CREATE, () => {
      throw new PlatformError('Not found', 404);
    });
    await activateInFinance();
    expect(await screen.findByText('Could not add this flow. Try again.')).toBeTruthy();
    const elsewhere: Subscription = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'added-elsewhere', projectId: 'project-2', status: 'draft' };
    fake.always(SUBSCRIPTIONS, { subscriptions: [elsewhere] });
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('This flow is already in this workspace.')).toBeTruthy();
    expect(fake.to(CREATE)).toHaveLength(1);
  });

  it('an archived copy holds nothing: the flow is added again', async () => {
    const fake = routeSetupReads();
    const archived: Subscription = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'archived-0', projectId: 'project-2', status: 'archived' };
    fake.always(SUBSCRIPTIONS, { subscriptions: [archived] });
    await activateInFinance();

    await waitFor(() => expect(fake.to(CREATE)).toHaveLength(1));
    expect(screen.queryByText('This flow is already in this workspace.')).toBeNull();
  });
});

describe('G11 — setup draws the manifest’s sections in its order, and says what a notification toggle controls', () => {
  const RULES: SetupField = { section: 'rules', key: 'hold', title: 'Hold above', description: 'Threshold', control: 'money', required: false, defaultValue: 500 };
  const SOURCE: SetupField = { section: 'source', key: 'inbox', title: 'Watch inbox', description: 'Where invoices land', control: 'text', required: true };
  const ALERTS: SetupField = {
    section: 'notifications',
    key: 'failures',
    title: 'Failure alerts',
    description: 'Email me',
    control: 'toggle',
    required: false,
    notifies: 'run-failed',
  };
  /** The section headings on screen, top to bottom. */
  const headings = () => screen.getAllByText(/^\d+ · /u).map((label) => label.props.children as string);

  it('Setup: rules before source, as the manifest declares them, and the toggle’s notification in words', async () => {
    const catalog = catalogPayload();
    catalog.automations = catalog.automations.map((entry) => ({ ...entry, setup: [RULES, SOURCE, ALERTS] }));
    routePlatform(platformOperation, { '/automations': catalog });
    setMockParams({ template: 'tpl.5' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByText('Failure alerts')).toBeTruthy();
    expect(headings()).toEqual(['1 · SETTINGS', '2 · SOURCE', '3 · EMAIL']);
    expect(screen.getByText('Controls the notification sent when a run fails.')).toBeTruthy();
  });

  it('Set up from the flow page’s Edit setup: the same order and the same line, from the version the flow runs', async () => {
    const rows = subscriptionsPayload().subscriptions.map((row) =>
      row.id === 'invoice' ? { ...row, setup: [ALERTS, SOURCE, RULES] } : row,
    );
    routePlatform(platformOperation, { '/automations': flowCatalogPayload(), '/subscriptions': { subscriptions: rows } });
    setMockParams({ template: 'tplflow.invoice', flow: 'invoice' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    expect(await screen.findByText('Failure alerts')).toBeTruthy();
    expect(headings()).toEqual(['1 · EMAIL', '2 · SOURCE', '3 · SETTINGS']);
    expect(screen.getByText('Controls the notification sent when a run fails.')).toBeTruthy();
  });
});
