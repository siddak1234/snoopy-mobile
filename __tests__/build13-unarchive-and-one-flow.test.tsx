import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import SolutionsScreen from '@/app/(tabs)/flows/add';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import SetupScreen from '@/app/(tabs)/flows/setup';
import SettingsScreen from '@/app/(tabs)/settings';
import type { Subscription } from '@/lib/platform/automations';
import { PlatformError } from '@/lib/platform/problem';
import {
  TEST_WORKSPACE,
  catalogPayload,
  flowCatalogPayload,
  planSubscriptionsPayload,
  projectsPayload,
  routePlatform,
  sessionAs,
  signedInSession,
  subscriptionsPayload,
  type RouteOverrides,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'test-intent'),
}));

// The team the scope control shows is kept on the device; here, in memory.
const mockStored = new Map<string, string | null>();
jest.mock('@/lib/platform/scope-store', () => ({
  readScope: jest.fn(async (workspaceId: string) => mockStored.get(workspaceId) ?? null),
  writeScope: jest.fn(async (workspaceId: string, projectId: string | null) => {
    mockStored.set(workspaceId, projectId);
  }),
}));

const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Build 13, part 2 — the owner's decisions of 2026-10-03 on build 12's items 4
 * and 9, with no platform change in this build:
 *
 * - item 4, "Rather than add it again what if we say unarchive": a rename. The
 *   archived flow's "Add it again" is "Unarchive" and does what it did — Setup
 *   for that flow, a fresh setup — and every line that said "add it again"
 *   says "unarchive".
 * - item 9, "Teams cannot have the same flows. One flow per account type": a
 *   workspace holds a flow once, in any team or the whole workspace, enforced
 *   by the app; the platform's own guard comes later.
 */
beforeEach(() => {
  mockStored.clear();
  platformOperation.mockReset();
  routePlatform(platformOperation);
});

describe("Unarchive — the word for Add it again (the owner's build 12 item 4)", () => {
  it('an archived flow with no live copy says it can be unarchived, and Unarchive opens Setup for that flow in the team it had — a fresh setup; the page sends nothing', async () => {
    setMockParams({ flow: 'gone' });
    const base = subscriptionsPayload().subscriptions;
    // Nothing else in the workspace holds its flow.
    const rows = base.filter((row) => row.id !== 'invoice');
    const gone: Subscription = {
      ...base[0]!,
      id: 'gone',
      name: 'Old intake',
      projectId: 'project-1',
      status: 'archived',
      updatedAt: '2026-09-30T12:00:00Z',
    };
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/projects': projectsPayload('Finance'),
      '/subscriptions': { subscriptions: [...rows, gone], subscription: rows[0] },
    });
    await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
    expect(await screen.findByText('Old intake')).toBeTruthy();
    expect(
      screen.getByText(
        'This flow was archived on Sep 30, 2026. Its runs stay in Activity, and you can unarchive it — its setup starts fresh.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Add it again')).toBeNull();
    expect(screen.queryByText('Open the live flow')).toBeNull();
    await fireEvent.press(screen.getByText('Unarchive'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/setup',
      params: { template: 'tplflow.invoice', project: 'project-1' },
    });
    // The archived row itself is never written: the platform's archive is one-way.
    const paths: string[] = platformOperation.mock.calls.map(([path]: [string]) => path);
    expect(paths.some((path) => path.endsWith('/subscriptions/gone'))).toBe(false);
  });

  it('Settings › Archived flows says they are kept with their history and any can be unarchived', async () => {
    await renderWithProviders(<SettingsScreen />, signedInSession);
    expect(await screen.findByText('Kept with their history; unarchive any')).toBeTruthy();
    expect(screen.queryByText(/add any again/u)).toBeNull();
  });
});

/** The catalog with nothing to fill in, one subscription, and every write Setup sends, kept. */
function routeSetup(held: Subscription, projects: RouteOverrides['/projects']) {
  const catalog = catalogPayload();
  catalog.automations = catalog.automations.map((automation) => ({ ...automation, setup: [] }));
  routePlatform(platformOperation, {
    '/automations': catalog,
    '/projects': projects,
    '/subscriptions': { subscriptions: [held], subscription: held },
  });
  const writes: { method: string; path: string; body: unknown }[] = [];
  const routed = platformOperation.getMockImplementation();
  platformOperation.mockImplementation(async (path: string, execute: Function) => {
    if (/\/subscriptions(\/[^/?]+)?$/u.test(path)) {
      const keep = (method: string) => async (_route: string, init: { body?: unknown }) => {
        if (method !== 'GET') writes.push({ method, path, body: init.body });
        return { data: {} };
      };
      try {
        await execute({ automations: { GET: keep('GET'), POST: keep('POST'), PATCH: keep('PATCH') } });
      } catch {
        // The routed answer below is what the screen reads.
      }
    }
    return routed?.(path, execute);
  });
  return writes;
}

