import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import ArchivedFlowsScreen from '@/app/(tabs)/flows/archived';
import FlowsScreen from '@/app/(tabs)/flows/index';
import { ScopeControl } from '@/components/scope-control';
import { fakePlatform } from '@/test/fake-platform';
import { renderWithProviders } from '@/test/render';
import {
  TEST_WORKSPACE,
  flowCatalogPayload,
  projectsPayload,
  routePlatform,
  sessionAs,
  signedInSession,
  subscriptionsPayload,
} from '@/test/platform';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key-1'),
}));

// The choice is kept on the device; here, in memory for one test.
const mockStored = new Map<string, string | null>();
jest.mock('@/lib/platform/scope-store', () => ({
  readScope: jest.fn(async (workspaceId: string) => mockStored.get(workspaceId) ?? null),
  writeScope: jest.fn(async (workspaceId: string, projectId: string | null) => {
    mockStored.set(workspaceId, projectId);
  }),
}));

const { platformOperation } = jest.requireMock('@/lib/platform/client');
const { readScope, writeScope } = jest.requireMock('@/lib/platform/scope-store');

/**
 * The scope control (BUILD-PLAN 24.9.2; teams since 24.11.7): the workspace,
 * then All teams or one team; Flows follows it, and the choice is kept per
 * workspace.
 */
describe('the scope control on Flows', () => {
  beforeEach(() => {
    mockStored.clear();
    platformOperation.mockReset();
    readScope.mockClear();
    writeScope.mockClear();
    const subscriptions = subscriptionsPayload();
    // The first flow belongs to the project; the rest are workspace-wide.
    subscriptions.subscriptions = subscriptions.subscriptions.map((row, index) =>
      index === 0 ? { ...row, projectId: 'project-1' } : { ...row, projectId: null },
    );
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/subscriptions': subscriptions,
      '/projects': projectsPayload('Finance'),
    });
  });

  it('shows every flow for All teams, labelled by scope', async () => {
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByText('Invoice triage')).toBeTruthy();
    expect(screen.getByLabelText('Team: All teams')).toBeTruthy();
    expect(screen.getByText(/^Team: Finance · /u)).toBeTruthy();
    expect(screen.getAllByText(/^Whole workspace · /u).length).toBeGreaterThan(0);
  });

  it('narrows Flows to the chosen team, and keeps the choice', async () => {
    await renderWithProviders(<FlowsScreen />, signedInSession);
    await screen.findByText('Invoice triage');
    await fireEvent.press(screen.getByLabelText('Team: All teams'));
    await fireEvent.press(await screen.findByTestId('scope-option-project-1'));
    expect(await screen.findByLabelText('Team: Finance')).toBeTruthy();
    expect(screen.getByText('Invoice triage')).toBeTruthy();
    expect(screen.queryByText('Email triage')).toBeNull();
    // Inside a team each card still says its team: D4 is every card, in every
    // scope (the build 11 review; until then the label was not repeated here).
    expect(screen.getByText(/^Team: Finance · /u)).toBeTruthy();
    expect(writeScope).toHaveBeenCalledWith(expect.any(String), 'project-1');
  });

  it('says the team on every card and every archived row inside a picked team too — D4 has no All-teams exception (the build 11 review)', async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    const rows = subscriptionsPayload().subscriptions.map((row, index) =>
      index === 0 ? { ...row, projectId: 'project-1' } : { ...row, projectId: null },
    );
    const archived = (id: string, name: string, projectId: string | null) => ({
      ...rows[0]!,
      id,
      name,
      projectId,
      status: 'archived',
      updatedAt: '2026-09-30T12:00:00Z',
    });
    routePlatform(platformOperation, {
      '/automations': flowCatalogPayload(),
      '/subscriptions': {
        subscriptions: [...rows, archived('gone', 'Old intake', 'project-1'), archived('gone-too', 'Older intake', null)],
      },
      '/projects': projectsPayload('Finance'),
    });

    // Flows, in the team picked: its card says the team.
    const flows = await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await flows.findByLabelText('Team: Finance')).toBeTruthy();
    expect(await flows.findByText('Team: Finance · 1,284 runs · 1,272 ok · 12 failed')).toBeTruthy();
    expect(flows.queryByText('Email triage')).toBeNull();
    await flows.unmount();

    // Its archived flows, in the same team: the row says it too.
    const page = await renderWithProviders(<ArchivedFlowsScreen />, signedInSession);
    expect(await page.findByText('Old intake')).toBeTruthy();
    // The team is the scope: the whole workspace's archived row is not listed.
    await waitFor(() => expect(page.queryByText('Older intake')).toBeNull());
    expect(page.getByText(/^Team: Finance · /u)).toBeTruthy();
  });

  it('restores the kept choice for the workspace on the next visit', async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByLabelText('Team: Finance')).toBeTruthy();
    expect(await screen.findByText('Invoice triage')).toBeTruthy();
    expect(screen.queryByText('Email triage')).toBeNull();
  });
});

