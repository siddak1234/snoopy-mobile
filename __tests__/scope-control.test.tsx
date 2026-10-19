import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import ArchivedFlowsScreen from '@/app/(tabs)/flows/archived';
import FlowsScreen from '@/app/(tabs)/flows/index';
import { ScopeIcons } from '@/components/scope-control';
import type { Subscription } from '@/lib/platform/automations';
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
 * workspace. Since Build 22 it is Home's two circles beside the title on Flows
 * and Activity too (F1–F3), read aloud as "Workspace: …" and "Department: …";
 * ~~the labelled pills above the title~~.
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
    expect(screen.getByLabelText('Department: All departments')).toBeTruthy();
    expect(screen.getByText(/^Department: Finance · /u)).toBeTruthy();
    expect(screen.getAllByText(/^Whole workspace · /u).length).toBeGreaterThan(0);
  });

  it('narrows Flows to the chosen team, and keeps the choice', async () => {
    await renderWithProviders(<FlowsScreen />, signedInSession);
    await screen.findByText('Invoice triage');
    await fireEvent.press(screen.getByLabelText('Department: All departments'));
    await fireEvent.press(await screen.findByTestId('scope-option-project-1'));
    expect(await screen.findByLabelText('Department: Finance')).toBeTruthy();
    expect(screen.getByText('Invoice triage')).toBeTruthy();
    expect(screen.queryByText('Email triage')).toBeNull();
    // Inside a team each card still says its team: D4 is every card, in every
    // scope (the build 11 review; until then the label was not repeated here).
    expect(screen.getByText(/^Department: Finance · /u)).toBeTruthy();
    expect(writeScope).toHaveBeenCalledWith(expect.any(String), 'project-1');
  });

  it('says the team on every card and every archived row inside a picked team too — D4 has no All-teams exception (the build 11 review)', async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    const rows = subscriptionsPayload().subscriptions.map((row, index) =>
      index === 0 ? { ...row, projectId: 'project-1' } : { ...row, projectId: null },
    );
    const archived = (id: string, name: string, projectId: string | null): Subscription => ({
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
    expect(await flows.findByLabelText('Department: Finance')).toBeTruthy();
    expect(await flows.findByText('Department: Finance · 1,284 runs · 1,272 ok · 12 failed')).toBeTruthy();
    expect(flows.queryByText('Email triage')).toBeNull();
    await flows.unmount();

    // Its archived flows, in the same team: the row says it too.
    const page = await renderWithProviders(<ArchivedFlowsScreen />, signedInSession);
    expect(await page.findByText('Old intake')).toBeTruthy();
    // The team is the scope: the whole workspace's archived row is not listed.
    await waitFor(() => expect(page.queryByText('Older intake')).toBeNull());
    expect(page.getByText(/^Department: Finance · /u)).toBeTruthy();
  });

  it('restores the kept choice for the workspace on the next visit', async () => {
    mockStored.set(TEST_WORKSPACE, 'project-1');
    await renderWithProviders(<FlowsScreen />, signedInSession);
    expect(await screen.findByLabelText('Department: Finance')).toBeTruthy();
    expect(await screen.findByText('Invoice triage')).toBeTruthy();
    expect(screen.queryByText('Email triage')).toBeNull();
  });
});

describe('the team circle (24.11.7; a circle since Build 22)', () => {
  beforeEach(() => {
    mockStored.clear();
    platformOperation.mockReset();
    writeScope.mockClear();
  });

  it.each(['owner', 'admin', 'member'] as const)(
    'is there before any team exists, with All teams and no Create a team for an organization %s (ADR-0036)',
    async (role) => {
      const fake = fakePlatform(platformOperation);
      fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
      fake.always('GET /v1/workspaces', {
        workspaces: [{ id: TEST_WORKSPACE, name: 'Acme', type: 'organization', role }],
        activeWorkspaceId: TEST_WORKSPACE,
      });
      await renderWithProviders(<ScopeIcons testIDPrefix="title-scope" />, sessionAs(role));
      await fireEvent.press(await screen.findByLabelText('Department: All departments'));
      expect(await screen.findByTestId('scope-option-all')).toBeTruthy();
      expect(screen.queryByTestId('scope-create-team')).toBeNull();
      expect(screen.queryByText('Create a team')).toBeNull();
      expect(fake.to('POST /v1/workspaces/{workspaceId}/projects')).toHaveLength(0);
    },
  );

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
    await renderWithProviders(<ScopeIcons testIDPrefix="title-scope" />, sessionAs('member'));
    await fireEvent.press(await screen.findByLabelText('Department: All departments'));
    expect(await screen.findByTestId('scope-option-p-1')).toBeTruthy();
    expect(screen.getAllByText('Finance')).toHaveLength(1);
    expect(screen.queryByText('AP inbox')).toBeNull();
    expect(screen.queryByTestId('scope-create-team')).toBeNull();
  });
});

describe('the scope circles with a long name (24.12; circles since Build 22)', () => {
  beforeEach(() => {
    mockStored.clear();
    platformOperation.mockReset();
  });

  it('read the whole name aloud, and the card it opens names it — no word in the row to cut short', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
    fake.always('GET /v1/workspaces', {
      workspaces: [{ id: TEST_WORKSPACE, name: 'Northwind Traders Operations', type: 'organization', role: 'owner' }],
      activeWorkspaceId: TEST_WORKSPACE,
    });
    if (signedInSession.status !== 'signed-in') throw new Error('fixture');
    const name = 'Northwind Traders Operations';
    const named = {
      ...signedInSession,
      session: { ...signedInSession.session, workspaces: [{ ...signedInSession.session.workspaces[0]!, name }] },
    };
    await renderWithProviders(<ScopeIcons testIDPrefix="title-scope" />, named);
    const workspace = await screen.findByLabelText(`Workspace: ${name}`);
    expect(workspace.props.testID).toBe('title-scope-workspace');
    expect(screen.queryByText(name)).toBeNull();
    await fireEvent.press(workspace);
    expect(await screen.findByText(name)).toBeTruthy();
  });
});