describe("One flow per workspace (the owner's build 12 item 9)", () => {
  it('Add reads a flow held for the whole workspace as Added ✓ · Whole workspace inside a picked team too — whatever the scope control shows — with no Add, and the card opens it', async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    const whole = { ...planSubscriptionsPayload().subscriptions[0]!, projectId: null };
    routePlatform(platformOperation, {
      '/subscriptions': { subscriptions: [whole] },
      '/projects': projectsPayload('Finance'),
    });
    await renderWithProviders(<SolutionsScreen />, signedInSession);
    expect(await screen.findByText('Prebuilt flows, set up in minutes. Adding to Finance.')).toBeTruthy();
    expect(screen.getByTestId('added-where-tpl.0').props.children).toBe('Whole workspace');
    expect(screen.getByTestId('added-tpl.0')).toBeTruthy();
    expect(screen.queryByTestId('add-tpl.0')).toBeNull();
    // A flow the workspace does not hold is still added, to the team chosen.
    await fireEvent.press(screen.getByTestId('add-tpl.1'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/flows/setup',
      params: { template: 'tpl.1', project: 'project-1' },
    });
    await fireEvent.press(screen.getByTestId('added-tpl.0'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'solution-0' } });
  });

  it('Add names both places of a flow added to two before the rule — the duplicate stays — and offers no Add', async () => {
    const [first] = planSubscriptionsPayload().subscriptions;
    routePlatform(platformOperation, {
      '/subscriptions': {
        subscriptions: [
          { ...first!, id: 'copy-team', projectId: 'project-1' },
          { ...first!, id: 'copy-whole', projectId: null },
        ],
      },
      '/projects': projectsPayload('Finance'),
    });
    await renderWithProviders(<SolutionsScreen />, signedInSession);
    expect((await screen.findByTestId('added-where-tpl.0')).props.children).toBe('Team: Finance, Whole workspace');
    expect(screen.queryByTestId('add-tpl.0')).toBeNull();
    await fireEvent.press(screen.getByTestId('added-tpl.0'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'copy-team' } });
  });

  it('Setup, for a flow the workspace holds, says where it is under Added to, offers no team, and Activate configures that subscription — nothing is added', async () => {
    const held: Subscription = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'held-0', projectId: 'project-1', status: 'paused' };
    const writes = routeSetup(held, projectsPayload('Finance', 'Sales'));
    // Reached with another team chosen: it is still the one copy, where it is.
    setMockParams({ template: 'tpl.0', project: 'project-2' });
    await renderWithProviders(<SetupScreen />, signedInSession);
    const where = await screen.findByTestId('setup-held');
    expect(within(where).getByText('Added to')).toBeTruthy();
    expect(within(where).getByText('Team: Finance')).toBeTruthy();
    expect(screen.queryByText('Add to')).toBeNull();
    expect(screen.queryByText('Team: Sales')).toBeNull();
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'held-0' } }),
    );
    expect(writes).toEqual([
      {
        method: 'PATCH',
        path: `/v1/workspaces/${TEST_WORKSPACE}/subscriptions/held-0`,
        body: { config: {}, status: 'live' },
      },
    ]);
  });

  it('Setup, for a flow held for the whole workspace, needs no team: a plain member with none to add to still has Activate, and it configures that subscription', async () => {
    const held: Subscription = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'held-whole', projectId: null, status: 'paused' };
    const writes = routeSetup(held, { projects: [] });
    setMockParams({ template: 'tpl.0' });
    await renderWithProviders(<SetupScreen />, sessionAs('member'));
    expect(within(await screen.findByTestId('setup-held')).getByText('Whole workspace')).toBeTruthy();
    expect(screen.queryByText('An owner or admin creates the first team.')).toBeNull();
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: 'PATCH',
      path: `/v1/workspaces/${TEST_WORKSPACE}/subscriptions/held-whole`,
      body: { config: {}, status: 'live' },
    });
    expect(screen.queryByText('Pick a team.')).toBeNull();
  });
});

/**
 * Nothing held yet: Setup's create answers `created`, in the team it was sent
 * for, and its activation answers `activation()`. Every write is kept.
 */