describe('the team pill (24.11.7)', () => {
  beforeEach(() => {
    mockStored.clear();
    platformOperation.mockReset();
    writeScope.mockClear();
  });

  it('is there before any team exists, and Create a team makes one and makes it the scope', async () => {
    const fake = fakePlatform(platformOperation);
    let made = false;
    // A team is its kind (24.12): the kind is its name and its type.
    const finance = {
      id: 'p-new',
      workspaceId: TEST_WORKSPACE,
      name: 'Finance',
      type: 'Finance',
      status: 'active',
      viewerRole: 'owner',
      createdAt: '2026-10-02T00:00:00Z',
    };
    fake.always('GET /v1/workspaces/{workspaceId}/projects', () => ({ projects: made ? [finance] : [] }));
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Acme', type: 'organization', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    fake.always('POST /v1/workspaces/{workspaceId}/projects', () => {
      made = true;
      return { project: finance };
    });
    await renderWithProviders(<ScopeControl />, signedInSession);
    await fireEvent.press(await screen.findByLabelText('Team: All teams'));
    await fireEvent.press(await screen.findByTestId('scope-create-team'));
    await fireEvent.press(await screen.findByTestId('team-kind'));
    await fireEvent.press(screen.getByTestId('team-kind-option-Finance'));
    const create = await screen.findAllByText('Create team');
    await fireEvent.press(create[create.length - 1]!);
    await fireEvent.press(await screen.findByText('Done'));
    expect(await screen.findByLabelText('Team: Finance')).toBeTruthy();
    expect(writeScope).toHaveBeenCalledWith(TEST_WORKSPACE, 'p-new');
    expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')[0]!.body).toEqual({ name: 'Finance', type: 'Finance' });
  });

  it('lists a team by its kind, once, and offers a plain member no Create a team (24.12)', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/projects', {
      projects: [
        {
          id: 'p-1',
          workspaceId: TEST_WORKSPACE,
          // Named before 24.12: the kind is still its title.
          name: 'AP inbox',
          type: 'Finance',
          status: 'active',
          viewerRole: 'member',
          createdAt: '2026-10-02T00:00:00Z',
        },
      ],
    });
    await renderWithProviders(<ScopeControl />, sessionAs('member'));
    await fireEvent.press(await screen.findByLabelText('Team: All teams'));
    expect(await screen.findByTestId('scope-option-p-1')).toBeTruthy();
    expect(screen.getAllByText('Finance')).toHaveLength(1);
    expect(screen.queryByText('AP inbox')).toBeNull();
    expect(screen.queryByTestId('scope-create-team')).toBeNull();
  });
});

describe('the scope pills at the bigger type (24.12)', () => {
  beforeEach(() => {
    mockStored.clear();
    platformOperation.mockReset();
  });

  it('keeps a long name whole: the row wraps and a pill may take all of it, so neither is cut short nor runs off the screen', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    if (signedInSession.status !== 'signed-in') throw new Error('fixture');
    const name = 'Northwind Traders Operations';
    const named = {
      ...signedInSession,
      session: { ...signedInSession.session, workspaces: [{ ...signedInSession.session.workspaces[0]!, name }] },
    };
    await renderWithProviders(<ScopeControl />, named);
    const workspacePill = await screen.findByLabelText(`Workspace: ${name}`);
    expect(screen.getByText(name)).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('scope-control').props.style).flexWrap).toBe('wrap');
    for (const pill of [workspacePill, screen.getByLabelText('Team: All teams')]) {
      expect(StyleSheet.flatten(pill.props.style).maxWidth).toBe('100%');
    }
  });
});