function routeCreate(created: Record<string, unknown>, activation: () => unknown) {
  const catalog = catalogPayload();
  catalog.automations = catalog.automations.map((automation) => ({ ...automation, setup: [] }));
  routePlatform(platformOperation, { '/automations': catalog, '/projects': projectsPayload('Finance', 'Sales') });
  const routed = platformOperation.getMockImplementation();
  const writes: { method: string; path: string; body: { projectId?: string } }[] = [];
  platformOperation.mockImplementation(async (path: string, execute: Function) => {
    if (!/\/subscriptions(\/[^/?]+)?$/u.test(path)) return routed?.(path, execute);
    let method = 'GET';
    let body: { projectId?: string } = {};
    const keep = (verb: string) => async (_route: string, init: { body?: { projectId?: string } }) => {
      method = verb;
      body = init.body ?? {};
      return { data: {} };
    };
    try {
      await execute({ automations: { GET: keep('GET'), POST: keep('POST'), PATCH: keep('PATCH') } });
    } catch {
      // Only the method and the body are wanted; the answers are below.
    }
    if (method === 'GET') return { subscriptions: [] };
    writes.push({ method, path, body });
    if (method === 'POST') return { subscription: { ...created, projectId: body.projectId } };
    return activation();
  });
  return writes;
}

/**
 * The build 13 review's second finding — a hole in item 9: once Setup had added
 * the flow, it still drew the "Add to" chips, and another team reset what it
 * had added, so Activate sent a second create — two copies in one workspace.
 * What Setup adds is held from that moment, as the copy a workspace held is.
 */
describe("One flow per workspace: what Setup adds is held at once (the build 13 review; the owner's build 12 item 9)", () => {
  it('a create still owed an account says where it is under Added to, with no team to pick again — no second copy can be sent', async () => {
    const created = {
      ...planSubscriptionsPayload().subscriptions[0]!,
      id: 'added-0',
      status: 'draft',
      unmetConnections: ['hubspot'],
    };
    const writes = routeCreate(created, () => {
      throw new Error('a draft owed an account is not activated');
    });
    setMockParams({ template: 'tpl.0' });
    await renderWithProviders(<SetupScreen />, signedInSession);

    await fireEvent.press(await screen.findByTestId('setup-team'));
    await fireEvent.press(screen.getByText('Team: Finance'));
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ method: 'POST', body: { templateId: 'tpl.0', projectId: 'project-1' } });
    expect(
      await screen.findByText('Connect the required providers in Settings › Connections, then return to activate.'),
    ).toBeTruthy();

    const where = screen.getByTestId('setup-held');
    expect(within(where).getByText('Added to')).toBeTruthy();
    expect(within(where).getByText('Team: Finance')).toBeTruthy();
    expect(screen.queryByText('Add to')).toBeNull();
    expect(screen.queryByText('Team: Sales')).toBeNull();

    // Its one way on is the account it is owed; Try again is the same. Nothing is added again.
    await fireEvent.press(screen.getByText('Connect HubSpot in Settings › Connections'));
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/connections');
    expect(writes).toHaveLength(1);
  });

  it('a create whose activation failed stays Added to its team, and Activate again activates that copy — never a second', async () => {
    const created = { ...planSubscriptionsPayload().subscriptions[0]!, id: 'added-0', status: 'draft', unmetConnections: [] };
    let activations = 0;
    const writes = routeCreate(created, () => {
      activations += 1;
      if (activations === 1) throw new PlatformError('The platform is unreachable', 502);
      return { subscription: { ...created, projectId: 'project-1', status: 'live' } };
    });
    setMockParams({ template: 'tpl.0' });
    await renderWithProviders(<SetupScreen />, signedInSession);

    await fireEvent.press(await screen.findByTestId('setup-team'));
    await fireEvent.press(screen.getByText('Team: Finance'));
    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() => expect(writes.map((write) => write.method)).toEqual(['POST', 'PATCH']));
    expect(await screen.findByTestId('action-failure')).toBeTruthy();
    expect(within(screen.getByTestId('setup-held')).getByText('Team: Finance')).toBeTruthy();
    expect(screen.queryByText('Team: Sales')).toBeNull();

    await fireEvent.press(screen.getByText('Activate solution'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/(tabs)/flows/detail', params: { flow: 'added-0' } }),
    );
    expect(writes.map((write) => [write.method, write.path])).toEqual([
      ['POST', `/v1/workspaces/${TEST_WORKSPACE}/subscriptions`],
      ['PATCH', `/v1/workspaces/${TEST_WORKSPACE}/subscriptions/added-0`],
      ['PATCH', `/v1/workspaces/${TEST_WORKSPACE}/subscriptions/added-0`],
    ]);
  });
});
